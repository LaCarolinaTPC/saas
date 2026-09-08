"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldCheck,
  ChevronRight,
  LogOut,
  Loader2,
  CircleUserRound,
  KeyRound,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NAV_TREE, type NavEntry, type NavGroup, type NavLeaf } from "@/lib/constants";
import { hrefToModule, hrefToSubmodule, subAllowed } from "@/lib/permissions-shared";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSidebar } from "./sidebar-provider";

function isLeafActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Menú lateral en una sola columna con dos anchos:
 *  - expandido (240 px): icono + texto, grupos que se despliegan en línea;
 *  - iconos (64 px): solo iconos con tooltip; los grupos abren un popover.
 * El ancho y los grupos abiertos se recuerdan por navegador (ver sidebar-store).
 * Atajo: Ctrl+B (⌘B en Mac) alterna el ancho. En celular el menú vive en un
 * cajón siempre expandido que abre el botón flotante.
 */
export function Sidebar({
  allowedModules,
  allowedSubmodules = {},
  isAdmin = false,
  userEmail = null,
  userType = null,
}: {
  allowedModules: string[];
  /** Sub-funciones permitidas por módulo; módulo ausente = todas. */
  allowedSubmodules?: Record<string, string[]>;
  isAdmin?: boolean;
  userEmail?: string | null;
  userType?: string | null;
}) {
  const pathname = usePathname();
  const [saliendo, setSaliendo] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Popover del grupo abierto en el rail de iconos (uno a la vez).
  const [popoverAbierto, setPopoverAbierto] = useState<string | null>(null);
  const { modo, gruposAbiertos, alternarModo, alternarGrupo } = useSidebar();
  // El rail de iconos es solo de escritorio: el cajón móvil siempre lleva texto.
  const compacto = modo === "iconos" && !mobileOpen;

  async function cerrarSesion() {
    if (saliendo) return;
    setSaliendo(true);
    // Auditoría del cierre de sesión ANTES de destruir la sesión (el evento
    // necesita al usuario autenticado para registrar quién salió).
    try {
      await fetch("/api/auth/evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "cierre_sesion" }),
      });
    } catch {
      // La auditoría nunca bloquea el cierre de sesión.
    }
    await createClient().auth.signOut();
    // Recarga completa: limpia el caché del router para que el próximo
    // ingreso no muestre la pantalla donde quedó el usuario anterior.
    window.location.assign("/login");
  }

  // Ctrl+B / ⌘B alterna el ancho del menú, salvo dentro de un editor de texto.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "b") return;
      const objetivo = e.target as HTMLElement | null;
      if (objetivo?.isContentEditable) return;
      e.preventDefault();
      alternarModo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [alternarModo]);

  // Menú filtrado según los módulos (y sub-funciones) permitidos del usuario.
  const navTree = useMemo<NavEntry[]>(() => {
    const allowed = (href: string) => {
      const m = hrefToModule(href);
      if (m === null) return true;
      if (!allowedModules.includes(m)) return false;
      const sub = hrefToSubmodule(href);
      if (sub === null) return true;
      // Misma regla que el middleware y el servidor (sensibles, solo-admin).
      return subAllowed(allowedSubmodules, m, sub, isAdmin);
    };
    return NAV_TREE.flatMap((entry): NavEntry[] => {
      if (entry.kind === "link") return allowed(entry.href) ? [entry] : [];
      const items = entry.items.filter((i) => allowed(i.href));
      return items.length ? [{ ...entry, items }] : [];
    });
  }, [allowedModules, allowedSubmodules, isAdmin]);

  // Solo se resalta la coincidencia más específica de todo el árbol: un href
  // que es prefijo de otro (p. ej. /mantenimiento vs /mantenimiento/registrar,
  // o /configuracion vs /configuracion/api) no debe quedar activo a la vez.
  const activeHref = useMemo(() => {
    const hojas = navTree.flatMap((e) =>
      e.kind === "link" ? [e.href] : e.items.map((i) => i.href)
    );
    return (
      hojas
        .filter((h) => isLeafActive(pathname, h))
        .sort((a, b) => b.length - a.length)[0] ?? null
    );
  }, [navTree, pathname]);

  const grupoActivo =
    navTree.find(
      (e): e is NavGroup => e.kind === "group" && e.items.some((i) => i.href === activeHref)
    )?.key ?? null;

  // Un grupo está abierto si el usuario lo dejó así; sin preferencia guardada,
  // se abre solo el de la página actual.
  const estaAbierto = (key: string) => gruposAbiertos[key] ?? key === grupoActivo;

  const claseItem = (activo: boolean) =>
    cn(
      "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
      compacto ? "h-10 w-10 justify-center" : "px-3 py-2.5",
      activo
        ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
        : "text-sidebar-foreground hover:bg-muted"
    );
  const claseIcono = (activo: boolean) =>
    cn("h-5 w-5 shrink-0", activo ? "text-sidebar-primary" : "text-[#64748B]");

  const cerrarCajon = () => setMobileOpen(false);

  function renderHoja(item: NavLeaf, opciones?: { subnivel?: boolean; alCerrar?: () => void }) {
    const Icon = item.icon;
    const activo = item.href === activeHref;
    const alClic = () => {
      cerrarCajon();
      opciones?.alCerrar?.();
    };

    if (compacto && !opciones?.subnivel) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger
            render={
              <Link
                href={item.href}
                onClick={alClic}
                aria-current={activo ? "page" : undefined}
                aria-label={item.label}
                className={claseItem(activo)}
              />
            }
          >
            <Icon className={claseIcono(activo)} />
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={alClic}
        aria-current={activo ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors",
          opciones?.subnivel ? "px-3 py-2" : "px-3 py-2.5",
          activo
            ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-muted"
        )}
      >
        <Icon className={cn(claseIcono(activo), opciones?.subnivel && "h-4 w-4")} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  function renderGrupo(entry: NavGroup) {
    const Icon = entry.icon;
    const contieneActivo = entry.key === grupoActivo;

    if (compacto) {
      // Rail de iconos: el grupo abre un popover a la derecha con sus opciones,
      // al pasar el mouse o al hacer clic.
      const abierto = popoverAbierto === entry.key;
      return (
        <Popover
          key={entry.key}
          open={abierto}
          onOpenChange={(o) => setPopoverAbierto(o ? entry.key : null)}
        >
          <PopoverTrigger
            openOnHover
            delay={150}
            aria-label={entry.label}
            className={cn(claseItem(contieneActivo), abierto && !contieneActivo && "bg-muted")}
          >
            <Icon className={claseIcono(contieneActivo)} />
          </PopoverTrigger>
          <PopoverContent side="right" align="start" sideOffset={10} className="w-60 gap-0.5 p-1.5">
            <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[1.5px] text-muted-foreground">
              {entry.label}
            </p>
            {entry.items.map((item) =>
              renderHoja(item, { subnivel: true, alCerrar: () => setPopoverAbierto(null) })
            )}
          </PopoverContent>
        </Popover>
      );
    }

    // Expandido: cabecera plegable con las opciones en línea debajo. Cerrado,
    // la cabecera se resalta si la página actual está adentro; abierto, el
    // resaltado pasa a la opción activa.
    const abierto = estaAbierto(entry.key);
    const resaltado = !abierto && contieneActivo;
    return (
      <div key={entry.key}>
        <button
          type="button"
          onClick={() => alternarGrupo(entry.key)}
          aria-expanded={abierto}
          className={cn(claseItem(resaltado), "w-full")}
        >
          <Icon className={claseIcono(resaltado)} />
          <span className="truncate">{entry.label}</span>
          <ChevronRight
            className={cn(
              "ml-auto h-4 w-4 shrink-0 transition-transform",
              abierto ? "rotate-90 text-sidebar-primary" : "text-muted-foreground"
            )}
          />
        </button>
        {abierto && (
          <div className="mt-0.5 mb-1 ml-5 flex flex-col gap-0.5 border-l border-sidebar-border pl-2">
            {entry.items.map((item) => renderHoja(item, { subnivel: true }))}
          </div>
        )}
      </div>
    );
  }

  const rol = isAdmin ? "Administrador" : (userType ?? "").replace(/_/g, " ") || "Usuario";
  const etiquetaAlternar = compacto ? "Expandir menú" : "Contraer menú";

  return (
    <>
      {/* Botón flotante del menú (solo celular/tablet pequeña) */}
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
        className="fixed bottom-4 left-4 z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground shadow-lg md:hidden print:hidden"
      >
        {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={cerrarCajon} />
      )}

      <aside
        data-estado={compacto ? "iconos" : "expandido"}
        className={cn(
          "h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
          compacto ? "w-16" : "w-60",
          "md:static md:flex",
          mobileOpen ? "fixed inset-y-0 left-0 z-50 flex" : "hidden"
        )}
      >
        {/* Logo y botón de contraer */}
        <div
          className={cn(
            "flex shrink-0 items-center",
            compacto ? "flex-col gap-1 px-2 pt-4 pb-2" : "gap-2.5 px-5 py-5"
          )}
        >
          <Link href="/" onClick={cerrarCajon} className="flex items-center gap-2.5" aria-label="Inicio">
            <ShieldCheck className="h-7 w-7 shrink-0 text-sidebar-primary" />
            {!compacto && <span className="text-xl font-bold text-foreground">GESTIVO</span>}
          </Link>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={alternarModo}
                  aria-label={etiquetaAlternar}
                  className={cn(
                    "hidden h-8 w-8 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-muted hover:text-sidebar-primary md:inline-flex",
                    !compacto && "ml-auto"
                  )}
                />
              }
            >
              {compacto ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {etiquetaAlternar} <kbd className="ml-1 rounded bg-background/20 px-1 font-mono text-[10px]">Ctrl+B</kbd>
            </TooltipContent>
          </Tooltip>
        </div>

        <nav
          aria-label="Menú principal"
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden",
            compacto ? "items-center px-3" : "px-3"
          )}
        >
          {navTree.map((entry) =>
            entry.kind === "link" ? renderHoja(entry) : renderGrupo(entry)
          )}
        </nav>

        {/* Usuario en sesión, cambio de contraseña y salida */}
        <div
          className={cn(
            "shrink-0 border-t border-sidebar-border",
            compacto ? "flex flex-col items-center gap-0.5 px-3 py-3" : "px-3 py-3"
          )}
        >
          {userEmail &&
            (compacto ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div
                      role="img"
                      aria-label={`${userEmail}, ${rol}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                    />
                  }
                >
                  <CircleUserRound className="h-6 w-6 text-sidebar-primary" />
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className="flex-col items-start gap-0">
                  <span className="font-semibold">{userEmail}</span>
                  <span className="capitalize opacity-80">{rol}</span>
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="mb-1 flex items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5">
                <CircleUserRound className="h-6 w-6 shrink-0 text-sidebar-primary" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground" title={userEmail}>
                    {userEmail}
                  </p>
                  <p className="truncate text-[11px] capitalize text-muted-foreground">{rol}</p>
                </div>
              </div>
            ))}

          {compacto ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href="/cambiar-contrasena"
                    aria-label="Cambiar mi contraseña"
                    className={claseItem(false)}
                  />
                }
              >
                <KeyRound className={claseIcono(false)} />
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                Cambiar mi contraseña
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/cambiar-contrasena"
              onClick={cerrarCajon}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <KeyRound className="h-5 w-5 shrink-0 text-[#64748B]" />
              <span className="truncate">Cambiar mi contraseña</span>
            </Link>
          )}

          {compacto ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={cerrarSesion}
                    disabled={saliendo}
                    aria-label="Cerrar sesión"
                    className={cn(claseItem(false), "hover:bg-red-50 hover:text-red-600 disabled:opacity-50")}
                  />
                }
              >
                {saliendo ? (
                  <Loader2 className="h-5 w-5 animate-spin text-[#64748B]" />
                ) : (
                  <LogOut className="h-5 w-5 text-[#64748B]" />
                )}
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                Cerrar sesión
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={cerrarSesion}
              disabled={saliendo}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              {saliendo ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#64748B]" />
              ) : (
                <LogOut className="h-5 w-5 shrink-0 text-[#64748B]" />
              )}
              <span className="truncate">Cerrar sesión</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
