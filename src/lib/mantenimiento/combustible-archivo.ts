/**
 * Archivo diario de combustible del proveedor — lectura y validación, funciones puras.
 *
 * Petromil (S.S Petromil Terminal de Transporte) manda un Excel por día con los
 * tanqueos de la flota. Formato habitual, con cinco filas de título encima:
 *
 *   Fecha | Factura | # Interno | Placa | Producto | Volumen | Total
 *
 * Variantes vistas en los 1.380 archivos de 2023 a 2026 (revisados el 2026-10-14):
 *   - el export crudo del surtidor: Fecha | Factura | Surtidor | Precio |
 *     Cantidad | Total Dinero | Nombre - Cliente… | Placa…, sin número interno;
 *   - copias de Mantenimiento con «Cantidad», «Dinero» o «Total Dinero» y el
 *     interno escrito «interno», «numero interno», «intero»;
 *   - dos hojas con los mismos tanqueos (la del proveedor y una ordenada por
 *     interno), y una fila de totales al final.
 *
 * Reglas que este archivo fija:
 *   - la llave de un tanqueo es factura + fecha + hora + número interno
 *     (`llaveTanqueo`); dentro del archivo las filas con la misma llave se
 *     juntan y gana la primera;
 *   - si una hoja no trae número interno, sus tanqueos solo entran cuando
 *     ninguna hoja con interno trae la misma factura a la misma hora, y el
 *     interno sale de la placa en el maestro (alerta interno_por_placa);
 *   - el número interno se guarda como lo trae el archivo: no se corrige por la
 *     placa, se marca (vehiculo_no_existe, placa_distinta);
 *   - sin fecha en la fila se usa la del nombre del archivo, sin hora (sin_hora);
 *   - no se leen las columnas de nombre y documento del cliente.
 */
import * as XLSX from "xlsx";
import { normalizarEncabezado, normalizarVehiculo, parsearNumero } from "@/lib/financiera/archivo-contable";
import { ALERTAS_COMBUSTIBLE, GALONES_ALTO, type AlertaCombustible } from "./combustible-alertas";

// ── Tipos ────────────────────────────────────────────────────────────────────

export { ALERTAS_COMBUSTIBLE, ALERTA_COMBUSTIBLE_LABEL, GALONES_ALTO, type AlertaCombustible } from "./combustible-alertas";

/** Diferencia contra el precio mediano del archivo que dispara precio_distinto. */
export const TOLERANCIA_PRECIO = 0.01;
/** Primer año que acepta la carga. */
const ANIO_MINIMO = 2020;

export interface Tanqueo {
  llave: string;
  fecha: string;
  /** HH:MM:SS de Colombia; null si el archivo no la traía. */
  hora: string | null;
  factura: string;
  vehiculoCodigo: string;
  placa: string | null;
  producto: string | null;
  galones: number;
  valor: number;
  alertas: AlertaCombustible[];
  hoja: string;
  /** Fila de Excel (1 = primera fila de la hoja). */
  linea: number;
}

export interface FilaRechazada {
  hoja: string;
  linea: number;
  factura: string | null;
  motivo: string;
}

export interface LecturaCombustible {
  /** Si viene, el archivo entero se rechaza y `tanqueos` está vacío. */
  errorArchivo: string | null;
  tanqueos: Tanqueo[];
  rechazadas: FilaRechazada[];
  /** Hechos del archivo que no bloquean la carga (hojas omitidas, repetidos con otro valor). */
  avisos: string[];
  /** Filas con tanqueo en todas las hojas, antes de juntar repetidas. */
  filasArchivo: number;
  /** Fecha del nombre del archivo (AAAA-MM-DD) o null. */
  fechaNombre: string | null;
}

/** Maestro de vehículos (tabla vehiculos), normalizado. */
export interface MaestroVehiculos {
  placaPorCodigo: Map<string, string | null>;
  codigoPorPlaca: Map<string, string>;
}

export function crearMaestro(vehiculos: { codigo: string; placa: string | null }[]): MaestroVehiculos {
  const placaPorCodigo = new Map<string, string | null>();
  const codigoPorPlaca = new Map<string, string>();
  for (const v of vehiculos) {
    const codigo = normalizarVehiculo(v.codigo);
    if (!codigo) continue;
    const placa = normalizarPlaca(v.placa);
    placaPorCodigo.set(codigo, placa);
    if (placa) codigoPorPlaca.set(placa, codigo);
  }
  return { placaPorCodigo, codigoPorPlaca };
}

// ── Normalización ────────────────────────────────────────────────────────────

export function normalizarPlaca(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s || null;
}

/** Factura como texto: 196811, "196811", "196811.0" → "196811". */
export function normalizarFactura(v: unknown): string | null {
  if (v == null) return null;
  const s = (typeof v === "number" ? String(Math.trunc(v)) : String(v).trim())
    .replace(/\.0+$/, "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return s || null;
}

export function llaveTanqueo(t: { factura: string; fecha: string; hora: string | null; vehiculoCodigo: string }): string {
  return `${t.factura}|${t.fecha}|${t.hora ?? ""}|${t.vehiculoCodigo}`;
}

const dos = (n: number) => String(n).padStart(2, "0");

/**
 * Fecha y hora de una celda: serial de Excel, Date o texto (DD/MM/AAAA o
 * AAAA-MM-DD, con hora opcional). El serial se convierte a mano y no con la
 * zona del proceso: el archivo trae la hora de Colombia tal cual.
 */
export function leerFechaHora(v: unknown): { fecha: string; hora: string | null } | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    if (!(v > 20000 && v < 80000)) return null;
    let dias = Math.floor(v);
    let segundos = Math.round((v - dias) * 86400);
    if (segundos >= 86400) { dias += 1; segundos -= 86400; }
    const d = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
    const fecha = `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
    const hora = `${dos(Math.floor(segundos / 3600))}:${dos(Math.floor((segundos % 3600) / 60))}:${dos(segundos % 60)}`;
    return { fecha, hora };
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return {
      fecha: `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`,
      hora: `${dos(v.getHours())}:${dos(v.getMinutes())}:${dos(v.getSeconds())}`,
    };
  }
  const s = String(v).trim().toLowerCase();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?)?$/);
  let anio: number, mes: number, dia: number;
  let hh: number | null = null, mi = 0, ss = 0;
  if (m) {
    [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4] != null) {
      hh = Number(m[4]); mi = Number(m[5]); ss = Number(m[6] ?? 0);
      if (m[7] === "p" && hh < 12) hh += 12;
      if (m[7] === "a" && hh === 12) hh = 0;
    }
  } else {
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[t\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4] != null) { hh = Number(m[4]); mi = Number(m[5]); ss = Number(m[6] ?? 0); }
  }
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  if (hh != null && (hh > 23 || mi > 59 || ss > 59)) return null;
  return { fecha: `${anio}-${dos(mes)}-${dos(dia)}`, hora: hh == null ? null : `${dos(hh)}:${dos(mi)}:${dos(ss)}` };
}

const MESES: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8,
  SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
};

/** «13 DE OCTUBRE DEL 2026 CARO COMBUST.xlsx» → 2026-10-13. Sin año → null. */
export function fechaDelNombre(nombre: string): string | null {
  const s = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const m = s.match(/(\d{1,2})\s*(?:DE\s+)?(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s*(?:(?:DE|DEL)\s+)?(\d{4})/);
  if (!m) return null;
  const r = leerFechaHora(`${m[1]}/${MESES[m[2]]}/${m[3]}`);
  return r?.fecha ?? null;
}

// ── Encabezado ───────────────────────────────────────────────────────────────

type Columna = "fecha" | "factura" | "interno" | "placa" | "producto" | "galones" | "valor";

const ALIAS: Record<string, Columna> = {
  fecha: "fecha",
  factura: "factura",
  interno: "interno",
  numero_interno: "interno",
  no_interno: "interno",
  n_interno: "interno",
  intero: "interno",
  placa: "placa",
  producto: "producto",
  volumen: "galones",
  cantidad: "galones",
  galones: "galones",
  total: "valor",
  total_dinero: "valor",
  dinero: "valor",
  valor: "valor",
};

/** Busca la cabecera en las primeras filas: la que trae «Factura» y la cantidad. */
export function encontrarEncabezado(filas: unknown[][]): { fila: number; indices: Partial<Record<Columna, number>> } | null {
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const indices: Partial<Record<Columna, number>> = {};
    (filas[i] ?? []).forEach((h, j) => {
      const col = ALIAS[normalizarEncabezado(h)];
      if (col && indices[col] == null) indices[col] = j;
    });
    if (indices.factura == null || indices.galones == null) continue;
    // Dos archivos de 2023 traen la primera celda de la cabecera vacía: es la fecha.
    if (indices.fecha == null && normalizarEncabezado(filas[i][0]) === "") indices.fecha = 0;
    return { fila: i, indices };
  }
  return null;
}

const esPlaca = (v: unknown) => typeof v === "string" && /^[A-Z]{3}[\s-]?\d{2,3}[A-Z]?$/i.test(v.trim());
const esInterno = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d{1,4}\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 9999;
};
const esGalones = (v: unknown) => {
  const n = numeroCelda(v);
  return n != null && n > 0 && n <= 100;
};
/** valor / galones en un rango de precio de ACPM por galón. */
const esValorDe = (v: unknown, g: unknown) => {
  const n = numeroCelda(v), d = numeroCelda(g);
  return n != null && d != null && d > 0 && n / d >= 5000 && n / d <= 20000;
};

function numeroCelda(v: unknown): number | null {
  const r = parsearNumero(v);
  return r && !r.vacio ? r.valor : null;
}

/**
 * Comprueba que los datos correspondan a la cabecera y, si no, deduce las
 * columnas por su contenido. Pasa en archivos donde alguien pegó el export del
 * surtidor (Fecha, Factura, Precio, Cantidad, Total, Flota, Placa, Interno)
 * debajo de la cabecera habitual: bajo «# Interno» queda el precio y bajo
 * «Placa» los galones (24 de marzo de 2026). La fecha y la factura se toman de
 * la cabecera si sus datos sirven; el producto se descarta al deducir.
 */
export function verificarColumnas(
  filas: unknown[][],
  enc: { fila: number; indices: Partial<Record<Columna, number>> },
): { indices: Partial<Record<Columna, number>>; deducidas: boolean } {
  const { indices } = enc;
  const muestra = filas
    .slice(enc.fila + 1)
    .filter((f) => f && indices.factura != null && !vacia(f[indices.factura]) && f.filter((c) => !vacia(c)).length >= 4)
    .slice(0, 50);
  if (muestra.length === 0) return { indices, deducidas: false };
  const ancho = Math.max(...muestra.map((f) => f.length));
  const fraccion = (col: number | undefined, pred: (f: unknown[]) => boolean) =>
    col == null ? 0 : muestra.filter(pred).length / muestra.length;
  const fechaBien = (col: number) => fraccion(col, (f) => vacia(f[col]) || leerFechaHora(f[col]) != null) >= 0.8;

  const g = indices.galones, v = indices.valor;
  const coincide =
    fraccion(g, (f) => esGalones(f[g!])) >= 0.8 &&
    (v == null || fraccion(v, (f) => esValorDe(f[v], f[g!])) >= 0.8) &&
    (indices.interno == null || fraccion(indices.interno, (f) => vacia(f[indices.interno!]) || esInterno(f[indices.interno!])) >= 0.8) &&
    (indices.placa == null || fraccion(indices.placa, (f) => vacia(f[indices.placa!]) || esPlaca(f[indices.placa!])) >= 0.5) &&
    (indices.fecha == null || fechaBien(indices.fecha));
  if (coincide) return { indices, deducidas: false };

  const usadas = new Set<number>([indices.factura!]);
  const mejor = (pred: (col: number) => number, minimo: number): number | undefined => {
    let elegido: number | undefined, max = minimo;
    for (let c = 0; c < ancho; c++) {
      if (usadas.has(c)) continue;
      const fr = pred(c);
      if (fr >= max) { max = fr; elegido = c; }
    }
    if (elegido != null) usadas.add(elegido);
    return elegido;
  };
  const fecha = indices.fecha != null && fechaBien(indices.fecha)
    ? (usadas.add(indices.fecha), indices.fecha)
    : mejor((c) => fraccion(c, (f) => leerFechaHora(f[c]) != null), 0.8);
  const galones = mejor((c) => (
    fraccion(c, (f) => esGalones(f[c])) >= 0.8 ? fraccion(c, (f) => !Number.isInteger(numeroCelda(f[c]))) : 0
  ), 0.5);
  if (galones == null) return { indices, deducidas: false };
  const valor = mejor((c) => fraccion(c, (f) => esValorDe(f[c], f[galones])), 0.8);
  if (valor == null) return { indices, deducidas: false };
  const placa = mejor((c) => fraccion(c, (f) => esPlaca(f[c])), 0.5);
  const interno = mejor((c) => fraccion(c, (f) => esInterno(f[c])), 0.8);
  return { indices: { fecha, factura: indices.factura, galones, valor, placa, interno }, deducidas: true };
}

// ── Lectura del libro ────────────────────────────────────────────────────────

export interface HojaCruda {
  nombre: string;
  filas: unknown[][];
}

/** Todas las hojas del libro, celdas crudas (las fechas llegan como serial). */
export function leerLibro(datos: ArrayBuffer | Uint8Array | Buffer): HojaCruda[] {
  const wb = XLSX.read(datos, { type: "buffer", cellDates: false });
  return wb.SheetNames.map((nombre) => ({
    nombre,
    filas: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: true }),
  }));
}

// ── Interpretación ───────────────────────────────────────────────────────────

interface Candidato {
  hoja: string;
  linea: number;
  factura: string;
  fecha: string;
  hora: string | null;
  interno: string | null;
  placa: string | null;
  producto: string | null;
  galones: number;
  valor: number;
}

const vacia = (v: unknown) => v == null || String(v).trim() === "";

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Pasa el libro a tanqueos. `hoy` (AAAA-MM-DD, Colombia) rechaza fechas
 * futuras; un tanqueo de hasta un día después se acepta por la diferencia de
 * hora con quien sube el archivo.
 */
export function interpretarArchivo(
  nombreArchivo: string,
  hojas: HojaCruda[],
  maestro: MaestroVehiculos,
  hoy: string,
): LecturaCombustible {
  const fechaNombre = fechaDelNombre(nombreArchivo);
  const rechazadas: FilaRechazada[] = [];
  const avisos: string[] = [];
  const conInterno: Candidato[] = [];
  const sinInterno: Candidato[] = [];
  let filasArchivo = 0;
  let hojasLeidas = 0;
  const manana = new Date(`${hoy}T12:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  const limite = manana.toISOString().slice(0, 10);

  for (const hoja of hojas) {
    const enc = encontrarEncabezado(hoja.filas);
    if (!enc) {
      if (hoja.filas.some((f) => f.some((c) => !vacia(c)))) avisos.push(`La hoja «${hoja.nombre}» no tiene la cabecera de tanqueos; se omitió.`);
      continue;
    }
    hojasLeidas++;
    const { indices, deducidas } = verificarColumnas(hoja.filas, enc);
    if (deducidas) avisos.push(`Los datos de la hoja «${hoja.nombre}» no corresponden a su cabecera; las columnas se dedujeron por el contenido.`);
    const tieneInterno = indices.interno != null;
    if (indices.valor == null) avisos.push(`La hoja «${hoja.nombre}» no trae el valor (Total): sus filas se rechazan.`);
    const celda = (f: unknown[], c: Columna) => (indices[c] != null ? f[indices[c]!] : null);

    hoja.filas.slice(enc.fila + 1).forEach((f, i) => {
      const linea = enc.fila + i + 2;
      if (!f || f.every(vacia)) return;
      const factura = normalizarFactura(celda(f, "factura"));
      const interno = tieneInterno ? normalizarVehiculo(celda(f, "interno")) : null;
      const placa = normalizarPlaca(celda(f, "placa"));
      // La fila de totales no trae factura ni bus.
      if (!factura && !interno && !placa) return;
      filasArchivo++;
      const rechazar = (motivo: string) => rechazadas.push({ hoja: hoja.nombre, linea, factura, motivo });
      if (!factura) return rechazar("Sin número de factura.");

      let fh = leerFechaHora(celda(f, "fecha"));
      if (!fh && vacia(celda(f, "fecha")) && fechaNombre) fh = { fecha: fechaNombre, hora: null };
      if (!fh) return rechazar(`Fecha no válida: «${String(celda(f, "fecha") ?? "").slice(0, 25)}».`);
      if (Number(fh.fecha.slice(0, 4)) < ANIO_MINIMO || fh.fecha > limite) return rechazar(`Fecha fuera de rango: ${fh.fecha}.`);

      const galones = numeroCelda(celda(f, "galones"));
      if (galones == null || galones <= 0) return rechazar("Sin galones o en cero.");
      const valor = numeroCelda(celda(f, "valor"));
      if (valor == null || valor < 0) return rechazar("Sin valor del tanqueo.");
      const productoCrudo = celda(f, "producto");
      const producto = vacia(productoCrudo) ? null : String(productoCrudo).trim().toUpperCase();

      const c: Candidato = {
        hoja: hoja.nombre, linea, factura, fecha: fh.fecha, hora: fh.hora, interno, placa, producto,
        galones: Math.round(galones * 1000) / 1000, valor: Math.round(valor * 100) / 100,
      };
      // Sin interno en la fila, el bus sale de la placa, igual que en una hoja sin esa columna.
      if (interno) conInterno.push(c);
      else sinInterno.push(c);
    });
  }

  if (hojasLeidas === 0) {
    return {
      errorArchivo: "No se encontró la cabecera de tanqueos (Fecha, Factura, # Interno, Placa, Producto, Volumen, Total) en ninguna hoja.",
      tanqueos: [], rechazadas: [], avisos, filasArchivo: 0, fechaNombre,
    };
  }

  // Tanqueos de hojas sin interno: solo los que no están en una hoja con interno.
  const vistos = new Set(conInterno.map((c) => `${c.factura}|${c.fecha}|${c.hora ?? ""}`));
  let omitidosSinInterno = 0;
  const candidatos: (Candidato & { porPlaca: boolean })[] = conInterno.map((c) => ({ ...c, porPlaca: false }));
  for (const c of sinInterno) {
    if (vistos.has(`${c.factura}|${c.fecha}|${c.hora ?? ""}`)) { omitidosSinInterno++; continue; }
    const codigo = c.placa ? maestro.codigoPorPlaca.get(c.placa) : undefined;
    if (!codigo) {
      rechazadas.push({ hoja: c.hoja, linea: c.linea, factura: c.factura, motivo: `Sin número interno y la placa «${c.placa ?? ""}» no está en el maestro.` });
      continue;
    }
    candidatos.push({ ...c, interno: codigo, porPlaca: true });
  }
  if (omitidosSinInterno > 0) {
    avisos.push(`${omitidosSinInterno} tanqueos de hojas sin número interno ya estaban en la hoja con interno; se tomaron de esa.`);
  }

  // Juntar repetidos (la misma hoja dos veces, o dos hojas iguales).
  const porLlave = new Map<string, Tanqueo>();
  let repetidosDistintos = 0;
  for (const c of candidatos) {
    const base = { factura: c.factura, fecha: c.fecha, hora: c.hora, vehiculoCodigo: c.interno! };
    const llave = llaveTanqueo(base);
    const previo = porLlave.get(llave);
    if (previo) {
      if (previo.galones !== c.galones || previo.valor !== c.valor) repetidosDistintos++;
      continue;
    }
    const alertas: AlertaCombustible[] = [];
    if (c.porPlaca) alertas.push("interno_por_placa");
    if (!c.hora) alertas.push("sin_hora");
    porLlave.set(llave, {
      ...base, llave, placa: c.placa, producto: c.producto, galones: c.galones, valor: c.valor,
      alertas, hoja: c.hoja, linea: c.linea,
    });
  }
  if (repetidosDistintos > 0) {
    avisos.push(`${repetidosDistintos} tanqueos aparecen dos veces en el archivo con otros galones o valor; se tomó el primero.`);
  }
  const tanqueos = [...porLlave.values()];

  // Alertas que dependen del maestro y del resto del archivo.
  const busesPorFactura = new Map<string, Set<string>>();
  for (const t of tanqueos) {
    const k = `${t.factura}|${t.fecha}|${t.hora ?? ""}`;
    if (!busesPorFactura.has(k)) busesPorFactura.set(k, new Set());
    busesPorFactura.get(k)!.add(t.vehiculoCodigo);
  }
  const precioMediano = mediana(tanqueos.filter((t) => t.valor > 0).map((t) => t.valor / t.galones));
  for (const t of tanqueos) {
    if (!maestro.placaPorCodigo.has(t.vehiculoCodigo)) t.alertas.push("vehiculo_no_existe");
    else {
      const placaMaestro = maestro.placaPorCodigo.get(t.vehiculoCodigo);
      if (t.placa && placaMaestro && t.placa !== placaMaestro) t.alertas.push("placa_distinta");
    }
    if ((busesPorFactura.get(`${t.factura}|${t.fecha}|${t.hora ?? ""}`)?.size ?? 0) > 1) t.alertas.push("factura_compartida");
    if (precioMediano && Math.abs(t.valor / t.galones / precioMediano - 1) > TOLERANCIA_PRECIO) t.alertas.push("precio_distinto");
    if (t.galones > GALONES_ALTO) t.alertas.push("volumen_alto");
    t.alertas.sort((a, b) => ALERTAS_COMBUSTIBLE.indexOf(a) - ALERTAS_COMBUSTIBLE.indexOf(b));
  }

  tanqueos.sort((a, b) => (a.fecha + (a.hora ?? "")).localeCompare(b.fecha + (b.hora ?? "")) || a.vehiculoCodigo.localeCompare(b.vehiculoCodigo, "es", { numeric: true }));
  return { errorArchivo: null, tanqueos, rechazadas, avisos, filasArchivo, fechaNombre };
}

// ── Resumen ──────────────────────────────────────────────────────────────────

export interface ResumenTanqueos {
  tanqueos: number;
  galones: number;
  valor: number;
  buses: number;
  desde: string | null;
  hasta: string | null;
  alertas: Partial<Record<AlertaCombustible, number>>;
}

export function resumirTanqueos(tanqueos: Pick<Tanqueo, "fecha" | "galones" | "valor" | "vehiculoCodigo" | "alertas">[]): ResumenTanqueos {
  const alertas: Partial<Record<AlertaCombustible, number>> = {};
  let galones = 0, valor = 0;
  let desde: string | null = null, hasta: string | null = null;
  const buses = new Set<string>();
  for (const t of tanqueos) {
    galones += t.galones;
    valor += t.valor;
    buses.add(t.vehiculoCodigo);
    if (!desde || t.fecha < desde) desde = t.fecha;
    if (!hasta || t.fecha > hasta) hasta = t.fecha;
    for (const a of t.alertas) alertas[a] = (alertas[a] ?? 0) + 1;
  }
  return { tanqueos: tanqueos.length, galones: Math.round(galones * 1000) / 1000, valor: Math.round(valor * 100) / 100, buses: buses.size, desde, hasta, alertas };
}

/** Un tanqueo que ya existe en la base cambió si cambia algo de lo que trae el archivo. */
export function tanqueoCambio(
  nuevo: Pick<Tanqueo, "galones" | "valor" | "placa" | "producto" | "alertas">,
  actual: { galones: number | string; valor: number | string; placa: string | null; producto: string | null; alertas: string[] },
): boolean {
  return (
    Math.abs(Number(actual.galones) - nuevo.galones) > 0.0005 ||
    Math.abs(Number(actual.valor) - nuevo.valor) > 0.005 ||
    (actual.placa ?? null) !== nuevo.placa ||
    (actual.producto ?? null) !== nuevo.producto ||
    [...actual.alertas].sort().join(",") !== [...nuevo.alertas].sort().join(",")
  );
}
