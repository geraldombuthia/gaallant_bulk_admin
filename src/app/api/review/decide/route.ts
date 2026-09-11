import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkApiToken, apiActorId } from "@/lib/auth/apiToken";
import { decide } from "@/lib/db/templates";

/**
 * POST /api/review/decide  { templateId, decision: "approve"|"reject"|"changes", note, reviewer? }
 *
 * Same transaction as the console: status, owner notification and audit
 * row together. Recorded under REVIEW_API_ACTOR with the note prefixed by
 * the reviewer name given, so the audit log shows it was automated and by
 * what. A note is required for reject and changes, as in the console.
 */
const schema = z.object({
    templateId: z.number().int().positive(),
    decision: z.enum(["approve", "reject", "changes"]),
    note: z.string().max(2000).default(""),
    reviewer: z.string().max(60).default("automated reviewer"),
});

export async function POST(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
    const { templateId, decision, note, reviewer } = parsed.data;
    try {
        const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
        const result = await decide(templateId, decision, note, { id: apiActorId(), name: `${reviewer} (API)` }, ip);
        return NextResponse.json({ ok: true, templateId, status: result.status, owner_id: result.owner });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 409 });
    }
}
