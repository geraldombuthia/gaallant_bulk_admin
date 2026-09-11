import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Bearer-token auth for the review API, for automated and AI reviewers.
 *
 * Deliberately separate from the admin session: a token can be given to a
 * script or an agent without giving it a browser login, and revoked by
 * rotating one variable. Actions taken with it are audited under the
 * REVIEW_API_ACTOR user id so the log shows "the bot did this", not a person.
 */
export function checkApiToken(req: NextRequest): boolean {
    const expected = process.env.REVIEW_API_TOKEN;
    if (!expected || expected.length < 32) return false;
    const header = req.headers.get("authorization") ?? "";
    const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (given.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** The users.id that automated decisions are recorded under. */
export function apiActorId(): number {
    return Number(process.env.REVIEW_API_ACTOR ?? 1);
}
