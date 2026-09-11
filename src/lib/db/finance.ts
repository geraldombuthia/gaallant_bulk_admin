import { query } from "./pool";
import type { RowDataPacket } from "mysql2/promise";

/**
 * The commercial picture, built from three sources that must agree:
 *
 *   Payments   cash that arrived (M-Pesa), by status
 *   Credits    the ledger: every top-up (KSh paid, SMS units bought, price)
 *              and every admin adjustment (units only)
 *   SMSCredits the live balance per account -- units not yet consumed
 *
 * Consumption is not written anywhere; a send decrements the balance. So
 *   consumed = units sold + units adjusted - units outstanding
 * and that derived figure, compared with the live messages actually sent,
 * is the reconciliation: if they drift apart, something is wrong with
 * billing.
 *
 * Revenue is recognised on consumption, not on sale. Outstanding units are
 * a liability -- money taken for a service not yet delivered. Cash in is
 * what the bank sees; recognised revenue is what was earned.
 */

const R = (v: unknown) => Number(v ?? 0);

export async function financeSummary(gatewayCost: number) {
    const [cash] = await query<RowDataPacket & { ok: string; okCount: number; pending: string; failed: string; okAll: string }>(
        `SELECT
            SUM(CASE WHEN transaction_status IN ('success','completed') AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount ELSE 0 END) AS ok,
            SUM(transaction_status IN ('success','completed') AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS okCount,
            SUM(CASE WHEN transaction_status = 'pending' THEN amount ELSE 0 END) AS pending,
            SUM(CASE WHEN transaction_status IN ('failed','cancelled') AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount ELSE 0 END) AS failed,
            SUM(CASE WHEN transaction_status IN ('success','completed') THEN amount ELSE 0 END) AS okAll
         FROM Payments`
    );
    const [ledger] = await query<RowDataPacket & { paid: string; unitsSold: string; unitsAdjusted: string; weighted: string; unitsPriced: string }>(
        `SELECT
            SUM(CASE WHEN productType <> 'adjustment' THEN creditsValue ELSE 0 END) AS paid,
            SUM(CASE WHEN productType <> 'adjustment' THEN creditUnit ELSE 0 END) AS unitsSold,
            SUM(CASE WHEN productType = 'adjustment' THEN creditUnit ELSE 0 END) AS unitsAdjusted,
            SUM(CASE WHEN productType <> 'adjustment' AND price_per_unit > 0 THEN creditUnit * price_per_unit ELSE 0 END) AS weighted,
            SUM(CASE WHEN productType <> 'adjustment' AND price_per_unit > 0 THEN creditUnit ELSE 0 END) AS unitsPriced
         FROM Credits`
    );
    const [bal] = await query<RowDataPacket & { outstanding: string; accounts: number }>(`SELECT SUM(creditBalance) AS outstanding, COUNT(*) AS accounts FROM SMSCredits`);
    const [msgs] = await query<RowDataPacket & { live: number; live30: number; failed30: number; test30: number }>(
        `SELECT SUM(isTest = 0 AND deliveryStatus NOT IN ('failed','error','rejected')) AS live,
                SUM(isTest = 0 AND deliveryStatus NOT IN ('failed','error','rejected') AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS live30,
                SUM(isTest = 0 AND deliveryStatus IN ('failed','error','rejected') AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS failed30,
                SUM(isTest = 1 AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS test30
         FROM SMSMsg`
    );

    const unitsSold = R(ledger.unitsSold);
    const unitsAdjusted = R(ledger.unitsAdjusted);
    const outstanding = R(bal.outstanding);
    const consumed = unitsSold + unitsAdjusted - outstanding;
    // Average realised price: weighted by units where a price was recorded;
    // older rows carry price 0, so fall back to paid / units.
    const avgPrice = R(ledger.unitsPriced) > 0 ? R(ledger.weighted) / R(ledger.unitsPriced) : (unitsSold > 0 ? R(ledger.paid) / unitsSold : 0);
    const recognised = consumed * avgPrice;
    const deferred = outstanding * avgPrice;
    const gatewayCostTotal = R(msgs.live) * gatewayCost;

    return {
        cash: { ok30: R(cash.ok), okCount30: R(cash.okCount), pending: R(cash.pending), failed30: R(cash.failed), okAll: R(cash.okAll) },
        ledger: { paid: R(ledger.paid), unitsSold, unitsAdjusted, avgPrice },
        units: { outstanding, consumed, accounts: R(bal.accounts) },
        revenue: { recognised, deferred, gatewayCost: gatewayCostTotal, grossMargin: recognised - gatewayCostTotal,
            marginPct: recognised > 0 ? (recognised - gatewayCostTotal) / recognised : null },
        messages: { live: R(msgs.live), live30: R(msgs.live30), failed30: R(msgs.failed30), test30: R(msgs.test30) },
        reconciliation: {
            // consumed (derived from money) vs sent (observed): should be close.
            // Multi-segment messages consume more than one unit, so sent <= consumed
            // is normal; consumed << sent means messages went out unbilled.
            consumedDerived: consumed, sentObserved: R(msgs.live),
            gap: consumed - R(msgs.live),
            // ledger cash vs payments cash: every successful payment should
            // have a ledger row and vice versa
            ledgerPaid: R(ledger.paid), paymentsOk: R(cash.okAll), cashGap: R(ledger.paid) - R(cash.okAll),
        },
    };
}

/** Successful payments in each window, so the same number can be read at every grain */
export async function cashByPeriod() {
    const [r] = await query<RowDataPacket & Record<string, string | number>>(
        `SELECT
            SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN amount ELSE 0 END) AS hour,
            SUM(created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)) AS hourN,
            SUM(CASE WHEN created_at >= CURDATE() THEN amount ELSE 0 END) AS today,
            SUM(created_at >= CURDATE()) AS todayN,
            SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN amount ELSE 0 END) AS d7,
            SUM(created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)) AS d7N,
            SUM(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) THEN amount ELSE 0 END) AS d30,
            SUM(created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)) AS d30N,
            SUM(CASE WHEN created_at >= DATE_FORMAT(CURDATE(), '%Y-01-01') THEN amount ELSE 0 END) AS ytd,
            SUM(created_at >= DATE_FORMAT(CURDATE(), '%Y-01-01')) AS ytdN,
            SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR) THEN amount ELSE 0 END) AS y1,
            SUM(created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)) AS y1N,
            SUM(amount) AS all_time, COUNT(*) AS allN
         FROM Payments WHERE transaction_status IN ('success','completed')`
    );
    const g = (k: string) => ({ amount: R(r[k]), n: R(r[`${k}N`]) });
    return { hour: g("hour"), today: g("today"), d7: g("d7"), d30: g("d30"), ytd: g("ytd"), y1: g("y1"), all: { amount: R(r.all_time), n: R(r.allN) } };
}

export async function monthly(months = 12) {
    const cash = await query<RowDataPacket & { m: string; amount: string; n: number }>(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, SUM(amount) AS amount, COUNT(*) AS n FROM Payments
         WHERE transaction_status IN ('success','completed') AND created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH) GROUP BY m`, [months - 1]
    );
    const units = await query<RowDataPacket & { m: string; units: string; paid: string }>(
        `SELECT DATE_FORMAT(createdAt, '%Y-%m') AS m, SUM(creditUnit) AS units, SUM(creditsValue) AS paid FROM Credits
         WHERE productType <> 'adjustment' AND createdAt >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH) GROUP BY m`, [months - 1]
    );
    const sent = await query<RowDataPacket & { m: string; live: number; failed: number; test: number }>(
        `SELECT DATE_FORMAT(createdAt, '%Y-%m') AS m,
                SUM(isTest = 0 AND deliveryStatus NOT IN ('failed','error','rejected')) AS live,
                SUM(isTest = 0 AND deliveryStatus IN ('failed','error','rejected')) AS failed,
                SUM(isTest = 1) AS test
         FROM SMSMsg WHERE createdAt >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH) GROUP BY m`, [months - 1]
    );
    const signups = await query<RowDataPacket & { m: string; n: number; paid: number }>(
        `SELECT DATE_FORMAT(created_at, '%Y-%m') AS m, COUNT(*) AS n, SUM(registered_at IS NOT NULL) AS paid FROM users
         WHERE role = 'user' AND created_at >= DATE_SUB(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL ? MONTH) GROUP BY m`, [months - 1]
    );
    const rows: Record<string, { m: string; cash: number; payments: number; units: number; live: number; failed: number; test: number; signups: number; paidSignups: number }> = {};
    const d = new Date(); d.setDate(1);
    for (let i = months - 1; i >= 0; i--) {
        const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const m = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
        rows[m] = { m, cash: 0, payments: 0, units: 0, live: 0, failed: 0, test: 0, signups: 0, paidSignups: 0 };
    }
    cash.forEach((r) => { if (rows[r.m]) { rows[r.m].cash = R(r.amount); rows[r.m].payments = R(r.n); } });
    units.forEach((r) => { if (rows[r.m]) rows[r.m].units = R(r.units); });
    sent.forEach((r) => { if (rows[r.m]) { rows[r.m].live = R(r.live); rows[r.m].failed = R(r.failed); rows[r.m].test = R(r.test); } });
    signups.forEach((r) => { if (rows[r.m]) { rows[r.m].signups = R(r.n); rows[r.m].paidSignups = R(r.paid); } });
    return Object.values(rows);
}

export async function topAccounts(limit = 15) {
    return query<RowDataPacket & { id: number; name: string; email: string; paid: string; unitsSold: string; balance: string; live: number; live30: number; lastPayment: Date | null }>(
        `SELECT u.id, u.name, u.email,
                COALESCE((SELECT SUM(creditsValue) FROM Credits c WHERE c.userId = u.id AND c.productType <> 'adjustment'), 0) AS paid,
                COALESCE((SELECT SUM(creditUnit) FROM Credits c WHERE c.userId = u.id), 0) AS unitsSold,
                COALESCE(s.creditBalance, 0) AS balance,
                (SELECT COUNT(*) FROM SMSMsg m WHERE m.userId = u.id AND m.isTest = 0 AND m.deliveryStatus NOT IN ('failed','error','rejected')) AS live,
                (SELECT COUNT(*) FROM SMSMsg m WHERE m.userId = u.id AND m.isTest = 0 AND m.deliveryStatus NOT IN ('failed','error','rejected') AND m.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS live30,
                (SELECT MAX(created_at) FROM Payments p WHERE p.userId = u.id AND p.transaction_status IN ('success','completed')) AS lastPayment
         FROM users u LEFT JOIN SMSCredits s ON s.userId = u.id
         WHERE u.role = 'user' OR u.id IN (SELECT userId FROM Credits)
         ORDER BY paid DESC, live DESC LIMIT ${limit}`
    );
}

/** Accounts whose ledger and balance disagree by more than a segment or two */
export async function accountReconciliation() {
    return query<RowDataPacket & { id: number; name: string; email: string; unitsIn: string; balance: string; consumedDerived: string; sent: number; gap: string }>(
        `SELECT x.*, (x.consumedDerived - x.sent) AS gap FROM (
            SELECT u.id, u.name, u.email,
                   COALESCE((SELECT SUM(creditUnit) FROM Credits c WHERE c.userId = u.id), 0) AS unitsIn,
                   COALESCE(s.creditBalance, 0) AS balance,
                   COALESCE((SELECT SUM(creditUnit) FROM Credits c WHERE c.userId = u.id), 0) - COALESCE(s.creditBalance, 0) AS consumedDerived,
                   (SELECT COUNT(*) FROM SMSMsg m WHERE m.userId = u.id AND m.isTest = 0 AND m.deliveryStatus NOT IN ('failed','error','rejected')) AS sent
            FROM users u LEFT JOIN SMSCredits s ON s.userId = u.id
            WHERE s.id IS NOT NULL OR u.id IN (SELECT userId FROM Credits)
        ) x
        WHERE ABS(x.consumedDerived - x.sent) > 2 OR x.balance < 0
        ORDER BY ABS(x.consumedDerived - x.sent) DESC LIMIT 25`
    );
}
