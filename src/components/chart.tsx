/**
 * Small, dependency-free charts. Bars for counts, a line for a series.
 * Drawn to one scale with labelled ends; hover titles carry the value.
 */
export function Bars({ points, height = 90, color = "var(--brand)", failedColor = "var(--danger)", label }: {
    points: { t: string; sent: number; failed?: number }[]; height?: number; color?: string; failedColor?: string; label: string;
}) {
    const max = Math.max(1, ...points.map((p) => p.sent));
    const w = points.length * 10;
    return (
        <div>
            <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img" aria-label={label}>
                {points.map((p, i) => {
                    const h = (p.sent / max) * (height - 8);
                    const fh = ((p.failed ?? 0) / max) * (height - 8);
                    return (
                        <g key={p.t}>
                            <rect x={i * 10 + 1} y={height - 4 - h} width={8} height={h} fill={color} opacity={0.85}><title>{p.t}: {p.sent}{p.failed ? ` (${p.failed} failed)` : ""}</title></rect>
                            {fh > 0 && <rect x={i * 10 + 1} y={height - 4 - fh} width={8} height={fh} fill={failedColor} />}
                        </g>
                    );
                })}
            </svg>
            <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>{points[0]?.t}</span><span className="tnum">peak {max.toLocaleString()}</span><span>{points.at(-1)?.t}</span></div>
        </div>
    );
}

export function Line({ points, height = 80, label, unit = "" }: { points: { t: string; v: number }[]; height?: number; label: string; unit?: string }) {
    const max = Math.max(1, ...points.map((p) => p.v));
    const w = Math.max(10, (points.length - 1) * 10);
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${i * 10},${height - 4 - (p.v / max) * (height - 8)}`).join(" ");
    return (
        <div>
            <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img" aria-label={label}>
                <path d={`${d} L${w},${height} L0,${height} Z`} fill="var(--brand)" opacity={0.08} />
                <path d={d} fill="none" stroke="var(--brand)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                {points.map((p, i) => <circle key={p.t} cx={i * 10} cy={height - 4 - (p.v / max) * (height - 8)} r={2.5} fill="var(--brand)"><title>{p.t}: {p.v.toLocaleString()}{unit}</title></circle>)}
            </svg>
            <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>{points[0]?.t}</span><span className="tnum">peak {max.toLocaleString()}{unit}</span><span>{points.at(-1)?.t}</span></div>
        </div>
    );
}
