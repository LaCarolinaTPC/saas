import { Search, Bell } from "lucide-react";
import { Input } from "@/components/ui/input";

interface TopBarProps {
  title: string;
  children?: React.ReactNode;
}

export function TopBar({ title, children }: TopBarProps) {
  return (
    <header className="flex items-center justify-between border-b border-[#F1F5F9] bg-white px-8 py-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-[#0F172A]">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        {children}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#94A3B8]" />
          <Input
            placeholder="Buscar..."
            className="h-10 w-60 border-[#E2E8F0] bg-white pl-10 text-sm"
          />
        </div>
        <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F8FAFC]">
          <Bell className="h-[18px] w-[18px] text-[#64748B]" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E0E7FF]">
          <span className="text-sm font-semibold text-[#4F46E5]">VS</span>
        </div>
      </div>
    </header>
  );
}
