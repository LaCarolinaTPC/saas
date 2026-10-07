/** Datos compactos y cálculos puros de la comparación libre de períodos. */
import { RUBROS_CONTABLES, RUBROS_GEMA, type RubrosContables, type RubrosGema } from "./motor";

export type ClaveConcepto = keyof RubrosContables | keyof RubrosGema;
export type ConceptosFila = Record<ClaveConcepto, number>;

export interface Concepto {
  clave: ClaveConcepto;
  etiqueta: string;
  grupo: "contable" | "gema";
  /** -1 cuando el concepto se resta del gasto (desc. fondo-conductor). */
  signo: 1 | -1;
}

/**
 * Los conceptos del gasto en el orden del archivo contable y luego los de
 * GEMA. Sumados con su signo dan `gastosOperativosTotales` del motor.
 */
export const CONCEPTOS: readonly Concepto[] = [
  { clave: "despacho", etiqueta: "Despacho", grupo: "contable", signo: 1 },
  { clave: "intereses", etiqueta: "Intereses", grupo: "contable", signo: 1 },
  { clave: "otrosGastos", etiqueta: "Otros gastos", grupo: "contable", signo: 1 },
  { clave: "repuestos", etiqueta: "Repuestos", grupo: "contable", signo: 1 },
  { clave: "descFondoConductor", etiqueta: "Desc. fondo-conductor (se resta)", grupo: "contable", signo: -1 },
  { clave: "manoDeObra", etiqueta: "Mano de obra", grupo: "contable", signo: 1 },
  { clave: "combustibleVehiculosNuevos", etiqueta: "Combustible vehículos nuevos", grupo: "contable", signo: 1 },
  { clave: "polizaVehiculosNuevos", etiqueta: "Póliza vehículos nuevos", grupo: "contable", signo: 1 },
  { clave: "fondo", etiqueta: "Fondo", grupo: "gema", signo: 1 },
  { clave: "poliza", etiqueta: "Póliza", grupo: "gema", signo: 1 },
  { clave: "prestamo", etiqueta: "Préstamo", grupo: "gema", signo: 1 },
  { clave: "estudio", etiqueta: "Estudio", grupo: "gema", signo: 1 },
  { clave: "salario", etiqueta: "Salario", grupo: "gema", signo: 1 },
  { clave: "combustible", etiqueta: "Combustible", grupo: "gema", signo: 1 },
  { clave: "rtica", etiqueta: "Rtica", grupo: "gema", signo: 1 },
  { clave: "admon", etiqueta: "Admón", grupo: "gema", signo: 1 },
  { clave: "sitra", etiqueta: "Sitra", grupo: "gema", signo: 1 },
];

// Si el motor gana un rubro, esta lista debe nombrarlo o el total no cuadra.
if (CONCEPTOS.length !== RUBROS_CONTABLES.length + RUBROS_GEMA.length) {
  throw new Error("CONCEPTOS no cubre todos los rubros del motor");
}

export interface FilaComparacion {
  periodo: string;
  codigo: string;
  placa: string | null;
  flotas: string[];
  marca: string | null;
  /** `tipo` es la flota del dueño en ese mes (EMPRESA, AFILIADO…); null si no se sabe. */
  propietarios: { cedula: string; nombre: string; tipo: string | null }[];
  ingresos: number;
  gastosFinancieros: number;
  gastosOperativos: number;
  tieneContable: boolean;
  conceptos: ConceptosFila;
}

export type VistaComparacion = "financiero" | "operativa";
export type ModoComparacion = "acumulado" | "mensual";
export interface CorteComparacion { anio: number; mes: number }

export interface ResumenComparacion {
  vehiculos: number;
  registros: number;
  ingresos: number;
  gastos: number;
  utilidad: number;
  rentabilidad: number;
  completo: boolean;
}

export interface VehiculoComparado {
  codigo: string;
  placa: string | null;
  utilidad1: number;
  rentabilidad1: number;
  utilidad2: number;
  rentabilidad2: number;
  diferencia: number;
  completo1: boolean;
  completo2: boolean;
  presente1: boolean;
  presente2: boolean;
}

// ── Filtros en cascada Flota → Marca → Propietario ───────────────────────────
// Misma regla que `opcionesFiltro` de analisis.ts en las demás pantallas: cada
// lista solo ofrece lo que existe con los filtros de arriba, y con una flota
// elegida un bus de dueños mixtos solo aporta los dueños de esa flota.

export interface FiltrosComparacion {
  flota: string;
  marca: string;
  propietario: string;
}

export interface OpcionesComparacion {
  flotas: string[];
  marcas: string[];
  /** [cédula, «cédula — nombre»], ordenados por la etiqueta. */
  propietarios: [string, string][];
}

/** Dueños de la fila que pertenecen a la flota elegida (todos si no hay flota). */
export function duenosDeLaFlota(fila: FilaComparacion, flota: string): FilaComparacion["propietarios"] {
  if (!flota) return fila.propietarios;
  return fila.propietarios.filter((d) => (d.tipo ? d.tipo === flota : fila.flotas.includes(flota)));
}

export function opcionesComparacion(datos: readonly FilaComparacion[], f: Pick<FiltrosComparacion, "flota" | "marca">): OpcionesComparacion {
  const flotas = new Set<string>();
  const marcas = new Set<string>();
  const propietarios = new Map<string, string>();
  for (const fila of datos) {
    for (const t of fila.flotas) flotas.add(t);
    if (f.flota && !fila.flotas.includes(f.flota)) continue;
    if (fila.marca) marcas.add(fila.marca);
    if (f.marca && fila.marca !== f.marca) continue;
    for (const d of duenosDeLaFlota(fila, f.flota)) propietarios.set(d.cedula, `${d.cedula} — ${d.nombre}`);
  }
  return {
    flotas: [...flotas].sort(),
    marcas: [...marcas].sort(),
    propietarios: [...propietarios].sort((a, b) => a[1].localeCompare(b[1], "es", { numeric: true })),
  };
}

/**
 * Deja solo los valores que siguen existiendo con los filtros de arriba: un
 * propietario sin buses de la marca elegida no puede quedar filtrando a
 * escondidas y dejar la pantalla vacía.
 */
export function filtrosVigentes(datos: readonly FilaComparacion[], f: FiltrosComparacion): FiltrosComparacion {
  const flota = opcionesComparacion(datos, { flota: "", marca: "" }).flotas.includes(f.flota) ? f.flota : "";
  const marca = opcionesComparacion(datos, { flota, marca: "" }).marcas.includes(f.marca) ? f.marca : "";
  const propietario = opcionesComparacion(datos, { flota, marca }).propietarios.some(([c]) => c === f.propietario) ? f.propietario : "";
  return { flota, marca, propietario };
}

export function filtrarComparacion(datos: readonly FilaComparacion[], f: FiltrosComparacion): FilaComparacion[] {
  return datos.filter(
    (fila) =>
      (!f.flota || fila.flotas.includes(f.flota)) &&
      (!f.marca || fila.marca === f.marca) &&
      (!f.propietario || duenosDeLaFlota(fila, f.flota).some((d) => d.cedula === f.propietario))
  );
}

export function filasDelCorte(filas: readonly FilaComparacion[], modo: ModoComparacion, corte: CorteComparacion): FilaComparacion[] {
  const inicio = `${corte.anio}-01`;
  const fin = `${corte.anio}-${String(corte.mes).padStart(2, "0")}`;
  return filas.filter((fila) => modo === "mensual" ? fila.periodo === fin : fila.periodo >= inicio && fila.periodo <= fin);
}

export function resumirComparacion(filas: readonly FilaComparacion[], vista: VistaComparacion): ResumenComparacion {
  const ingresos = filas.reduce((total, fila) => total + fila.ingresos, 0);
  const gastos = filas.reduce((total, fila) => total + (vista === "financiero" ? fila.gastosFinancieros : fila.gastosOperativos), 0);
  const utilidad = ingresos - gastos;
  return {
    vehiculos: new Set(filas.map((fila) => fila.codigo)).size,
    registros: filas.length,
    ingresos,
    gastos,
    utilidad,
    rentabilidad: ingresos > 0 ? utilidad / ingresos * 100 : 0,
    completo: filas.every((fila) => fila.tieneContable),
  };
}

export interface ConceptoComparado extends Concepto {
  /** Suma del período con el signo del concepto (el descuento sale negativo). */
  valor1: number;
  valor2: number;
  diferencia: number;
  /** null cuando la base es cero. */
  variacion: number | null;
}

export interface DetalleConceptos {
  conceptos: ConceptoComparado[];
  subtotales: Record<Concepto["grupo"], { valor1: number; valor2: number }>;
  total: { valor1: number; valor2: number };
  /** Vehículos del período y cuántos de ellos tienen archivo contable cargado. */
  archivo1: { vehiculos: number; conArchivo: number };
  archivo2: { vehiculos: number; conArchivo: number };
}

/**
 * Detalle por concepto de los dos períodos. En la vista operativa se omite
 * `intereses`, el único rubro financiero, igual que en `resumirComparacion`:
 * así el total coincide con los gastos del resumen.
 */
export function detalleConceptos(base: readonly FilaComparacion[], comparacion: readonly FilaComparacion[], vista: VistaComparacion): DetalleConceptos {
  const lista = CONCEPTOS.filter((c) => vista === "financiero" || c.clave !== "intereses");
  const sumar = (filas: readonly FilaComparacion[], c: Concepto) => c.signo * filas.reduce((t, f) => t + f.conceptos[c.clave], 0);
  const conceptos = lista.map((c) => {
    const valor1 = sumar(base, c);
    const valor2 = sumar(comparacion, c);
    return { ...c, valor1, valor2, diferencia: valor2 - valor1, variacion: valor1 !== 0 ? (valor2 - valor1) / Math.abs(valor1) * 100 : null };
  });
  const subtotal = (grupo: Concepto["grupo"]) => conceptos.filter((c) => c.grupo === grupo).reduce(
    (t, c) => ({ valor1: t.valor1 + c.valor1, valor2: t.valor2 + c.valor2 }), { valor1: 0, valor2: 0 },
  );
  const contable = subtotal("contable");
  const gema = subtotal("gema");
  const archivo = (filas: readonly FilaComparacion[]) => {
    const porVehiculo = new Map<string, boolean>();
    for (const f of filas) porVehiculo.set(f.codigo, (porVehiculo.get(f.codigo) ?? true) && f.tieneContable);
    return { vehiculos: porVehiculo.size, conArchivo: [...porVehiculo.values()].filter(Boolean).length };
  };
  return {
    conceptos,
    subtotales: { contable, gema },
    total: { valor1: contable.valor1 + gema.valor1, valor2: contable.valor2 + gema.valor2 },
    archivo1: archivo(base),
    archivo2: archivo(comparacion),
  };
}

export function compararVehiculos(base: readonly FilaComparacion[], comparacion: readonly FilaComparacion[], vista: VistaComparacion): VehiculoComparado[] {
  const agrupar = (filas: readonly FilaComparacion[]) => {
    const grupos = new Map<string, FilaComparacion[]>();
    for (const fila of filas) {
      const grupo = grupos.get(fila.codigo) ?? [];
      grupo.push(fila);
      grupos.set(fila.codigo, grupo);
    }
    return grupos;
  };
  const primero = agrupar(base);
  const segundo = agrupar(comparacion);
  const codigos = [...new Set([...primero.keys(), ...segundo.keys()])].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  return codigos.map((codigo) => {
    const filas1 = primero.get(codigo) ?? [];
    const filas2 = segundo.get(codigo) ?? [];
    const r1 = resumirComparacion(filas1, vista);
    const r2 = resumirComparacion(filas2, vista);
    return {
      codigo,
      placa: filas2.at(-1)?.placa ?? filas1.at(-1)?.placa ?? null,
      utilidad1: r1.utilidad,
      rentabilidad1: r1.rentabilidad,
      utilidad2: r2.utilidad,
      rentabilidad2: r2.rentabilidad,
      diferencia: r2.utilidad - r1.utilidad,
      completo1: r1.completo,
      completo2: r2.completo,
      presente1: filas1.length > 0,
      presente2: filas2.length > 0,
    };
  });
}
