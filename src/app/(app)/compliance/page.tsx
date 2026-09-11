import Link from "next/link";
import { scanSent, byAccount, sentCounts } from "@/lib/db/compliance";
import { Card, Table, Td, PageHeader, Empty, Badge, Filters, Field, inputCls, Stat } from "@/components/ui";
import { when, truncate, num, pct } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compliance" };

export default async function Compliance({ searchParams }: { searchParams: Promise<{ days?: string; min?: string; user?: string }> }) {
    const sp = await searchParams;
    const days = Math.min(365, Math.max(1, Number(sp.days ?? 30) || 30));
    const min = (sp.min === "block" || sp.min === "note" ? sp.min : "warn") as "block" | "warn" | "note";
    const userId = sp.user ? Number(sp.user) : undefined;
    const [scan, counts] = await Promise.all([scanSent({ sinceDays: days, minSeverity: min, userId }), sentCounts(days)]);
    const accounts = byAccount(scan.hits, counts);
    const totalSent = [...counts.values()].reduce((a, b) => a + b, 0);

    return (
        <>
            <PageHeader title="Compliance" subtitle="What was actually sent, checked for marketing. Approval controls the template; this catches what went into the variables." />
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={`Live messages · ${days}d`} value={num(totalSent)} sub={`${num(scan.scanned)} scanned`} />
                <Stat label="Flagged" value={num(scan.hits.length)} sub={pct(scan.scanned > 0 ? scan.hits.length / scan.scanned : null) + " of scanned"} tone={scan.hits.length > 0 ? "warn" : undefined} />
                <Stat label="Blocking" value={num(scan.hits.filter((h) => h.worst === "block").length)} tone={scan.hits.some((h) => h.worst === "block") ? "danger" : undefined} />
                <Stat label="Accounts involved" value={num(accounts.length)} />
            </div>
            <Filters reset="/compliance">
                <Field label="Window (days)"><input name="days" type="number" min={1} max={365} defaultValue={days} className={`${inputCls} w-24`} /></Field>
                <Field label="Minimum severity"><select name="min" defaultValue={min} className={inputCls}><option value="block">Block only</option><option value="warn">Warn and above</option><option value="note">Everything</option></select></Field>
                <Field label="Account id"><input name="user" defaultValue={sp.user} className={`${inputCls} w-24`} /></Field>
            </Filters>

            <Card title="By account" className="mb-4">
                {accounts.length === 0 ? <Empty>Nothing sent in this window reads as marketing.</Empty> : (
                    <Table head={["Account", "Sent", "Flagged", "Rate", "Blocking", "What keeps appearing", "Example"]}>
                        {accounts.map((a) => (
                            <tr key={a.userId}>
                                <Td><Link href={`/users/${a.userId}`} className="font-medium text-brand hover:underline">{a.owner_name}</Link><div className="text-xs text-ink-3">{a.owner_email}</div></Td>
                                <Td className="text-right">{num(a.sent)}</Td>
                                <Td className="text-right">{num(a.flagged)}</Td>
                                <Td className="text-right">{pct(a.rate)}</Td>
                                <Td className="text-right">{a.blocked > 0 ? <Badge tone="danger">{a.blocked}</Badge> : "—"}</Td>
                                <Td className="text-xs">{a.topFlags.join(", ")}</Td>
                                <Td className="max-w-md text-xs"><Link href={`/messages/${a.sample.id}`} className="text-ink-2 hover:text-brand">{truncate(a.sample.message, 100)}</Link></Td>
                            </tr>
                        ))}
                    </Table>
                )}
            </Card>

            <Card title={`Flagged messages · ${scan.hits.length}`}>
                {scan.hits.length === 0 ? <Empty>None.</Empty> : (
                    <Table head={["Sent", "Account", "Message", "Flags"]}>
                        {scan.hits.slice(0, 200).map((h) => (
                            <tr key={h.id}>
                                <Td className="whitespace-nowrap text-xs"><Link href={`/messages/${h.id}`} className="text-brand hover:underline">{when(h.createdAt)}</Link></Td>
                                <Td><Link href={`/users/${h.userId}`} className="text-brand hover:underline">{h.owner_name}</Link></Td>
                                <Td className="max-w-lg text-xs">{h.message}</Td>
                                <Td><div className="flex flex-wrap gap-1">{h.flags.map((f) => <Badge key={f.id} tone={f.severity === "block" ? "danger" : f.severity === "warn" ? "warn" : "neutral"} title={f.detail}>{f.id}</Badge>)}</div></Td>
                            </tr>
                        ))}
                    </Table>
                )}
                {scan.hits.length > 200 && <div className="border-t border-line px-4 py-2 text-xs text-ink-3">Showing 200 of {scan.hits.length}. Narrow the window or filter by account.</div>}
            </Card>
        </>
    );
}
