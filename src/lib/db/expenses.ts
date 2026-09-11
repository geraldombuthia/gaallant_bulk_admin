import { query, one, exec } from "./pool";
import type { RowDataPacket } from "mysql2/promise";
import { audit } from "../audit";

export const CATEGORIES = ["marketing", "infrastructure", "gateway", "fees", "salaries", "software", "other"] as const;
export type Category = typeof CATEGORIES[number];
export interface ExpenseRow extends RowDataPacket {
    id: number; spent_on: Date; category: Category; amount_kes: string; vendor: string | null; reference: string | null; note: string | null; recorded_by: number; created_at: Date; admin_name?: string;
}

export async function listExpenses(f: { category?: Category; from?: string; to?: string }, limit: number, offset: number) {
    const where: string[] = []; const params: (string | number)[] = [];
    if (f.category) { where.push("e.category = ?"); params.push(f.category); }
    if (f.from) { where.push("e.spent_on >= ?"); params.push(f.from); }
    if (f.to) { where.push("e.spent_on <= ?"); params.push(f.to); }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await query<ExpenseRow>(`SELECT e.*, u.name AS admin_name FROM expenses e JOIN users u ON u.id = e.recorded_by ${w} ORDER BY e.spent_on DESC, e.id DESC LIMIT ${limit} OFFSET ${offset}`, params);
    const [{ n, total }] = await query<RowDataPacket & { n: number; total: string }>(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_kes),0) AS total FROM expenses e ${w}`, params);
    return { rows, total: Number(n), sum: Number(total) };
}

export async function addExpense(e: { spent_on: string; category: Category; amount_kes: number; vendor?: string; reference?: string; note?: string }, admin: { id: number }, ip: string | null) {
    if (!(e.amount_kes > 0)) throw new Error("Amount must be positive");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.spent_on)) throw new Error("Date must be YYYY-MM-DD");
    if (!CATEGORIES.includes(e.category)) throw new Error("Unknown category");
    const r = await exec("INSERT INTO expenses (spent_on, category, amount_kes, vendor, reference, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [e.spent_on, e.category, e.amount_kes, e.vendor ?? null, e.reference ?? null, e.note ?? null, admin.id]);
    await audit({ adminId: admin.id, action: "expense.add", targetType: "expense", targetId: r.insertId, after: e, ip });
    return r.insertId;
}
export async function deleteExpense(id: number, admin: { id: number }, ip: string | null) {
    const row = await one<ExpenseRow>("SELECT * FROM expenses WHERE id = ?", [id]);
    if (!row) throw new Error("Not found");
    await exec("DELETE FROM expenses WHERE id = ?", [id]);
    await audit({ adminId: admin.id, action: "expense.delete", targetType: "expense", targetId: id, before: row, ip });
}

/** Totals by category for a window, plus gateway purchases folded in as their own line */
export async function expenseSummary(days: number | null) {
    const w = days ? "WHERE spent_on >= DATE_SUB(CURDATE(), INTERVAL ? DAY)" : "";
    const params = days ? [days] : [];
    const rows = await query<RowDataPacket & { category: string; total: string }>(`SELECT category, SUM(amount_kes) AS total FROM expenses ${w} GROUP BY category`, params);
    const [g] = await query<RowDataPacket & { total: string }>(`SELECT COALESCE(SUM(amount_kes),0) AS total FROM provider_purchases ${days ? "WHERE purchased_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)" : ""}`, params);
    const byCat: Record<string, number> = {};
    rows.forEach((r) => { byCat[r.category] = Number(r.total); });
    const gatewayCredits = Number(g.total);
    const other = Object.values(byCat).reduce((a, b) => a + b, 0);
    return { byCat, gatewayCredits, total: other + gatewayCredits };
}

export async function expensesMonthly(months = 12) {
    const rows = await query<RowDataPacket & { m: string; total: string }>(
        `SELECT m, SUM(total) AS total FROM (
            SELECT DATE_FORMAT(spent_on, '%Y-%m') AS m, SUM(amount_kes) AS total FROM expenses WHERE spent_on >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH) GROUP BY m
            UNION ALL
            SELECT DATE_FORMAT(purchased_at, '%Y-%m') AS m, SUM(amount_kes) AS total FROM provider_purchases WHERE purchased_at >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ? MONTH) GROUP BY m
         ) x GROUP BY m`, [months - 1, months - 1]
    );
    return Object.fromEntries(rows.map((r) => [r.m, Number(r.total)]));
}
