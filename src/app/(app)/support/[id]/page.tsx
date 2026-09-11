import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupport } from "@/lib/db/support";
import { getUser } from "@/lib/db/users";
import { Card, Dl, StatusBadge, PageHeader, Badge, Button } from "@/components/ui";
import { when, num } from "@/lib/format";
import { ReplyForm } from "./form";
import { changeStatus, changePriority } from "./actions";

export const dynamic = "force-dynamic";

export default async function SupportThread({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const data = await getSupport(Number(id));
    if (!data) notFound();
    const { message: s, replies } = data;
    const owner = await getUser(s.userId);
    return (
        <>
            <PageHeader title={s.subject} subtitle={<>from <Link className="text-brand" href={`/users/${s.userId}`}>{s.owner_name}</Link> · {when(s.created_at)}</>}
                action={<div className="flex gap-2">{s.priority === "high" && <Badge tone="danger">high priority</Badge>}<StatusBadge status={s.status} /></div>} />
            <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
                <div className="space-y-3">
                    <Card>
                        <div className="px-4 py-3">
                            <div className="mb-1 text-xs text-ink-3">{s.owner_name} · {when(s.created_at)}</div>
                            <p className="whitespace-pre-wrap text-sm">{s.body}</p>
                        </div>
                    </Card>
                    {replies.map((r) => (
                        <Card key={r.id} className={r.authorRole === "admin" ? "border-brand/30 bg-brand-soft/40" : ""}>
                            <div className="px-4 py-3">
                                <div className="mb-1 text-xs text-ink-3">{r.authorRole === "admin" ? `${r.author_name} (Gallant)` : r.author_name} · {when(r.created_at)}</div>
                                <p className="whitespace-pre-wrap text-sm">{r.body}</p>
                            </div>
                        </Card>
                    ))}
                    <Card title="Reply"><div className="px-4 py-3">{s.status === "closed" ? <p className="text-sm text-ink-3">Closed. Reopen to reply.</p> : <ReplyForm id={s.id} />}</div></Card>
                </div>
                <div className="space-y-4">
                    <Card title="Account">
                        <div className="px-4 py-3">
                            <Dl items={[
                                ["Name", <Link key="n" className="text-brand" href={`/users/${s.userId}`}>{owner?.name}</Link>],
                                ["Email", owner?.email ?? "—"],
                                ["Status", <StatusBadge key="s" status={owner?.statuc} />],
                                ["Balance", `${num(owner?.balance ?? 0)} credits`],
                                ["Sent · 30d", num(owner?.messages_30d ?? 0)],
                            ]} />
                        </div>
                    </Card>
                    <Card title="Actions">
                        <div className="space-y-2 px-4 py-3">
                            <form action={changeStatus}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value={s.status === "closed" ? "open" : "closed"} />
                                <Button type="submit" className="w-full">{s.status === "closed" ? "Reopen" : "Close"}</Button></form>
                            <form action={changePriority}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="priority" value={s.priority === "high" ? "normal" : "high"} />
                                <Button type="submit" className="w-full">{s.priority === "high" ? "Set normal priority" : "Mark high priority"}</Button></form>
                        </div>
                    </Card>
                </div>
            </div>
        </>
    );
}
