import { NextResponse, type NextRequest } from "next/server";
import { checkApiToken } from "@/lib/auth/apiToken";
import { unreviewedMessages } from "@/lib/db/verdicts";
import { review, worst } from "@/lib/compliance";

/**
 * GET /api/review/unreviewed?page=1&limit=200&days=30
 * Live messages with no verdict yet, oldest first, each with the
 * deterministic analysis attached. The work queue for an AI reviewer:
 * fetch a page, decide, POST the verdicts, fetch the next page.
 */
export async function GET(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(500, Number(sp.get("limit") ?? 200) || 200);
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const days = Math.min(365, Number(sp.get("days") ?? 30) || 30);
    const { rows, total } = await unreviewedMessages(limit, (page - 1) * limit, days);
    return NextResponse.json({
        total, page, page_count: Math.max(1, Math.ceil(total / limit)), limit,
        messages: rows.map((m) => {
            const flags = review(m.message).filter((f) => f.id !== "no-variables");
            return { id: m.id, user_id: m.userId, owner_email: m.owner_email, phone: m.phoneNumber, sent_at: m.createdAt, content: m.message,
                analysis: { worst: worst(flags), flags: flags.map((f) => ({ id: f.id, severity: f.severity, matched: f.match ?? null, why: f.detail })) } };
        }),
    });
}
