"use client";

import { useActionState } from "react";
import { sendReply, type ReplyState } from "./actions";
import { Button, Notice } from "@/components/ui";

export function ReplyForm({ id }: { id: number }) {
    const [state, action, pending] = useActionState<ReplyState, FormData>(sendReply, {});
    return (
        <form action={action} className="space-y-2">
            {state.ok && <Notice kind="ok">{state.ok}</Notice>}
            {state.error && <Notice kind="error">{state.error}</Notice>}
            <input type="hidden" name="id" value={id} />
            <textarea name="body" rows={5} required minLength={2} className="block w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] leading-relaxed focus:border-brand" placeholder="Write to the user. Plain language; they see exactly this." />
            <Button type="submit" kind="primary" disabled={pending}>{pending ? "Sending…" : "Send reply"}</Button>
        </form>
    );
}
