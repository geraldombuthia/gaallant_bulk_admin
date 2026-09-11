import Image from "next/image";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    const { next } = await searchParams;
    return (
        <main className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <div className="mb-6 flex items-center gap-3">
                    <Image src="/mark.png" alt="Gallant" width={40} height={40} className="rounded-lg" priority unoptimized />
                    <div>
                        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-4">Gallant SMS</div>
                        <h1 className="text-xl font-semibold leading-tight tracking-[-0.01em] text-ink">Admin console</h1>
                    </div>
                </div>
                <LoginForm next={next} />
                <p className="mt-4 text-center text-[11.5px] text-ink-4">Administrator accounts only. Every sign-in is recorded.</p>
            </div>
        </main>
    );
}
