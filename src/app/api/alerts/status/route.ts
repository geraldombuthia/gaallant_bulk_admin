import { NextResponse, type NextRequest } from "next/server";
import { checkApiToken } from "@/lib/auth/apiToken";
import { computeRunway } from "@/lib/alerts";

/** GET /api/alerts/status -- runway without polling or notifying */
export async function GET(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json(await computeRunway());
}
