import { canAccess, canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { cargarPantalla, type SearchParams } from "@/lib/financiera/pantalla";
import { agruparPorSemaforo, porMes } from "@/lib/financiera/analisis";
import { nivelSemaforo } from "@/lib/financiera/motor";
import { cop, decimal, entero, nombrePeriodo, rotuloRango } from "@/lib/financiera/formato";
import { BarrasVehiculo, LineaMes } from "@/components/graficos/graficos-financiera";
import { Fallo, SinAcceso } from "../../sin-acceso";
import { MarcoFlota } from "../marco";
import { ExportarFlota } from "../exportar-flota";
import { informeVehiculos } from "@/lib/financiera/exportar";
import { TablaVehiculos } from "../tabla-vehiculos";
import { AvisoVacio, Tarjeta, TarjetasSemaforo } from "../ui";

export const dynamic = "force-dynamic";

/**
 * Productividad: viajes por vehículo-mes. Es el ÚNICO indicador exacto sin el
 * archivo contable, porque sale entero de GEMA. Por eso aquí no va el aviso
 * de cobertura y sí la advertencia sobre el umbral (plan, 6.3.1): con 90/80
 * la flota no alcanza el verde en ningún mes.
 */
export default async function ProductividadPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) return <SinAcceso />;
  if (!canAccessSub(perms, "financiera", "fin_tablero")) {
    return <SinAcceso titulo="Productividad" motivo="Tu tipo de usuario no tiene el tablero de Gestión de flota." />;
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

  const par = p.parametros.productividad;
  const grupos = agruparPorSemaforo(p.vehiculos, (v) => v.productividad, par);
  const meses = porMes(p.filas);
  const mesesVerde = meses.filter((m) => nivelSemaforo(m.resumen.productividad, par) === "excelente").length;
  const peores = [...p.vehiculos].sort((a, b) => a.productividad - b.productividad).slice(0, 15);
  const diasPorVehiculoMes = p.filas.length > 0 ? p.filas.reduce((s, f) => s + f.diasConProduccion, 0) / p.filas.length : 0;

  return (
    <MarcoFlota
      perms={perms}
      titulo="Productividad"
      descripcion={`${rotuloRango(p.filtros.anio, p.filtros.mes)} · viajes por vehículo-mes`}
      anios={p.anios}
      opciones={p.opciones}
      acciones={
        <ExportarFlota
          informe={informeVehiculos({
            salvedades: p.salvedades,
            titulo: "Productividad por vehículo",
            archivo: `financiera-productividad-${p.filtros.anio}${p.filtros.mes ? `-${String(p.filtros.mes).padStart(2, "0")}` : ""}`,
            filtros: p.filtros,
            resumen: p.resumen,
            vehiculos: p.vehiculos,
            parametros: p.parametros,
            indicador: "productividad",
            notasExtra: [
              `La productividad es exacta: sale entera de GEMA y no depende del archivo contable. Umbral vigente: excelente >= ${decimal(par.umbralExcelente, 0)}, aceptable >= ${decimal(par.umbralAceptable, 0)} viajes por vehículo-mes; en el rango lo alcanzan ${mesesVerde} de ${meses.length} meses.`,
            ],
          })}
        />
      }
    >
      {p.filas.length === 0 ? (
        <AvisoVacio mensaje="No hay datos consolidados para el rango elegido." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta
              titulo="Viajes por vehículo-mes"
              valor={decimal(p.resumen.productividad)}
              nivel={nivelSemaforo(p.resumen.productividad, par)}
              pie={`${entero(p.resumen.viajes)} viajes · ${entero(p.resumen.vehiculoMes)} vehículo-mes`}
              ayuda="Exacto: sale entero de GEMA, no depende del archivo contable."
            />
            <Tarjeta titulo="Días con producción" valor={decimal(diasPorVehiculoMes)} pie="promedio por vehículo-mes" />
            <Tarjeta titulo="Timbradas por viaje" valor={decimal(p.resumen.viajes > 0 ? p.resumen.timbradas / p.resumen.viajes : 0)} pie="pasajeros por viaje" />
            <Tarjeta titulo="Ingreso por viaje" valor={cop(p.resumen.viajes > 0 ? p.resumen.ingresos / p.resumen.viajes : 0)} pie="bruto de GEMA" />
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <div>
              <p className="font-medium">El umbral heredado del aplicativo es inalcanzable para esta flota.</p>
              <p className="mt-0.5">
                Con excelente ≥ {decimal(par.umbralExcelente, 0)} y aceptable ≥ {decimal(par.umbralAceptable, 0)} viajes por
                vehículo-mes, el rango elegido tiene <strong>{mesesVerde} de {meses.length} meses</strong> en verde. Sobre los 20
                meses cerrados la flota promedia 77 viajes por bus-mes (plan, 6.3.1) y el nuevo umbral está por confirmar con
                Subgerencia Financiera. Se cambia en Parámetros.
              </p>
            </div>
          </div>

          <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Reparto por semáforo</h2>
            <p className="mb-3 text-xs text-gray-500">Los {entero(p.vehiculos.length)} vehículos del rango; este indicador no necesita el archivo contable.</p>
            <TarjetasSemaforo grupos={grupos} formato={(n) => decimal(n)} total={p.vehiculos.length} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Viajes por vehículo, mes a mes</h2>
              <p className="mb-2 text-xs text-gray-500">Promedio de la flota en cada mes, con las bandas del semáforo.</p>
              <LineaMes
                titulo="Viajes por vehículo"
                formato="num"
                datos={meses.map((m) => ({
                  periodo: m.periodo,
                    nombre: nombrePeriodo(m.periodo),
                  valor: m.resumen.productividad,
                  detalle: `${entero(m.resumen.viajes)} viajes · ${entero(m.resumen.vehiculoMes)} vehículos`,
                }))}
                bandas={{ excelente: par.umbralExcelente, aceptable: par.umbralAceptable }}
              />
            </section>
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Los 15 vehículos de menor productividad</h2>
              <p className="mb-2 text-xs text-gray-500">Viajes por mes con movimiento dentro del rango.</p>
              <BarrasVehiculo
                titulo="Viajes por mes"
                formato="num"
                datos={peores.map((v) => ({
                  codigo: v.codigoVehiculo,
                  etiqueta: `${v.codigoVehiculo}${v.placa ? ` · ${v.placa}` : ""}`,
                  valor: Math.round(v.productividad * 10) / 10,
                  nivel: nivelSemaforo(v.productividad, par),
                  detalle: `${entero(v.viajes)} viajes en ${v.meses} ${v.meses === 1 ? "mes" : "meses"} · ${v.propietarioNombre}`,
                }))}
              />
            </section>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Detalle por vehículo</h2>
            <TablaVehiculos vehiculos={p.vehiculos} salvedades={p.salvedades} vista={p.filtros.vista} parametros={p.parametros} orden="productividad" />
          </section>
        </>
      )}
    </MarcoFlota>
  );
}
