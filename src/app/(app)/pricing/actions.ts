"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/auth/session";
import { updatePricing } from "@/lib/db/misc";
import { clientIp } from "@/lib/request";

export type PricingState = { ok?: string; error?: string };
const n = z.coerce.number();

export async function savePricing(_p: PricingState, form: FormData): Promise<PricingState> {
    try {
        const admin = await requireSuperadmin();
        const d = Object.fromEntries(form);
        const p = z.object({ fee: n, t1min: n, t1max: n, t1price: n, t2min: n, t2max: n, t2price: n, t3min: n, t3max: n, t3price: n, reason: z.string() }).parse(d);
        await updatePricing({ registrationFee: p.fee, t1: [p.t1min, p.t1max, p.t1price], t2: [p.t2min, p.t2max, p.t2price], t3: [p.t3min, p.t3max, p.t3price] }, p.reason, admin, await clientIp());
        revalidatePath("/pricing");
        return { ok: "New price ladder is live. The old row is kept with its end date." };
    } catch (e) { return { error: e instanceof Error ? e.message : "Failed" }; }
}
