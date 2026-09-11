"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login } from "@/lib/auth/login";
import { createSession } from "@/lib/auth/session";
import { clientIp, userAgent } from "@/lib/request";

const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    next: z.string().optional(),
});

export type LoginState = { error?: string };

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
    const parsed = schema.safeParse({
        email: form.get("email"), password: form.get("password"), next: form.get("next") || undefined,
    });
    if (!parsed.success) {
        return { error: "Enter your email address and password." };
    }
    const result = await login(parsed.data.email, parsed.data.password, await clientIp(), await userAgent());
    if (!result.ok) {
        const messages = {
            rate_limited: "Too many attempts from this address. Wait fifteen minutes.",
            invalid: "Email or password is incorrect.",
            not_admin: "That account is not an administrator.",
            inactive: "That account is not active.",
        };
        return { error: messages[result.reason] };
    }
    await createSession(result.admin);
    const next = parsed.data.next && parsed.data.next.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/";
    redirect(next);
}
