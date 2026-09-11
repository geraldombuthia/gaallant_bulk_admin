import { exec, type Runner } from "./db/pool";

/**
 * Every admin action is recorded: who, what, on which row, why, and the
 * state before and after. For a system that holds money, "who changed this
 * balance" must always have an answer.
 *
 * Called inside the same transaction as the change where one exists, so an
 * audit row cannot exist without its change or the reverse.
 */
export interface AuditEntry {
    adminId: number;
    action: string;           // e.g. "template.approve", "user.suspend", "credits.adjust"
    targetType: string;       // "template" | "user" | "support" | "pricing" | ...
    targetId?: number | null;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
}

export async function audit(entry: AuditEntry, run: Runner = exec): Promise<void> {
    await run(
        `INSERT INTO admin_audit_log
            (adminId, action, targetType, targetId, reason, before_json, after_json, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            entry.adminId,
            entry.action,
            entry.targetType,
            entry.targetId ?? null,
            entry.reason ?? null,
            entry.before === undefined ? null : JSON.stringify(entry.before),
            entry.after === undefined ? null : JSON.stringify(entry.after),
            entry.ip ?? null,
        ]
    );
}
