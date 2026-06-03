"use client";

interface Bar {
  label: string;
  value: number;
  color?: string;
}

export default function BarChart({
  bars,
  height = 200,
}: {
  bars: Bar[];
  height?: number;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className="flex items-end gap-2 justify-around" style={{ height }}>
      {bars.map((bar, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <span className="text-[11px] font-semibold text-text-secondary tabular-nums">
            {bar.value.toLocaleString("es-CO")}
          </span>
          <div
            className="w-full max-w-12 rounded-t-lg transition-all duration-500"
            style={{
              height: `${Math.max((bar.value / max) * (height - 40), 4)}px`,
              backgroundColor: bar.color || "#d4a843",
            }}
          />
          <span className="text-[10px] text-text-muted text-center leading-tight truncate w-full">
            {bar.label}
          </span>
        </div>
      ))}
    </div>
  );
}
