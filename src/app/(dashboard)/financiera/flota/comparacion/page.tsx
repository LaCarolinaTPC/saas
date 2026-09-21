import { canAccess, canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { cargarPantalla, type SearchParams } from "@/lib/financiera/pantalla";
import { aplicarFiltros, porMes, resumenFlota, valoresVista, vistaPrincipal } from "@/lib/financiera/analisis";
import { cop, decimal, entero, nombrePeriodo, porcentaje, rotuloRango } from "@/lib/financiera/formato";
import { BarrasMes } from "@/components/graficos/graficos-financiera";
import { Fallo, SinAcceso } from "../../sin-acceso";
import { MarcoFlota } from "../marco";
import { AvisoCobertura, AvisoVacio, NotaVista, Pesos } from "../ui";

export const dynamic = "force-dynamic";

/** Variación entre dos valores; null cuando la base es cero. */
function variacion(antes: number, despues: number): number | null {
  if (antes === 0) return null;
  return ((despues - antes) / Math.abs(antes)) * 100;
}

function Delta({ valor, invertido = false }: { valor: number | null; invertido?: boolean }) {
  if (valor == null) return <span className="text-gray-400">—</span>;
  const bueno = invertido ? valor < 0 : valor > 0;
  const color = Math.abs(valor) < 0.05 ? "text-gray-500" : bueno ? "text-emerald-700" : "text-red-600";
  return (
    <span className={`tabular-nums ${color}`}>
      {valor > 0 ? "+" : ""}
      {decimal(valor)} %
    </span>
  );
}

/**
 * Comparación de períodos: mes contra mes dentro del rango y el mismo rango
 * contra el año anterior. Reemplaza las 1.427 líneas de
 * ComparacionPeriodosTab del aplicativo, reescrito sobre el motor.
 */
export default async function ComparacionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) return <SinAcceso />;
  if (!canAccessSub(perms, "financiera", "fin_analisis")) {
    return <SinAcceso titulo="Comparación de períodos" motivo="Tu tipo de usuario no tiene las pantallas de análisis de Gestión de flota." />;
  }

  const sp = await searchParams;
  let p: Awaited<ReturnType<typeof cargarPantalla>> | null = null;
  let fallo: string | null = null;
  try {
    p = await cargarPantalla(sp, { anioAnterior: true });
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }
  if (!p) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-6">
        <Fallo mensaje={fallo ?? "No se pudo leer el módulo."} />
      </div>
    );
  }

  const principal = vistaPrincipal(p.filtros.vista);
  const meses = porMes(p.filas);

  // Mismo rango del año anterior, con los mismos filtros de flota/dueño/vehículo.
  const filtrosAnterior = { ...p.filtros, anio: p.filtros.anio - 1 };
  const filasAnterior = aplicarFiltros(p.anterior, filtrosAnterior, p.owners);
  const resumenAnterior = resumenFlota(filasAnterior);
  const actual = valoresVista(p.resumen, principal);
  const previo = valoresVista(resumenAnterior, principal);
  const hayAnterior = filasAnterior.length > 0;

  const comparables: { etiqueta: string; antes: number; despues: number; formato: "cop" | "pct" | "num"; invertido?: boolean }[] = [
    { etiqueta: "Ingresos", antes: resumenAnterior.ingresos, despues: p.resumen.ingresos, formato: "cop" },
    { etiqueta: "Gastos operativos", antes: previo.gastos, despues: actual.gastos, formato: "cop", invertido: true },
    { etiqueta: "Utilidad", antes: previo.utilidad, despues: actual.utilidad, formato: "cop" },
    { etiqueta: "Rentabilidad", antes: previo.rentabilidad, despues: actual.rentabilidad, formato: "pct" },
    { etiqueta: "Gasto por timbrada", antes: previo.gastosPorTimbrada, despues: actual.gastosPorTimbrada, formato: "cop", invertido: true },
    { etiqueta: "Viajes por vehículo-mes", antes: resumenAnterior.productividad, despues: p.resumen.productividad, formato: "num" },
    { etiqueta: "Timbradas", antes: resumenAnterior.timbradas, despues: p.resumen.timbradas, formato: "num" },
    { etiqueta: "Vehículos con movimiento", antes: resumenAnterior.vehiculosDistintos, despues: p.resumen.vehiculosDistintos, formato: "num" },
  ];
  const fmt = (v: number, f: "cop" | "pct" | "num") => (f === "cop" ? cop(v) : f === "pct" ? porcentaje(v) : decimal(v));

  return (
    <MarcoFlota
      perms={perms}
      titulo="Comparación de períodos"
      descripcion={`${rotuloRango(p.filtros.anio, p.filtros.mes)} frente a ${p.filtros.anio - 1} y mes a mes`}
      anios={p.anios}
      opciones={p.opciones}
      conVista
    >
      <AvisoCobertura cobertura={p.resumen.cobertura} vehiculoMes={p.resumen.vehiculoMes} />

      {p.filas.length === 0 ? (
        <AvisoVacio mensaje="No hay datos consolidados para el rango elegido." />
      ) : (
        <>
          <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
            <div className="border-b border-[#E2E8F0] px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                {rotuloRango(p.filtros.anio, p.filtros.mes)} frente al mismo rango de {p.filtros.anio - 1}
              </h2>
              <p className="text-xs text-gray-500">
                {hayAnterior
                  ? `${entero(resumenAnterior.vehiculoMes)} vehículo-mes en ${p.filtros.anio - 1} frente a ${entero(p.resumen.vehiculoMes)} en ${p.filtros.anio}.`
                  : `No hay datos consolidados de ${p.filtros.anio - 1} para comparar.`}
              </p>
            </div>
            {hayAnterior && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2">Medida</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">{p.filtros.anio - 1}</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">{p.filtros.anio}</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Diferencia</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Variación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {comparables.map((c) => (
                      <tr key={c.etiqueta} className="hover:bg-[#F8FAFC]">
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">{c.etiqueta}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-500">{fmt(c.antes, c.formato)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900">{fmt(c.despues, c.formato)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {c.formato === "cop" ? <Pesos valor={c.despues - c.antes} /> : <span className="tabular-nums">{fmt(c.despues - c.antes, c.formato)}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <Delta valor={variacion(c.antes, c.despues)} invertido={c.invertido} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-[#F1F5F9] px-3 py-2 text-xs text-gray-500">
                  En verde lo que mejora: más ingresos, utilidad, productividad o timbradas; menos gasto. Si a alguno de los dos
                  rangos le falta el archivo contable, las cifras de gasto y utilidad no son comparables entre sí.
                </p>
              </div>
            )}
          </section>
          <NotaVista vista={p.filtros.vista} />

          <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Ingresos por mes</h2>
            <p className="mb-2 text-xs text-gray-500">En millones de pesos, dentro del rango elegido.</p>
            <BarrasMes
              titulo="Ingresos"
              datos={meses.map((m) => ({
                periodo: m.periodo,
                    nombre: nombrePeriodo(m.periodo),
                valor: m.resumen.ingresos,
                detalle: `${entero(m.resumen.vehiculoMes)} vehículos · ${entero(m.resumen.timbradas)} timbradas`,
              }))}
            />
          </section>

          <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
            <div className="border-b border-[#E2E8F0] px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Mes a mes</h2>
              <p className="text-xs text-gray-500">Cada mes frente al anterior dentro del rango. El acumulado al corte no aplica aquí: son meses sueltos.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2">Mes</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Vehículos</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Viajes / bus</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Ingresos</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Δ ingresos</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Gastos</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Utilidad</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Δ utilidad</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Rentabilidad</th>
                    <th className="whitespace-nowrap px-3 py-2">Contable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {meses.map((m, i) => {
                    const v = valoresVista(m.resumen, principal);
                    const prev = i > 0 ? valoresVista(meses[i - 1].resumen, principal) : null;
                    const techo = m.resumen.cobertura !== "completo";
                    return (
                      <tr key={m.periodo} className="hover:bg-[#F8FAFC]">
                        <td className="whitespace-nowrap px-3 py-2 font-medium capitalize text-gray-900">{nombrePeriodo(m.periodo)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{entero(m.resumen.vehiculoMes)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{decimal(m.resumen.productividad)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(m.resumen.ingresos)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <Delta valor={i > 0 ? variacion(meses[i - 1].resumen.ingresos, m.resumen.ingresos) : null} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(v.gastos)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right"><Pesos valor={v.utilidad} techo={techo} /></td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <Delta valor={prev ? variacion(prev.utilidad, v.utilidad) : null} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <span className={`tabular-nums ${techo ? "text-gray-400" : v.rentabilidad < 0 ? "text-red-600" : ""}`}>
                            {techo ? "≤ " : ""}
                            {porcentaje(v.rentabilidad)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">
                          {m.resumen.cobertura === "completo" ? "completo" : m.resumen.cobertura === "parcial" ? `${entero(m.resumen.conContable)}/${entero(m.resumen.vehiculoMes)}` : "sin archivo"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </MarcoFlota>
  );
}
