"use client";

import { useActionState } from "react";
import { changeStatus, changeRole, adjust, sendNotice, type ActionState } from "./actions";
import { Button, Notice } from "@/components/ui";

const input = "mt-1 block w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] focus:border-brand";
const label = "block text-xs font-semibold text-ink-2";

function Msgs({ s }: { s: ActionState }) {
    return <>{s.ok && <Notice kind="ok">{s.ok}</Notice>}{s.error && <Notice kind="error">{s.error}</Notice>}</>;
}

export function StatusForm({ id, current, disabled }: { id: number; current: string; disabled: boolean }) {
    const [state, action, pending] = useActionState<ActionState, FormData>(changeStatus, {});
    return (
        <form action={action} className="space-y-2">
            <Msgs s={state} />
            <input type="hidden" name="id" value={id} />
            <label className={label}>New status
                <select name="status" defaultValue={current} className={input} disabled={disabled}>
                    <option value="active">Active</option><option value="suspended">Suspended — keys refused, can sign in</option><option value="banned">Banned — everything refused</option>
                </select>
            </label>
            <label className={label}>Reason (goes in the audit log)<input name="reason" required minLength={5} className={input} disabled={disabled} placeholder="e.g. chargeback on payment #42" /></label>
            <Button type="submit" kind="warn" disabled={pending || disabled} className="w-full">{disabled ? "Not available for this account" : pending ? "Saving…" : "Change status"}</Button>
        </form>
    );
}

export function CreditsForm({ id, balance }: { id: number; balance: number }) {
    const [state, action, pending] = useActionState<ActionState, FormData>(adjust, {});
    return (
        <form action={action} className="space-y-2">
            <Msgs s={state} />
            <input type="hidden" name="id" value={id} />
            <p className="text-xs text-ink-3">Current balance <b className="tnum text-ink">{balance.toLocaleString()}</b>. Positive adds, negative removes. Recorded in the ledger as an adjustment and the account is notified.</p>
            <label className={label}>Credits<input name="delta" type="number" step="1" required className={input} placeholder="e.g. 50 or -20" /></label>
            <label className={label}>Reason<input name="reason" required minLength={10} className={input} placeholder="e.g. goodwill for gateway outage on 10 Sep" /></label>
            <Button type="submit" kind="primary" disabled={pending} className="w-full">{pending ? "Saving…" : "Apply adjustment"}</Button>
        </form>
    );
}

export function NoticeForm({ id }: { id: number }) {
    const [state, action, pending] = useActionState<ActionState, FormData>(sendNotice, {});
    return (
        <form action={action} className="space-y-2">
            <Msgs s={state} />
            <input type="hidden" name="id" value={id} />
            <label className={label}>Title<input name="title" required minLength={3} maxLength={120} className={input} /></label>
            <label className={label}>Message<textarea name="message" required minLength={5} rows={4} className={input} /></label>
            <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending…" : "Send to dashboard"}</Button>
        </form>
    );
}

export function RoleForm({ id, current, disabled }: { id: number; current: string; disabled: boolean }) {
    const [state, action, pending] = useActionState<ActionState, FormData>(changeRole, {});
    return (
        <form action={action} className="space-y-2">
            <Msgs s={state} />
            <input type="hidden" name="id" value={id} />
            <label className={label}>Role
                <select name="role" defaultValue={current} className={input} disabled={disabled}><option value="user">User</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select>
            </label>
            <label className={label}>Reason<input name="reason" required minLength={5} className={input} disabled={disabled} /></label>
            <Button type="submit" kind="danger" disabled={pending || disabled} className="w-full">{disabled ? "Cannot change your own role" : pending ? "Saving…" : "Change role"}</Button>
        </form>
    );
}
