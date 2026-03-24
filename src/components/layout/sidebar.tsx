"use client";

import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { NavItem } from "./nav-item";
import { NAV_ITEMS } from "@/lib/constants";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-[#E2E8F0] bg-white">
      <div className="flex items-center gap-2.5 px-6 py-6 pb-6">
        <ShieldCheck className="h-7 w-7 text-[#4F46E5]" />
        <span className="text-xl font-bold text-[#0F172A]">GESTIVO</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-4">
        <span className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#94A3B8]">
          MENÚ
        </span>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <NavItem
              key={item.href}
              icon={item.icon}
              label={item.label}
              href={item.href}
              isActive={isActive}
            />
          );
        })}
      </nav>
    </aside>
  );
}
