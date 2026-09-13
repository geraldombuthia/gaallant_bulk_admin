import bcrypt from "bcrypt";
import { UAParser } from "ua-parser-js";
import type { RowDataPacket } from "mysql2/promise";
import { one, exec } from "../db/pool";
import type { AdminSession } from "./session";

interface UserRow extends RowDataPacket {
    id: number;
    name: string;
    email: string;
    password: string;
    role: "user" | "admin" | "superadmin";
    statuc: "active" | "suspended" | "banned";
}

/**
 * Brute-force guard. In-memory is acceptable here: an admin app has a
 * handful of users and one instance. Ten failures per address per fifteen
 * minutes, matching the main app's login limiter.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX = 10;

function tooMany(ip: string): boolean {
    const now = Date.now();
    const rec = attempts.get(ip);
    if (!rec || rec.resetAt < now) {
        return false;
    }
    return rec.count >= MAX;
}

function recordFailure(ip: string) {
    const now = Date.now();
    const rec = attempts.get(ip);
    if (!rec || rec.resetAt < now) {
        attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    } else {
        rec.count += 1;
    }
}

export type LoginResult =
    | { ok: true; admin: AdminSession }
    | { ok: false; reason: "rate_limited" | "invalid" | "not_admin" | "inactive" };

/**
 * Verifies against the shared users table. Only admin and superadmin may
 * sign in here, and only while active. The same message is returned for a
 * wrong password and an unknown address.
 */
export async function login(email: string, password: string, ip: string, userAgent: string): Promise<LoginResult> {
    if (tooMany(ip)) {
        return { ok: false, reason: "rate_limited" };
    }

    const user = await one<UserRow>(
        "SELECT id, name, email, password, role, statuc FROM users WHERE email = ? LIMIT 1",
        [email.trim().toLowerCase()]
    );

    const matches = user ? await bcrypt.compare(password, user.password) : false;
    if (!user || !matches) {
        recordFailure(ip);
        await recordSignIn(user?.id ?? null, "failed", email, ip, userAgent);
        return { ok: false, reason: "invalid" };
    }
    if (user.role !== "admin" && user.role !== "superadmin") {
        recordFailure(ip);
        await recordSignIn(user.id, "failed", email, ip, userAgent);
        return { ok: false, reason: "not_admin" };
    }
    if (user.statuc !== "active") {
        await recordSignIn(user.id, "failed", email, ip, userAgent);
        return { ok: false, reason: "inactive" };
    }

    attempts.delete(ip);
    await recordSignIn(user.id, "success", email, ip, userAgent);
    return { ok: true, admin: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

/** One spelling per address: ::1 and ::ffff:a.b.c.d are IPv4 to a reader. */
export function normaliseIp(ip: string): string {
    const s = (ip ?? "").trim();
    if (s === "::1") return "127.0.0.1";
    const m = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    return m ? m[1] : s;
}

/**
 * Same table the main app uses, so sign-in history is in one place. The
 * browser is parsed from the user agent as the main app does; the fact
 * that it was the admin console goes in `source`, its own column. It used
 * to be written into browser_name, which is why the customer's list said
 * "admin-dashboard on Unknown". Never throws.
 */
async function recordSignIn(userId: number | null, outcome: "success" | "failed", identifier: string, ip: string, userAgent: string) {
    try {
        const ua = new UAParser(userAgent).getResult();
        const isScript = !userAgent || /^(node|curl|wget|python|undici|node-fetch|axios|postman)/i.test(userAgent) || !ua.browser.name;
        await exec(
            `INSERT INTO device_access (userId, outcome, source, attempted_identifier, access_time, ip_address, user_agent,
                                        browser_name, browser_version, os_name, os_version, device_vendor, device_model, device_type, updatedAt)
             VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [userId, outcome, isScript ? "script" : "admin", identifier.slice(0, 190), normaliseIp(ip).slice(0, 45), userAgent.slice(0, 500),
             ua.browser.name ?? null, ua.browser.version ?? null, ua.os.name ?? null, ua.os.version ?? null,
             ua.device.vendor ?? null, ua.device.model ?? null, ua.device.type ?? null]
        );
    } catch {
        // Sign-in history must never block a sign-in
    }
}
