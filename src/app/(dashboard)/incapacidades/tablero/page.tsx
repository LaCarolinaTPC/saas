import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarConsultaBandeja } from "@/lib/incapacidades/auditoria";
import { leerCorte, listarExpedientes, type ExpedienteVista } from "@/lib/incapacidades/expedientes";
import { ESTADOS_EXPEDIENTE, cop, fechaCorta } from "@/lib/incapacidades/formato";
import { agregarTablero, porcentaje } from "@/lib/incapacidades/tablero-reglas";
import type { DatosExport } from "@/lib/incapacidades/exportar";
import { hoyArchivo } from "@/lib/incapacidades/exportar";
import { ExportarBoton } from "../exportar-boton";
import { Fallo, SinAcceso } from "../sin-acceso";

export const dynamic = "force-dynamic";

/**
 * Tablero desde el corte (plan, pantalla 8): por entidad y estado, cuánto se
 * reclamó, cuánto está radicado, cuánto se recaudó y cuánto falta. Sin
 * comparación con periodos anteriores al corte: no existen en el módulo.
 */
export default async function TableroPage() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) return <SinAcceso titulo="Tablero de incapacidades" />;

  let filas: ExpedienteVista[] = [];
  let corte: string | null = null;
  let fallo: string | null = null;
  try {
    [filas, corte] = await Promise.all([listarExpedientes(), leerCorte()]);
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }
  if (!fallo) await auditarConsultaBandeja({ filtros: { bandeja: "tablero" }, filas: filas.length, rol: perms.userType, userEmail: perms.userEmail });

  const { total, porEntidad } = agregarTablero(filas);
  const kpi = (label: string, valor: string, nota?: string, color?: string) => (
    <div key={label} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: color ?? "#111827" }}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-gray-500">{nota}</p>}
    </div>
  );

  const exportacion: DatosExport = {
    archivo: `incapacidades_tablero_${hoyArchivo()}`,
    titulo: "Tablero de recuperación de incapacidades",
    contexto: [`Gestión desde el ${corte ? fechaCorta(corte) : "—"} por fecha de inicio · ${total.expedientes} expediente(s) · generado ${hoyArchivo()}`],
    columnas: [
      { titulo: "Entidad", ancho: 60 }, { titulo: "Clase", ancho: 14, alinear: "center" }, { titulo: "Expedientes", ancho: 20, alinear: "right" },
      { titulo: "Cobrables", ancho: 18, alinear: "right" }, { titulo: "Días", ancho: 14, alinear: "right" }, { titulo: "Días a cargo", ancho: 18, alinear: "right" },
      { titulo: "Reclamado", ancho: 26, alinear: "right" }, { titulo: "Radicado", ancho: 26, alinear: "right" }, { titulo: "Recaudado", ancho: 26, alinear: "right" },
      { titulo: "Ajustes", ancho: 22, alinear: "right" }, { titulo: "Saldo en cobro", ancho: 26, alinear: "right" },
    ],
    filas: [
      ...porEntidad.map((g) => [g.entidad, g.clase ?? "", g.expedientes, g.cobrables, g.dias, g.diasEntidad, Math.round(g.reclamado), Math.round(g.radicado), Math.round(g.recaudado), Math.round(g.ajustes), Math.round(g.saldo)]),
      ["TOTAL", "", total.expedientes, total.cobrables, total.dias, total.diasEntidad, Math.round(total.reclamado), Math.round(total.radicado), Math.round(total.recaudado), Math.round(total.ajustes), Math.round(total.saldo)],
    ],
    resumen: [`${total.expedientes} expedientes`, `reclamado ${cop(total.reclamado)}`, `radicado ${cop(total.radicado)}`, `recaudado ${cop(total.recaudado)}`, `saldo en cobro ${cop(total.saldo)}`],
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Tablero de incapacidades"
        icono={LayoutDashboard}
        volver={{ href: "/incapacidades", label: "Recuperación de incapacidades" }}
        descripcion={`Desde el ${corte ? fechaCorta(corte) : "corte"}, por entidad y estado. Sin comparación con periodos anteriores: no están en el módulo.`}
      >
        <ExportarBoton datos={exportacion} pantalla="tablero" />
      </PageHeader>
      <div className="space-y-4 p-6">
        {fallo && <Fallo mensaje={fallo} />}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {kpi("Expedientes", total.expedientes.toLocaleString("es-CO"), `${total.cobrables} cobrables · ${total.noCobrables} bajo umbral`)}
          {kpi("Reclamado", cop(total.reclamado), "liquidados en adelante")}
          {kpi("Radicado", cop(total.radicado), `${porcentaje(total.radicado, total.reclamado)} % de lo reclamado · sin radicar ${cop(total.sinRadicar)}`, "#0891B2")}
          {kpi("Recaudado", cop(total.recaudado), `${porcentaje(total.recaudado, total.radicado)} % de lo radicado`, "#059669")}
          {kpi("Saldo en cobro", cop(total.saldo), "radicados sin cerrar", total.saldo > 0 ? "#B45309" : "#059669")}
        </div>

        {/* Embudo */}
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Del reclamo al recaudo</h3>
          <div className="mt-3 space-y-2">
            {[
              ["Reclamado", total.reclamado, "#6D28D9"],
              ["Radicado", total.radicado, "#0891B2"],
              ["Recaudado", total.recaudado, "#059669"],
              ["Ajustes que extinguen", total.ajustes, "#B45309"],
            ].map(([l, v, c]) => (
              <div key={String(l)} className="grid grid-cols-[160px_1fr_120px] items-center gap-3 text-sm">
                <span className="text-gray-600">{l}</span>
                <div className="h-4 overflow-hidden rounded bg-[#F1F5F9]">
                  <div className="h-full rounded" style={{ width: `${porcentaje(Number(v), total.reclamado)}%`, background: String(c) }} />
                </div>
                <span className="text-right tabular-nums text-gray-900">{cop(Number(v))}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Por estado */}
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Expedientes por estado</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {ESTADOS_EXPEDIENTE.map((e) => (
              <Link key={e.key} href={`/incapacidades?estado=${e.key}`} className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm hover:bg-[#F8FAFC]">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
                {e.label}
                <span className="tabular-nums font-semibold text-gray-900">{total.porEstado[e.key] ?? 0}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Por entidad */}
        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2">Entidad</th>
                <th className="px-3 py-2 text-right">Expedientes</th>
                <th className="px-3 py-2 text-right">Cobrables</th>
                <th className="px-3 py-2 text-right">Días a cargo</th>
                <th className="px-3 py-2 text-right">Reclamado</th>
                <th className="px-3 py-2 text-right">Radicado</th>
                <th className="px-3 py-2 text-right">Recaudado</th>
                <th className="px-3 py-2 text-right">Ajustes</th>
                <th className="px-3 py-2 text-right">Saldo en cobro</th>
                <th className="px-3 py-2">Avance</th>
              </tr>
            </thead>
            <tbody>
              {porEntidad.map((g) => (
                <tr key={g.entidadId ?? g.entidad} className="border-t border-[#F1F5F9] hover:bg-[#F8FAFC]">
                  <td className="px-4 py-2">
                    <Link href={g.entidadId ? `/incapacidades?entidad=${g.entidadId}` : "/incapacidades?solo=pendientes"} className="font-medium text-gray-900 hover:underline">{g.entidad}</Link>
                    <div className="text-xs text-gray-500">{g.clase ?? (g.entidadId ? "" : "sin homologar")}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.expedientes}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.cobrables}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.diasEntidad}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{cop(g.reclamado)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{cop(g.radicado)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{cop(g.recaudado)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{cop(g.ajustes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: g.saldo > 0 ? "#B45309" : "#059669" }}>{cop(g.saldo)}</td>
                  <td className="px-3 py-2">
                    <div className="flex h-3 w-40 overflow-hidden rounded bg-[#F1F5F9]" title={`radicado ${porcentaje(g.radicado, g.reclamado)} % · recaudado ${porcentaje(g.recaudado, g.reclamado)} %`}>
                      <div className="h-full" style={{ width: `${porcentaje(g.recaudado, g.reclamado)}%`, background: "#059669" }} />
                      <div className="h-full" style={{ width: `${Math.max(0, porcentaje(g.radicado, g.reclamado) - porcentaje(g.recaudado, g.reclamado))}%`, background: "#0891B2" }} />
                    </div>
                  </td>
                </tr>
              ))}
              {porEntidad.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-sm text-gray-500">Sin expedientes desde el corte.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">Barra de avance: verde recaudado, azul radicado pendiente de recaudo, gris liquidado sin radicar. Todo sobre lo reclamado a cada entidad.</p>
      </div>
    </div>
  );
}
