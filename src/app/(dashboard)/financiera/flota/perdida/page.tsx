import Link from "next/link";
import { canAccess, canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { cargarPantalla, type SearchParams } from "@/lib/financiera/pantalla";
import { valoresVista, vistaPrincipal } from "@/lib/financiera/analisis";
import { cop, decimal, entero, rotuloRango } from "@/lib/financiera/formato";
import { BarrasVehiculo } from "@/components/graficos/graficos-financiera";
import { Fallo, SinAcceso } from "../../sin-acceso";
import { MarcoFlota } from "../marco";
import { ExportarFlota } from "../exportar-flota";
import { informeVehiculos } from "@/lib/financiera/exportar";
import { AvisoCobertura, AvisoSalvedades, AvisoVacio, NotaVista, Pct, Pesos, Tarjeta } from "../ui";

export const dynamic = "force-dynamic";

/**
 * Vehículos en pérdida: los que en el rango gastaron más de lo que
 * produjeron. Solo se puede afirmar de los que tienen el archivo contable
 * completo; los demás se listan aparte, porque su utilidad es un techo y
 * podrían estar en pérdida sin que se vea.
 */
export default async function PerdidaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) return <SinAcceso />;
  if (!canAccessSub(perms, "financiera", "fin_analisis")) {
    return <SinAcceso titulo="Vehículos en pérdida" motivo="Tu tipo de usuario no tiene las pantallas de análisis de Gestión de flota." />;
  }

  const sp = await searchParams;
  let p: Awaited<ReturnType<typeof cargarPantalla>> | null = null;
  let fallo: string | null = null;
  try {
    p = await cargarPantalla(sp);
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
  const conContable = p.vehiculos.filter((v) => v.tieneContable);
  const sinContable = p.vehiculos.filter((v) => !v.tieneContable);
  const enPerdida = conContable
    .filter((v) => valoresVista(v.indicadores, principal).utilidad < 0)
    .sort((a, b) => valoresVista(a.indicadores, principal).utilidad - valoresVista(b.indicadores, principal).utilidad);
  // Un vehículo puede cerrar el rango en positivo y aun así tener meses malos.
  const conMesesMalos = conContable
    .filter((v) => (principal === "financiero" ? v.mesesEnPerdida : v.mesesEnPerdidaOperativa) > 0 && !enPerdida.includes(v))
    .sort((a, b) => (principal === "financiero" ? b.mesesEnPerdida - a.mesesEnPerdida : b.mesesEnPerdidaOperativa - a.mesesEnPerdidaOperativa));
  const perdidaTotal = enPerdida.reduce((s, v) => s + valoresVista(v.indicadores, principal).utilidad, 0);
  const techoSinContable = sinContable.reduce((s, v) => s + valoresVista(v.indicadores, principal).utilidad, 0);

  return (
    <MarcoFlota
      perms={perms}
      titulo="Vehículos en pérdida"
      descripcion={`${rotuloRango(p.filtros.anio, p.filtros.mes)} · ${entero(enPerdida.length)} de ${entero(conContable.length)} vehículos con archivo completo`}
      anios={p.anios}
      opciones={p.opciones}
      acciones={
        <ExportarFlota
          informe={informeVehiculos({
            salvedades: p.salvedades,
            titulo: "Vehículos en pérdida",
            archivo: `financiera-perdida-${p.filtros.anio}${p.filtros.mes ? `-${String(p.filtros.mes).padStart(2, "0")}` : ""}`,
            filtros: p.filtros,
            resumen: p.resumen,
            vehiculos: enPerdida,
            parametros: p.parametros,
            indicador: "rentabilidad",
            notasExtra: [
              `Solo los ${enPerdida.length} vehículos que cerraron el rango en pérdida, de ${conContable.length} con archivo contable completo. Los ${sinContable.length} sin archivo no se pueden clasificar y no están en esta lista.`,
            ],
          })}
        />
      }
      conVista
    >
      <AvisoCobertura cobertura={p.resumen.cobertura} vehiculoMes={p.resumen.vehiculoMes} />
      <AvisoSalvedades salvedades={p.salvedades} />

      {p.filas.length === 0 ? (
        <AvisoVacio mensaje="No hay datos consolidados para el rango elegido." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta
              titulo="Vehículos en pérdida"
              valor={entero(enPerdida.length)}
              pie={`de ${entero(conContable.length)} con archivo contable completo`}
              tono={enPerdida.length > 0 ? "amber" : "ok"}
            />
            <Tarjeta titulo="Pérdida acumulada" valor={cop(perdidaTotal)} pie="suma de las utilidades negativas" />
            <Tarjeta
              titulo="Con algún mes en pérdida"
              valor={entero(conMesesMalos.length)}
              pie="cierran el rango en positivo pero tuvieron meses malos"
            />
            <Tarjeta
              titulo="Sin archivo contable"
              valor={entero(sinContable.length)}
              pie="no se puede saber si están en pérdida"
              tono={sinContable.length > 0 ? "amber" : "neutro"}
            />
          </div>
          <NotaVista vista={p.filtros.vista} />

          {enPerdida.length > 0 && (
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Los que más pierden</h2>
              <p className="mb-2 text-xs text-gray-500">Utilidad del rango, en millones de pesos.</p>
              <BarrasVehiculo
                titulo="Utilidad"
                datos={enPerdida.slice(0, 15).map((v) => ({
                  codigo: v.codigoVehiculo,
                  etiqueta: `${v.codigoVehiculo}${v.placa ? ` · ${v.placa}` : ""}`,
                  valor: valoresVista(v.indicadores, principal).utilidad,
                  detalle: `${v.propietarioNombre} · ${v.meses} ${v.meses === 1 ? "mes" : "meses"}`,
                }))}
              />
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
            <div className="border-b border-[#E2E8F0] px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Detalle de los vehículos en pérdida</h2>
              <p className="text-xs text-gray-500">Ordenados por la pérdida más grande. Solo los que tienen el archivo contable de todos sus meses en el rango.</p>
            </div>
            {enPerdida.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                {conContable.length === 0
                  ? "Ningún vehículo del rango tiene el archivo contable completo, así que no se puede saber cuáles están en pérdida."
                  : "Ningún vehículo con archivo contable completo cerró el rango en pérdida."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2">Vehículo</th>
                      <th className="whitespace-nowrap px-3 py-2">Propietario</th>
                      <th className="whitespace-nowrap px-3 py-2">Flota</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Meses</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Meses en pérdida</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Ingresos</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Gastos</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Utilidad</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Rentabilidad</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Mantenimiento</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Viajes / mes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {enPerdida.map((v) => {
                      const val = valoresVista(v.indicadores, principal);
                      const mantenimiento = v.repuestos - v.descFondoConductor + v.manoDeObra;
                      return (
                        <tr key={v.codigoVehiculo} className="hover:bg-[#F8FAFC]">
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                            {v.codigoVehiculo}
                            {v.placa && <span className="ml-1.5 font-mono text-xs text-gray-400">{v.placa}</span>}
                            {v.mesesSoloContable > 0 && <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] text-amber-800" title={`${v.mesesSoloContable} mes(es) con costo contable y sin operación en GEMA`}>solo contable</span>}
                            {v.vehiculoActivo === false && <span className="ml-1.5 rounded bg-gray-100 px-1 text-[10px] text-gray-500">retirado</span>}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-2 text-gray-700" title={v.propietarioNombre}>{v.propietarioNombre}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-gray-600">{v.tipoPropietario}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{v.meses}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            {principal === "financiero" ? v.mesesEnPerdida : v.mesesEnPerdidaOperativa}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(v.ingresos)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(val.gastos)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right"><Pesos valor={val.utilidad} /></td>
                          <td className="whitespace-nowrap px-3 py-2 text-right"><Pct valor={val.rentabilidad} /></td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" title="Repuestos netos + mano de obra">
                            {cop(mantenimiento)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{decimal(v.productividad)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="border-t border-[#F1F5F9] px-3 py-2 text-xs text-gray-500">
                  Pérdida acumulada {cop(perdidaTotal)} sobre {cop(enPerdida.reduce((s, v) => s + v.ingresos, 0))} de ingresos.{" "}
                  <Link href="/financiera/flota/mantenimiento" className="underline">
                    Ver el detalle de mantenimiento
                  </Link>
                  .
                </p>
              </div>
            )}
          </section>

          {conMesesMalos.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
              <div className="border-b border-[#E2E8F0] px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">Cierran en positivo pero tuvieron meses en pérdida</h2>
                <p className="text-xs text-gray-500">El acumulado los salva; conviene mirarlos antes de que el patrón se repita.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2">Vehículo</th>
                      <th className="whitespace-nowrap px-3 py-2">Propietario</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Meses en pérdida</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">de</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Utilidad del rango</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Rentabilidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {conMesesMalos.slice(0, 30).map((v) => {
                      const val = valoresVista(v.indicadores, principal);
                      return (
                        <tr key={v.codigoVehiculo} className="hover:bg-[#F8FAFC]">
                          <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                            {v.codigoVehiculo}
                            {v.placa && <span className="ml-1.5 font-mono text-xs text-gray-400">{v.placa}</span>}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-2 text-gray-700">{v.propietarioNombre}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-amber-700">
                            {principal === "financiero" ? v.mesesEnPerdida : v.mesesEnPerdidaOperativa}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-500">{v.meses}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right"><Pesos valor={val.utilidad} /></td>
                          <td className="whitespace-nowrap px-3 py-2 text-right"><Pct valor={val.rentabilidad} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {sinContable.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
              <div className="border-b border-amber-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-amber-900">Sin archivo contable completo: no se sabe</h2>
                <p className="text-xs text-amber-800">
                  De estos {entero(sinContable.length)} vehículos solo se conocen los costos de GEMA. Su utilidad suma{" "}
                  {cop(techoSinContable)} como <strong>techo</strong>: al cargar los seis rubros que faltan puede bajar y alguno
                  puede terminar en pérdida.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50 text-left text-xs uppercase tracking-wide text-amber-800">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2">Vehículo</th>
                      <th className="whitespace-nowrap px-3 py-2">Propietario</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Meses</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Con archivo</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Ingresos</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right">Utilidad (techo)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {sinContable.slice(0, 30).map((v) => (
                      <tr key={v.codigoVehiculo}>
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                          {v.codigoVehiculo}
                          {v.placa && <span className="ml-1.5 font-mono text-xs text-gray-400">{v.placa}</span>}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-gray-700">{v.propietarioNombre}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{v.meses}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{v.mesesConContable}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(v.ingresos)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right"><Pesos valor={valoresVista(v.indicadores, principal).utilidad} techo /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sinContable.length > 30 && (
                  <p className="border-t border-amber-100 px-3 py-2 text-xs text-amber-800">
                    Se muestran 30 de {entero(sinContable.length)}.
                  </p>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </MarcoFlota>
  );
}
