"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { decide, setActive, type Decision } from "@/lib/db/templates";
import { clientIp } from "@/lib/request";

export type ReviewState = { ok?: string; error?: string };

const schema = z.object({
    id: z.coerce.number().int().positive(),
    decision: z.enum(["approve", "reject", "changes"]),
    note: z.string().max(2000).default(""),
});

export async function reviewTemplate(_prev: ReviewState, form: FormData): Promise<ReviewState> {
    try {
        const admin = await requireAdmin();
        const { id, decision, note } = schema.parse({
            id: form.get("id"), decision: form.get("decision"), note: form.get("note") ?? "",
        });
        const result = await decide(id, decision as Decision, note, admin, await clientIp());
        revalidatePath("/templates");
        revalidatePath(`/templates/${id}`);
        const said = { approved: "Approved. The owner has been told and can send with it now.",
            rejected: "Rejected. The owner has been sent your reason.",
            changes_requested: "Sent back. The owner has your note and the template returns to review when they edit it." };
        return { ok: said[result.status] };
    } catch (error) {
        return { error: error instanceof Error ? error.message : "Something went wrong" };
    }
}

export async function toggleActive(form: FormData): Promise<void> {
    const admin = await requireAdmin();
    const id = Number(form.get("id"));
    const active = form.get("active") === "1";
    await setActive(id, active, admin, await clientIp());
    revalidatePath(`/templates/${id}`);
}
