import Link from "next/link";
import { listAudit } from "@/lib/db/misc";
import { paging } from "@/lib/db/pool";
import { Card, Table, Td, Pager, Filters, Field, inputCls, Empty, PageHeader, Badge } from "@/components/ui";
import { when } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

const targetHref = (type: string, id: number | null) => {
    if (!id) return null;
    return { template: `/templates/${id}`, user: `/users/${id}`, support: `/support/${id}` }[type] ?? null;
};

export default async function Audit({ searchParams }: { searchParams: Promise<{ action?: string; target?: string; page?: string }> }) {
    const sp = await searchParams;
    const { page, size, offset } = paging(sp, 50);
    const { rows, total } = await listAudit({ action: sp.action, target: sp.target }, size, offset);
    return (
        <>
            <PageHeader title="Audit log" subtitle="Every admin action, with what it changed and why. Nothing here can be edited or deleted from this app." />
            <Filters reset="/audit">
                <Field label="Action starts with"><input name="action" defaultValue={sp.action} placeholder="template. / user. / credits." className={`${inputCls} w-48`} /></Field>
                <Field label="Target"><select name="target" defaultValue={sp.target ?? ""} className={inputCls}><option value="">Any</option>{["template", "user", "support", "pricing", "messages"].map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
            </Filters>
            <Card>
                {rows.length === 0 ? <Empty>No actions recorded.</Empty> : (
                    <Table head={["When", "Admin", "Action", "Target", "Reason", "Change", "From"]}>
                        {rows.map((a) => {
                            const href = targetHref(a.targetType, a.targetId);
                            return (
                                <tr key={a.id}>
                                    <Td className="whitespace-nowrap text-xs">{when(a.created_at)}</Td>
                                    <Td>{a.admin_name}</Td>
                                    <Td><Badge tone="info">{a.action}</Badge></Td>
                                    <Td className="text-xs">{href ? <Link href={href} className="text-brand hover:underline">{a.targetType} #{a.targetId}</Link> : `${a.targetType}${a.targetId ? ` #${a.targetId}` : ""}`}</Td>
                                    <Td className="max-w-xs whitespace-pre-wrap text-xs">{a.reason ?? ""}</Td>
                                    <Td className="max-w-xs font-mono text-[11px] text-ink-2">
                                        {a.before_json != null && <div className="text-ink-3">− {JSON.stringify(a.before_json)}</div>}
                                        {a.after_json != null && <div>+ {JSON.stringify(a.after_json)}</div>}
                                    </Td>
                                    <Td mono>{a.ip_address ?? ""}</Td>
                                </tr>
                            );
                        })}
                    </Table>
                )}
                <Pager page={page} size={size} total={total} params={{ action: sp.action, target: sp.target }} />
            </Card>
        </>
    );
}
