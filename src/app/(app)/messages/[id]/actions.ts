"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { recordVerdict, warnUser } from "@/lib/db/verdicts";
import { resolveForTarget } from "@/lib/db/reviewRequests";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";

/** A human's verdict on a message. Resolves any open review request on it. */
export async function confirmVerdict(form: FormData): Promise<void> {
    const admin = await requireAdmin();
    const id = Number(form.get("id"));
    const verdict = String(form.get("verdict")) as "clean" | "marketing" | "unsure";
    const note = String(form.get("note") ?? "").trim() || null;
    await recordVerdict({ targetType: "message", targetId: id, verdict, is_human: true, reviewer: admin.name, reviewer_id: admin.id, note });
    await resolveForTarget("message", id, `Human verdict: ${verdict}`, admin.id);
    await audit({ adminId: admin.id, action: `verdict.${verdict}`, targetType: "message", targetId: id, reason: note, ip: await clientIp() });
    revalidatePath(`/messages/${id}`); revalidatePath("/messages"); revalidatePath("/reviews");
}

export async function warnFromMessage(form: FormData): Promise<void> {
    const admin = await requireAdmin();
    const id = Number(form.get("id")); const userId = Number(form.get("userId"));
    await warnUser(userId, String(form.get("reason") ?? ""), admin, await clientIp(), [id]);
    revalidatePath(`/messages/${id}`);
}
