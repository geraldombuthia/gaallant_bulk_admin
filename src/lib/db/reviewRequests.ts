import { query, one, exec } from "./pool";
import type { RowDataPacket } from "mysql2/promise";
import { audit } from "../audit";

export type RRTarget = "template" | "message" | "user";
export interface ReviewRequest extends RowDataPacket {
    id: number; targetType: RRTarget; targetId: number; requested_by: string; reason: string;
    confidence: string | null; status: "open" | "resolved" | "dismissed";
    resolved_by: number | null; resolution: string | null; resolved_at: Date | null; created_at: Date;
    resolver_name?: string | null; target_label?: string | null; owner_id?: number | null;
}

/**
 * An automated reviewer saying "a person should look at this". Opening one
 * is idempotent per target: a second request on an open item appends to
 * the reason rather than creating a duplicate, so a bot that runs hourly
 * does not flood the queue.
 */
export async function requestReview(t: { targetType: RRTarget; targetId: number; requested_by: string; reason: string; confidence?: number | null }) {
    const reason = t.reason.trim();
    if (reason.length < 10) throw new Error("Say why a human should look -- at least a sentence.");
    const existing = await one<ReviewRequest>("SELECT * FROM review_requests WHERE targetType = ? AND targetId = ? AND status = 'open' LIMIT 1", [t.targetType, t.targetId]);
    if (existing) {
        await exec("UPDATE review_requests SET reason = CONCAT(reason, '\n\n', ?), requested_by = ?, confidence = ? WHERE id = ?",
            [`[${new Date().toISOString().slice(0, 16)} ${t.requested_by}] ${reason}`, t.requested_by, t.confidence ?? null, existing.id]);
        return { id: existing.id, created: false };
    }
    const r = await exec("INSERT INTO review_requests (targetType, targetId, requested_by, reason, confidence) VALUES (?, ?, ?, ?, ?)",
        [t.targetType, t.targetId, t.requested_by, reason, t.confidence ?? null]);
    return { id: r.insertId, created: true };
}

export async function resolveReview(id: number, status: "resolved" | "dismissed", resolution: string, admin: { id: number }, ip: string | null) {
    const rr = await one<ReviewRequest>("SELECT * FROM review_requests WHERE id = ?", [id]);
    if (!rr) throw new Error("Not found");
    await exec("UPDATE review_requests SET status = ?, resolved_by = ?, resolution = ?, resolved_at = NOW() WHERE id = ?", [status, admin.id, resolution.trim() || null, id]);
    await audit({ adminId: admin.id, action: `review_request.${status}`, targetType: rr.targetType, targetId: rr.targetId, reason: resolution.trim() || null, before: { requestId: id, requested_by: rr.requested_by }, ip });
}

/** Resolve any open request on a target -- called when a human decides on it */
export async function resolveForTarget(targetType: RRTarget, targetId: number, resolution: string, adminId: number) {
    await exec("UPDATE review_requests SET status = 'resolved', resolved_by = ?, resolution = ?, resolved_at = NOW() WHERE targetType = ? AND targetId = ? AND status = 'open'",
        [adminId, resolution, targetType, targetId]);
}

export async function openFor(targetType: RRTarget, targetId: number) {
    return one<ReviewRequest>("SELECT * FROM review_requests WHERE targetType = ? AND targetId = ? AND status = 'open' ORDER BY id DESC LIMIT 1", [targetType, targetId]);
}

export async function openCount() {
    const r = await one<RowDataPacket & { n: number }>("SELECT COUNT(*) AS n FROM review_requests WHERE status = 'open'");
    return Number(r?.n ?? 0);
}

export async function listReviewRequests(f: { status?: "open" | "resolved" | "dismissed" | "all"; type?: RRTarget }, limit: number, offset: number) {
    const where: string[] = []; const params: (string | number)[] = [];
    if (f.status && f.status !== "all") { where.push("r.status = ?"); params.push(f.status); }
    if (f.type) { where.push("r.targetType = ?"); params.push(f.type); }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await query<ReviewRequest>(
        `SELECT r.*, u.name AS resolver_name,
                CASE r.targetType
                    WHEN 'template' THEN (SELECT template_name FROM Templates t WHERE t.id = r.targetId)
                    WHEN 'message'  THEN (SELECT CONCAT(m.phoneNumber, ': ', LEFT(m.message, 60)) FROM SMSMsg m WHERE m.id = r.targetId)
                    WHEN 'user'     THEN (SELECT CONCAT(x.name, ' <', x.email, '>') FROM users x WHERE x.id = r.targetId)
                END AS target_label,
                CASE r.targetType
                    WHEN 'template' THEN (SELECT userId FROM Templates t WHERE t.id = r.targetId)
                    WHEN 'message'  THEN (SELECT userId FROM SMSMsg m WHERE m.id = r.targetId)
                    WHEN 'user'     THEN r.targetId
                END AS owner_id
         FROM review_requests r LEFT JOIN users u ON u.id = r.resolved_by ${w}
         ORDER BY (r.status = 'open') DESC, r.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params
    );
    const [{ n }] = await query<RowDataPacket & { n: number }>(`SELECT COUNT(*) AS n FROM review_requests r ${w}`, params);
    return { rows, total: Number(n) };
}
