/**
 * Variables explicativas del análisis de riesgo por conductor.
 *
 * Todas se calculan en ventanas semiabiertas `[t-n, t)` respecto al corte, así
 * que un modelo entrenado con ellas nunca ve datos posteriores al corte que
 * está prediciendo. `estado_civil` y `nivel_educativo` se leen del maestro pero
 * no entran: están "sin definir" en la mitad de las fichas.
 */
import { diasEntre, enVentana, media, sumarDias } from "./fechas";

// ── Fuentes ──────────────────────────────────────────────────────────────────

export interface Conductor {
  cedula: string;
  nombre: string;
  codigo: string | null;
  tipo_conductor: string | null;
  estado: string;
  fecha_ingreso: string | null;
  fecha_retiro: string | null;
  fecha_nacimiento: string | null;
  num_hijos: number | null;
  estado_civil: string | null;
  nivel_educativo: string | null;
}

export interface Registro {
  cedula: string;
  fecha: string;
  tipo: string;
  soporte: string;
  contacto: string | null;
}

export interface ViajePerdido {
  cedula_conductor: string | null;
  fecha: string;
  novedad: string | null;
  tipologia: string | null;
}

export interface Cierre {
  cedula_conductor: string | null;
  cod_conductor: string;
  fecha: string;
  viajes: number | null;
  bruto: number | null;
}

export interface Incapacidad {
  cedula: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  dias_it_pagados: number | null;
  origen: string | null;
}

/** Series por conductor, ordenadas por fecha, para ventanear rápido. */
export interface Serie {
  registros: Registro[];
  /** Fechas de viajes perdidos imputables al conductor. */
  viajesPerdidos: string[];
  cierres: { fecha: string; viajes: number; bruto: number }[];
  incapacidades: Incapacidad[];
}

export const serieVacia = (): Serie => ({
  registros: [],
  viajesPerdidos: [],
  cierres: [],
  incapacidades: [],
});

/** Una observación del panel: un conductor en un corte, con sus dos resultados. */
export interface Fila {
  cedula: string;
  nombre: string;
  corte: string;
  x: Record<string, number>;
  /** 1 si se retiró en los 60 días siguientes; `null` si aún no es observable. */
  retiro60: number | null;
  /** 1 si tuvo una falta no justificada en los 30 días siguientes; `null` si no es observable. */
  novedad30: number | null;
}

export type Objetivo = "retiro60" | "novedad30";

// ── Catálogo de variables ────────────────────────────────────────────────────

export const VARIABLES: { key: string; etiqueta: string; grupo: string }[] = [
  { key: "antig_meses", etiqueta: "Antigüedad (meses)", grupo: "Perfil" },
  { key: "antig_menor_6m", etiqueta: "Menos de 6 meses en la empresa", grupo: "Perfil" },
  { key: "edad", etiqueta: "Edad (años)", grupo: "Perfil" },
  { key: "es_relevo", etiqueta: "Es relevo (no fijo)", grupo: "Perfil" },
  { key: "es_afiliado", etiqueta: "Vehículo afiliado (no de empresa)", grupo: "Perfil" },
  { key: "hijos", etiqueta: "Número de hijos", grupo: "Perfil" },
  { key: "aus30", etiqueta: "Ausencias registradas · 30 días", grupo: "Ausentismo" },
  { key: "aus90", etiqueta: "Ausencias registradas · 90 días", grupo: "Ausentismo" },
  { key: "nj30", etiqueta: "No justificadas / sin contacto · 30 días", grupo: "Ausentismo" },
  { key: "nj90", etiqueta: "No justificadas / sin contacto · 90 días", grupo: "Ausentismo" },
  { key: "inc90", etiqueta: "Ausencias por incapacidad · 90 días", grupo: "Ausentismo" },
  { key: "perm90", etiqueta: "Permisos · 90 días", grupo: "Ausentismo" },
  { key: "eps90", etiqueta: "Citas EPS · 90 días", grupo: "Ausentismo" },
  { key: "taller90", etiqueta: "Vehículo en taller · 90 días", grupo: "Ausentismo" },
  { key: "sop_pend90", etiqueta: "Soportes pendientes · 90 días", grupo: "Ausentismo" },
  { key: "reincidente30", etiqueta: "Reincidente (3+ ausencias en 30 días)", grupo: "Ausentismo" },
  { key: "dias_inc_eps90", etiqueta: "Días de incapacidad EPS · 90 días", grupo: "Salud" },
  { key: "vp_cond30", etiqueta: "Viajes perdidos por el conductor · 30 días", grupo: "Operación" },
  { key: "vp_cond90", etiqueta: "Viajes perdidos por el conductor · 90 días", grupo: "Operación" },
  { key: "dias_trab30", etiqueta: "Días con cierre · 30 días", grupo: "Producción" },
  { key: "sin_cierre30", etiqueta: "Sin ningún cierre en 30 días", grupo: "Producción" },
  { key: "viajes_prom30", etiqueta: "Viajes por día · 30 días", grupo: "Producción" },
  { key: "caida_viajes", etiqueta: "Caída de viajes/día frente a los 60 días previos", grupo: "Producción" },
  { key: "bruto_prom30", etiqueta: "Bruto por día · 30 días (miles)", grupo: "Producción" },
];

export const KEYS = VARIABLES.map((v) => v.key);
export const ETIQUETA: Record<string, string> = Object.fromEntries(
  VARIABLES.map((v) => [v.key, v.etiqueta])
);

/**
 * Las 24 variables de un conductor al corte `t`. Ojo con dos detalles que no se
 * leen del nombre: `ci90` es la ventana `[t-90, t-30)` (los 60 días previos al
 * último mes), que es contra la que se mide `caida_viajes`; y los días de
 * incapacidad se cuentan por intersección de intervalos, no por conteo de
 * eventos.
 */
export function variables(c: Conductor, s: Serie, t: string): Record<string, number> {
  const d30 = sumarDias(t, -30);
  const d90 = sumarDias(t, -90);
  const reg30 = enVentana(s.registros, (r) => r.fecha, d30, t);
  const reg90 = enVentana(s.registros, (r) => r.fecha, d90, t);
  const nj = (r: Registro) => r.tipo === "no_justificada";
  const ci30 = enVentana(s.cierres, (x) => x.fecha, d30, t);
  const ci90 = enVentana(s.cierres, (x) => x.fecha, d90, d30);
  const diasTrab30 = new Set(ci30.map((x) => x.fecha)).size;
  const vprom30 = ci30.length ? media(ci30.map((x) => x.viajes)) : 0;
  const vprom60prev = ci90.length ? media(ci90.map((x) => x.viajes)) : 0;
  const caida = vprom60prev > 0 ? Math.max(0, (vprom60prev - vprom30) / vprom60prev) : 0;

  // Días de incapacidad EPS que caen dentro de la ventana de 90 días.
  let diasInc = 0;
  for (const i of s.incapacidades) {
    const fin = i.fecha_fin ?? i.fecha_inicio;
    const a = i.fecha_inicio > d90 ? i.fecha_inicio : d90;
    const b = fin < t ? fin : sumarDias(t, -1);
    if (b >= a) diasInc += diasEntre(a, b) + 1;
  }

  const antigMeses = c.fecha_ingreso ? Math.max(0, diasEntre(c.fecha_ingreso, t)) / 30.44 : 0;
  const edad = c.fecha_nacimiento ? diasEntre(c.fecha_nacimiento, t) / 365.25 : 0;
  const tipo = (c.tipo_conductor ?? "").toUpperCase();

  return {
    antig_meses: Math.min(antigMeses, 240),
    antig_menor_6m: antigMeses < 6 ? 1 : 0,
    edad: edad > 15 && edad < 80 ? edad : 0,
    es_relevo: tipo.includes("RELEVO") ? 1 : 0,
    es_afiliado: tipo.includes("AFILIADO") ? 1 : 0,
    hijos: c.num_hijos ?? 0,
    aus30: reg30.length,
    aus90: reg90.length,
    nj30: reg30.filter(nj).length,
    nj90: reg90.filter(nj).length,
    inc90: reg90.filter((r) => r.tipo === "incapacidad").length,
    perm90: reg90.filter((r) => r.tipo === "permiso").length,
    eps90: reg90.filter((r) => r.tipo === "eps").length,
    taller90: reg90.filter((r) => r.tipo === "taller").length,
    sop_pend90: reg90.filter((r) => r.soporte === "pendiente").length,
    reincidente30: reg30.length >= 3 ? 1 : 0,
    dias_inc_eps90: diasInc,
    vp_cond30: enVentana(s.viajesPerdidos, (f) => f, d30, t).length,
    vp_cond90: enVentana(s.viajesPerdidos, (f) => f, d90, t).length,
    dias_trab30: diasTrab30,
    sin_cierre30: diasTrab30 === 0 ? 1 : 0,
    viajes_prom30: vprom30,
    caida_viajes: caida,
    bruto_prom30: ci30.length ? media(ci30.map((x) => x.bruto)) / 1000 : 0,
  };
}
