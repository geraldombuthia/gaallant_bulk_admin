"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { warnUser } from "@/lib/db/verdicts";
import { setStatus } from "@/lib/db/users";
import { clientIp } from "@/lib/request";

export async function warnAccount(form: FormData): Promise<void> {
    const admin = await requireAdmin();
    const ids = String(form.get("messageIds") ?? "").split(",").map(Number).filter(Boolean);
    await warnUser(Number(form.get("userId")), String(form.get("reason") ?? ""), admin, await clientIp(), ids);
    revalidatePath("/compliance");
}
export async function suspendAccount(form: FormData): Promise<void> {
    const admin = await requireAdmin();
    await setStatus(Number(form.get("userId")), "suspended", String(form.get("reason") ?? ""), admin, await clientIp());
    revalidatePath("/compliance"); revalidatePath("/users");
}
