"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { addPurchase, deletePurchase, setSetting, setTarget, pollProviderBalance } from "@/lib/db/provider";
import { runAlertCheck } from "@/lib/alerts";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/request";

export type S = { ok?: string; error?: string };
const wrap = async (fn: () => Promise<string>): Promise<S> => { try { return { ok: await fn() }; } catch (e) { return { error: e instanceof Error ? e.message : "Failed" }; } };
const opt = (v: FormDataEntryValue | null) => (v == null || String(v).trim() === "" ? null : Number(v));

export async function recordPurchase(_p: S, form: FormData): Promise<S> {
    return wrap(async () => {
        const admin = await requireAdmin();
        const d = z.object({ purchased_at: z.string(), amount_kes: z.coerce.number(), units: z.coerce.number(), reference: z.string().max(120).optional(), note: z.string().max(500).optional() }).parse(Object.fromEntries(form));
        await addPurchase(d, admin, await clientIp());
        revalidatePath("/usage");
        return `Recorded ${d.units.toLocaleString()} units for KSh ${d.amount_kes.toLocaleString()}.`;
    });
}
export async function removePurchase(form: FormData) {
    const admin = await requireAdmin();
    await deletePurchase(Number(form.get("id")), admin, await clientIp());
    revalidatePath("/usage");
}
export async function saveSettings(_p: S, form: FormData): Promise<S> {
    return wrap(async () => {
        const admin = await requireAdmin();
        const keys = ["alert_min_runway_days", "alert_min_units", "alert_interval_hours", "alert_recipients", "balance_poll_interval_hours"];
        const changed: Record<string, string> = {};
        for (const k of keys) {
            const v = String(form.get(k) ?? "").trim();
            if (!v) continue;
            if (k !== "alert_recipients" && !(Number(v) > 0)) throw new Error(`${k} must be a positive number`);
            await setSetting(k, v, admin.id); changed[k] = v;
        }
        await audit({ adminId: admin.id, action: "settings.alerts", targetType: "settings", after: changed, ip: await clientIp() });
        revalidatePath("/usage");
        return "Alert settings saved.";
    });
}
export async function saveTarget(_p: S, form: FormData): Promise<S> {
    return wrap(async () => {
        const admin = await requireAdmin();
        const month = String(form.get("month") ?? "");
        await setTarget({ month, cash_kes: opt(form.get("cash_kes")), messages: opt(form.get("messages")), new_accounts: opt(form.get("new_accounts")), paying_accounts: opt(form.get("paying_accounts")), note: String(form.get("note") ?? "").trim() || null }, admin, await clientIp());
        revalidatePath("/usage"); revalidatePath("/finance");
        return `Target for ${month} saved.`;
    });
}
export async function pollNow(): Promise<void> {
    await requireAdmin();
    await pollProviderBalance();
    revalidatePath("/usage");
}
export async function checkNow(): Promise<void> {
    await requireAdmin();
    await runAlertCheck(true);
    revalidatePath("/usage");
}
