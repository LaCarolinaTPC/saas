"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  count?: string | number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  noPadding?: boolean;
}

export default function Section({
  icon,
  title,
  count,
  defaultOpen = true,
  children,
  noPadding = false,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-surface-raised rounded-2xl border border-border shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gold-subtle text-gold-dark flex items-center justify-center">
            {icon}
          </div>
          <span className="text-sm font-semibold text-text-primary">
            {title}
          </span>
          {count != null && (
            <span className="text-xs font-semibold text-text-tertiary bg-slate-100 px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-text-muted transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && <div className={noPadding ? "" : "px-6 pb-6"}>{children}</div>}
    </div>
  );
}
