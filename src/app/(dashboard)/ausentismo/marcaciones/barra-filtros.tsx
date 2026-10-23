"use client";

/**
 * Barra de segmentación y búsqueda de Marcaciones, con las descargas al lado.
 *
 * Las descargas van **aquí y no en otra esquina** a propósito: lo que se baja
 * es exactamente lo que dejan ver estos controles, y tenerlos juntos es lo que
 * hace evidente que un archivo puede no ser el día completo.
 *
 * El estado vive en el cliente (ver `marcaciones-client.tsx`), no en la URL:
 * la pantalla se relee sola cada 5 minutos con `router.refresh()`, que
 * conserva el estado del cliente, y escribir cada tecla en la URL dispararía
 * una vuelta al servidor por letra.
 */
import { Fingerprint, Search, X } from "lucide-react";
import { BotonesExportar } from "@/components/ui/botones-exportar";
import type { FormatoExport } from "@/lib/exportar/formatos";
import {
  LLEGADA_LABEL,
  ORIGEN_LABEL,
  SECCIONES,
  SECCION_LABEL,
  FILTRO_VACIO,
  hayFiltro,
  type FiltroMarcaciones,
  type Seccion,
} from "@/lib/biometrico/filtros";

const ORIGENES = ["despacho", "historico", "vehiculo", "maestro"] as const;
const LLEGADAS = ["lector", "ambas", "access"] as const;

const SELECT =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]";

function Grupo({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-gray-500">{etiqueta}</span>
      {children}
    </label>
  );
}

export function BarraFiltros({
  filtro,
  onCambio,
  buses,
  conteos,
  visibles,
  total,
  onExportar,
}: {
  filtro: FiltroMarcaciones;
  onCambio: (f: FiltroMarcaciones) => void;
  buses: string[];
  /** Por sección: cuántas filas quedan y cuántas hay en el día. */
  conteos: Record<Seccion, { visible: number; total: number }>;
  /** Conductores distintos a la vista y esperados del día. */
  visibles: number;
  total: number;
  onExportar: (formato: FormatoExport) => Promise<void>;
}) {
  const puesto = hayFiltro(filtro);
  const set = (p: Partial<FiltroMarcaciones>) => onCambio({ ...filtro, ...p });

  function alternarSeccion(s: Seccion) {
    const activa = filtro.secciones.includes(s);
    const siguiente = activa
      ? filtro.secciones.filter((x) => x !== s)
      : [...filtro.secciones, s];
    set({ secciones: siguiente });
  }

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Grupo etiqueta="Buscar">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={filtro.texto}
              onChange={(e) => set({ texto: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Escape") set({ texto: "" });
              }}
              placeholder="Nombre, cédula, código, bus o pin"
              aria-label="Buscar conductor, bus o pin"
              className="h-9 w-64 rounded-lg border border-[#E2E8F0] bg-white pl-8 pr-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
            />
          </div>
        </Grupo>

        <Grupo etiqueta="Huella">
          <select
            value={filtro.huella}
            onChange={(e) => set({ huella: e.target.value as FiltroMarcaciones["huella"] })}
            className={SELECT}
          >
            <option value="todos">Todas</option>
            <option value="con">Con huella</option>
            <option value="sin">Sin huella</option>
          </select>
        </Grupo>

        <Grupo etiqueta="Se esperaba por">
          <select
            value={filtro.origen}
            onChange={(e) => set({ origen: e.target.value as FiltroMarcaciones["origen"] })}
            className={SELECT}
          >
            <option value="todos">Todos</option>
            {ORIGENES.map((o) => (
              <option key={o} value={o}>
                {ORIGEN_LABEL[o]}
              </option>
            ))}
          </select>
        </Grupo>

        <Grupo etiqueta="Llegó por">
          <select
            value={filtro.llegada}
            onChange={(e) => set({ llegada: e.target.value as FiltroMarcaciones["llegada"] })}
            className={SELECT}
          >
            <option value="todos">Todas</option>
            {LLEGADAS.map((l) => (
              <option key={l} value={l}>
                {LLEGADA_LABEL[l]}
              </option>
            ))}
          </select>
        </Grupo>

        <Grupo etiqueta="Bus">
          <select
            value={filtro.bus}
            onChange={(e) => set({ bus: e.target.value })}
            className={`${SELECT} max-w-[9rem]`}
          >
            <option value="">Todos</option>
            {buses.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Grupo>

        <div className="ml-auto flex items-end gap-2">
          {puesto && (
            <button
              type="button"
              onClick={() => onCambio(FILTRO_VACIO)}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-[#4F46E5] hover:bg-[#EEF2FF]"
            >
              <X className="h-4 w-4" />
              Limpiar
            </button>
          )}
          <BotonesExportar
            sinDatos={visibles === 0}
            onExportar={onExportar}
            formatos={["pdf", "csv"]}
          />
        </div>
      </div>

      {/* Secciones: se apagan y se encienden, con el conteo de lo que queda. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F1F5F9] pt-3">
        <span className="text-[11px] font-medium text-gray-500">Secciones</span>
        {SECCIONES.map((s) => {
          const activa = filtro.secciones.includes(s);
          const c = conteos[s];
          return (
            <button
              key={s}
              type="button"
              aria-pressed={activa}
              onClick={() => alternarSeccion(s)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                activa
                  ? "border-[#C7D2FE] bg-[#EEF2FF] text-[#4338CA]"
                  : "border-[#E2E8F0] bg-white text-gray-400 hover:bg-[#F8FAFC]"
              }`}
            >
              {SECCION_LABEL[s]} ({activa ? c.visible : 0}
              {c.visible !== c.total || !activa ? ` de ${c.total}` : ""})
            </button>
          );
        })}

        <span className="ml-auto text-xs text-gray-500">
          {puesto ? (
            <>
              <Fingerprint className="mr-1 inline h-3.5 w-3.5 text-gray-400" />
              <strong>{visibles}</strong> de {total} conductores a la vista — las descargas traen
              solo estos.
            </>
          ) : (
            <>
              <strong>{total}</strong> conductores esperados del día.
            </>
          )}
        </span>
      </div>
    </div>
  );
}
