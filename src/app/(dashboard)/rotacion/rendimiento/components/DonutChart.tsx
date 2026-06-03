"use client";

interface Segment {
  label: string;
  value: number;
  color: string;
}

export default function DonutChart({
  segments,
  size = 160,
}: {
  segments: Segment[];
  size?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  let cumulative = 0;
  const gradientParts = segments.map((seg) => {
    const start = (cumulative / total) * 360;
    cumulative += seg.value;
    const end = (cumulative / total) * 360;
    return `${seg.color} ${start}deg ${end}deg`;
  });

  return (
    <div className="flex items-center gap-6">
      <div
        className="rounded-full shrink-0"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${gradientParts.join(", ")})`,
          mask: `radial-gradient(circle at center, transparent 40%, black 41%)`,
          WebkitMask: `radial-gradient(circle at center, transparent 40%, black 41%)`,
        }}
      />
      <div className="space-y-2">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-xs text-text-secondary">{seg.label}</span>
            <span className="text-xs font-semibold text-text-primary tabular-nums ml-auto">
              {seg.value.toLocaleString("es-CO")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
