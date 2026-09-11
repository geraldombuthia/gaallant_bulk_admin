import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { countByStatus } from "@/lib/db/templates";
import { supportCounts } from "@/lib/db/support";
import { scanSent } from "@/lib/db/compliance";
import { signOut } from "./actions";

const nav = [
    { href: "/", label: "Overview" },
    { href: "/templates", label: "Templates", badge: "templates" },
    { href: "/messages", label: "Messages" },
    { href: "/users", label: "Users" },
    { href: "/support", label: "Support", badge: "support" },
    { href: "/payments", label: "Payments" },
    { href: "/finance", label: "Finance" },
    { href: "/pricing", label: "Pricing" },
    { href: "/compliance", label: "Compliance", badge: "compliance" },
    { href: "/sign-ins", label: "Sign-ins" },
    { href: "/audit", label: "Audit log" },
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const session = await readSession();
    if (!session) redirect("/login");

    // Queue sizes in the nav, so a reviewer sees work waiting from any page
    const [templates, support, scan] = await Promise.all([
        countByStatus(), supportCounts(), scanSent({ sinceDays: 7, minSeverity: "block", limit: 500 }),
    ]);
    const badges: Record<string, number> = { templates: templates.pending, support: support.open, compliance: scan.hits.length };

    return (
        <div className="flex min-h-screen">
            <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-white">
                <div className="px-4 pb-3 pt-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Gallant SMS</div>
                    <div className="text-base font-semibold">Admin</div>
                </div>
                <nav className="flex-1 px-2">
                    {nav.map((item) => {
                        const n = "badge" in item ? badges[item.badge] : 0;
                        return (
                            <Link key={item.href} href={item.href}
                                className="flex items-center justify-between rounded px-2 py-1.5 text-sm text-ink-2 hover:bg-gray-50 hover:text-ink">
                                {item.label}
                                {n > 0 && <span className="tnum rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">{n}</span>}
                            </Link>
                        );
                    })}
                </nav>
                <div className="border-t border-line px-4 py-3 text-xs">
                    <div className="truncate font-medium text-ink">{session.name}</div>
                    <div className="truncate text-ink-3">{session.role}</div>
                    <form action={signOut}><button className="mt-2 text-ink-3 hover:text-ink">Sign out</button></form>
                </div>
            </aside>
            <main className="min-w-0 flex-1 px-6 py-5">{children}</main>
        </div>
    );
}
