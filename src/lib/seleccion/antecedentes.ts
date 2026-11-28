/**
 * Antecedentes después de la preselección (pedido de GH del 17-nov-2026):
 * cuando cumple los 4 requisitos se consultan Policía, Procuraduría,
 * Contraloría y RNMC. Por ahora la regla es sencilla: si todas salen limpias
 * (y el prefiltro está completo), el chat queda «Listo para citar»; si alguna
 * trae un hallazgo, Gestión Humana lo revisa en la ficha. Desde la entrega 3
 * hay reglas de qué se tolera, y desde el 25-nov-2026 también qué pasa cuando
 * una fuente no responde o devuelve otro nombre. Se editan en Selección ›
 * Antecedentes. Funciones puras.
 */
import { nombresCoinciden } from "@/lib/verificacion/nombres";

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
 * Qué hacer cuando una fuente no responde (25-nov-2026). Antes era un sí/no
 * «obligatoria» por fuente: sí = espera, no = pasa.
 *  - espera: el proceso no avanza hasta que responda (o alguien la revise a mano);
 *  - pasa: sigue sin esa fuente, con la observación de que falta;
 *  - revision: si la consulta falló, el caso va a una persona.
 */
export type AccionSinRespuesta = "espera" | "pasa" | "revision";
export const ACCIONES_SIN_RESPUESTA: readonly AccionSinRespuesta[] = ["espera", "pasa", "revision"];
/** Si la fuente devuelve un nombre que no es el del aspirante. */
export type AccionNombre = "pasa" | "revision";

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
  /**
   * RNMC: palabras de conductas que se toleran aunque traigan una de la lista de
   * revisión (27-nov-2026; p. ej. «tapabocas»: casi todas son Art. 35 num. 2,
   * desacatar una orden de policía). Esa medida solo cuenta para el máximo.
   */
  rnmcPalabrasToleradas?: string[];
  /**
   * Si la fuente no responde. Sin el dato manda lo de antes (`opcionales` de
   * `evaluarAntecedentes`: los ajustes «… es obligatoria»).
   */
  policiaSinRespuesta?: AccionSinRespuesta;
  procuraduriaSinRespuesta?: AccionSinRespuesta;
  contraloriaSinRespuesta?: AccionSinRespuesta;
  rnmcSinRespuesta?: AccionSinRespuesta;
  /** El nombre que devuelve la fuente no es el del aspirante. Sin el dato no se compara (como antes). */
  nombreNoCoincide?: AccionNombre;
  /**
   * Palabras que mandan a revisión manual si aparecen en el veredicto o en el detalle
   * de la fuente (25-nov-2026), haya o no hallazgo. Con hallazgo, impiden que pase solo.
   */
  policiaPalabras?: string[];
  procuraduriaPalabras?: string[];
  contraloriaPalabras?: string[];
}

/** El ajuste de palabras de cada fuente que no es el RNMC (este tiene `rnmcPalabras`). */
export const CAMPO_PALABRAS: Record<Exclude<FuenteAntecedentes, "rnmc">, "policiaPalabras" | "procuraduriaPalabras" | "contraloriaPalabras"> = {
  policia: "policiaPalabras",
  procuraduria: "procuraduriaPalabras",
  contraloria: "contraloriaPalabras",
};

/** El ajuste «si no responde» de cada fuente (campo de `ReglasAntecedentes`). */
export const CAMPO_SIN_RESPUESTA: Record<FuenteAntecedentes, "policiaSinRespuesta" | "procuraduriaSinRespuesta" | "contraloriaSinRespuesta" | "rnmcSinRespuesta"> = {
  policia: "policiaSinRespuesta",
  procuraduria: "procuraduriaSinRespuesta",
  contraloria: "contraloriaSinRespuesta",
  rnmc: "rnmcSinRespuesta",
};

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

/**
 * Palabras sugeridas que mandan un caso a revisión manual, por fuente (25-nov-2026,
 * pedido de Gestión Humana: una lista amplia para ir afinando). Las siembra la
 * migración 20261125184953 y se cambian en Selección › Antecedentes. Se comparan
 * sin tildes ni mayúsculas y por fragmento («arma» también encuentra «armas»; por
 * eso van el nombre y el verbo).
 *  - RNMC: contra la descripción de cada medida pendiente.
 *  - Policía, Procuraduría y Contraloría: contra el veredicto (la frase corta del
 *    certificado) y el detalle de los registros que traiga; no contra el texto legal
 *    completo del certificado, que repite palabras como «condena» en todos los casos.
 *    Ninguna debe coincidir con la frase de «sin antecedentes» (hay una prueba).
 */
export const PALABRAS_SUGERIDAS: Record<FuenteAntecedentes, readonly string[]> = {
  policia: ["actualmente no es requerido", "requerido por autoridad", "es requerido", "orden de captura", "captura vigente", "circular", "medida de aseguramiento", "detención", "prisión", "privación de la libertad", "libertad condicional", "condenado", "sentencia condenatoria", "proceso penal", "investigación penal", "imputación", "sindicado", "prófugo", "fuga", "homicidio", "feminicidio", "tentativa", "lesiones personales", "violencia intrafamiliar", "acceso carnal", "abuso sexual", "acto sexual", "pornografía", "trata de personas", "secuestro", "extorsión", "amenazas", "hurto", "receptación", "estafa", "falsedad", "fraude", "concierto para delinquir", "porte ilegal", "fabricación, tráfico", "tráfico de estupefacientes", "estupefacientes", "contrabando", "lavado de activos", "terrorismo", "rebelión", "inasistencia alimentaria", "daño en bien ajeno", "embriaguez", "omisión de socorro"],
  procuraduria: ["destitución", "destituido", "inhabilidad general", "inhabilidad especial", "inhabilidad permanente", "suspensión en el ejercicio", "suspendido", "pérdida de investidura", "exclusión de la profesión", "terminación del contrato", "caducidad", "falta gravísima", "falta grave", "dolo", "dolosa", "culpa gravísima", "sanción penal", "condena", "prisión", "arresto", "interdicción", "pena accesoria", "responsabilidad fiscal", "pérdida del empleo", "multa", "peculado", "cohecho", "concusión", "prevaricato", "falsedad", "fraude", "celebración indebida", "acoso", "violencia", "lesiones", "homicidio", "hurto", "estupefacientes", "embriaguez", "abandono del cargo", "tránsito", "transporte", "conductor"],
  contraloria: ["dolo", "dolosa", "culpa grave", "solidaria", "solidario", "ejecutoriado", "cobro coactivo", "embargo", "transporte", "tránsito", "movilidad", "terminal de transporte", "combustible", "vehículo", "parque automotor", "peaje", "nómina", "caja menor", "tesorería", "anticipo", "contrato", "peculado", "apropiación", "hurto", "pérdida de bienes", "faltante", "sobrecosto"],
  rnmc: ["riña", "reñir", "pelea", "confrontación", "confrontaciones", "agresión", "agredir", "golpear", "lesiones", "lesionar", "amenaza", "amenazar", "intimidar", "violencia", "violenta", "maltrato", "arma", "cortopunzante", "cortante", "punzante", "cuchillo", "navaja", "machete", "explosivo", "pólvora", "autoridad", "irrespeto", "irrespetar", "desacato", "desobedecer", "incumplir orden", "resistirse", "impedir", "obstruir", "huir", "evadir", "alcohol", "embriaguez", "embriagantes", "licor", "estupefacientes", "psicoactivas", "drogas", "marihuana", "cocaína", "bazuco", "sustancias prohibidas", "hurto", "hurtar", "robo", "receptación", "daño en bien ajeno", "dañar", "acoso", "exhibicionismo", "obsceno", "actos sexuales", "prostitución", "niños", "adolescentes", "menores de edad", "transporte público", "tarifa", "vehículo", "conducir", "tránsito", "piques"],
};
export const PALABRAS_RNMC_SUGERIDAS: readonly string[] = PALABRAS_SUGERIDAS.rnmc;

/**
 * Conductas del RNMC que se sugiere tolerar (27-nov-2026): las de la pandemia, que
 * la Policía registró como Art. 35 num. 2 (desacatar una orden de policía) y que
 * por eso traen «autoridades» o «impedir». Las siembra la migración 20261127232742.
 */
export const PALABRAS_RNMC_TOLERADAS_SUGERIDAS: readonly string[] = ["tapabocas", "tapaboca", "mascarilla", "covid", "coronavirus", "cuarentena", "aislamiento preventivo", "aislamiento obligatorio", "toque de queda", "pico y cédula", "pico y cedula", "bioseguridad", "distanciamiento", "ley seca", "simulacro"];

/**
 * Los campos de una medida del RNMC donde está la conducta (para las palabras). No el
 * título del artículo (genérico: todo el Art. 35 dice «autoridades»), ni los descargos
 * (lo que dijo la persona), ni la tabla (Infractor, Municipio…: «Armando» traía «arma»).
 */
const CAMPOS_CONDUCTA = ["comportamiento", "numeral", "literal", "relato hechos", "relato", "descripcion", "medida", "medidas correctivas"];
function conductaDe(m: Record<string, unknown>): string {
  return sinTildes(
    Object.entries(m)
      .filter(([k]) => CAMPOS_CONDUCTA.includes(sinTildes(k)))
      .map(([, v]) => String(v ?? ""))
      .join(" ")
  );
}

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
  rnmcPalabrasToleradas: "ant_rnmc_palabras_toleradas",
  policiaSinRespuesta: "ant_policia_sin_respuesta",
  procuraduriaSinRespuesta: "ant_procuraduria_sin_respuesta",
  contraloriaSinRespuesta: "ant_contraloria_sin_respuesta",
  rnmcSinRespuesta: "ant_rnmc_sin_respuesta",
  nombreNoCoincide: "ant_nombre_no_coincide",
  policiaPalabras: "ant_policia_palabras_revision",
  procuraduriaPalabras: "ant_procuraduria_palabras_revision",
  contraloriaPalabras: "ant_contraloria_palabras_revision",
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
  // Lo nuevo (25-nov-2026) solo cuenta si el ajuste existe y trae un valor conocido.
  const sinRespuesta = (campo: keyof ReglasAntecedentes): AccionSinRespuesta | undefined => {
    const v = valor(campo);
    return ACCIONES_SIN_RESPUESTA.includes(v as AccionSinRespuesta) ? (v as AccionSinRespuesta) : undefined;
  };
  const nombre = valor("nombreNoCoincide");
  const extra: Partial<ReglasAntecedentes> = {};
  for (const f of FUENTES_ANTECEDENTES) {
    const v = sinRespuesta(CAMPO_SIN_RESPUESTA[f]);
    if (v) extra[CAMPO_SIN_RESPUESTA[f]] = v;
  }
  if (nombre === "pasa" || nombre === "revision") extra.nombreNoCoincide = nombre;
  for (const campo of [...Object.values(CAMPO_PALABRAS), "rnmcPalabrasToleradas" as const]) {
    const v = valor(campo);
    if (Array.isArray(v)) extra[campo] = v.map((x) => String(x).trim()).filter(Boolean);
  }
  return {
    ...extra,
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
  /**
   * Lo que dicen las reglas y por qué. Con hallazgo, siempre; sin hallazgo, solo
   * «revision» cuando la fuente no respondió o devolvió otro nombre (25-nov-2026).
   */
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

/**
 * Dónde se buscan las palabras de Policía, Procuraduría y Contraloría: el veredicto
 * (`status`) y el detalle de los registros (`records`). El `message` no: es el texto
 * legal completo del certificado y trae «condena», «pena» o «judicial» en todos los casos.
 */
function textoParaPalabras(resultado: unknown): string {
  const r = (resultado && typeof resultado === "object" ? resultado : {}) as Record<string, unknown>;
  const registros = Array.isArray(r.records) ? textoPlano(r.records) : "";
  return sinTildes(`${typeof r.status === "string" ? r.status : ""} ${registros}`).trim();
}

/**
 * Todo el texto de un valor, también lo anidado (27-nov-2026): la Procuraduría trae cada sección con
 * tablas (encabezado, columnas y filas) y antes quedaban como «[object Object]»: una «destitución»
 * dentro de la tabla de sanciones no se encontraba.
 */
function textoPlano(v: unknown, prof = 0): string {
  if (v == null || prof > 6) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => textoPlano(x, prof + 1)).join(" ");
  if (typeof v === "object") return Object.values(v as object).map((x) => textoPlano(x, prof + 1)).join(" ");
  return "";
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * ¿La medida del RNMC dice qué hizo la persona? (27-nov-2026). La tabla de Croma no
 * (Expediente, Formato, Fecha, Estado…); el detalle del portal sí (Artículo, Relato
 * Hechos), y la lectura de un certificado lo trae en «comportamiento» o «descripcion».
 */
export function tieneConducta(m: Record<string, unknown>): boolean {
  return Object.entries(m).some(([k, v]) => ["comportamiento", "articulo", "relato hechos", "relato", "descripcion", "numeral"].includes(sinTildes(k)) && String(v ?? "").trim() !== "");
}
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
      // Croma trae cada medida con las columnas del registro (visto el 27-nov-2026 con Pedro Luis:
      // Expediente, Formato, Fecha, Municipio, Apelación, Estado…), sin la conducta. Una medida
      // «Cerrado» ya se cumplió: el registro la sigue mostrando un año, pero no está pendiente.
      const estadoDe = (m: Record<string, unknown>) => String(Object.entries(m).find(([k]) => k.toLowerCase() === "estado")?.[1] ?? "");
      const todas = lista(r.pending_measures);
      const medidas = todas.filter((m) => !/cerrad|cumplid|pagad|archivad/i.test(estadoDe(m)));
      if (todas.length && !medidas.length) {
        return { accion: "tolera", motivo: `Solo tiene ${todas.length === 1 ? "una medida correctiva cerrada (cumplida)" : `${todas.length} medidas correctivas cerradas (cumplidas)`}: no hay pendientes.` };
      }
      // Sin la conducta no se puede decidir: va a revisión (abajo). Con ella, las palabras.
      const toleradas = (reglas.rnmcPalabrasToleradas ?? []).map((p) => p.trim()).filter(Boolean);
      const toleradaPor = (m: Record<string, unknown>) => toleradas.find((p) => conductaDe(m).includes(sinTildes(p))) ?? null;
      const conConducta = medidas.filter((m) => tieneConducta(m));
      const palabra = reglas.rnmcPalabras.find((p) => p.trim() && conConducta.some((m) => !toleradaPor(m) && conductaDe(m).includes(sinTildes(p.trim()))));
      if (palabra) return { accion: "revision", motivo: `Tiene una medida correctiva que nunca se tolera («${palabra}»).` };
      const porExcepcion = [...new Set(conConducta.map(toleradaPor).filter((x): x is string => !!x))];
      // Dice que tiene medidas pero no trae la lista (revisión a mano): no se puede contar.
      if (!medidas.length) return { accion: reglas.rnmcExceso === "tolera" ? "revision" : reglas.rnmcExceso, motivo: "Tiene medidas correctivas pendientes, sin el detalle para contarlas." };
      // Sin la conducta (GH, 27-nov-2026): Croma solo trae la tabla del expediente y el portal no
      // siempre responde; sin saber qué hizo no se tolera, lo revisa una persona.
      const sinConducta = medidas.filter((m) => !tieneConducta(m));
      if (sinConducta.length) {
        const expedientes = sinConducta.map((m) => String(Object.entries(m).find(([k]) => k.toLowerCase() === "expediente")?.[1] ?? "").trim()).filter(Boolean);
        return {
          accion: reglas.rnmcExceso === "descarta" ? "descarta" : "revision",
          motivo: `Tiene ${sinConducta.length === 1 ? "una medida correctiva pendiente" : `${sinConducta.length} medidas correctivas pendientes`} sin la conducta${
            expedientes.length ? ` (expediente ${expedientes.join(", ")}: búsquelo en el portal de la Policía, «Número de Comparendo o Expediente»)` : ""
          }.`,
        };
      }
      const n = medidas.length;
      const cuantas = `${n} ${n === 1 ? "medida correctiva pendiente" : "medidas correctivas pendientes"}`;
      const excepcion = porExcepcion.length ? ` La conducta trae «${porExcepcion.join("», «")}», que se tolera.` : "";
      return n <= reglas.rnmcMaxToleradas
        ? { accion: "tolera", motivo: `Tiene ${cuantas}: se toleran hasta ${reglas.rnmcMaxToleradas}.${excepcion}` }
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
    /** Nombre del aspirante en el proceso, para la regla «el nombre no coincide». */
    nombre?: string | null;
  } = {}
): EvaluacionAntecedentes {
  const reglas = opciones.reglas ?? REGLAS_TODO_A_REVISION;
  const opcionalesViejas = new Set<FuenteAntecedentes>([...(opciones.opcionales ?? []), ...(opciones.rnmcOpcional ? (["rnmc"] as const) : [])]);
  // Qué hacer si la fuente no responde: la regla nueva o, sin ella, el sí/no «obligatoria».
  const sinRespuesta = (f: FuenteAntecedentes): AccionSinRespuesta => reglas[CAMPO_SIN_RESPUESTA[f]] ?? (opcionalesViejas.has(f) ? "pasa" : "espera");
  // El nombre de la fuente no es el del aspirante: lo revisa una persona, haya o no hallazgo.
  const otroNombre = (resultado: unknown): string | null => {
    if (reglas.nombreNoCoincide !== "revision" || !opciones.nombre?.trim()) return null;
    const n = (resultado as Record<string, unknown> | null)?.full_name;
    return typeof n === "string" && n.trim() && !nombresCoinciden(n, opciones.nombre) ? n.trim() : null;
  };
  // Palabra de la lista de esa fuente que aparece en el veredicto o en el detalle de los registros.
  const palabraEn = (fuente: FuenteAntecedentes, resultado: unknown): string | null => {
    if (fuente === "rnmc") return null; // El RNMC mira sus medidas en accionDeHallazgo.
    const lista = reglas[CAMPO_PALABRAS[fuente]] ?? [];
    if (!lista.length) return null;
    const texto = textoParaPalabras(resultado);
    return texto ? (lista.find((p) => p.trim() && texto.includes(sinTildes(p.trim()))) ?? null) : null;
  };
  const base: FuenteEvaluada[] = FUENTES_ANTECEDENTES.map((fuente) => {
    const filas = consultas.filter((c) => c.fuente === fuente);
    // Vale la última consulta con veredicto; si no hay, la última que haya.
    const ok = filas.find((c) => c.estado === "ok" && hallazgoDe(fuente, c.resultado, opciones) != null);
    const ultima = ok ?? filas[0];
    if (!ultima) return { fuente, estado: "sin_consultar", detalle: null };
    if (ultima.estado === "pendiente") return { fuente, estado: "pendiente", detalle: "En curso en Croma" };
    const h = ultima.estado === "ok" ? hallazgoDe(fuente, ultima.resultado, opciones) : null;
    if (h == null) return { fuente, estado: "error", detalle: ultima.error ?? "Sin veredicto" };
    const texto = ((ultima.resultado as Record<string, unknown>)?.status as string | undefined)?.trim() || null;
    const otro = otroNombre(ultima.resultado);
    const porNombre = otro ? { accion: "revision" as const, motivo: `El nombre que devolvió la fuente («${otro}») no es el del aspirante.` } : null;
    const palabra = palabraEn(fuente, ultima.resultado);
    const porPalabra = palabra ? { accion: "revision" as const, motivo: `El resultado trae «${palabra}», que siempre revisa una persona.` } : null;
    // Sin hallazgo, pero con otro nombre o con una palabra de la lista en el veredicto: lo mira una persona.
    if (!h) return { fuente, estado: "limpio", detalle: texto, ...(porNombre ?? porPalabra ?? {}) };
    const porHallazgo = accionDeHallazgo(fuente, ultima.resultado, reglas, opciones.hoy);
    // Con otro nombre o con una palabra de la lista no pasa solo: manda la revisión, salvo que la regla ya descarte.
    const extra = [porNombre?.motivo, porPalabra?.motivo].filter(Boolean).join(" ");
    return { fuente, estado: "hallazgo", detalle: texto, ...(extra && porHallazgo.accion !== "descarta" ? { accion: "revision" as const, motivo: `${porHallazgo.motivo} ${extra}` } : porHallazgo) };
  });
  // La consulta falló y la regla dice «revisión»: va a una persona. (En curso o sin consultar todavía, espera.)
  const fuentes: FuenteEvaluada[] = base.map((f) =>
    f.estado === "error" && sinRespuesta(f.fuente) === "revision" ? { ...f, accion: "revision" as const, motivo: "La fuente no respondió: la revisa una persona (o se marca «Lo revisé a mano»)." } : f
  );
  const opcionales = new Set<FuenteAntecedentes>(FUENTES_ANTECEDENTES.filter((f) => sinRespuesta(f) === "pasa"));
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
