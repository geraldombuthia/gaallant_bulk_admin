"use client";

import { useActionState, useState } from "react";
import { send, countAudience, type S } from "./actions";
import { Button, Notice } from "@/components/ui";

const input = "mt-1 block w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] focus:border-brand";
const label = "block text-xs font-semibold text-ink-2";

export function ComposeForm() {
    const [state, action, pending] = useActionState<S, FormData>(send, {});
    const [count, countAction, counting] = useActionState<S, FormData>(countAudience, {});
    const [kind, setKind] = useState<"address" | "user" | "segment">("address");
    return (
        <form className="space-y-2">
            {state.ok && <Notice kind="ok">{state.ok}</Notice>}
            {state.error && <Notice kind="error">{state.error}</Notice>}
            {count.error && <Notice kind="error">{count.error}</Notice>}
            <label className={label}>To
                <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={input}>
                    <option value="address">One email address</option>
                    <option value="user">One account (by id)</option>
                    <option value="segment">A segment of accounts</option>
                </select>
            </label>
            {kind === "address" && <label className={label}>Email<input name="email" type="email" required className={input} /></label>}
            {kind === "user" && <label className={label}>Account id<input name="userId" type="number" min={1} required className={input} /></label>}
            {kind === "segment" && (
                <label className={label}>Segment
                    <select name="segment" defaultValue="paying" className={input}>
                        <option value="paying">Paying accounts</option>
                        <option value="all_active">All active accounts</option>
                        <option value="unpaid">Signed up, never paid</option>
                        <option value="idle30">Paid, nothing sent in 30 days</option>
                        <option value="admins">Admins</option>
                    </select>
                </label>
            )}
            <label className={label}>Subject<input name="subject" required minLength={3} maxLength={200} className={input} placeholder="Use {{name}} for the recipient's name" /></label>
            <label className={label}>Body<textarea name="body" required minLength={10} rows={9} className={input} placeholder={"Plain text. {{name}} and {{email}} are filled per recipient.\n\nAccounts that turned off email notifications are skipped."} /></label>
            <div className="flex items-center gap-2">
                <Button type="submit" formAction={countAction} disabled={counting}>{counting ? "Counting…" : "Count recipients"}</Button>
                {count.preview != null && <span className="text-xs text-ink-2"><b className="tnum">{count.preview}</b> recipient{count.preview === 1 ? "" : "s"}</span>}
                <Button type="submit" formAction={action} kind="primary" disabled={pending} className="ml-auto">{pending ? "Sending…" : "Send"}</Button>
            </div>
            <p className="text-[11px] text-ink-3">Segments are capped at 500 per send and never BCC. Each recipient gets their own message.</p>
        </form>
    );
}
