import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkApiToken } from "@/lib/auth/apiToken";
import { requestReview } from "@/lib/db/reviewRequests";

/**
 * POST /api/review/request
 * { targetType: "template"|"message"|"user", targetId, reason, requested_by?, confidence? }
 * Asks a human to look at something. Idempotent per open target: a repeat
 * appends to the reason rather than creating a second request.
 */
const schema = z.object({
    targetType: z.enum(["template", "message", "user"]),
    targetId: z.number().int().positive(),
    reason: z.string().min(10).max(4000),
    requested_by: z.string().max(60).default("automated reviewer"),
    confidence: z.number().min(0).max(1).optional(),
});

export async function POST(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
    const d = parsed.data;
    const r = await requestReview({ targetType: d.targetType, targetId: d.targetId, requested_by: `${d.requested_by} (API)`, reason: d.reason, confidence: d.confidence ?? null });
    return NextResponse.json({ ok: true, request_id: r.id, created: r.created, url: `/reviews` });
}
