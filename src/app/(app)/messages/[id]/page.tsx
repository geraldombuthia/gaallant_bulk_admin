import Link from "next/link";
import { notFound } from "next/navigation";
import { getMessage } from "@/lib/db/messages";
import { Card, Dl, StatusBadge, PageHeader, Badge } from "@/components/ui";
import { when } from "@/lib/format";

export const dynamic = "force-dynamic";

function pretty(s: string | null) {
    if (!s) return null;
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const m = await getMessage(Number(id));
    if (!m) notFound();
    return (
        <>
            <PageHeader title={`Message #${m.id}`} subtitle={<>to <span className="font-mono">{m.phoneNumber}</span> · {when(m.createdAt)}</>}
                action={<div className="flex gap-2">{m.isTest ? <Badge>sandbox</Badge> : null}<StatusBadge status={m.deliveryStatus} /></div>} />
            <div className="grid gap-4 xl:grid-cols-2">
                <Card title="Content"><p className="whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-relaxed">{m.message}</p></Card>
                <Card title="Details">
                    <div className="px-4 py-3">
                        <Dl items={[
                            ["Account", <Link key="u" className="text-brand" href={`/users/${m.userId}`}>{m.owner_name} · {m.owner_email}</Link>],
                            ["Sender ID", m.senderId ?? "—"],
                            ["Gateway status", <StatusBadge key="s" status={m.deliveryStatus} />],
                            ["Gateway reason", m.reason ?? "—"],
                            ["Transaction id", <span key="t" className="font-mono text-xs">{m.transactionId ?? "—"}</span>],
                            ["Provider id", <span key="p" className="font-mono text-xs">{m.providerId ?? "—"}</span>],
                            ["Cost", m.cost ?? "—"],
                            ["Retries", String(m.retryAttempts ?? 0)],
                            ["Delivery report", m.dlrReceivedAt ? `${m.deliveryCode ?? ""} ${m.deliveryDetail ?? ""} · received ${when(m.dlrReceivedAt)}` : "none received"],
                            ["Delivered at", m.deliveredAt ? when(m.deliveredAt) : "—"],
                        ]} />
                    </div>
                </Card>
                <Card title="Provider response"><pre className="overflow-x-auto px-4 py-3 text-xs">{pretty(m.providerResponse) ?? "—"}</pre></Card>
                <Card title="Delivery report payload"><pre className="overflow-x-auto px-4 py-3 text-xs">{pretty(m.dlrPayload) ?? "— none received"}</pre></Card>
            </div>
        </>
    );
}
