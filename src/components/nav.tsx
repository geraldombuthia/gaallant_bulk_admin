"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem { href: string; label: string; count?: number; tone?: "warn" | "danger" }
export interface NavGroup { label: string; items: NavItem[] }

/**
 * Grouped by what the person is doing, not by table. Active state comes
 * from the path so the reader always knows where they are; counts show
 * work waiting from any page.
 */
export function SideNav({ groups }: { groups: NavGroup[] }) {
    const path = usePathname();
    const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
    return (
        <nav className="flex-1 overflow-y-auto px-2 py-1">
            {groups.map((g) => (
                <div key={g.label} className="mb-3">
                    <div className="px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-4">{g.label}</div>
                    {g.items.map((item) => {
                        const active = isActive(item.href);
                        return (
                            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
                                className={`group relative flex items-center justify-between rounded-md px-2 py-[6px] text-[13px] transition-colors ${active ? "bg-brand-soft font-medium text-brand-strong" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}>
                                {active && <span className="absolute -left-2 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-mark" aria-hidden />}
                                <span className="truncate">{item.label}</span>
                                {item.count != null && item.count > 0 && (
                                    <span className={`tnum ml-2 rounded-md px-1.5 text-[10.5px] font-semibold leading-4 ${item.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>{item.count}</span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            ))}
        </nav>
    );
}
