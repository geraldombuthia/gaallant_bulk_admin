"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { resolveReview } from "@/lib/db/reviewRequests";
import { clientIp } from "@/lib/request";

export async function closeRequest(form: FormData) {
    const admin = await requireAdmin();
    const id = Number(form.get("id"));
    const status = form.get("status") === "dismissed" ? "dismissed" : "resolved";
    await resolveReview(id, status, String(form.get("resolution") ?? ""), admin, await clientIp());
    revalidatePath("/reviews"); revalidatePath("/templates");
}
