import { query, one, exec, transaction, type Params, type Runner } from "./pool";
import type { TemplateRow, TemplateStatus } from "./types";
import { audit } from "../audit";
import { notifyUser } from "../notify";

const BASE = `
    SELECT t.*, u.name AS owner_name, u.email AS owner_email, r.name AS reviewer_name
    FROM Templates t
    JOIN users u ON u.id = t.userId
    LEFT JOIN users r ON r.id = t.reviewed_by`;

export interface TemplateFilters {
    status?: TemplateStatus | "all";
    q?: string;
    type?: "global" | "private";
}

export async function listTemplates(f: TemplateFilters, limit: number, offset: number) {
    const where: string[] = [];
    const params: Params = [];
    if (f.status && f.status !== "all") { where.push("t.status = ?"); params.push(f.status); }
    if (f.type) { where.push("t.type = ?"); params.push(f.type); }
    if (f.q) {
        where.push("(t.template_name LIKE ? OR t.slug LIKE ? OR t.msg_content LIKE ? OR u.email LIKE ? OR u.name LIKE ?)");
        const like = `%${f.q}%`;
        params.push(like, like, like, like, like);
    }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    // Pending first, then oldest first within pending: the queue is FIFO
    const rows = await query<TemplateRow>(
        `${BASE} ${w}
         ORDER BY (t.status = 'pending') DESC, t.createdAt ${f.status === "pending" ? "ASC" : "DESC"}
         LIMIT ${limit} OFFSET ${offset}`,
        params
    );
    const [{ n }] = await query<TemplateRow & { n: number }>(
        `SELECT COUNT(*) AS n FROM Templates t JOIN users u ON u.id = t.userId ${w}`, params
    );
    return { rows: rows.map(normalise), total: Number(n) };
}

export async function countByStatus(): Promise<Record<TemplateStatus, number>> {
    const rows = await query<TemplateRow & { status: TemplateStatus; n: number }>(
        "SELECT status, COUNT(*) AS n FROM Templates GROUP BY status"
    );
    const out: Record<TemplateStatus, number> = { pending: 0, approved: 0, rejected: 0, changes_requested: 0 };
    rows.forEach((r) => { out[r.status] = Number(r.n); });
    return out;
}

export async function getTemplate(id: number): Promise<TemplateRow | null> {
    const row = await one<TemplateRow>(`${BASE} WHERE t.id = ? LIMIT 1`, [id]);
    return row ? normalise(row) : null;
}

/** Other templates by the same owner, for context on a review */
export async function ownerTemplates(userId: number, exceptId: number) {
    return query<TemplateRow>(
        `SELECT id, template_name, slug, status, createdAt FROM Templates WHERE userId = ? AND id <> ? ORDER BY createdAt DESC LIMIT 10`,
        [userId, exceptId]
    );
}

/** Review history from the audit log */
export async function reviewHistory(templateId: number) {
    return query<import("./types").AuditRow>(
        `SELECT a.*, u.name AS admin_name FROM admin_audit_log a JOIN users u ON u.id = a.adminId
         WHERE a.targetType = 'template' AND a.targetId = ? ORDER BY a.created_at DESC`,
        [templateId]
    );
}

export type Decision = "approve" | "reject" | "changes";

/**
 * Records a review decision, notifies the owner, and audits it -- all in one
 * transaction so a decision cannot land without its notification or audit.
 */
export async function decide(
    templateId: number,
    decision: Decision,
    note: string,
    admin: { id: number; name: string },
    ip: string | null
) {
    const status: TemplateStatus = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";
    if (decision !== "approve" && note.trim().length < 10) {
        throw new Error("Tell the user what to change -- at least a sentence.");
    }

    return transaction(async (conn) => {
        const [rows] = await conn.execute<TemplateRow[]>("SELECT * FROM Templates WHERE id = ? FOR UPDATE", [templateId]);
        const t = rows[0];
        if (!t) throw new Error("Template not found");
        if (t.status === "approved" && decision === "approve") throw new Error("Already approved");

        await conn.execute(
            `UPDATE Templates SET status = ?, reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ?, updatedAt = NOW() WHERE id = ?`,
            [status, admin.id, decision === "approve" ? null : note.trim(), templateId]
        );

        const run: Runner = async (sql, params = []) => { const [r] = await conn.execute<import("mysql2/promise").ResultSetHeader>(sql, params); return r; };

        await audit({
            adminId: admin.id, action: `template.${decision}`, targetType: "template", targetId: templateId,
            reason: decision === "approve" ? null : note.trim(),
            before: { status: t.status, rejection_reason: t.rejection_reason },
            after: { status, rejection_reason: decision === "approve" ? null : note.trim() },
            ip,
        }, run);

        const titles: Record<Decision, string> = {
            approve: `Template "${t.template_name}" approved`,
            reject: `Template "${t.template_name}" was not approved`,
            changes: `Template "${t.template_name}" needs changes`,
        };
        const messages: Record<Decision, string> = {
            approve: `Your template "${t.template_name}" (${t.slug}) has been approved and can be sent through the API.`,
            reject: `Your template "${t.template_name}" (${t.slug}) was not approved.\n\nReviewer: ${note.trim()}`,
            changes: `Your template "${t.template_name}" (${t.slug}) needs a change before it can be approved.\n\n${note.trim()}\n\nEdit the template on your dashboard; it returns to review automatically when you save.`,
        };
        await run(
            `INSERT INTO notifications (userId, title, message, type, severity, isRead, metadata, created_at, last_modified)
             VALUES (?, ?, ?, 'message', ?, 0, ?, NOW(), NOW())`,
            [t.userId, titles[decision], messages[decision], decision === "approve" ? "success" : "warning",
             JSON.stringify({ templateId, slug: t.slug, decision })]
        );
        return { status, owner: t.userId };
    });
}

/** Toggle a template's active flag without changing its review status */
export async function setActive(templateId: number, active: boolean, admin: { id: number }, ip: string | null) {
    const t = await one<TemplateRow>("SELECT id, active FROM Templates WHERE id = ?", [templateId]);
    if (!t) throw new Error("Template not found");
    await exec("UPDATE Templates SET active = ?, updatedAt = NOW() WHERE id = ?", [active ? 1 : 0, templateId]);
    await audit({ adminId: admin.id, action: active ? "template.activate" : "template.deactivate", targetType: "template", targetId: templateId, before: { active: t.active }, after: { active: active ? 1 : 0 }, ip });
}

function normalise(row: TemplateRow): TemplateRow {
    if (typeof row.variables === "string") {
        try { row.variables = JSON.parse(row.variables); } catch { row.variables = []; }
    }
    return row;
}

// re-exported for the notify helper's callers that need it outside a transaction
export { notifyUser };
