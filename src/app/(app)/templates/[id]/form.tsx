"use client";

import { useActionState, useState } from "react";
import { reviewTemplate, type ReviewState } from "./actions";
import type { Flag } from "@/lib/compliance";
import { Button, Notice } from "@/components/ui";

type Decision = "approve" | "changes" | "reject";

/**
 * Three outcomes. Approve needs no note. Changes and reject need one, and
 * it goes to the user verbatim -- so the flags offer their suggestion text
 * with one click, and the reviewer edits from there rather than composing
 * the same explanation for the tenth time.
 */
export function ReviewForm({ id, flags }: { id: number; flags: Flag[] }) {
    const [state, action, pending] = useActionState<ReviewState, FormData>(reviewTemplate, {});
    const [decision, setDecision] = useState<Decision>(flags.some((f) => f.severity === "block") ? "changes" : "approve");
    const [note, setNote] = useState("");

    const add = (text: string) => setNote((n) => (n.trim() ? `${n.trim()}\n\n${text}` : text));
    const needsNote = decision !== "approve";

    return (
        <form action={action} className="space-y-3">
            {state.ok && <Notice kind="ok">{state.ok}</Notice>}
            {state.error && <Notice kind="error">{state.error}</Notice>}
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="decision" value={decision} />

            <div className="grid grid-cols-3 gap-1 rounded border border-line p-1 text-xs font-semibold">
                {([["approve", "Approve", "text-emerald-800 bg-emerald-50"], ["changes", "Request changes", "text-amber-800 bg-amber-50"], ["reject", "Reject", "text-red-800 bg-red-50"]] as const).map(([d, label, cls]) => (
                    <button key={d} type="button" onClick={() => setDecision(d)}
                        className={`rounded px-2 py-1.5 ${decision === d ? cls : "text-ink-3 hover:bg-gray-50"}`}>{label}</button>
                ))}
            </div>

            <p className="text-xs text-ink-2">
                {decision === "approve" && "The template becomes sendable through the API immediately. Approved templates cannot be edited by the owner."}
                {decision === "changes" && "The owner gets your note, edits the template, and it comes back to this queue automatically. Use this when the intent is transactional but something specific must go."}
                {decision === "reject" && "The owner gets your reason. Use this when the message is promotional in intent, not just in wording — they can still edit and resubmit."}
            </p>

            {needsNote && (
                <>
                    <label className="block text-xs font-semibold text-ink-2">
                        Message to the owner
                        <textarea name="note" value={note} onChange={(e) => setNote(e.target.value)} rows={7} required minLength={10}
                            placeholder={decision === "changes" ? "What must change, and why. Be specific: name the words or the link." : "Why this cannot go through the transactional route."}
                            className="mt-1 block w-full rounded border border-line px-3 py-2 text-sm leading-relaxed" />
                    </label>
                    {flags.length > 0 && (
                        <div>
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Insert from a flag</div>
                            <div className="flex flex-wrap gap-1">
                                {flags.map((f) => (
                                    <button key={f.id} type="button" onClick={() => add(f.suggestion)}
                                        className="rounded border border-line bg-white px-2 py-1 text-left text-xs text-ink-2 hover:bg-gray-50">
                                        + {f.title.split(":")[0]}
                                    </button>
                                ))}
                                <button type="button" onClick={() => add("This sender ID is registered for transactional messages only: confirmations, receipts, one-time codes, alerts and status updates about something the recipient initiated. Marketing, offers and announcements cannot go through it.")}
                                    className="rounded border border-line bg-white px-2 py-1 text-left text-xs text-ink-2 hover:bg-gray-50">+ Transactional-only policy</button>
                            </div>
                        </div>
                    )}
                </>
            )}
            {!needsNote && <input type="hidden" name="note" value="" />}

            <Button type="submit" disabled={pending} kind={decision === "approve" ? "primary" : decision === "reject" ? "danger" : "warn"} className="w-full">
                {pending ? "Saving…" : decision === "approve" ? "Approve template" : decision === "changes" ? "Send back with note" : "Reject with reason"}
            </Button>
        </form>
    );
}
