import { NextResponse, type NextRequest } from "next/server";
import { checkApiToken } from "@/lib/auth/apiToken";
import { scanSent, byAccount, sentCounts } from "@/lib/db/compliance";

/**
 * GET /api/review/scan?days=7&min=warn&user=ID&limit=2000
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
    const [scan, counts] = await Promise.all([scanSent({ sinceDays: days, minSeverity: min, userId, limit: Number(sp.get("limit") ?? 2000) }), sentCounts(days)]);
    const accounts = byAccount(scan.hits, counts);
    return NextResponse.json({
        window_days: days, scanned: scan.scanned, flagged: scan.hits.length,
        accounts: accounts.map((a) => ({ user_id: a.userId, name: a.owner_name, email: a.owner_email, sent: a.sent, flagged: a.flagged, blocking: a.blocked, flagged_rate: a.rate, top_flags: a.topFlags,
            example: { message_id: a.sample.id, content: a.sample.message, flags: a.sample.flags.map((f) => f.id) } })),
        messages: scan.hits.slice(0, 500).map((h) => ({ id: h.id, user_id: h.userId, sent_at: h.createdAt, content: h.message, worst: h.worst, flags: h.flags.map((f) => ({ id: f.id, severity: f.severity, matched: f.match ?? null })) })),
    });
}
