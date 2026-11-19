/**
 * Escenarios de Croma simulado para el chat de prueba (casilla «Consultar
 * Croma de verdad» apagada): qué responde cada fuente, para revisar cómo
 * sigue el flujo en cada caso sin gastar consultas. Puro: lo usan el modal de
 * «Nuevo chat» y `simularCromaProceso` en el servidor.
 */

export type RespuestaRunt = "vigente" | "vencida" | "inferior" | "sin_licencia" | "no_aparece" | "error";
export type RespuestaFuente = "limpio" | "hallazgo" | "error";
export type FuenteSimulada = "policia" | "procuraduria" | "contraloria" | "rnmc";

export interface EscenarioCroma {
  runt: RespuestaRunt;
  /** Total de multas en pesos (0: sin deuda) o «error» si Croma no responde. */
  simit: number | "error";
  policia: RespuestaFuente;
  procuraduria: RespuestaFuente;
  contraloria: RespuestaFuente;
  rnmc: RespuestaFuente;
}

export const ESCENARIO_BASE: EscenarioCroma = { runt: "vigente", simit: 0, policia: "limpio", procuraduria: "limpio", contraloria: "limpio", rnmc: "limpio" };

export const RESPUESTAS_RUNT: { id: RespuestaRunt; texto: string }[] = [
  { id: "vigente", texto: "Licencia vigente (la que dijo, o C2)" },
  { id: "vencida", texto: "Licencia vencida (la que dijo, o C2)" },
  { id: "inferior", texto: "Solo licencia B1 (menor a la pedida)" },
  { id: "sin_licencia", texto: "Registrado, sin licencia" },
  { id: "no_aparece", texto: "La cédula no aparece" },
  { id: "error", texto: "Croma no responde" },
];

export const RESPUESTAS_FUENTE: { id: RespuestaFuente; texto: string }[] = [
  { id: "limpio", texto: "Sin antecedentes" },
  { id: "hallazgo", texto: "Con hallazgo" },
  { id: "error", texto: "Croma no responde" },
];

export const FUENTES_SIMULADAS: { id: FuenteSimulada; texto: string }[] = [
  { id: "policia", texto: "Policía" },
  { id: "procuraduria", texto: "Procuraduría" },
  { id: "contraloria", texto: "Contraloría" },
  { id: "rnmc", texto: "RNMC (medidas correctivas)" },
];

/** Escenarios listos para elegir de una vez en el modal. */
export const ESCENARIOS: { id: string; titulo: string; escenario: EscenarioCroma }[] = [
  { id: "todo_bien", titulo: "Todo bien", escenario: ESCENARIO_BASE },
  { id: "vencida", titulo: "Licencia vencida", escenario: { ...ESCENARIO_BASE, runt: "vencida" } },
  { id: "inferior", titulo: "Licencia menor a la pedida", escenario: { ...ESCENARIO_BASE, runt: "inferior" } },
  { id: "no_aparece", titulo: "La cédula no aparece en el RUNT", escenario: { ...ESCENARIO_BASE, runt: "no_aparece" } },
  { id: "multas", titulo: "Con multas en el SIMIT ($1.250.000)", escenario: { ...ESCENARIO_BASE, simit: 1_250_000 } },
  { id: "policia", titulo: "Con antecedentes en la Policía", escenario: { ...ESCENARIO_BASE, policia: "hallazgo" } },
  { id: "rnmc", titulo: "Con medidas correctivas (RNMC)", escenario: { ...ESCENARIO_BASE, rnmc: "hallazgo" } },
  { id: "caido", titulo: "Croma no responde los antecedentes", escenario: { ...ESCENARIO_BASE, policia: "error", procuraduria: "error", contraloria: "error", rnmc: "error" } },
  { id: "runt_caido", titulo: "Croma no responde el RUNT ni el SIMIT", escenario: { ...ESCENARIO_BASE, runt: "error", simit: "error" } },
];

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

/** Resumen corto del escenario («RUNT vencida · SIMIT $0 · Policía con hallazgo»). */
export function resumenEscenario(e: EscenarioCroma): string {
  const listo = ESCENARIOS.find((x) => mismoEscenario(x.escenario, e));
  if (listo) return listo.titulo;
  const partes = [
    `RUNT: ${RESPUESTAS_RUNT.find((r) => r.id === e.runt)?.texto.toLowerCase() ?? e.runt}`,
    `SIMIT: ${e.simit === "error" ? "no responde" : pesos(e.simit)}`,
    ...FUENTES_SIMULADAS.filter((f) => e[f.id] !== "limpio").map((f) => `${f.texto}: ${e[f.id] === "hallazgo" ? "con hallazgo" : "no responde"}`),
  ];
  return partes.join(" · ");
}

export function mismoEscenario(a: EscenarioCroma, b: EscenarioCroma): boolean {
  return (Object.keys(ESCENARIO_BASE) as (keyof EscenarioCroma)[]).every((k) => a[k] === b[k]);
}

/** Valida lo que llega del navegador; lo que no se entienda queda como en «Todo bien». */
export function escenarioValido(v: unknown): EscenarioCroma {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const runt = RESPUESTAS_RUNT.some((r) => r.id === o.runt) ? (o.runt as RespuestaRunt) : ESCENARIO_BASE.runt;
  const simit = o.simit === "error" ? "error" : Number.isFinite(Number(o.simit)) && Number(o.simit) >= 0 ? Math.round(Number(o.simit)) : 0;
  const fuente = (x: unknown): RespuestaFuente => (x === "hallazgo" || x === "error" ? x : "limpio");
  return { runt, simit, policia: fuente(o.policia), procuraduria: fuente(o.procuraduria), contraloria: fuente(o.contraloria), rnmc: fuente(o.rnmc) };
}
