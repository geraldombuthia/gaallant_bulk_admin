import { recentBatches } from "@/lib/email";
import { Card, Table, Td, PageHeader, Empty, Badge } from "@/components/ui";
import { when } from "@/lib/format";
import { ComposeForm } from "./form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email" };

export default async function Email() {
    const batches = await recentBatches();
    const configured = Boolean(process.env.EMAIL_ADDRESS && process.env.EMAIL_PASS);
    return (
        <>
            <PageHeader title="Email" subtitle="Send to one address, one account, or a segment. Every message is logged before it is sent." />
            {!configured && <div role="alert" className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">EMAIL_ADDRESS / EMAIL_PASS are not set. Sends will be recorded as failed until they are.</div>}
            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
                <Card title="Compose"><div className="px-4 py-3"><ComposeForm /></div></Card>
                <Card title="Recent batches">
                    {batches.length === 0 ? <Empty>Nothing sent yet.</Empty> : (
                        <Table head={["When", "Subject", "By", "Recipients", "Sent", "Failed", "Last error"]}>
                            {batches.map((b) => (
                                <tr key={b.batchId}>
                                    <Td className="whitespace-nowrap text-xs">{when(b.created_at)}</Td>
                                    <Td>{b.subject}</Td>
                                    <Td className="text-xs text-ink-3">{b.admin_name}</Td>
                                    <Td className="text-right">{b.total}</Td>
                                    <Td className="text-right"><Badge tone={Number(b.sent) > 0 ? "success" : "neutral"}>{b.sent}</Badge></Td>
                                    <Td className="text-right">{Number(b.failed) > 0 ? <Badge tone="danger">{b.failed}</Badge> : "—"}</Td>
                                    <Td className="max-w-xs text-xs text-red-800"><span className="block truncate" title={b.sample_error ?? ""}>{b.sample_error ?? ""}</span></Td>
                                </tr>
                            ))}
                        </Table>
                    )}
                </Card>
            </div>
        </>
    );
}
