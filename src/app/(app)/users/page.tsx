import Link from "next/link";
import { listUsers } from "@/lib/db/users";
import { paging } from "@/lib/db/pool";
import { Card, Table, Td, StatusBadge, Pager, Filters, Field, inputCls, Empty, PageHeader, Badge } from "@/components/ui";
import { ago, num } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

type SP = { q?: string; role?: string; status?: string; balance?: string; activity?: string; sort?: string; page?: string };

export default async function Users({ searchParams }: { searchParams: Promise<SP> }) {
    const sp = await searchParams;
    const { page, size, offset } = paging(sp);
    const { rows, total } = await listUsers(sp as Parameters<typeof listUsers>[0], size, offset);
    return (
        <>
            <PageHeader title="Users" subtitle={`${num(total)} account${total === 1 ? "" : "s"} in this filter`} />
            <Filters reset="/users">
                <Field label="Search"><input name="q" defaultValue={sp.q} placeholder="name, email, username, phone" className={`${inputCls} w-56`} /></Field>
                <Field label="Role"><select name="role" defaultValue={sp.role ?? ""} className={inputCls}><option value="">Any</option><option value="user">User</option><option value="admin">Admin</option><option value="superadmin">Superadmin</option></select></Field>
                <Field label="Status"><select name="status" defaultValue={sp.status ?? ""} className={inputCls}><option value="">Any</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select></Field>
                <Field label="Balance"><select name="balance" defaultValue={sp.balance ?? ""} className={inputCls}><option value="">Any</option><option value="zero">Zero</option><option value="low">Under 10</option></select></Field>
                <Field label="Activity"><select name="activity" defaultValue={sp.activity ?? ""} className={inputCls}><option value="">Any</option><option value="active30">Sent in 30d</option><option value="idle30">Paid, idle 30d</option><option value="never">Never paid</option></select></Field>
                <Field label="Sort"><select name="sort" defaultValue={sp.sort ?? "newest"} className={inputCls}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="balance">Balance</option><option value="messages">Most active</option><option value="name">Name</option></select></Field>
            </Filters>
            <Card>
                {rows.length === 0 ? <Empty>No accounts match.</Empty> : (
                    <Table head={["Account", "Role", "Status", "Balance", "Sent · 30d", "Keys", "Last sign-in", "Joined"]}>
                        {rows.map((u) => (
                            <tr key={u.id} className="hover:bg-surface-2/60">
                                <Td><Link href={`/users/${u.id}`} className="font-medium text-brand hover:underline">{u.name}</Link><div className="text-xs text-ink-3">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div></Td>
                                <Td>{u.role === "user" ? <span className="text-xs text-ink-3">user</span> : <Badge tone="info">{u.role}</Badge>}</Td>
                                <Td><StatusBadge status={u.statuc} />{!u.registered_at && <div className="mt-0.5 text-[11px] text-ink-3">unpaid</div>}</Td>
                                <Td className="text-right">{num(u.balance ?? 0)}</Td>
                                <Td className="text-right">{num(u.messages_30d)}</Td>
                                <Td className="text-xs text-ink-3">{u.keys_live} live · {u.keys_test} test</Td>
                                <Td className="text-xs text-ink-3">{ago(u.last_sign_in)}</Td>
                                <Td className="text-xs text-ink-3">{ago(u.created_at)}</Td>
                            </tr>
                        ))}
                    </Table>
                )}
                <Pager page={page} size={size} total={total} params={{ ...sp, page: undefined }} />
            </Card>
        </>
    );
}
