/**
 * Migración del histórico del aplicativo de Lovable (fase 7 del plan).
 *
 * De `fleet_records` solo se traen los SEIS rubros contables que no existen en
 * GEMA: la parte operativa ya está en el espejo y se consolidó en la fase 3
 * (decisión 15 del acta). Las otras veinte columnas del aplicativo sirven para
 * otra cosa igual de importante: **cotejar**. Si los viajes, las timbradas, el
 * bruto y los nueve rubros de GEMA que el aplicativo tenía coinciden con los
 * que calculó Gestivo, entonces las dos herramientas están mirando lo mismo y
 * la utilidad se puede comparar de verdad (punto 12 de la sección 14).
 *
 * Todo lo de este archivo es puro: la lectura de la API, del Excel y de la
 * base vive en `scripts/financiera-historico.mts`.
 */

import {
  TOLERANCIA_COTEJO_COP,
  TOLERANCIA_COTEJO_RENTABILIDAD,
  cuadra,
  esPeriodoValido,
  gastosContables,
  indicadores,
  normalizarFlota,
  type RubrosContables,
  type VehiculoMes,
} from "./motor";
import { normalizarPeriodo, normalizarVehiculo, parsearNumero, COLUMNAS_ARCHIVO } from "./archivo-contable";

// ── Lo que trae una fila del aplicativo ──────────────────────────────────────

/**
 * Una fila de `fleet_records`, ya normalizada. Los nombres son los del modelo
 * del aplicativo (src/lib/fleetDbMapper.ts del repositorio de origen).
 */
export interface FilaLovable extends RubrosContables {
  periodo: string;
  vehiculo: string;
  placa: string | null;
  modelo: number | null;
  propietario: string | null;
  flota: string | null;
  // Producción y rubros que Gestivo saca de GEMA: sirven para cotejar.
  viajes: number;
  timbradas: number;
  ingresos: number;
  fondo: number;
  poliza: number;
  prestamo: number;
  estudio: number;
  salario: number;
  combustible: number;
  rtica: number;
  admon: number;
  sitra: number;
  /** Indicadores tal como los guardaba el aplicativo, para cotejar el cálculo. */
  gastosOperativosTotales: number | null;
  utilidadNeta: number | null;
  rentabilidad: number | null;
  gastosPorTimbrada: number | null;
  /** De dónde salió la fila, para los mensajes de error. */
  origen: string;
}

/** Los doce rubros y medidas que Gestivo obtiene de GEMA y el aplicativo también tenía. */
export const COLUMNAS_COTEJO = [
  "viajes", "timbradas", "ingresos",
  "fondo", "poliza", "prestamo", "estudio", "salario", "combustible", "rtica", "admon", "sitra",
] as const;

export type ColumnaCotejo = (typeof COLUMNAS_COTEJO)[number];

// ── Normalización de una fila cruda ──────────────────────────────────────────

type Cruda = Record<string, unknown>;

const num = (v: unknown): number => {
  const p = parsearNumero(v);
  return p ? p.valor : 0;
};

const numOpt = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const p = parsearNumero(v);
  return p && !p.vacio ? p.valor : null;
};

const texto = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};

/**
 * Lee una fila como la devuelve la API del aplicativo (nombres de columna de
 * la base: periodo_normalizado, vehiculo_id, desc_fondo_conductor…) o como
 * sale de un Excel exportado con esos mismos nombres. Devuelve null y el
 * motivo cuando la fila no sirve.
 */
export function filaDesdeApi(r: Cruda, origen: string): { fila: FilaLovable } | { error: string } {
  // `Fecha_OK` y `Fechas` son las cabeceras del Excel original; las claves
  // distinguen mayúsculas, así que hay que nombrarlas tal cual.
  const periodo = normalizarPeriodo(r.periodo_normalizado ?? r.periodo ?? r.fecha_ok ?? r.Fecha_OK ?? r.Fechas);
  const vehiculo = normalizarVehiculo(r.vehiculo_id ?? r.vehiculo ?? r["VEHI."]);
  if (!periodo || !esPeriodoValido(periodo)) return { error: `período no válido (${String(r.periodo_normalizado ?? r.periodo ?? "")})` };
  if (!vehiculo || vehiculo === "0") return { error: "sin código de vehículo" };
  return {
    fila: {
      periodo,
      vehiculo,
      placa: texto(r.placa ?? r.PLACA),
      modelo: numOpt(r.modelo ?? r.MODELO),
      propietario: texto(r.propietario ?? r.PROPIETARIO),
      flota: r.flota != null || r.Flota != null ? normalizarFlota(r.flota ?? r.Flota) : null,
      viajes: num(r.viajes ?? r.VIAJES),
      timbradas: num(r.timbradas ?? r["TIM."]),
      ingresos: num(r.ingresos ?? r.Ingresos),
      fondo: num(r.fondo ?? r.FONDO),
      poliza: num(r.poliza ?? r.POLIZA),
      prestamo: num(r.prestamo ?? r["PRESTA."]),
      estudio: num(r.estudio ?? r["ESTUD."]),
      salario: num(r.salario ?? r.SALARIO),
      combustible: num(r.combustible ?? r.COMBS),
      rtica: num(r.rtica ?? r.RTICA),
      admon: num(r.admon ?? r.ADMON),
      sitra: num(r.sitra ?? r.SITRA),
      despacho: num(r.despacho ?? r.DESPACHO),
      intereses: num(r.intereses ?? r.INTERESES),
      otrosGastos: num(r.otros_gastos ?? r["OTROS GASTOS"]),
      repuestos: num(r.repuestos ?? r.Repuestos),
      manoDeObra: num(r.mano_de_obra ?? r["Mano de Obra"]),
      descFondoConductor: num(r.desc_fondo_conductor ?? r["Desc. Fondo - conductor"]),
      // El aplicativo no tenia estos conceptos como columna: lo que se
      // escribia a mano iba dentro de `combustible` y `poliza`. Nacen en cero
      // y los deduce `conceptosVehiculosNuevos()` comparando contra GEMA.
      combustibleVehiculosNuevos: 0,
      polizaVehiculosNuevos: 0,
      gastosOperativosTotales: numOpt(r.gastos_operativos_totales),
      utilidadNeta: numOpt(r.utilidad_neta),
      rentabilidad: numOpt(r.rentabilidad),
      gastosPorTimbrada: numOpt(r.gastos_por_timbrada),
      origen,
    },
  };
}

export interface LecturaHistorico {
  filas: FilaLovable[];
  rechazadas: { origen: string; motivo: string }[];
  /** Filas con la misma llave: el aplicativo ya las acumulaba al importar. */
  repetidas: number;
}

/**
 * Normaliza un lote de filas crudas y acumula las repetidas, igual que hacía
 * `parseExcelToFleetRecords` del aplicativo: misma llave período + vehículo,
 * se suman los rubros.
 */
export function leerHistorico(crudas: readonly Cruda[], origen = "api"): LecturaHistorico {
  const porLlave = new Map<string, FilaLovable>();
  const rechazadas: { origen: string; motivo: string }[] = [];
  let repetidas = 0;

  crudas.forEach((r, i) => {
    const res = filaDesdeApi(r, `${origen}#${i + 1}`);
    if ("error" in res) {
      rechazadas.push({ origen: `${origen}#${i + 1}`, motivo: res.error });
      return;
    }
    const f = res.fila;
    const llave = `${f.periodo}|${f.vehiculo}`;
    const previa = porLlave.get(llave);
    if (!previa) {
      porLlave.set(llave, f);
      return;
    }
    repetidas++;
    for (const k of [...COLUMNAS_COTEJO, "despacho", "intereses", "otrosGastos", "repuestos", "manoDeObra", "descFondoConductor"] as const) {
      previa[k] += f[k];
    }
    // Los indicadores guardados dejan de servir si se acumularon dos filas.
    previa.gastosOperativosTotales = null;
    previa.utilidadNeta = null;
    previa.rentabilidad = null;
    previa.gastosPorTimbrada = null;
  });

  const filas = [...porLlave.values()].sort(
    (a, b) => a.periodo.localeCompare(b.periodo) || a.vehiculo.localeCompare(b.vehiculo, "es", { numeric: true })
  );
  return { filas, rechazadas, repetidas };
}

// ── Salida: el archivo contable de la fase 4 ─────────────────────────────────

/** Una fila del archivo contable a partir de una del aplicativo. */
export function aFilaContable(f: FilaLovable): Record<string, string | number> {
  return {
    periodo: f.periodo,
    vehiculo: f.vehiculo,
    despacho: f.despacho,
    intereses: f.intereses,
    otros_gastos: f.otrosGastos,
    repuestos: f.repuestos,
    mano_de_obra: f.manoDeObra,
    desc_fondo_conductor: f.descFondoConductor,
    // El aplicativo no tenia estos dos conceptos: van en cero salvo que los
    // haya derivado `conceptosVehiculosNuevos()`.
    combustible_vehiculos_nuevos: f.combustibleVehiculosNuevos,
    poliza_vehiculos_nuevos: f.polizaVehiculosNuevos,
  };
}

/**
 * CSV con el contrato de la sección 6.6, listo para la pantalla de carga: `;`
 * como separador y punto decimal (el lector detecta el separador por la
 * cabecera y con `;` espera coma decimal, así que los números van enteros o
 * con coma).
 */
export function csvContable(filas: readonly FilaLovable[]): string {
  const cab = COLUMNAS_ARCHIVO.join(";");
  const lineas = filas.map((f) => {
    const c = aFilaContable(f);
    return COLUMNAS_ARCHIVO.map((k) => {
      const v = c[k];
      return typeof v === "number" ? String(v).replace(".", ",") : String(v);
    }).join(";");
  });
  return `﻿${[cab, ...lineas].join("\r\n")}\r\n`;
}

/** ¿Trae la fila algún rubro contable distinto de cero? */
export function tieneContable(f: FilaLovable): boolean {
  return gastosContables(f) !== 0 || f.repuestos !== 0 || f.descFondoConductor !== 0;
}

// ── Cotejo contra el consolidado de Gestivo ──────────────────────────────────

/** Una fila del consolidado, con lo que hace falta para cotejar. */
export interface FilaGestivo extends VehiculoMes {
  periodo: string;
  codigoVehiculo: string;
  tieneContable: boolean;
}

export interface DiferenciaColumna {
  columna: ColumnaCotejo | "utilidad_neta" | "rentabilidad" | "gastos_por_timbrada" | "gastos_operativos_totales";
  lovable: number;
  gestivo: number;
  diferencia: number;
}

export interface DiferenciaFila {
  periodo: string;
  vehiculo: string;
  /** solo_lovable: el aplicativo lo tenía y Gestivo no. solo_gestivo: al revés. */
  tipo: "difiere" | "solo_lovable" | "solo_gestivo";
  columnas: DiferenciaColumna[];
}

export interface ResumenCotejoPeriodo {
  periodo: string;
  vehiculosLovable: number;
  vehiculosGestivo: number;
  cuadran: number;
  difieren: number;
  soloLovable: number;
  soloGestivo: number;
  /** Cuántos vehículos-mes se pudieron cotejar en utilidad (exige contable en Gestivo). */
  cotejablesUtilidad: number;
  utilidadCuadra: number;
  /** Diferencia total de ingresos entre las dos herramientas, en pesos. */
  deltaIngresos: number;
}

export interface Cotejo {
  porPeriodo: ResumenCotejoPeriodo[];
  diferencias: DiferenciaFila[];
  /** Columnas que fallan más, para ver si el problema es sistemático. */
  porColumna: Record<string, number>;
  total: { cuadran: number; difieren: number; soloLovable: number; soloGestivo: number };
}

/**
 * Valor de Gestivo para una columna del cotejo.
 *
 * El aplicativo guardaba el combustible y la poliza de los vehiculos nuevos
 * dentro de las columnas «combustible» y «poliza», sumados a lo que reporta
 * GEMA. Gestivo los separa en dos conceptos contables propios, asi que para
 * cotejar hay que volver a sumarlos; si no, toda fila con ajuste manual
 * apareceria como diferencia aunque el total sea identico.
 */
function valorGestivo(g: FilaGestivo, c: ColumnaCotejo): number {
  if (c === "combustible") return g.combustible + g.combustibleVehiculosNuevos;
  if (c === "poliza") return g.poliza + g.polizaVehiculosNuevos;
  return g[c];
}

function tolerancia(col: string): number {
  if (col === "rentabilidad") return TOLERANCIA_COTEJO_RENTABILIDAD;
  if (col === "viajes" || col === "timbradas") return TOLERANCIA_COTEJO_COP;
  return TOLERANCIA_COTEJO_COP;
}

/**
 * Cruza las filas del aplicativo con las del consolidado.
 *
 * Compara siempre las doce medidas que Gestivo obtiene de GEMA: si esas
 * cuadran, las dos herramientas están mirando la misma operación. La utilidad
 * y la rentabilidad solo se comparan cuando Gestivo ya tiene los rubros
 * contables de esa fila; si no, se cuentan aparte como «no cotejables».
 */
export function cotejar(lovable: readonly FilaLovable[], gestivo: readonly FilaGestivo[]): Cotejo {
  const porLlaveG = new Map(gestivo.map((g) => [`${g.periodo}|${g.codigoVehiculo}`, g] as const));
  const porLlaveL = new Map(lovable.map((l) => [`${l.periodo}|${l.vehiculo}`, l] as const));
  const periodos = [...new Set([...lovable.map((l) => l.periodo), ...gestivo.map((g) => g.periodo)])].sort();

  const diferencias: DiferenciaFila[] = [];
  const porColumna: Record<string, number> = {};
  const porPeriodo: ResumenCotejoPeriodo[] = [];
  const total = { cuadran: 0, difieren: 0, soloLovable: 0, soloGestivo: 0 };

  for (const periodo of periodos) {
    const ls = lovable.filter((l) => l.periodo === periodo);
    const gs = gestivo.filter((g) => g.periodo === periodo);
    const r: ResumenCotejoPeriodo = {
      periodo,
      vehiculosLovable: ls.length,
      vehiculosGestivo: gs.length,
      cuadran: 0, difieren: 0, soloLovable: 0, soloGestivo: 0,
      cotejablesUtilidad: 0, utilidadCuadra: 0,
      deltaIngresos: 0,
    };

    for (const l of ls) {
      const g = porLlaveG.get(`${l.periodo}|${l.vehiculo}`);
      if (!g) {
        r.soloLovable++;
        total.soloLovable++;
        diferencias.push({ periodo, vehiculo: l.vehiculo, tipo: "solo_lovable", columnas: [] });
        continue;
      }
      r.deltaIngresos += l.ingresos - g.ingresos;

      const cols: DiferenciaColumna[] = [];
      for (const c of COLUMNAS_COTEJO) {
        const a = l[c];
        const b = valorGestivo(g, c);
        if (!cuadra(a, b, tolerancia(c))) {
          cols.push({ columna: c, lovable: a, gestivo: b, diferencia: a - b });
          porColumna[c] = (porColumna[c] ?? 0) + 1;
        }
      }

      // Utilidad: solo tiene sentido si Gestivo ya tiene los rubros contables.
      if (g.tieneContable && l.utilidadNeta != null) {
        r.cotejablesUtilidad++;
        const ind = indicadores(g);
        const okUtilidad = cuadra(l.utilidadNeta, ind.utilidadNeta, TOLERANCIA_COTEJO_COP);
        const okRent = l.rentabilidad == null || cuadra(l.rentabilidad, ind.rentabilidad, TOLERANCIA_COTEJO_RENTABILIDAD);
        if (okUtilidad && okRent) r.utilidadCuadra++;
        if (!okUtilidad) {
          cols.push({ columna: "utilidad_neta", lovable: l.utilidadNeta, gestivo: ind.utilidadNeta, diferencia: l.utilidadNeta - ind.utilidadNeta });
          porColumna.utilidad_neta = (porColumna.utilidad_neta ?? 0) + 1;
        }
        if (!okRent && l.rentabilidad != null) {
          cols.push({ columna: "rentabilidad", lovable: l.rentabilidad, gestivo: ind.rentabilidad, diferencia: l.rentabilidad - ind.rentabilidad });
          porColumna.rentabilidad = (porColumna.rentabilidad ?? 0) + 1;
        }
      }

      if (cols.length) {
        r.difieren++;
        total.difieren++;
        diferencias.push({ periodo, vehiculo: l.vehiculo, tipo: "difiere", columnas: cols });
      } else {
        r.cuadran++;
        total.cuadran++;
      }
    }

    for (const g of gs) {
      if (!porLlaveL.has(`${g.periodo}|${g.codigoVehiculo}`)) {
        r.soloGestivo++;
        total.soloGestivo++;
        diferencias.push({ periodo, vehiculo: g.codigoVehiculo, tipo: "solo_gestivo", columnas: [] });
      }
    }

    porPeriodo.push(r);
  }

  return { porPeriodo, diferencias, porColumna, total };
}

/**
 * El criterio de aceptación del punto 12: tres meses cerrados, el 100 % de los
 * vehículos-mes cuadrando en utilidad neta. Devuelve si se cumple y por qué no.
 */
export function veredictoParalela(c: Cotejo, mesesExigidos = 3): { acepta: boolean; motivos: string[] } {
  const motivos: string[] = [];
  const conDatos = c.porPeriodo.filter((p) => p.vehiculosLovable > 0);
  if (conDatos.length < mesesExigidos) {
    motivos.push(`Solo hay ${conDatos.length} meses con datos del aplicativo; el criterio pide ${mesesExigidos}.`);
  }
  if (c.total.difieren > 0) motivos.push(`${c.total.difieren} vehículo-mes difieren en alguna medida.`);
  if (c.total.soloLovable > 0) motivos.push(`${c.total.soloLovable} vehículo-mes están en el aplicativo y no en Gestivo.`);
  if (c.total.soloGestivo > 0) motivos.push(`${c.total.soloGestivo} vehículo-mes están en Gestivo y no en el aplicativo.`);
  const sinCotejar = conDatos.reduce((s, p) => s + (p.vehiculosLovable - p.cotejablesUtilidad), 0);
  if (sinCotejar > 0) {
    motivos.push(`${sinCotejar} vehículo-mes no se pudieron cotejar en utilidad: falta cargar sus rubros contables en Gestivo.`);
  }
  const utilidadMal = conDatos.reduce((s, p) => s + (p.cotejablesUtilidad - p.utilidadCuadra), 0);
  if (utilidadMal > 0) motivos.push(`${utilidadMal} vehículo-mes no cuadran en utilidad neta.`);
  return { acepta: motivos.length === 0, motivos };
}

// ── Conceptos de vehículos nuevos ────────────────────────────────────────────

/** Un ajuste manual del aplicativo que GEMA no reporta. */
export interface AjusteVehiculosNuevos {
  periodo: string;
  vehiculo: string;
  /** Lo que el aplicativo tenía en la columna. */
  lovable: number;
  /** Lo que GEMA reporta hoy. */
  gema: number;
  /** La diferencia que se va a cargar como concepto contable. */
  valor: number;
}

export interface ConceptosVehiculosNuevos {
  /** Las filas completas listas para `csvContable()`: los seis rubros de
   *  siempre más los dos conceptos nuevos. */
  filas: FilaLovable[];
  combustible: AjusteVehiculosNuevos[];
  poliza: AjusteVehiculosNuevos[];
  /** Casos donde GEMA reporta MÁS que el aplicativo: no son ajustes manuales
   *  y no se cargan; se listan para revisarlos a mano. */
  gemaMayor: (AjusteVehiculosNuevos & { columna: "combustible" | "poliza" })[];
  total: { combustible: number; poliza: number };
}

/**
 * Deriva los dos conceptos de vehículos nuevos comparando el aplicativo con
 * GEMA, vehículo-mes por vehículo-mes.
 *
 * El combustible y la póliza de los buses nuevos se escribían a mano en el
 * reporte de Lovable, dentro de las mismas columnas que alimenta GEMA. Aquí la
 * diferencia positiva entre las dos fuentes se convierte en el valor del
 * concepto, que es exactamente lo que hay que añadir para que la utilidad de
 * Gestivo vuelva a dar lo que daba el aplicativo.
 *
 * Una diferencia negativa (GEMA reporta más) no puede ser un ajuste manual, así
 * que no se carga: se devuelve aparte para mirarla a mano.
 */
export function conceptosVehiculosNuevos(
  lovable: readonly FilaLovable[],
  gestivo: readonly FilaGestivo[]
): ConceptosVehiculosNuevos {
  const porLlave = new Map(gestivo.map((g) => [`${g.periodo}|${g.codigoVehiculo}`, g] as const));
  const out: ConceptosVehiculosNuevos = {
    filas: [], combustible: [], poliza: [], gemaMayor: [],
    total: { combustible: 0, poliza: 0 },
  };

  for (const l of lovable) {
    const g = porLlave.get(`${l.periodo}|${l.vehiculo}`);
    if (!g) continue;

    const pares = [
      { columna: "combustible" as const, lov: l.combustible, gem: g.combustible },
      { columna: "poliza" as const, lov: l.poliza, gem: g.poliza },
    ];
    let combustible = 0;
    let poliza = 0;

    for (const p of pares) {
      if (cuadra(p.lov, p.gem, TOLERANCIA_COTEJO_COP)) continue;
      const a: AjusteVehiculosNuevos = {
        periodo: l.periodo, vehiculo: l.vehiculo,
        lovable: p.lov, gema: p.gem, valor: p.lov - p.gem,
      };
      if (a.valor < 0) {
        out.gemaMayor.push({ ...a, columna: p.columna });
        continue;
      }
      if (p.columna === "combustible") { combustible = a.valor; out.combustible.push(a); }
      else { poliza = a.valor; out.poliza.push(a); }
    }

    if (combustible === 0 && poliza === 0) continue;
    out.total.combustible += combustible;
    out.total.poliza += poliza;
    out.filas.push({ ...l, combustibleVehiculosNuevos: combustible, polizaVehiculosNuevos: poliza });
  }

  out.filas.sort((a, b) => a.periodo.localeCompare(b.periodo) || a.vehiculo.localeCompare(b.vehiculo, "es", { numeric: true }));
  return out;
}
