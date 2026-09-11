import { NextResponse, type NextRequest } from "next/server";
import { checkApiToken } from "@/lib/auth/apiToken";
import { listTemplates } from "@/lib/db/templates";
import { review, segments, worst } from "@/lib/compliance";
import type { TemplateStatus } from "@/lib/db/types";

/**
 * GET /api/review/queue?status=pending&page=1&limit=50&human_review=1
 * Each template with its analysis and owner context. Paged; the response
 * carries total, page and page_count so a caller can walk the whole queue.
 * human_review=1 restricts to templates a reviewer has already escalated.
 */
export async function GET(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const sp = req.nextUrl.searchParams;
    const status = (sp.get("status") ?? "pending") as TemplateStatus | "all";
    const limit = Math.min(200, Number(sp.get("limit") ?? 50) || 50);
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const humanReview = sp.get("human_review") === "1";
    const { rows, total } = await listTemplates({ status, humanReview }, limit, (page - 1) * limit);
    return NextResponse.json({
        total, page, page_count: Math.max(1, Math.ceil(total / limit)), limit,
        templates: rows.map((t) => {
            const flags = review(t.msg_content);
            return {
                id: t.id, name: t.template_name, slug: t.slug, type: t.type, status: t.status,
                content: t.msg_content, variables: Array.isArray(t.variables) ? t.variables : [],
                segments: segments(t.msg_content),
                owner: { id: t.userId, name: t.owner_name, email: t.owner_email },
                submitted_at: t.createdAt, previous_note: t.rejection_reason,
                human_review_requested: Number(t.human_review_open ?? 0) > 0,
                analysis: { worst: worst(flags), flags: flags.map((f) => ({ id: f.id, severity: f.severity, title: f.title, matched: f.match ?? null, why: f.detail, suggested_note: f.suggestion })) },
            };
        }),
    });
}
