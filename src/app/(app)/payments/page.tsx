import Link from "next/link";
import { listPayments, paymentStatuses } from "@/lib/db/misc";
import { paging } from "@/lib/db/pool";
import { Card, Table, Td, StatusBadge, Pager, Filters, Field, inputCls, Empty, PageHeader, Stat } from "@/components/ui";
import { when, kes } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payments" };

export default async function Payments({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string; page?: string }> }) {
    const sp = await searchParams;
    const { page, size, offset } = paging(sp, 50);
    const [{ rows, total, sumAll, sumOk }, statuses] = await Promise.all([listPayments(sp, size, offset), paymentStatuses()]);
    return (
        <>
            <PageHeader title="Payments" subtitle="M-Pesa top-ups as recorded by the callback and the claim path." />
            <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Successful (filter)" value={kes(sumOk, 0)} />
                <Stat label="All attempts (filter)" value={kes(sumAll, 0)} />
                <Stat label="Payments (filter)" value={total.toLocaleString()} />
                <Stat label="Success rate" value={sumAll > 0 ? `${((sumOk / sumAll) * 100).toFixed(0)}%` : "—"} sub="by amount" />
            </div>
            <Filters reset="/payments">
                <Field label="Search"><input name="q" defaultValue={sp.q} placeholder="M-Pesa code, phone, email, checkout id" className={`${inputCls} w-64`} /></Field>
                <Field label="Status"><select name="status" defaultValue={sp.status ?? ""} className={inputCls}><option value="">Any</option>{statuses.map((s) => <option key={s.transaction_status} value={s.transaction_status}>{s.transaction_status} ({s.n})</option>)}</select></Field>
                <Field label="From"><input type="date" name="from" defaultValue={sp.from} className={inputCls} /></Field>
                <Field label="To"><input type="date" name="to" defaultValue={sp.to} className={inputCls} /></Field>
            </Filters>
            <Card>
                {rows.length === 0 ? <Empty>No payments match.</Empty> : (
                    <Table head={["When", "Account", "Amount", "Method", "M-Pesa code", "Phone", "Status", "Type"]}>
                        {rows.map((p) => (
                            <tr key={p.id} className="hover:bg-gray-50/60">
                                <Td className="whitespace-nowrap text-xs">{when(p.created_at)}</Td>
                                <Td><Link href={`/users/${p.userId}`} className="text-brand hover:underline">{p.owner_name}</Link><div className="text-xs text-ink-3">{p.owner_email}</div></Td>
                                <Td className="text-right font-medium">{kes(p.amount)}</Td>
                                <Td className="text-xs">{p.payment_method ?? "—"}</Td>
                                <Td mono>{p.transaction_code ?? <span className="text-ink-3">—</span>}</Td>
                                <Td mono>{p.phone ?? "—"}</Td>
                                <Td><StatusBadge status={p.transaction_status} />{p.responseDescription && <div className="mt-0.5 max-w-[14rem] truncate text-[11px] text-ink-3" title={p.responseDescription}>{p.responseDescription}</div>}</Td>
                                <Td className="text-xs">{p.purchaseType ?? "—"}</Td>
                            </tr>
                        ))}
                    </Table>
                )}
                <Pager page={page} size={size} total={total} params={{ ...sp, page: undefined }} />
            </Card>
        </>
    );
}
