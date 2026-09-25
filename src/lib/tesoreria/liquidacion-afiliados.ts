/**
 * Liquidación de afiliados en el formato del reporte GEMA GAF-R-12
 * ("Reporte de liquidación tercero"). Módulo puro: la pantalla, el PDF y el
 * Excel reciben las mismas filas de ingreso_tercero y calculan aquí.
 *
 * Correspondencia con las columnas del PDF, verificada al peso el 2026-09-25
 * contra el reporte del propietario 91066003 (vehículos 501, 552 y 794):
 *   Despacho = cartu_admon · Anticipo = salario · Admon = admon (2,5 % del
 *   bruto) · Deducciones cartulina = total_cartulina (despacho + estudio +
 *   fondo + préstamo, SIN póliza). El total de deducciones del reporte sí
 *   incluye la póliza y además el pago de obligaciones, que es el campo
 *   "descuentos otros" de GEMA (ingreso_tercero.descuentos_otros, desde la
 *   migración 20260925213418). Producido neto = bruto − total deducciones.
 *   Los días sincronizados antes de esa columna la traen en NULL: ahí no hay
 *   dato de obligaciones y se llega solo al líquido.
 */

export interface FilaTercero {
  fecha: string;
  tipo_cierre: string | null;
  ruta: string | null;
  codigo_vehiculo: string;
  placa: string | null;
  cedula_conductor: string | null;
  codigo_conductor: string | null;
  conductor_nombre: string | null;
  cedula_propietario: string;
  propietario_nombre: string | null;
  tipo_propietario: string | null;
  viajes: number | null;
  timbradas: number | null;
  timbradas_cu: number | null;
  bruto: number | null;
  total_cartulina: number | null;
  cartu_admon: number | null;
  cartu_estudio: number | null;
  cartu_fondo: number | null;
  cartu_poliza: number | null;
  cartu_presta: number | null;
  salario: number | null;
  factura: number | null;
  incentivo_c: number | null;
  combustible: number | null;
  sitra: number | null;
  rtica: number | null;
  admon: number | null;
  liquido: number | null;
  /** Pago de obligaciones ("descuentos otros" de GEMA). NULL = sin dato. */
  descuentos_otros: number | null;
}

export const TERCERO_SELECT =
  "fecha, tipo_cierre, ruta, codigo_vehiculo, placa, cedula_conductor, codigo_conductor, conductor_nombre, " +
  "cedula_propietario, propietario_nombre, tipo_propietario, viajes, timbradas, timbradas_cu, bruto, " +
  "total_cartulina, cartu_admon, cartu_estudio, cartu_fondo, cartu_poliza, cartu_presta, salario, factura, " +
  "incentivo_c, combustible, sitra, rtica, admon, liquido, descuentos_otros";

/** Campos numéricos que se suman, en el orden de las columnas del GAF-R-12. */
export const CAMPOS_MONTO = [
  "viajes", "timbradas", "timbradas_cu", "bruto", "cartu_admon", "cartu_estudio", "cartu_fondo",
  "cartu_poliza", "cartu_presta", "salario", "incentivo_c", "sitra", "combustible", "rtica", "admon",
  "liquido", "total_cartulina", "factura", "descuentos_otros",
] as const;
export type CampoMonto = (typeof CAMPOS_MONTO)[number];
export type Montos = Record<CampoMonto, number>;

export type FormatoColumna = "entero" | "decimal" | "pesos";

/** Columnas de la tabla diaria, como en el reporte de GEMA. */
export const COLUMNAS_DIA: { campo: CampoMonto; titulo: string; formato: FormatoColumna }[] = [
  { campo: "viajes", titulo: "Viajes", formato: "entero" },
  { campo: "timbradas", titulo: "Timb IND", formato: "entero" },
  { campo: "timbradas_cu", titulo: "Timb CU", formato: "decimal" },
  { campo: "bruto", titulo: "Bruto", formato: "pesos" },
  { campo: "cartu_admon", titulo: "Despacho", formato: "pesos" },
  { campo: "cartu_estudio", titulo: "Estudio", formato: "pesos" },
  { campo: "cartu_fondo", titulo: "Fondo", formato: "pesos" },
  { campo: "cartu_poliza", titulo: "Póliza", formato: "pesos" },
  { campo: "cartu_presta", titulo: "Presta.", formato: "pesos" },
  { campo: "salario", titulo: "Anticipo", formato: "pesos" },
  { campo: "incentivo_c", titulo: "Incentivo C", formato: "pesos" },
  { campo: "sitra", titulo: "Sitra", formato: "pesos" },
  { campo: "combustible", titulo: "Combs", formato: "pesos" },
  { campo: "rtica", titulo: "Rtica", formato: "pesos" },
  { campo: "admon", titulo: "Admon", formato: "pesos" },
  { campo: "liquido", titulo: "Líquido", formato: "pesos" },
];

const cero = (): Montos => Object.fromEntries(CAMPOS_MONTO.map((c) => [c, 0])) as Montos;

export function sumar(filas: FilaTercero[]): Montos {
  const t = cero();
  for (const f of filas) for (const c of CAMPOS_MONTO) t[c] += Number(f[c] ?? 0);
  return t;
}

/**
 * GEMA puede devolver la misma operación en cierre INDIVIDUAL y en CU (pasó
 * el 2026-07-26 con 150 cierres). El reporte de GEMA conserva CU. Misma regla
 * que financiera_consolidar_periodo (migración 20260924203018): se descarta
 * el INDIVIDUAL cuando hay un CU del mismo día, vehículo, conductor,
 * propietario, ruta, viajes y timbradas.
 */
export function excluirIndividualDuplicado(filas: FilaTercero[]): FilaTercero[] {
  const llave = (f: FilaTercero) =>
    [f.fecha, f.codigo_vehiculo, f.cedula_conductor ?? "", f.cedula_propietario ?? "", f.ruta ?? "",
      Number(f.viajes ?? 0), Number(f.timbradas ?? 0)].join("|");
  const conCu = new Set(filas.filter((f) => (f.tipo_cierre ?? "").startsWith("CU (")).map(llave));
  return filas.filter((f) => !((f.tipo_cierre ?? "") === "INDIVIDUAL" && conCu.has(llave(f))));
}

/** "CU (RUTAS,GRUPOS,PROM)" → "CU/RGP", como lo imprime GEMA; "INDIVIDUAL" → "IND". */
export function prefijoCierre(tipo: string | null): string {
  const t = (tipo ?? "").trim();
  const cu = t.match(/^CU\s*\(([^)]*)\)/i);
  if (cu) return `CU/${cu[1].split(",").map((p) => p.trim().charAt(0).toUpperCase()).join("")}`;
  if (/^INDIVIDUAL/i.test(t)) return "IND";
  return t.split(/\s+/)[0]?.slice(0, 8) || "—";
}

export interface ResumenDeducciones {
  /** Base de liquidación = bruto. */
  base: number;
  cartulina: number;
  poliza: number;
  anticipo: number;
  facturas: number;
  sitra: number;
  combustible: number;
  rtica: number;
  admon: number;
  incentivo: number;
  /** Pago de obligaciones; null si ningún día del rango trae el dato. */
  obligaciones: number | null;
  /** Hay días con dato y días sin él: la cifra de obligaciones está incompleta. */
  obligacionesParciales: boolean;
  /** Todas las deducciones, incluidas las obligaciones cuando hay dato. */
  totalDeducciones: number;
  /** Líquido de GEMA: lo que queda antes de las obligaciones. */
  liquido: number;
  /** Bruto − total deducciones, como el GAF-R-12; null sin dato de obligaciones. */
  producidoNeto: number | null;
}

const peso = (n: number) => Math.round(n);

/** Cuántas filas traen el dato de obligaciones. */
export interface CoberturaObligaciones {
  conDato: number;
  total: number;
}

export function coberturaObligaciones(filas: FilaTercero[]): CoberturaObligaciones {
  return { conDato: filas.filter((f) => f.descuentos_otros !== null && f.descuentos_otros !== undefined).length, total: filas.length };
}

/**
 * Recuadro "Detalles deducciones" del reporte, a partir de los totales. Sin
 * `cobertura` (o sin ninguna fila con dato) no hay obligaciones: el total de
 * deducciones las omite y no hay producido neto.
 */
export function resumenDeducciones(t: Montos, cobertura?: CoberturaObligaciones): ResumenDeducciones {
  const r = {
    base: peso(t.bruto),
    cartulina: peso(t.total_cartulina),
    poliza: peso(t.cartu_poliza),
    anticipo: peso(t.salario),
    facturas: peso(t.factura),
    sitra: peso(t.sitra),
    combustible: peso(t.combustible),
    rtica: peso(t.rtica),
    admon: peso(t.admon),
    incentivo: peso(t.incentivo_c),
    liquido: peso(t.liquido),
  };
  const conDato = !!cobertura && cobertura.conDato > 0;
  const obligaciones = conDato ? peso(t.descuentos_otros) : null;
  const totalDeducciones =
    r.cartulina + r.poliza + r.anticipo + r.facturas + r.sitra + r.combustible + r.rtica + r.admon + r.incentivo +
    (obligaciones ?? 0);
  return {
    ...r,
    obligaciones,
    obligacionesParciales: conDato && cobertura!.conDato < cobertura!.total,
    totalDeducciones,
    producidoNeto: obligaciones === null ? null : r.base - totalDeducciones,
  };
}

/** Líneas del recuadro de deducciones, en el orden del reporte (la póliza, explícita). */
export function lineasDeducciones(r: ResumenDeducciones): { etiqueta: string; valor: number; nota?: string }[] {
  return [
    { etiqueta: "Deducciones cartulina", valor: r.cartulina, nota: "Despacho, estudio, fondo y préstamo" },
    { etiqueta: "Póliza", valor: r.poliza, nota: "GEMA la suma en el total de deducciones sin listarla aparte" },
    { etiqueta: "Anticipo", valor: r.anticipo },
    { etiqueta: "Facturas", valor: r.facturas },
    { etiqueta: "Sitra", valor: r.sitra },
    { etiqueta: "Combustible", valor: r.combustible },
    { etiqueta: "Rtica", valor: r.rtica },
    { etiqueta: "Admon empresa", valor: r.admon },
    { etiqueta: "Incentivo cond.", valor: r.incentivo },
  ];
}

/** El valor final: producido neto si hay dato de obligaciones; si no, el líquido de GEMA. */
export function valorNeto(r: ResumenDeducciones): number {
  return r.producidoNeto ?? r.liquido;
}
export function etiquetaNeto(r: ResumenDeducciones): string {
  return r.producidoNeto === null ? "Líquido antes de obligaciones" : "Producido neto";
}

/** Descuentos otros día por día (solo los que tienen valor), como el recuadro del GAF-R-12. */
export function detalleObligaciones(filas: FilaTercero[]): { fecha: string; valor: number }[] {
  const porDia = new Map<string, number>();
  for (const f of filas) {
    const v = Number(f.descuentos_otros ?? 0);
    if (v !== 0) porDia.set(f.fecha, (porDia.get(f.fecha) ?? 0) + v);
  }
  return [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, valor]) => ({ fecha, valor: peso(valor) }));
}

export interface VehiculoLiquidado {
  codigo: string;
  placa: string | null;
  filas: FilaTercero[];
  total: Montos;
  resumen: ResumenDeducciones;
  dias: number;
}

export interface LiquidacionAfiliado {
  cedula: string;
  nombre: string | null;
  vehiculos: VehiculoLiquidado[];
  total: Montos;
  resumen: ResumenDeducciones;
}

const porCodigo = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

/** Liquidación de UN propietario: una tarjeta por vehículo, días en orden. */
export function liquidar(cedula: string, filas: FilaTercero[]): LiquidacionAfiliado {
  const propias = excluirIndividualDuplicado(filas.filter((f) => f.cedula_propietario === cedula));
  const porVehiculo = new Map<string, FilaTercero[]>();
  for (const f of propias) {
    const l = porVehiculo.get(f.codigo_vehiculo);
    if (l) l.push(f);
    else porVehiculo.set(f.codigo_vehiculo, [f]);
  }
  const vehiculos = [...porVehiculo.entries()]
    .sort(([a], [b]) => porCodigo(a, b))
    .map(([codigo, fs]) => {
      const ordenadas = [...fs].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.ruta ?? "").localeCompare(b.ruta ?? ""));
      const total = sumar(ordenadas);
      return {
        codigo,
        placa: ordenadas[ordenadas.length - 1]?.placa ?? null,
        filas: ordenadas,
        total,
        resumen: resumenDeducciones(total, coberturaObligaciones(ordenadas)),
        dias: new Set(ordenadas.map((f) => f.fecha)).size,
      };
    });
  const total = sumar(propias);
  const ultima = [...propias].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  return {
    cedula, nombre: ultima?.propietario_nombre ?? null, vehiculos, total,
    resumen: resumenDeducciones(total, coberturaObligaciones(propias)),
  };
}

export interface FilaResumenAfiliado {
  cedula: string;
  nombre: string | null;
  vehiculos: string[];
  dias: number;
  viajes: number;
  resumen: ResumenDeducciones;
}

/** Totales por propietario para la vista general, ordenados por nombre. */
export function resumenPorAfiliado(filas: FilaTercero[]): FilaResumenAfiliado[] {
  const limpias = excluirIndividualDuplicado(filas);
  const grupos = new Map<string, FilaTercero[]>();
  for (const f of limpias) {
    const l = grupos.get(f.cedula_propietario);
    if (l) l.push(f);
    else grupos.set(f.cedula_propietario, [f]);
  }
  return [...grupos.entries()]
    .map(([cedula, fs]) => {
      const total = sumar(fs);
      const ultima = [...fs].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
      return {
        cedula,
        nombre: ultima?.propietario_nombre ?? null,
        vehiculos: [...new Set(fs.map((f) => f.codigo_vehiculo))].sort(porCodigo),
        dias: new Set(fs.map((f) => `${f.codigo_vehiculo}|${f.fecha}`)).size,
        viajes: total.viajes,
        resumen: resumenDeducciones(total, coberturaObligaciones(fs)),
      };
    })
    .sort((a, b) => (a.nombre ?? a.cedula).localeCompare(b.nombre ?? b.cedula, "es"));
}

/**
 * Universo del módulo (decisión de Tesorería, 2026-09-25): el cierre debe
 * venir como AFILIADO en ingreso_tercero Y el vehículo debe ser AFILIADO en
 * la operación (vehiculos.tipo_propietario_op). El segundo dato es el del
 * maestro HOY, no el de cada día: GEMA no guarda su historia.
 */
export function esDeAfiliado(f: Pick<FilaTercero, "tipo_propietario" | "codigo_vehiculo">, vehiculosAfiliados: Set<string>): boolean {
  return f.tipo_propietario === "AFILIADO" && vehiculosAfiliados.has(f.codigo_vehiculo);
}
