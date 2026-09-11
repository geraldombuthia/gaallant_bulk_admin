import { NextResponse, type NextRequest } from "next/server";
import { checkApiToken } from "@/lib/auth/apiToken";
import { listReviewRequests } from "@/lib/db/reviewRequests";

/** GET /api/review/requests?status=open|resolved|dismissed|all&type=template&page=1&limit=50 */
export async function GET(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const sp = req.nextUrl.searchParams;
    const status = (sp.get("status") ?? "open") as "open" | "resolved" | "dismissed" | "all";
    const type = (sp.get("type") || undefined) as "template" | "message" | "user" | undefined;
    const limit = Math.min(200, Number(sp.get("limit") ?? 50) || 50);
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const { rows, total } = await listReviewRequests({ status, type }, limit, (page - 1) * limit);
    return NextResponse.json({ total, page, page_count: Math.max(1, Math.ceil(total / limit)), requests: rows });
}
