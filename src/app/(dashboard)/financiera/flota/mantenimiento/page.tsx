import Link from "next/link";
import { canAccess, canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { cargarPantalla, type SearchParams } from "@/lib/financiera/pantalla";
import { mantenimiento } from "@/lib/financiera/analisis";
import { cop, decimal, entero, rotuloRango } from "@/lib/financiera/formato";
import { BarrasMantenimiento } from "@/components/graficos/graficos-financiera";
import { Fallo, SinAcceso } from "../../sin-acceso";
import { MarcoFlota } from "../marco";
import { ExportarFlota } from "../exportar-flota";
import { informeMantenimiento } from "@/lib/financiera/exportar";
import { AvisoSalvedades, AvisoVacio, Tarjeta } from "../ui";

export const dynamic = "force-dynamic";

/**
 * Mantenimiento: repuestos contra mano de obra. Los dos rubros vienen del
 * archivo contable, así que un vehículo sin archivo no aparece: no es que
 * gaste cero, es que no hay dato. El descuento fondo-conductor se RESTA de
 * repuestos, nunca se suma como gasto.
 */
export default async function MantenimientoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) return <SinAcceso />;
  if (!canAccessSub(perms, "financiera", "fin_analisis")) {
    return <SinAcceso titulo="Mantenimiento" motivo="Tu tipo de usuario no tiene las pantallas de análisis de Gestión de flota." />;
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

  const conDato = p.vehiculos.filter((v) => v.mesesConContable > 0);
  const filas = mantenimiento(conDato);
  const sinDato = p.vehiculos.length - conDato.length;
  const totRepuestos = filas.reduce((s, f) => s + f.repuestosNetos, 0);
  const totManoDeObra = filas.reduce((s, f) => s + f.manoDeObra, 0);
  const total = totRepuestos + totManoDeObra;
  const ingresosConDato = conDato.reduce((s, v) => s + v.ingresos, 0);
  const timbradasConDato = conDato.reduce((s, v) => s + v.timbradas, 0);
  const descuento = conDato.reduce((s, v) => s + v.descFondoConductor, 0);

  return (
    <MarcoFlota
      perms={perms}
      titulo="Mantenimiento"
      descripcion={`${rotuloRango(p.filtros.anio, p.filtros.mes)} · repuestos y mano de obra de ${entero(conDato.length)} vehículos`}
      anios={p.anios}
      opciones={p.opciones}
      acciones={<ExportarFlota informe={informeMantenimiento({ filtros: p.filtros, resumen: p.resumen, filas, salvedades: p.salvedades })} />}
    >
      <AvisoSalvedades salvedades={p.salvedades} />
      {p.filas.length === 0 ? (
        <AvisoVacio mensaje="No hay datos consolidados para el rango elegido." />
      ) : conDato.length === 0 ? (
        <AvisoVacio
          mensaje="Ningún vehículo del rango tiene cargado el archivo contable, y repuestos y mano de obra solo vienen de ahí. Cárgalo en Datos de flota para ver esta pantalla."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta
              titulo="Mantenimiento total"
              valor={cop(total)}
              pie={`${decimal(ingresosConDato > 0 ? (total / ingresosConDato) * 100 : 0)} % de los ingresos`}
            />
            <Tarjeta
              titulo="Repuestos netos"
              valor={cop(totRepuestos)}
              pie={`${decimal(total > 0 ? (totRepuestos / total) * 100 : 0)} % del mantenimiento · descuento ${cop(descuento)}`}
              ayuda="Repuestos menos el descuento fondo-conductor, como en el aplicativo."
            />
            <Tarjeta
              titulo="Mano de obra"
              valor={cop(totManoDeObra)}
              pie={`${decimal(total > 0 ? (totManoDeObra / total) * 100 : 0)} % del mantenimiento`}
            />
            <Tarjeta
              titulo="Costo por timbrada"
              valor={cop(timbradasConDato > 0 ? total / timbradasConDato : 0)}
              pie="solo mantenimiento"
            />
          </div>

          {sinDato > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p>
                <strong>{entero(sinDato)} vehículos del rango no aparecen aquí</strong> porque no tienen el archivo contable de
                ningún mes. No significa que no hayan gastado en mantenimiento: significa que no hay dato. Cárgalo en{" "}
                <Link href="/financiera/flota/datos" className="font-medium underline">
                  Datos de flota
                </Link>
                .
              </p>
            </div>
          )}

          <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Los 15 vehículos de mayor gasto en mantenimiento</h2>
            <p className="mb-2 text-xs text-gray-500">
              En millones de pesos. En índigo los repuestos netos, en gris la mano de obra.
            </p>
            <BarrasMantenimiento
              datos={filas.slice(0, 15).map((f) => ({
                etiqueta: `${f.vehiculo.codigoVehiculo}${f.vehiculo.placa ? ` · ${f.vehiculo.placa}` : ""}`,
                repuestos: f.repuestosNetos,
                manoDeObra: f.manoDeObra,
              }))}
            />
          </section>

          <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
            <div className="border-b border-[#E2E8F0] px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Detalle por vehículo</h2>
              <p className="text-xs text-gray-500">Ordenado por el mayor gasto de mantenimiento en el rango.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2">Vehículo</th>
                    <th className="whitespace-nowrap px-3 py-2">Propietario</th>
                    <th className="whitespace-nowrap px-3 py-2">Modelo</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Meses con dato</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Repuestos</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Descuento fondo</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Repuestos netos</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Mano de obra</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Total</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">% mano de obra</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">Por timbrada</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">% del ingreso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {filas.map((f) => {
                    const v = f.vehiculo;
                    return (
                      <tr key={v.codigoVehiculo} className="hover:bg-[#F8FAFC]">
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                          {v.codigoVehiculo}
                          {v.placa && <span className="ml-1.5 font-mono text-xs text-gray-400">{v.placa}</span>}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 text-gray-700" title={v.propietarioNombre}>{v.propietarioNombre}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">{v.modelo ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" title={`${v.meses} meses con movimiento`}>
                          {v.mesesConContable}
                          {v.mesesConContable < v.meses && <span className="ml-1 text-amber-600">de {v.meses}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(v.repuestos)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-500">
                          {v.descFondoConductor > 0 ? `− ${cop(v.descFondoConductor)}` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(f.repuestosNetos)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(f.manoDeObra)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{cop(f.total)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{decimal(f.pctManoDeObra)} %</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(f.porTimbrada)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {decimal(v.ingresos > 0 ? (f.total / v.ingresos) * 100 : 0)} %
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-[#F1F5F9] px-3 py-2 text-xs text-gray-500">
                {entero(filas.length)} vehículos con dato · el descuento fondo-conductor se resta de repuestos, nunca se suma
                como gasto.
              </p>
            </div>
          </section>
        </>
      )}
    </MarcoFlota>
  );
}
