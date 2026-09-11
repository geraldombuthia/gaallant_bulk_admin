import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkApiToken } from "@/lib/auth/apiToken";
import { review, segments, worst } from "@/lib/compliance";

/**
 * POST /api/review
 * Body: { content: string } or { contents: string[] }  (max 200)
 *
 * Returns the transactional-compliance analysis for each text: flags with
 * severity, what matched, a plain explanation, and suggested wording for a
 * note to the sender. Deterministic; the same text always gets the same
 * answer. Meant as ground truth an AI reviewer can cite, and as a first
 * pass it can run before spending a model call.
 */
// kind: "template" has {{ placeholders }} and is judged as one; "message" is
// text as sent, where the absence of placeholders means nothing.
const schema = z.union([
    z.object({ content: z.string().max(2000), kind: z.enum(["template", "message"]).default("template") }),
    z.object({ contents: z.array(z.string().max(2000)).max(200), kind: z.enum(["template", "message"]).default("template") }),
]);

function analyse(text: string, kind: "template" | "message") {
    const flags = review(text).filter((f) => kind === "template" || f.id !== "no-variables");
    const seg = segments(text);
    const w = worst(flags);
    return {
        verdict: w === "block" ? "not_transactional" : w === "warn" ? "needs_review" : "looks_transactional",
        worst: w,
        segments: seg,
        flags: flags.map((f) => ({ id: f.id, severity: f.severity, title: f.title, matched: f.match ?? null, why: f.detail, suggested_note: f.suggestion })),
        suggested_decision: w === "block" ? "reject_or_request_changes" : w === "warn" ? "read_and_decide" : "approve_if_context_fits",
    };
}

export async function POST(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "body must be { content } or { contents: [] }" }, { status: 400 });
    const d = parsed.data;
    if ("content" in d) return NextResponse.json({ policy: POLICY, kind: d.kind, result: analyse(d.content, d.kind) });
    return NextResponse.json({ policy: POLICY, kind: d.kind, results: d.contents.map((c) => ({ content: c, ...analyse(c, d.kind) })) });
}

export async function GET(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json({
        policy: POLICY,
        endpoints: {
            "POST /api/review": "analyse { content } or { contents[] }; kind: template (default) | message",
            "GET  /api/review/queue?status=pending": "templates awaiting review, each with its analysis",
            "GET  /api/review/scan?days=7&min=warn&user=ID": "live messages already sent that read as marketing",
            "POST /api/review/decide": "{ templateId, decision: approve|reject|changes|escalate, note, confidence? } -- escalate asks a human to decide",
            "POST /api/review/request": "{ targetType: template|message|user, targetId, reason, confidence? } -- ask a human to look at anything",
            "GET  /api/review/requests?status=open&page=1": "open human-review requests",
            "GET  /api/review/unreviewed?page=1&limit=200": "sent messages with no verdict yet, oldest first, with analysis -- the AI work queue",
            "POST /api/review/verdicts": "{ reviewer, verdicts: [{ targetId, verdict: clean|marketing|unsure, confidence?, note? }] } -- up to 500; unsure or low-confidence marketing also asks a human",
            "GET  /api/review/verdicts?days=30": "counts by review state: unreviewed, ai_clean, ai_flagged, human_clean, human_flagged",
            "POST /api/review/enforce": "{ userId, action: warn|suspend|request_suspension, reason, message_ids? } -- suspend needs ENFORCE_API_MAY_SUSPEND=1, else becomes a request",
        },
    });
}

export const POLICY = {
    route: "transactional-only",
    allowed: ["order and payment confirmations", "receipts and invoices", "one-time codes and verification", "delivery and status updates about something the recipient initiated", "account and security alerts", "appointment reminders the recipient booked"],
    not_allowed: ["offers, discounts, sales, promotions", "product launches and announcements", "anything sent to people who did not initiate a transaction", "messages whose purpose is to get the recipient to buy, visit, click or call", "bulk broadcasts with no recipient-specific content"],
    test: "Would this message make sense to send to exactly one person because of something they just did? If it would make equal sense to send to everyone, it is marketing.",
};
