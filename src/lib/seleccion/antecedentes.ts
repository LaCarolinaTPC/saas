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

/** Qué hace Gestivo con un hallazgo, según las reglas de Gestión Humana. */
export type AccionAntecedente = "tolera" | "revision" | "descarta";
export const ACCIONES_ANTECEDENTE: readonly AccionAntecedente[] = ["tolera", "revision", "descarta"];
export const NOMBRE_ACCION: Record<AccionAntecedente, string> = {
  tolera: "Se tolera: sigue el proceso",
  revision: "Lo revisa una persona",
  descarta: "Descarta: se propone el cierre",
};

/**
 * limpio: sin hallazgos · tolerable: hay hallazgos y las reglas los toleran ·
 * revision: lo decide una persona · descarta: las reglas proponen el cierre ·
 * pendiente: falta alguna fuente obligatoria.
 */
export type VeredictoAntecedentes = "limpio" | "tolerable" | "revision" | "descarta" | "pendiente";

/**
 * Las respuestas de Gestión Humana a las preguntas de la sección 9 de
 * docs/seleccion-antecedentes-croma.pdf. Se editan en Selección › Tiempos y
 * reglas › «Antecedentes: qué se tolera» (ajustes `ant_*`, entrega 3).
 */
export interface ReglasAntecedentes {
  /** Policía y Procuraduría solo traen el veredicto: una acción para cualquier hallazgo. */
  policia: AccionAntecedente;
  procuraduria: AccionAntecedente;
  /** Contraloría: qué pasa si es responsable fiscal y no aplica ninguna tolerancia. */
  contraloria: AccionAntecedente;
  /** Se tolera si todos los fallos son de este valor o menos. 0 = el valor no importa. */
  contraloriaValorTolerado: number;
  /** Se tolera si todos los fallos tienen estos años o más. 0 = la fecha no importa. */
  contraloriaAniosTolerado: number;
  /** RNMC: medidas correctivas pendientes que se toleran como máximo. */
  rnmcMaxToleradas: number;
  /** RNMC: qué pasa con más medidas que ese máximo. */
  rnmcExceso: AccionAntecedente;
  /** RNMC: palabras que identifican medidas que nunca se toleran (van a revisión). */
  rnmcPalabras: string[];
}

/** Sin reglas definidas todo hallazgo lo revisa una persona (lo que hacía Gestivo antes de la entrega 3). */
export const REGLAS_TODO_A_REVISION: ReglasAntecedentes = {
  policia: "revision",
  procuraduria: "revision",
  contraloria: "revision",
  contraloriaValorTolerado: 0,
  contraloriaAniosTolerado: 0,
  rnmcMaxToleradas: 0,
  rnmcExceso: "revision",
  rnmcPalabras: [],
};

/**
 * Valores de prueba mientras Gestión Humana responde (decisión del 20-nov-2026):
 * los mismos que siembra la migración de la entrega 3 como valor y valor sugerido.
 */
export const REGLAS_POR_DEFECTO: ReglasAntecedentes = {
  ...REGLAS_TODO_A_REVISION,
  contraloria: "descarta",
  rnmcMaxToleradas: 2,
};

/** Ajuste de cada regla. La clave de la izquierda es el campo de `ReglasAntecedentes`. */
export const AJUSTE_DE_REGLA: Record<keyof ReglasAntecedentes, string> = {
  policia: "ant_policia_accion",
  procuraduria: "ant_procuraduria_accion",
  contraloria: "ant_contraloria_accion",
  contraloriaValorTolerado: "ant_contraloria_valor_tolerado",
  contraloriaAniosTolerado: "ant_contraloria_anios_tolerado",
  rnmcMaxToleradas: "ant_rnmc_max_toleradas",
  rnmcExceso: "ant_rnmc_accion_exceso",
  rnmcPalabras: "ant_rnmc_palabras_revision",
};

/** Las reglas a partir de los ajustes. Lo que falte o venga mal queda en «revisión». */
export function reglasDeAjustes(ajustes: readonly { clave: string; valor: unknown }[]): ReglasAntecedentes {
  const valor = (campo: keyof ReglasAntecedentes) => ajustes.find((a) => a.clave === AJUSTE_DE_REGLA[campo])?.valor;
  const accion = (campo: keyof ReglasAntecedentes): AccionAntecedente => {
    const v = valor(campo);
    return ACCIONES_ANTECEDENTE.includes(v as AccionAntecedente) ? (v as AccionAntecedente) : "revision";
  };
  const numero = (campo: keyof ReglasAntecedentes) => {
    const n = Number(valor(campo));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const palabras = valor("rnmcPalabras");
  return {
    policia: accion("policia"),
    procuraduria: accion("procuraduria"),
    contraloria: accion("contraloria"),
    contraloriaValorTolerado: numero("contraloriaValorTolerado"),
    contraloriaAniosTolerado: numero("contraloriaAniosTolerado"),
    rnmcMaxToleradas: Math.floor(numero("rnmcMaxToleradas")),
    rnmcExceso: accion("rnmcExceso"),
    rnmcPalabras: Array.isArray(palabras) ? palabras.map((p) => String(p).trim()).filter(Boolean) : [],
  };
}

export interface FuenteEvaluada {
  fuente: FuenteAntecedentes;
  estado: EstadoFuente;
  detalle: string | null;
  /** Solo con hallazgo: lo que dicen las reglas y por qué. */
  accion?: AccionAntecedente;
  motivo?: string;
}

export interface EvaluacionAntecedentes {
  /** limpio: las 4 sin hallazgos · hallazgo: alguna trae uno · pendiente: falta alguna. */
  resultado: "limpio" | "hallazgo" | "pendiente";
  /** Lo mismo pasado por las reglas: es lo que decide si el proceso sigue. */
  veredicto: VeredictoAntecedentes;
  fuentes: FuenteEvaluada[];
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

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

/**
 * Qué hacer con el hallazgo de una fuente según las reglas, y la razón en una
 * frase para la ficha. Solo usa lo que la fuente trae de verdad: Policía y
 * Procuraduría, el veredicto; Contraloría, valor y fecha de cada fallo; RNMC,
 * la lista de medidas. Cuando falta el detalle que una tolerancia necesita, no
 * se tolera: aplica la acción general.
 */
export function accionDeHallazgo(
  fuente: FuenteAntecedentes,
  resultado: unknown,
  reglas: ReglasAntecedentes,
  hoy: Date = new Date()
): { accion: AccionAntecedente; motivo: string } {
  const r = (resultado && typeof resultado === "object" ? resultado : {}) as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  switch (fuente) {
    case "policia":
      return { accion: reglas.policia, motivo: "Tiene asuntos pendientes con las autoridades judiciales." };
    case "procuraduria":
      return { accion: reglas.procuraduria, motivo: "Tiene antecedentes disciplinarios." };
    case "contraloria": {
      const fallos = lista(r.records);
      const valores = fallos.map((f) => Number(f.amount));
      const fechas = fallos.map((f) => new Date(String(f.ruling_date ?? "")).getTime());
      if (fallos.length && reglas.contraloriaValorTolerado > 0 && valores.every((v) => Number.isFinite(v) && v <= reglas.contraloriaValorTolerado)) {
        return { accion: "tolera", motivo: `Responsable fiscal por ${pesos(Math.max(...valores))} o menos: no supera los ${pesos(reglas.contraloriaValorTolerado)} que se toleran.` };
      }
      const limite = new Date(hoy);
      limite.setFullYear(limite.getFullYear() - reglas.contraloriaAniosTolerado);
      if (fallos.length && reglas.contraloriaAniosTolerado > 0 && fechas.every((t) => Number.isFinite(t) && t <= limite.getTime())) {
        return { accion: "tolera", motivo: `Responsable fiscal con fallos de hace ${reglas.contraloriaAniosTolerado} años o más: se toleran.` };
      }
      return { accion: reglas.contraloria, motivo: `Es responsable fiscal${fallos.length ? ` (${fallos.length} ${fallos.length === 1 ? "fallo" : "fallos"})` : ""}.` };
    }
    case "rnmc": {
      const medidas = lista(r.pending_measures);
      const textos = medidas.map((m) => sinTildes(Object.values(m).join(" ")));
      const palabra = reglas.rnmcPalabras.find((p) => textos.some((t) => t.includes(sinTildes(p))));
      if (palabra) return { accion: "revision", motivo: `Tiene una medida correctiva que nunca se tolera («${palabra}»).` };
      // Dice que tiene medidas pero no trae la lista (revisión a mano): no se puede contar.
      if (!medidas.length) return { accion: reglas.rnmcExceso === "tolera" ? "revision" : reglas.rnmcExceso, motivo: "Tiene medidas correctivas pendientes, sin el detalle para contarlas." };
      const n = medidas.length;
      const cuantas = `${n} ${n === 1 ? "medida correctiva pendiente" : "medidas correctivas pendientes"}`;
      return n <= reglas.rnmcMaxToleradas
        ? { accion: "tolera", motivo: `Tiene ${cuantas}: se toleran hasta ${reglas.rnmcMaxToleradas}.` }
        : { accion: reglas.rnmcExceso, motivo: `Tiene ${cuantas}: más de las ${reglas.rnmcMaxToleradas} que se toleran.` };
    }
  }
}

/**
 * ¿Con este veredicto el proceso puede seguir (quedar listo para citar, citarse)?
 * Sí con limpio o tolerable; con revisión o descarte, solo si una persona lo
 * aprobó. Mientras falten fuentes obligatorias, no.
 */
export function permiteSeguir(veredicto: VeredictoAntecedentes | null | undefined, decision?: string | null): boolean {
  if (!veredicto || veredicto === "pendiente" || decision === "rechazado") return false;
  return veredicto === "limpio" || veredicto === "tolerable" || decision === "aprobado";
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
    /** Reglas de Gestión Humana. Sin ellas, todo hallazgo va a revisión. */
    reglas?: ReglasAntecedentes;
    /** Para las reglas con fecha (antigüedad del fallo). */
    hoy?: Date;
  } = {}
): EvaluacionAntecedentes {
  const reglas = opciones.reglas ?? REGLAS_TODO_A_REVISION;
  const fuentes: FuenteEvaluada[] = FUENTES_ANTECEDENTES.map((fuente) => {
    const filas = consultas.filter((c) => c.fuente === fuente);
    // Vale la última consulta con veredicto; si no hay, la última que haya.
    const ok = filas.find((c) => c.estado === "ok" && hallazgoDe(fuente, c.resultado, opciones) != null);
    const ultima = ok ?? filas[0];
    if (!ultima) return { fuente, estado: "sin_consultar", detalle: null };
    if (ultima.estado === "pendiente") return { fuente, estado: "pendiente", detalle: "En curso en Croma" };
    const h = ultima.estado === "ok" ? hallazgoDe(fuente, ultima.resultado, opciones) : null;
    if (h == null) return { fuente, estado: "error", detalle: ultima.error ?? "Sin veredicto" };
    const texto = ((ultima.resultado as Record<string, unknown>)?.status as string | undefined)?.trim() || null;
    if (!h) return { fuente, estado: "limpio", detalle: texto };
    return { fuente, estado: "hallazgo", detalle: texto, ...accionDeHallazgo(fuente, ultima.resultado, reglas, opciones.hoy) };
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
  // Manda la acción más severa. Un hallazgo que solo se tolera no frena, pero
  // tampoco tapa una fuente obligatoria que todavía no responde.
  const acciones = fuentes.map((f) => f.accion);
  const veredicto: VeredictoAntecedentes = acciones.includes("descarta")
    ? "descarta"
    : acciones.includes("revision")
      ? "revision"
      : !cuentan.every((f) => f.estado === "limpio" || f.estado === "hallazgo")
        ? "pendiente"
        : acciones.includes("tolera")
          ? "tolerable"
          : "limpio";
  return { resultado, veredicto, fuentes,...(limpio && faltan.includes("rnmc") ? { faltaRnmc: true } : {}), ...(limpio && faltan.length ? { faltan } : {}) };
}
