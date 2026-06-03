"use client";

interface Item {
  label: string;
  value: number;
  color?: string;
}

export default function HorizontalBar({
  items,
  maxItems = 10,
  valueLabel,
}: {
  items: Item[];
  maxItems?: number;
  valueLabel?: string;
}) {
  const visible = items.slice(0, maxItems);
  const max = Math.max(...visible.map((i) => i.value), 1);

  return (
    <div className="space-y-2.5">
      {valueLabel && (
        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted text-right">
          {valueLabel}
        </div>
      )}
      {visible.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-text-secondary truncate w-32 shrink-0 text-right">
            {item.label.split(" ").slice(0, 2).join(" ")}
          </span>
          <div className="flex-1 h-7 bg-slate-100 rounded-lg overflow-hidden">
            <div
              className="h-full rounded-lg flex items-center px-2 text-[11px] font-semibold text-white transition-all duration-500"
              style={{
                width: `${Math.max((item.value / max) * 100, 8)}%`,
                backgroundColor: item.color || "#d4a843",
              }}
            >
              {item.value.toLocaleString("es-CO")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
