/**
 * Histórico de pagos del Plan Padrino antes de Gestivo (F6). Parte pura: lee
 * la tabla del archivo que entrega Nómina/GH (Excel o CSV) y la deja en filas
 * de `padrino_pagos_historicos`. La política solo paga una bonificación por
 * cédula en la historia (R11): esta tabla es la memoria de lo pagado antes.
 *
 * El archivo no tiene un formato fijo: se busca la fila de encabezados (la
 * que nombra la cédula) y, en ella, las columnas de cédula, año (o una fecha
 * de la que se saca el año) y valor. Solo la cédula es obligatoria.
 */

export interface FilaHistorico {
  cedula: string;
  anio: number | null;
  valor: number | null;
  /** Fila del archivo (1 = la primera), para los mensajes. */
  fila: number;
}

export interface LecturaHistorico {
  validas: FilaHistorico[];
  errores: { fila: number; motivo: string }[];
  /** Filas idénticas (cédula, año y valor) que se descartaron. */
  repetidas: number;
  columnas: { cedula: string; anio: string | null; valor: string | null };
}

const RE_CEDULA = /c[eé]dula|documento|identificaci|^cc$|^c\.c\.?$|nit/i;
const RE_ANIO = /^a[ñn]o$|^anio$|vigencia|a[ñn]o\s*(de\s*)?pago/i;
const RE_FECHA = /fecha|periodo|per[ií]odo|^mes/i;
const RE_VALOR = /valor|monto|pago|total|bonific/i;

/** Texto de una celda de Excel (fórmulas, texto enriquecido, hipervínculos) o de CSV. */
export function textoCelda(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.result !== undefined) return textoCelda(o.result);
    if (o.text !== undefined) return textoCelda(o.text);
    return "";
  }
  return String(v).trim();
}

function anioDe(v: unknown): number | null {
  if (v instanceof Date) return v.getUTCFullYear();
  const t = textoCelda(v);
  if (!t) return null;
  const m = /(19|20)\d{2}/.exec(t);
  return m ? Number(m[0]) : null;
}

function valorDe(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  const t = textoCelda(v).replace(/[$\s]/g, "");
  if (!t) return null;
  // «350.000», «350,000», «350000», «350.000,00»
  const limpio = t.replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** Lee la tabla (filas de celdas) del archivo de Nómina/GH. */
export function leerTablaHistorico(tabla: unknown[][]): LecturaHistorico {
  const idx = tabla.findIndex((fila) => fila.some((c) => RE_CEDULA.test(textoCelda(c))));
  if (idx < 0) {
    return { validas: [], errores: [{ fila: 1, motivo: "No se encontró la columna de la cédula: el archivo debe tener un encabezado «Cédula» (o «Documento»)." }], repetidas: 0, columnas: { cedula: "", anio: null, valor: null } };
  }
  const enc = tabla[idx].map(textoCelda);
  const col = (re: RegExp) => enc.findIndex((t) => re.test(t));
  const cCed = col(RE_CEDULA);
  const cAnio = col(RE_ANIO);
  const cFecha = cAnio < 0 ? col(RE_FECHA) : -1;
  // «Valor» o «Monto» primero; «pago», «total» solo si no hay otra (y nunca la de la fecha: «Fecha de pago»).
  const libre = (i: number) => i !== cCed && i !== cAnio && i !== cFecha;
  const cValorFuerte = enc.findIndex((t, i) => libre(i) && /valor|monto/i.test(t));
  const cValor = cValorFuerte >= 0 ? cValorFuerte : enc.findIndex((t, i) => libre(i) && RE_VALOR.test(t));

  const validas: FilaHistorico[] = [];
  const errores: { fila: number; motivo: string }[] = [];
  const vistas = new Set<string>();
  let repetidas = 0;
  for (let i = idx + 1; i < tabla.length; i++) {
    const fila = tabla[i];
    if (!fila || fila.every((c) => !textoCelda(c))) continue;
    const n = i + 1;
    const bruta = textoCelda(fila[cCed]);
    const cedula = bruta.replace(/\.0+$/, "").replace(/\D/g, "");
    if (!cedula) {
      errores.push({ fila: n, motivo: "Sin cédula." });
      continue;
    }
    if (cedula.length < 5 || cedula.length > 12) {
      errores.push({ fila: n, motivo: `Cédula «${bruta}» no válida.` });
      continue;
    }
    const anio = cAnio >= 0 ? anioDe(fila[cAnio]) : cFecha >= 0 ? anioDe(fila[cFecha]) : null;
    const valor = cValor >= 0 ? valorDe(fila[cValor]) : null;
    const clave = `${cedula}|${anio ?? ""}|${valor ?? ""}`;
    if (vistas.has(clave)) {
      repetidas++;
      continue;
    }
    vistas.add(clave);
    validas.push({ cedula, anio, valor, fila: n });
  }
  return {
    validas,
    errores,
    repetidas,
    columnas: { cedula: enc[cCed], anio: cAnio >= 0 ? enc[cAnio] : cFecha >= 0 ? enc[cFecha] : null, valor: cValor >= 0 ? enc[cValor] : null },
  };
}

/** Separa un CSV en filas: detecta «;» o «,» y respeta comillas. */
export function tablaDeCsv(texto: string): string[][] {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return [];
  const sep = (lineas[0].match(/;/g)?.length ?? 0) >= (lineas[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return lineas.map((l) => {
    const out: string[] = [];
    let actual = "";
    let comillas = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') {
        if (comillas && l[i + 1] === '"') {
          actual += '"';
          i++;
        } else comillas = !comillas;
      } else if (ch === sep && !comillas) {
        out.push(actual.trim());
        actual = "";
      } else actual += ch;
    }
    out.push(actual.trim());
    return out;
  });
}

/** Resumen de lo leído, para la previsualización. */
export function resumenLectura(l: LecturaHistorico) {
  const anios = l.validas.map((f) => f.anio).filter((a): a is number => a !== null);
  return {
    filas: l.validas.length,
    cedulas: new Set(l.validas.map((f) => f.cedula)).size,
    desde: anios.length ? Math.min(...anios) : null,
    hasta: anios.length ? Math.max(...anios) : null,
    valor: l.validas.reduce((s, f) => s + (f.valor ?? 0), 0),
    errores: l.errores.length,
    repetidas: l.repetidas,
  };
}
