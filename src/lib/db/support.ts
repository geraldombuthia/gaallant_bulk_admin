import { query, one, exec, transaction, type Params, type Runner } from "./pool";
import type { SupportRow, SupportReplyRow } from "./types";
import { audit } from "../audit";

const BASE = `
    SELECT s.*, u.name AS owner_name, u.email AS owner_email,
           (SELECT COUNT(*) FROM support_replies r WHERE r.messageId = s.id) AS reply_count
    FROM support_messages s JOIN users u ON u.id = s.userId`;

export async function listSupport(status: "open" | "answered" | "closed" | "all", q: string | undefined, limit: number, offset: number) {
    const where: string[] = [];
    const params: Params = [];
    if (status !== "all") { where.push("s.status = ?"); params.push(status); }
    if (q) { const like = `%${q}%`; where.push("(s.subject LIKE ? OR s.body LIKE ? OR u.email LIKE ? OR u.name LIKE ?)"); params.push(like, like, like, like); }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await query<SupportRow>(
        `${BASE} ${w} ORDER BY (s.priority = 'high') DESC, (s.status = 'open') DESC, s.updated_at DESC LIMIT ${limit} OFFSET ${offset}`, params
    );
    const [{ n }] = await query<SupportRow & { n: number }>(`SELECT COUNT(*) AS n FROM support_messages s JOIN users u ON u.id = s.userId ${w}`, params);
    return { rows, total: Number(n) };
}

export async function supportCounts() {
    const rows = await query<SupportRow & { status: string; n: number }>("SELECT status, COUNT(*) AS n FROM support_messages GROUP BY status");
    const out = { open: 0, answered: 0, closed: 0 };
    rows.forEach((r) => { (out as Record<string, number>)[r.status] = Number(r.n); });
    return out;
}

export async function getSupport(id: number) {
    const message = await one<SupportRow>(`${BASE} WHERE s.id = ?`, [id]);
    if (!message) return null;
    const replies = await query<SupportReplyRow>(
        `SELECT r.*, u.name AS author_name FROM support_replies r JOIN users u ON u.id = r.authorId WHERE r.messageId = ? ORDER BY r.created_at ASC`, [id]
    );
    return { message, replies };
}

export async function reply(id: number, body: string, admin: { id: number; name: string }, ip: string | null) {
    const b = body.trim();
    if (b.length < 2) throw new Error("Reply is empty");
    return transaction(async (conn) => {
        const [rows] = await conn.execute<SupportRow[]>("SELECT * FROM support_messages WHERE id = ? FOR UPDATE", [id]);
        const s = rows[0];
        if (!s) throw new Error("Not found");
        await conn.execute("INSERT INTO support_replies (messageId, authorId, authorRole, body, created_at) VALUES (?, ?, 'admin', ?, NOW())", [id, admin.id, b]);
        await conn.execute("UPDATE support_messages SET status = 'answered', updated_at = NOW() WHERE id = ?", [id]);
        const run: Runner = async (sql, params = []) => { const [r] = await conn.execute<import("mysql2/promise").ResultSetHeader>(sql, params); return r; };
        await audit({ adminId: admin.id, action: "support.reply", targetType: "support", targetId: id, before: { status: s.status }, after: { status: "answered" }, ip }, run);
        await run(
            `INSERT INTO notifications (userId, title, message, type, severity, isRead, metadata, created_at, last_modified)
             VALUES (?, ?, ?, 'system', 'info', 0, ?, NOW(), NOW())`,
            [s.userId, `Reply to "${s.subject}"`, `${b}\n\n-- ${admin.name}, Gallant support`, JSON.stringify({ supportId: id })]
        );
    });
}

export async function setSupportStatus(id: number, status: "open" | "closed", admin: { id: number }, ip: string | null) {
    const s = await one<SupportRow>("SELECT id, status FROM support_messages WHERE id = ?", [id]);
    if (!s) throw new Error("Not found");
    await exec("UPDATE support_messages SET status = ?, updated_at = NOW() WHERE id = ?", [status, id]);
    await audit({ adminId: admin.id, action: `support.${status === "closed" ? "close" : "reopen"}`, targetType: "support", targetId: id, before: { status: s.status }, after: { status }, ip });
}

export async function setPriority(id: number, priority: "normal" | "high", admin: { id: number }, ip: string | null) {
    await exec("UPDATE support_messages SET priority = ?, updated_at = NOW() WHERE id = ?", [priority, id]);
    await audit({ adminId: admin.id, action: "support.priority", targetType: "support", targetId: id, after: { priority }, ip });
}
