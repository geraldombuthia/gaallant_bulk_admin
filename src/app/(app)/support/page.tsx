import Link from "next/link";
import { listSupport, supportCounts } from "@/lib/db/support";
import { paging } from "@/lib/db/pool";
import { Card, Table, Td, StatusBadge, Pager, Filters, Field, inputCls, Empty, PageHeader, Badge } from "@/components/ui";
import { ago, truncate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support" };

export default async function Support({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
    const sp = await searchParams;
    const status = (sp.status ?? "open") as "open" | "answered" | "closed" | "all";
    const { page, size, offset } = paging(sp);
    const [{ rows, total }, counts] = await Promise.all([listSupport(status, sp.q, size, offset), supportCounts()]);
    return (
        <>
            <PageHeader title="Support" subtitle="Requests from the dashboard. Replies land in the user's notifications." />
            <div className="mb-3 flex flex-wrap gap-1">
                {([["open", "Open", counts.open], ["answered", "Answered", counts.answered], ["closed", "Closed", counts.closed], ["all", "All", counts.open + counts.answered + counts.closed]] as const).map(([s, l, n]) => (
                    <Link key={s} href={`/support?status=${s}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? "bg-ink text-white" : "border border-line bg-white text-ink-2 hover:bg-gray-50"}`}>{l} <span className="tnum opacity-70">{n}</span></Link>
                ))}
            </div>
            <Filters reset={`/support?status=${status}`}>
                <input type="hidden" name="status" value={status} />
                <Field label="Search"><input name="q" defaultValue={sp.q} placeholder="subject, body, account" className={`${inputCls} w-64`} /></Field>
            </Filters>
            <Card>
                {rows.length === 0 ? <Empty>Nothing here.</Empty> : (
                    <Table head={["Subject", "From", "Status", "Replies", "Updated"]}>
                        {rows.map((s) => (
                            <tr key={s.id} className="hover:bg-gray-50/60">
                                <Td><Link href={`/support/${s.id}`} className="font-medium text-brand hover:underline">{s.subject}</Link>{s.priority === "high" && <Badge tone="danger">high</Badge>}<div className="max-w-lg text-xs text-ink-3">{truncate(s.body, 110)}</div></Td>
                                <Td><Link href={`/users/${s.userId}`} className="text-brand hover:underline">{s.owner_name}</Link><div className="text-xs text-ink-3">{s.owner_email}</div></Td>
                                <Td><StatusBadge status={s.status} /></Td>
                                <Td className="text-right">{s.reply_count}</Td>
                                <Td className="whitespace-nowrap text-xs text-ink-3">{ago(s.updated_at)}</Td>
                            </tr>
                        ))}
                    </Table>
                )}
                <Pager page={page} size={size} total={total} params={{ status, q: sp.q }} />
            </Card>
        </>
    );
}
