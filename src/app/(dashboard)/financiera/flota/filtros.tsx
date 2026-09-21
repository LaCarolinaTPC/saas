"use client";

import { useCallback, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, X } from "lucide-react";
import type { OpcionesFiltro } from "@/lib/financiera/analisis";
import { VISTA_RENTABILIDAD_ETIQUETAS, type VistaRentabilidad } from "@/lib/financiera/motor";
import { MESES } from "@/lib/financiera/formato";

type Clave = "anio" | "mes" | "flota" | "propietario" | "vehiculo" | "vista";

/** Al cambiar un filtro se limpian los de más abajo en la cascada. */
const DEPENDIENTES: Record<Clave, Clave[]> = {
  anio: ["mes", "flota", "propietario", "vehiculo"],
  mes: ["flota", "propietario", "vehiculo"],
  flota: ["propietario", "vehiculo"],
  propietario: ["vehiculo"],
  vehiculo: [],
  vista: [],
};

/**
 * Filtros en cascada Año → Mes → Flota → Propietario → Vehículo, con el
 * estado en la URL: así la pantalla se comparte por enlace y el botón
 * «atrás» funciona. Elegir un mes ACUMULA desde enero hasta ese mes.
 */
export function BarraFiltros({
  anios,
  opciones,
  conVista = false,
}: {
  anios: number[];
  opciones: OpcionesFiltro;
  /** Las pantallas de rentabilidad y gasto por timbrada ofrecen la vista. */
  conVista?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pendiente, empezar] = useTransition();

  const valor = (k: Clave) => sp.get(k) ?? "";

  const cambiar = useCallback(
    (k: Clave, v: string) => {
      const q = new URLSearchParams(sp.toString());
      if (v) q.set(k, v);
      else q.delete(k);
      for (const d of DEPENDIENTES[k]) q.delete(d);
      empezar(() => router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false }));
    },
    [pathname, router, sp]
  );

  const anio = Number(valor("anio")) || anios[0];
  const mes = valor("mes");
  const chips: { k: Clave; etiqueta: string }[] = [];
  if (mes) chips.push({ k: "mes", etiqueta: `Acumulado a ${MESES[Number(mes) - 1]}` });
  if (valor("flota")) chips.push({ k: "flota", etiqueta: `Flota ${valor("flota")}` });
  if (valor("propietario")) {
    const o = opciones.propietarios.find((x) => x.valor === valor("propietario"));
    chips.push({ k: "propietario", etiqueta: o?.etiqueta ?? `Propietario ${valor("propietario")}` });
  }
  if (valor("vehiculo")) {
    const o = opciones.vehiculos.find((x) => x.valor === valor("vehiculo"));
    chips.push({ k: "vehiculo", etiqueta: `Vehículo ${o?.etiqueta ?? valor("vehiculo")}` });
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#E2E8F0] bg-white p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Año">
          <select className={selectCls} value={String(anio)} onChange={(e) => cambiar("anio", e.target.value)}>
            {anios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Mes (acumula desde enero)">
          <select className={selectCls} value={mes} onChange={(e) => cambiar("mes", e.target.value)}>
            <option value="">Todo el año</option>
            {opciones.meses.map((m) => (
              <option key={m} value={m}>{MESES[m - 1]}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Flota">
          <select className={selectCls} value={valor("flota")} onChange={(e) => cambiar("flota", e.target.value)}>
            <option value="">Todas</option>
            {opciones.flotas.map((o) => (
              <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={`Propietario (${opciones.propietarios.length})`}>
          <select className={`${selectCls} max-w-[260px]`} value={valor("propietario")} onChange={(e) => cambiar("propietario", e.target.value)}>
            <option value="">Todos</option>
            {opciones.propietarios.map((o) => (
              <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta={`Vehículo (${opciones.vehiculos.length})`}>
          <select className={selectCls} value={valor("vehiculo")} onChange={(e) => cambiar("vehiculo", e.target.value)}>
            <option value="">Todos</option>
            {opciones.vehiculos.map((o) => (
              <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
            ))}
          </select>
        </Campo>
        {conVista && (
          <Campo etiqueta="Vista de rentabilidad">
            <select className={selectCls} value={valor("vista") || "financiero"} onChange={(e) => cambiar("vista", e.target.value)}>
              {(Object.keys(VISTA_RENTABILIDAD_ETIQUETAS) as VistaRentabilidad[]).map((v) => (
                <option key={v} value={v}>{VISTA_RENTABILIDAD_ETIQUETAS[v]}</option>
              ))}
            </select>
          </Campo>
        )}
        {pendiente && <Loader2 className="mb-1.5 h-4 w-4 animate-spin text-gray-400" />}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.k}
              type="button"
              onClick={() => cambiar(c.k, "")}
              className="inline-flex items-center gap-1 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-2 py-0.5 text-xs text-gray-700 hover:border-red-200 hover:text-red-700"
            >
              {c.etiqueta}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const selectCls =
  "h-8 rounded-md border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{etiqueta}</span>
      {children}
    </label>
  );
}

// ── Pestañas del módulo ──────────────────────────────────────────────────────

export interface Pestana {
  href: string;
  label: string;
}

/** Pestañas que conservan los filtros de la URL al cambiar de pantalla. */
export function Pestanas({ pestanas }: { pestanas: Pestana[] }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const q = sp.toString();
  return (
    <nav className="-mb-px flex flex-wrap gap-1 overflow-x-auto border-b border-[#E2E8F0]" aria-label="Pantallas de Gestión de flota">
      {pestanas.map((p) => {
        const activa = pathname === p.href;
        return (
          <Link
            key={p.href}
            href={`${p.href}${q ? `?${q}` : ""}`}
            aria-current={activa ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              activa ? "border-[#4F46E5] text-[#4F46E5]" : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900"
            }`}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
