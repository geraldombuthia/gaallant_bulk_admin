import Link from "next/link";
import { financeSummary, monthly, topAccounts, accountReconciliation } from "@/lib/db/finance";
import { Card, Stat, Table, Td, PageHeader, Empty, Badge } from "@/components/ui";
import { kes, num, pct, when } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance" };

export default async function Finance() {
    const gatewayCost = Number(process.env.GATEWAY_COST_PER_SMS ?? 0.3);
    const [f, months, top, recon] = await Promise.all([financeSummary(gatewayCost), monthly(12), topAccounts(), accountReconciliation()]);
    const r = f.reconciliation;
    const unitsOk = Math.abs(r.gap) <= Math.max(5, r.sentObserved * 0.05);
    const cashOk = Math.abs(r.cashGap) < 1;

    return (
        <>
            <PageHeader title="Finance" subtitle="Cash in, revenue earned, and whether the two books agree." />

            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Cash · what the bank sees</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Collected · 30d" value={kes(f.cash.ok30, 0)} sub={`${f.cash.okCount30} successful payments`} />
                <Stat label="Collected · all time" value={kes(f.cash.okAll, 0)} />
                <Stat label="Pending M-Pesa" value={kes(f.cash.pending, 0)} sub="initiated, no callback yet" tone={f.cash.pending > 0 ? "warn" : undefined} />
                <Stat label="Failed · 30d" value={kes(f.cash.failed30, 0)} />
            </div>

            <h2 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Revenue · what has been earned</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="Units sold" value={num(f.ledger.unitsSold)} sub={`avg ${kes(f.ledger.avgPrice)} / SMS`} />
                <Stat label="Units consumed" value={num(f.units.consumed)} sub={`${num(f.messages.live)} live messages sent`} />
                <Stat label="Recognised revenue" value={kes(f.revenue.recognised, 0)} sub="consumed × average price" />
                <Stat label="Deferred (liability)" value={kes(f.revenue.deferred, 0)} sub={`${num(f.units.outstanding)} units unspent in ${f.units.accounts} accounts`} tone="warn" />
                <Stat label="Gross margin" value={pct(f.revenue.marginPct)} sub={`${kes(f.revenue.grossMargin, 0)} after gateway at ${kes(gatewayCost)}/SMS`} tone={f.revenue.marginPct != null && f.revenue.marginPct < 0.3 ? "warn" : undefined} />
            </div>
            <p className="mt-2 text-xs text-ink-3">
                Revenue is recognised when a credit is consumed, not when it is bought: an unspent credit is money taken for a message not yet sent.
                Gateway cost is the <code>GATEWAY_COST_PER_SMS</code> assumption ({kes(gatewayCost)}) until per-message cost is recorded by the gateway integration.
            </p>

            <h2 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Reconciliation · do the books agree?</h2>
            <div className="grid gap-3 md:grid-cols-2">
                <Card title={<>Units: derived consumption vs messages sent {unitsOk ? <Badge tone="success">agrees</Badge> : <Badge tone="danger">gap</Badge>}</>}>
                    <div className="px-4 py-3 text-sm">
                        <div className="grid grid-cols-[1fr_auto] gap-y-1">
                            <span className="text-ink-3">Units in (sold + adjusted)</span><span className="tnum">{num(f.ledger.unitsSold + f.ledger.unitsAdjusted)}</span>
                            <span className="text-ink-3">− outstanding balances</span><span className="tnum">{num(f.units.outstanding)}</span>
                            <span className="font-medium">= consumed (derived)</span><span className="tnum font-medium">{num(r.consumedDerived)}</span>
                            <span className="text-ink-3">live messages sent (observed)</span><span className="tnum">{num(r.sentObserved)}</span>
                            <span className={`font-medium ${unitsOk ? "" : "text-red-700"}`}>difference</span><span className={`tnum font-medium ${unitsOk ? "" : "text-red-700"}`}>{r.gap > 0 ? "+" : ""}{num(r.gap)}</span>
                        </div>
                        <p className="mt-2 text-xs text-ink-3">A small positive difference is normal (multi-segment messages consume more than one unit). A negative one means messages went out that were never billed.</p>
                    </div>
                </Card>
                <Card title={<>Cash: ledger vs payments {cashOk ? <Badge tone="success">agrees</Badge> : <Badge tone="danger">gap</Badge>}</>}>
                    <div className="px-4 py-3 text-sm">
                        <div className="grid grid-cols-[1fr_auto] gap-y-1">
                            <span className="text-ink-3">Successful payments (Payments table)</span><span className="tnum">{kes(r.paymentsOk)}</span>
                            <span className="text-ink-3">Top-ups credited (Credits ledger)</span><span className="tnum">{kes(r.ledgerPaid)}</span>
                            <span className={`font-medium ${cashOk ? "" : "text-red-700"}`}>difference</span><span className={`tnum font-medium ${cashOk ? "" : "text-red-700"}`}>{kes(r.cashGap)}</span>
                        </div>
                        <p className="mt-2 text-xs text-ink-3">Every successful payment must have exactly one ledger row. A gap here is a payment that was taken but never credited, or credited twice.</p>
                    </div>
                </Card>
            </div>

            {recon.length > 0 && (
                <Card title={`Accounts whose books disagree · ${recon.length}`} className="mt-3">
                    <Table head={["Account", "Units in", "Balance", "Consumed (derived)", "Sent", "Gap"]}>
                        {recon.map((a) => (
                            <tr key={a.id}>
                                <Td><Link href={`/users/${a.id}`} className="text-brand hover:underline">{a.name}</Link><div className="text-xs text-ink-3">{a.email}</div></Td>
                                <Td className="text-right">{num(a.unitsIn)}</Td>
                                <Td className={`text-right ${Number(a.balance) < 0 ? "text-red-700" : ""}`}>{num(a.balance)}</Td>
                                <Td className="text-right">{num(a.consumedDerived)}</Td>
                                <Td className="text-right">{num(a.sent)}</Td>
                                <Td className="text-right font-medium text-red-700">{Number(a.gap) > 0 ? "+" : ""}{num(a.gap)}</Td>
                            </tr>
                        ))}
                    </Table>
                </Card>
            )}

            <Card title="By month" className="mt-5">
                <Table head={["Month", "Cash in", "Payments", "Units sold", "Live sent", "Failed", "Sandbox", "Sign-ups", "→ paid"]}>
                    {months.map((m) => (
                        <tr key={m.m} className={m.cash === 0 && m.live === 0 && m.signups === 0 ? "text-ink-3" : ""}>
                            <Td mono>{m.m}</Td>
                            <Td className="text-right font-medium">{m.cash > 0 ? kes(m.cash, 0) : "—"}</Td>
                            <Td className="text-right">{m.payments || "—"}</Td>
                            <Td className="text-right">{m.units > 0 ? num(m.units) : "—"}</Td>
                            <Td className="text-right">{m.live || "—"}</Td>
                            <Td className="text-right">{m.failed || "—"}</Td>
                            <Td className="text-right text-ink-3">{m.test || "—"}</Td>
                            <Td className="text-right">{m.signups || "—"}</Td>
                            <Td className="text-right">{m.paidSignups || "—"}</Td>
                        </tr>
                    ))}
                </Table>
            </Card>

            <Card title="Top accounts by money in" className="mt-4">
                {top.length === 0 ? <Empty>No paying accounts yet.</Empty> : (
                    <Table head={["Account", "Paid", "Units bought", "Balance", "Sent · all", "Sent · 30d", "Last payment"]}>
                        {top.map((a) => (
                            <tr key={a.id}>
                                <Td><Link href={`/users/${a.id}`} className="text-brand hover:underline">{a.name}</Link><div className="text-xs text-ink-3">{a.email}</div></Td>
                                <Td className="text-right font-medium">{kes(a.paid)}</Td>
                                <Td className="text-right">{num(a.unitsSold)}</Td>
                                <Td className="text-right">{num(a.balance)}</Td>
                                <Td className="text-right">{num(a.live)}</Td>
                                <Td className="text-right">{num(a.live30)}</Td>
                                <Td className="text-xs text-ink-3">{a.lastPayment ? when(a.lastPayment) : "never"}</Td>
                            </tr>
                        ))}
                    </Table>
                )}
            </Card>
        </>
    );
}
