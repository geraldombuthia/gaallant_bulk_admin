"use client";

import { useActionState } from "react";
import { recordPurchase, saveSettings, saveTarget, importPurchases, type S } from "./actions";
import { Button, Notice } from "@/components/ui";

const input = "mt-1 block w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] focus:border-brand";
const label = "block text-xs font-semibold text-ink-2";
const Msgs = ({ s }: { s: S }) => <>{s.ok && <Notice kind="ok">{s.ok}</Notice>}{s.error && <Notice kind="error">{s.error}</Notice>}</>;

export function PurchaseForm() {
    const [state, action, pending] = useActionState<S, FormData>(recordPurchase, {});
    return (
        <form action={action} className="space-y-2">
            <Msgs s={state} />
            <label className={label}>Date<input name="purchased_at" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={input} /></label>
            <div className="grid grid-cols-2 gap-2">
                <label className={label}>Amount (KSh)<input name="amount_kes" type="number" step="0.01" min="0.01" required className={input} /></label>
                <label className={label}>Units bought<input name="units" type="number" step="1" min="1" required className={input} /></label>
            </div>
            <label className={label}>Reference<input name="reference" maxLength={120} className={input} placeholder="M-Pesa code or invoice" /></label>
            <label className={label}>Note<input name="note" maxLength={500} className={input} /></label>
            <Button type="submit" kind="primary" disabled={pending} className="w-full">{pending ? "Saving…" : "Record purchase"}</Button>
        </form>
    );
}

export function TargetForm({ month }: { month: string }) {
    const [state, action, pending] = useActionState<S, FormData>(saveTarget, {});
    return (
        <form action={action} className="space-y-2">
            <Msgs s={state} />
            <label className={label}>Month<input name="month" type="month" required defaultValue={month} className={input} /></label>
            <div className="grid grid-cols-2 gap-2">
                <label className={label}>Cash (KSh)<input name="cash_kes" type="number" min="0" className={input} /></label>
                <label className={label}>Messages<input name="messages" type="number" min="0" className={input} /></label>
                <label className={label}>New accounts<input name="new_accounts" type="number" min="0" className={input} /></label>
                <label className={label}>Paying accounts<input name="paying_accounts" type="number" min="0" className={input} /></label>
            </div>
            <label className={label}>Note<input name="note" maxLength={300} className={input} /></label>
            <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Save target"}</Button>
        </form>
    );
}

export function SettingsForm({ settings }: { settings: Record<string, string> }) {
    const [state, action, pending] = useActionState<S, FormData>(saveSettings, {});
    return (
        <form action={action} className="space-y-2">
            <Msgs s={state} />
            <div className="grid grid-cols-2 gap-2">
                <label className={label}>Min runway (days)<input name="alert_min_runway_days" type="number" min="1" defaultValue={settings.alert_min_runway_days} className={input} /></label>
                <label className={label}>Min units<input name="alert_min_units" type="number" min="1" defaultValue={settings.alert_min_units} className={input} /></label>
                <label className={label}>Remind every (hours)<input name="alert_interval_hours" type="number" min="1" defaultValue={settings.alert_interval_hours} className={input} /></label>
                <label className={label}>Poll balance every (hours)<input name="balance_poll_interval_hours" type="number" min="1" defaultValue={settings.balance_poll_interval_hours} className={input} /></label>
            </div>
            <label className={label}>Notify admin user ids<input name="alert_recipients" defaultValue={settings.alert_recipients} className={input} placeholder="1,4" /></label>
            <p className="text-xs text-ink-3">Reminders appear as dashboard notifications for these accounts. Email follows once the mailer is working.</p>
            <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Save settings"}</Button>
        </form>
    );
}

export function ImportForm() {
    const [state, action, pending] = useActionState<S, FormData>(() => importPurchases(), {});
    return (
        <form action={action} className="space-y-2">
            <Msgs s={state} />
            <p className="text-xs text-ink-3">Pulls the gateway&apos;s own credit history and records any top-up not already here. Units are exact; KSh is estimated at the configured unit cost until you correct it from the receipt.</p>
            <Button type="submit" disabled={pending} className="w-full">{pending ? "Importing…" : "Import from gateway history"}</Button>
        </form>
    );
}
