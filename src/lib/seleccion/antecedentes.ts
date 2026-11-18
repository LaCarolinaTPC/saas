/**
 * Antecedentes después de la preselección (pedido de GH del 17-nov-2026):
 * cuando cumple los 4 requisitos se consultan Policía, Procuraduría,
 * Contraloría y RNMC. Por ahora la regla es sencilla: si todas salen limpias
 * (y el prefiltro está completo), el chat queda «Listo para citar»; si alguna
 * trae un hallazgo, Gestión Humana lo revisa en la ficha. Todavía no hay reglas
 * de hallazgos «manejables» (llegan con la entrega 3). Funciones puras.
 */

export const FUENTES_ANTECEDENTES = ["policia", "procuraduria", "contraloria", "rnmc"] as const;
export type FuenteAntecedentes = (typeof FUENTES_ANTECEDENTES)[number];

export const NOMBRE_FUENTE: Record<FuenteAntecedentes, string> = {
  policia: "Policía",
  procuraduria: "Procuraduría",
  contraloria: "Contraloría",
  rnmc: "RNMC",
};

export type EstadoFuente = "limpio" | "hallazgo" | "pendiente" | "error" | "sin_consultar";

export interface ConsultaGuardada {
  fuente: string;
  estado: string;
  resultado: unknown;
  error?: string | null;
}

export interface EvaluacionAntecedentes {
  /** limpio: las 4 sin hallazgos · hallazgo: alguna trae uno · pendiente: falta alguna. */
  resultado: "limpio" | "hallazgo" | "pendiente";
  fuentes: { fuente: FuenteAntecedentes; estado: EstadoFuente; detalle: string | null }[];
}

/** ¿La respuesta guardada de esa fuente trae un hallazgo? null si no se puede leer. */
export function hallazgoDe(fuente: FuenteAntecedentes, resultado: unknown): boolean | null {
  const r = (resultado ?? null) as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
  switch (fuente) {
    case "policia":
      return bool(r.has_records);
    case "procuraduria":
      // No registrado en el SIRI: sin antecedentes disciplinarios.
      return r.found === false ? false : bool(r.has_records);
    case "contraloria":
      return bool(r.is_fiscal_responsible);
    case "rnmc":
      // found=false es que la fecha de expedición no coincide: no hay veredicto.
      return r.found === false ? null : bool(r.has_pending_measures);
  }
}

/**
 * Evalúa las consultas guardadas del proceso (la más reciente de cada fuente
 * debe venir primero). Una fuente con error o sin consultar deja el resultado
 * pendiente: no se marca «Listo para citar» sin las cuatro.
 */
export function evaluarAntecedentes(consultas: ConsultaGuardada[]): EvaluacionAntecedentes {
  const fuentes = FUENTES_ANTECEDENTES.map((fuente) => {
    const filas = consultas.filter((c) => c.fuente === fuente);
    // Vale la última consulta con veredicto; si no hay, la última que haya.
    const ok = filas.find((c) => c.estado === "ok" && hallazgoDe(fuente, c.resultado) != null);
    const ultima = ok ?? filas[0];
    if (!ultima) return { fuente, estado: "sin_consultar" as EstadoFuente, detalle: null };
    if (ultima.estado === "pendiente") return { fuente, estado: "pendiente" as EstadoFuente, detalle: "En curso en Croma" };
    const h = ultima.estado === "ok" ? hallazgoDe(fuente, ultima.resultado) : null;
    if (h == null) return { fuente, estado: "error" as EstadoFuente, detalle: ultima.error ?? "Sin veredicto" };
    const texto = ((ultima.resultado as Record<string, unknown>)?.status as string | undefined)?.trim() || null;
    return { fuente, estado: (h ? "hallazgo" : "limpio") as EstadoFuente, detalle: texto };
  });
  const resultado = fuentes.some((f) => f.estado === "hallazgo")
    ? "hallazgo"
    : fuentes.every((f) => f.estado === "limpio")
      ? "limpio"
      : "pendiente";
  return { resultado, fuentes };
}
