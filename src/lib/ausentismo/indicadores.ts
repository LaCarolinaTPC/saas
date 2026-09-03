/**
 * Indicadores de la Matriz de Ausentismo: siete cortes (mensual, EPS, IPS,
 * médico, diagnóstico, trabajador y grupo diagnóstico GRD) con incapacidades,
 * días perdidos, promedio y participación, más el análisis en frases.
 *
 * Módulo puro, sin acceso a datos: la pantalla, el PDF y el Excel reciben las
 * mismas filas filtradas y calculan aquí, así las cifras nunca difieren.
 */

import { MESES_MATRIZ } from "./matriz-reglas";

/** Columnas de la matriz que usan los indicadores. */
export interface FilaIndicador {
  fecha_inicio: string | null;
  dias_it_pagados: number | null;
  indicador_prorroga: string | null;
  origen: string | null;
  eps: string | null;
  arl: string | null;
  ips: string | null;
  profesional_responsable: string | null;
  cie10: string | null;
  diagnostico: string | null;
  grd: string | null;
  cedula: string;
  nombre: string | null;
  cargo: string | null;
  tipo_conductor: string | null;
}

export const CORTES = [
  { id: "mensual", titulo: "Ausentismo mensual", dimension: "Mes" },
  { id: "eps", titulo: "Ausentismo por EPS", dimension: "EPS / ARL" },
  { id: "ips", titulo: "Ausentismo por IPS", dimension: "IPS" },
  { id: "medico", titulo: "Ausentismo por médico", dimension: "Profesional responsable" },
  { id: "diagnostico", titulo: "Ausentismo por diagnóstico", dimension: "CIE10" },
  { id: "trabajador", titulo: "Ausentismo por trabajador", dimension: "Trabajador" },
  { id: "grd", titulo: "Ausentismo por grupo diagnóstico", dimension: "GRD" },
] as const;
export type CorteId = (typeof CORTES)[number]["id"];

export interface Grupo {
  clave: string;
  etiqueta: string;
  /** Segunda línea: descripción del CIE10, cédula y cargo del trabajador, IPS del médico… */
  detalle: string | null;
  eventos: number;
  prorrogas: number;
  dias: number;
  trabajadores: number;
  /** Días por incapacidad. */
  promedio: number;
  /** Participación en los días perdidos del total filtrado, 0-100. */
  pctDias: number;
}

export interface GrupoMensual extends Grupo {
  /** "2026-03" */
  mes: string;
  /** Tasa de ausentismo: días perdidos / (trabajadores activos × días del mes), en %. Null sin base. */
  tasa: number | null;
  /** El rango termina dentro de este mes: sus cifras no son comparables con los meses cerrados. */
  parcial: boolean;
}

export interface Totales {
  eventos: number;
  dias: number;
  trabajadores: number;
  promedio: number;
  prorrogas: number;
  pctProrrogas: number;
  /** Trabajadores activos hoy, base de la tasa; null si no se conoce. */
  activos: number | null;
  /**
   * Afectados sobre los activos de hoy. Null si no hay base o si el periodo
   * abarca más trabajadores que los activos actuales (retirados en el año):
   * ahí el porcentaje no significa nada.
   */
  pctAfectados: number | null;
}

export interface Indicadores {
  totales: Totales;
  mensual: GrupoMensual[];
  eps: Grupo[];
  ips: Grupo[];
  medico: Grupo[];
  diagnostico: Grupo[];
  trabajador: Grupo[];
  grd: Grupo[];
  analisis: string[];
}

export const SIN_DATO = "Sin dato";

const redondea = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const pct = (parte: number, total: number) => (total > 0 ? redondea((parte / total) * 100) : 0);

/** "2026-03" → "mar 2026". */
export function etiquetaMes(mes: string): string {
  const [a, m] = mes.split("-");
  const nombre = MESES_MATRIZ[Number(m) - 1] ?? m;
  return `${nombre.slice(0, 3).toLowerCase()} ${a}`;
}

function diasDelMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Meses "AAAA-MM" entre dos fechas ISO, ambos incluidos. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let [a, m] = desde.slice(0, 7).split("-").map(Number);
  const fin = hasta.slice(0, 7);
  for (let i = 0; i < 240; i++) {
    const mes = `${a}-${String(m).padStart(2, "0")}`;
    out.push(mes);
    if (mes >= fin) break;
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return out;
}

interface Acum {
  clave: string;
  etiqueta: string;
  detalle: string | null;
  eventos: number;
  prorrogas: number;
  dias: number;
  cedulas: Set<string>;
  /** Para elegir el detalle más frecuente (p. ej. la IPS del médico). */
  detalles: Map<string, number>;
}

function acumular(
  filas: FilaIndicador[],
  claveDe: (f: FilaIndicador) => string | null,
  etiquetaDe: (f: FilaIndicador) => string,
  detalleDe?: (f: FilaIndicador) => string | null
): Acum[] {
  const m = new Map<string, Acum>();
  for (const f of filas) {
    const clave = claveDe(f) ?? SIN_DATO;
    let a = m.get(clave);
    if (!a) {
      m.set(clave, (a = {
        clave, etiqueta: clave === SIN_DATO ? SIN_DATO : etiquetaDe(f), detalle: null,
        eventos: 0, prorrogas: 0, dias: 0, cedulas: new Set(), detalles: new Map(),
      }));
    }
    a.eventos += 1;
    if (f.indicador_prorroga === "PRORROGA") a.prorrogas += 1;
    a.dias += f.dias_it_pagados ?? 0;
    a.cedulas.add(f.cedula);
    const d = detalleDe?.(f);
    if (d) a.detalles.set(d, (a.detalles.get(d) ?? 0) + 1);
  }
  return [...m.values()];
}

function aGrupos(acums: Acum[], totalDias: number): Grupo[] {
  return acums
    .map((a) => ({
      clave: a.clave,
      etiqueta: a.etiqueta,
      detalle: a.detalle ?? ([...a.detalles.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null),
      eventos: a.eventos,
      prorrogas: a.prorrogas,
      dias: a.dias,
      trabajadores: a.cedulas.size,
      promedio: a.eventos > 0 ? redondea(a.dias / a.eventos) : 0,
      pctDias: pct(a.dias, totalDias),
    }))
    // "Sin dato" siempre al final, el resto por días perdidos.
    .sort((x, y) =>
      (x.clave === SIN_DATO ? 1 : 0) - (y.clave === SIN_DATO ? 1 : 0) ||
      y.dias - x.dias || y.eventos - x.eventos || x.etiqueta.localeCompare(y.etiqueta, "es")
    );
}

/** Reordena por la medida elegida; "Sin dato" sigue al final. */
export function ordenarPor(grupos: Grupo[], medida: "dias" | "eventos"): Grupo[] {
  if (medida === "dias") return grupos;
  return [...grupos].sort((x, y) =>
    (x.clave === SIN_DATO ? 1 : 0) - (y.clave === SIN_DATO ? 1 : 0) ||
    y.eventos - x.eventos || y.dias - x.dias || x.etiqueta.localeCompare(y.etiqueta, "es")
  );
}

/**
 * Corta la lista al top N y agrupa el resto en una fila "Otros (k)". "Sin dato"
 * se conserva aparte porque no es un grupo real. La lista debe venir ordenada
 * por la medida que se va a mostrar (ver `ordenarPor`).
 */
export function topN(grupos: Grupo[], n: number | null): Grupo[] {
  if (!n || grupos.length <= n) return grupos;
  const sinDato = grupos.filter((g) => g.clave === SIN_DATO);
  const reales = grupos.filter((g) => g.clave !== SIN_DATO);
  if (reales.length <= n) return grupos;
  const top = reales.slice(0, n);
  const resto = reales.slice(n);
  const dias = resto.reduce((a, g) => a + g.dias, 0);
  const eventos = resto.reduce((a, g) => a + g.eventos, 0);
  const otros: Grupo = {
    clave: "__otros__",
    etiqueta: `Otros (${resto.length})`,
    detalle: null,
    eventos,
    prorrogas: resto.reduce((a, g) => a + g.prorrogas, 0),
    dias,
    trabajadores: resto.reduce((a, g) => a + g.trabajadores, 0),
    promedio: eventos > 0 ? redondea(dias / eventos) : 0,
    pctDias: redondea(resto.reduce((a, g) => a + g.pctDias, 0)),
  };
  return [...top, otros, ...sinDato];
}

export function calcularIndicadores(
  filas: FilaIndicador[],
  opts: { desde: string; hasta: string; activos?: number | null }
): Indicadores {
  const totalDias = filas.reduce((a, f) => a + (f.dias_it_pagados ?? 0), 0);
  const cedulas = new Set(filas.map((f) => f.cedula));
  const prorrogas = filas.filter((f) => f.indicador_prorroga === "PRORROGA").length;
  const activos = opts.activos ?? null;

  const totales: Totales = {
    eventos: filas.length,
    dias: totalDias,
    trabajadores: cedulas.size,
    promedio: filas.length > 0 ? redondea(totalDias / filas.length) : 0,
    prorrogas,
    pctProrrogas: pct(prorrogas, filas.length),
    activos,
    pctAfectados: activos && cedulas.size <= activos ? pct(cedulas.size, activos) : null,
  };

  // Mensual: todos los meses del rango, con cero donde no hubo nada.
  const porMes = new Map(
    aGrupos(
      acumular(filas, (f) => f.fecha_inicio?.slice(0, 7) ?? null, (f) => etiquetaMes(f.fecha_inicio!.slice(0, 7))),
      totalDias
    ).map((g) => [g.clave, g])
  );
  const mesHasta = opts.hasta.slice(0, 7);
  const hastaEsFinDeMes = Number(opts.hasta.slice(8, 10)) >= diasDelMes(mesHasta);
  const mensual: GrupoMensual[] = mesesEntre(opts.desde, opts.hasta).map((mes) => {
    const g = porMes.get(mes) ?? {
      clave: mes, etiqueta: etiquetaMes(mes), detalle: null, eventos: 0, prorrogas: 0, dias: 0,
      trabajadores: 0, promedio: 0, pctDias: 0,
    };
    const parcial = mes === mesHasta && !hastaEsFinDeMes;
    return {
      ...g,
      etiqueta: parcial ? `${g.etiqueta} (parcial)` : g.etiqueta,
      mes,
      parcial,
      tasa: activos ? redondea((g.dias / (activos * diasDelMes(mes))) * 100, 2) : null,
    };
  });
  const sinFecha = porMes.get(SIN_DATO);

  const eps = aGrupos(
    acumular(filas, (f) => f.eps ?? f.arl ?? null, (f) => f.eps ?? f.arl ?? SIN_DATO),
    totalDias
  );
  const ips = aGrupos(acumular(filas, (f) => f.ips, (f) => f.ips ?? SIN_DATO), totalDias);
  const medico = aGrupos(
    acumular(filas, (f) => f.profesional_responsable, (f) => f.profesional_responsable ?? SIN_DATO, (f) => f.ips),
    totalDias
  );
  const diagnostico = aGrupos(
    acumular(filas, (f) => f.cie10?.toUpperCase() ?? null, (f) => f.cie10!.toUpperCase(), (f) => f.diagnostico),
    totalDias
  );
  const trabajador = aGrupos(
    acumular(
      filas,
      (f) => f.cedula,
      (f) => f.nombre ?? f.cedula,
      (f) => [f.cedula ? `CC ${f.cedula}` : null, f.cargo, f.tipo_conductor].filter(Boolean).join(" · ") || null
    ),
    totalDias
  );
  const grd = aGrupos(acumular(filas, (f) => f.grd, (f) => f.grd ?? SIN_DATO), totalDias);

  const analisis = redactarAnalisis({
    totales, mensual, eps, ips, medico, diagnostico, trabajador, grd, sinFecha: sinFecha?.eventos ?? 0,
  });

  return { totales, mensual, eps, ips, medico, diagnostico, trabajador, grd, analisis };
}

// ── Análisis en frases ───────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString("es-CO");
const plural = (n: number, s: string, p: string) => (n === 1 ? s : p);

function redactarAnalisis(x: {
  totales: Totales;
  mensual: GrupoMensual[];
  eps: Grupo[];
  ips: Grupo[];
  medico: Grupo[];
  diagnostico: Grupo[];
  trabajador: Grupo[];
  grd: Grupo[];
  sinFecha: number;
}): string[] {
  const { totales: t } = x;
  const out: string[] = [];
  if (t.eventos === 0) return ["No hay incapacidades en el periodo y los filtros elegidos."];

  out.push(
    `${fmt(t.eventos)} ${plural(t.eventos, "incapacidad", "incapacidades")} y ${fmt(t.dias)} días perdidos, ` +
    `${t.promedio} días por incapacidad en promedio. ` +
    `${fmt(t.trabajadores)} ${plural(t.trabajadores, "trabajador afectado", "trabajadores afectados")}` +
    (t.pctAfectados != null
      ? ` (${t.pctAfectados}% de los ${fmt(t.activos!)} activos).`
      : t.activos && t.trabajadores > t.activos
        ? `, más que los ${fmt(t.activos)} activos hoy: el periodo incluye personal ya retirado.`
        : ".")
  );

  if (t.prorrogas > 0) {
    out.push(`${fmt(t.prorrogas)} ${plural(t.prorrogas, "es prórroga", "son prórrogas")} (${t.pctProrrogas}% de las incapacidades).`);
  }

  // El mes en curso no se compara: sus cifras aún no están completas.
  const conDatos = x.mensual.filter((m) => m.eventos > 0 && !m.parcial);
  const parcial = x.mensual.find((m) => m.parcial && m.eventos > 0);
  if (conDatos.length > 1) {
    const pico = [...conDatos].sort((a, b) => b.dias - a.dias)[0];
    const i = x.mensual.findIndex((m) => m.mes === pico.mes);
    const previo = i > 0 ? x.mensual[i - 1] : null;
    let frase = `El mes con más días perdidos fue ${pico.etiqueta}: ${fmt(pico.dias)} días en ${fmt(pico.eventos)} ${plural(pico.eventos, "incapacidad", "incapacidades")}`;
    if (previo && previo.dias > 0) {
      const var_ = redondea(((pico.dias - previo.dias) / previo.dias) * 100, 0);
      frase += `, ${var_ >= 0 ? "+" : ""}${var_}% frente a ${previo.etiqueta}`;
    }
    out.push(frase + ".");
    const ultimo = conDatos[conDatos.length - 1];
    const anterior = x.mensual[x.mensual.findIndex((m) => m.mes === ultimo.mes) - 1];
    if (anterior && anterior.dias > 0 && ultimo.mes !== pico.mes) {
      const var_ = redondea(((ultimo.dias - anterior.dias) / anterior.dias) * 100, 0);
      out.push(`${ultimo.etiqueta} cerró con ${fmt(ultimo.dias)} días perdidos, ${var_ >= 0 ? "+" : ""}${var_}% frente a ${anterior.etiqueta}.`);
    }
    if (t.activos && conDatos.length > 0) {
      const tasaProm = redondea(conDatos.reduce((a, m) => a + (m.tasa ?? 0), 0) / conDatos.length, 2);
      out.push(`Tasa de ausentismo promedio de los meses cerrados: ${tasaProm}% de los días calendario de ${fmt(t.activos)} trabajadores activos.`);
    }
  }
  if (parcial) {
    out.push(`${parcial.etiqueta.replace(" (parcial)", "")} va en ${fmt(parcial.dias)} días perdidos y ${fmt(parcial.eventos)} ${plural(parcial.eventos, "incapacidad", "incapacidades")}; el mes sigue abierto y no se compara.`);
  }

  const grdReal = x.grd.filter((g) => g.clave !== SIN_DATO);
  if (grdReal.length > 0) {
    const [g1] = grdReal;
    const top3 = grdReal.slice(0, 3);
    const pct3 = redondea(top3.reduce((a, g) => a + g.pctDias, 0), 0);
    out.push(
      `El grupo diagnóstico ${g1.etiqueta} concentra el ${g1.pctDias}% de los días perdidos (${fmt(g1.dias)} días en ${fmt(g1.eventos)} ${plural(g1.eventos, "incapacidad", "incapacidades")})` +
      (top3.length === 3 ? `; con ${top3[1].etiqueta} y ${top3[2].etiqueta} suman el ${pct3}%.` : ".")
    );
  }

  const dxReal = x.diagnostico.filter((g) => g.clave !== SIN_DATO);
  if (dxReal.length > 0) {
    const d = dxReal[0];
    out.push(`El diagnóstico con más días perdidos es ${d.etiqueta}${d.detalle ? ` (${d.detalle})` : ""}: ${fmt(d.dias)} días en ${fmt(d.eventos)} ${plural(d.eventos, "incapacidad", "incapacidades")}.`);
  }

  const trab = x.trabajador.filter((g) => g.clave !== SIN_DATO);
  if (trab.length > 1) {
    let acum = 0;
    let k = 0;
    for (const g of trab) { acum += g.dias; k += 1; if (acum >= t.dias / 2) break; }
    const t1 = trab[0];
    out.push(
      `${k} ${plural(k, "trabajador acumula", "trabajadores acumulan")} la mitad de los días perdidos (de ${fmt(trab.length)}). ` +
      `El de mayor ausentismo es ${t1.etiqueta} con ${fmt(t1.dias)} días en ${fmt(t1.eventos)} ${plural(t1.eventos, "incapacidad", "incapacidades")}.`
    );
    const reincidentes = trab.filter((g) => g.eventos >= 3).length;
    if (reincidentes > 0) {
      out.push(`${fmt(reincidentes)} ${plural(reincidentes, "trabajador tiene", "trabajadores tienen")} 3 o más incapacidades en el periodo.`);
    }
  }

  const epsReal = x.eps.filter((g) => g.clave !== SIN_DATO);
  if (epsReal.length > 1) {
    const e1 = epsReal[0];
    const mayorProm = [...epsReal].filter((g) => g.eventos >= 5).sort((a, b) => b.promedio - a.promedio)[0];
    let frase = `${e1.etiqueta} es la EPS con más días perdidos (${e1.pctDias}%, ${fmt(e1.dias)} días)`;
    if (mayorProm && mayorProm.clave !== e1.clave) {
      frase += `; ${mayorProm.etiqueta} tiene el mayor promedio por incapacidad (${mayorProm.promedio} días)`;
    }
    out.push(frase + ".");
  }

  const ipsReal = x.ips.filter((g) => g.clave !== SIN_DATO);
  const medReal = x.medico.filter((g) => g.clave !== SIN_DATO);
  if (ipsReal.length > 0 && medReal.length > 0) {
    out.push(
      `La IPS con más días perdidos es ${ipsReal[0].etiqueta} (${fmt(ipsReal[0].dias)} días) y el profesional que más días expidió es ` +
      `${medReal[0].etiqueta}${medReal[0].detalle ? ` de ${medReal[0].detalle}` : ""} (${fmt(medReal[0].dias)} días en ${fmt(medReal[0].eventos)} ${plural(medReal[0].eventos, "incapacidad", "incapacidades")}).`
    );
  }

  const faltantes: string[] = [];
  const sinMed = x.medico.find((g) => g.clave === SIN_DATO)?.eventos ?? 0;
  const sinIps = x.ips.find((g) => g.clave === SIN_DATO)?.eventos ?? 0;
  const sinGrd = x.grd.find((g) => g.clave === SIN_DATO)?.eventos ?? 0;
  const sinDx = x.diagnostico.find((g) => g.clave === SIN_DATO)?.eventos ?? 0;
  if (sinMed) faltantes.push(`${fmt(sinMed)} sin profesional`);
  if (sinIps) faltantes.push(`${fmt(sinIps)} sin IPS`);
  if (sinDx) faltantes.push(`${fmt(sinDx)} sin CIE10`);
  if (sinGrd) faltantes.push(`${fmt(sinGrd)} sin GRD`);
  if (x.sinFecha) faltantes.push(`${fmt(x.sinFecha)} sin fecha de inicio`);
  if (faltantes.length > 0) {
    out.push(`Calidad del dato: ${faltantes.join(", ")}. Esas incapacidades aparecen como "${SIN_DATO}" en el corte correspondiente.`);
  }

  return out;
}
