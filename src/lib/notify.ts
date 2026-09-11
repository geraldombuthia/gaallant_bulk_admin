import { exec } from "./db/pool";

type NotificationType = "system" | "credit" | "message" | "payment" | "login" | "alert";
type Severity = "info" | "warning" | "error" | "success";

/**
 * Writes a notification the user sees on their dashboard. Same table and
 * shape the main app uses, so it appears in their list with everything else.
 */
export async function notifyUser(
    userId: number,
    { title, message, type = "system", severity = "info", metadata = null }:
    { title: string; message: string; type?: NotificationType; severity?: Severity; metadata?: unknown }
): Promise<void> {
    await exec(
        `INSERT INTO notifications (userId, title, message, type, severity, isRead, metadata, created_at, last_modified)
         VALUES (?, ?, ?, ?, ?, 0, ?, NOW(), NOW())`,
        [userId, title.slice(0, 255), message, type, severity, metadata === null ? null : JSON.stringify(metadata)]
    );
}
