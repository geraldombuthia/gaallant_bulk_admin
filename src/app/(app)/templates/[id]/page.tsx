import Link from "next/link";
import { notFound } from "next/navigation";
import { getTemplate, ownerTemplates, reviewHistory } from "@/lib/db/templates";
import { getUser } from "@/lib/db/users";
import { openFor } from "@/lib/db/reviewRequests";
import { review, segments, worst } from "@/lib/compliance";
import { Card, Dl, StatusBadge, Badge, PageHeader, Table, Td, Empty, Button } from "@/components/ui";
import { when, ago, num } from "@/lib/format";
import { ReviewForm } from "./form";
import { toggleActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const t = await getTemplate(Number(id));
    if (!t) notFound();
    const [owner, siblings, history, request] = await Promise.all([getUser(t.userId), ownerTemplates(t.userId, t.id), reviewHistory(t.id), openFor("template", t.id)]);

    const flags = review(t.msg_content);
    const seg = segments(t.msg_content);
    const vars = Array.isArray(t.variables) ? t.variables : [];
    const w = worst(flags);

    // Highlight placeholders in the body so the reviewer sees structure
    const parts = t.msg_content.split(/(\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\})/g);

    return (
        <>
            <PageHeader
                title={t.template_name}
                subtitle={<><span className="font-mono">{t.slug}</span> · {t.type} · submitted {when(t.createdAt)} by <Link className="text-brand" href={`/users/${t.userId}`}>{t.owner_name}</Link></>}
                action={<div className="flex items-center gap-2"><StatusBadge status={t.status} />{!t.active && <Badge>inactive</Badge>}</div>}
            />

            {request && (
                <div role="note" className="mb-4 rounded border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">
                    <b>Human review requested</b> by {request.requested_by}{request.confidence != null ? ` (confidence ${Math.round(Number(request.confidence) * 100)}%)` : ""} · {ago(request.created_at)}
                    <p className="mt-1 whitespace-pre-wrap text-xs">{request.reason}</p>
                    <p className="mt-1 text-xs">Your decision below resolves this request.</p>
                </div>
            )}
            <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
                <div className="space-y-4">
                    <Card title="Message">
                        <div className="px-4 py-3">
                            <p className="whitespace-pre-wrap rounded border border-line bg-surface-2 px-3 py-2.5 font-mono text-[13px] leading-relaxed">
                                {parts.map((p, i) => /^\{\{/.test(p)
                                    ? <mark key={i} className="rounded bg-brand-soft px-0.5 text-brand-strong">{p}</mark>
                                    : <span key={i}>{p}</span>)}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                                <span><b className="tnum text-ink">{seg.characters}</b> characters</span>
                                <span><b className="tnum text-ink">{seg.segments}</b> segment{seg.segments === 1 ? "" : "s"} · {seg.encoding.toUpperCase()}</span>
                                <span><b className="tnum text-ink">{vars.length}</b> variable{vars.length === 1 ? "" : "s"}{vars.length > 0 && <>: {vars.map((v) => <code key={v} className="ml-1 rounded bg-surface-3 px-1">{v}</code>)}</>}</span>
                            </div>
                        </div>
                    </Card>

                    <Card title={<>Transactional review aids {w === "clean" ? <Badge tone="success">no flags</Badge> : <Badge tone={w === "block" ? "danger" : w === "warn" ? "warn" : "neutral"}>{flags.length} flag{flags.length === 1 ? "" : "s"}</Badge>}</>}>
                        {flags.length === 0 ? (
                            <Empty>Nothing in this message reads as promotional. That is a prompt, not a verdict — read it once more against what the account actually does.</Empty>
                        ) : (
                            <ul className="divide-y divide-line">
                                {flags.map((f) => (
                                    <li key={f.id} className="px-4 py-2.5">
                                        <div className="flex items-start gap-2">
                                            <Badge tone={f.severity === "block" ? "danger" : f.severity === "warn" ? "warn" : "neutral"}>{f.severity}</Badge>
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium">{f.title}</div>
                                                {f.match && <div className="mt-0.5 font-mono text-xs text-ink-3">matched: {f.match}</div>}
                                                <div className="mt-0.5 text-xs text-ink-2">{f.detail}</div>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    {t.rejection_reason && t.status !== "approved" && (
                        <Card title="Current reviewer note (visible to the owner)">
                            <p className="whitespace-pre-wrap px-4 py-3 text-sm">{t.rejection_reason}</p>
                        </Card>
                    )}

                    <Card title="Review history">
                        {history.length === 0 ? <Empty>No decisions recorded yet.</Empty> : (
                            <Table head={["When", "Admin", "Action", "Note"]}>
                                {history.map((h) => (
                                    <tr key={h.id}>
                                        <Td className="whitespace-nowrap">{when(h.created_at)}</Td>
                                        <Td>{h.admin_name}</Td>
                                        <Td><StatusBadge status={h.action.replace("template.", "") === "changes" ? "changes_requested" : h.action.replace("template.", "") === "approve" ? "approved" : h.action.replace("template.", "") === "reject" ? "rejected" : h.action} /></Td>
                                        <Td className="max-w-md whitespace-pre-wrap text-xs">{h.reason ?? ""}</Td>
                                    </tr>
                                ))}
                            </Table>
                        )}
                    </Card>
                </div>

                <div className="space-y-4">
                    <Card title="Decision">
                        <div className="px-4 py-3">
                            {t.status === "approved" ? (
                                <p className="text-sm text-ink-2">Approved {t.reviewed_at ? ago(t.reviewed_at) : ""}{t.reviewer_name ? ` by ${t.reviewer_name}` : ""}. Approved templates are immutable; to withdraw one, deactivate it below.</p>
                            ) : (
                                <ReviewForm id={t.id} flags={flags} />
                            )}
                        </div>
                    </Card>

                    <Card title="Owner">
                        <div className="px-4 py-3">
                            <Dl items={[
                                ["Account", <Link key="a" className="text-brand" href={`/users/${t.userId}`}>{owner?.name}</Link>],
                                ["Email", owner?.email ?? "—"],
                                ["Status", <StatusBadge key="s" status={owner?.statuc} />],
                                ["Balance", `${num(owner?.balance ?? 0)} credits`],
                                ["Sent · 30d", num(owner?.messages_30d ?? 0)],
                                ["Since", owner?.registered_at ? when(owner.registered_at) : "not yet paid"],
                            ]} />
                        </div>
                        {siblings.length > 0 && (
                            <div className="border-t border-line px-4 py-2.5">
                                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Other templates</div>
                                <ul className="space-y-1 text-xs">
                                    {siblings.map((s) => (
                                        <li key={s.id} className="flex items-center justify-between gap-2">
                                            <Link href={`/templates/${s.id}`} className="truncate text-brand hover:underline">{s.template_name}</Link>
                                            <StatusBadge status={s.status} />
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </Card>

                    <Card title="Availability">
                        <form action={toggleActive} className="flex items-center justify-between px-4 py-3 text-sm">
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="active" value={t.active ? "0" : "1"} />
                            <span className="text-ink-2">{t.active ? "Active — usable for sending if approved." : "Inactive — cannot be sent even if approved."}</span>
                            <Button kind={t.active ? "warn" : "primary"} type="submit">{t.active ? "Deactivate" : "Activate"}</Button>
                        </form>
                    </Card>
                </div>
            </div>
        </>
    );
}
