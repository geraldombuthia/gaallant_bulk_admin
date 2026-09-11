import { NextResponse, type NextRequest } from "next/server";
import { checkApiToken } from "@/lib/auth/apiToken";
import { scanSent, byAccount, sentCounts } from "@/lib/db/compliance";

/**
 * GET /api/review/scan?days=7&min=warn&user=ID&page=1&page_size=100
 * Scans up to 5,000 recent messages; the flagged list is paged.
 * Live messages already sent that read as marketing, grouped by account.
 * This is the enforcement side: approval controls the template, this sees
 * what went into the variables.
 */
export async function GET(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const sp = req.nextUrl.searchParams;
    const days = Math.min(365, Math.max(1, Number(sp.get("days") ?? 7) || 7));
    const min = (["block", "warn", "note"].includes(sp.get("min") ?? "") ? sp.get("min") : "warn") as "block" | "warn" | "note";
    const userId = sp.get("user") ? Number(sp.get("user")) : undefined;
    const [scan, counts] = await Promise.all([scanSent({ sinceDays: days, minSeverity: min, userId, limit: 5000 }), sentCounts(days)]);
    const accounts = byAccount(scan.hits, counts);
    const pageSize = Math.min(500, Math.max(10, Number(sp.get("page_size") ?? 100) || 100));
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const slice = scan.hits.slice((page - 1) * pageSize, page * pageSize);
    return NextResponse.json({
        window_days: days, scanned: scan.scanned, flagged: scan.hits.length,
        page, page_size: pageSize, page_count: Math.max(1, Math.ceil(scan.hits.length / pageSize)),
        accounts: accounts.map((a) => ({ user_id: a.userId, name: a.owner_name, email: a.owner_email, sent: a.sent, flagged: a.flagged, blocking: a.blocked, flagged_rate: a.rate, top_flags: a.topFlags,
            example: { message_id: a.sample.id, content: a.sample.message, flags: a.sample.flags.map((f) => f.id) } })),
        messages: slice.map((h) => ({ id: h.id, user_id: h.userId, sent_at: h.createdAt, content: h.message, worst: h.worst, flags: h.flags.map((f) => ({ id: f.id, severity: f.severity, matched: f.match ?? null })) })),
    });
}
