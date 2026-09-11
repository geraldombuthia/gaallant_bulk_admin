import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser, userMessages, userPayments, userSignIns, userSupport, userTemplates, userKeys, userLedger } from "@/lib/db/users";
import { readSession } from "@/lib/auth/session";
import { Card, Dl, StatusBadge, PageHeader, Table, Td, Empty, Badge } from "@/components/ui";
import { when, ago, num, kes, truncate } from "@/lib/format";
import { StatusForm, RoleForm, CreditsForm, NoticeForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const uid = Number(id);
    const [me, u] = await Promise.all([readSession(), getUser(uid)]);
    if (!u) notFound();
    const [messages, payments, signIns, support, templates, keys, ledger] = await Promise.all([
        userMessages(uid), userPayments(uid), userSignIns(uid), userSupport(uid), userTemplates(uid), userKeys(uid), userLedger(uid),
    ]);
    const isSelf = me?.id === uid;

    return (
        <>
            <PageHeader title={u.name} subtitle={<>{u.email}{u.phone ? ` · ${u.phone}` : ""} · @{u.username} · #{u.id}</>}
                action={<div className="flex gap-2">{u.role !== "user" && <Badge tone="info">{u.role}</Badge>}<StatusBadge status={u.statuc} /></div>} />

            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-4">
                        <Mini label="Balance" value={`${num(u.balance ?? 0)} credits`} />
                        <Mini label="Sent · 30d" value={num(u.messages_30d)} />
                        <Mini label="Last sign-in" value={ago(u.last_sign_in)} />
                        <Mini label="Registered" value={u.registered_at ? when(u.registered_at) : "not paid yet"} />
                    </div>

                    <Card title="Account">
                        <div className="px-4 py-3">
                            <Dl items={[
                                ["Created", when(u.created_at)],
                                ["Email verified", u.verifiedEmail ? "yes" : "no"],
                                ["Phone verified", u.verifiedPhone ? "yes" : "no"],
                                ["API keys", keys.length === 0 ? "none" : (
                                    <ul key="k" className="space-y-0.5 text-xs">
                                        {keys.map((k) => <li key={k.id} className="flex flex-wrap gap-2"><span className="font-mono">…{k.suffix}</span><Badge tone={k.mode === "test" ? "neutral" : "info"}>{k.mode}</Badge>{!k.isActive && <Badge tone="danger">revoked</Badge>}<span className="text-ink-3">{k.description ?? ""} · {ago(k.created_at)}</span></li>)}
                                    </ul>
                                )],
                            ]} />
                        </div>
                    </Card>

                    <Card title="Templates" action={<Link href={`/templates?q=${encodeURIComponent(u.email)}&status=all`} className="text-xs text-brand">All</Link>}>
                        {templates.length === 0 ? <Empty>None.</Empty> : (
                            <Table head={["Name", "Slug", "Status", "Created"]}>
                                {templates.map((t) => <tr key={t.id}><Td><Link href={`/templates/${t.id}`} className="text-brand hover:underline">{t.template_name}</Link></Td><Td mono>{t.slug}</Td><Td><StatusBadge status={t.status} />{!t.active && <span className="ml-1 text-[11px] text-ink-3">inactive</span>}</Td><Td className="text-xs text-ink-3">{ago(t.createdAt)}</Td></tr>)}
                            </Table>
                        )}
                    </Card>

                    <Card title="Recent messages" action={<Link href={`/messages?user=${u.id}`} className="text-xs text-brand">All</Link>}>
                        {messages.length === 0 ? <Empty>None.</Empty> : (
                            <Table head={["Sent", "To", "Message", "Status", "Cost"]}>
                                {messages.map((m) => <tr key={m.id}><Td className="whitespace-nowrap"><Link href={`/messages/${m.id}`} className="text-brand hover:underline">{when(m.createdAt)}</Link></Td><Td mono>{m.phoneNumber}{m.isTest ? " (test)" : ""}</Td><Td className="max-w-sm text-xs">{truncate(m.message, 80)}</Td><Td><StatusBadge status={m.deliveryStatus} /></Td><Td className="text-right">{m.cost ?? "—"}</Td></tr>)}
                            </Table>
                        )}
                    </Card>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card title="Payments">
                            {payments.length === 0 ? <Empty>None.</Empty> : (
                                <Table head={["When", "Amount", "Method", "Status"]}>
                                    {payments.map((p) => <tr key={p.id}><Td className="whitespace-nowrap text-xs">{when(p.created_at)}</Td><Td className="text-right">{kes(p.amount)}</Td><Td className="text-xs">{p.payment_method ?? "—"}{p.transaction_code ? <div className="font-mono text-ink-3">{p.transaction_code}</div> : null}</Td><Td><StatusBadge status={p.transaction_status} /></Td></tr>)}
                                </Table>
                            )}
                        </Card>
                        <Card title="Credit ledger">
                            {ledger.length === 0 ? <Empty>None.</Empty> : (
                                <Table head={["When", "SMS units", "Paid", "Type", "Unit price"]}>
                                    {ledger.map((l) => <tr key={l.id}><Td className="whitespace-nowrap text-xs">{when(l.createdAt)}</Td><Td className={`text-right ${Number(l.creditUnit) < 0 ? "text-red-700" : ""}`}>{Number(l.creditUnit) > 0 ? "+" : ""}{num(l.creditUnit)}</Td><Td className="text-right">{Number(l.creditsValue) > 0 ? kes(l.creditsValue) : <span className="text-ink-3">—</span>}</Td><Td className="text-xs">{l.productType}</Td><Td className="text-right text-xs">{Number(l.price_per_unit) > 0 ? kes(l.price_per_unit) : "—"}</Td></tr>)}
                                </Table>
                            )}
                        </Card>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card title="Sign-ins">
                            {signIns.length === 0 ? <Empty>None recorded.</Empty> : (
                                <Table head={["When", "Result", "From", "Device"]}>
                                    {signIns.map((s) => <tr key={s.id}><Td className="whitespace-nowrap text-xs">{when(s.access_time)}</Td><Td><StatusBadge status={s.outcome} /></Td><Td mono>{s.ip_address ?? "—"}</Td><Td className="text-xs text-ink-3">{[s.browser_name, s.os_name, s.device_type].filter(Boolean).join(" · ") || "—"}</Td></tr>)}
                                </Table>
                            )}
                        </Card>
                        <Card title="Support">
                            {support.length === 0 ? <Empty>No requests.</Empty> : (
                                <Table head={["Subject", "Status", "Opened"]}>
                                    {support.map((s) => <tr key={s.id}><Td><Link href={`/support/${s.id}`} className="text-brand hover:underline">{s.subject}</Link></Td><Td><StatusBadge status={s.status} /></Td><Td className="text-xs text-ink-3">{ago(s.created_at)}</Td></tr>)}
                                </Table>
                            )}
                        </Card>
                    </div>
                </div>

                <div className="space-y-4">
                    <Card title="Account status"><div className="px-4 py-3"><StatusForm id={u.id} current={u.statuc} disabled={isSelf || u.role === "superadmin"} /></div></Card>
                    <Card title="Adjust credits"><div className="px-4 py-3"><CreditsForm id={u.id} balance={Number(u.balance ?? 0)} /></div></Card>
                    <Card title="Send a notification"><div className="px-4 py-3"><NoticeForm id={u.id} /></div></Card>
                    {me?.role === "superadmin" && <Card title="Role (superadmin)"><div className="px-4 py-3"><RoleForm id={u.id} current={u.role} disabled={isSelf} /></div></Card>}
                </div>
            </div>
        </>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return <div className="rounded-lg border border-line bg-white px-3 py-2"><div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</div><div className="tnum mt-0.5 text-base font-semibold">{value}</div></div>;
}
