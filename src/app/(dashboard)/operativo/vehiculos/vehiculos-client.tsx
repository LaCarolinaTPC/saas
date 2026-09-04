"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Search } from "lucide-react";
import { BuscadorOpciones, normalizarTexto, type OpcionBuscable } from "@/components/ui/buscador-opciones";
import {
  NIVELES_VENCIMIENTO, NIVEL_LABEL, NIVEL_COLOR, etiquetaVehiculo, fechaLegible, textoDias,
  type TipoDocumento,
} from "@/lib/operativo/constants";
import type { VehiculoResumen } from "@/lib/operativo/data";
import { ChipNivel } from "../ui";

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";

/**
 * Lista de vehículos activos con un chip por documento y su peor nivel. El
 * buscador abre la ficha directo; la tabla se filtra por texto y nivel.
 */
export function VehiculosClient({ tipos, vehiculos }: { tipos: TipoDocumento[]; vehiculos: VehiculoResumen[] }) {
  const router = useRouter();
  const [nivel, setNivel] = useState("");
  const [q, setQ] = useState("");

  const opciones = useMemo<OpcionBuscable[]>(() => vehiculos.map((v) => ({
    valor: v.codigo,
    etiqueta: etiquetaVehiculo(v),
    secundario: v.conductor_nombre ?? (v.ruta ? `Ruta ${v.ruta}` : undefined),
    claves: [v.codigo, v.placa ?? "", v.conductor_nombre ?? ""].filter(Boolean),
  })), [vehiculos]);

  const visibles = useMemo(() => {
    const nq = normalizarTexto(q);
    return vehiculos.filter((v) => {
      if (nivel && v.peor !== nivel) return false;
      if (nq && !normalizarTexto(`${v.codigo} ${v.placa ?? ""} ${v.conductor_nombre ?? ""} ${v.ruta ?? ""}`).includes(nq)) return false;
      return true;
    });
  }, [vehiculos, nivel, q]);

  const conteos = useMemo(() => {
    const c: Record<string, number> = {};
    for (const v of vehiculos) c[v.peor] = (c[v.peor] ?? 0) + 1;
    return c;
  }, [vehiculos]);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Consultar vehículo</label>
        <BuscadorOpciones
          opciones={opciones}
          value=""
          onChange={(codigo) => codigo && router.push(`/operativo/vehiculos/${codigo}`)}
          placeholder="Digita el número, la placa o el conductor…"
          ayuda="Al elegirlo se abre la ficha con sus documentos."
          vacio={(b) => `Ningún vehículo activo coincide con "${b}".`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <span>{visibles.length} de {vehiculos.length} vehículo{vehiculos.length === 1 ? "" : "s"} activos</span>
        {NIVELES_VENCIMIENTO.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNivel(nivel === n ? "" : n)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${nivel === n ? "ring-2 ring-offset-1" : ""} ${(conteos[n] ?? 0) > 0 ? "text-white" : "bg-[#F1F5F9] text-gray-500"}`}
            style={(conteos[n] ?? 0) > 0 ? { backgroundColor: NIVEL_COLOR[n].fuerte } : undefined}
            title={`Vehículos cuyo documento más grave está en ${NIVEL_LABEL[n].toLowerCase()}`}
          >
            {conteos[n] ?? 0} {NIVEL_LABEL[n].toLowerCase()}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar la lista" className={`${inputCls} w-56 pl-8`} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Vehículo</th>
                <th className="px-3 py-2">Conductor</th>
                <th className="px-3 py-2">Ruta</th>
                {tipos.map((t) => <th key={t.key} className="px-3 py-2">{t.nombre}</th>)}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((v) => (
                <tr key={v.codigo} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]" style={v.peor !== "al_dia" ? { backgroundColor: NIVEL_COLOR[v.peor].suave } : undefined}>
                  <td className="px-3 py-2"><ChipNivel nivel={v.peor} /></td>
                  <td className="px-3 py-2">
                    <Link href={`/operativo/vehiculos/${v.codigo}`} className="font-medium text-gray-900 hover:text-[#4F46E5]">{etiquetaVehiculo(v)}</Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{v.conductor_nombre ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">{v.ruta ?? "—"}</td>
                  {tipos.map((t) => {
                    const f = v.filas.find((x) => x.tipo === t.key);
                    if (!f) return <td key={t.key} className="px-3 py-2 text-xs text-gray-400">—</td>;
                    return (
                      <td key={t.key} className="px-3 py-2">
                        <span title={`${fechaLegible(f.fecha_vigente)} · ${textoDias(f.dias)}`} className="inline-flex flex-col gap-0.5">
                          <ChipNivel nivel={f.nivel} pequeno />
                          <span className="text-[11px] text-gray-500">{fechaLegible(f.fecha_vigente)}</span>
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right">
                    <Link href={`/operativo/vehiculos/${v.codigo}`} title="Abrir la ficha" className="inline-flex rounded p-1 text-gray-400 hover:bg-white hover:text-[#4F46E5]">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={5 + tipos.length} className="px-4 py-8 text-center text-sm text-gray-500">
                    {vehiculos.length === 0 ? "Sin vehículos activos en el maestro." : "Ningún vehículo cumple el filtro."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
