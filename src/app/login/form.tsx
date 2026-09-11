"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
    const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
    return (
        <form action={action} className="rounded-lg border border-line bg-white p-5">
            {state.error && <p role="alert" className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{state.error}</p>}
            {next && <input type="hidden" name="next" value={next} />}
            <label className="block text-xs font-semibold text-ink-2">
                Email
                <input id="email" name="email" type="email" autoComplete="username" required
                    className="mt-1 block w-full rounded border border-line px-3 py-2 text-sm" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-ink-2">
                Password
                <input id="password" name="password" type="password" autoComplete="current-password" required
                    className="mt-1 block w-full rounded border border-line px-3 py-2 text-sm" />
            </label>
            <button type="submit" disabled={pending}
                className="mt-4 w-full rounded bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
                {pending ? "Signing in…" : "Sign in"}
            </button>
        </form>
    );
}
