import { query } from "./pool";
import type { RowDataPacket } from "mysql2/promise";

const R = (v: unknown) => Number(v ?? 0);
type Pt = { t: string; sent: number; failed: number };

/**
 * Traffic at three grains, live messages only. Each series is dense: every
 * bucket in the window is present, zero if nothing happened, so charts and
 * projections do not skip quiet periods.
 */
export async function hourly(hours = 48): Promise<Pt[]> {
    const rows = await query<RowDataPacket & { t: string; sent: number; failed: number }>(
        `SELECT DATE_FORMAT(createdAt, '%Y-%m-%d %H:00') AS t, COUNT(*) AS sent, SUM(deliveryStatus IN ('failed','error','rejected')) AS failed
         FROM SMSMsg WHERE isTest = 0 AND createdAt >= DATE_SUB(NOW(), INTERVAL ? HOUR) GROUP BY t`, [hours]
    );
    return dense(rows, hours, "hour");
}
export async function daily(days = 90): Promise<Pt[]> {
    const rows = await query<RowDataPacket & { t: string; sent: number; failed: number }>(
        `SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS t, COUNT(*) AS sent, SUM(deliveryStatus IN ('failed','error','rejected')) AS failed
         FROM SMSMsg WHERE isTest = 0 AND createdAt >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY t`, [days - 1]
    );
    return dense(rows, days, "day");
}
export async function weekly(weeks = 26): Promise<Pt[]> {
    const rows = await query<RowDataPacket & { t: string; sent: number; failed: number }>(
        `SELECT DATE_FORMAT(DATE_SUB(createdAt, INTERVAL WEEKDAY(createdAt) DAY), '%Y-%m-%d') AS t, COUNT(*) AS sent, SUM(deliveryStatus IN ('failed','error','rejected')) AS failed
         FROM SMSMsg WHERE isTest = 0 AND createdAt >= DATE_SUB(CURDATE(), INTERVAL ? WEEK) GROUP BY t`, [weeks]
    );
    return dense(rows, weeks, "week");
}

/** Hour-of-day profile over the last N days: when does traffic actually happen */
export async function hourOfDay(days = 30) {
    const rows = await query<RowDataPacket & { h: number; n: number }>(
        `SELECT HOUR(CONVERT_TZ(createdAt, '+00:00', '+03:00')) AS h, COUNT(*) AS n FROM SMSMsg
         WHERE isTest = 0 AND createdAt >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY h`, [days]
    );
    const out = Array.from({ length: 24 }, (_, h) => ({ h, n: 0 }));
    rows.forEach((r) => { out[Number(r.h)].n = R(r.n); });
    return out;
}

/** Customer vs the app's own traffic per day, so the running cost is visible against sales */
export async function purposeDaily(days = 30) {
    const rows = await query<RowDataPacket & { t: string; customer: number; internal: number; internalUnits: string }>(
        `SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS t, SUM(purpose = 'customer') AS customer, SUM(purpose = 'internal') AS internal,
                SUM(CASE WHEN purpose = 'internal' THEN COALESCE(cost, 1) ELSE 0 END) AS internalUnits
         FROM SMSMsg WHERE isTest = 0 AND deliveryStatus NOT IN ('failed','error','rejected') AND createdAt >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY t`, [days - 1]
    );
    const m = Object.fromEntries(rows.map((r) => [r.t, r]));
    return dense([], days, "day").map((p) => ({ t: p.t, customer: R(m[p.t]?.customer), internal: R(m[p.t]?.internal), internalUnits: R(m[p.t]?.internalUnits) }));
}

export async function usersDaily(days = 60) {
    const signups = await query<RowDataPacket & { t: string; n: number }>(
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS t, COUNT(*) AS n FROM users WHERE role = 'user' AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY t`, [days - 1]
    );
    const active = await query<RowDataPacket & { t: string; n: number }>(
        `SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS t, COUNT(DISTINCT userId) AS n FROM SMSMsg WHERE isTest = 0 AND createdAt >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY t`, [days - 1]
    );
    const paid = await query<RowDataPacket & { t: string; n: number }>(
        `SELECT DATE_FORMAT(registered_at, '%Y-%m-%d') AS t, COUNT(*) AS n FROM users WHERE registered_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY t`, [days - 1]
    );
    const keys = dense([], days, "day").map((p) => p.t);
    const m = (rows: { t: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.t, R(r.n)]));
    const s = m(signups), a = m(active), p = m(paid);
    return keys.map((t) => ({ t, signups: s[t] ?? 0, active: a[t] ?? 0, paid: p[t] ?? 0 }));
}

export async function cashDaily(days = 90) {
    const rows = await query<RowDataPacket & { t: string; amount: string }>(
        `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS t, SUM(amount) AS amount FROM Payments
         WHERE transaction_status IN ('success','completed') AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY t`, [days - 1]
    );
    const m = Object.fromEntries(rows.map((r) => [r.t, R(r.amount)]));
    return dense([], days, "day").map((p) => ({ t: p.t, amount: m[p.t] ?? 0 }));
}

/**
 * Projection: a least-squares line through the last `fit` points, plus the
 * mean, so the reader sees both "where it is heading" and "what a normal
 * day is". Honest about small samples: with fewer than 7 non-zero points the
 * slope is reported as unreliable and the mean is used.
 */
export function project(values: number[], fit = 28, ahead = 30) {
    const ys = values.slice(-fit);
    const n = ys.length;
    const nonZero = ys.filter((v) => v > 0).length;
    const mean = n > 0 ? ys.reduce((a, b) => a + b, 0) / n : 0;
    let slope = 0, intercept = mean;
    if (n >= 2) {
        const xs = ys.map((_, i) => i);
        const mx = (n - 1) / 2, my = mean;
        const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
        const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
        slope = sxx > 0 ? sxy / sxx : 0;
        intercept = my - slope * mx;
    }
    const reliable = nonZero >= 7;
    const next = Array.from({ length: ahead }, (_, k) => Math.max(0, reliable ? intercept + slope * (n + k) : mean));
    return {
        mean, slope, reliable,
        perDay: reliable ? Math.max(0, intercept + slope * n) : mean,
        next30: next.reduce((a, b) => a + b, 0),
        trendPct: mean > 0 && reliable ? (slope * 7) / mean : null, // change per week as a share of the mean
    };
}

function dense(rows: { t: string; sent?: number; failed?: number }[], count: number, grain: "hour" | "day" | "week"): Pt[] {
    const m = Object.fromEntries(rows.map((r) => [r.t, { sent: R(r.sent), failed: R(r.failed) }]));
    const out: Pt[] = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now);
        let key: string;
        if (grain === "hour") { d.setUTCMinutes(0, 0, 0); d.setUTCHours(d.getUTCHours() - i); key = d.toISOString().slice(0, 13).replace("T", " ") + ":00"; }
        else if (grain === "day") { d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - i); key = d.toISOString().slice(0, 10); }
        else { d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - i * 7); key = d.toISOString().slice(0, 10); }
        out.push({ t: key, sent: m[key]?.sent ?? 0, failed: m[key]?.failed ?? 0 });
    }
    return out;
}
