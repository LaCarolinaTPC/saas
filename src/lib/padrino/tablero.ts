/**
 * Tablero del Plan Padrino (fase 3, spec RQ-09 a RQ-11). Funciones puras:
 * datos.ts lee y esto calcula, para poder probarlo.
 */

import { sumarDias, sumarMeses } from "./reglas";

// ── RQ-09 · Tablero ─────────────────────────────────────────────────────────

export interface HitoTablero {
  estado: string;
  valor: number;
  fecha_causacion: string;
  fecha_pago: string | null;
  cedula_padrino: string;
  nombre_padrino: string | null;
}

export interface ReferidoTablero {
  estado: string;
  cedula_padrino: string;
  nombre_padrino: string | null;
}

const CAUSADOS = new Set(["por_aprobar", "aprobado", "pagado"]);
/** Estados de un referido que llegó a contratarse. */
export const REFERIDO_CONTRATADO = new Set(["contratado", "en_seguimiento", "completado", "terminado"]);

export function resumenTablero(referidos: ReferidoTablero[], hitos: HitoTablero[], hoy: string, meses = 12) {
  const porEstado = new Map<string, number>();
  for (const r of referidos) porEstado.set(r.estado, (porEstado.get(r.estado) ?? 0) + 1);

  const limite = sumarDias(hoy, 30);
  const proximos = hitos.filter((h) => h.estado === "pendiente" && h.fecha_causacion <= limite);
  const porAprobar = hitos.filter((h) => h.estado === "por_aprobar");
  const porPagar = hitos.filter((h) => h.estado === "aprobado");

  // Causado (por fecha de causación) y pagado (por fecha de pago) de los últimos `meses` meses.
  const mesHoy = hoy.slice(0, 7);
  const lista = Array.from({ length: meses }, (_, i) => sumarMeses(`${mesHoy}-01`, i - meses + 1).slice(0, 7));
  const mensual = lista.map((mes) => ({
    mes,
    causado: hitos.filter((h) => CAUSADOS.has(h.estado) && h.fecha_causacion.startsWith(mes)).reduce((s, h) => s + h.valor, 0),
    pagado: hitos.filter((h) => h.estado === "pagado" && h.fecha_pago?.startsWith(mes)).reduce((s, h) => s + h.valor, 0),
  }));

  const padrinos = new Map<string, { cedula: string; nombre: string | null; referidos: number; contratados: number; pagado: number; porPagar: number }>();
  const padrino = (cedula: string, nombre: string | null) => {
    const p = padrinos.get(cedula) ?? { cedula, nombre, referidos: 0, contratados: 0, pagado: 0, porPagar: 0 };
    padrinos.set(cedula, p);
    return p;
  };
  for (const r of referidos) {
    const p = padrino(r.cedula_padrino, r.nombre_padrino);
    p.referidos++;
    if (REFERIDO_CONTRATADO.has(r.estado)) p.contratados++;
  }
  for (const h of hitos) {
    const p = padrino(h.cedula_padrino, h.nombre_padrino);
    if (h.estado === "pagado") p.pagado += h.valor;
    if (h.estado === "por_aprobar" || h.estado === "aprobado") p.porPagar += h.valor;
  }
  const topPadrinos = [...padrinos.values()].sort((a, b) => b.contratados - a.contratados || b.pagado - a.pagado || b.referidos - a.referidos).slice(0, 10);

  const suma = (xs: HitoTablero[]) => xs.reduce((s, h) => s + h.valor, 0);
  return {
    porEstado: Object.fromEntries(porEstado),
    totalReferidos: referidos.length,
    contratados: referidos.filter((r) => REFERIDO_CONTRATADO.has(r.estado)).length,
    proximos: { cantidad: proximos.length, valor: suma(proximos) },
    porAprobar: { cantidad: porAprobar.length, valor: suma(porAprobar) },
    porPagar: { cantidad: porPagar.length, valor: suma(porPagar) },
    pagadoTotal: suma(hitos.filter((h) => h.estado === "pagado")),
    mensual,
    topPadrinos,
  };
}

// ── RQ-10 · Permanencia por fuente ──────────────────────────────────────────

export const FUENTE_PADRINO = "Plan Padrino";

export interface Contratado {
  cedula: string;
  /** Plan Padrino o el medio de postulación. */
  fuente: string;
  ingreso: string;
  /** Fecha de retiro posterior al ingreso; null si sigue activo. */
  retiro: string | null;
}

export const HORIZONTES = [30, 60, 90] as const;

export interface PermanenciaFuente {
  fuente: string;
  contratados: number;
  /** Por horizonte: cuántos ya cumplieron el plazo (base) y cuántos seguían a ese día. */
  tasas: Record<(typeof HORIZONTES)[number], { base: number; permanecen: number; pct: number | null }>;
}

/**
 * Permanencia a 30/60/90 días: de los que ingresaron hace al menos N días,
 * qué porcentaje no se había retirado al día N. Los que aún no cumplen N
 * días no entran en la base de ese plazo.
 */
export function permanenciaPorFuente(contratados: Contratado[], hoy: string): PermanenciaFuente[] {
  const grupos = new Map<string, Contratado[]>();
  for (const c of contratados) grupos.set(c.fuente, [...(grupos.get(c.fuente) ?? []), c]);
  const calc = (xs: Contratado[]): PermanenciaFuente["tasas"] =>
    Object.fromEntries(
      HORIZONTES.map((n) => {
        const base = xs.filter((c) => sumarDias(c.ingreso, n) <= hoy);
        const permanecen = base.filter((c) => !c.retiro || c.retiro > sumarDias(c.ingreso, n)).length;
        return [n, { base: base.length, permanecen, pct: base.length ? Math.round((permanecen / base.length) * 1000) / 10 : null }];
      })
    ) as PermanenciaFuente["tasas"];
  const filas = [...grupos.entries()].map(([fuente, xs]) => ({ fuente, contratados: xs.length, tasas: calc(xs) }));
  // Plan Padrino primero, luego por número de contratados.
  filas.sort((a, b) => (a.fuente === FUENTE_PADRINO ? -1 : b.fuente === FUENTE_PADRINO ? 1 : b.contratados - a.contratados));
  const otras = contratados.filter((c) => c.fuente !== FUENTE_PADRINO);
  if (otras.length) filas.push({ fuente: "Otras fuentes (todas)", contratados: otras.length, tasas: calc(otras) });
  return filas;
}

/** Costo por contratado: lo comprometido o gastado ÷ contratados (null sin contratados). */
export const costoPorContratado = (costo: number, contratados: number) => (contratados ? Math.round(costo / contratados) : null);

// ── RQ-11 · Alertas ─────────────────────────────────────────────────────────

export interface HechosAlerta {
  referidoId: string;
  nombre: string | null;
  cedula: string;
  fechaIngreso: string;
  proximoHito: { numero: number; fecha: string; valor: number } | null;
  /** Fechas de faltas «no justificada» desde el ingreso. */
  faltas: string[];
  /** Fechas de accidentes desde el ingreso. */
  accidentes: string[];
}

export interface Alerta extends HechosAlerta {
  motivos: string[];
  /** Días seguidos sin justificar de la racha más reciente. */
  racha: number;
}

const fmt = (f: string) => f.split("-").reverse().join("/");

function rachaMasReciente(fechas: string[]): number {
  const set = new Set(fechas);
  if (!set.size) return 0;
  let dia = [...set].sort().at(-1)!;
  let n = 1;
  while (set.has(sumarDias(dia, -1))) {
    dia = sumarDias(dia, -1);
    n++;
  }
  return n;
}

/**
 * Referido en seguimiento con faltas no justificadas o accidentes desde su
 * ingreso, mientras le quede un hito por causar: la coordinadora lo ve antes
 * de que venza el hito.
 */
export function alertasReferidos(hechos: HechosAlerta[]): Alerta[] {
  return hechos
    .filter((h) => h.proximoHito && (h.faltas.length || h.accidentes.length))
    .map((h) => {
      const racha = rachaMasReciente(h.faltas);
      const motivos: string[] = [];
      if (h.faltas.length) {
        const ultima = [...h.faltas].sort().at(-1)!;
        motivos.push(`${h.faltas.length} falta(s) no justificada(s) desde el ingreso; la última el ${fmt(ultima)}${racha > 1 ? `, ${racha} días seguidos` : ""}.`);
      }
      if (h.accidentes.length) motivos.push(`${h.accidentes.length} accidente(s) desde el ingreso; el último el ${fmt([...h.accidentes].sort().at(-1)!)}.`);
      return { ...h, motivos, racha };
    })
    .sort((a, b) => (a.proximoHito!.fecha < b.proximoHito!.fecha ? -1 : 1));
}
