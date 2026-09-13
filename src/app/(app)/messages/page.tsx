import Link from "next/link";
import { listMessages, statusBreakdown } from "@/lib/db/messages";
import { paging } from "@/lib/db/pool";
import { Card, Table, Td, StatusBadge, Pager, Filters, Field, inputCls, Empty, PageHeader, Badge } from "@/components/ui";
import { when, truncate } from "@/lib/format";
import type { ReviewFilter } from "@/lib/db/verdicts";
import { VerdictBadge } from "@/components/verdict";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages" };

type SP = { q?: string; status?: string; mode?: string; user?: string; from?: string; to?: string; dlr?: string; review?: string; purpose?: string; page?: string };

export default async function Messages({ searchParams }: { searchParams: Promise<SP> }) {
    const sp = await searchParams;
    const f = { q: sp.q, status: sp.status, mode: sp.mode as "live" | "test" | undefined, user: sp.user, from: sp.from, to: sp.to, dlr: sp.dlr as "received" | "none" | undefined, review: (sp.review || undefined) as ReviewFilter | undefined, purpose: (sp.purpose || undefined) as "customer" | "internal" | undefined };
    const { page, size, offset } = paging(sp, 50);
    const [{ rows, total }, breakdown] = await Promise.all([listMessages(f, size, offset), statusBreakdown(f)]);
    const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();

    return (
        <>
            <PageHeader title="Messages" subtitle="Every SMS through the platform, live and sandbox."
                action={<Link href={`/messages/export?${qs}`} className="rounded border border-line bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-surface-2">Export CSV (current filter)</Link>} />

            <Filters reset="/messages">
                <Field label="Search"><input name="q" defaultValue={sp.q} placeholder="phone, content, transaction id" className={`${inputCls} w-56`} /></Field>
                <Field label="Account"><input name="user" defaultValue={sp.user} placeholder="id or email" className={`${inputCls} w-40`} /></Field>
                <Field label="Status">
                    <select name="status" defaultValue={sp.status ?? ""} className={inputCls}>
                        <option value="">Any</option>
                        {["success", "delivered", "pending", "sent", "failed", "error", "rejected"].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </Field>
                <Field label="Mode">
                    <select name="mode" defaultValue={sp.mode ?? ""} className={inputCls}><option value="">Any</option><option value="live">Live</option><option value="test">Sandbox</option></select>
                </Field>
                <Field label="Paid by">
                    <select name="purpose" defaultValue={sp.purpose ?? ""} className={inputCls}><option value="">Any</option><option value="customer">Customer (billed)</option><option value="internal">The app (running cost)</option></select>
                </Field>
                <Field label="Delivery report">
                    <select name="dlr" defaultValue={sp.dlr ?? ""} className={inputCls}><option value="">Any</option><option value="received">Received</option><option value="none">None</option></select>
                </Field>
                <Field label="Review">
                    <select name="review" defaultValue={sp.review ?? ""} className={inputCls}>
                        <option value="">Any</option>
                        <option value="unreviewed">Unreviewed</option>
                        <option value="any_flagged">Flagged (AI or human)</option>
                        <option value="ai_flagged">AI flagged, unconfirmed</option>
                        <option value="ai_unsure">AI unsure</option>
                        <option value="ai_clean">AI clean</option>
                        <option value="human_flagged">Human confirmed marketing</option>
                        <option value="human_clean">Human confirmed clean</option>
                    </select>
                </Field>
                <Field label="From"><input type="date" name="from" defaultValue={sp.from} className={inputCls} /></Field>
                <Field label="To"><input type="date" name="to" defaultValue={sp.to} className={inputCls} /></Field>
            </Filters>

            <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
                <span className="text-ink-3">In this filter:</span>
                {breakdown.map((b) => <span key={b.deliveryStatus ?? "null"} className="inline-flex items-center gap-1"><StatusBadge status={b.deliveryStatus} /><span className="tnum text-ink-3">{Number(b.n).toLocaleString()}</span></span>)}
            </div>

            <Card>
                {rows.length === 0 ? <Empty>No messages match.</Empty> : (
                    <Table head={["Sent", "To", "Message", "Account", "Status", "Review", "Report", "Cost"]}>
                        {rows.map((m) => (
                            <tr key={m.id} className="hover:bg-surface-2/60">
                                <Td className="whitespace-nowrap"><Link href={`/messages/${m.id}`} className="text-brand hover:underline">{when(m.createdAt)}</Link></Td>
                                <Td mono>{m.phoneNumber}<div className="flex gap-1">{m.isTest ? <Badge>sandbox</Badge> : null}{m.purpose === "internal" ? <Badge tone="warn">app</Badge> : null}</div></Td>
                                <Td className="max-w-md [overflow-wrap:anywhere]"><span className="text-xs">{truncate(m.message, 110)}</span></Td>
                                <Td><Link href={`/users/${m.userId}`} className="text-brand hover:underline">{m.owner_name}</Link></Td>
                                <Td><StatusBadge status={m.deliveryStatus} />{m.reason && <div className="mt-0.5 max-w-[12rem] truncate text-[11px] text-ink-3" title={m.reason}>{m.reason}</div>}</Td>
                                <Td><VerdictBadge verdict={m.review_verdict} isHuman={m.review_is_human} reviewer={m.review_reviewer} confidence={m.review_confidence} /></Td>
                                <Td className="text-xs">{m.dlrReceivedAt ? <span title={when(m.dlrReceivedAt)}>{m.deliveryCode ?? "—"} {m.deliveryDetail ? <span className="text-ink-3">· {truncate(m.deliveryDetail, 30)}</span> : null}</span> : <span className="text-ink-3">—</span>}</Td>
                                <Td className="text-right">{m.cost ?? <span className="text-ink-3">—</span>}</Td>
                            </tr>
                        ))}
                    </Table>
                )}
                <Pager page={page} size={size} total={total} params={{ ...sp, page: undefined }} />
            </Card>
        </>
    );
}
