import { DatabaseZap, Info } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import type { CargaFila, PeriodoFila } from "@/lib/financiera/consolidacion";
import {
  COBERTURA,
  ESTADO_PERIODO,
  TIPO_CARGA,
  cop,
  decimal,
  entero,
  fechaCorta,
  fechaHora,
  nombrePeriodo,
  porcentaje,
} from "@/lib/financiera/formato";
import { Fallo } from "../../sin-acceso";
import type { Pestana } from "../filtros";
import { Pestanas } from "../filtros";
import { ConsolidarBoton } from "./consolidar-boton";
import { CargaContable, type Previsualizacion } from "./carga-contable";
import { ReversarBoton } from "./reversar-boton";

export interface DatosVistaProps {
  periodos: PeriodoFila[];
  cargas: CargaFila[];
  marca: { fecha: string | null; corridoAt: string | null };
  fallo: string | null;
  /** Pestañas del módulo que el usuario puede ver. */
  pestanas?: Pestana[];
  /** Solo para la vista previa de diseño: estado inicial de la previsualización. */
  previsualizacionInicial?: Previsualizacion;
}

/**
 * Cuerpo de la pantalla Datos de flota, sin permisos ni lectura: la página lo
 * alimenta con datos reales y una vista previa puede alimentarlo con
 * fixtures. Estado de cada mes, consolidación a demanda y bitácora.
 */
export function DatosVista({ periodos, cargas, marca, fallo, pestanas, previsualizacionInicial }: DatosVistaProps) {
  const abiertos = periodos.filter((p) => p.estado !== "cerrado").map((p) => p.periodo);
  const sinContable = periodos.filter((p) => p.coberturaContable !== "completo").length;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Datos de flota"
        icono={DatabaseZap}
        descripcion="Consolidación mensual desde GEMA (ingreso de tercero), cierre de períodos y bitácora."
        pie={pestanas && pestanas.length > 0 ? <div className="mt-2"><Pestanas pestanas={pestanas} /></div> : undefined}
      >
        <ConsolidarBoton />
      </PageHeader>

      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
        {fallo && <Fallo mensaje={fallo} />}

        {/* Resumen */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tarjeta titulo="Marcador de GEMA" valor={fechaCorta(marca.fecha)} pie={`sync ${fechaHora(marca.corridoAt)}`} />
          <Tarjeta titulo="Meses consolidados" valor={entero(periodos.length)} pie={periodos.length ? `${periodos[periodos.length - 1].periodo} → ${periodos[0].periodo}` : "todavía ninguno"} />
          <Tarjeta titulo="Meses abiertos" valor={entero(abiertos.length)} pie={abiertos.length ? abiertos.join(", ") : "todos cerrados"} />
          <Tarjeta titulo="Sin archivo contable completo" valor={entero(sinContable)} pie="la utilidad de esos meses es un techo" tono={sinContable ? "amber" : "ok"} />
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Un mes se <strong>cierra solo</strong> cuando el marcador del sync de GEMA pasa su último día; desde ahí sus cifras no se
            mueven aunque el espejo cambie. La consolidación corre a diario al terminar el sync de GEMA (03:00) y aquí a demanda; nunca
            toca un mes cerrado. Reabrir es del administrador, con motivo, desde Parámetros.
          </p>
        </div>

        <CargaContable inicial={previsualizacionInicial} />

        {/* Períodos */}
        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#E2E8F0] px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Períodos</h2>
            <p className="text-xs text-gray-500">Totales de flota por mes desde GEMA. Los gastos y la utilidad solo están completos cuando el archivo contable del mes está cargado.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-2">Período</th>
                  <th className="whitespace-nowrap px-3 py-2">Estado</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Vehículos</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Viajes</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Timbradas</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Ingresos</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Gastos GEMA</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Viajes / bus</th>
                  <th className="whitespace-nowrap px-3 py-2">Archivo contable</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Rentabilidad</th>
                  <th className="whitespace-nowrap px-3 py-2">Consolidado</th>
                  <th className="whitespace-nowrap px-3 py-2">Cierre</th>
                  <th className="whitespace-nowrap px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {periodos.length === 0 && !fallo && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-sm text-gray-500">
                      Todavía no hay meses consolidados. Pulsa «Consolidar ahora» para traer el histórico del espejo (2025-01 en adelante).
                    </td>
                  </tr>
                )}
                {periodos.map((p) => {
                  const est = ESTADO_PERIODO[p.estado];
                  const cob = p.coberturaContable ? COBERTURA[p.coberturaContable] : null;
                  const completo = p.coberturaContable === "completo";
                  return (
                    <tr key={p.periodo} className="hover:bg-[#F8FAFC]">
                      <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">
                        <span className="capitalize">{nombrePeriodo(p.periodo)}</span>
                        <span className="ml-2 font-mono text-xs text-gray-400">{p.periodo}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span title={est.ayuda} className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${est.clase}`}>
                          {est.etiqueta}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{entero(p.vehiculos)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{entero(p.viajes)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{entero(p.timbradas)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(p.ingresos)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(p.gastosGema)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{decimal(p.productividad)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {cob ? (
                          <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${cob.clase}`}>
                            {cob.etiqueta}
                            {p.coberturaContable === "parcial" && p.vehiculos ? ` (${p.vehiculosConContable}/${p.vehiculos})` : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${completo ? (p.rentabilidad != null && p.rentabilidad < 0 ? "text-red-600" : "") : "text-gray-400"}`}
                        title={completo ? undefined : "Sin el archivo contable del mes la rentabilidad es un techo, no una cifra."}
                      >
                        {completo ? porcentaje(p.rentabilidad) : `≤ ${porcentaje(p.rentabilidad)}`}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{fechaHora(p.consolidadoAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                        {p.estado === "cerrado" && (
                          <span title={p.cerradoPor ?? undefined}>{fechaHora(p.cerradoAt)}</span>
                        )}
                        {p.estado === "reabierto" && (
                          <span title={p.motivoReapertura ?? undefined}>
                            reabierto {fechaHora(p.reabiertoAt)} · {p.reabiertoPorEmail ?? "—"}
                          </span>
                        )}
                        {p.estado === "abierto" && "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {p.coberturaContable && p.coberturaContable !== "sin_dato" && (
                          <ReversarBoton
                            periodo={p.periodo}
                            deshabilitado={p.estado === "cerrado"}
                            motivo="Mes cerrado: reversar cambia una cifra ya reportada. El administrador debe reabrirlo primero."
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Bitácora */}
        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#E2E8F0] px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Últimas operaciones</h2>
            <p className="text-xs text-gray-500">Consolidaciones, cierres, reaperturas y cargas. La bitácora completa está en Auditoría.</p>
          </div>
          <ul className="divide-y divide-[#F1F5F9]">
            {cargas.length === 0 && !fallo && <li className="px-4 py-6 text-center text-sm text-gray-500">Sin operaciones todavía.</li>}
            {cargas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-sm">
                <span className="w-32 shrink-0 font-mono text-xs text-gray-500">{fechaHora(c.createdAt)}</span>
                <span className="font-medium text-gray-900">{TIPO_CARGA[c.tipo] ?? c.tipo}</span>
                {c.periodo && <span className="font-mono text-xs text-gray-600">{c.periodo}</span>}
                <span className="text-xs text-gray-500">{resumenCarga(c)}</span>
                <span className="ml-auto text-xs text-gray-400">{c.usuarioEmail ?? "sistema"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function resumenCarga(c: CargaFila): string {
  const d = c.detalle as Record<string, unknown>;
  switch (c.tipo) {
    case "consolidar_gema": {
      const partes = [`${entero(c.filas)} filas`];
      if (d.vehiculos != null) partes.push(`${entero(Number(d.vehiculos))} vehículos`);
      if (d.ingresos != null) partes.push(`ingresos ${cop(Number(d.ingresos))}`);
      if (Number(d.borradas) > 0) partes.push(`${entero(Number(d.borradas))} retiradas`);
      if (d.forzado === true) partes.push("forzado");
      return partes.join(" · ");
    }
    case "cerrar_periodo":
      return d.marca_gema ? `marcador GEMA ${fechaCorta(String(d.marca_gema))}` : "";
    case "reabrir_periodo":
      return d.motivo ? `motivo: ${String(d.motivo)}` : "";
    case "cargar_contable":
    case "reversar_contable":
      return [c.archivoNombre, c.filas ? `${entero(c.filas)} filas` : null].filter(Boolean).join(" · ");
    case "cambiar_parametro":
      return d.indicador ? String(d.indicador) : "";
    default:
      return "";
  }
}

function Tarjeta({ titulo, valor, pie, tono = "neutro" }: { titulo: string; valor: string; pie?: string; tono?: "neutro" | "amber" | "ok" }) {
  const borde = tono === "amber" ? "border-amber-200 bg-amber-50" : tono === "ok" ? "border-emerald-200 bg-emerald-50" : "border-[#E2E8F0] bg-white";
  return (
    <div className={`rounded-xl border p-4 ${borde}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{valor}</p>
      {pie && <p className="mt-0.5 truncate text-xs text-gray-500" title={pie}>{pie}</p>}
    </div>
  );
}
