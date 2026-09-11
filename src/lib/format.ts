export function kes(n: number | string | null | undefined, digits = 2): string {
    const v = Number(n ?? 0);
    return `KSh ${v.toLocaleString("en-KE", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function num(n: number | string | null | undefined): string {
    return Number(n ?? 0).toLocaleString("en-KE");
}

export function pct(v: number | null | undefined): string {
    return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

/** "18 Nov 2025, 14:32" -- absolute, because an admin needs to correlate */
export function when(d: Date | string | null | undefined): string {
    if (!d) return "—";
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
}

export function ago(d: Date | string | null | undefined): string {
    if (!d) return "—";
    const ms = Date.now() - new Date(d).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h ago`;
    const days = Math.floor(h / 24);
    if (days < 30) return `${days} d ago`;
    return when(d);
}

export function maskPhone(p: string | null | undefined): string {
    if (!p) return "—";
    return p.length > 6 ? `${p.slice(0, 4)}…${p.slice(-3)}` : p;
}

export function truncate(s: string | null | undefined, n = 80): string {
    if (!s) return "";
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
