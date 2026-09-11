import { Badge } from "./ui";

/** The review state of a message: who said what. Human confirmation is the strong signal. */
export function VerdictBadge({ verdict, isHuman, reviewer, confidence }: { verdict?: string | null; isHuman?: number | null; reviewer?: string | null; confidence?: string | number | null }) {
    if (!verdict) return <span className="text-xs text-ink-3">unreviewed</span>;
    const human = Boolean(isHuman);
    const tone = verdict === "marketing" ? "danger" : verdict === "clean" ? "success" : "warn";
    const conf = confidence != null && !human ? ` ${Math.round(Number(confidence) * 100)}%` : "";
    return (
        <span className="inline-flex flex-col gap-0.5">
            <Badge tone={tone} title={reviewer ?? undefined}>{human ? "✓ " : "AI · "}{verdict}{conf}</Badge>
            <span className="text-[10px] text-ink-3">{human ? "human confirmed" : "not confirmed"}</span>
        </span>
    );
}
