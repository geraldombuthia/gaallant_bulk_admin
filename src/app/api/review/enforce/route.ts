import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkApiToken, apiActorId } from "@/lib/auth/apiToken";
import { warnUser, warningCount } from "@/lib/db/verdicts";
import { setStatus } from "@/lib/db/users";
import { requestReview } from "@/lib/db/reviewRequests";

/**
 * POST /api/review/enforce
 * { userId, action: "warn"|"suspend"|"request_suspension", reason, reviewer?, message_ids? }
 *
 * warn                notification to the user + audit; the count of prior
 *                     warnings is returned so the caller can escalate
 * suspend             sets the account to suspended -- API keys are refused
 *                     by the main app's middleware from the next request.
 *                     Allowed only when ENFORCE_API_MAY_SUSPEND=1; otherwise
 *                     it is downgraded to request_suspension
 * request_suspension  opens a human-review request on the user; a person
 *                     decides. The default for an automated reviewer.
 */
const schema = z.object({
    userId: z.number().int().positive(),
    action: z.enum(["warn", "suspend", "request_suspension"]),
    reason: z.string().min(10).max(2000),
    reviewer: z.string().max(60).default("automated reviewer"),
    message_ids: z.array(z.number().int()).max(50).default([]),
});

export async function POST(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
    const { userId, reason, reviewer, message_ids } = parsed.data;
    let { action } = parsed.data;
    const actor = { id: apiActorId(), name: `${reviewer} (API)` };
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
    try {
        if (action === "suspend" && process.env.ENFORCE_API_MAY_SUSPEND !== "1") action = "request_suspension";
        if (action === "warn") {
            const n = await warnUser(userId, reason, actor, ip, message_ids);
            return NextResponse.json({ ok: true, action, warnings_now: n, suggest: n >= 3 ? "request_suspension" : "none" });
        }
        if (action === "suspend") {
            await setStatus(userId, "suspended", `${reason} [${actor.name}]`, actor, ip);
            return NextResponse.json({ ok: true, action, status: "suspended" });
        }
        const prior = await warningCount(userId);
        const r = await requestReview({ targetType: "user", targetId: userId, requested_by: actor.name,
            reason: `Suspension requested. ${reason}${prior ? ` Prior warnings: ${prior}.` : ""}${message_ids.length ? ` Messages: ${message_ids.join(", ")}.` : ""}` });
        return NextResponse.json({ ok: true, action: "request_suspension", request_id: r.id, prior_warnings: prior });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 409 });
    }
}
