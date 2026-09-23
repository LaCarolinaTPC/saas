import { canAccess, canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { cargarPantalla, type SearchParams } from "@/lib/financiera/pantalla";
import { agruparPorSemaforo, porMes, tieneTimbradas, valoresVista, vistaPrincipal } from "@/lib/financiera/analisis";
import { nivelSemaforo } from "@/lib/financiera/motor";
import { cop, entero, nombrePeriodo, rotuloRango } from "@/lib/financiera/formato";
import { BarrasVehiculo, LineaMes } from "@/components/graficos/graficos-financiera";
import { Fallo, SinAcceso } from "../../sin-acceso";
import { MarcoFlota } from "../marco";
import { ExportarFlota } from "../exportar-flota";
import { informeVehiculos } from "@/lib/financiera/exportar";
import { TablaVehiculos } from "../tabla-vehiculos";
import { AvisoCobertura, AvisoSalvedades, AvisoVacio, NotaVista, Tarjeta, TarjetasSemaforo } from "../ui";

export const dynamic = "force-dynamic";

/**
 * Gasto por timbrada: cuánto cuesta cada timbrada. Sin el archivo contable la
 * cifra es un PISO (faltan seis rubros de costo), al revés que la utilidad.
 */
export default async function TimbradaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) return <SinAcceso />;
  if (!canAccessSub(perms, "financiera", "fin_tablero")) {
    return <SinAcceso titulo="Gasto por timbrada" motivo="Tu tipo de usuario no tiene el tablero de Gestión de flota." />;
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
  // Sin timbradas el gasto por timbrada vale 0 y saldría en verde: no se clasifica.
  const clasificables = conContable.filter(tieneTimbradas);
  const sinTimbradas = conContable.length - clasificables.length;
  const grupos = agruparPorSemaforo(clasificables, (v) => valoresVista(v.indicadores, principal).gastosPorTimbrada, p.parametros.gasto_timbrada);
  const meses = porMes(p.filas);
  const piso = p.resumen.cobertura !== "completo";
  const ingresoPorTimbrada = p.resumen.timbradas > 0 ? p.resumen.ingresos / p.resumen.timbradas : 0;
  const peores = [...clasificables]
    .sort((a, b) => valoresVista(b.indicadores, principal).gastosPorTimbrada - valoresVista(a.indicadores, principal).gastosPorTimbrada)
    .slice(0, 15);

  return (
    <MarcoFlota
      perms={perms}
      titulo="Gasto por timbrada"
      descripcion={`${rotuloRango(p.filtros.anio, p.filtros.mes)} · ${entero(p.resumen.timbradas)} timbradas`}
      anios={p.anios}
      opciones={p.opciones}
      acciones={
        <ExportarFlota
          informe={informeVehiculos({
            salvedades: p.salvedades,
            titulo: "Gasto por timbrada",
            archivo: `financiera-gasto-timbrada-${p.filtros.anio}${p.filtros.mes ? `-${String(p.filtros.mes).padStart(2, "0")}` : ""}`,
            filtros: p.filtros,
            resumen: p.resumen,
            vehiculos: p.vehiculos,
            parametros: p.parametros,
            indicador: "gasto_timbrada",
            notasExtra: [
              `Ingreso por timbrada del rango: ${cop(ingresoPorTimbrada)}. Los umbrales están en pesos fijos y el pasaje sube: conviene evaluarlos como porcentaje del ingreso (plan, 6.3.1).`,
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
              titulo="Gasto por timbrada"
              valor={`${piso ? "≥ " : ""}${cop(kpi.gastosPorTimbrada)}`}
              nivel={piso ? undefined : nivelSemaforo(kpi.gastosPorTimbrada, p.parametros.gasto_timbrada)}
              pie="Σ gastos / Σ timbradas"
              ayuda="Ponderado. Sin archivo contable es un piso: faltan seis rubros de costo."
            />
            <Tarjeta titulo="Ingreso por timbrada" valor={cop(ingresoPorTimbrada)} pie="Σ ingresos / Σ timbradas" />
            <Tarjeta
              titulo="Margen por timbrada"
              valor={`${piso ? "≤ " : ""}${cop(ingresoPorTimbrada - kpi.gastosPorTimbrada)}`}
              pie="lo que queda de cada timbrada"
            />
            <Tarjeta
              titulo="Gasto sobre el ingreso"
              valor={ingresoPorTimbrada > 0 ? `${piso ? "≥ " : ""}${(kpi.gastosPorTimbrada / ingresoPorTimbrada * 100).toFixed(1)} %` : "—"}
              pie="los umbrales en pesos envejecen con el pasaje"
              ayuda="El pasaje subió ~10 % en 2026; conviene evaluar el umbral como porcentaje del ingreso (plan, 6.3.1)."
            />
          </div>
          <NotaVista vista={p.filtros.vista} />

          <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Reparto por semáforo</h2>
            <p className="mb-3 text-xs text-gray-500">
              Solo los {entero(clasificables.length)} vehículos con archivo contable completo y timbradas en el rango
              {sinTimbradas > 0
                ? ` (${entero(sinTimbradas)} sin timbradas quedan fuera: su gasto por timbrada valdría 0 y saldrían en verde)`
                : ""}
              . Umbrales: excelente ≤ {cop(p.parametros.gasto_timbrada.umbralExcelente)}, aceptable ≤{" "}
              {cop(p.parametros.gasto_timbrada.umbralAceptable)}.
            </p>
            {clasificables.length === 0 ? (
              <AvisoVacio mensaje="Ningún vehículo del rango tiene el archivo contable completo y timbradas." />
            ) : (
              <TarjetasSemaforo grupos={grupos} formato={(n) => cop(n)} total={clasificables.length} />
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Gasto por timbrada, mes a mes</h2>
              <p className="mb-2 text-xs text-gray-500">Ponderado del mes, con las bandas del semáforo.</p>
              <LineaMes
                titulo="Gasto por timbrada"
                formato="cop"
                datos={meses.map((m) => ({
                  periodo: m.periodo,
                    nombre: nombrePeriodo(m.periodo),
                  valor: valoresVista(m.resumen, principal).gastosPorTimbrada,
                  techo: m.resumen.cobertura !== "completo",
                  detalle: `ingreso por timbrada ${cop(m.resumen.timbradas > 0 ? m.resumen.ingresos / m.resumen.timbradas : 0)}`,
                }))}
                bandas={{ excelente: p.parametros.gasto_timbrada.umbralExcelente, aceptable: p.parametros.gasto_timbrada.umbralAceptable }}
              />
            </section>
            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Los 15 vehículos con mayor gasto por timbrada</h2>
              <p className="mb-2 text-xs text-gray-500">Solo los que tienen archivo contable completo en el rango.</p>
              {peores.length === 0 ? (
                <AvisoVacio mensaje="Sin vehículos con archivo contable completo." />
              ) : (
                <BarrasVehiculo
                  titulo="Gasto por timbrada"
                  formato="num"
                  datos={peores.map((v) => {
                    const val = valoresVista(v.indicadores, principal);
                    return {
                      codigo: v.codigoVehiculo,
                      etiqueta: `${v.codigoVehiculo}${v.placa ? ` · ${v.placa}` : ""}`,
                      valor: Math.round(val.gastosPorTimbrada),
                      nivel: nivelSemaforo(val.gastosPorTimbrada, p.parametros.gasto_timbrada),
                      detalle: `${entero(v.timbradas)} timbradas · ${v.propietarioNombre}`,
                    };
                  })}
                />
              )}
            </section>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-900">Detalle por vehículo</h2>
            <TablaVehiculos vehiculos={p.vehiculos} salvedades={p.salvedades} vista={p.filtros.vista} parametros={p.parametros} orden="gasto_timbrada" />
          </section>
        </>
      )}
    </MarcoFlota>
  );
}
