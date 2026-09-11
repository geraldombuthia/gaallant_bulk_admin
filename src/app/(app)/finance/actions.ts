"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { addExpense, deleteExpense, CATEGORIES } from "@/lib/db/expenses";
import { clientIp } from "@/lib/request";

export type S = { ok?: string; error?: string };

export async function recordExpense(_p: S, form: FormData): Promise<S> {
    try {
        const admin = await requireAdmin();
        const d = z.object({ spent_on: z.string(), category: z.enum(CATEGORIES), amount_kes: z.coerce.number(), vendor: z.string().max(120).optional(), reference: z.string().max(120).optional(), note: z.string().max(500).optional() }).parse(Object.fromEntries(form));
        await addExpense(d, admin, await clientIp());
        revalidatePath("/finance");
        return { ok: `Recorded KSh ${d.amount_kes.toLocaleString()} under ${d.category}.` };
    } catch (e) { return { error: e instanceof Error ? e.message : "Failed" }; }
}
export async function removeExpense(form: FormData) {
    const admin = await requireAdmin();
    await deleteExpense(Number(form.get("id")), admin, await clientIp());
    revalidatePath("/finance");
}
