import { activePricing, pricingHistory } from "@/lib/db/misc";
import { readSession } from "@/lib/auth/session";
import { Card, Table, Td, PageHeader, Empty, Badge } from "@/components/ui";
import { when, kes } from "@/lib/format";
import { PricingForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing" };

export default async function Pricing() {
    const [me, active, history] = await Promise.all([readSession(), activePricing(), pricingHistory()]);
    return (
        <>
            <PageHeader title="Pricing" subtitle="The active ladder prices every top-up. The landing page and the dashboard read it live." />
            <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
                <div className="space-y-4">
                    <Card title="Active ladder">
                        {!active ? <Empty>No active pricing row. Nothing can be purchased.</Empty> : (
                            <Table head={["Tier", "Messages", "Price per SMS", "KSh 1,000 buys"]}>
                                {([["1", active.tier1Min, active.tier1Max, active.tier1Price], ["2", active.tier2Min, active.tier2Max, active.tier2Price], ["3", active.tier3Min, active.tier3Max, active.tier3Price]] as const).map(([t, min, max, price]) => (
                                    <tr key={t}><Td>Tier {t}</Td><Td className="tnum">{min.toLocaleString()} – {max >= 99999999 ? "∞" : max.toLocaleString()}</Td><Td className="font-medium">{kes(price)}</Td><Td className="tnum text-ink-3">{Math.floor(1000 / Number(price)).toLocaleString()} SMS</Td></tr>
                                ))}
                                <tr><Td>First top-up minimum</Td><Td>{""}</Td><Td className="font-medium">{kes(active.registrationFee)}</Td><Td className="text-ink-3">activates the account</Td></tr>
                            </Table>
                        )}
                        {active && <div className="border-t border-line px-4 py-2 text-xs text-ink-3">Effective {when(active.effectiveFrom ?? active.created_at)} · row #{active.id}</div>}
                    </Card>
                    <Card title="History">
                        <Table head={["Row", "Tier 1", "Tier 2", "Tier 3", "Min top-up", "From", "To", ""]}>
                            {history.map((h) => (
                                <tr key={h.id}><Td>#{h.id}</Td><Td>{kes(h.tier1Price)}</Td><Td>{kes(h.tier2Price)}</Td><Td>{kes(h.tier3Price)}</Td><Td>{kes(h.registrationFee, 0)}</Td><Td className="text-xs">{when(h.effectiveFrom ?? h.created_at)}</Td><Td className="text-xs">{h.effectiveTo ? when(h.effectiveTo) : "—"}</Td><Td>{h.isActive ? <Badge tone="success">active</Badge> : null}</Td></tr>
                            ))}
                        </Table>
                    </Card>
                </div>
                <Card title="Change the ladder">
                    <div className="px-4 py-3">
                        {me?.role !== "superadmin" ? <p className="text-sm text-ink-3">Only a superadmin can change prices.</p> : <PricingForm current={active} />}
                    </div>
                </Card>
            </div>
        </>
    );
}
