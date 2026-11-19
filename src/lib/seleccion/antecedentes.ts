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
  /** Con el RNMC opcional: quedó «limpio» sin la respuesta del RNMC (Gestión Humana lo revisa a mano). */
  faltaRnmc?: boolean;
  /** Fuentes opcionales que no respondieron y sin las cuales quedó «limpio» (se revisan a mano). */
  faltan?: FuenteAntecedentes[];
}

/**
 * ¿La respuesta guardada de esa fuente trae un hallazgo? null si no se puede leer.
 * `identidadConfirmada`: el RUNT ya encontró la cédula con el apellido de la
 * persona (y el nombre coincide); con eso un RNMC sin nombre sí vale.
 */
export function hallazgoDe(fuente: FuenteAntecedentes, resultado: unknown, opciones: { identidadConfirmada?: boolean } = {}): boolean | null {
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
      if (r.found === false) return null;
      // Según la guía de Croma, el registro «responde cualquier número»: a uno
      // que no conoce le da el veredicto limpio. Y el certificado de la Policía
      // ya no imprime el nombre (visto el 18-nov-2026), así que el nombre no
      // sirve para confirmar a la persona: vale el veredicto si el RUNT ya la
      // confirmó con la cédula y su apellido; si no, no hay veredicto.
      const conNombre = typeof r.full_name === "string" && r.full_name.trim() !== "";
      if (!conNombre && !opciones.identidadConfirmada) return null;
      return bool(r.has_pending_measures);
  }
}

/**
 * Evalúa las consultas guardadas del proceso (la más reciente de cada fuente
 * debe venir primero). Una fuente con error o sin consultar deja el resultado
 * pendiente: no se marca «Listo para citar» sin las cuatro. Con `rnmcOpcional`
 * (ajuste «El RNMC es obligatorio» en «no», 18-nov-2026, mientras Croma no
 * responde), el RNMC sin respuesta no frena: con las otras tres limpias queda
 * «limpio» y `faltaRnmc`. Un hallazgo del RNMC sigue siendo hallazgo.
 */
export function evaluarAntecedentes(
  consultas: ConsultaGuardada[],
  opciones: {
    identidadConfirmada?: boolean;
    rnmcOpcional?: boolean;
    /** Fuentes que no son obligatorias (ajustes «… es obligatoria» en «no»): sin respuesta no frenan. */
    opcionales?: readonly FuenteAntecedentes[];
  } = {}
): EvaluacionAntecedentes {
  const fuentes = FUENTES_ANTECEDENTES.map((fuente) => {
    const filas = consultas.filter((c) => c.fuente === fuente);
    // Vale la última consulta con veredicto; si no hay, la última que haya.
    const ok = filas.find((c) => c.estado === "ok" && hallazgoDe(fuente, c.resultado, opciones) != null);
    const ultima = ok ?? filas[0];
    if (!ultima) return { fuente, estado: "sin_consultar" as EstadoFuente, detalle: null };
    if (ultima.estado === "pendiente") return { fuente, estado: "pendiente" as EstadoFuente, detalle: "En curso en Croma" };
    const h = ultima.estado === "ok" ? hallazgoDe(fuente, ultima.resultado, opciones) : null;
    if (h == null) return { fuente, estado: "error" as EstadoFuente, detalle: ultima.error ?? "Sin veredicto" };
    const texto = ((ultima.resultado as Record<string, unknown>)?.status as string | undefined)?.trim() || null;
    return { fuente, estado: (h ? "hallazgo" : "limpio") as EstadoFuente, detalle: texto };
  });
  const opcionales = new Set<FuenteAntecedentes>([...(opciones.opcionales ?? []), ...(opciones.rnmcOpcional ? (["rnmc"] as const) : [])]);
  // Una fuente opcional sin veredicto (error, en curso o sin consultar) no cuenta; con veredicto, sí.
  const faltan = fuentes.filter((f) => opcionales.has(f.fuente) && f.estado !== "limpio" && f.estado !== "hallazgo").map((f) => f.fuente);
  const cuentan = fuentes.filter((f) => !faltan.includes(f.fuente));
  const resultado = fuentes.some((f) => f.estado === "hallazgo")
    ? "hallazgo"
    : cuentan.every((f) => f.estado === "limpio")
      ? "limpio"
      : "pendiente";
  const limpio = resultado === "limpio";
  return { resultado, fuentes, ...(limpio && faltan.includes("rnmc") ? { faltaRnmc: true } : {}), ...(limpio && faltan.length ? { faltan } : {}) };
}
