import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkApiToken } from "@/lib/auth/apiToken";
import { recordVerdicts, verdictCounts } from "@/lib/db/verdicts";
import { requestReview } from "@/lib/db/reviewRequests";

/**
 * POST /api/review/verdicts
 * { reviewer, verdicts: [{ targetType?: "message", targetId, verdict: clean|marketing|unsure, confidence?, note? }] }
 * Up to 500 per call. Recorded with is_human = 0: an API verdict is never
 * "confirmed". Any "unsure", or "marketing" below the escalate threshold,
 * also opens a human-review request so a person sees it.
 *
 * GET /api/review/verdicts?days=30 -- counts by state, for a dashboard or a
 * sanity check that the reviewer is keeping up.
 */
const schema = z.object({
    reviewer: z.string().min(1).max(60),
    escalate_below: z.number().min(0).max(1).default(0.8),
    verdicts: z.array(z.object({
        targetType: z.enum(["message", "template"]).default("message"),
        targetId: z.number().int().positive(),
        verdict: z.enum(["clean", "marketing", "unsure"]),
        confidence: z.number().min(0).max(1).optional(),
        note: z.string().max(1000).optional(),
    })).min(1).max(500),
});

export async function POST(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
    const { reviewer, verdicts, escalate_below } = parsed.data;
    const name = `${reviewer} (API)`;
    const n = await recordVerdicts(verdicts.map((v) => ({ ...v, is_human: false, reviewer: name })));
    let escalated = 0;
    for (const v of verdicts) {
        const low = v.verdict === "marketing" && (v.confidence ?? 1) < escalate_below;
        if (v.verdict === "unsure" || low) {
            await requestReview({ targetType: v.targetType, targetId: v.targetId, requested_by: name, confidence: v.confidence ?? null,
                reason: v.note ?? (v.verdict === "unsure" ? "Automated reviewer could not decide." : `Automated reviewer says marketing at ${Math.round((v.confidence ?? 0) * 100)}% confidence, below the ${Math.round(escalate_below * 100)}% threshold.`) });
            escalated += 1;
        }
    }
    return NextResponse.json({ ok: true, recorded: n, escalated_to_human: escalated });
}

export async function GET(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const days = Math.min(365, Number(req.nextUrl.searchParams.get("days") ?? 30) || 30);
    return NextResponse.json({ window_days: days, counts: await verdictCounts(days) });
}
