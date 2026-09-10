/**
 * Regresión logística propia, sin dependencias: descenso de gradiente por
 * lotes con regularización L2 sobre variables estandarizadas, más el AUC por
 * Mann-Whitney. Son ~40 líneas de matemática y evitan meter una librería de ML
 * en la aplicación para 24 variables y mil filas.
 *
 * El módulo es puro: recibe filas y devuelve modelos. Lo comparten el cron, la
 * pantalla y el script de línea de comandos, así las cifras nunca difieren.
 */
import { media } from "./fechas";
import { KEYS, type Fila, type Objetivo } from "./variables";

export interface Modelo {
  keys: string[];
  /** Media y desviación del conjunto de entrenamiento, para estandarizar al puntuar. */
  mu: number[];
  sd: number[];
  w: number[];
  b: number;
  auc: number;
  /** Tasa base observada en el conjunto de prueba: el umbral de los niveles. */
  base: number;
  n: number;
  nTest: number;
  positivos: number;
  liftTop10: number;
  capturaTop20: number;
  precisionTop10: number;
}

export function sigmoide(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** AUC por Mann-Whitney, con rango promedio en los empates. 0,5 si falta una clase. */
export function auc(scores: number[], y: number[]): number {
  const pares = scores.map((s, i) => ({ s, y: y[i] })).sort((a, b) => a.s - b.s);
  let sumaPos = 0;
  let nPos = 0;
  let nNeg = 0;
  for (let i = 0; i < pares.length; ) {
    let j = i;
    while (j < pares.length && pares[j].s === pares[i].s) j++;
    const r = (i + j + 1) / 2; // rango promedio (base 1) de los empates
    for (let k = i; k < j; k++) {
      if (pares[k].y === 1) {
        sumaPos += r;
        nPos++;
      } else nNeg++;
    }
    i = j;
  }
  if (!nPos || !nNeg) return 0.5;
  return (sumaPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

const LR = 0.05;
const L2 = 0.02;
const ITERACIONES = 1500;

/**
 * Entrena con `train` y mide con `test`. El intercepto arranca en el log-odds
 * de la tasa base y la L2 no penaliza el sesgo.
 */
export function entrenar(train: Fila[], test: Fila[], objetivo: Objetivo): Modelo {
  const keys = KEYS;
  const X = train.map((f) => keys.map((k) => f.x[k]));
  const y = train.map((f) => f[objetivo] as number);
  const mu = keys.map((_, j) => media(X.map((r) => r[j])));
  const sd = keys.map((_, j) => Math.sqrt(media(X.map((r) => (r[j] - mu[j]) ** 2))) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const w = new Array(keys.length).fill(0);
  let b = Math.log((media(y) || 1e-3) / (1 - (media(y) || 1e-3)));

  for (let it = 0; it < ITERACIONES; it++) {
    const gw = new Array(keys.length).fill(0);
    let gb = 0;
    for (let i = 0; i < Z.length; i++) {
      const p = sigmoide(Z[i].reduce((acc, v, j) => acc + v * w[j], b));
      const e = p - y[i];
      for (let j = 0; j < keys.length; j++) gw[j] += e * Z[i][j];
      gb += e;
    }
    for (let j = 0; j < keys.length; j++) w[j] -= LR * (gw[j] / Z.length + L2 * w[j]);
    b -= LR * (gb / Z.length);
  }

  const puntuarFila = (f: Fila) =>
    sigmoide(keys.reduce((acc, k, j) => acc + ((f.x[k] - mu[j]) / sd[j]) * w[j], b));
  const scores = test.map(puntuarFila);
  const yt = test.map((f) => f[objetivo] as number);
  const base = media(yt);
  const orden = scores.map((s, i) => ({ s, y: yt[i] })).sort((a, b) => b.s - a.s);
  const top10 = orden.slice(0, Math.max(1, Math.round(orden.length * 0.1)));
  const top20 = orden.slice(0, Math.max(1, Math.round(orden.length * 0.2)));
  const positivos = yt.reduce((a, v) => a + v, 0);

  return {
    keys,
    mu,
    sd,
    w,
    b,
    auc: auc(scores, yt),
    base,
    n: train.length,
    nTest: test.length,
    positivos,
    precisionTop10: media(top10.map((p) => p.y)),
    liftTop10: base > 0 ? media(top10.map((p) => p.y)) / base : 0,
    capturaTop20: positivos > 0 ? top20.reduce((a, p) => a + p.y, 0) / positivos : 0,
  };
}

export interface Factor {
  key: string;
  /** Contribución estandarizada al log-odds. */
  z: number;
}

/** Probabilidad de un conductor y las 3 variables que más la empujan hacia arriba. */
export function puntuar(m: Modelo, x: Record<string, number>): { p: number; factores: Factor[] } {
  const contrib = m.keys.map((k, j) => ({ key: k, z: ((x[k] - m.mu[j]) / m.sd[j]) * m.w[j] }));
  const p = sigmoide(contrib.reduce((a, c) => a + c.z, m.b));
  return {
    p,
    factores: contrib.filter((c) => c.z > 0.15).sort((a, b) => b.z - a.z).slice(0, 3),
  };
}

export type Nivel = "Alto" | "Medio" | "Bajo";

/** Alto a partir de 3× la tasa base; Medio a partir de 1,5×. */
export function nivel(p: number, base: number): Nivel {
  if (p >= base * 3) return "Alto";
  if (p >= base * 1.5) return "Medio";
  return "Bajo";
}

export interface Tramo {
  etiqueta: string;
  test: (v: number) => boolean;
}

/** Tasa observada del resultado por tramo de una variable (tablas descriptivas). */
export function tasaPorTramo(
  filas: Fila[],
  key: string,
  objetivo: Objetivo,
  tramos: Tramo[]
): { etiqueta: string; n: number; tasa: number }[] {
  return tramos.map((t) => {
    const grupo = filas.filter((f) => f[objetivo] != null && t.test(f.x[key]));
    return {
      etiqueta: t.etiqueta,
      n: grupo.length,
      tasa: grupo.length ? media(grupo.map((f) => f[objetivo] as number)) : 0,
    };
  });
}
