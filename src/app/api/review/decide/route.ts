import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkApiToken, apiActorId } from "@/lib/auth/apiToken";
import { decide } from "@/lib/db/templates";
import { requestReview } from "@/lib/db/reviewRequests";

/**
 * POST /api/review/decide  { templateId, decision: "approve"|"reject"|"changes"|"escalate", note, reviewer?, confidence? }
 *
 * Same transaction as the console: status, owner notification and audit
 * row together. Recorded under REVIEW_API_ACTOR with the note prefixed by
 * the reviewer name given, so the audit log shows it was automated and by
 * what. A note is required for reject and changes, as in the console.
 */
const schema = z.object({
    templateId: z.number().int().positive(),
    // "escalate" asks a human to decide: it records a review request with
    // the reason and changes nothing the owner can see
    decision: z.enum(["approve", "reject", "changes", "escalate"]),
    note: z.string().max(2000).default(""),
    reviewer: z.string().max(60).default("automated reviewer"),
    confidence: z.number().min(0).max(1).optional(),
});

export async function POST(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
    const { templateId, decision, note, reviewer, confidence } = parsed.data;
    try {
        const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
        if (decision === "escalate") {
            const r = await requestReview({ targetType: "template", targetId: templateId, requested_by: `${reviewer} (API)`, reason: note, confidence: confidence ?? null });
            return NextResponse.json({ ok: true, templateId, status: "human_review_requested", request_id: r.id, created: r.created });
        }
        const result = await decide(templateId, decision, note, { id: apiActorId(), name: `${reviewer} (API)` }, ip);
        return NextResponse.json({ ok: true, templateId, status: result.status, owner_id: result.owner });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 409 });
    }
}
