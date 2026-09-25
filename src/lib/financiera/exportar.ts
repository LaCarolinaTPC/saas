/**
 * Informes de Gestión de flota — armado del informe (puro, sin navegador).
 *
 * Las pantallas son Server Components: aquí se construye el informe con los
 * valores en crudo y el tipo de cada columna, y `exportar-flota.tsx` lo baja
 * a PDF, Excel o CSV en el navegador. Los números viajan como números para
 * que el Excel salga con celdas numéricas y no con texto.
 *
 * Regla que se conserva del aplicativo: sin el archivo contable del mes la
 * utilidad y la rentabilidad son un techo y el gasto por timbrada un piso.
 * En los informes eso va como una nota al pie y como prefijo «≤» / «≥» en la
 * celda de texto; en Excel el número va limpio y la nota lo advierte.
 */

import {
  tieneTimbradas,
  valoresVista,
  vistaPrincipal,
  type FilaMes,
  type FilaMantenimiento,
  type Filtros,
  type ResumenFlota,
  type VehiculoAcumulado,
} from "./analisis";
import { cop, decimal, entero, nombrePeriodo, porcentaje, rotuloRango } from "./formato";
import { VISTA_RENTABILIDAD_ETIQUETAS, nivelSemaforo, type ParametroSemaforo, type IndicadorSemaforo } from "./motor";
import { notasSalvedades, type Salvedad } from "./salvedades";

export type TipoColumna = "texto" | "entero" | "cop" | "pct" | "decimal";

export interface ColumnaInforme {
  titulo: string;
  tipo: TipoColumna;
  /** Ancho en mm para el PDF; sin ancho se reparte el sobrante. */
  ancho?: number;
}

export type ValorCelda = string | number | null;

export interface InformeFlota {
  /** Nombre del archivo sin extensión. */
  archivo: string;
  modulo: string;
  titulo: string;
  /** Filtros con los que se sacó: una línea cada uno. */
  contexto: string[];
  /** Totales en una línea, antes de la tabla. */
  resumen: string[];
  columnas: ColumnaInforme[];
  filas: ValorCelda[][];
  notas: string[];
  orientacion?: "portrait" | "landscape";
}

export const MODULO = "Financiera · Gestión de flota";

/** Formatea una celda para PDF y CSV. En Excel los números van sin formatear. */
export function textoCelda(valor: ValorCelda, tipo: TipoColumna): string {
  if (valor == null) return "—";
  if (typeof valor === "string") return valor;
  switch (tipo) {
    case "cop": return cop(valor);
    case "pct": return porcentaje(valor);
    case "entero": return entero(valor);
    case "decimal": return decimal(valor);
    default: return String(valor);
  }
}

/** Las líneas de contexto: el rango y cada filtro activo. */
export function contextoDe(f: Filtros, resumen: ResumenFlota, extra: string[] = []): string[] {
  const lineas = [rotuloRango(f.anio, f.mes)];
  if (f.flota) lineas.push(`Flota: ${f.flota}`);
  if (f.marca) lineas.push(`Marca: ${f.marca}`);
  if (f.propietario) lineas.push(`Propietario: ${f.propietario}`);
  if (f.vehiculo) lineas.push(`Vehículo: ${f.vehiculo}`);
  lineas.push(`Vista de rentabilidad: ${VISTA_RENTABILIDAD_ETIQUETAS[f.vista]}`);
  lineas.push(
    `${entero(resumen.vehiculosDistintos)} vehículos · ${entero(resumen.vehiculoMes)} vehículo-mes · ` +
      `archivo contable: ${resumen.cobertura === "completo" ? "completo" : resumen.cobertura === "parcial" ? `${entero(resumen.conContable)} de ${entero(resumen.vehiculoMes)}` : "sin cargar"}`
  );
  return [...lineas, ...extra];
}

/** La advertencia de cobertura, que va al pie de todo informe incompleto. */
export function notaCobertura(resumen: ResumenFlota): string[] {
  if (resumen.cobertura === "completo") return [];
  return [
    "Falta el archivo contable de parte del rango (despacho, intereses, otros gastos, repuestos, mano de obra y descuento " +
      "fondo-conductor no existen en GEMA). Mientras falten, la utilidad y la rentabilidad son un TECHO (≤) y el gasto por " +
      "timbrada un PISO (≥). Las filas afectadas van marcadas con un asterisco en la columna Meses.",
  ];
}

const NOTA_AGRUPACION =
  "Agrupado por código de vehículo, nunca por placa: una placa puede cambiar de bus. Los importes van en pesos enteros y la rentabilidad con dos decimales.";

// ── Informe de la tabla de vehículos ─────────────────────────────────────────

/**
 * La tabla detallada que comparten Rentabilidad, Gasto por timbrada,
 * Productividad y Vehículos en pérdida.
 */
export function informeVehiculos({
  titulo,
  archivo,
  filtros,
  resumen,
  vehiculos,
  parametros,
  indicador,
  notasExtra = [],
  salvedades = [],
}: {
  titulo: string;
  archivo: string;
  filtros: Filtros;
  resumen: ResumenFlota;
  vehiculos: readonly VehiculoAcumulado[];
  parametros: Record<IndicadorSemaforo, ParametroSemaforo>;
  /** Con cuál de los tres indicadores se pinta el semáforo de la última columna. */
  indicador: IndicadorSemaforo;
  notasExtra?: string[];
  salvedades?: readonly Salvedad[];
}): InformeFlota {
  const principal = vistaPrincipal(filtros.vista);
  const ambas = filtros.vista === "ambas";

  // Los anchos suman menos que el ancho útil de la hoja en carta apaisada
  // (259 mm): si se pasan, autotable corta la última columna en silencio.
  // Propietario lleva ancho propio y generoso porque son razones sociales
  // largas; dejarlo flexible le daba las sobras (7 mm) y partía cada nombre
  // en seis líneas, con lo que 162 vehículos salían en 57 páginas.
  // Con «ambas» hay dos columnas más, así que todas se estrechan.
  const a = ambas
    ? { veh: 13, placa: 12, prop: 26, flota: 13, meses: 10, viajes: 12, tim: 15, cop: 19, pct: 14, gt: 16, vm: 12, sem: 14 }
    : { veh: 15, placa: 14, prop: 32, flota: 16, meses: 11, viajes: 14, tim: 17, cop: 23, pct: 19, gt: 20, vm: 14, sem: 16 };
  const columnas: ColumnaInforme[] = [
    { titulo: "Vehículo", tipo: "texto", ancho: a.veh },
    { titulo: "Placa", tipo: "texto", ancho: a.placa },
    { titulo: "Propietario", tipo: "texto", ancho: a.prop },
    { titulo: "Flota", tipo: "texto", ancho: a.flota },
    { titulo: "Meses", tipo: "texto", ancho: a.meses },
    { titulo: "Viajes", tipo: "entero", ancho: a.viajes },
    { titulo: "Timbradas", tipo: "entero", ancho: a.tim },
    { titulo: "Ingresos", tipo: "cop", ancho: a.cop },
    { titulo: "Gastos", tipo: "cop", ancho: a.cop },
    { titulo: "Utilidad", tipo: "cop", ancho: a.cop },
    ...(ambas ? ([{ titulo: "Utilidad desp. fin.", tipo: "cop", ancho: a.cop }] as ColumnaInforme[]) : []),
    { titulo: "Rentabilidad", tipo: "pct", ancho: a.pct },
    ...(ambas ? ([{ titulo: "Rent. desp. fin.", tipo: "pct", ancho: a.pct }] as ColumnaInforme[]) : []),
    { titulo: "Gasto/timbrada", tipo: "cop", ancho: a.gt },
    { titulo: "Viajes/mes", tipo: "decimal", ancho: a.vm },
    { titulo: "Semáforo", tipo: "texto", ancho: a.sem },
  ];

  const valorIndicador = (v: VehiculoAcumulado) => {
    const val = valoresVista(v.indicadores, principal);
    return indicador === "rentabilidad" ? val.rentabilidad : indicador === "gasto_timbrada" ? val.gastosPorTimbrada : v.productividad;
  };

  const filas: ValorCelda[][] = vehiculos.map((v) => {
    const val = valoresVista(v.indicadores, principal);
    const fin = valoresVista(v.indicadores, "financiero");
    const incompleto = !v.tieneContable;
    // La productividad no depende del archivo contable: siempre se clasifica.
    const clasificable = indicador === "productividad" || !incompleto;
    // Sin timbradas el gasto por timbrada vale 0 y saldría en verde.
    const sinTimbradas = indicador === "gasto_timbrada" && !tieneTimbradas(v);
    return [
      v.codigoVehiculo,
      v.placa ?? "—",
      v.propietarioNombre,
      v.tipoPropietario,
      `${v.meses}${incompleto ? " *" : ""}`,
      v.viajes,
      v.timbradas,
      v.ingresos,
      val.gastos,
      val.utilidad,
      ...(ambas ? [fin.utilidad] : []),
      val.rentabilidad,
      ...(ambas ? [fin.rentabilidad] : []),
      val.gastosPorTimbrada,
      v.productividad,
      sinTimbradas ? "sin timbradas" : clasificable ? etiquetaNivel(nivelSemaforo(valorIndicador(v), parametros[indicador])) : "sin dato",
    ];
  });

  return {
    archivo,
    modulo: MODULO,
    titulo,
    contexto: contextoDe(filtros, resumen),
    resumen: resumenFlotaLineas(resumen, filtros),
    columnas,
    filas,
    notas: [NOTA_AGRUPACION, ...notaCobertura(resumen), ...notasSalvedades(salvedades), ...notasExtra],
    orientacion: "landscape",
  };
}

function etiquetaNivel(n: "excelente" | "aceptable" | "critico"): string {
  return n === "excelente" ? "Excelente" : n === "aceptable" ? "Aceptable" : "Crítico";
}

/** Los KPIs que van en una línea antes de la tabla. */
export function resumenFlotaLineas(r: ResumenFlota, f: Filtros): string[] {
  const principal = vistaPrincipal(f.vista);
  const v = valoresVista(r, principal);
  const techo = r.cobertura !== "completo";
  return [
    `Ingresos ${cop(r.ingresos)}`,
    `Gastos ${cop(v.gastos)}`,
    `Utilidad ${techo ? "≤ " : ""}${cop(v.utilidad)}`,
    `Rentabilidad ${techo ? "≤ " : ""}${porcentaje(v.rentabilidad)}`,
    `Gasto/timbrada ${techo ? "≥ " : ""}${cop(v.gastosPorTimbrada)}`,
    `Viajes por vehículo-mes ${decimal(r.productividad)}`,
  ];
}

// ── Informe de mantenimiento ─────────────────────────────────────────────────

export function informeMantenimiento({
  filtros,
  resumen,
  filas: datos,
  salvedades = [],
}: {
  filtros: Filtros;
  resumen: ResumenFlota;
  filas: readonly FilaMantenimiento[];
  salvedades?: readonly Salvedad[];
}): InformeFlota {
  const columnas: ColumnaInforme[] = [
    { titulo: "Vehículo", tipo: "texto", ancho: 18 },
    { titulo: "Placa", tipo: "texto", ancho: 15 },
    { titulo: "Propietario", tipo: "texto" },
    { titulo: "Modelo", tipo: "texto", ancho: 14 },
    { titulo: "Meses con dato", tipo: "texto", ancho: 20 },
    { titulo: "Repuestos", tipo: "cop", ancho: 22 },
    { titulo: "Desc. fondo", tipo: "cop", ancho: 20 },
    { titulo: "Repuestos netos", tipo: "cop", ancho: 22 },
    { titulo: "Mano de obra", tipo: "cop", ancho: 22 },
    { titulo: "Total", tipo: "cop", ancho: 22 },
    { titulo: "% mano de obra", tipo: "pct", ancho: 18 },
    { titulo: "Por timbrada", tipo: "cop", ancho: 18 },
    { titulo: "% del ingreso", tipo: "pct", ancho: 16 },
  ];
  const filas: ValorCelda[][] = datos.map((f) => {
    const v = f.vehiculo;
    return [
      v.codigoVehiculo,
      v.placa ?? "—",
      v.propietarioNombre,
      v.modelo ?? "—",
      `${v.mesesConContable} de ${v.meses}`,
      v.repuestos,
      v.descFondoConductor,
      f.repuestosNetos,
      f.manoDeObra,
      f.total,
      f.pctManoDeObra,
      f.porTimbrada,
      v.ingresos > 0 ? (f.total / v.ingresos) * 100 : 0,
    ];
  });
  const total = datos.reduce((s, f) => s + f.total, 0);
  const repuestos = datos.reduce((s, f) => s + f.repuestosNetos, 0);
  const mano = datos.reduce((s, f) => s + f.manoDeObra, 0);
  return {
    archivo: `financiera-mantenimiento-${filtros.anio}${filtros.mes ? `-${String(filtros.mes).padStart(2, "0")}` : ""}`,
    modulo: MODULO,
    titulo: "Mantenimiento: repuestos y mano de obra",
    contexto: contextoDe(filtros, resumen),
    resumen: [
      `Mantenimiento total ${cop(total)}`,
      `Repuestos netos ${cop(repuestos)}`,
      `Mano de obra ${cop(mano)}`,
      `${entero(datos.length)} vehículos con dato`,
    ],
    columnas,
    filas,
    notas: [
      "El descuento fondo-conductor se RESTA de repuestos; nunca se suma como gasto.",
      "Solo aparecen los vehículos con archivo contable: los demás no gastan cero, es que no hay dato.",
      NOTA_AGRUPACION,
      ...notasSalvedades(salvedades),
    ],
    orientacion: "landscape",
  };
}

// ── Informe de comparación mes a mes ─────────────────────────────────────────

export function informeComparacion({
  filtros,
  resumen,
  meses,
  salvedades = [],
}: {
  filtros: Filtros;
  resumen: ResumenFlota;
  meses: readonly FilaMes[];
  salvedades?: readonly Salvedad[];
}): InformeFlota {
  const principal = vistaPrincipal(filtros.vista);
  const columnas: ColumnaInforme[] = [
    { titulo: "Mes", tipo: "texto", ancho: 26 },
    { titulo: "Estado", tipo: "texto", ancho: 16 },
    { titulo: "Vehículos", tipo: "entero", ancho: 17 },
    { titulo: "Viajes", tipo: "entero", ancho: 17 },
    { titulo: "Viajes/bus", tipo: "decimal", ancho: 17 },
    { titulo: "Timbradas", tipo: "entero", ancho: 20 },
    { titulo: "Ingresos", tipo: "cop", ancho: 27 },
    { titulo: "Gastos", tipo: "cop", ancho: 27 },
    { titulo: "Utilidad", tipo: "cop", ancho: 27 },
    { titulo: "Rentabilidad", tipo: "pct", ancho: 19 },
    { titulo: "Gasto/timbrada", tipo: "cop", ancho: 21 },
    { titulo: "Archivo contable", tipo: "texto", ancho: 24 },
  ];
  const filas: ValorCelda[][] = meses.map((m) => {
    const v = valoresVista(m.resumen, principal);
    return [
      nombrePeriodo(m.periodo),
      m.estadoPeriodo ?? "—",
      m.resumen.vehiculoMes,
      m.resumen.viajes,
      m.resumen.productividad,
      m.resumen.timbradas,
      m.resumen.ingresos,
      v.gastos,
      v.utilidad,
      v.rentabilidad,
      v.gastosPorTimbrada,
      m.resumen.cobertura === "completo"
        ? "completo"
        : m.resumen.cobertura === "parcial"
          ? `${entero(m.resumen.conContable)} de ${entero(m.resumen.vehiculoMes)}`
          : "sin cargar",
    ];
  });
  return {
    archivo: `financiera-comparacion-${filtros.anio}${filtros.mes ? `-${String(filtros.mes).padStart(2, "0")}` : ""}`,
    modulo: MODULO,
    titulo: "Comparación de períodos",
    contexto: contextoDe(filtros, resumen),
    resumen: resumenFlotaLineas(resumen, filtros),
    columnas,
    filas,
    notas: [
      "Cada fila es un mes suelto, no el acumulado: el acumulado al corte es el total del informe.",
      ...notaCobertura(resumen),
      ...notasSalvedades(salvedades),
    ],
    orientacion: "landscape",
  };
}
