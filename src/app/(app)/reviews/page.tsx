import Link from "next/link";
import { listReviewRequests } from "@/lib/db/reviewRequests";
import { paging } from "@/lib/db/pool";
import { Card, Table, Td, Pager, Filters, Field, inputCls, Empty, PageHeader, Badge, StatusBadge, Button } from "@/components/ui";
import { ago, when } from "@/lib/format";
import { closeRequest } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Human review" };

const href = (t: string, id: number) => ({ template: `/templates/${id}`, message: `/messages/${id}`, user: `/users/${id}` }[t] ?? "#");

export default async function Reviews({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; page?: string }> }) {
    const sp = await searchParams;
    const status = (sp.status ?? "open") as "open" | "resolved" | "dismissed" | "all";
    const { page, size, offset } = paging(sp);
    const { rows, total } = await listReviewRequests({ status, type: sp.type as "template" | "message" | "user" | undefined }, size, offset);
    return (
        <>
            <PageHeader title="Human review" subtitle="Things an automated reviewer was not sure about. Deciding on a template resolves its request automatically." />
            <Filters reset="/reviews">
                <Field label="Status"><select name="status" defaultValue={status} className={inputCls}><option value="open">Open</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All</option></select></Field>
                <Field label="Type"><select name="type" defaultValue={sp.type ?? ""} className={inputCls}><option value="">Any</option><option value="template">Templates</option><option value="message">Messages</option><option value="user">Users</option></select></Field>
            </Filters>
            <Card>
                {rows.length === 0 ? <Empty>Nothing waiting for a human.</Empty> : (
                    <Table head={["Requested", "Target", "By", "Reason", "Confidence", "Status", ""]}>
                        {rows.map((r) => (
                            <tr key={r.id}>
                                <Td className="whitespace-nowrap text-xs">{ago(r.created_at)}<div className="text-ink-3">{when(r.created_at)}</div></Td>
                                <Td><Badge tone="info">{r.targetType}</Badge> <Link href={href(r.targetType, r.targetId)} className="text-brand hover:underline">{r.target_label ?? `#${r.targetId}`}</Link></Td>
                                <Td className="text-xs">{r.requested_by}</Td>
                                <Td className="max-w-md whitespace-pre-wrap text-xs">{r.reason}</Td>
                                <Td className="text-right text-xs">{r.confidence != null ? `${Math.round(Number(r.confidence) * 100)}%` : "—"}</Td>
                                <Td><StatusBadge status={r.status === "open" ? "pending" : r.status === "resolved" ? "success" : "rejected"} />{r.resolver_name && <div className="text-[11px] text-ink-3">{r.resolver_name}{r.resolution ? `: ${r.resolution}` : ""}</div>}</Td>
                                <Td>
                                    {r.status === "open" && (
                                        <form action={closeRequest} className="flex flex-col gap-1">
                                            <input type="hidden" name="id" value={r.id} />
                                            <input name="resolution" placeholder="note (optional)" className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs" />
                                            <div className="flex gap-1">
                                                <Button type="submit" name="status" value="resolved" kind="primary">Resolved</Button>
                                                <Button type="submit" name="status" value="dismissed">Dismiss</Button>
                                            </div>
                                        </form>
                                    )}
                                </Td>
                            </tr>
                        ))}
                    </Table>
                )}
                <Pager page={page} size={size} total={total} params={{ status, type: sp.type }} />
            </Card>
        </>
    );
}
