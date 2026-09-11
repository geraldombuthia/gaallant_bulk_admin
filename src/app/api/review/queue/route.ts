import { NextResponse, type NextRequest } from "next/server";
import { checkApiToken } from "@/lib/auth/apiToken";
import { listTemplates } from "@/lib/db/templates";
import { review, segments, worst } from "@/lib/compliance";
import type { TemplateStatus } from "@/lib/db/types";

/** GET /api/review/queue?status=pending&limit=50 -- each template with its analysis and owner context */
export async function GET(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const sp = req.nextUrl.searchParams;
    const status = (sp.get("status") ?? "pending") as TemplateStatus | "all";
    const limit = Math.min(200, Number(sp.get("limit") ?? 50) || 50);
    const { rows, total } = await listTemplates({ status }, limit, 0);
    return NextResponse.json({
        total,
        templates: rows.map((t) => {
            const flags = review(t.msg_content);
            return {
                id: t.id, name: t.template_name, slug: t.slug, type: t.type, status: t.status,
                content: t.msg_content, variables: Array.isArray(t.variables) ? t.variables : [],
                segments: segments(t.msg_content),
                owner: { id: t.userId, name: t.owner_name, email: t.owner_email },
                submitted_at: t.createdAt, previous_note: t.rejection_reason,
                analysis: { worst: worst(flags), flags: flags.map((f) => ({ id: f.id, severity: f.severity, title: f.title, matched: f.match ?? null, why: f.detail, suggested_note: f.suggestion })) },
            };
        }),
    });
}
