"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Maximize2, Minimize2, Rows3, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { pasaFiltroNumero, sinTildes } from "@/lib/tabla/filtros";

/**
 * Tabla con orden y filtro en cada columna, para que quien revisa arme la
 * vista que necesita: clic en el título ordena (ascendente → descendente →
 * orden original) y la fila bajo el título filtra según el tipo de columna.
 *
 *  - texto: contiene, sin distinguir mayúsculas ni tildes.
 *  - numero: ">10", ">=10", "<0", "5", "!=0", "10..20", "±10" (|valor| ≥ 10), "vacío".
 *  - lista: un valor de los que hay en la columna.
 *
 * Barra de la tabla: elegir columnas visibles, modo compacto y ampliar a
 * pantalla completa (Esc para salir). Columnas y compacto se recuerdan en el
 * navegador por tabla (`id`); si el almacenamiento falla, se usan los valores
 * por defecto. Las filas filtradas y ordenadas se paginan con el paginador
 * compartido.
 */

const leer = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export type TipoColumna = "texto" | "numero" | "lista";

export interface ColumnaTabla<T> {
  clave: string;
  titulo: string;
  tipo: TipoColumna;
  valor: (fila: T) => string | number | null;
  render?: (fila: T) => React.ReactNode;
  /** Ayuda del título. */
  ayuda?: string;
  claseCelda?: string | ((fila: T) => string);
  claseTitulo?: string;
  /** Sin filtro ni orden (p. ej. la casilla de revisión). */
  fija?: boolean;
  /** Título propio de una columna fija; recibe las filas que pasan los filtros (p. ej. «marcar todos»). */
  renderTitulo?: (visibles: T[]) => React.ReactNode;
}

type Orden = { clave: string; dir: 1 | -1 } | null;

export function TablaFiltrable<T>({
  id, filas, columnas, claveFila, claseFila, onFila, vacio = "No hay registros con estos filtros.", porPagina, filtrosIniciales,
}: {
  /** Clave para recordar columnas visibles y modo compacto en el navegador. */
  id?: string;
  filas: T[];
  columnas: ColumnaTabla<T>[];
  claveFila: (f: T) => string | number;
  claseFila?: (f: T) => string;
  onFila?: (f: T) => void;
  vacio?: string;
  /** Filas por página al abrir (por defecto el del paginador compartido). */
  porPagina?: number;
  /** Filtros de columna con los que abre la tabla, p. ej. {revisado: "Pendiente"}. */
  filtrosIniciales?: Record<string, string>;
}) {
  const [orden, setOrden] = useState<Orden>(null);
  const [filtros, setFiltros] = useState<Record<string, string>>(filtrosIniciales ?? {});
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [compacto, setCompacto] = useState(false);
  const [ampliada, setAmpliada] = useState(false);

  // Preferencias guardadas: se leen al montar (en el servidor no hay localStorage).
  useEffect(() => {
    const o = id ? leer(`tabla:${id}:ocultas`) : null;
    const cmp = leer("tabla:compacto");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencias del navegador, solo al montar
    if (o) { try { setOcultas(new Set(JSON.parse(o) as string[])); } catch { /* valor dañado: se ignora */ } }
    if (cmp === "1") setCompacto(true);
  }, [id]);

  // Pantalla completa: Esc sale y la página de fondo no se desplaza.
  useEffect(() => {
    if (!ampliada) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAmpliada(false); };
    window.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", tecla); document.body.style.overflow = antes; };
  }, [ampliada]);

  const cols = useMemo(() => columnas.filter((c) => c.fija || !ocultas.has(c.clave)), [columnas, ocultas]);
  const ocultables = columnas.filter((c) => !c.fija);

  function alternarColumna(clave: string) {
    setOcultas((prev) => {
      const n = new Set(prev);
      if (n.has(clave)) n.delete(clave);
      else {
        n.add(clave);
        // Un filtro sobre una columna oculta no se ve: se quita.
        setFiltros((f) => { const x = { ...f }; delete x[clave]; return x; });
        setOrden((o) => (o?.clave === clave ? null : o));
      }
      if (id) guardar(`tabla:${id}:ocultas`, JSON.stringify([...n]));
      return n;
    });
  }
  function todasLasColumnas() {
    setOcultas(new Set());
    if (id) guardar(`tabla:${id}:ocultas`, "[]");
  }
  function alternarCompacto() {
    setCompacto((c) => { guardar("tabla:compacto", c ? "0" : "1"); return !c; });
  }

  const opciones = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const c of columnas) {
      if (c.tipo !== "lista") continue;
      const s = new Set<string>();
      for (const f of filas) { const v = c.valor(f); s.add(v == null || v === "" ? "(vacío)" : String(v)); }
      o[c.clave] = [...s].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
    }
    return o;
  }, [filas, columnas]);

  const visibles = useMemo(() => {
    const activos = columnas.filter((c) => filtros[c.clave]?.trim());
    let out = activos.length
      ? filas.filter((f) => activos.every((c) => {
          const expr = filtros[c.clave];
          const v = c.valor(f);
          if (c.tipo === "numero") return pasaFiltroNumero(expr, v == null || v === "" ? null : Number(v));
          if (c.tipo === "lista") return (v == null || v === "" ? "(vacío)" : String(v)) === expr;
          return sinTildes(String(v ?? "")).includes(sinTildes(expr.trim()));
        }))
      : filas;
    if (orden) {
      const c = columnas.find((x) => x.clave === orden.clave);
      if (c) {
        out = [...out].sort((a, b) => {
          const va = c.valor(a), vb = c.valor(b);
          // Los vacíos siempre al final, en cualquier sentido.
          if (va == null || va === "") return vb == null || vb === "" ? 0 : 1;
          if (vb == null || vb === "") return -1;
          const r = typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb), "es", { numeric: true });
          return r * orden.dir;
        });
      }
    }
    return out;
  }, [filas, columnas, filtros, orden]);

  const alternarOrden = (clave: string) =>
    setOrden((o) => (!o || o.clave !== clave ? { clave, dir: 1 } : o.dir === 1 ? { clave, dir: -1 } : null));
  const ponerFiltro = (clave: string, v: string) => setFiltros((f) => ({ ...f, [clave]: v }));
  const hayFiltros = Object.values(filtros).some((v) => v.trim()) || orden;

  // Página de las filas ya filtradas y ordenadas; un filtro u orden nuevo vuelve a la 1.
  const pagina = usePaginacion(visibles, { porPagina, reiniciar: JSON.stringify([filtros, orden]) });
  const desplazable = useRef<HTMLDivElement>(null);
  // Al cambiar de página el contenedor con scroll propio vuelve arriba.
  useEffect(() => { desplazable.current?.scrollTo({ top: 0 }); }, [pagina.pagina, pagina.porPagina]);

  const btn = "inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-text-secondary hover:bg-slate-50";
  const th = "whitespace-nowrap px-2 pt-2 pb-1 text-left text-[11px] font-semibold uppercase tracking-wide text-text-tertiary";
  const inp = "w-full min-w-[3.5rem] rounded border border-border bg-white px-1.5 py-0.5 text-[11px] font-normal normal-case tracking-normal text-text-primary placeholder:text-text-tertiary/70";

  return (
    <div className={ampliada
      ? "fixed inset-0 z-40 flex flex-col overflow-hidden bg-white"
      : "overflow-hidden rounded-xl border border-border bg-white"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-xs text-text-secondary">
        <span>
          {visibles.length === filas.length ? `${filas.length} registros` : `${visibles.length} de ${filas.length} registros`}
          {orden && ` · ordenado por ${columnas.find((c) => c.clave === orden.clave)?.titulo} ${orden.dir === 1 ? "↑" : "↓"}`}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {hayFiltros && (
            <button type="button" onClick={() => { setFiltros({}); setOrden(null); }} className="mr-1 inline-flex items-center gap-1 text-primary hover:underline">
              <X className="h-3 w-3" /> Quitar filtros y orden
            </button>
          )}
          <Popover>
            <PopoverTrigger className={`${btn} ${ocultas.size ? "border-primary text-primary" : ""}`} title="Elegir columnas visibles">
              <Columns3 className="h-3.5 w-3.5" /> Columnas{ocultas.size ? ` (${ocultables.length - ocultas.size}/${ocultables.length})` : ""}
            </PopoverTrigger>
            <PopoverContent className="z-[60] w-56 p-2" align="end">
              <div className="mb-1 flex items-center justify-between px-1 text-xs font-semibold text-text-secondary">
                <span>Columnas visibles</span>
                {ocultas.size > 0 && <button type="button" onClick={todasLasColumnas} className="font-normal text-primary hover:underline">Todas</button>}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {ocultables.map((c) => (
                  <label key={c.clave} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-slate-50">
                    <input
                      type="checkbox" checked={!ocultas.has(c.clave)} onChange={() => alternarColumna(c.clave)}
                      disabled={!ocultas.has(c.clave) && ocultables.length - ocultas.size <= 1}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    {c.titulo}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <button type="button" onClick={alternarCompacto} className={`${btn} ${compacto ? "border-primary bg-primary/10 text-primary" : ""}`} aria-pressed={compacto} title="Filas más bajas para ver más registros">
            <Rows3 className="h-3.5 w-3.5" /> Compacto
          </button>
          <button type="button" onClick={() => setAmpliada((a) => !a)} className={`${btn} ${ampliada ? "border-primary bg-primary/10 text-primary" : ""}`} aria-pressed={ampliada}
            title={ampliada ? "Volver (Esc)" : "Ampliar la tabla a toda la pantalla"}>
            {ampliada ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />} {ampliada ? "Salir (Esc)" : "Ampliar"}
          </button>
        </div>
      </div>
      {/* Alto acotado para que el encabezado con los filtros quede fijo al bajar. */}
      <div ref={desplazable} className={ampliada ? "min-h-0 flex-1 overflow-auto" : "max-h-[75vh] overflow-auto"}>
        <table className={`min-w-full ${compacto ? "text-[11px] leading-tight [&_tbody_td]:py-0.5! [&_thead_th]:pt-1! [&_thead_th]:pb-1! [&_.line-clamp-2]:line-clamp-1!" : "text-xs"}`}>
          <thead className="sticky top-0 z-10 border-b border-border bg-slate-50 align-top shadow-[0_1px_0_var(--color-border)]">
            <tr>
              {cols.map((c) => {
                const activa = orden?.clave === c.clave;
                const Icono = activa ? (orden!.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th key={c.clave} className={`${th} ${c.claseTitulo ?? ""}`} title={c.ayuda} aria-sort={activa ? (orden!.dir === 1 ? "ascending" : "descending") : undefined}>
                    {c.fija ? (c.renderTitulo ? c.renderTitulo(visibles) : c.titulo) : (
                      <button type="button" onClick={() => alternarOrden(c.clave)} className={`inline-flex items-center gap-1 uppercase hover:text-text-primary ${activa ? "text-primary" : ""}`}>
                        {c.titulo}
                        <Icono className={`h-3 w-3 ${activa ? "" : "opacity-40"}`} />
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
            <tr>
              {cols.map((c) => (
                <th key={c.clave} className={`px-2 pb-2 ${c.claseTitulo ?? ""}`}>
                  {c.fija ? null : c.tipo === "lista" ? (
                    <select
                      value={filtros[c.clave] ?? ""} onChange={(e) => ponerFiltro(c.clave, e.target.value)}
                      className={`${inp} ${filtros[c.clave] ? "border-primary" : ""}`} aria-label={`Filtrar ${c.titulo}`}
                    >
                      <option value="">Todos</option>
                      {opciones[c.clave]?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      value={filtros[c.clave] ?? ""} onChange={(e) => ponerFiltro(c.clave, e.target.value)}
                      placeholder={c.tipo === "numero" ? ">0, ±10" : "Filtrar"}
                      title={c.tipo === "numero" ? "Ejemplos: >10 · <0 · 5 · !=0 · 10..20 · ±10 (diferencia de 10 o más) · vacío" : "Texto que contiene"}
                      className={`${inp} ${filtros[c.clave]?.trim() ? "border-primary" : ""}`} aria-label={`Filtrar ${c.titulo}`}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibles.length === 0 && (
              <tr><td colSpan={cols.length} className="p-8 text-center text-sm text-text-tertiary">{vacio}</td></tr>
            )}
            {pagina.filas.map((f) => (
              <tr key={claveFila(f)} onClick={onFila ? () => onFila(f) : undefined} className={`${onFila ? "cursor-pointer hover:bg-primary/5" : ""} ${claseFila?.(f) ?? ""}`}>
                {cols.map((c) => (
                  <td key={c.clave} className={typeof c.claseCelda === "function" ? c.claseCelda(f) : (c.claseCelda ?? "whitespace-nowrap px-2 py-1.5 tabular-nums")}>
                    {c.render ? c.render(f) : c.tipo === "numero" && typeof c.valor(f) === "number" ? (c.valor(f) as number).toLocaleString("es-CO") : c.valor(f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginador p={pagina} unidad="registros" className={ampliada ? "shrink-0" : ""} />
    </div>
  );
}
