import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  change: string;
  changeColor?: string;
  icon?: LucideIcon;
}

export function StatCard({ label, value, change, changeColor = "#10B981", icon: Icon }: StatCardProps) {
  return (
    <div className="rounded-xl border border-[#F1F5F9] bg-white p-6">
      <p className="text-[13px] font-medium text-[#64748B]">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-[28px] font-bold leading-none text-[#0F172A]">{value}</span>
        <span className="text-[13px] font-medium" style={{ color: changeColor }}>
          {change}
        </span>
      </div>
      {Icon && (
        <Icon className="mt-3 h-5 w-5 text-[#4F46E5]" />
      )}
    </div>
  );
}
