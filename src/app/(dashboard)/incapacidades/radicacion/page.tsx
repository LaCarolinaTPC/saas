import Link from "next/link";
import { Landmark } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarConsultaBandeja } from "@/lib/incapacidades/auditoria";
import { listarExpedientes, type ExpedienteVista } from "@/lib/incapacidades/expedientes";
import { cop, fechaCorta } from "@/lib/incapacidades/formato";
import {
  PESTANAS_COBRO,
  agruparPorEntidad,
  contarPestanas,
  pestanaDe,
  type PestanaCobro,
} from "@/lib/incapacidades/radicacion-reglas";
import { ChipEstado } from "../bandeja-tabla";
import { ChipRadicacion } from "../[id]/radicacion-panel";
import { Fallo, SinAcceso } from "../sin-acceso";

export const dynamic = "force-dynamic";

/**
 * Bandeja de cobro (plan, pantalla 4): los expedientes por lo que les falta
 * para cobrarse, agrupados por entidad con importes. Arranca del informe de
 * cobro de la matriz y le suma los valores y el estado de la radicación.
 */
export default async function BandejaCobroPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) return <SinAcceso titulo="Bandeja de cobro" />;

  const sp = await searchParams;
  const vista: PestanaCobro = PESTANAS_COBRO.some((p) => p.key === sp.vista) ? (sp.vista as PestanaCobro) : "por_radicar";

  let filas: ExpedienteVista[] = [];
  let fallo: string | null = null;
  try {
    filas = await listarExpedientes();
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }
  if (!fallo) {
    await auditarConsultaBandeja({ filtros: { bandeja: "cobro", vista }, filas: filas.length, rol: perms.userType, userEmail: perms.userEmail });
  }

  const conteo = contarPestanas(filas);
  const seleccion = filas.filter((f) => pestanaDe(f) === vista);
  const grupos = agruparPorEntidad(seleccion);
  const total = grupos.reduce((s, g) => s + g.valorReclamado, 0);
  const pestana = PESTANAS_COBRO.find((p) => p.key === vista)!;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Bandeja de cobro"
        icono={Landmark}
        volver={{ href: "/incapacidades", label: "Recuperación de incapacidades" }}
        descripcion="Qué se reclama a cada entidad y en qué punto está. Los importes salen de la liquidación vigente."
      />
      <div className="space-y-4 p-6">
        {fallo && <Fallo mensaje={fallo} />}

        <nav className="flex flex-wrap gap-2" aria-label="Pestañas de cobro">
          {PESTANAS_COBRO.map((p) => (
            <Link
              key={p.key}
              href={`/incapacidades/radicacion?vista=${p.key}`}
              title={p.descripcion}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm ${
                p.key === vista ? "border-gray-900 bg-gray-900 text-white" : "border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC]"
              }`}
            >
              {p.label}
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${p.key === vista ? "bg-white/20" : "bg-[#F1F5F9] text-gray-600"}`}>
                {conteo[p.key]}
              </span>
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-gray-600">
          <span>{pestana.descripcion}.</span>
          <span className="tabular-nums">
            {seleccion.length} expediente(s) · {grupos.length} entidad(es) · <strong className="text-gray-900">{cop(total)}</strong>
          </span>
        </div>

        {grupos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-white p-8 text-center text-sm text-gray-500">
            Nada en esta pestaña.
          </div>
        ) : (
          grupos.map((g) => (
            <section key={g.entidadId ?? g.entidad} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E2E8F0] px-4 py-2" style={{ borderLeft: `4px solid ${g.clase === "ARL" ? "#B45309" : "#0F766E"}` }}>
                <div>
                  <span className="font-semibold text-gray-900">{g.entidad}</span>
                  <span className="ml-2 text-xs text-gray-500">{g.clase ?? (g.entidadId ? "" : "sin homologar")}</span>
                </div>
                <div className="text-xs tabular-nums text-gray-600">
                  {g.incapacidades} incapacidad(es) · {g.dias} días · {g.diasEntidad} a cargo · <strong className="text-gray-900">{cop(g.valorReclamado)}</strong>
                </div>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2">Trabajador</th>
                      <th className="px-3 py-2">Incapacidad</th>
                      <th className="px-3 py-2 text-right">Días</th>
                      <th className="px-3 py-2 text-right">A cargo</th>
                      <th className="px-3 py-2 text-right">Reclamado</th>
                      <th className="px-3 py-2">Expediente</th>
                      <th className="px-3 py-2">Radicación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.filas.map((f) => (
                      <tr key={f.id} className="border-t border-[#F1F5F9] align-top hover:bg-[#F8FAFC]">
                        <td className="px-4 py-2">
                          <Link href={`/incapacidades/${f.id}`} className="font-medium text-gray-900 hover:underline">{f.nombre ?? "Sin nombre"}</Link>
                          <div className="text-xs tabular-nums text-gray-500">{f.cedula}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="tabular-nums text-gray-900">{fechaCorta(f.fecha_inicio)} → {fechaCorta(f.fecha_fin)}</div>
                          <div className="text-xs text-gray-500">{f.tipo_homologado ?? f.origen ?? "—"} · {f.modalidad_ajustada ?? f.indicador_prorroga ?? "—"}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.dias_incapacidad ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.dias_entidad_ajustados ?? f.dias_entidad ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.valor_reclamado != null ? cop(f.valor_reclamado) : <span className="text-xs italic text-gray-400">sin liquidar</span>}</td>
                        <td className="px-3 py-2"><ChipEstado estado={f.estado} /></td>
                        <td className="px-3 py-2">
                          {f.radicacion_estado ? (
                            <div>
                              <ChipRadicacion estado={f.radicacion_estado} />
                              {f.radicacion_codigo && <div className="mt-0.5 font-mono text-xs text-gray-700">{f.radicacion_codigo}</div>}
                              {f.radicacion_bajo_umbral && <div className="text-xs text-amber-700">bajo umbral, con excepción</div>}
                            </div>
                          ) : vista === "no_cobrables" ? (
                            <span className="text-xs text-gray-500">{f.dias_incapacidad ?? "—"} d &lt; umbral {f.entidad_dias_min_cobro ?? (f.entidad_clase === "ARL" ? 1 : 4)} d</span>
                          ) : (f.devoluciones ?? 0) > 0 ? (
                            <span className="text-xs text-amber-700">{f.devoluciones} devolución(es)</span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
