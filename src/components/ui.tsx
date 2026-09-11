import Link from "next/link";
import type { ReactNode } from "react";

// ---- badges: state encoded in colour, one palette across the app ----
const tones = {
    neutral: "bg-gray-100 text-gray-700",
    info: "bg-brand-soft text-brand-strong",
    success: "bg-emerald-50 text-emerald-800",
    warn: "bg-amber-50 text-amber-800",
    danger: "bg-red-50 text-red-800",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
    return <span title={title} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide ${tones[tone]}`}>{children}</span>;
}

export function statusTone(s: string | null | undefined): Tone {
    switch ((s ?? "").toLowerCase()) {
        case "approved": case "delivered": case "success": case "completed": case "active": case "answered": return "success";
        case "pending": case "sent": case "open": case "changes_requested": case "suspended": return "warn";
        case "rejected": case "failed": case "error": case "banned": case "cancelled": return "danger";
        default: return "neutral";
    }
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
    return <Badge tone={statusTone(status)}>{(status ?? "unknown").replace(/_/g, " ")}</Badge>;
}

// ---- layout pieces ----
export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
    return (
        <section className={`rounded-lg border border-line bg-white ${className}`}>
            {(title || action) && (
                <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                    <h2 className="text-sm font-semibold text-ink">{title}</h2>
                    {action}
                </header>
            )}
            {children}
        </section>
    );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
    return (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
                <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
                {subtitle && <p className="mt-0.5 text-sm text-ink-3">{subtitle}</p>}
            </div>
            {action}
        </div>
    );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
    return (
        <div className="rounded-lg border border-line bg-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
            <div className={`tnum mt-1 text-2xl font-semibold leading-tight ${tone === "danger" ? "text-red-700" : tone === "warn" ? "text-amber-700" : "text-ink"}`}>{value}</div>
            {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
        </div>
    );
}

export function Empty({ children }: { children: ReactNode }) {
    return <div className="px-4 py-10 text-center text-sm text-ink-3">{children}</div>;
}

// ---- table ----
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-line bg-gray-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                        {head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2">{h}</th>)}
                    </tr>
                </thead>
                <tbody className="divide-y divide-line">{children}</tbody>
            </table>
        </div>
    );
}
export function Td({ children, className = "", mono = false }: { children: ReactNode; className?: string; mono?: boolean }) {
    return <td className={`px-4 py-2.5 align-top ${mono ? "font-mono text-xs" : ""} ${className}`}>{children}</td>;
}

// ---- pagination ----
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
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-ink-3">
            <span className="tnum">{first}–{last} of {total.toLocaleString()}</span>
            <div className="flex gap-1">
                <PagerLink href={href(page - 1)} disabled={page <= 1}>Previous</PagerLink>
                <PagerLink href={href(page + 1)} disabled={page >= pages}>Next</PagerLink>
            </div>
        </div>
    );
}
function PagerLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
    const cls = "rounded border px-2.5 py-1 text-xs";
    return disabled
        ? <span className={`${cls} cursor-not-allowed border-line text-gray-300`}>{children}</span>
        : <Link href={href} className={`${cls} border-line bg-white text-ink hover:bg-gray-50`}>{children}</Link>;
}

// ---- filter bar (GET form) ----
export function Filters({ children, reset }: { children: ReactNode; reset: string }) {
    return (
        <form method="get" className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-white px-3 py-2.5">
            {children}
            <button type="submit" className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong">Apply</button>
            <Link href={reset} className="px-2 py-1.5 text-xs text-ink-3 hover:text-ink">Reset</Link>
        </form>
    );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
            {label}
            {children}
        </label>
    );
}
export const inputCls = "rounded border border-line bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-ink";

// ---- buttons ----
const btn = {
    primary: "bg-brand text-white hover:bg-brand-strong",
    danger: "bg-red-600 text-white hover:bg-red-700",
    warn: "bg-amber-500 text-white hover:bg-amber-600",
    ghost: "border border-line bg-white text-ink hover:bg-gray-50",
} as const;
export function Button({ kind = "ghost", children, ...rest }: { kind?: keyof typeof btn; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button {...rest} className={`rounded px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${btn[kind]} ${rest.className ?? ""}`}>{children}</button>;
}

// ---- inline message from a server action ----
export function Notice({ kind, children }: { kind: "ok" | "error"; children: ReactNode }) {
    return (
        <div role={kind === "error" ? "alert" : "status"} className={`mb-3 rounded border px-3 py-2 text-sm ${kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
            {children}
        </div>
    );
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
    return (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
            {items.map(([k, v]) => (
                <div key={k} className="contents">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="min-w-0 break-words text-ink">{v}</dd>
                </div>
            ))}
        </dl>
    );
}
