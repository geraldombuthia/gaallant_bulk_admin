import Link from "next/link";
import { notFound } from "next/navigation";
import { getMessage } from "@/lib/db/messages";
import { historyFor, warningCount } from "@/lib/db/verdicts";
import { openFor } from "@/lib/db/reviewRequests";
import { review } from "@/lib/compliance";
import { VerdictBadge } from "@/components/verdict";
import { confirmVerdict, warnFromMessage } from "./actions";
import { Button } from "@/components/ui";
import { Card, Dl, StatusBadge, PageHeader, Badge } from "@/components/ui";
import { when } from "@/lib/format";

export const dynamic = "force-dynamic";

function pretty(s: string | null) {
    if (!s) return null;
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const m = await getMessage(Number(id));
    if (!m) notFound();
    const [verdicts, request, warnings] = await Promise.all([historyFor("message", m.id), openFor("message", m.id), warningCount(m.userId)]);
    const flags = review(m.message).filter((f) => f.id !== "no-variables");
    const latest = verdicts[0];
    return (
        <>
            <PageHeader title={`Message #${m.id}`} subtitle={<>to <span className="font-mono">{m.phoneNumber}</span> · {when(m.createdAt)}</>}
                action={<div className="flex gap-2">{m.isTest ? <Badge>sandbox</Badge> : null}<StatusBadge status={m.deliveryStatus} /></div>} />
            {request && (
                <div role="note" className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <b>Human review requested</b> by {request.requested_by} · <span className="whitespace-pre-wrap text-xs">{request.reason}</span>
                </div>
            )}
            <div className="mb-4 grid gap-4 xl:grid-cols-2">
                <Card title={<>Review {latest ? <VerdictBadge verdict={latest.verdict} isHuman={latest.is_human} reviewer={latest.reviewer} confidence={latest.confidence} /> : <Badge>unreviewed</Badge>}</>}>
                    <div className="px-4 py-3">
                        {flags.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{flags.map((f) => <Badge key={f.id} tone={f.severity === "block" ? "danger" : f.severity === "warn" ? "warn" : "neutral"} title={f.detail}>{f.id}</Badge>)}</div>}
                        <form action={confirmVerdict} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="id" value={m.id} />
                            <label className="flex-1 text-xs font-semibold text-ink-2">Note (optional)<input name="note" className="mt-1 block w-full rounded border border-line px-2 py-1 text-sm" /></label>
                            <Button type="submit" name="verdict" value="clean" kind="primary">Confirm clean</Button>
                            <Button type="submit" name="verdict" value="marketing" kind="danger">Confirm marketing</Button>
                        </form>
                        <p className="mt-1 text-[11px] text-ink-3">Your verdict is recorded as human-confirmed and closes any request on this message.</p>
                        {verdicts.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-ink-2">{verdicts.map((v) => <li key={v.id}>{when(v.created_at)} · {v.is_human ? "human" : "AI"} · <b>{v.verdict}</b>{v.confidence != null ? ` ${Math.round(Number(v.confidence) * 100)}%` : ""} · {v.reviewer}{v.note ? ` — ${v.note}` : ""}</li>)}</ul>}
                    </div>
                </Card>
                <Card title={<>Enforcement {warnings > 0 && <Badge tone="warn">{warnings} prior warning{warnings === 1 ? "" : "s"}</Badge>}</>}>
                    <form action={warnFromMessage} className="space-y-2 px-4 py-3">
                        <input type="hidden" name="id" value={m.id} /><input type="hidden" name="userId" value={m.userId} />
                        <label className="block text-xs font-semibold text-ink-2">Warn the account<textarea name="reason" required minLength={10} rows={3} className="mt-1 block w-full rounded border border-line px-2 py-1 text-sm" placeholder="What was wrong with this message. The user reads this." /></label>
                        <div className="flex items-center justify-between"><Button type="submit" kind="warn">Send warning</Button><Link href={`/users/${m.userId}`} className="text-xs text-brand">Suspend from the account page →</Link></div>
                    </form>
                </Card>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
                <Card title="Content"><p className="whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-relaxed">{m.message}</p></Card>
                <Card title="Details">
                    <div className="px-4 py-3">
                        <Dl items={[
                            ["Account", <Link key="u" className="text-brand" href={`/users/${m.userId}`}>{m.owner_name} · {m.owner_email}</Link>],
                            ["Sender ID", m.senderId ?? "—"],
                            ["Gateway status", <StatusBadge key="s" status={m.deliveryStatus} />],
                            ["Gateway reason", m.reason ?? "—"],
                            ["Transaction id", <span key="t" className="font-mono text-xs">{m.transactionId ?? "—"}</span>],
                            ["Provider id", <span key="p" className="font-mono text-xs">{m.providerId ?? "—"}</span>],
                            ["Cost", m.cost ?? "—"],
                            ["Retries", String(m.retryAttempts ?? 0)],
                            ["Delivery report", m.dlrReceivedAt ? `${m.deliveryCode ?? ""} ${m.deliveryDetail ?? ""} · received ${when(m.dlrReceivedAt)}` : "none received"],
                            ["Delivered at", m.deliveredAt ? when(m.deliveredAt) : "—"],
                        ]} />
                    </div>
                </Card>
                <Card title="Provider response"><pre className="overflow-x-auto px-4 py-3 text-xs">{pretty(m.providerResponse) ?? "—"}</pre></Card>
                <Card title="Delivery report payload"><pre className="overflow-x-auto px-4 py-3 text-xs">{pretty(m.dlrPayload) ?? "— none received"}</pre></Card>
            </div>
        </>
    );
}
