import { query, one, exec, transaction, type Params, type Runner } from "./pool";
import type { UserRow, MessageRow, PaymentRow, SignInRow, SupportRow } from "./types";
import { audit } from "../audit";
import { emails } from "../emailTemplate";
import { sendCustomerEmail } from "../email";

export interface UserFilters {
    q?: string;
    role?: "user" | "admin" | "superadmin";
    status?: "active" | "suspended" | "banned";
    balance?: "zero" | "low" | "any";
    activity?: "active30" | "idle30" | "never";
    sort?: "newest" | "oldest" | "balance" | "messages" | "name";
}

const BASE = `
    SELECT u.id, u.name, u.username, u.email, u.phone, u.role, u.statuc, u.registered_at,
           u.verifiedEmail, u.verifiedPhone, u.created_at,
           c.creditBalance AS balance,
           (SELECT COUNT(*) FROM SMSMsg m WHERE m.userId = u.id AND m.isTest = 0 AND m.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS messages_30d,
           (SELECT MAX(d.access_time) FROM device_access d WHERE d.userId = u.id AND d.outcome = 'success') AS last_sign_in,
           (SELECT COUNT(*) FROM api_keys k WHERE k.userId = u.id AND k.isActive = 1 AND k.mode = 'live') AS keys_live,
           (SELECT COUNT(*) FROM api_keys k WHERE k.userId = u.id AND k.isActive = 1 AND k.mode = 'test') AS keys_test
    FROM users u
    LEFT JOIN SMSCredits c ON c.userId = u.id`;

export async function listUsers(f: UserFilters, limit: number, offset: number) {
    const where: string[] = [];
    const params: Params = [];
    if (f.q) {
        const like = `%${f.q}%`;
        where.push("(u.name LIKE ? OR u.email LIKE ? OR u.username LIKE ? OR u.phone LIKE ?)");
        params.push(like, like, like, like);
    }
    if (f.role) { where.push("u.role = ?"); params.push(f.role); }
    if (f.status) { where.push("u.statuc = ?"); params.push(f.status); }
    if (f.balance === "zero") where.push("COALESCE(c.creditBalance, 0) <= 0");
    if (f.balance === "low") where.push("COALESCE(c.creditBalance, 0) > 0 AND c.creditBalance < 10");
    const having: string[] = [];
    if (f.activity === "active30") having.push("messages_30d > 0");
    if (f.activity === "idle30") having.push("messages_30d = 0 AND u.registered_at IS NOT NULL");
    if (f.activity === "never") having.push("u.registered_at IS NULL");
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const h = having.length ? `HAVING ${having.join(" AND ")}` : "";
    const order = {
        newest: "u.created_at DESC", oldest: "u.created_at ASC",
        balance: "COALESCE(c.creditBalance,0) DESC", messages: "messages_30d DESC", name: "u.name ASC",
    }[f.sort ?? "newest"];

    const rows = await query<UserRow>(`${BASE} ${w} ${h} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params);
    const [{ n }] = await query<UserRow & { n: number }>(
        `SELECT COUNT(*) AS n FROM (${BASE} ${w} ${h}) x`, params
    );
    return { rows, total: Number(n) };
}

export async function getUser(id: number) {
    return one<UserRow>(`${BASE} WHERE u.id = ?`, [id]);
}

export async function userMessages(id: number, limit = 20) {
    return query<MessageRow>(
        `SELECT id, phoneNumber, message, isTest, deliveryStatus, deliveryCode, cost, createdAt FROM SMSMsg WHERE userId = ? ORDER BY createdAt DESC LIMIT ${limit}`, [id]
    );
}
export async function userPayments(id: number, limit = 20) {
    return query<PaymentRow>(
        `SELECT id, amount, transaction_code, payment_method, transaction_status, purchaseType, phone, created_at FROM Payments WHERE userId = ? ORDER BY created_at DESC LIMIT ${limit}`, [id]
    );
}
export async function userSignIns(id: number, limit = 15) {
    return query<SignInRow>(
        `SELECT id, outcome, source, access_time, ip_address, browser_name, browser_version, os_name, device_type FROM device_access WHERE userId = ? ORDER BY access_time DESC LIMIT ${limit}`, [id]
    );
}
export async function userSupport(id: number) {
    return query<SupportRow>(`SELECT id, subject, status, created_at FROM support_messages WHERE userId = ? ORDER BY created_at DESC LIMIT 10`, [id]);
}
export async function userTemplates(id: number) {
    return query<import("./types").TemplateRow>(`SELECT id, template_name, slug, status, active, createdAt FROM Templates WHERE userId = ? ORDER BY createdAt DESC LIMIT 20`, [id]);
}
export async function userKeys(id: number) {
    return query<import("mysql2/promise").RowDataPacket & { id: number; description: string | null; mode: string; isActive: number; expiresAt: Date | null; created_at: Date; suffix: string }>(
        `SELECT id, description, mode, isActive, expiresAt, created_at, RIGHT(apiKeyHash, 6) AS suffix FROM api_keys WHERE userId = ? ORDER BY created_at DESC`, [id]
    );
}
export async function userLedger(id: number, limit = 20) {
    return query<import("mysql2/promise").RowDataPacket & { id: number; creditsValue: string; creditUnit: string; productType: string; price_per_unit: string | null; paymentId: number | null; createdAt: Date }>(
        `SELECT id, creditsValue, creditUnit, productType, price_per_unit, paymentId, createdAt FROM Credits WHERE userId = ? ORDER BY createdAt DESC LIMIT ${limit}`, [id]
    );
}

export type StatusChange = "active" | "suspended" | "banned";

export async function setStatus(userId: number, status: StatusChange, reason: string, admin: { id: number }, ip: string | null) {
    if (reason.trim().length < 5) throw new Error("A reason is required");
    if (userId === admin.id) throw new Error("You cannot change your own status");
    const u = await one<UserRow>("SELECT id, statuc, role FROM users WHERE id = ?", [userId]);
    if (!u) throw new Error("User not found");
    if (u.role === "superadmin") throw new Error("A superadmin's status cannot be changed here");
    await exec("UPDATE users SET statuc = ?, updated_at = NOW() WHERE id = ?", [status, userId]);
    await audit({ adminId: admin.id, action: `user.${status}`, targetType: "user", targetId: userId, reason: reason.trim(), before: { statuc: u.statuc }, after: { statuc: status }, ip });
    const [full] = await query<UserRow>("SELECT name FROM users WHERE id = ?", [userId]);
    await sendCustomerEmail(userId, emails.accountStatus({ name: full?.name, status, reason: reason.trim() }), admin);
    // Keys of a banned or suspended account must stop working; the main
    // app's checkUserStatus middleware reads statuc, so this is enough.
}

export async function setRole(userId: number, role: "user" | "admin" | "superadmin", reason: string, admin: { id: number }, ip: string | null) {
    if (reason.trim().length < 5) throw new Error("A reason is required");
    if (userId === admin.id) throw new Error("You cannot change your own role");
    const u = await one<UserRow>("SELECT id, role FROM users WHERE id = ?", [userId]);
    if (!u) throw new Error("User not found");
    await exec("UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?", [role, userId]);
    await audit({ adminId: admin.id, action: "user.role", targetType: "user", targetId: userId, reason: reason.trim(), before: { role: u.role }, after: { role }, ip });
}

/**
 * Credit adjustment. Positive adds, negative removes; never below zero. The
 * balance row is locked, the ledger gets a row with productType
 * "adjustment" so it reconciles like any purchase, and the audit carries
 * before and after.
 */
export async function adjustCredits(userId: number, delta: number, reason: string, admin: { id: number }, ip: string | null) {
    if (!Number.isFinite(delta) || delta === 0) throw new Error("Enter a non-zero amount");
    if (Math.abs(delta) > 100000) throw new Error("Adjustments over 100,000 credits need a second look; split it or ask a superadmin");
    if (reason.trim().length < 10) throw new Error("Say why -- this is a money change and the reason goes in the audit log");

    return transaction(async (conn) => {
        const [rows] = await conn.execute<UserRow[]>("SELECT id, creditBalance FROM SMSCredits WHERE userId = ? FOR UPDATE", [userId]);
        let before = 0;
        if (rows[0]) {
            before = Number(rows[0].creditBalance);
        } else {
            await conn.execute("INSERT INTO SMSCredits (userId, creditBalance, price_per_unit, created_at, lastmodified) VALUES (?, 0, 1.00, NOW(), NOW())", [userId]);
        }
        const after = Math.round((before + delta) * 10000) / 10000;
        if (after < 0) throw new Error(`Balance would go negative (${before} ${delta > 0 ? "+" : ""}${delta})`);

        await conn.execute("UPDATE SMSCredits SET creditBalance = ?, lastmodified = NOW() WHERE userId = ?", [after, userId]);
        // Ledger semantics: creditsValue is KSh paid, creditUnit is SMS units.
        // An adjustment moves units with no money changing hands, so it is
        // 0 KSh and delta units at price 0 -- it reconciles as units and
        // contributes nothing to revenue.
        await conn.execute(
            "INSERT INTO Credits (userId, paymentId, creditsValue, creditUnit, productType, price_per_unit, createdAt, lastModified) VALUES (?, NULL, 0, ?, 'adjustment', 0, NOW(), NOW())",
            [userId, delta]
        );
        const run: Runner = async (sql, params = []) => { const [r] = await conn.execute<import("mysql2/promise").ResultSetHeader>(sql, params); return r; };
        await audit({ adminId: admin.id, action: "credits.adjust", targetType: "user", targetId: userId, reason: reason.trim(), before: { balance: before }, after: { balance: after, delta }, ip }, run);
        await run(
            `INSERT INTO notifications (userId, title, message, type, severity, isRead, metadata, created_at, last_modified)
             VALUES (?, ?, ?, 'credit', 'info', 0, ?, NOW(), NOW())`,
            [userId, delta > 0 ? `${delta} credits added to your account` : `${Math.abs(delta)} credits removed from your account`,
             `${reason.trim()}\n\nBalance is now ${after}.`, JSON.stringify({ delta, before, after })]
        );
        return { before, after };
    }).then(async (r) => {
        const [full] = await query<UserRow>("SELECT name FROM users WHERE id = ?", [userId]);
        await sendCustomerEmail(userId, emails.creditsAdjusted({ name: full?.name, delta, balance: r.after, reason: reason.trim() }), admin);
        return r;
    });
}
