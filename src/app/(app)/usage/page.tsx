import { hourly, daily, weekly, hourOfDay, usersDaily, cashDaily, project } from "@/lib/db/usage";
import { listPurchases, purchaseTotals, balanceHistory, getSettings, listTargets, monthActuals } from "@/lib/db/provider";
import { computeRunway } from "@/lib/alerts";
import { Card, Stat, Table, Td, PageHeader, Empty, Badge, Button } from "@/components/ui";
import { Bars, Line } from "@/components/chart";
import { kes, num, pct, when, ago } from "@/lib/format";
import { PurchaseForm, SettingsForm, TargetForm } from "./forms";
import { removePurchase, pollNow, checkNow } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usage & runway" };

export default async function Usage() {
    const [h48, d90, w26, hod, users, cash, purchases, ptotals, balHist, settings, targets, runway] = await Promise.all([
        hourly(48), daily(90), weekly(26), hourOfDay(30), usersDaily(60), cashDaily(90), listPurchases(), purchaseTotals(), balanceHistory(60), getSettings(), listTargets(6), computeRunway(),
    ]);
    const pm = project(d90.map((d) => d.sent), 28, 30);
    const pc = project(cash.map((c) => c.amount), 28, 30);
    const pu = project(users.map((u) => u.signups), 28, 30);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const actuals = await Promise.all(targets.map((t) => monthActuals(t.month)));
    const peakHour = hod.reduce((a, b) => (b.n > a.n ? b : a), hod[0]);
    const lvl = runway.level;

    return (
        <>
            <PageHeader title="Usage & runway" subtitle="How much is going out, where it is heading, and whether the gateway can carry it." />

            {/* ---- runway ---- */}
            <Card className={`mb-4 ${lvl === "critical" ? "border-red-300" : lvl === "warn" ? "border-amber-300" : ""}`}
                title={<>Gateway runway {lvl === "ok" && <Badge tone="success">healthy</Badge>}{lvl === "warn" && <Badge tone="warn">low</Badge>}{lvl === "critical" && <Badge tone="danger">critical</Badge>}{lvl === "unknown" && <Badge>balance unknown</Badge>}</>}
                action={<div className="flex gap-2"><form action={pollNow}><Button type="submit">Poll balance now</Button></form><form action={checkNow}><Button type="submit" kind="warn">Run alert check</Button></form></div>}>
                <div className="grid gap-3 px-4 py-3 md:grid-cols-5">
                    <Stat label="Gateway balance" value={runway.gatewayUnits == null ? "—" : num(runway.gatewayUnits)} sub={runway.gatewayPolledAt ? `polled ${ago(runway.gatewayPolledAt)}` : "never polled"} tone={lvl === "critical" ? "danger" : lvl === "warn" ? "warn" : undefined} />
                    <Stat label="Burn / day" value={num(Math.round(runway.burnPerDay))} sub={runway.burnReliable ? "28-day trend" : "too little data for a trend; using the mean"} />
                    <Stat label="Runway" value={runway.runwayDays == null ? "—" : `${runway.runwayDays.toFixed(0)} days`} sub={`floor ${settings.alert_min_runway_days} days`} tone={lvl === "critical" ? "danger" : lvl === "warn" ? "warn" : undefined} />
                    <Stat label="Customer-held units" value={num(runway.committedUnits)} sub={runway.coverage == null ? "paid for, not yet sent" : `gateway covers ${pct(Math.min(runway.coverage, 9.99))}`} tone={runway.coverage != null && runway.coverage < 1 ? "danger" : undefined} />
                    <Stat label="Projected · next 30d" value={num(Math.round(runway.projectedNext30))} sub="messages" />
                </div>
                {runway.gatewayError && <p className="border-t border-line px-4 py-2 text-xs text-red-800">Last poll failed: {runway.gatewayError}</p>}
                {runway.reasons.length > 0 && <ul className="border-t border-line px-4 py-2 text-sm text-amber-900">{runway.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>}
                {balHist.length > 1 && <div className="border-t border-line px-4 py-3"><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Gateway balance · daily low</div><Line points={balHist.map((b) => ({ t: b.t, v: Number(b.units) }))} label="Gateway balance over time" /></div>}
            </Card>

            {/* ---- traffic ---- */}
            <div className="grid gap-4 xl:grid-cols-3">
                <Card title="Per hour · last 48h"><div className="px-4 py-3"><Bars points={h48} label="Messages per hour" /></div></Card>
                <Card title="Per day · last 90d"><div className="px-4 py-3"><Bars points={d90} label="Messages per day" /></div></Card>
                <Card title="Per week · last 26w"><div className="px-4 py-3"><Bars points={w26} label="Messages per week" /></div></Card>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-3">
                <Card title="Projection · messages">
                    <div className="px-4 py-3 text-sm">
                        <div className="grid grid-cols-[1fr_auto] gap-y-1">
                            <span className="text-ink-3">Typical day (28d mean)</span><span className="tnum">{num(Math.round(pm.mean))}</span>
                            <span className="text-ink-3">Trend</span><span className="tnum">{pm.trendPct == null ? "—" : `${pm.trendPct > 0 ? "+" : ""}${(pm.trendPct * 100).toFixed(0)}% / week`}</span>
                            <span className="font-medium">Next 30 days</span><span className="tnum font-medium">{num(Math.round(pm.next30))}</span>
                        </div>
                        {!pm.reliable && <p className="mt-2 text-xs text-ink-3">Fewer than 7 active days in the window — the trend is not meaningful yet; the mean is used.</p>}
                    </div>
                </Card>
                <Card title="Projection · cash in">
                    <div className="px-4 py-3 text-sm">
                        <div className="grid grid-cols-[1fr_auto] gap-y-1">
                            <span className="text-ink-3">Typical day</span><span className="tnum">{kes(pc.mean, 0)}</span>
                            <span className="text-ink-3">Trend</span><span className="tnum">{pc.trendPct == null ? "—" : `${pc.trendPct > 0 ? "+" : ""}${(pc.trendPct * 100).toFixed(0)}% / week`}</span>
                            <span className="font-medium">Next 30 days</span><span className="tnum font-medium">{kes(pc.next30, 0)}</span>
                        </div>
                        <div className="mt-3"><Line points={cash.slice(-45).map((c) => ({ t: c.t, v: c.amount }))} height={60} label="Cash in per day" unit=" KSh" /></div>
                    </div>
                </Card>
                <Card title="Busiest hours · last 30d (EAT)">
                    <div className="px-4 py-3">
                        <Bars points={hod.map((x) => ({ t: `${String(x.h).padStart(2, "0")}:00`, sent: x.n }))} height={70} label="Messages by hour of day" />
                        <p className="mt-1 text-xs text-ink-3">Peak at {String(peakHour.h).padStart(2, "0")}:00 with {num(peakHour.n)} messages. Gateway rate limits and outages bite here first.</p>
                    </div>
                </Card>
            </div>

            <Card title="Accounts per day · last 60d" className="mt-4">
                <div className="grid gap-4 px-4 py-3 md:grid-cols-3">
                    <div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Sign-ups</div><Bars points={users.map((u) => ({ t: u.t, sent: u.signups }))} height={60} label="Sign-ups per day" /><div className="mt-1 text-xs text-ink-3">projected next 30d: <b className="tnum text-ink">{num(Math.round(pu.next30))}</b></div></div>
                    <div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">First payment</div><Bars points={users.map((u) => ({ t: u.t, sent: u.paid }))} height={60} color="#1b7a3d" label="Accounts making their first payment per day" /></div>
                    <div><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Active senders</div><Bars points={users.map((u) => ({ t: u.t, sent: u.active }))} height={60} label="Distinct accounts sending per day" /></div>
                </div>
            </Card>

            {/* ---- spend & targets ---- */}
            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_380px]">
                <div className="space-y-4">
                    <Card title="Gateway purchases" action={<span className="text-xs text-ink-3">{ptotals.n} purchases · {kes(ptotals.kes, 0)} · {num(ptotals.units)} units{ptotals.avgUnitCost != null ? ` · avg ${kes(ptotals.avgUnitCost)}/unit` : ""}</span>}>
                        {purchases.length === 0 ? <Empty>No purchases recorded. Record each gateway top-up here so spend, unit cost and runway are real.</Empty> : (
                            <Table head={["Date", "Amount", "Units", "KSh / unit", "Reference", "Note", "By", ""]}>
                                {purchases.map((p) => (
                                    <tr key={p.id}>
                                        <Td className="whitespace-nowrap">{new Date(p.purchased_at).toISOString().slice(0, 10)}</Td>
                                        <Td className="text-right font-medium">{kes(p.amount_kes)}</Td>
                                        <Td className="text-right">{num(p.units)}</Td>
                                        <Td className="text-right">{kes(Number(p.amount_kes) / Number(p.units), 3)}</Td>
                                        <Td mono>{p.reference ?? "—"}</Td>
                                        <Td className="max-w-xs text-xs">{p.note ?? ""}</Td>
                                        <Td className="text-xs text-ink-3">{p.admin_name}</Td>
                                        <Td><form action={removePurchase}><input type="hidden" name="id" value={p.id} /><button className="text-xs text-red-700 hover:underline">delete</button></form></Td>
                                    </tr>
                                ))}
                            </Table>
                        )}
                    </Card>

                    <Card title="Monthly targets">
                        {targets.length === 0 ? <Empty>No targets set. Set one for this month below.</Empty> : (
                            <Table head={["Month", "Cash", "Messages", "New accounts", "Paying accounts", "Note"]}>
                                {targets.map((t, i) => {
                                    const a = actuals[i];
                                    const cell = (actual: number, target: number | null, money = false) => target == null ? <span className="text-ink-3">—</span> : (
                                        <span className={actual >= target ? "text-emerald-700" : t.month < thisMonth ? "text-red-700" : ""}>{money ? kes(actual, 0) : num(actual)} <span className="text-ink-3">/ {money ? kes(target, 0) : num(target)}</span> <span className="text-[11px]">({pct(target > 0 ? actual / target : null)})</span></span>
                                    );
                                    return (
                                        <tr key={t.month}>
                                            <Td mono>{t.month}{t.month === thisMonth && <Badge tone="info">now</Badge>}</Td>
                                            <Td>{cell(a.cash, t.cash_kes == null ? null : Number(t.cash_kes), true)}</Td>
                                            <Td>{cell(a.messages, t.messages)}</Td>
                                            <Td>{cell(a.new_accounts, t.new_accounts)}</Td>
                                            <Td>{cell(a.paying, t.paying_accounts)}</Td>
                                            <Td className="text-xs">{t.note ?? ""}</Td>
                                        </tr>
                                    );
                                })}
                            </Table>
                        )}
                    </Card>
                </div>

                <div className="space-y-4">
                    <Card title="Record a gateway purchase"><div className="px-4 py-3"><PurchaseForm /></div></Card>
                    <Card title="Set a monthly target"><div className="px-4 py-3"><TargetForm month={thisMonth} /></div></Card>
                    <Card title="Alert settings"><div className="px-4 py-3"><SettingsForm settings={settings} /></div></Card>
                    <Card title="Scheduling">
                        <div className="px-4 py-3 text-xs text-ink-2">
                            <p>Reminders fire from <code>GET /api/alerts/run</code>. Call it hourly; it polls the gateway only when the snapshot is stale and reminds only when the interval has passed.</p>
                            <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-[11px]">0 * * * * curl -s -H &quot;Authorization: Bearer $REVIEW_API_TOKEN&quot; \{"\n"}  https://ADMIN_HOST/api/alerts/run</pre>
                            <p className="mt-2">Last alert: {settings.last_alert_at ? `${when(settings.last_alert_at)} (${settings.last_alert_level})` : "never"}.</p>
                        </div>
                    </Card>
                </div>
            </div>
        </>
    );
}
