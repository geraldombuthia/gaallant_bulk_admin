import { query, one, exec } from "./pool";
import type { RowDataPacket } from "mysql2/promise";
import { audit } from "../audit";

const R = (v: unknown) => Number(v ?? 0);

// ---- purchases (entered by hand) ----
export async function listPurchases(limit = 50) {
    return query<RowDataPacket & { id: number; purchased_at: Date; amount_kes: string; units: string; reference: string | null; note: string | null; admin_name: string; created_at: Date }>(
        `SELECT p.*, u.name AS admin_name FROM provider_purchases p JOIN users u ON u.id = p.recorded_by ORDER BY p.purchased_at DESC, p.id DESC LIMIT ${limit}`
    );
}
export async function purchaseTotals() {
    const [t] = await query<RowDataPacket & { kes: string; units: string; n: number; kes90: string; units90: string }>(
        `SELECT SUM(amount_kes) AS kes, SUM(units) AS units, COUNT(*) AS n,
                SUM(CASE WHEN purchased_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) THEN amount_kes ELSE 0 END) AS kes90,
                SUM(CASE WHEN purchased_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) THEN units ELSE 0 END) AS units90
         FROM provider_purchases`
    );
    return { kes: R(t.kes), units: R(t.units), n: R(t.n), kes90: R(t.kes90), units90: R(t.units90), avgUnitCost: R(t.units) > 0 ? R(t.kes) / R(t.units) : null };
}
export async function addPurchase(p: { purchased_at: string; amount_kes: number; units: number; reference?: string; note?: string }, admin: { id: number }, ip: string | null) {
    if (!(p.amount_kes > 0) || !(p.units > 0)) throw new Error("Amount and units must both be positive");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.purchased_at)) throw new Error("Date must be YYYY-MM-DD");
    const r = await exec("INSERT INTO provider_purchases (purchased_at, amount_kes, units, reference, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?)",
        [p.purchased_at, p.amount_kes, p.units, p.reference ?? null, p.note ?? null, admin.id]);
    await audit({ adminId: admin.id, action: "provider.purchase", targetType: "provider_purchase", targetId: r.insertId, after: p, ip });
    return r.insertId;
}
export async function deletePurchase(id: number, admin: { id: number }, ip: string | null) {
    const row = await one<RowDataPacket>("SELECT * FROM provider_purchases WHERE id = ?", [id]);
    if (!row) throw new Error("Not found");
    await exec("DELETE FROM provider_purchases WHERE id = ?", [id]);
    await audit({ adminId: admin.id, action: "provider.purchase.delete", targetType: "provider_purchase", targetId: id, before: row, ip });
}

// ---- balance snapshots ----
export async function latestBalance() {
    return one<RowDataPacket & { id: number; units: string | null; ok: number; error: string | null; polled_at: Date }>(
        "SELECT id, units, ok, error, polled_at FROM provider_balance ORDER BY polled_at DESC LIMIT 1"
    );
}
export async function balanceHistory(days = 30) {
    return query<RowDataPacket & { t: string; units: string }>(
        `SELECT DATE_FORMAT(polled_at, '%Y-%m-%d') AS t, MIN(units) AS units FROM provider_balance WHERE ok = 1 AND polled_at >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY t ORDER BY t`, [days]
    );
}
export async function recordBalance(units: number | null, raw: string | null, error: string | null) {
    await exec("INSERT INTO provider_balance (units, raw, ok, error) VALUES (?, ?, ?, ?)", [units, raw?.slice(0, 1000) ?? null, error ? 0 : 1, error?.slice(0, 300) ?? null]);
}

/**
 * Polls HostPinnacle for the account's credit balance.
 *
 * POST /SMSApi/account/readstatus with userid + password (lowercase
 * "userid" -- the docs say userId, the server says otherwise) and
 * output=json returns { account: { smsBalance } }. The documented
 * /SMSApi/reports/userCredit answers 204 with no body whatever it is
 * sent; the API key on these account endpoints answers "Invalid
 * credentials". Confirmed against the live account on 13 Sep 2026.
 */
export async function pollProviderBalance(): Promise<{ units: number | null; error: string | null }> {
    const base = process.env.BULK_SMS_BASE_URL;
    const userid = process.env.BULK_SMS_USERID;
    const password = process.env.BULK_SMS_PASSWORD;
    if (!base || !userid) { await recordBalance(null, null, "BULK_SMS_BASE_URL / BULK_SMS_USERID not set"); return { units: null, error: "gateway not configured" }; }
    if (!password) { await recordBalance(null, null, "BULK_SMS_PASSWORD not set"); return { units: null, error: "BULK_SMS_PASSWORD not set -- the account endpoints need the portal password" }; }
    try {
        const res = await fetch(`${base}/SMSApi/account/readstatus`, {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ userid, password, output: "json" }), signal: AbortSignal.timeout(15000),
        });
        const text = await res.text();
        let units: number | null = null;
        let reason: string | null = null;
        try {
            const j = JSON.parse(text);
            const r = j.response ?? j;
            if (r.status === "success" && r.account?.smsBalance != null) units = Number(r.account.smsBalance);
            else reason = r.msg ?? r.status ?? null;
        } catch { reason = "unparseable body"; }
        const error = res.ok && units != null && !Number.isNaN(units) ? null : `HTTP ${res.status}: ${reason ?? text.slice(0, 200) ?? "empty body"}`;
        await recordBalance(error ? null : units, text, error);
        return { units: error ? null : units, error };
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        await recordBalance(null, null, error);
        return { units: null, error };
    }
}

/**
 * Pulls the gateway's own credit history and records any purchase not
 * already in provider_purchases, matched on the gateway's history id
 * (kept in `reference`). Units come from the row; the KSh amount is
 * parsed from the comment when it is an M-Pesa recharge, otherwise left
 * for the admin to fill in from the receipt.
 */
export async function importProviderPurchases(adminId: number): Promise<{ seen: number; imported: number; error: string | null }> {
    const base = process.env.BULK_SMS_BASE_URL;
    const userid = process.env.BULK_SMS_USERID;
    const password = process.env.BULK_SMS_PASSWORD;
    if (!base || !userid || !password) return { seen: 0, imported: 0, error: "gateway credentials not set" };
    try {
        const res = await fetch(`${base}/SMSApi/account/readcredithistory`, {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ userid, password, output: "json" }), signal: AbortSignal.timeout(20000),
        });
        const j = await res.json();
        const list: { history: { id: string; credits: string; type: string; addedTime: string; creditComments: string } }[] = j.response?.historyList ?? [];
        let imported = 0;
        for (const { history: h } of list) {
            if (h.type !== "CREDIT" || !(Number(h.credits) > 0)) continue;
            const ref = `hp:${h.id}`;
            const exists = await one<RowDataPacket>("SELECT id FROM provider_purchases WHERE reference = ?", [ref]);
            if (exists) continue;
            const units = Number(h.credits);
            // KSh is not in the response; at the list price of 0.20/unit the
            // packs are exact, so that is the default until corrected
            const amount = Math.round(units * Number(process.env.GATEWAY_COST_PER_SMS ?? 0.2) * 100) / 100;
            const when = new Date(Number(h.addedTime)).toISOString().slice(0, 10);
            await exec("INSERT INTO provider_purchases (purchased_at, amount_kes, units, reference, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?)",
                [when, amount, units, ref, `Imported from gateway history. ${h.creditComments ?? ""}`.slice(0, 500), adminId]);
            imported++;
        }
        return { seen: list.length, imported, error: null };
    } catch (e) {
        return { seen: 0, imported: 0, error: e instanceof Error ? e.message : String(e) };
    }
}

// ---- settings ----
export const SETTING_DEFAULTS = {
    alert_min_runway_days: "7",
    alert_min_units: "2000",
    alert_interval_hours: "24",
    alert_recipients: process.env.ALERT_ADMIN_USER_IDS ?? "1",
    balance_poll_interval_hours: "6",
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSettings(): Promise<Record<SettingKey, string> & Record<string, string>> {
    const rows = await query<RowDataPacket & { k: string; v: string | null }>("SELECT k, v FROM admin_settings");
    const out: Record<string, string> = { ...SETTING_DEFAULTS };
    rows.forEach((r) => { if (r.v != null) out[r.k] = r.v; });
    return out as Record<SettingKey, string> & Record<string, string>;
}
export async function setSetting(k: string, v: string, adminId: number | null) {
    await exec("INSERT INTO admin_settings (k, v, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by)", [k, v, adminId]);
}

// ---- targets ----
export async function listTargets(months = 6) {
    return query<RowDataPacket & { month: string; cash_kes: string | null; messages: number | null; new_accounts: number | null; paying_accounts: number | null; note: string | null }>(
        `SELECT * FROM admin_targets WHERE month >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ? MONTH), '%Y-%m') ORDER BY month DESC`, [months]
    );
}
export async function setTarget(t: { month: string; cash_kes: number | null; messages: number | null; new_accounts: number | null; paying_accounts: number | null; note: string | null }, admin: { id: number }, ip: string | null) {
    if (!/^\d{4}-\d{2}$/.test(t.month)) throw new Error("Month must be YYYY-MM");
    await exec(`INSERT INTO admin_targets (month, cash_kes, messages, new_accounts, paying_accounts, note, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE cash_kes = VALUES(cash_kes), messages = VALUES(messages), new_accounts = VALUES(new_accounts), paying_accounts = VALUES(paying_accounts), note = VALUES(note), updated_by = VALUES(updated_by)`,
        [t.month, t.cash_kes, t.messages, t.new_accounts, t.paying_accounts, t.note, admin.id]);
    await audit({ adminId: admin.id, action: "target.set", targetType: "target", after: t, ip });
}
/** Actuals for a month, to set against the target */
export async function monthActuals(month: string) {
    const [m] = await query<RowDataPacket & { cash: string; messages: number; new_accounts: number; paying: number }>(
        `SELECT
            (SELECT COALESCE(SUM(amount),0) FROM Payments WHERE transaction_status IN ('success','completed') AND DATE_FORMAT(created_at,'%Y-%m') = ?) AS cash,
            (SELECT COUNT(*) FROM SMSMsg WHERE isTest = 0 AND deliveryStatus NOT IN ('failed','error','rejected') AND DATE_FORMAT(createdAt,'%Y-%m') = ?) AS messages,
            (SELECT COUNT(*) FROM users WHERE role='user' AND DATE_FORMAT(created_at,'%Y-%m') = ?) AS new_accounts,
            (SELECT COUNT(DISTINCT userId) FROM Payments WHERE transaction_status IN ('success','completed') AND DATE_FORMAT(created_at,'%Y-%m') = ?) AS paying`,
        [month, month, month, month]
    );
    return { cash: R(m.cash), messages: R(m.messages), new_accounts: R(m.new_accounts), paying: R(m.paying) };
}
