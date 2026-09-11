import nodemailer from "nodemailer";
import { randomUUID } from "crypto";
import { query, exec } from "./db/pool";
import type { RowDataPacket } from "mysql2/promise";
import { audit } from "./audit";

/**
 * Outbound email from the console. Every message is written to
 * admin_emails first, then sent, then the row is updated with the outcome
 * -- so "did we tell them?" always has an answer even when SMTP is down,
 * and a batch can be re-sent from the failed rows.
 *
 * Personalised: {{name}} and {{email}} in the subject or body are filled
 * per recipient. Sent one at a time with a small concurrency, never BCC,
 * so a recipient never sees another's address.
 */
export type Audience =
    | { kind: "address"; email: string }
    | { kind: "user"; userId: number }
    | { kind: "segment"; segment: "all_active" | "paying" | "unpaid" | "idle30" | "admins" };

interface Recipient { userId: number | null; email: string; name: string }

function transporter() {
    if (!process.env.EMAIL_ADDRESS || !process.env.EMAIL_PASS) return null;
    return nodemailer.createTransport({ service: "gmail", auth: { user: process.env.EMAIL_ADDRESS, pass: process.env.EMAIL_PASS }, pool: true, maxConnections: 3 });
}

export async function resolveAudience(a: Audience): Promise<Recipient[]> {
    if (a.kind === "address") return [{ userId: null, email: a.email, name: a.email.split("@")[0] }];
    if (a.kind === "user") {
        const rows = await query<RowDataPacket & Recipient>("SELECT id AS userId, email, name FROM users WHERE id = ?", [a.userId]);
        return rows;
    }
    const where = {
        all_active: "u.role = 'user' AND u.statuc = 'active'",
        paying: "u.role = 'user' AND u.statuc = 'active' AND u.registered_at IS NOT NULL",
        unpaid: "u.role = 'user' AND u.statuc = 'active' AND u.registered_at IS NULL",
        idle30: "u.role = 'user' AND u.statuc = 'active' AND u.registered_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM SMSMsg m WHERE m.userId = u.id AND m.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY))",
        admins: "u.role IN ('admin','superadmin')",
    }[a.segment];
    return query<RowDataPacket & Recipient>(`SELECT u.id AS userId, u.email, u.name FROM users u WHERE ${where} AND u.emailNotifications <> 0 ORDER BY u.id LIMIT 500`);
}

export async function audienceCount(a: Audience) { return (await resolveAudience(a)).length; }

const fill = (t: string, r: Recipient) => t.replace(/\{\{\s*name\s*\}\}/g, r.name).replace(/\{\{\s*email\s*\}\}/g, r.email);

export async function sendBatch(a: Audience, subject: string, body: string, admin: { id: number; name: string }, ip: string | null) {
    if (subject.trim().length < 3 || body.trim().length < 10) throw new Error("Subject and body are required");
    const recipients = await resolveAudience(a);
    if (recipients.length === 0) throw new Error("No recipients match");
    const batchId = randomUUID();
    const from = `"${process.env.EMAIL_FROM_NAME ?? "Gallant SMS"}" <${process.env.EMAIL_ADDRESS ?? "noreply@localhost"}>`;
    const t = transporter();

    // queue every row first
    for (const r of recipients) {
        await exec("INSERT INTO admin_emails (batchId, sent_by, userId, recipient, subject, body, status) VALUES (?, ?, ?, ?, ?, ?, 'queued')",
            [batchId, admin.id, r.userId, r.email, fill(subject, r).slice(0, 200), fill(body, r)]);
    }
    await audit({ adminId: admin.id, action: "email.batch", targetType: "email_batch", reason: subject.slice(0, 200), after: { batchId, audience: a, recipients: recipients.length }, ip });

    let sent = 0, failed = 0;
    const rows = await query<RowDataPacket & { id: number; recipient: string; subject: string; body: string }>("SELECT id, recipient, subject, body FROM admin_emails WHERE batchId = ?", [batchId]);
    const worker = async (row: typeof rows[number]) => {
        if (!t) { await exec("UPDATE admin_emails SET status = 'failed', error = ? WHERE id = ?", ["EMAIL_ADDRESS / EMAIL_PASS not set", row.id]); failed++; return; }
        try {
            const info = await t.sendMail({ from, to: row.recipient, subject: row.subject, text: row.body, html: row.body.replace(/\n/g, "<br>") });
            await exec("UPDATE admin_emails SET status = 'sent', provider_id = ?, sent_at = NOW() WHERE id = ?", [info.messageId ?? null, row.id]); sent++;
        } catch (e) {
            await exec("UPDATE admin_emails SET status = 'failed', error = ? WHERE id = ?", [(e instanceof Error ? e.message : String(e)).slice(0, 500), row.id]); failed++;
        }
    };
    // concurrency 3
    const q = [...rows];
    await Promise.all(Array.from({ length: 3 }, async () => { while (q.length) await worker(q.shift()!); }));
    t?.close();
    return { batchId, recipients: recipients.length, sent, failed };
}

export async function recentBatches(limit = 20) {
    return query<RowDataPacket & { batchId: string; subject: string; admin_name: string; total: number; sent: number; failed: number; created_at: Date; sample_error: string | null }>(
        `SELECT e.batchId, MIN(e.subject) AS subject, u.name AS admin_name, COUNT(*) AS total, SUM(e.status = 'sent') AS sent, SUM(e.status = 'failed') AS failed, MIN(e.created_at) AS created_at,
                (SELECT error FROM admin_emails x WHERE x.batchId = e.batchId AND x.status = 'failed' LIMIT 1) AS sample_error
         FROM admin_emails e JOIN users u ON u.id = e.sent_by GROUP BY e.batchId, u.name ORDER BY created_at DESC LIMIT ${limit}`
    );
}
export async function emailsForUser(userId: number, limit = 10) {
    return query<RowDataPacket & { id: number; subject: string; status: string; error: string | null; created_at: Date; sent_at: Date | null }>(
        `SELECT id, subject, status, error, created_at, sent_at FROM admin_emails WHERE userId = ? ORDER BY id DESC LIMIT ${limit}`, [userId]
    );
}
