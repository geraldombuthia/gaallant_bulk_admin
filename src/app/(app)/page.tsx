import Link from "next/link";
import { overview, failureHotspots } from "@/lib/db/misc";
import { listTemplates } from "@/lib/db/templates";
import { listSupport } from "@/lib/db/support";
import { Card, Stat, Table, Td, StatusBadge, Empty, PageHeader, Badge } from "@/components/ui";
import { kes, num, pct, ago, truncate } from "@/lib/format";
import { review, worst } from "@/lib/compliance";

export const dynamic = "force-dynamic";

export default async function Overview() {
    const [o, pending, support, hotspots] = await Promise.all([
        overview(),
        listTemplates({ status: "pending" }, 8, 0),
        listSupport("open", undefined, 8, 0),
        failureHotspots(24),
    ]);

    const max = Math.max(1, ...o.daily.map((d) => d.sent));

    return (
        <>
            <PageHeader title="Overview" subtitle="Live traffic, money, and what needs a decision today." />

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Stat label="Messages today" value={num(o.messages.today)} sub={`${num(o.messages.d7)} this week`} />
                <Stat label="Delivery rate · 7d" value={pct(o.messages.deliveryRate7)}
                    sub={o.messages.reported7 > 0 ? `${num(o.messages.reported7)} with a report` : "no delivery reports yet"}
                    tone={o.messages.deliveryRate7 != null && o.messages.deliveryRate7 < 0.9 ? "warn" : undefined} />
                <Stat label="Failed · 7d" value={num(o.messages.failed7)} tone={o.messages.failed7 > 0 ? "warn" : undefined} />
                <Stat label="Paid · 7d" value={kes(o.payments.amount7, 0)} sub={`${o.payments.count7} payments · ${kes(o.payments.amount30, 0)} in 30d`} />
                <Stat label="Accounts" value={num(o.users.total)} sub={`${o.users.new7} new this week · ${o.users.registered} paid`} />
                <Stat label="Failed sign-ins · 24h" value={num(o.security.failed24)} tone={o.security.failed24 >= 10 ? "danger" : undefined} />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-3">
                <Card title="Sent per day · last 14 days" className="xl:col-span-2">
                    <div className="px-4 py-3">
                        <svg viewBox={`0 0 ${o.daily.length * 22} 60`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Messages sent per day">
                            {o.daily.map((d, i) => {
                                const h = (d.sent / max) * 50;
                                const fh = (d.failed / max) * 50;
                                return (
                                    <g key={d.day}>
                                        <rect x={i * 22 + 3} y={55 - h} width={16} height={h} fill="var(--brand)" opacity="0.85"><title>{d.day}: {d.sent} sent, {d.failed} failed</title></rect>
                                        {fh > 0 && <rect x={i * 22 + 3} y={55 - fh} width={16} height={fh} fill="var(--danger)" />}
                                    </g>
                                );
                            })}
                        </svg>
                        <div className="mt-1 flex justify-between text-[11px] text-ink-3">
                            <span className="tnum">{o.daily[0]?.day ?? ""}</span>
                            <span><span className="inline-block h-2 w-2 rounded-sm bg-brand align-middle" /> sent <span className="ml-2 inline-block h-2 w-2 rounded-sm bg-danger align-middle" /> failed · live only · {num(o.creditsOutstanding)} credits outstanding</span>
                            <span className="tnum">{o.daily.at(-1)?.day ?? ""}</span>
                        </div>
                    </div>
                </Card>

                <Card title="Failed sign-in hotspots · 24h">
                    {hotspots.length === 0 ? <Empty>No address with three or more failures.</Empty> : (
                        <Table head={["Address", "Failures", "Accounts tried", "Last"]}>
                            {hotspots.map((h) => (
                                <tr key={h.ip_address}>
                                    <Td mono>{h.ip_address}</Td>
                                    <Td>{h.n}</Td>
                                    <Td>{h.identifiers}</Td>
                                    <Td>{ago(h.last)}</Td>
                                </tr>
                            ))}
                        </Table>
                    )}
                </Card>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <Card title={`Templates awaiting review · ${pending.total}`} action={<Link href="/templates?status=pending" className="text-xs text-brand">Open queue</Link>}>
                    {pending.rows.length === 0 ? <Empty>Nothing waiting.</Empty> : (
                        <Table head={["Template", "Owner", "Flags", "Waiting"]}>
                            {pending.rows.map((t) => {
                                const w = worst(review(t.msg_content));
                                return (
                                    <tr key={t.id}>
                                        <Td><Link href={`/templates/${t.id}`} className="font-medium text-brand hover:underline">{t.template_name}</Link><div className="text-xs text-ink-3">{truncate(t.msg_content, 70)}</div></Td>
                                        <Td>{t.owner_name}</Td>
                                        <Td>{w === "clean" ? <Badge tone="success">clean</Badge> : <Badge tone={w === "block" ? "danger" : w === "warn" ? "warn" : "neutral"}>{w}</Badge>}</Td>
                                        <Td>{ago(t.createdAt)}</Td>
                                    </tr>
                                );
                            })}
                        </Table>
                    )}
                </Card>

                <Card title={`Open support · ${support.total}`} action={<Link href="/support?status=open" className="text-xs text-brand">Open inbox</Link>}>
                    {support.rows.length === 0 ? <Empty>Inbox is clear.</Empty> : (
                        <Table head={["Subject", "From", "Priority", "Age"]}>
                            {support.rows.map((s) => (
                                <tr key={s.id}>
                                    <Td><Link href={`/support/${s.id}`} className="font-medium text-brand hover:underline">{s.subject}</Link></Td>
                                    <Td>{s.owner_name}</Td>
                                    <Td>{s.priority === "high" ? <StatusBadge status="failed" /> : <span className="text-xs text-ink-3">normal</span>}</Td>
                                    <Td>{ago(s.created_at)}</Td>
                                </tr>
                            ))}
                        </Table>
                    )}
                </Card>
            </div>
        </>
    );
}
