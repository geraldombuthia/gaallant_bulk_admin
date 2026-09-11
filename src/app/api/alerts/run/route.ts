import { NextResponse, type NextRequest } from "next/server";
import { checkApiToken } from "@/lib/auth/apiToken";
import { runAlertCheck } from "@/lib/alerts";

/**
 * GET /api/alerts/run?force=1
 * The scheduled entry point. Call it from cron every hour; it polls the
 * gateway only when the snapshot is stale and reminds only when the
 * configured interval has passed, so calling it often is harmless.
 *
 *   0 * * * *  curl -s -H "Authorization: Bearer $REVIEW_API_TOKEN" https://admin.example/api/alerts/run
 */
export async function GET(req: NextRequest) {
    if (!checkApiToken(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const force = req.nextUrl.searchParams.get("force") === "1";
    const r = await runAlertCheck(force);
    return NextResponse.json({ polled: r.polled, level: r.runway.level, reasons: r.runway.reasons, notified: r.notified, reminder_due: r.due,
        gateway_units: r.runway.gatewayUnits, burn_per_day: Math.round(r.runway.burnPerDay * 10) / 10, runway_days: r.runway.runwayDays == null ? null : Math.round(r.runway.runwayDays * 10) / 10 });
}
