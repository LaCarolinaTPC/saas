"use client";

/**
 * Paginación compartida de las tablas de Gestivo.
 *
 *  - Pantallas de cliente: `usePaginacion(filas)` devuelve la página vigente y
 *    se pinta `<Paginador p={…} />` debajo de la tabla.
 *  - Páginas de servidor: `<TablaPaginada encabezado={<thead>…} filas={[<tr/>…]} />`
 *    recibe las filas ya armadas y solo pagina en el navegador.
 *
 * La página vuelve a 1 cuando cambia la cantidad de filas (un filtro nuevo) o
 * la clave `reiniciar`, para no quedar en una página vacía.
 */

import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { POR_PAGINA_DEFECTO, TAMANOS_PAGINA, paginar, paginasVisibles, type Pagina } from "@/lib/tabla/paginacion";

export interface Paginacion<T> extends Pagina<T> {
  porPagina: number;
  irA: (pagina: number) => void;
  cambiarPorPagina: (n: number) => void;
}

export function usePaginacion<T>(
  items: readonly T[],
  opciones: { porPagina?: number; reiniciar?: unknown } = {}
): Paginacion<T> {
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(opciones.porPagina ?? POR_PAGINA_DEFECTO);
  // Ajuste durante el render (patrón recomendado por React, sin efecto): si
  // cambió el total o la clave de reinicio, vuelve a la primera página.
  const clave = `${items.length}|${String(opciones.reiniciar ?? "")}`;
  const [claveAnterior, setClaveAnterior] = useState(clave);
  if (clave !== claveAnterior) {
    setClaveAnterior(clave);
    setPagina(1);
  }
  const p = paginar(items, pagina, porPagina);
  return {
    ...p,
    porPagina,
    irA: (n) => setPagina(n),
    cambiarPorPagina: (n) => {
      setPorPagina(n);
      setPagina(1);
    },
  };
}

const btn =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40";

/** Pie de tabla: "Mostrando 26–50 de 312", filas por página y navegación. */
export function Paginador<T>({
  p,
  unidad = "registros",
  className = "",
  ancla,
}: {
  p: Paginacion<T>;
  /** Cómo se llaman las filas en el contador ("viajes", "conductores"…). */
  unidad?: string;
  className?: string;
  /** Elemento al que se vuelve al cambiar de página, para no quedar al fondo. */
  ancla?: React.RefObject<HTMLElement | null>;
}) {
  // Con pocas filas no estorba: solo el contador.
  if (p.total <= TAMANOS_PAGINA[0]) {
    return p.total > 0 ? (
      <div className={`border-t border-[#F1F5F9] px-4 py-2 text-xs text-gray-500 ${className}`}>
        {p.total.toLocaleString("es-CO")} {unidad}
      </div>
    ) : null;
  }
  const ir = (n: number) => {
    p.irA(n);
    ancla?.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  return (
    <nav
      aria-label="Paginación"
      className={`flex flex-wrap items-center justify-between gap-2 border-t border-[#F1F5F9] px-4 py-3 ${className}`}
    >
      <p className="text-sm text-gray-500">
        Mostrando {p.desde.toLocaleString("es-CO")}–{p.hasta.toLocaleString("es-CO")} de {p.total.toLocaleString("es-CO")} {unidad}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          aria-label="Filas por página"
          value={p.porPagina}
          onChange={(e) => p.cambiarPorPagina(Number(e.target.value))}
          className="h-8 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
        >
          {TAMANOS_PAGINA.map((n) => (
            <option key={n} value={n}>{n} / pág.</option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Página anterior"
          onClick={() => ir(p.pagina - 1)}
          disabled={p.pagina <= 1}
          className={`${btn} border-[#E2E8F0] bg-white text-gray-700 hover:bg-gray-50`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {paginasVisibles(p.pagina, p.totalPaginas).map((n, i) =>
          n == null ? (
            <span key={`s${i}`} className="px-1 text-sm text-gray-400">…</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => ir(n)}
              aria-current={n === p.pagina ? "page" : undefined}
              className={`${btn} ${n === p.pagina ? "border-[#4F46E5] bg-[#4F46E5] text-white" : "border-[#E2E8F0] bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {n}
            </button>
          )
        )}
        <button
          type="button"
          aria-label="Página siguiente"
          onClick={() => ir(p.pagina + 1)}
          disabled={p.pagina >= p.totalPaginas}
          className={`${btn} border-[#E2E8F0] bg-white text-gray-700 hover:bg-gray-50`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

/**
 * Tabla paginada para páginas de servidor: recibe el encabezado y las filas
 * ya renderizadas (cada una con su `key`) y las pagina en el navegador.
 */
export function TablaPaginada({
  encabezado,
  filas,
  vacio,
  unidad,
  porPagina,
  className = "w-full text-sm",
  contenedorClassName = "overflow-x-auto",
}: {
  encabezado: ReactNode;
  filas: ReactNode[];
  vacio?: ReactNode;
  unidad?: string;
  porPagina?: number;
  className?: string;
  contenedorClassName?: string;
}) {
  const p = usePaginacion(filas, { porPagina });
  const ancla = useRef<HTMLDivElement>(null);
  return (
    <div ref={ancla}>
      <div className={contenedorClassName}>
        <table className={className}>
          {encabezado}
          <tbody>{p.filas}</tbody>
        </table>
      </div>
      {filas.length === 0 && vacio}
      <Paginador p={p} unidad={unidad} ancla={ancla} />
    </div>
  );
}
