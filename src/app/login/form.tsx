"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
    const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
    return (
        <form action={action} className="rounded-lg border border-line bg-surface p-5">
            {state.error && <p role="alert" className="mb-3 rounded border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
            {next && <input type="hidden" name="next" value={next} />}
            <label className="block text-xs font-semibold text-ink-2">
                Email
                <input id="email" name="email" type="email" autoComplete="username" required
                    className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] focus:border-brand" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-ink-2">
                Password
                <input id="password" name="password" type="password" autoComplete="current-password" required
                    className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 text-[13px] focus:border-brand" />
            </label>
            <button type="submit" disabled={pending}
                className="mt-4 w-full rounded-md bg-brand-fill px-3 py-2 text-[13px] font-semibold text-white hover:bg-brand-fill-hover disabled:opacity-60">
                {pending ? "Signing in…" : "Sign in"}
            </button>
        </form>
    );
}
