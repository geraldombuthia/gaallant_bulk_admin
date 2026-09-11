"use client";

import { useActionState } from "react";
import { recordExpense, type S } from "./actions";
import { Button, Notice } from "@/components/ui";

const input = "mt-1 block w-full rounded border border-line px-2.5 py-1.5 text-sm";
const label = "block text-xs font-semibold text-ink-2";

export function ExpenseForm({ categories }: { categories: string[] }) {
    const [state, action, pending] = useActionState<S, FormData>(recordExpense, {});
    return (
        <form action={action} className="space-y-2">
            {state.ok && <Notice kind="ok">{state.ok}</Notice>}
            {state.error && <Notice kind="error">{state.error}</Notice>}
            <div className="grid grid-cols-2 gap-2">
                <label className={label}>Date<input name="spent_on" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={input} /></label>
                <label className={label}>Category<select name="category" defaultValue="marketing" className={input}>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            </div>
            <label className={label}>Amount (KSh)<input name="amount_kes" type="number" step="0.01" min="0.01" required className={input} /></label>
            <div className="grid grid-cols-2 gap-2">
                <label className={label}>Vendor<input name="vendor" maxLength={120} className={input} placeholder="e.g. Meta Ads" /></label>
                <label className={label}>Reference<input name="reference" maxLength={120} className={input} placeholder="invoice / M-Pesa code" /></label>
            </div>
            <label className={label}>Note<input name="note" maxLength={500} className={input} /></label>
            <Button type="submit" kind="primary" disabled={pending} className="w-full">{pending ? "Saving…" : "Record expense"}</Button>
        </form>
    );
}
