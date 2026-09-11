import { query } from "./pool";
import type { RowDataPacket } from "mysql2/promise";
import { review, worst, type Flag, type Severity } from "../compliance";

/**
 * Scans what was actually sent, not what was approved.
 *
 * Only approved templates can be sent, but every {{ variable }} is free
 * text at send time -- "{{ name }}" can arrive as "50% OFF TODAY". So the
 * only place marketing abuse can be caught is the message body as it went
 * out. This runs the same checker over live traffic and groups the hits by
 * account, which is the unit that gets warned or suspended.
 */

export interface Hit {
    id: number;
    userId: number;
    owner_name: string;
    owner_email: string;
    phoneNumber: string;
    message: string;
    createdAt: Date;
    worst: Severity;
    flags: Flag[];
}

interface Row extends RowDataPacket {
    id: number; userId: number; owner_name: string; owner_email: string; phoneNumber: string; message: string; createdAt: Date;
}

export async function scanSent(opts: { sinceDays?: number; userId?: number; minSeverity?: Severity; limit?: number } = {}) {
    const since = opts.sinceDays ?? 30;
    const limit = Math.min(5000, opts.limit ?? 2000);
    const params: (number | string)[] = [since];
    let userClause = "";
    if (opts.userId) { userClause = "AND m.userId = ?"; params.push(opts.userId); }
    const rows = await query<Row>(
        `SELECT m.id, m.userId, u.name AS owner_name, u.email AS owner_email, m.phoneNumber, m.message, m.createdAt
         FROM SMSMsg m JOIN users u ON u.id = m.userId
         WHERE m.isTest = 0 AND m.createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY) ${userClause}
         ORDER BY m.createdAt DESC LIMIT ${limit}`, params
    );
    const rank: Record<Severity, number> = { block: 0, warn: 1, note: 2 };
    const floor = rank[opts.minSeverity ?? "warn"];
    const hits: Hit[] = [];
    for (const r of rows) {
        const flags = review(r.message).filter((f) => f.id !== "no-variables"); // sent text has no placeholders by design
        const w = worst(flags);
        if (w === "clean" || rank[w] > floor) continue;
        hits.push({ ...r, worst: w, flags });
    }
    return { scanned: rows.length, sinceDays: since, hits };
}

export interface AccountSummary {
    userId: number; owner_name: string; owner_email: string;
    sent: number; flagged: number; blocked: number; rate: number;
    topFlags: string[]; sample: Hit;
}

/** Hits grouped by account, worst first. This is the page a human reads. */
export function byAccount(hits: Hit[], sentPerUser: Map<number, number>): AccountSummary[] {
    const groups = new Map<number, Hit[]>();
    hits.forEach((h) => { groups.set(h.userId, [...(groups.get(h.userId) ?? []), h]); });
    return [...groups.entries()].map(([userId, hs]) => {
        const counts = new Map<string, number>();
        hs.forEach((h) => h.flags.forEach((f) => counts.set(f.id, (counts.get(f.id) ?? 0) + 1)));
        const sent = sentPerUser.get(userId) ?? hs.length;
        return {
            userId, owner_name: hs[0].owner_name, owner_email: hs[0].owner_email,
            sent, flagged: hs.length, blocked: hs.filter((h) => h.worst === "block").length,
            rate: sent > 0 ? hs.length / sent : 0,
            topFlags: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id, n]) => `${id} ×${n}`),
            sample: hs.find((h) => h.worst === "block") ?? hs[0],
        };
    }).sort((a, b) => b.blocked - a.blocked || b.rate - a.rate);
}

export async function sentCounts(sinceDays: number) {
    const rows = await query<RowDataPacket & { userId: number; n: number }>(
        `SELECT userId, COUNT(*) AS n FROM SMSMsg WHERE isTest = 0 AND createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY userId`, [sinceDays]
    );
    return new Map(rows.map((r) => [r.userId, Number(r.n)]));
}
