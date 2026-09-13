import Link from "next/link";
import { financeSummary, monthly, topAccounts, accountReconciliation, cashByPeriod } from "@/lib/db/finance";
import { listExpenses, expenseSummary, expensesMonthly, CATEGORIES } from "@/lib/db/expenses";
import { ExpenseForm } from "./forms";
import { removeExpense } from "./actions";
import { Card, Stat, Table, Td, PageHeader, Empty, Badge } from "@/components/ui";
import { kes, num, pct, when } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finance" };

export default async function Finance() {
    const gatewayCost = Number(process.env.GATEWAY_COST_PER_SMS ?? 0.3);
    const [f, months, top, recon, periods, exp, expAll, exp30, expByMonth] = await Promise.all([financeSummary(gatewayCost), monthly(12), topAccounts(), accountReconciliation(), cashByPeriod(), listExpenses({}, 25, 0), expenseSummary(null), expenseSummary(30), expensesMonthly(12)]);
    // Net after everything: recorded expenses, gateway purchases, and the
    // gateway units the platform burned on its own traffic
    const net = f.revenue.recognised - expAll.total - f.internal.cost;
    const r = f.reconciliation;
    const unitsOk = Math.abs(r.gap) <= Math.max(5, r.sentObserved * 0.05);
    const cashOk = Math.abs(r.cashGap) < 1;

    return (
        <>
            <PageHeader title="Finance" subtitle="Cash in, revenue earned, and whether the two books agree." />

            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Cash · what the bank sees (successful M-Pesa)</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                <Stat label="Last hour" value={kes(periods.hour.amount, 0)} sub={`${periods.hour.n} payment${periods.hour.n === 1 ? "" : "s"}`} />
                <Stat label="Today" value={kes(periods.today.amount, 0)} sub={`${periods.today.n} payments`} />
                <Stat label="Last 7 days" value={kes(periods.d7.amount, 0)} sub={`${periods.d7.n} payments`} />
                <Stat label="Last 30 days" value={kes(periods.d30.amount, 0)} sub={`${periods.d30.n} payments`} />
                <Stat label="This year" value={kes(periods.ytd.amount, 0)} sub={`${periods.ytd.n} payments`} />
                <Stat label="Last 12 months" value={kes(periods.y1.amount, 0)} sub={`${periods.y1.n} payments`} />
                <Stat label="All time" value={kes(periods.all.amount, 0)} sub={`${periods.all.n} payments`} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3">
                <span>Pending M-Pesa (initiated, no callback): <b className={`tnum ${f.cash.pending > 0 ? "text-warn" : "text-ink"}`}>{kes(f.cash.pending, 0)}</b></span>
                <span>Failed · 30d: <b className="tnum text-ink">{kes(f.cash.failed30, 0)}</b></span>
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
                            <span className={`font-medium ${unitsOk ? "" : "text-danger"}`}>difference</span><span className={`tnum font-medium ${unitsOk ? "" : "text-danger"}`}>{r.gap > 0 ? "+" : ""}{num(r.gap)}</span>
                        </div>
                        <p className="mt-2 text-xs text-ink-3">A small positive difference is normal (multi-segment messages consume more than one unit). A negative one means messages went out that were never billed.</p>
                    </div>
                </Card>
                <Card title={<>Cash: ledger vs payments {cashOk ? <Badge tone="success">agrees</Badge> : <Badge tone="danger">gap</Badge>}</>}>
                    <div className="px-4 py-3 text-sm">
                        <div className="grid grid-cols-[1fr_auto] gap-y-1">
                            <span className="text-ink-3">Successful payments (Payments table)</span><span className="tnum">{kes(r.paymentsOk)}</span>
                            <span className="text-ink-3">Top-ups credited (Credits ledger)</span><span className="tnum">{kes(r.ledgerPaid)}</span>
                            <span className={`font-medium ${cashOk ? "" : "text-danger"}`}>difference</span><span className={`tnum font-medium ${cashOk ? "" : "text-danger"}`}>{kes(r.cashGap)}</span>
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
                                <Td className={`text-right ${Number(a.balance) < 0 ? "text-danger" : ""}`}>{num(a.balance)}</Td>
                                <Td className="text-right">{num(a.consumedDerived)}</Td>
                                <Td className="text-right">{num(a.sent)}</Td>
                                <Td className="text-right font-medium text-danger">{Number(a.gap) > 0 ? "+" : ""}{num(a.gap)}</Td>
                            </tr>
                        ))}
                    </Table>
                </Card>
            )}

            <h2 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Expenses · what it costs to run</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <Stat label="Spend · 30d" value={kes(exp30.total + f.internal.cost30, 0)} sub={`gateway credits ${kes(exp30.gatewayCredits, 0)} · app's own SMS ${kes(f.internal.cost30, 0)}`} />
                <Stat label="Spend · all time" value={kes(expAll.total + f.internal.cost, 0)} sub={`${Object.keys(expAll.byCat).length} categor${Object.keys(expAll.byCat).length === 1 ? "y" : "ies"} + gateway + app SMS`} />
                <Stat label="App's own SMS · all time" value={kes(f.internal.cost, 0)} sub={`${num(f.internal.count)} messages · ${num(f.internal.units)} units at ${kes(gatewayCost)} · ${num(f.internal.count30)} in 30d`} tone={f.internal.count > 0 ? "warn" : undefined} />
                <Stat label="Marketing · all time" value={kes(expAll.byCat.marketing ?? 0, 0)} />
                <Stat label="Net · all time" value={kes(net, 0)} sub="recognised revenue − every cost" tone={net < 0 ? "danger" : undefined} />
                <Stat label="Cash net · all time" value={kes(periods.all.amount - expAll.total - f.internal.cost, 0)} sub="collected − every cost" tone={periods.all.amount - expAll.total - f.internal.cost < 0 ? "warn" : undefined} />
            </div>
            <p className="mt-2 text-xs text-ink-3">
                The app&apos;s own SMS -- verification codes, alerts, the operator&apos;s dashboard sends -- go through the same gateway but are billed to nobody. They are a running cost, kept apart from the units sold to customers so consumption and revenue above are customer traffic only.
            </p>
            <div className="mt-3 grid gap-4 xl:grid-cols-[1fr_360px]">
                <Card title="Recent expenses" action={<span className="text-xs text-ink-3">{exp.total} recorded · {kes(exp.sum, 0)}</span>}>
                    {exp.rows.length === 0 ? <Empty>Nothing recorded. Gateway credit purchases are entered on the Usage page; everything else here.</Empty> : (
                        <Table head={["Date", "Category", "Amount", "Vendor", "Reference", "Note", "By", ""]}>
                            {exp.rows.map((e) => (
                                <tr key={e.id}>
                                    <Td className="whitespace-nowrap">{new Date(e.spent_on).toISOString().slice(0, 10)}</Td>
                                    <Td><Badge tone={e.category === "marketing" ? "info" : "neutral"}>{e.category}</Badge></Td>
                                    <Td className="text-right font-medium">{kes(e.amount_kes)}</Td>
                                    <Td className="text-xs">{e.vendor ?? "—"}</Td>
                                    <Td mono>{e.reference ?? "—"}</Td>
                                    <Td className="max-w-xs text-xs">{e.note ?? ""}</Td>
                                    <Td className="text-xs text-ink-3">{e.admin_name}</Td>
                                    <Td><form action={removeExpense}><input type="hidden" name="id" value={e.id} /><button className="text-xs text-danger hover:underline">delete</button></form></Td>
                                </tr>
                            ))}
                        </Table>
                    )}
                    {Object.keys(expAll.byCat).length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-xs text-ink-3">
                            {Object.entries(expAll.byCat).map(([c, v]) => <span key={c}>{c}: <b className="tnum text-ink">{kes(v, 0)}</b></span>)}
                            <span>gateway credits: <b className="tnum text-ink">{kes(expAll.gatewayCredits, 0)}</b></span>
                        </div>
                    )}
                </Card>
                <Card title="Record an expense"><div className="px-4 py-3"><ExpenseForm categories={[...CATEGORIES]} /></div></Card>
            </div>

            <Card title="By month" className="mt-5">
                <Table head={["Month", "Cash in", "Expenses", "Payments", "Units sold", "Live sent", "Failed", "Sandbox", "Sign-ups", "→ paid"]}>
                    {months.map((m) => (
                        <tr key={m.m} className={m.cash === 0 && m.live === 0 && m.signups === 0 ? "text-ink-3" : ""}>
                            <Td mono>{m.m}</Td>
                            <Td className="text-right font-medium">{m.cash > 0 ? kes(m.cash, 0) : "—"}</Td>
                            <Td className="text-right text-danger">{expByMonth[m.m] ? kes(expByMonth[m.m], 0) : "—"}</Td>
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
