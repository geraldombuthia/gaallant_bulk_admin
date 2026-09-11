"use client";

import { useActionState } from "react";
import { savePricing, type PricingState } from "./actions";
import { Button, Notice } from "@/components/ui";
import type { PricingRow } from "@/lib/db/types";

const input = "mt-1 block w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] tnum focus:border-brand";
const label = "block text-[11px] font-semibold uppercase tracking-wider text-ink-3";

export function PricingForm({ current }: { current: PricingRow | null }) {
    const [state, action, pending] = useActionState<PricingState, FormData>(savePricing, {});
    const c = current;
    return (
        <form action={action} className="space-y-3">
            {state.ok && <Notice kind="ok">{state.ok}</Notice>}
            {state.error && <Notice kind="error">{state.error}</Notice>}
            <p className="text-xs text-ink-2">Prices must fall with volume and tiers must not overlap. Purchases in flight keep the price they were quoted.</p>
            {([1, 2, 3] as const).map((t) => (
                <fieldset key={t} className="grid grid-cols-3 gap-2 rounded border border-line p-2">
                    <legend className="px-1 text-xs font-semibold">Tier {t}</legend>
                    <label className={label}>Min<input name={`t${t}min`} type="number" min={0} defaultValue={c?.[`tier${t}Min`]} required className={input} /></label>
                    <label className={label}>Max<input name={`t${t}max`} type="number" min={0} defaultValue={c?.[`tier${t}Max`]} required className={input} /></label>
                    <label className={label}>KSh / SMS<input name={`t${t}price`} type="number" step="0.01" min={0.01} defaultValue={c?.[`tier${t}Price`]} required className={input} /></label>
                </fieldset>
            ))}
            <label className={label}>First top-up minimum (KSh)<input name="fee" type="number" min={0} defaultValue={c?.registrationFee} required className={input} /></label>
            <label className={label}>Reason<input name="reason" required minLength={10} className={input} placeholder="e.g. Safaricom wholesale rate change effective 1 Oct" /></label>
            <Button type="submit" kind="danger" disabled={pending} className="w-full">{pending ? "Saving…" : "Publish new prices"}</Button>
        </form>
    );
}
