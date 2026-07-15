"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, ChevronRight } from "lucide-react";
import { NAV_TREE, type NavEntry, type NavGroup } from "@/lib/constants";
import { hrefToModule } from "@/lib/permissions-shared";
import { cn } from "@/lib/utils";

function isLeafActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar({ allowedModules }: { allowedModules: string[] }) {
  const pathname = usePathname();

  // Menú filtrado según los módulos permitidos del usuario.
  const navTree = useMemo<NavEntry[]>(() => {
    const allowed = (href: string) => {
      const m = hrefToModule(href);
      return m === null || allowedModules.includes(m);
    };
    return NAV_TREE.flatMap((entry): NavEntry[] => {
      if (entry.kind === "link") return allowed(entry.href) ? [entry] : [];
      const items = entry.items.filter((i) => allowed(i.href));
      return items.length ? [{ ...entry, items }] : [];
    });
  }, [allowedModules]);

  // Grupo cuyo subitem coincide con la ruta actual (null si estamos en un link suelto)
  const activeGroupKey =
    navTree.find(
      (e): e is NavGroup =>
        e.kind === "group" && e.items.some((i) => isLeafActive(pathname, i.href))
    )?.key ?? null;

  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupKey);

  // Sincroniza el panel con la sección al navegar
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenGroup(activeGroupKey);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const openGroupData = navTree.find(
    (e): e is NavGroup => e.kind === "group" && e.key === openGroup
  );

  // Solo se resalta la coincidencia más específica: un item cuyo href es
  // prefijo de otro (p. ej. /configuracion vs /configuracion/api) no debe
  // quedar activo a la vez.
  const activeItemHref = openGroupData?.items
    .filter((i) => isLeafActive(pathname, i.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      {/* Columna primaria: iconos + texto */}
      <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-[#E2E8F0] bg-white">
        <div className="flex items-center gap-2.5 px-6 py-6">
          <ShieldCheck className="h-7 w-7 text-[#4F46E5]" />
          <span className="text-xl font-bold text-[#0F172A]">GESTIVO</span>
        </div>

        <nav className="flex flex-col gap-0.5 px-4">
          {navTree.map((entry) => {
            const Icon = entry.icon;

            if (entry.kind === "link") {
              const active = isLeafActive(pathname, entry.href);
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onClick={() => setOpenGroup(null)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-[#EEF2FF] font-semibold text-[#4F46E5]"
                      : "text-[#334155] hover:bg-[#F8FAFC]"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      active ? "text-[#4F46E5]" : "text-[#64748B]"
                    )}
                  />
                  <span className="truncate">{entry.label}</span>
                </Link>
              );
            }

            // Grupo
            const isOpen = openGroup === entry.key;
            const isCurrent = activeGroupKey === entry.key;
            const highlighted = isOpen || isCurrent;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() =>
                  setOpenGroup((prev) => (prev === entry.key ? null : entry.key))
                }
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  highlighted
                    ? "bg-[#EEF2FF] font-semibold text-[#4F46E5]"
                    : "text-[#334155] hover:bg-[#F8FAFC]"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    highlighted ? "text-[#4F46E5]" : "text-[#64748B]"
                  )}
                />
                <span className="truncate">{entry.label}</span>
                <ChevronRight
                  className={cn(
                    "ml-auto h-4 w-4 shrink-0 transition-transform",
                    isOpen ? "rotate-90 text-[#4F46E5]" : "text-[#94A3B8]"
                  )}
                />
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Columna secundaria: opciones del grupo abierto (empuja el contenido) */}
      {openGroupData && (
        <aside className="flex h-full w-[224px] shrink-0 flex-col border-r border-[#E2E8F0] bg-[#F8FAFC]">
          <div className="px-6 py-6">
            <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[#94A3B8]">
              {openGroupData.label}
            </span>
          </div>
          <nav className="flex flex-col gap-0.5 px-4">
            {openGroupData.items.map((item) => {
              const Icon = item.icon;
              const active = item.href === activeItemHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-white font-semibold text-[#4F46E5] shadow-sm"
                      : "text-[#475569] hover:bg-white/70"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      active ? "text-[#4F46E5]" : "text-[#64748B]"
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
      )}
    </>
  );
}
