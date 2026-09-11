"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { reply, setSupportStatus, setPriority } from "@/lib/db/support";
import { clientIp } from "@/lib/request";

export type ReplyState = { ok?: string; error?: string };

export async function sendReply(_p: ReplyState, form: FormData): Promise<ReplyState> {
    try {
        const admin = await requireAdmin();
        const id = Number(form.get("id"));
        await reply(id, String(form.get("body") ?? ""), admin, await clientIp());
        revalidatePath(`/support/${id}`); revalidatePath("/support");
        return { ok: "Reply sent. The user sees it on their support page and in notifications." };
    } catch (e) { return { error: e instanceof Error ? e.message : "Failed" }; }
}

export async function changeStatus(form: FormData) {
    const admin = await requireAdmin();
    const id = Number(form.get("id"));
    await setSupportStatus(id, form.get("status") === "closed" ? "closed" : "open", admin, await clientIp());
    revalidatePath(`/support/${id}`); revalidatePath("/support");
}

export async function changePriority(form: FormData) {
    const admin = await requireAdmin();
    const id = Number(form.get("id"));
    await setPriority(id, form.get("priority") === "high" ? "high" : "normal", admin, await clientIp());
    revalidatePath(`/support/${id}`); revalidatePath("/support");
}
