"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import { pasaFiltroNumero, sinTildes } from "@/lib/tabla/filtros";

/**
 * Tabla con orden y filtro en cada columna, para que quien revisa arme la
 * vista que necesita: clic en el título ordena (ascendente → descendente →
 * orden original) y la fila bajo el título filtra según el tipo de columna.
 *
 *  - texto: contiene, sin distinguir mayúsculas ni tildes.
 *  - numero: ">10", ">=10", "<0", "5", "!=0", "10..20", "±10" (|valor| ≥ 10), "vacío".
 *  - lista: un valor de los que hay en la columna.
 */

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
}

type Orden = { clave: string; dir: 1 | -1 } | null;

export function TablaFiltrable<T>({
  filas, columnas, claveFila, claseFila, onFila, vacio = "No hay registros con estos filtros.", lote = 300, filtrosIniciales,
}: {
  filas: T[];
  columnas: ColumnaTabla<T>[];
  claveFila: (f: T) => string | number;
  claseFila?: (f: T) => string;
  onFila?: (f: T) => void;
  vacio?: string;
  lote?: number;
  /** Filtros de columna con los que abre la tabla, p. ej. {revisado: "Pendiente"}. */
  filtrosIniciales?: Record<string, string>;
}) {
  const [orden, setOrden] = useState<Orden>(null);
  const [filtros, setFiltros] = useState<Record<string, string>>(filtrosIniciales ?? {});
  const [limite, setLimite] = useState(lote);

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
  const ponerFiltro = (clave: string, v: string) => { setFiltros((f) => ({ ...f, [clave]: v })); setLimite(lote); };
  const hayFiltros = Object.values(filtros).some((v) => v.trim()) || orden;

  const th = "whitespace-nowrap px-2 pt-2 pb-1 text-left text-[11px] font-semibold uppercase tracking-wide text-text-tertiary";
  const inp = "w-full min-w-[3.5rem] rounded border border-border bg-white px-1.5 py-0.5 text-[11px] font-normal normal-case tracking-normal text-text-primary placeholder:text-text-tertiary/70";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 text-xs text-text-secondary">
        <span>
          {visibles.length === filas.length ? `${filas.length} registros` : `${visibles.length} de ${filas.length} registros`}
          {orden && ` · ordenado por ${columnas.find((c) => c.clave === orden.clave)?.titulo} ${orden.dir === 1 ? "↑" : "↓"}`}
        </span>
        {hayFiltros && (
          <button type="button" onClick={() => { setFiltros({}); setOrden(null); }} className="inline-flex items-center gap-1 text-primary hover:underline">
            <X className="h-3 w-3" /> Quitar filtros y orden de columnas
          </button>
        )}
      </div>
      {/* Alto acotado para que el encabezado con los filtros quede fijo al bajar. */}
      <div className="max-h-[75vh] overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-10 border-b border-border bg-slate-50 align-top shadow-[0_1px_0_var(--color-border)]">
            <tr>
              {columnas.map((c) => {
                const activa = orden?.clave === c.clave;
                const Icono = activa ? (orden!.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th key={c.clave} className={`${th} ${c.claseTitulo ?? ""}`} title={c.ayuda} aria-sort={activa ? (orden!.dir === 1 ? "ascending" : "descending") : undefined}>
                    {c.fija ? c.titulo : (
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
              {columnas.map((c) => (
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
              <tr><td colSpan={columnas.length} className="p-8 text-center text-sm text-text-tertiary">{vacio}</td></tr>
            )}
            {visibles.slice(0, limite).map((f) => (
              <tr key={claveFila(f)} onClick={onFila ? () => onFila(f) : undefined} className={`${onFila ? "cursor-pointer hover:bg-primary/5" : ""} ${claseFila?.(f) ?? ""}`}>
                {columnas.map((c) => (
                  <td key={c.clave} className={typeof c.claseCelda === "function" ? c.claseCelda(f) : (c.claseCelda ?? "whitespace-nowrap px-2 py-1.5 tabular-nums")}>
                    {c.render ? c.render(f) : c.tipo === "numero" && typeof c.valor(f) === "number" ? (c.valor(f) as number).toLocaleString("es-CO") : c.valor(f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibles.length > limite && (
        <div className="border-t border-border p-2 text-center">
          <button type="button" onClick={() => setLimite((l) => l + lote)} className="text-sm font-medium text-primary hover:underline">
            Mostrar más ({visibles.length - limite} restantes)
          </button>
        </div>
      )}
    </div>
  );
}
