"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { sendBatch, audienceCount, type Audience } from "@/lib/email";
import { clientIp } from "@/lib/request";

export type S = { ok?: string; error?: string; preview?: number };

function audienceFrom(form: FormData): Audience {
    const kind = String(form.get("kind"));
    if (kind === "address") return { kind, email: z.string().email().parse(String(form.get("email") ?? "").trim()) };
    if (kind === "user") return { kind, userId: z.coerce.number().int().positive().parse(form.get("userId")) };
    return { kind: "segment", segment: z.enum(["all_active", "paying", "unpaid", "idle30", "admins"]).parse(form.get("segment")) };
}

export async function countAudience(_p: S, form: FormData): Promise<S> {
    try { await requireAdmin(); return { preview: await audienceCount(audienceFrom(form)) }; }
    catch (e) { return { error: e instanceof Error ? e.message : "Failed" }; }
}

export async function send(_p: S, form: FormData): Promise<S> {
    try {
        const admin = await requireAdmin();
        const a = audienceFrom(form);
        const r = await sendBatch(a, String(form.get("subject") ?? ""), String(form.get("body") ?? ""), admin, await clientIp());
        revalidatePath("/email");
        return { ok: `${r.sent} sent, ${r.failed} failed of ${r.recipients}. Batch ${r.batchId.slice(0, 8)}.` };
    } catch (e) { return { error: e instanceof Error ? e.message : "Failed" }; }
}
