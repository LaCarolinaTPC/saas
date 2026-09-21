import { canAccess, canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { cargarPantalla, type SearchParams } from "@/lib/financiera/pantalla";
import { agruparPorSemaforo, porMes, valoresVista, vistaPrincipal } from "@/lib/financiera/analisis";
import { nivelSemaforo } from "@/lib/financiera/motor";
import { cop, entero, nombrePeriodo, porcentaje, rotuloRango } from "@/lib/financiera/formato";
import { BarrasMes, LineaMes } from "@/components/graficos/graficos-financiera";
import { Fallo, SinAcceso } from "../sin-acceso";
import { MarcoFlota } from "./marco";
import { ExportarFlota } from "./exportar-flota";
import { informeVehiculos } from "@/lib/financiera/exportar";
import { TablaVehiculos } from "./tabla-vehiculos";
import { AvisoCobertura, AvisoVacio, NotaVista, Tarjeta, TarjetasSemaforo } from "./ui";

export const dynamic = "force-dynamic";

/**
 * Rentabilidad: el tablero principal de Gestión de flota. KPIs ponderados del
 * rango, reparto del semáforo, serie mensual y la tabla detallada.
 */
export default async function RentabilidadPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) return <SinAcceso />;
  if (!canAccessSub(perms, "financiera", "fin_tablero")) {
    return <SinAcceso titulo="Rentabilidad" motivo="Tu tipo de usuario no tiene el tablero de Gestión de flota. Pídelo a Administración." />;
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
  const kpi = valoresVista(p.resumen, principal);
  const conContable = p.vehiculos.filter((v) => v.tieneContable);
  const grupos = agruparPorSemaforo(conContable, (v) => valoresVista(v.indicadores, principal).rentabilidad, p.parametros.rentabilidad);
  const meses = porMes(p.filas);
  const techo = p.resumen.cobertura !== "completo";

  return (
    <MarcoFlota
      perms={perms}
      titulo="Rentabilidad"
      descripcion={`${rotuloRango(p.filtros.anio, p.filtros.mes)} · ${entero(p.resumen.vehiculosDistintos)} vehículos`}
      anios={p.anios}
      opciones={p.opciones}
      acciones={
        <ExportarFlota
          informe={informeVehiculos({
            titulo: "Rentabilidad por vehículo",
            archivo: `financiera-rentabilidad-${p.filtros.anio}${p.filtros.mes ? `-${String(p.filtros.mes).padStart(2, "0")}` : ""}`,
            filtros: p.filtros,
            resumen: p.resumen,
            vehiculos: p.vehiculos,
            parametros: p.parametros,
            indicador: "rentabilidad",
          })}
        />
      }
      conVista
    >
      <AvisoCobertura cobertura={p.resumen.cobertura} vehiculoMes={p.resumen.vehiculoMes} />

      {p.filas.length === 0 ? (
        <AvisoVacio mensaje="No hay datos consolidados para el rango elegido. Revisa los filtros o consolida desde GEMA en Datos de flota." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta titulo="Ingresos" valor={cop(p.resumen.ingresos)} pie={`${entero(p.resumen.timbradas)} timbradas`} />
            <Tarjeta
              titulo="Gastos operativos"
              valor={cop(kpi.gastos)}
              pie={techo ? "sin los rubros del archivo contable" : "GEMA + archivo contable"}
              tono={techo ? "amber" : "neutro"}
            />
            <Tarjeta
              titulo="Utilidad neta"
              valor={`${techo ? "≤ " : ""}${cop(kpi.utilidad)}`}
              pie={`${entero(p.resumen.vehiculoMes)} vehículo-mes`}
            />
            <Tarjeta
              titulo="Rentabilidad ponderada"
              valor={`${techo ? "≤ " : ""}${porcentaje(kpi.rentabilidad)}`}
              nivel={techo ? undefined : nivelSemaforo(kpi.rentabilidad, p.parametros.rentabilidad)}
              pie="Σ utilidad / Σ ingresos"
              ayuda="Promedio ponderado, nunca el promedio de la columna."
            />
          </div>
          <NotaVista vista={p.filtros.vista} />

          <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Reparto por semáforo</h2>
            <p className="mb-3 text-xs text-gray-500">
              Solo los {entero(conContable.length)} vehículos con archivo contable completo en el rango; los demás no se pueden
              clasificar. Umbrales: excelente ≥ {porcentaje(p.parametros.rentabilidad.umbralExcelente)}, aceptable ≥{" "}
              {porcentaje(p.parametros.rentabilidad.umbralAceptable)}.
            </p>
            {conContable.length === 0 ? (
              <AvisoVacio mensaje="Ningún vehículo del rango tiene el archivo contable completo, así que no hay reparto que mostrar." />
            ) : (
              <TarjetasSemaforo grupos={grupos} formato={(n) => porcentaje(n)} total={conContable.length} />
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Utilidad por mes</h2>
              <p className="mb-2 text-xs text-gray-500">En millones de pesos. Las barras claras son meses sin archivo contable.</p>
              <BarrasMes
                titulo="Utilidad"
                datos={meses.map((m) => ({
                  periodo: m.periodo,
                    nombre: nombrePeriodo(m.periodo),
                  valor: valoresVista(m.resumen, principal).utilidad,
                  techo: m.resumen.cobertura !== "completo",
                  detalle: `${entero(m.resumen.vehiculoMes)} vehículos · ingresos ${cop(m.resumen.ingresos)}`,
                }))}
              />
            </section>
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Rentabilidad por mes</h2>
              <p className="mb-2 text-xs text-gray-500">Ponderada del mes, con las bandas del semáforo.</p>
              <LineaMes
                titulo="Rentabilidad"
                datos={meses.map((m) => ({
                  periodo: m.periodo,
                    nombre: nombrePeriodo(m.periodo),
                  valor: valoresVista(m.resumen, principal).rentabilidad,
                  techo: m.resumen.cobertura !== "completo",
                }))}
                bandas={{ excelente: p.parametros.rentabilidad.umbralExcelente, aceptable: p.parametros.rentabilidad.umbralAceptable }}
              />
            </section>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Detalle por vehículo</h2>
            <TablaVehiculos vehiculos={p.vehiculos} vista={p.filtros.vista} parametros={p.parametros} orden="rentabilidad" />
          </section>
        </>
      )}
    </MarcoFlota>
  );
}
