import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import {
  buscarCandidatasAltaManual,
  leerCorte,
  type CandidataAltaManual,
} from "@/lib/incapacidades/expedientes";
import { fechaCorta } from "@/lib/incapacidades/formato";
import { Fallo, SinAcceso } from "../sin-acceso";
import { incorporar } from "./actions";

export const dynamic = "force-dynamic";

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";

/**
 * Alta manual: incorporar a la gestión una incapacidad anterior al corte
 * (por lo general una licencia de maternidad en curso de cobro). Se busca por
 * cédula, se elige la incapacidad y se escribe el motivo.
 */
export default async function AltaManualPage({
  searchParams,
}: {
  searchParams: Promise<{ cedula?: string; error?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) return <SinAcceso />;
  if (!perms.puedeEditar) {
    return <SinAcceso titulo="Alta manual" motivo="Tu tipo de usuario consulta el módulo pero no incorpora incapacidades." />;
  }

  const sp = await searchParams;
  const cedula = (sp.cedula ?? "").replace(/\D/g, "");

  let corte: string | null = null;
  let candidatas: CandidataAltaManual[] = [];
  let fallo: string | null = null;
  try {
    corte = await leerCorte();
    if (cedula) candidatas = await buscarCandidatasAltaManual(cedula);
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Alta manual de una incapacidad anterior al corte"
        icono={FilePlus2}
        volver={{ href: "/incapacidades", label: "Recuperación de incapacidades" }}
        descripcion={`Solo para incapacidades vigentes de la matriz que iniciaron antes del ${corte ? fechaCorta(corte) : "corte"} y que RRHH está cobrando. El motivo queda en el expediente y en la auditoría.`}
      />
      <div className="space-y-4 p-6">
        {fallo && <Fallo mensaje={fallo} />}
        {sp.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{sp.error}</div>
        )}

        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3">
          <label className="text-xs text-gray-500">
            <span className="mb-1 block font-medium uppercase tracking-wide">Cédula del trabajador</span>
            <input id="cedula" name="cedula" defaultValue={cedula} inputMode="numeric" placeholder="solo dígitos" required className={`${inputCls} w-56`} />
          </label>
          <button type="submit" className="h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800">
            Buscar incapacidades
          </button>
        </form>

        {cedula && !fallo && candidatas.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-white p-6 text-sm text-gray-500">
            La cédula {cedula} no tiene incapacidades vigentes anteriores al corte en la matriz. Si la incapacidad es de
            septiembre en adelante ya tiene expediente en la <Link href="/incapacidades" className="text-[#0F766E] underline">bandeja</Link>.
          </div>
        )}

        {candidatas.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Trabajador</th>
                  <th className="px-3 py-2">Incapacidad</th>
                  <th className="px-3 py-2 text-right">Días</th>
                  <th className="px-3 py-2">Pagador</th>
                  <th className="px-3 py-2">Motivo del alta manual</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {candidatas.map((c) => {
                  const pagador = ["AT", "EL"].includes((c.origen ?? "").toUpperCase()) ? (c.arl ?? c.eps) : c.eps;
                  return (
                    <tr key={c.id} className="border-b border-[#F1F5F9] align-top last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{c.nombre ?? "Sin nombre"}</div>
                        <div className="text-xs tabular-nums text-gray-500">{c.cedula}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="tabular-nums text-gray-900">{fechaCorta(c.fecha_inicio)} → {fechaCorta(c.fecha_fin)}</div>
                        <div className="text-xs text-gray-500">
                          {c.origen ?? "—"} · {c.indicador_prorroga ?? "—"}{c.consecutivo_incapacidad ? ` · ${c.consecutivo_incapacidad}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-900">{c.dias_it_pagados ?? "—"}</td>
                      <td className="px-3 py-2 text-gray-900">{pagador ?? "—"}</td>
                      {c.expediente_id ? (
                        <td className="px-3 py-2 text-xs text-gray-500" colSpan={2}>
                          Ya tiene expediente:{" "}
                          <Link href={`/incapacidades/${c.expediente_id}`} className="text-[#0F766E] underline">abrirlo</Link>
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2">
                            <textarea
                              name="motivo"
                              form={`alta-${c.id}`}
                              required
                              minLength={10}
                              rows={2}
                              placeholder="Por qué se gestiona aunque inició antes del corte (mínimo 10 caracteres)"
                              className="w-full min-w-[260px] rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:border-[#94A3B8]"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <form id={`alta-${c.id}`} action={incorporar}>
                              <input type="hidden" name="ausentismo_id" value={c.id} />
                              <input type="hidden" name="cedula" value={c.cedula} />
                              <input type="hidden" name="nombre" value={c.nombre ?? ""} />
                              <button type="submit" className="h-9 whitespace-nowrap rounded-lg bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800">
                                Incorporar
                              </button>
                            </form>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
