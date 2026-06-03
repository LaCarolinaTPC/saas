interface KpiCardProps {
  value: string | number;
  label: string;
  color?: "accent" | "negative" | "positive" | "info" | "default";
}

const DOT_COLORS: Record<string, string> = {
  accent: "bg-gold",
  negative: "bg-negative",
  positive: "bg-positive",
  info: "bg-info",
  default: "bg-slate-300",
};

export default function KpiCard({
  value,
  label,
  color = "default",
}: KpiCardProps) {
  return (
    <div className="bg-surface-raised rounded-2xl border border-border p-5 flex flex-col gap-1.5 shadow-sm">
      <div className="text-3xl font-bold tabular-nums tracking-tight text-text-primary">
        {value}
      </div>
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_COLORS[color]}`} />
        <span className="text-xs font-medium text-text-tertiary">{label}</span>
      </span>
    </div>
  );
}
