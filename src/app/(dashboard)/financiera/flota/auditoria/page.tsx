import { canAccess, canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { listarPeriodos, ultimasCargas, type CargaFila } from "@/lib/financiera/consolidacion";
import { listarVersiones } from "@/lib/financiera/consulta";
import { COBERTURA, ESTADO_PERIODO, TIPO_CARGA, cop, entero, fechaCorta, fechaHora, nombrePeriodo } from "@/lib/financiera/formato";
import { PageHeader } from "@/components/layout/page-header";
import { Landmark } from "lucide-react";
import { Fallo, SinAcceso } from "../../sin-acceso";
import { pestanasPermitidas } from "../marco";
import { Pestanas } from "../filtros";

export const dynamic = "force-dynamic";

/**
 * Auditoría de Gestión de flota: la bitácora completa de `financiera_cargas`
 * (consolidaciones, cierres, reaperturas, cargas y cambios de parámetro) y
 * las versiones guardadas antes de reabrir un período. Sub-función sensible:
 * expone quién tocó qué y los totales de cada mes.
 */
export default async function AuditoriaPage() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) return <SinAcceso />;
  if (!canAccessSub(perms, "financiera", "fin_auditoria")) {
    return (
      <SinAcceso
        titulo="Auditoría de Gestión de flota"
        motivo="La bitácora muestra quién cargó o cambió qué y los totales de cada período, así que se concede una por una. Pídela a Administración."
      />
    );
  }

  let cargas: CargaFila[] = [];
  let versiones: Awaited<ReturnType<typeof listarVersiones>> = [];
  let periodos: Awaited<ReturnType<typeof listarPeriodos>> = [];
  let fallo: string | null = null;
  try {
    [cargas, versiones, periodos] = await Promise.all([ultimasCargas(300), listarVersiones(50), listarPeriodos()]);
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }

  const reaperturas = cargas.filter((c) => c.tipo === "reabrir_periodo").length;
  const cargasContables = cargas.filter((c) => c.tipo === "cargar_contable").length;
  const reversiones = cargas.filter((c) => c.tipo === "reversar_contable").length;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Auditoría de Gestión de flota"
        icono={Landmark}
        descripcion="Toda operación del módulo deja rastro: consolidaciones, cierres, reaperturas, cargas, reversiones y cambios de umbral."
        pie={
          <div className="mt-2">
            <Pestanas pestanas={pestanasPermitidas(perms)} />
          </div>
        }
      />
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
        {fallo && <Fallo mensaje={fallo} />}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Caja titulo="Operaciones registradas" valor={entero(cargas.length)} pie="se muestran las últimas 300" />
          <Caja titulo="Cargas del archivo contable" valor={entero(cargasContables)} pie={`${entero(reversiones)} reversiones`} />
          <Caja titulo="Reaperturas de período" valor={entero(reaperturas)} pie={reaperturas ? "cada una con motivo y copia previa" : "ninguna"} tono={reaperturas ? "amber" : "neutro"} />
          <Caja
            titulo="Períodos cerrados"
            valor={entero(periodos.filter((p) => p.estado === "cerrado").length)}
            pie={`${entero(periodos.filter((p) => p.estado === "reabierto").length)} reabiertos · ${entero(periodos.filter((p) => p.estado === "abierto").length)} abiertos`}
          />
        </div>

        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#E2E8F0] px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Bitácora</h2>
            <p className="text-xs text-gray-500">Más recientes primero.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Cuándo</th>
                  <th className="whitespace-nowrap px-3 py-2">Operación</th>
                  <th className="whitespace-nowrap px-3 py-2">Período</th>
                  <th className="whitespace-nowrap px-3 py-2">Quién</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Filas</th>
                  <th className="px-3 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {cargas.length === 0 && !fallo && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">Sin operaciones registradas.</td>
                  </tr>
                )}
                {cargas.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F8FAFC]">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500">{fechaHora(c.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">{TIPO_CARGA[c.tipo] ?? c.tipo}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-600">{c.periodo ?? "—"}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-gray-600" title={c.usuarioEmail ?? "sistema"}>{c.usuarioEmail ?? "sistema"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{c.filas ? entero(c.filas) : "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{detalle(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#E2E8F0] px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Versiones guardadas antes de reabrir</h2>
            <p className="text-xs text-gray-500">
              Al reabrir un período se conserva una copia de sus cifras, para comparar lo que se reportó con lo que quedó.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Período</th>
                  <th className="whitespace-nowrap px-3 py-2">Tomada</th>
                  <th className="whitespace-nowrap px-3 py-2">Quién</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Vehículos</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Ingresos</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right">Utilidad</th>
                  <th className="px-3 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {versiones.length === 0 && !fallo && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">Ningún período se ha reabierto.</td>
                  </tr>
                )}
                {versiones.map((v) => (
                  <tr key={v.id} className="hover:bg-[#F8FAFC]">
                    <td className="whitespace-nowrap px-3 py-2 font-medium capitalize text-gray-900">{nombrePeriodo(v.periodo)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500">{fechaHora(v.tomadaAt)}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-gray-600">{v.tomadaPorEmail ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {v.vehiculos != null ? entero(v.vehiculos) : "—"}
                      {v.vehiculosConContable != null && v.vehiculos != null && (
                        <span className="ml-1 text-xs text-gray-400">({entero(v.vehiculosConContable)} con archivo)</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{v.ingresos != null ? cop(v.ingresos) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{v.utilidadNeta != null ? cop(v.utilidadNeta) : "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{v.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#E2E8F0] px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Estado de los períodos</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2">Período</th>
                  <th className="whitespace-nowrap px-3 py-2">Estado</th>
                  <th className="whitespace-nowrap px-3 py-2">Consolidado</th>
                  <th className="whitespace-nowrap px-3 py-2">Cierre</th>
                  <th className="whitespace-nowrap px-3 py-2">Archivo contable</th>
                  <th className="px-3 py-2">Motivo de reapertura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {periodos.map((p) => {
                  const est = ESTADO_PERIODO[p.estado];
                  const cob = p.coberturaContable ? COBERTURA[p.coberturaContable] : null;
                  return (
                    <tr key={p.periodo} className="hover:bg-[#F8FAFC]">
                      <td className="whitespace-nowrap px-3 py-2 font-medium capitalize text-gray-900">{nombrePeriodo(p.periodo)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${est.clase}`}>{est.etiqueta}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{fechaHora(p.consolidadoAt)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                        {p.cerradoAt ? `${fechaHora(p.cerradoAt)}${p.cerradoPor ? ` · ${p.cerradoPor}` : ""}` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {cob ? <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cob.clase}`}>{cob.etiqueta}</span> : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {p.motivoReapertura ? `${p.motivoReapertura} (${p.reabiertoPorEmail ?? "—"}, ${fechaCorta(p.reabiertoAt)})` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function detalle(c: CargaFila): string {
  const d = c.detalle;
  const n = (k: string) => (d[k] != null ? entero(Number(d[k])) : null);
  switch (c.tipo) {
    case "consolidar_gema": {
      const partes: string[] = [];
      if (d.vehiculos != null) partes.push(`${n("vehiculos")} vehículos`);
      if (d.ingresos != null) partes.push(`ingresos ${cop(Number(d.ingresos))}`);
      if (Number(d.borradas) > 0) partes.push(`${n("borradas")} filas retiradas`);
      if (d.forzado === true) partes.push("forzado");
      if (d.estado_previo) partes.push(`estado previo ${String(d.estado_previo)}`);
      return partes.join(" · ");
    }
    case "cerrar_periodo":
      return d.marca_gema ? `marcador de GEMA ${fechaCorta(String(d.marca_gema))}` : "";
    case "reabrir_periodo":
      return d.motivo ? `motivo: ${String(d.motivo)}` : "";
    case "cargar_contable": {
      const partes: string[] = [];
      if (c.archivoNombre) partes.push(c.archivoNombre);
      if (d.rechazadas != null) partes.push(`${n("rechazadas")} rechazadas`);
      if (d.celdas_vacias != null) partes.push(`${n("celdas_vacias")} celdas vacías`);
      const pp = Array.isArray(d.por_periodo) ? (d.por_periodo as Record<string, unknown>[]) : [];
      const reemplazadas = pp.reduce((s, x) => s + Number(x.reemplazadas ?? 0), 0);
      if (reemplazadas > 0) partes.push(`${entero(reemplazadas)} reemplazadas`);
      const utilidadDespues = pp.reduce((s, x) => s + Number(x.utilidad_despues ?? 0), 0);
      if (pp.length) partes.push(`utilidad tras la carga ${cop(utilidadDespues)}`);
      return partes.join(" · ");
    }
    case "reversar_contable":
      return d.gastos_contables_retirados != null ? `se retiraron ${cop(Number(d.gastos_contables_retirados))} de gastos contables` : "";
    case "cambiar_parametro": {
      const a = d.antes as { excelente?: number; aceptable?: number } | undefined;
      const b = d.despues as { excelente?: number; aceptable?: number } | undefined;
      if (!a || !b) return String(d.indicador ?? "");
      return `${String(d.indicador)}: excelente ${a.excelente} → ${b.excelente}, aceptable ${a.aceptable} → ${b.aceptable}`;
    }
    default:
      return "";
  }
}

function Caja({ titulo, valor, pie, tono = "neutro" }: { titulo: string; valor: string; pie?: string; tono?: "neutro" | "amber" }) {
  return (
    <div className={`rounded-xl border p-4 ${tono === "amber" ? "border-amber-200 bg-amber-50" : "border-[#E2E8F0] bg-white"}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{valor}</p>
      {pie && <p className="mt-0.5 truncate text-xs text-gray-500">{pie}</p>}
    </div>
  );
}
