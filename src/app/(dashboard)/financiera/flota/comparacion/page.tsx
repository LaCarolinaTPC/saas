import { canAccess, canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { aniosDisponibles, cargarConsolidado, cargarMarcasVehiculos, cargarPropietarios, leerParametros } from "@/lib/financiera/consulta";
import { llaveFila, periodosDelFiltro } from "@/lib/financiera/analisis";
import { indicadores } from "@/lib/financiera/motor";
import type { FilaComparacion } from "@/lib/financiera/comparacion";
import { Fallo, SinAcceso } from "../../sin-acceso";
import { MarcoFlota } from "../marco";
import { ComparacionVista } from "./comparacion-vista";

export const dynamic = "force-dynamic";

async function cargarDatosComparacion() {
  const anios = await aniosDisponibles();
  const periodos = anios.flatMap((anio) => periodosDelFiltro(anio, null));
  const [filas, propietarios, marcas, parametros] = await Promise.all([
    cargarConsolidado(periodos),
    cargarPropietarios(periodos),
    cargarMarcasVehiculos(),
    leerParametros(),
  ]);
  const datos: FilaComparacion[] = filas.map((fila) => {
    const calculados = indicadores(fila);
    const duenos = propietarios.get(llaveFila(fila.periodo, fila.codigoVehiculo));
    const tipos = [...new Set((duenos ?? []).map((dueno) => dueno.tipo).filter((tipo): tipo is string => !!tipo))];
    return {
      periodo: fila.periodo,
      codigo: fila.codigoVehiculo,
      placa: fila.placa,
      flotas: tipos.length ? tipos : [fila.tipoPropietario ?? "Sin flota"],
      marca: marcas.get(fila.codigoVehiculo) ?? null,
      propietarios: (duenos?.length ? duenos : fila.cedulaPropietario ? [{ cedula: fila.cedulaPropietario, nombre: fila.propietarioNombre }] : [])
        .map((dueno) => ({ cedula: dueno.cedula, nombre: dueno.nombre ?? dueno.cedula })),
      ingresos: fila.ingresos,
      gastosFinancieros: calculados.gastosOperativosTotales,
      gastosOperativos: calculados.gastosOperativosTotales - fila.intereses,
      tieneContable: fila.tieneContable,
    };
  });

  return { anios, datos, parametroRentabilidad: parametros.rentabilidad };
}

/** Comparación libre: los dos cortes pueden pertenecer a cualquier año disponible. */
export default async function ComparacionPage() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) return <SinAcceso />;
  if (!canAccessSub(perms, "financiera", "fin_analisis")) {
    return <SinAcceso titulo="Comparación de períodos" motivo="Tu tipo de usuario no tiene las pantallas de análisis de Gestión de flota." />;
  }
  let resultado: Awaited<ReturnType<typeof cargarDatosComparacion>> | null = null;
  let fallo: string | null = null;
  try {
    resultado = await cargarDatosComparacion();
  } catch (error) {
    fallo = error instanceof Error ? error.message : String(error);
  }
  if (!resultado) return <div className="min-h-screen bg-[#F8FAFC] p-6"><Fallo mensaje={fallo ?? "No se pudo leer la comparación."} /></div>;
  return (
    <MarcoFlota perms={perms} titulo="Comparación de períodos" descripcion="Compara dos cortes acumulados o dos meses específicos" anios={resultado.anios} sinFiltros>
      <ComparacionVista datos={resultado.datos} anios={resultado.anios} parametroRentabilidad={resultado.parametroRentabilidad} />
    </MarcoFlota>
  );
}
