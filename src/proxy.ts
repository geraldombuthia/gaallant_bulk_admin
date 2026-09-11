import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Every route except /login and static assets requires a valid admin
 * session cookie. The JWT is verified here so an unauthenticated request
 * never reaches a page or action; pages re-check the role for anything
 * superadmin-only.
 */
const COOKIE = "admin_session";

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    // The review API authenticates with its own bearer token, not a session
    if (pathname.startsWith("/api/review")) {
        return NextResponse.next();
    }
    const isLogin = pathname === "/login";
    const token = request.cookies.get(COOKIE)?.value;

    let valid = false;
    if (token) {
        try {
            const secret = new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET ?? "");
            const { payload } = await jwtVerify(token, secret);
            valid = payload.role === "admin" || payload.role === "superadmin";
        } catch {
            valid = false;
        }
    }

    if (!valid && !isLogin) {
        const url = new URL("/login", request.url);
        if (pathname !== "/") {
            url.searchParams.set("next", pathname);
        }
        return NextResponse.redirect(url);
    }
    if (valid && isLogin) {
        return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
