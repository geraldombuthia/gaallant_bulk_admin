import Link from "next/link";
import { listSignIns, failureHotspots } from "@/lib/db/misc";
import { paging } from "@/lib/db/pool";
import { Card, Table, Td, StatusBadge, Pager, Filters, Field, inputCls, Empty, PageHeader } from "@/components/ui";
import { when, ago } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign-ins" };

export default async function SignIns({ searchParams }: { searchParams: Promise<{ outcome?: string; q?: string; page?: string }> }) {
    const sp = await searchParams;
    const { page, size, offset } = paging(sp, 50);
    const [{ rows, total }, hotspots] = await Promise.all([listSignIns({ outcome: sp.outcome as "success" | "failed" | undefined, q: sp.q }, size, offset), failureHotspots(24)]);
    return (
        <>
            <PageHeader title="Sign-ins" subtitle="Every dashboard and admin sign-in, successful or not. Failures cluster before a takeover." />
            {hotspots.length > 0 && (
                <Card title="Addresses with repeated failures · 24h" className="mb-4">
                    <Table head={["Address", "Failures", "Accounts tried", "Last attempt"]}>
                        {hotspots.map((h) => <tr key={h.ip_address}><Td mono>{h.ip_address}</Td><Td>{h.n}</Td><Td>{h.identifiers}</Td><Td>{ago(h.last)}</Td></tr>)}
                    </Table>
                </Card>
            )}
            <Filters reset="/sign-ins">
                <Field label="Search"><input name="q" defaultValue={sp.q} placeholder="email, address" className={`${inputCls} w-56`} /></Field>
                <Field label="Outcome"><select name="outcome" defaultValue={sp.outcome ?? ""} className={inputCls}><option value="">Any</option><option value="success">Success</option><option value="failed">Failed</option></select></Field>
            </Filters>
            <Card>
                {rows.length === 0 ? <Empty>Nothing recorded.</Empty> : (
                    <Table head={["When", "Result", "Account", "Tried as", "From", "Client"]}>
                        {rows.map((s) => (
                            <tr key={s.id}>
                                <Td className="whitespace-nowrap text-xs">{when(s.access_time)}</Td>
                                <Td><StatusBadge status={s.outcome} /></Td>
                                <Td>{s.userId ? <Link href={`/users/${s.userId}`} className="text-brand hover:underline">{s.user_name}</Link> : <span className="text-ink-3">unknown</span>}</Td>
                                <Td className="text-xs">{s.attempted_identifier ?? "—"}</Td>
                                <Td mono>{s.ip_address ?? "—"}</Td>
                                <Td className="text-xs text-ink-3">{[s.browser_name, s.os_name, s.device_type].filter(Boolean).join(" · ") || "—"}</Td>
                            </tr>
                        ))}
                    </Table>
                )}
                <Pager page={page} size={size} total={total} params={{ outcome: sp.outcome, q: sp.q }} />
            </Card>
        </>
    );
}
