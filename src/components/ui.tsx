import Link from "next/link";
import type { ReactNode } from "react";

/* ---------- badges: hue reserved for meaning ---------- */
const tones = {
    neutral: "bg-surface-3 text-ink-2",
    info: "bg-info-soft text-info",
    success: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
    return <span title={title} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-4 ${tones[tone]}`}>{children}</span>;
}

export function statusTone(s: string | null | undefined): Tone {
    switch ((s ?? "").toLowerCase()) {
        case "approved": case "delivered": case "success": case "completed": case "active": case "answered": case "resolved": return "success";
        case "pending": case "sent": case "open": case "changes_requested": case "suspended": case "unsure": return "warn";
        case "rejected": case "failed": case "error": case "banned": case "cancelled": case "marketing": case "dismissed": return "danger";
        default: return "neutral";
    }
}
export function StatusBadge({ status }: { status: string | null | undefined }) {
    return <Badge tone={statusTone(status)}><span className={`h-1.5 w-1.5 rounded-full ${dot[statusTone(status)]}`} />{(status ?? "unknown").replace(/_/g, " ")}</Badge>;
}
const dot: Record<Tone, string> = { neutral: "bg-ink-4", info: "bg-info", success: "bg-ok", warn: "bg-warn", danger: "bg-danger" };

/* ---------- surfaces ---------- */
export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
    return (
        <section className={`rounded-lg border border-line bg-surface shadow-[var(--shadow-1)] ${className}`}>
            {(title || action) && (
                <header className="flex items-center justify-between gap-3 border-b border-line-2 px-4 py-2.5">
                    <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">{title}</h2>
                    {action}
                </header>
            )}
            {children}
        </section>
    );
}

export function PageHeader({ title, subtitle, action, crumbs }: { title: string; subtitle?: ReactNode; action?: ReactNode; crumbs?: { href: string; label: string }[] }) {
    return (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
                {crumbs && crumbs.length > 0 && (
                    <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-1 text-xs text-ink-3">
                        {crumbs.map((c, i) => <span key={c.href} className="flex items-center gap-1">{i > 0 && <span className="text-ink-4">/</span>}<Link href={c.href} className="hover:text-brand">{c.label}</Link></span>)}
                    </nav>
                )}
                <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
                {subtitle && <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>}
            </div>
            {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
    );
}

/* KPI tiles: dense, numbers lead, the label is quiet */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
    const color = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "success" ? "text-ok" : "text-ink";
    return (
        <div className="rounded-lg border border-line bg-surface px-3.5 py-3 shadow-[var(--shadow-1)]">
            <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{label}</div>
            <div className={`tnum mt-1 text-[22px] font-semibold leading-none ${color}`}>{value}</div>
            {sub && <div className="mt-1.5 text-[11.5px] leading-snug text-ink-3">{sub}</div>}
        </div>
    );
}

export function Empty({ children }: { children: ReactNode }) {
    return <div className="px-4 py-10 text-center text-[13px] text-ink-3">{children}</div>;
}

/* ---------- tables: 38px rows, header pinned ---------- */
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-[1]">
                    <tr className="border-b border-line bg-surface-2 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">
                        {head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2">{h}</th>)}
                    </tr>
                </thead>
                <tbody className="divide-y divide-line-2">{children}</tbody>
            </table>
        </div>
    );
}
export function Td({ children, className = "", mono = false }: { children: ReactNode; className?: string; mono?: boolean }) {
    return <td className={`px-4 py-2 align-top ${mono ? "font-mono text-[12px]" : ""} ${className}`}>{children}</td>;
}

/* ---------- pagination ---------- */
export function Pager({ page, size, total, params }: { page: number; size: number; total: number; params: Record<string, string | undefined> }) {
    const pages = Math.max(1, Math.ceil(total / size));
    const href = (p: number) => {
        const q = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
        q.set("page", String(p));
        return `?${q.toString()}`;
    };
    const first = total === 0 ? 0 : (page - 1) * size + 1;
    const last = Math.min(page * size, total);
    return (
        <div className="flex items-center justify-between border-t border-line-2 px-4 py-2 text-xs text-ink-3">
            <span className="tnum">{first}–{last} of {total.toLocaleString()}</span>
            <div className="flex items-center gap-1">
                <span className="tnum mr-2 text-ink-4">page {page} / {pages}</span>
                <PagerLink href={href(page - 1)} disabled={page <= 1}>‹ Prev</PagerLink>
                <PagerLink href={href(page + 1)} disabled={page >= pages}>Next ›</PagerLink>
            </div>
        </div>
    );
}
function PagerLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
    const cls = "rounded-md border px-2.5 py-1 text-xs";
    return disabled
        ? <span className={`${cls} cursor-not-allowed border-line-2 text-ink-4`}>{children}</span>
        : <Link href={href} className={`${cls} border-line bg-surface text-ink-2 hover:border-ink-4 hover:text-ink`}>{children}</Link>;
}

/* ---------- filter bar: quiet zone ---------- */
export function Filters({ children, reset }: { children: ReactNode; reset: string }) {
    return (
        <form method="get" className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-lg border border-line bg-surface px-3.5 py-3">
            {children}
            <div className="ml-auto flex items-center gap-2">
                <Link href={reset} className="px-2 py-1.5 text-xs text-ink-3 hover:text-ink">Reset</Link>
                <button type="submit" className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong">Apply</button>
            </div>
        </form>
    );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">
            {label}
            {children}
        </label>
    );
}
export const inputCls = "rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] font-normal normal-case tracking-normal text-ink placeholder:text-ink-4 focus:border-brand";

/* ---------- buttons: brand once per screen, the rest neutral ---------- */
const btn = {
    primary: "bg-brand text-white hover:bg-brand-strong",
    danger: "bg-danger text-white hover:opacity-90",
    warn: "bg-warn text-white hover:opacity-90",
    ghost: "border border-line bg-surface text-ink-2 hover:border-ink-4 hover:text-ink",
} as const;
export function Button({ kind = "ghost", children, ...rest }: { kind?: keyof typeof btn; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button {...rest} className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${btn[kind]} ${rest.className ?? ""}`}>{children}</button>;
}

export function Notice({ kind, children }: { kind: "ok" | "error"; children: ReactNode }) {
    return (
        <div role={kind === "error" ? "alert" : "status"} className={`mb-3 rounded-md border px-3 py-2 text-[13px] ${kind === "ok" ? "border-ok/30 bg-ok-soft text-ok" : "border-danger/30 bg-danger-soft text-danger"}`}>
            {children}
        </div>
    );
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
    return (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[13px]">
            {items.map(([k, v]) => (
                <div key={k} className="contents">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="min-w-0 break-words text-ink">{v}</dd>
                </div>
            ))}
        </dl>
    );
}
