import { query, one, exec } from "./pool";
import type { RowDataPacket } from "mysql2/promise";
import { audit } from "../audit";
import { notifyUser } from "../notify";

export type Verdict = "clean" | "marketing" | "unsure";
export interface VerdictRow extends RowDataPacket {
    id: number; targetType: "message" | "template"; targetId: number; verdict: Verdict; is_human: number;
    reviewer: string; reviewer_id: number | null; confidence: string | null; note: string | null; created_at: Date;
}

/**
 * Records a check. One row per check: an AI's "marketing 0.91" followed by
 * a human's "confirmed marketing" is two rows, and the latest is the
 * current state. is_human is the flag every filter keys on.
 */
export async function recordVerdict(v: { targetType: "message" | "template"; targetId: number; verdict: Verdict; is_human: boolean; reviewer: string; reviewer_id?: number | null; confidence?: number | null; note?: string | null }) {
    const r = await exec(
        "INSERT INTO review_verdicts (targetType, targetId, verdict, is_human, reviewer, reviewer_id, confidence, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [v.targetType, v.targetId, v.verdict, v.is_human ? 1 : 0, v.reviewer.slice(0, 80), v.reviewer_id ?? null, v.confidence ?? null, v.note?.slice(0, 1000) ?? null]
    );
    return r.insertId;
}

/** Batch for the AI path: up to 500 message verdicts in one call */
export async function recordVerdicts(items: Parameters<typeof recordVerdict>[0][]) {
    if (items.length === 0) return 0;
    const values = items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(",");
    const params = items.flatMap((v) => [v.targetType, v.targetId, v.verdict, v.is_human ? 1 : 0, v.reviewer.slice(0, 80), v.reviewer_id ?? null, v.confidence ?? null, v.note?.slice(0, 1000) ?? null]);
    const r = await exec(`INSERT INTO review_verdicts (targetType, targetId, verdict, is_human, reviewer, reviewer_id, confidence, note) VALUES ${values}`, params);
    return r.affectedRows;
}

export async function latestFor(targetType: "message" | "template", targetId: number) {
    return one<VerdictRow>("SELECT * FROM review_verdicts WHERE targetType = ? AND targetId = ? ORDER BY id DESC LIMIT 1", [targetType, targetId]);
}
export async function historyFor(targetType: "message" | "template", targetId: number) {
    return query<VerdictRow>("SELECT * FROM review_verdicts WHERE targetType = ? AND targetId = ? ORDER BY id DESC LIMIT 20", [targetType, targetId]);
}

/**
 * SQL fragment for the messages list: the latest verdict per message, so the
 * list can filter on review state without a second query per row.
 */
export const LATEST_VERDICT_JOIN = `
    LEFT JOIN review_verdicts rv ON rv.id = (
        SELECT MAX(id) FROM review_verdicts x WHERE x.targetType = 'message' AND x.targetId = m.id
    )`;

export type ReviewFilter = "unreviewed" | "ai_clean" | "ai_flagged" | "ai_unsure" | "human_clean" | "human_flagged" | "any_flagged";
export function reviewWhere(f: ReviewFilter): string {
    return {
        unreviewed: "rv.id IS NULL",
        ai_clean: "rv.is_human = 0 AND rv.verdict = 'clean'",
        ai_flagged: "rv.is_human = 0 AND rv.verdict = 'marketing'",
        ai_unsure: "rv.is_human = 0 AND rv.verdict = 'unsure'",
        human_clean: "rv.is_human = 1 AND rv.verdict = 'clean'",
        human_flagged: "rv.is_human = 1 AND rv.verdict = 'marketing'",
        any_flagged: "rv.verdict = 'marketing'",
    }[f];
}

/** Messages with no verdict yet, oldest first, for an AI to work through */
export async function unreviewedMessages(limit: number, offset: number, sinceDays = 30) {
    const rows = await query<RowDataPacket & { id: number; userId: number; phoneNumber: string; message: string; createdAt: Date; owner_email: string }>(
        `SELECT m.id, m.userId, m.phoneNumber, m.message, m.createdAt, u.email AS owner_email
         FROM SMSMsg m JOIN users u ON u.id = m.userId ${LATEST_VERDICT_JOIN}
         WHERE m.isTest = 0 AND rv.id IS NULL AND m.createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY m.createdAt ASC LIMIT ${limit} OFFSET ${offset}`, [sinceDays]
    );
    const [{ n }] = await query<RowDataPacket & { n: number }>(
        `SELECT COUNT(*) AS n FROM SMSMsg m ${LATEST_VERDICT_JOIN} WHERE m.isTest = 0 AND rv.id IS NULL AND m.createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY)`, [sinceDays]
    );
    return { rows, total: Number(n) };
}

export async function verdictCounts(sinceDays = 30) {
    const rows = await query<RowDataPacket & { verdict: string | null; is_human: number | null; n: number }>(
        `SELECT rv.verdict, rv.is_human, COUNT(*) AS n FROM SMSMsg m ${LATEST_VERDICT_JOIN}
         WHERE m.isTest = 0 AND m.createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY rv.verdict, rv.is_human`, [sinceDays]
    );
    const out = { unreviewed: 0, ai_clean: 0, ai_flagged: 0, ai_unsure: 0, human_clean: 0, human_flagged: 0, human_unsure: 0 };
    rows.forEach((r) => {
        const n = Number(r.n);
        if (r.verdict == null) { out.unreviewed += n; return; }
        // the verdict value is "marketing"; the filter name is "flagged"
        const key = `${r.is_human ? "human" : "ai"}_${r.verdict === "marketing" ? "flagged" : r.verdict}` as keyof typeof out;
        out[key] += n;
    });
    return out;
}

// ---- enforcement ----
/**
 * A warning is a notification plus an audit row; the count of warnings on
 * an account is read back from the audit log, so the third warning can be
 * treated differently from the first. Suspension uses the same status the
 * main app's middleware refuses keys on.
 */
export async function warnUser(userId: number, reason: string, admin: { id: number; name: string }, ip: string | null, sampleMessageIds: number[] = []) {
    if (reason.trim().length < 10) throw new Error("Say what was wrong -- the user reads this");
    const prior = await warningCount(userId);
    await notifyUser(userId, {
        title: prior === 0 ? "Warning: transactional-only sender" : `Warning ${prior + 1}: transactional-only sender`,
        message: `${reason.trim()}\n\nThis sender ID is registered for transactional messages only. ${prior >= 1 ? "Further marketing content will lead to suspension." : "Please keep to confirmations, receipts, codes and status updates."}\n\n-- ${admin.name}, Gallant`,
        type: "alert", severity: "warning", metadata: { warning: prior + 1, messages: sampleMessageIds },
    });
    await audit({ adminId: admin.id, action: "user.warn", targetType: "user", targetId: userId, reason: reason.trim(), after: { warning: prior + 1, messages: sampleMessageIds }, ip });
    return prior + 1;
}
export async function warningCount(userId: number) {
    const r = await one<RowDataPacket & { n: number }>("SELECT COUNT(*) AS n FROM admin_audit_log WHERE action = 'user.warn' AND targetType = 'user' AND targetId = ?", [userId]);
    return Number(r?.n ?? 0);
}
