"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type DocsNavItem = {
  id: string;
  label: string;
  children?: { id: string; label: string }[];
};

// Índice lateral con scroll-spy: resalta la sección visible al hacer scroll.
export function DocsSidebar({ items }: { items: DocsNavItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const ids = items.flatMap((i) => [i.id, ...(i.children?.map((c) => c.id) ?? [])]);
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        // La sección visible más cercana al tope gana.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [items]);

  const linkClass = (id: string, indent = false) =>
    cn(
      "block rounded-md px-3 py-1.5 text-sm transition-colors",
      indent && "ml-3 border-l border-[#E2E8F0] pl-4 text-[13px]",
      activeId === id
        ? "bg-[#EEF2FF] font-medium text-[#4F46E5]"
        : "text-[#475569] hover:text-[#0F172A]"
    );

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => (
        <div key={item.id}>
          <a href={`#${item.id}`} className={linkClass(item.id)}>
            {item.label}
          </a>
          {item.children?.map((child) => (
            <a key={child.id} href={`#${child.id}`} className={linkClass(child.id, true)}>
              {child.label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}
