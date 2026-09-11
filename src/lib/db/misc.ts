import { query, one, exec, transaction, type Params, type Runner } from "./pool";
import type { PaymentRow, AuditRow, SignInRow, PricingRow } from "./types";
import type { RowDataPacket } from "mysql2/promise";
import { audit } from "../audit";

// ---- payments ----
export async function listPayments(f: { status?: string; q?: string; from?: string; to?: string }, limit: number, offset: number) {
    const where: string[] = []; const params: Params = [];
    if (f.status) { where.push("p.transaction_status = ?"); params.push(f.status); }
    if (f.q) { const like = `%${f.q}%`; where.push("(p.transaction_code LIKE ? OR p.phone LIKE ? OR u.email LIKE ? OR p.checkoutRequestID LIKE ?)"); params.push(like, like, like, like); }
    if (f.from) { where.push("p.created_at >= ?"); params.push(`${f.from} 00:00:00`); }
    if (f.to) { where.push("p.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(`${f.to} 00:00:00`); }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await query<PaymentRow>(
        `SELECT p.*, u.name AS owner_name, u.email AS owner_email FROM Payments p JOIN users u ON u.id = p.userId ${w} ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params
    );
    const [{ n }] = await query<PaymentRow & { n: number }>(`SELECT COUNT(*) AS n FROM Payments p JOIN users u ON u.id = p.userId ${w}`, params);
    const [sums] = await query<RowDataPacket & { total: string | null; succeeded: string | null }>(
        `SELECT SUM(p.amount) AS total, SUM(CASE WHEN p.transaction_status IN ('success','completed') THEN p.amount ELSE 0 END) AS succeeded
         FROM Payments p JOIN users u ON u.id = p.userId ${w}`, params
    );
    return { rows, total: Number(n), sumAll: Number(sums?.total ?? 0), sumOk: Number(sums?.succeeded ?? 0) };
}
export async function paymentStatuses() {
    return query<RowDataPacket & { transaction_status: string; n: number }>("SELECT transaction_status, COUNT(*) AS n FROM Payments GROUP BY transaction_status ORDER BY n DESC");
}

// ---- audit ----
export async function listAudit(f: { action?: string; admin?: string; target?: string }, limit: number, offset: number) {
    const where: string[] = []; const params: Params = [];
    if (f.action) { where.push("a.action LIKE ?"); params.push(`${f.action}%`); }
    if (f.admin) { where.push("a.adminId = ?"); params.push(Number(f.admin)); }
    if (f.target) { where.push("a.targetType = ?"); params.push(f.target); }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await query<AuditRow>(`SELECT a.*, u.name AS admin_name FROM admin_audit_log a JOIN users u ON u.id = a.adminId ${w} ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params);
    const [{ n }] = await query<AuditRow & { n: number }>(`SELECT COUNT(*) AS n FROM admin_audit_log a ${w}`, params);
    return { rows, total: Number(n) };
}

// ---- sign-ins ----
export async function listSignIns(f: { outcome?: "success" | "failed"; q?: string }, limit: number, offset: number) {
    const where: string[] = []; const params: Params = [];
    if (f.outcome) { where.push("d.outcome = ?"); params.push(f.outcome); }
    if (f.q) { const like = `%${f.q}%`; where.push("(d.attempted_identifier LIKE ? OR d.ip_address LIKE ? OR u.email LIKE ?)"); params.push(like, like, like); }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await query<SignInRow>(`SELECT d.id, d.userId, d.outcome, d.attempted_identifier, d.access_time, d.ip_address, d.browser_name, d.os_name, d.device_type, u.name AS user_name FROM device_access d LEFT JOIN users u ON u.id = d.userId ${w} ORDER BY d.access_time DESC LIMIT ${limit} OFFSET ${offset}`, params);
    const [{ n }] = await query<SignInRow & { n: number }>(`SELECT COUNT(*) AS n FROM device_access d LEFT JOIN users u ON u.id = d.userId ${w}`, params);
    return { rows, total: Number(n) };
}
/** Addresses with many failures recently -- the thing to look at first */
export async function failureHotspots(hours = 24) {
    return query<RowDataPacket & { ip_address: string; n: number; identifiers: number; last: Date }>(
        `SELECT ip_address, COUNT(*) AS n, COUNT(DISTINCT attempted_identifier) AS identifiers, MAX(access_time) AS last
         FROM device_access WHERE outcome = 'failed' AND access_time >= DATE_SUB(NOW(), INTERVAL ? HOUR)
         GROUP BY ip_address HAVING n >= 3 ORDER BY n DESC LIMIT 10`, [hours]
    );
}

// ---- pricing ----
export async function activePricing() {
    return one<PricingRow>("SELECT * FROM pricing WHERE isActive = 1 ORDER BY id DESC LIMIT 1");
}
export async function pricingHistory() {
    return query<PricingRow>("SELECT * FROM pricing ORDER BY id DESC LIMIT 20");
}
export interface PricingInput { registrationFee: number; t1: [number, number, number]; t2: [number, number, number]; t3: [number, number, number]; }
/** Same semantics as the main app's updatePricing: deactivate the current row, insert the new one, atomically. */
export async function updatePricing(p: PricingInput, reason: string, admin: { id: number }, ip: string | null) {
    if (reason.trim().length < 10) throw new Error("Say why the price is changing -- it goes in the audit log");
    const tiers = [p.t1, p.t2, p.t3];
    for (const [min, max, price] of tiers) {
        if (!(price > 0) || !(max >= min) || min < 0) throw new Error("Each tier needs min <= max and a positive price");
    }
    if (!(p.t1[2] >= p.t2[2] && p.t2[2] >= p.t3[2])) throw new Error("Prices must not rise with volume");
    if (!(p.t2[0] >= p.t1[1] && p.t3[0] >= p.t2[1])) throw new Error("Tiers must not overlap");
    return transaction(async (conn) => {
        const [cur] = await conn.execute<PricingRow[]>("SELECT * FROM pricing WHERE isActive = 1 FOR UPDATE");
        await conn.execute("UPDATE pricing SET isActive = 0, effectiveTo = NOW(), updated_at = NOW() WHERE isActive = 1");
        const [ins] = await conn.execute<import("mysql2/promise").ResultSetHeader>(
            `INSERT INTO pricing (registrationFee, tier1Min, tier1Max, tier1Price, tier2Min, tier2Max, tier2Price, tier3Min, tier3Max, tier3Price, effectiveFrom, isActive, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1, NOW(), NOW())`,
            [p.registrationFee, ...p.t1, ...p.t2, ...p.t3]
        );
        const run: Runner = async (sql, params = []) => { const [r] = await conn.execute<import("mysql2/promise").ResultSetHeader>(sql, params); return r; };
        await audit({ adminId: admin.id, action: "pricing.update", targetType: "pricing", targetId: ins.insertId, reason: reason.trim(), before: cur[0] ? { t1: cur[0].tier1Price, t2: cur[0].tier2Price, t3: cur[0].tier3Price, fee: cur[0].registrationFee } : null, after: { t1: p.t1[2], t2: p.t2[2], t3: p.t3[2], fee: p.registrationFee }, ip }, run);
        return ins.insertId;
    });
}

// ---- dashboard ----
export async function overview() {
    const [users] = await query<RowDataPacket & { total: number; new7: number; registered: number }>(
        `SELECT COUNT(*) AS total, SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS new7, SUM(registered_at IS NOT NULL) AS registered FROM users WHERE role = 'user'`
    );
    const [msgs] = await query<RowDataPacket & { today: number; d7: number; d30: number; failed7: number; delivered7: number; reported7: number }>(
        `SELECT SUM(createdAt >= CURDATE()) AS today,
                SUM(createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS d7,
                SUM(createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS d30,
                SUM(createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND deliveryStatus IN ('failed','error','rejected')) AS failed7,
                SUM(createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND dlrReceivedAt IS NOT NULL AND deliveryStatus = 'delivered') AS delivered7,
                SUM(createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND dlrReceivedAt IS NOT NULL) AS reported7
         FROM SMSMsg WHERE isTest = 0`
    );
    const [pay] = await query<RowDataPacket & { amount7: string | null; count7: number; amount30: string | null }>(
        `SELECT SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN amount ELSE 0 END) AS amount7,
                SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS count7,
                SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount ELSE 0 END) AS amount30
         FROM Payments WHERE transaction_status IN ('success','completed')`
    );
    const [sec] = await query<RowDataPacket & { failed24: number }>(
        `SELECT COUNT(*) AS failed24 FROM device_access WHERE outcome = 'failed' AND access_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    const [credits] = await query<RowDataPacket & { outstanding: string | null }>(`SELECT SUM(creditBalance) AS outstanding FROM SMSCredits`);
    const daily = await query<RowDataPacket & { day: string; sent: number; failed: number }>(
        `SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS day, COUNT(*) AS sent, SUM(deliveryStatus IN ('failed','error','rejected')) AS failed
         FROM SMSMsg WHERE isTest = 0 AND createdAt >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) GROUP BY day ORDER BY day`
    );
    return {
        users: { total: Number(users.total), new7: Number(users.new7 ?? 0), registered: Number(users.registered ?? 0) },
        messages: { today: Number(msgs.today ?? 0), d7: Number(msgs.d7 ?? 0), d30: Number(msgs.d30 ?? 0), failed7: Number(msgs.failed7 ?? 0),
            deliveryRate7: Number(msgs.reported7) > 0 ? Number(msgs.delivered7) / Number(msgs.reported7) : null, reported7: Number(msgs.reported7 ?? 0) },
        payments: { amount7: Number(pay.amount7 ?? 0), count7: Number(pay.count7 ?? 0), amount30: Number(pay.amount30 ?? 0) },
        security: { failed24: Number(sec.failed24) },
        creditsOutstanding: Number(credits.outstanding ?? 0),
        // Dense: every one of the 14 days is present, zero when quiet, so the
        // chart keeps its frame instead of stretching one bar across it
        daily: (() => {
            const byDay = Object.fromEntries(daily.map((d) => [String(d.day).slice(0, 10), d]));
            const out: { day: string; sent: number; failed: number }[] = [];
            for (let i = 13; i >= 0; i--) {
                const dt = new Date(); dt.setUTCHours(0, 0, 0, 0); dt.setUTCDate(dt.getUTCDate() - i);
                const key = dt.toISOString().slice(0, 10);
                out.push({ day: key, sent: Number(byDay[key]?.sent ?? 0), failed: Number(byDay[key]?.failed ?? 0) });
            }
            return out;
        })(),
    };
}

export { exec };
