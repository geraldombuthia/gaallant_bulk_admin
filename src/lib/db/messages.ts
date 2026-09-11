import { query, one, type Params } from "./pool";
import type { MessageRow } from "./types";
import { LATEST_VERDICT_JOIN, reviewWhere, type ReviewFilter } from "./verdicts";

export interface MessageFilters {
    q?: string;              // phone or content
    status?: string;         // deliveryStatus
    mode?: "live" | "test";
    user?: string;           // id or email
    from?: string;           // YYYY-MM-DD
    to?: string;
    dlr?: "received" | "none";
    /** review state from the latest verdict */
    review?: ReviewFilter;
}

const BASE = `
    SELECT m.id, m.userId, m.senderId, m.phoneNumber, m.message, m.isTest, m.deliveryStatus,
           m.deliveryCode, m.deliveryDetail, m.deliveredAt, m.dlrReceivedAt, m.providerId,
           m.transactionId, m.cost, m.reason, m.retryAttempts, m.createdAt,
           u.name AS owner_name, u.email AS owner_email,
           rv.verdict AS review_verdict, rv.is_human AS review_is_human, rv.reviewer AS review_reviewer, rv.confidence AS review_confidence
    FROM SMSMsg m JOIN users u ON u.id = m.userId ${LATEST_VERDICT_JOIN}`;

function build(f: MessageFilters) {
    const where: string[] = [];
    const params: Params = [];
    if (f.q) {
        const like = `%${f.q}%`;
        where.push("(m.phoneNumber LIKE ? OR m.message LIKE ? OR m.transactionId LIKE ?)");
        params.push(like, like, like);
    }
    if (f.status) { where.push("m.deliveryStatus = ?"); params.push(f.status); }
    if (f.mode === "live") where.push("m.isTest = 0");
    if (f.mode === "test") where.push("m.isTest = 1");
    if (f.user) {
        if (/^\d+$/.test(f.user)) { where.push("m.userId = ?"); params.push(Number(f.user)); }
        else { where.push("u.email LIKE ?"); params.push(`%${f.user}%`); }
    }
    if (f.from) { where.push("m.createdAt >= ?"); params.push(`${f.from} 00:00:00`); }
    if (f.to) { where.push("m.createdAt < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(`${f.to} 00:00:00`); }
    if (f.dlr === "received") where.push("m.dlrReceivedAt IS NOT NULL");
    if (f.dlr === "none") where.push("m.dlrReceivedAt IS NULL");
    if (f.review) where.push(reviewWhere(f.review));
    return { w: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

export async function listMessages(f: MessageFilters, limit: number, offset: number) {
    const { w, params } = build(f);
    const rows = await query<MessageRow>(`${BASE} ${w} ORDER BY m.createdAt DESC LIMIT ${limit} OFFSET ${offset}`, params);
    const [{ n }] = await query<MessageRow & { n: number }>(
        `SELECT COUNT(*) AS n FROM SMSMsg m JOIN users u ON u.id = m.userId ${LATEST_VERDICT_JOIN} ${w}`, params
    );
    return { rows, total: Number(n) };
}

export async function getMessage(id: number) {
    return one<MessageRow>(`${BASE.replace("m.createdAt,", "m.createdAt, m.providerResponse, m.dlrPayload,")} WHERE m.id = ?`, [id]);
}

export async function statusBreakdown(f: MessageFilters) {
    const { w, params } = build(f);
    return query<MessageRow & { deliveryStatus: string; n: number }>(
        `SELECT m.deliveryStatus, COUNT(*) AS n FROM SMSMsg m JOIN users u ON u.id = m.userId ${LATEST_VERDICT_JOIN} ${w} GROUP BY m.deliveryStatus ORDER BY n DESC`,
        params
    );
}

/** For the CSV export: same filters, no paging, capped */
export async function exportMessages(f: MessageFilters, cap = 10000) {
    const { w, params } = build(f);
    return query<MessageRow>(`${BASE} ${w} ORDER BY m.createdAt DESC LIMIT ${cap}`, params);
}
