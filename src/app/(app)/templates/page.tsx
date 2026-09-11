import Link from "next/link";
import { listTemplates, countByStatus } from "@/lib/db/templates";
import { openCount } from "@/lib/db/reviewRequests";
import { paging } from "@/lib/db/pool";
import type { TemplateStatus } from "@/lib/db/types";
import { Card, Table, Td, StatusBadge, Pager, Filters, Field, inputCls, Empty, PageHeader, Badge } from "@/components/ui";
import { ago, truncate } from "@/lib/format";
import { review, worst } from "@/lib/compliance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Templates" };

type SP = { status?: string; q?: string; type?: string; page?: string; human?: string };

export default async function Templates({ searchParams }: { searchParams: Promise<SP> }) {
    const sp = await searchParams;
    const status = (sp.status ?? "pending") as TemplateStatus | "all";
    const { page, size, offset } = paging(sp);
    const human = sp.human === "1";
    const [{ rows, total }, counts, humanOpen] = await Promise.all([
        listTemplates({ status: human ? "all" : status, q: sp.q, type: sp.type as "global" | "private" | undefined, humanReview: human }, size, offset),
        countByStatus(), openCount(),
    ]);

    const tabs: [TemplateStatus | "all", string, number][] = [
        ["pending", "Awaiting review", counts.pending],
        ["changes_requested", "Changes requested", counts.changes_requested],
        ["approved", "Approved", counts.approved],
        ["rejected", "Rejected", counts.rejected],
        ["all", "All", counts.pending + counts.approved + counts.rejected + counts.changes_requested],
    ];

    return (
        <>
            <PageHeader title="Templates" subtitle="Every message through the transactional route is one of these. Review is the control." />

            <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
                {tabs.map(([s, label, n]) => (
                    <Link key={s} href={`/templates?status=${s}`}
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${!human && status === s ? "bg-brand-soft text-brand-strong" : "text-ink-2 hover:bg-surface-2"}`}>
                        {label} <span className="tnum opacity-70">{n}</span>
                    </Link>
                ))}
                <Link href="/templates?human=1" className={`ml-auto rounded-md px-3 py-1 text-xs font-semibold ${human ? "bg-warn-soft text-warn ring-1 ring-warn/40" : "text-warn hover:bg-warn-soft"}`}>
                    Human review requested <span className="tnum opacity-70">{humanOpen}</span>
                </Link>
            </div>

            <Filters reset={`/templates?status=${status}`}>
                <input type="hidden" name="status" value={status} />
                {human && <input type="hidden" name="human" value="1" />}
                <Field label="Search"><input name="q" defaultValue={sp.q} placeholder="name, slug, content, owner" className={`${inputCls} w-64`} /></Field>
                <Field label="Type">
                    <select name="type" defaultValue={sp.type ?? ""} className={inputCls}>
                        <option value="">Any</option><option value="private">Private</option><option value="global">Global</option>
                    </select>
                </Field>
            </Filters>

            <Card>
                {rows.length === 0 ? <Empty>No templates match.</Empty> : (
                    <Table head={["Template", "Owner", "Status", "Review aids", status === "pending" ? "Waiting" : "Updated"]}>
                        {rows.map((t) => {
                            const flags = review(t.msg_content);
                            const w = worst(flags);
                            return (
                                <tr key={t.id} className="hover:bg-surface-2/60">
                                    <Td>
                                        <Link href={`/templates/${t.id}`} className="font-medium text-brand hover:underline">{t.template_name}</Link>
                                        <span className="ml-2 font-mono text-[11px] text-ink-3">{t.slug}</span>
                                        {t.type === "global" && <Badge tone="info">global</Badge>}
                                        {Number(t.human_review_open ?? 0) > 0 && <Badge tone="warn">human review</Badge>}
                                        <div className="mt-0.5 max-w-xl text-xs text-ink-2">{truncate(t.msg_content, 120)}</div>
                                    </Td>
                                    <Td><div>{t.owner_name}</div><div className="text-xs text-ink-3">{t.owner_email}</div></Td>
                                    <Td><StatusBadge status={t.status} />{!t.active && <div className="mt-1 text-[11px] text-ink-3">inactive</div>}</Td>
                                    <Td>
                                        {w === "clean" ? <span className="text-xs text-ok">no flags</span> : (
                                            <div className="flex flex-wrap gap-1">
                                                {flags.slice(0, 3).map((f) => <Badge key={f.id} tone={f.severity === "block" ? "danger" : f.severity === "warn" ? "warn" : "neutral"} title={f.detail}>{f.title.split(":")[0]}</Badge>)}
                                                {flags.length > 3 && <span className="text-[11px] text-ink-3">+{flags.length - 3}</span>}
                                            </div>
                                        )}
                                    </Td>
                                    <Td className="whitespace-nowrap text-ink-3">{ago(status === "pending" ? t.createdAt : t.updatedAt)}</Td>
                                </tr>
                            );
                        })}
                    </Table>
                )}
                <Pager page={page} size={size} total={total} params={{ status, q: sp.q, type: sp.type, human: sp.human }} />
            </Card>
        </>
    );
}
