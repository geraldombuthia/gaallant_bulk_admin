"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireSuperadmin } from "@/lib/auth/session";
import { setStatus, setRole, adjustCredits } from "@/lib/db/users";
import { notifyUser } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { emails } from "@/lib/emailTemplate";
import { sendCustomerEmail } from "@/lib/email";
import { getUser } from "@/lib/db/users";

export type ActionState = { ok?: string; error?: string };

const wrap = async (fn: () => Promise<string>): Promise<ActionState> => {
    try { return { ok: await fn() }; } catch (e) { return { error: e instanceof Error ? e.message : "Something went wrong" }; }
};

export async function changeStatus(_p: ActionState, form: FormData): Promise<ActionState> {
    return wrap(async () => {
        const admin = await requireAdmin();
        const { id, status, reason } = z.object({ id: z.coerce.number(), status: z.enum(["active", "suspended", "banned"]), reason: z.string() }).parse(Object.fromEntries(form));
        await setStatus(id, status, reason, admin, await clientIp());
        revalidatePath(`/users/${id}`);
        return `Account is now ${status}.`;
    });
}

export async function changeRole(_p: ActionState, form: FormData): Promise<ActionState> {
    return wrap(async () => {
        const admin = await requireSuperadmin();
        const { id, role, reason } = z.object({ id: z.coerce.number(), role: z.enum(["user", "admin", "superadmin"]), reason: z.string() }).parse(Object.fromEntries(form));
        await setRole(id, role, reason, admin, await clientIp());
        revalidatePath(`/users/${id}`);
        return `Role is now ${role}.`;
    });
}

export async function adjust(_p: ActionState, form: FormData): Promise<ActionState> {
    return wrap(async () => {
        const admin = await requireAdmin();
        const { id, delta, reason } = z.object({ id: z.coerce.number(), delta: z.coerce.number(), reason: z.string() }).parse(Object.fromEntries(form));
        const r = await adjustCredits(id, delta, reason, admin, await clientIp());
        revalidatePath(`/users/${id}`);
        return `Balance ${r.before} → ${r.after}. The account has been notified.`;
    });
}

export async function sendNotice(_p: ActionState, form: FormData): Promise<ActionState> {
    return wrap(async () => {
        const admin = await requireAdmin();
        const { id, title, message } = z.object({ id: z.coerce.number(), title: z.string().min(3).max(120), message: z.string().min(5).max(2000) }).parse(Object.fromEntries(form));
        await notifyUser(id, { title, message: `${message}\n\n-- ${admin.name}, Gallant`, type: "system", severity: "info" });
        await audit({ adminId: admin.id, action: "user.notify", targetType: "user", targetId: id, after: { title }, ip: await clientIp() });
        const u = await getUser(id);
        const outcome = await sendCustomerEmail(id, emails.notice({ name: u?.name, title, message, adminName: admin.name }), admin);
        return outcome === "sent" ? "Notification sent, and emailed." : "Notification sent on the dashboard; the email did not go (see the Email page).";
    });
}
