import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    const { next } = await searchParams;
    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <div className="mb-6">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Gallant SMS</div>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight">Admin console</h1>
                    <p className="mt-1 text-sm text-ink-3">Administrator accounts only. Sign-ins are recorded.</p>
                </div>
                <LoginForm next={next} />
            </div>
        </main>
    );
}
