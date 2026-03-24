"use client";

import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  href: string;
  isActive?: boolean;
  badge?: number;
}

export function NavItem({ icon: Icon, label, href, isActive, badge }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-[#EEF2FF] text-[#4F46E5] font-semibold"
          : "text-[#334155] hover:bg-[#F8FAFC]"
      )}
    >
      <Icon
        className={cn("h-5 w-5", isActive ? "text-[#4F46E5]" : "text-[#64748B]")}
      />
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
            isActive
              ? "bg-[#4F46E5] text-white"
              : "bg-[#EEF2FF] text-[#4F46E5]"
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
