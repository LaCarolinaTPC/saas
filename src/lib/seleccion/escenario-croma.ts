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
  /**
   * Detalle del hallazgo, para probar las reglas de antecedentes (entrega 3).
   * Solo cuenta cuando la fuente está «con hallazgo».
   */
  /** RNMC: cuántas medidas correctivas pendientes trae. */
  rnmcMedidas: number;
  /** Contraloría: valor del fallo, en pesos. */
  contraloriaValor: number;
  /** Contraloría: fecha del fallo (AAAA-MM-DD). */
  contraloriaFecha: string;
}

export const ESCENARIO_BASE: EscenarioCroma = {
  runt: "vigente", simit: 0, policia: "limpio", procuraduria: "limpio", contraloria: "limpio", rnmc: "limpio",
  rnmcMedidas: 1, contraloriaValor: 5_000_000, contraloriaFecha: "2024-06-15",
};

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
  { id: "procuraduria", titulo: "Con antecedentes disciplinarios (Procuraduría)", escenario: { ...ESCENARIO_BASE, procuraduria: "hallazgo" } },
  { id: "contraloria", titulo: "Responsable fiscal por $5.000.000 (Contraloría)", escenario: { ...ESCENARIO_BASE, contraloria: "hallazgo" } },
  { id: "contraloria_menor", titulo: "Responsable fiscal por $800.000, fallo de 2015", escenario: { ...ESCENARIO_BASE, contraloria: "hallazgo", contraloriaValor: 800_000, contraloriaFecha: "2015-03-10" } },
  { id: "rnmc", titulo: "Con 1 medida correctiva (RNMC)", escenario: { ...ESCENARIO_BASE, rnmc: "hallazgo" } },
  { id: "rnmc_3", titulo: "Con 3 medidas correctivas (RNMC)", escenario: { ...ESCENARIO_BASE, rnmc: "hallazgo", rnmcMedidas: 3 } },
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
  const entero = (x: unknown, min: number, max: number, base: number) => (Number.isFinite(Number(x)) && Number(x) >= min && Number(x) <= max ? Math.round(Number(x)) : base);
  return {
    runt,
    simit,
    policia: fuente(o.policia),
    procuraduria: fuente(o.procuraduria),
    contraloria: fuente(o.contraloria),
    rnmc: fuente(o.rnmc),
    rnmcMedidas: entero(o.rnmcMedidas, 1, 20, ESCENARIO_BASE.rnmcMedidas),
    contraloriaValor: entero(o.contraloriaValor, 0, 1_000_000_000_000, ESCENARIO_BASE.contraloriaValor),
    contraloriaFecha: typeof o.contraloriaFecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.contraloriaFecha) ? o.contraloriaFecha : ESCENARIO_BASE.contraloriaFecha,
  };
}
