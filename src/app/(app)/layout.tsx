import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth/session";
import { countByStatus } from "@/lib/db/templates";
import { supportCounts } from "@/lib/db/support";
import { scanSent } from "@/lib/db/compliance";
import { computeRunway } from "@/lib/alerts";
import { openCount } from "@/lib/db/reviewRequests";
import { SideNav, type NavGroup } from "@/components/nav";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const session = await readSession();
    if (!session) redirect("/login");

    const [templates, support, scan, runway, reviews] = await Promise.all([
        countByStatus(), supportCounts(), scanSent({ sinceDays: 7, minSeverity: "block", limit: 500 }), computeRunway(), openCount(),
    ]);
    const low = runway.level === "warn" || runway.level === "critical";

    const groups: NavGroup[] = [
        { label: "Operate", items: [
            { href: "/", label: "Overview" },
            { href: "/templates", label: "Templates", count: templates.pending },
            { href: "/reviews", label: "Human review", count: reviews },
            { href: "/messages", label: "Messages" },
            { href: "/compliance", label: "Compliance", count: scan.hits.length, tone: "danger" },
        ] },
        { label: "Customers", items: [
            { href: "/users", label: "Users" },
            { href: "/support", label: "Support", count: support.open },
            { href: "/email", label: "Email" },
        ] },
        { label: "Money", items: [
            { href: "/finance", label: "Finance" },
            { href: "/usage", label: "Usage & runway", count: low ? 1 : 0, tone: runway.level === "critical" ? "danger" : "warn" },
            { href: "/payments", label: "Payments" },
            { href: "/pricing", label: "Pricing" },
        ] },
        { label: "Security", items: [
            { href: "/sign-ins", label: "Sign-ins" },
            { href: "/audit", label: "Audit log" },
        ] },
    ];
    const waiting = templates.pending + reviews + support.open;

    return (
        <div className="flex min-h-screen">
            <aside className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col border-r border-line bg-surface">
                <Link href="/" className="flex items-center gap-2.5 border-b border-line-2 px-4 py-3.5">
                    <Image src="/mark.png" alt="" width={28} height={28} className="rounded-md" priority />
                    <div className="leading-tight">
                        <div className="text-[13px] font-semibold text-ink">Gallant SMS</div>
                        <div className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-4">Admin</div>
                    </div>
                </Link>
                <SideNav groups={groups} />
                <div className="border-t border-line-2 px-4 py-3 text-xs">
                    <div className="truncate font-medium text-ink">{session.name}</div>
                    <div className="flex items-center justify-between">
                        <span className="truncate text-ink-3">{session.role}</span>
                        <form action={signOut}><button className="text-ink-3 hover:text-ink">Sign out</button></form>
                    </div>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-10 flex h-11 items-center justify-between gap-4 border-b border-line bg-surface/90 px-6 backdrop-blur">
                    <div className="flex items-center gap-3 text-xs text-ink-3">
                        <span className={`inline-flex items-center gap-1.5 ${waiting > 0 ? "text-ink-2" : ""}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${waiting > 0 ? "bg-warn" : "bg-ok"}`} aria-hidden />
                            {waiting > 0 ? `${waiting} item${waiting === 1 ? "" : "s"} waiting for a decision` : "Queues clear"}
                        </span>
                        <span className="text-ink-4">·</span>
                        <span>Gateway {runway.gatewayUnits == null ? "balance unknown" : `${Math.round(runway.gatewayUnits).toLocaleString()} units`}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                        <span className="rounded-md border border-line px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-3">{process.env.NODE_ENV === "production" ? "prod" : "dev"}</span>
                        <a href={process.env.MAIN_APP_URL ?? "http://localhost:3000"} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-brand">Open app ↗</a>
                    </div>
                </header>
                {low && (
                    <div role="alert" className={`border-b px-6 py-2 text-[13px] ${runway.level === "critical" ? "border-danger/30 bg-danger-soft text-danger" : "border-warn/30 bg-warn-soft text-warn"}`}>
                        <b>Gateway credits {runway.level === "critical" ? "critically low" : "running low"}.</b> {runway.reasons[0]} <Link href="/usage" className="underline">Usage &amp; runway</Link>
                    </div>
                )}
                <main className="min-w-0 flex-1 px-6 py-5">{children}</main>
            </div>
        </div>
    );
}
