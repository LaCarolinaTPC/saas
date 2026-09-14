/**
 * Panel conductor × mes: la tabla con la que se entrena y se evalúa.
 *
 * Un corte por mes, el día 1. En cada corte entran los conductores que estaban
 * en plantilla y que tenían alguna huella operativa en los 90 días previos (el
 * maestro arrastra gente que ya no opera aunque no tenga fecha de retiro), y de
 * cada uno se guardan sus variables al corte y los dos resultados posteriores.
 *
 * Los resultados quedan en `null` cuando su horizonte todavía no ha pasado: esas
 * filas no entrenan ni evalúan, pero sí sirven para puntuar.
 */
import { dig, sumarDias } from "./fechas";
import {
  serieVacia,
  variables,
  type Conductor,
  type Fila,
  type Objetivo,
  type Serie,
} from "./variables";

/** Cuántos cortes mensuales entran en el panel por defecto. */
export const MESES_PANEL = 7;

/**
 * Los cortes del panel: el día 1 del mes del corte y los `meses - 1` anteriores.
 *
 * Se derivan del corte a propósito. La primera versión de este análisis los
 * tenía fijos a marzo–septiembre de 2026, lo que servía para una corrida a mano
 * pero habría congelado el panel en cuanto el cálculo pasara a correr solo.
 */
export function cortesDelPanel(corte: string, meses = MESES_PANEL): string[] {
  const anio = Number(corte.slice(0, 4));
  const mes = Number(corte.slice(5, 7)); // 1-12
  const cortes: string[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const total = anio * 12 + (mes - 1) - i;
    const a = Math.floor(total / 12);
    const m = (total % 12) + 1;
    cortes.push(`${a}-${String(m).padStart(2, "0")}-01`);
  }
  return cortes;
}

/** El maestro lo da por vinculado. `estado` solo toma ACTIVO y RETIRADO. */
export const estaActivo = (c: Conductor) =>
  String(c.estado ?? "").toUpperCase() === "ACTIVO";

/**
 * Fecha de retiro utilizable, o `null` si no la hay.
 *
 * Dos descartes, y los dos son de digitación, no de historia:
 *
 * - Una fecha posterior al corte todavía no ha ocurrido. Hay cinco fichas con
 *   retiro en 2027, 2028 y 2030.
 * - Una fecha en una ficha que el maestro da por ACTIVA se ignora entera. Son
 *   siete, con fechas como 2012-01-01 en gente que tiene cierres de la semana
 *   pasada, y sin ellas el análisis los daba por idos desde hace catorce años
 *   y los dejaba fuera de todo: ni entrenaban ni se puntuaban. No es historia
 *   de un reingreso: ninguna de las cuatro fichas con `fecha_reingreso` tiene
 *   un retiro anterior, así que aquí no se pierde ningún retiro real.
 */
export function retiroDe(c: Conductor, corte: string): string | null {
  if (estaActivo(c)) return null;
  return c.fecha_retiro && c.fecha_retiro <= corte ? c.fecha_retiro : null;
}

/**
 * Estaba en plantilla en `t`: ya había ingresado y aún no se había retirado.
 *
 * Mira la fecha, nunca el `estado`. El estado es el de hoy, y aplicarlo a un
 * mes pasado del panel sacaría de él a todo el que se haya retirado desde
 * entonces — justo las filas que enseñan al modelo qué precede a un retiro.
 * Los 45 retirados sin fecha en el maestro siguen entrando al panel por eso;
 * lo que no hacen es puntuarse hoy (ver `filasDelCorte`).
 */
export function enPlantilla(c: Conductor, t: string, corte: string): boolean {
  if (!c.fecha_ingreso || c.fecha_ingreso > t) return false;
  const r = retiroDe(c, corte);
  return !r || r >= t;
}

function tieneHuella(s: Serie, t: string): boolean {
  const d90 = sumarDias(t, -90);
  return (
    s.cierres.some((x) => x.fecha >= d90 && x.fecha < t) ||
    s.registros.some((x) => x.fecha >= d90 && x.fecha < t) ||
    s.viajesPerdidos.some((x) => x >= d90 && x < t)
  );
}

export interface Panel {
  cortes: string[];
  filas: Fila[];
}

export function construirPanel(
  conductores: Conductor[],
  series: Map<string, Serie>,
  corte: string,
  meses = MESES_PANEL
): Panel {
  const cortes = cortesDelPanel(corte, meses);
  const vacia = serieVacia();
  const filas: Fila[] = [];

  for (const t of cortes) {
    for (const c of conductores) {
      if (!enPlantilla(c, t, corte)) continue;
      const s = series.get(dig(c.cedula)) ?? vacia;
      if (!tieneHuella(s, t) && c.estado !== "ACTIVO") continue;

      const r = retiroDe(c, corte);
      const fin60 = sumarDias(t, 60);
      const fin30 = sumarDias(t, 30);
      const retiro60 = fin60 <= corte ? (r && r >= t && r < fin60 ? 1 : 0) : null;
      const novedad30 =
        fin30 <= corte
          ? s.registros.some((x) => x.fecha >= t && x.fecha < fin30 && x.tipo === "no_justificada")
            ? 1
            : 0
          : null;

      filas.push({
        cedula: dig(c.cedula),
        nombre: c.nombre,
        corte: t,
        x: variables(c, s, t),
        retiro60,
        novedad30,
      });
    }
  }

  return { cortes, filas };
}

export const evaluables = (filas: Fila[], objetivo: Objetivo) =>
  filas.filter((f) => f[objetivo] != null);

export interface Division {
  train: Fila[];
  test: Fila[];
  mesesTest: string[];
}

/** Corte temporal: los dos meses evaluables más recientes son la prueba. */
export function dividir(fs: Fila[]): Division {
  const meses = [...new Set(fs.map((f) => f.corte))].sort();
  const prueba = new Set(meses.slice(-2));
  return {
    train: fs.filter((f) => !prueba.has(f.corte)),
    test: fs.filter((f) => prueba.has(f.corte)),
    mesesTest: [...prueba],
  };
}

/**
 * Conductores a puntuar en el corte: los que el maestro da por activos y no
 * tienen una fecha de retiro ya cumplida.
 *
 * Antes bastaba con un cierre en los últimos 30 días para entrar aunque el
 * maestro dijera RETIRADO. Esa puerta sobra: de los 45 retirados sin fecha,
 * ninguno tiene un cierre desde agosto. Y sobra en la dirección peligrosa,
 * porque quien se acaba de retirar es precisamente quien tiene cierres
 * recientes. Exigir el estado deja a la corrida diciendo lo mismo que la
 * pantalla, que oculta al que el maestro ya no da por activo.
 */
export function filasDelCorte(
  conductores: Conductor[],
  series: Map<string, Serie>,
  corte: string
): Fila[] {
  const vacia = serieVacia();
  return conductores
    .filter((c) => estaActivo(c) && enPlantilla(c, corte, corte))
    .map((c) => ({
      cedula: dig(c.cedula),
      nombre: c.nombre,
      corte,
      x: variables(c, series.get(dig(c.cedula)) ?? vacia, corte),
      retiro60: null,
      novedad30: null,
    }));
}

/** Retiros observados por mes del panel, para el contexto de la serie. */
export function retirosPorMes(
  conductores: Conductor[],
  panel: Panel,
  corte: string
): { mes: string; plantilla: number; retiros: number; tasa: number }[] {
  return panel.cortes
    .filter((t) => sumarDias(t, 30) <= corte)
    .map((t) => {
      const plantilla = panel.filas.filter((f) => f.corte === t).length;
      const fin = sumarDias(t, 30);
      const retiros = conductores.filter((c) => {
        const r = retiroDe(c, corte);
        return r && r >= t && r < fin;
      }).length;
      return { mes: t.slice(0, 7), plantilla, retiros, tasa: plantilla ? retiros / plantilla : 0 };
    });
}
