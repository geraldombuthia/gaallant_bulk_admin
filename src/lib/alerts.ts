import { daily, project } from "./db/usage";
import { latestBalance, getSettings, setSetting, pollProviderBalance } from "./db/provider";
import { financeSummary } from "./db/finance";
import { notifyUser } from "./notify";
import { audit } from "./audit";
import { apiActorId } from "./auth/apiToken";

/**
 * Runway: how long the gateway balance lasts at the current burn.
 *
 *   burn      = projected messages per day (trend over the last 28 days)
 *   runway    = gateway units / burn
 *   committed = units customers have paid for but not yet sent -- every one
 *               of these is a message the gateway must still carry, so the
 *               gateway balance has to cover them regardless of the burn
 *
 * "Low" is either fewer than N days of runway, or fewer than N units, or
 * the balance not covering what customers already hold. Each is configurable.
 */
export interface Runway {
    gatewayUnits: number | null;
    gatewayPolledAt: Date | null;
    gatewayError: string | null;
    burnPerDay: number;
    burnReliable: boolean;
    runwayDays: number | null;
    committedUnits: number;
    coverage: number | null;      // gatewayUnits / committedUnits
    projectedNext30: number;
    reasons: string[];            // why this is an alert, empty if healthy
    level: "ok" | "warn" | "critical" | "unknown";
}

export async function computeRunway(): Promise<Runway> {
    const [bal, series, fin, settings] = await Promise.all([latestBalance(), daily(60), financeSummary(0), getSettings()]);
    const p = project(series.map((d) => d.sent), 28, 30);
    const gatewayUnits = bal?.ok && bal.units != null ? Number(bal.units) : null;
    const committed = fin.units.outstanding;
    const runwayDays = gatewayUnits != null && p.perDay > 0 ? gatewayUnits / p.perDay : null;
    const minDays = Number(settings.alert_min_runway_days);
    const minUnits = Number(settings.alert_min_units);

    const reasons: string[] = [];
    if (gatewayUnits == null) {
        // Not an alert in itself, but the reader must know the number is missing
    } else {
        if (gatewayUnits < minUnits) reasons.push(`Gateway balance ${fmt(gatewayUnits)} units is below the ${fmt(minUnits)} floor.`);
        if (runwayDays != null && runwayDays < minDays) reasons.push(`At ${fmt(p.perDay)} messages/day the balance lasts ${runwayDays.toFixed(1)} days (floor ${minDays}).`);
        if (committed > gatewayUnits) reasons.push(`Customers hold ${fmt(committed)} unsent units but the gateway has only ${fmt(gatewayUnits)} -- a burst could fail mid-batch.`);
    }
    const level: Runway["level"] = gatewayUnits == null ? "unknown"
        : reasons.length === 0 ? "ok"
        : (runwayDays != null && runwayDays < minDays / 2) || committed > gatewayUnits ? "critical" : "warn";

    return {
        gatewayUnits, gatewayPolledAt: bal?.polled_at ?? null, gatewayError: bal && !bal.ok ? bal.error : null,
        burnPerDay: p.perDay, burnReliable: p.reliable, runwayDays, committedUnits: committed,
        coverage: gatewayUnits != null && committed > 0 ? gatewayUnits / committed : null,
        projectedNext30: p.next30, reasons, level,
    };
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-KE");

/**
 * The scheduled check. Polls the gateway if the last snapshot is older than
 * the poll interval, computes runway, and if it is low and the reminder
 * interval has passed since the last alert, notifies each configured admin
 * on their dashboard and records the alert. Returns what it did, for the
 * caller's log.
 */
export async function runAlertCheck(force = false) {
    const settings = await getSettings();
    const pollEvery = Number(settings.balance_poll_interval_hours) * 3600 * 1000;
    const last = await latestBalance();
    let polled = false;
    if (force || !last || Date.now() - new Date(last.polled_at).getTime() > pollEvery) {
        await pollProviderBalance();
        polled = true;
    }
    const runway = await computeRunway();
    const remindEvery = Number(settings.alert_interval_hours) * 3600 * 1000;
    const lastAlertAt = settings.last_alert_at ? new Date(settings.last_alert_at).getTime() : 0;
    const due = Date.now() - lastAlertAt > remindEvery;
    const notified: number[] = [];

    if (runway.level !== "ok" && runway.level !== "unknown" && (due || force)) {
        const recipients = String(settings.alert_recipients).split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
        const title = runway.level === "critical" ? "Gateway credits critically low -- top up now" : "Gateway credits running low";
        const body = [
            ...runway.reasons,
            "",
            `Balance: ${runway.gatewayUnits == null ? "unknown" : fmt(runway.gatewayUnits)} units · burn ${fmt(runway.burnPerDay)}/day · projected next 30 days ${fmt(runway.projectedNext30)}.`,
            "Record the purchase on the admin console's Usage page once made, so spend and runway stay accurate.",
        ].join("\n");
        for (const id of recipients) {
            await notifyUser(id, { title, message: body, type: "alert", severity: runway.level === "critical" ? "error" : "warning", metadata: { runway } });
            notified.push(id);
        }
        await setSetting("last_alert_at", new Date().toISOString(), null);
        await setSetting("last_alert_level", runway.level, null);
        await audit({ adminId: apiActorId(), action: `alert.${runway.level}`, targetType: "provider", reason: runway.reasons.join(" "), after: { notified, gatewayUnits: runway.gatewayUnits, runwayDays: runway.runwayDays } });
    }
    return { polled, runway, notified, due };
}
