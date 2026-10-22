"use client";

/**
 * Barra de filtros de segmentación de accidentes. Escribe el estado en la URL
 * (searchParams) para que Consultar y Análisis compartan la misma selección y
 * sea enlazable/recargable. El servidor lee los params con `filtrosDesdeParams`.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { X } from "lucide-react";

type Opcion = { value: string; label: string };

const CLASE_OPC: Opcion[] = [
  { value: "simple", label: "Simple" },
  { value: "lesionado", label: "Con lesionado" },
  { value: "muerto", label: "Con muerto" },
];
const RESP_OPC: Opcion[] = [
  { value: "directo", label: "Conductor" },
  { value: "compartido", label: "Compartida" },
  { value: "tercero", label: "Tercero" },
  { value: "en_estudio", label: "En estudio" },
];
const FACTOR_OPC: Opcion[] = [
  { value: "exceso_velocidad", label: "Exceso de velocidad" },
  { value: "no_guardar_distancia", label: "No guardar distancia" },
  { value: "fatiga_comprobada", label: "Fatiga comprobada" },
  { value: "uso_celular", label: "Uso de celular" },
];
const TENENCIA_OPC: Opcion[] = [
  { value: "empresa", label: "Empresa" },
  { value: "afiliado", label: "Afiliado" },
];
const CASO_OPC: Opcion[] = [
  { value: "abierto", label: "Abierto" },
  { value: "cerrado", label: "Cerrado" },
];
const IPAT_OPC: Opcion[] = [
  { value: "si", label: "Con IPAT" },
  { value: "no", label: "Sin IPAT" },
];

/** Claves de filtro que maneja esta barra (sin contar la paginación/tab). */
const CLAVES = ["desde", "hasta", "clase", "resp", "factor", "ruta", "tenencia", "caso", "aseg", "ipat", "q"] as const;

export default function FiltrosAccidentes({
  basePath,
  rutas,
  aseguradoras,
}: {
  basePath: string;
  rutas: string[];
  aseguradoras: Opcion[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const push = useCallback(
    (cambios: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(cambios)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    },
    [params, router, basePath]
  );

  const g = (k: string) => params.get(k) ?? "";
  const activos = CLAVES.filter((k) => g(k) !== "").length;

  return (
    <div className="mb-4 rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Campo label="Desde">
          <input type="date" value={g("desde")} onChange={(e) => push({ desde: e.target.value })} className={inp} />
        </Campo>
        <Campo label="Hasta">
          <input type="date" value={g("hasta")} onChange={(e) => push({ hasta: e.target.value })} className={inp} />
        </Campo>
        <Select label="Gravedad" value={g("clase")} opc={CLASE_OPC} onChange={(v) => push({ clase: v })} />
        <Select label="Responsabilidad" value={g("resp")} opc={RESP_OPC} onChange={(v) => push({ resp: v })} />
        <Select label="Factor" value={g("factor")} opc={FACTOR_OPC} onChange={(v) => push({ factor: v })} />
        <Select
          label="Ruta"
          value={g("ruta")}
          opc={rutas.map((r) => ({ value: r, label: r }))}
          onChange={(v) => push({ ruta: v })}
        />
        <Select label="Tenencia" value={g("tenencia")} opc={TENENCIA_OPC} onChange={(v) => push({ tenencia: v })} />
        <Select label="Caso" value={g("caso")} opc={CASO_OPC} onChange={(v) => push({ caso: v })} />
        <Select label="Aseguradora" value={g("aseg")} opc={aseguradoras} onChange={(v) => push({ aseg: v })} />
        <Select label="IPAT" value={g("ipat")} opc={IPAT_OPC} onChange={(v) => push({ ipat: v })} />
        <Campo label="Buscar (conductor / placa / código)">
          <input
            type="search"
            defaultValue={g("q")}
            onKeyDown={(e) => {
              if (e.key === "Enter") push({ q: (e.target as HTMLInputElement).value });
            }}
            onBlur={(e) => push({ q: e.target.value })}
            placeholder="Cédula, nombre, placa…"
            className={inp}
          />
        </Campo>
      </div>

      {activos > 0 && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-gray-500">{activos} filtro(s) activo(s)</p>
          <button
            type="button"
            onClick={() => push(Object.fromEntries(CLAVES.map((k) => [k, undefined])))}
            className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-[#F8FAFC]"
          >
            <X className="h-3.5 w-3.5" /> Limpiar filtros
          </button>
        </div>
      )}
    </div>
  );
}

const inp = "w-full rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-gray-800 focus:border-[#4F46E5] focus:outline-none";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function Select({
  label,
  value,
  opc,
  onChange,
}: {
  label: string;
  value: string;
  opc: Opcion[];
  onChange: (v: string) => void;
}) {
  return (
    <Campo label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inp}>
        <option value="">Todas</option>
        {opc.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Campo>
  );
}
