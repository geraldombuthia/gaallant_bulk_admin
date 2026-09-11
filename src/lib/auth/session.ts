import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "../env";

export const COOKIE = "admin_session";

export type AdminRole = "admin" | "superadmin";

export interface AdminSession {
    id: number;
    name: string;
    email: string;
    role: AdminRole;
}

/**
 * A signed, httpOnly cookie. Separate secret from the main app on purpose:
 * an admin session must never be usable as a user session or vice versa.
 */
export async function createSession(admin: AdminSession): Promise<void> {
    const { sessionSecret, sessionHours } = env();
    const token = await new SignJWT({ ...admin })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime(`${sessionHours}h`)
        .sign(sessionSecret);

    (await cookies()).set(COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: sessionHours * 3600,
    });
}

export async function readSession(): Promise<AdminSession | null> {
    const token = (await cookies()).get(COOKIE)?.value;
    if (!token) {
        return null;
    }
    try {
        const { payload } = await jwtVerify(token, env().sessionSecret);
        if (payload.role !== "admin" && payload.role !== "superadmin") {
            return null;
        }
        return {
            id: Number(payload.id),
            name: String(payload.name),
            email: String(payload.email),
            role: payload.role,
        };
    } catch {
        return null;
    }
}

export async function destroySession(): Promise<void> {
    (await cookies()).delete(COOKIE);
}

/** For server actions and pages: the admin, or a thrown redirect-worthy error. */
export async function requireAdmin(): Promise<AdminSession> {
    const session = await readSession();
    if (!session) {
        throw new Error("Not signed in");
    }
    return session;
}

export async function requireSuperadmin(): Promise<AdminSession> {
    const session = await requireAdmin();
    if (session.role !== "superadmin") {
        throw new Error("This action needs the superadmin role");
    }
    return session;
}
