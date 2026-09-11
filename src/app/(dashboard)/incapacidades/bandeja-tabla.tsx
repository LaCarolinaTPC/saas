import Link from "next/link";
import { AlertTriangle, Pencil, UserX } from "lucide-react";
import type { ExpedienteVista, ResumenBandeja } from "@/lib/incapacidades/expedientes";
import {
  PROCEDENCIA,
  RECIBIDO_DESDE_LABEL,
  colorEstado,
  cop,
  etiquetaEstado,
  fechaCorta,
} from "@/lib/incapacidades/formato";

/**
 * Bandeja de expedientes: componente puro (recibe filas ya leídas), así se
 * puede ver con datos de muestra antes de tocar la base.
 *
 * Cada grupo de columnas lleva el color de su procedencia (plan, pantalla 1):
 * lo recibido de la matriz no es lo mismo que lo homologado, lo calculado o
 * lo que RRHH completó, y en una fila a medio gestionar conviven los cuatro.
 */

export function ChipEstado({ estado }: { estado: string }) {
  const c = colorEstado(estado);
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: `${c}1a`, color: c }}
    >
      {etiquetaEstado(estado)}
    </span>
  );
}

function Pendiente({ texto = "pendiente" }: { texto?: string }) {
  return <span className="text-xs italic text-gray-400">{texto}</span>;
}

function Th({ children, procedencia, className = "" }: { children: React.ReactNode; procedencia: keyof typeof PROCEDENCIA; className?: string }) {
  return (
    <th
      className={`sticky top-0 z-10 border-b border-[#E2E8F0] bg-white px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 ${className}`}
      style={{ boxShadow: `inset 0 3px 0 ${PROCEDENCIA[procedencia].color}` }}
    >
      {children}
    </th>
  );
}

export function LeyendaProcedencia() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
      {Object.values(PROCEDENCIA).map((p) => (
        <span key={p.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
          {p.label}
        </span>
      ))}
    </div>
  );
}

export function KpisBandeja({ r }: { r: ResumenBandeja }) {
  const kpi = (label: string, valor: number, nota?: string, color?: string) => (
    <div key={label} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: color ?? "#111827" }}>
        {valor.toLocaleString("es-CO")}
      </p>
      {nota && <p className="mt-0.5 text-xs text-gray-500">{nota}</p>}
    </div>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {kpi("Expedientes", r.total, "desde el corte de gestión")}
      {kpi("Cobrables", r.cobrables, "según el umbral de su entidad", "#047857")}
      {kpi("No cobrables", r.noCobrables, "por debajo del umbral", "#64748B")}
      {kpi("Por completar", r.sinSalario, "sin salario diligenciado", r.sinSalario ? "#B45309" : undefined)}
      {kpi(
        "Con incidencia",
        r.pendientesHomologacion + r.sinPersona + r.cambiosPendientes,
        "homologación, persona o cambio en la matriz",
        r.pendientesHomologacion + r.sinPersona + r.cambiosPendientes ? "#DC2626" : undefined
      )}
    </div>
  );
}

export function BandejaTabla({ filas }: { filas: ExpedienteVista[] }) {
  if (filas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-white p-8 text-center text-sm text-gray-500">
        Ningún expediente con estos filtros. Las incapacidades anteriores al corte están en la{" "}
        <Link href="/ausentismo?tab=matriz" className="text-[#0F766E] underline">matriz EPS</Link>.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
      <table className="w-full min-w-[1080px] text-sm">
        <thead>
          <tr>
            <Th procedencia="recibido">Trabajador</Th>
            <Th procedencia="recibido">Incapacidad</Th>
            <Th procedencia="recibido" className="text-right">Días</Th>
            <Th procedencia="homologado">Entidad</Th>
            <Th procedencia="homologado">Cobrable</Th>
            <Th procedencia="completado" className="text-right">Salario</Th>
            <Th procedencia="calculado" className="text-right">Reclamado</Th>
            <Th procedencia="completado">Estado</Th>
            <Th procedencia="recibido">Recibido</Th>
          </tr>
        </thead>
        <tbody>
          {filas.map((e) => {
            const entidad = e.entidad_nombre ?? e.pagador_recibido;
            const reclamado = e.valor_reclamado_ajustado ?? e.valor_reclamado ?? e.valor_entidad;
            return (
              <tr key={e.id} className="border-b border-[#F1F5F9] align-top last:border-0 hover:bg-[#F8FAFC]">
                <td className="px-3 py-2">
                  <Link href={`/incapacidades/${e.id}`} className="font-medium text-gray-900 hover:underline">
                    {e.nombre ?? "Sin nombre"}
                  </Link>
                  <div className="text-xs tabular-nums text-gray-500">
                    {e.cedula}
                    {e.persona_fuente === "sin_resolver" && (
                      <span className="ml-2 inline-flex items-center gap-1 text-red-600" title="La cédula no está en el maestro de conductores ni en empleados">
                        <UserX className="h-3 w-3" /> sin resolver
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="tabular-nums text-gray-900">
                    {fechaCorta(e.fecha_inicio)} → {fechaCorta(e.fecha_fin)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {e.origen ?? "—"} · {e.indicador_prorroga ?? "—"}
                    {e.consecutivo_incapacidad ? ` · ${e.consecutivo_incapacidad}` : ""}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900">{e.dias_incapacidad ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="text-gray-900">{entidad ?? <Pendiente texto="sin pagador" />}</div>
                  {e.pendiente_homologacion ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> pendiente de homologar
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {e.entidad_clase ?? "—"} · umbral {e.entidad_dias_min_cobro ?? "—"} d
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {e.cobrable ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Sí</span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">No</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {e.salario_base != null ? cop(e.salario_base) : <Pendiente />}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {reclamado != null ? (
                    <span className="inline-flex items-center gap-1">
                      {cop(reclamado)}
                      {e.valor_reclamado_ajustado != null && (
                        <Pencil className="h-3 w-3 text-violet-600" aria-label="ajustado a mano" />
                      )}
                    </span>
                  ) : (
                    <Pendiente texto="sin liquidar" />
                  )}
                </td>
                <td className="px-3 py-2">
                  <ChipEstado estado={e.estado} />
                  {e.matriz_cambio_pendiente && (
                    <div className="mt-1 text-xs text-amber-700">la matriz cambió</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  <div className="tabular-nums">{fechaCorta(e.recibido_at)}</div>
                  <div>{RECIBIDO_DESDE_LABEL[e.recibido_desde] ?? e.recibido_desde}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
