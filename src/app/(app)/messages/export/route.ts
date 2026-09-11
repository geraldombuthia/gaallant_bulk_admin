import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/auth/session";
import { exportMessages } from "@/lib/db/messages";
import { audit } from "@/lib/audit";

/** CSV of the current filter, capped at 10,000 rows. Exports are audited. */
export async function GET(req: NextRequest) {
    const session = await readSession();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });
    const sp = req.nextUrl.searchParams;
    const f = { q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, mode: (sp.get("mode") || undefined) as "live" | "test" | undefined,
        user: sp.get("user") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, dlr: (sp.get("dlr") || undefined) as "received" | "none" | undefined };
    const rows = await exportMessages(f);
    await audit({ adminId: session.id, action: "messages.export", targetType: "messages", reason: JSON.stringify(f), after: { rows: rows.length } });

    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
    const head = ["id", "sent_at", "account_email", "phone", "mode", "status", "reason", "delivery_code", "delivery_detail", "dlr_received_at", "cost", "transaction_id", "message"];
    const lines = [head.join(",")].concat(rows.map((m) => [
        m.id, new Date(m.createdAt).toISOString(), m.owner_email, m.phoneNumber, m.isTest ? "test" : "live", m.deliveryStatus, m.reason,
        m.deliveryCode, m.deliveryDetail, m.dlrReceivedAt ? new Date(m.dlrReceivedAt).toISOString() : "", m.cost, m.transactionId, m.message,
    ].map(esc).join(",")));
    return new NextResponse(lines.join("\r\n"), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="messages-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
}
