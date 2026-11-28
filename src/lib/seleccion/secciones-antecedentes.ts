/**
 * Pestaña «Antecedentes» de Selección (25-nov-2026, pedido de Gestión Humana):
 * por cada fuente que se consulta en Croma, qué devuelve, los casos posibles y
 * qué hace Gestivo con cada uno: pasa solo, revisión manual o propone cierre.
 * Cada caso es un ajuste de `seleccion_ajustes` (o un resultado fijo, que se
 * muestra para que la tabla esté completa). También arma los ejemplos del
 * probador. PURO: lo usa la pantalla y se prueba.
 */
import { evaluarAntecedentes, type ConsultaGuardada, type EvaluacionAntecedentes, type FuenteAntecedentes, type ReglasAntecedentes } from "./antecedentes";

export interface CasoAntecedente {
  /** Ajuste que lo decide. Sin clave, el resultado es fijo. */
  clave?: string;
  etiqueta: string;
  ayuda?: string;
  sufijo?: string;
  /** Resultado fijo (no se parametriza). */
  fijo?: "pasa" | "revision" | "espera" | "pregunta";
}

export interface FuenteReglas {
  id: FuenteAntecedentes | "simit" | "runt" | "todas";
  titulo: string;
  /** Qué devuelve Croma de esa fuente, en una frase. */
  trae: string;
  /** Cuándo se consulta. */
  cuando: string;
  casos: CasoAntecedente[];
}

export const TEXTO_FIJO: Record<NonNullable<CasoAntecedente["fijo"]>, string> = {
  pasa: "Pasa solo",
  revision: "Revisión manual",
  espera: "Espera",
  pregunta: "El asistente le pregunta",
};

const ANTES_DE_CITAR = "Después de la preselección, antes de citar a la prueba de manejo.";
const EN_PRESELECCION = "Apenas autoriza el tratamiento de datos, en la preselección.";

export const TABLA_ANTECEDENTES: FuenteReglas[] = [
  {
    id: "policia",
    titulo: "Policía · antecedentes judiciales",
    trae: "Solo el veredicto (si tiene o no asuntos pendientes con las autoridades judiciales) y el nombre. No trae el detalle de los procesos.",
    cuando: ANTES_DE_CITAR,
    casos: [
      { etiqueta: "No tiene asuntos pendientes", fijo: "pasa" },
      { clave: "ant_policia_accion", etiqueta: "Tiene asuntos pendientes con las autoridades judiciales" },
      { clave: "ant_policia_palabras_revision", etiqueta: "Palabras que siempre van a revisión manual", ayuda: "Una por línea o separadas por comas. Si alguna aparece en el veredicto o en el detalle que devuelve la fuente, el caso va a revisión manual aunque la regla de arriba diga «Pasa solo» (y aunque la fuente no lo marque como hallazgo). Es una lista amplia para ir afinándola: quite las que manden casos de más y agregue las que vea en los certificados. Por ejemplo, el certificado «actualmente no es requerido por autoridad judicial alguna» es de quien tuvo antecedentes y ya los cumplió." },
      { clave: "ant_policia_sin_respuesta", etiqueta: "La consulta no responde", ayuda: "Croma falló o la fuente está caída. «Revisión manual» aplica cuando la consulta falla; mientras está en curso, espera." },
    ],
  },
  {
    id: "procuraduria",
    titulo: "Procuraduría · antecedentes disciplinarios",
    trae: "Si está registrado en el SIRI, el veredicto (tiene o no antecedentes) y el nombre. No trae el tipo de sanción: está en el certificado oficial.",
    cuando: ANTES_DE_CITAR,
    casos: [
      { etiqueta: "No presenta antecedentes, o no está registrado en el SIRI", fijo: "pasa" },
      { clave: "ant_procuraduria_accion", etiqueta: "Tiene antecedentes disciplinarios" },
      { clave: "ant_procuraduria_palabras_revision", etiqueta: "Palabras que siempre van a revisión manual", ayuda: "Una por línea o separadas por comas. Si alguna aparece en el veredicto o en el detalle que devuelve la fuente, el caso va a revisión manual aunque la regla de arriba diga «Pasa solo» (y aunque la fuente no lo marque como hallazgo). Es una lista amplia para ir afinándola: quite las que manden casos de más y agregue las que vea en los certificados." },
      { clave: "ant_procuraduria_sin_respuesta", etiqueta: "La consulta no responde" },
    ],
  },
  {
    id: "contraloria",
    titulo: "Contraloría · responsables fiscales",
    trae: "Si es responsable fiscal y, por cada fallo, el número, la fecha, el valor y la entidad afectada.",
    cuando: ANTES_DE_CITAR,
    casos: [
      { etiqueta: "No está reportado", fijo: "pasa" },
      { clave: "ant_contraloria_valor_tolerado", etiqueta: "Pasa solo si todos sus fallos son de este valor o menos", ayuda: "0 = el valor no importa (no se tolera por valor)." },
      { clave: "ant_contraloria_anios_tolerado", etiqueta: "Pasa solo si todos sus fallos tienen estos años o más", ayuda: "0 = la fecha no importa (no se tolera por antigüedad).", sufijo: "años" },
      { clave: "ant_contraloria_accion", etiqueta: "Es responsable fiscal y no lo cubre ninguna de las dos tolerancias" },
      { clave: "ant_contraloria_palabras_revision", etiqueta: "Palabras que siempre van a revisión manual", ayuda: "Una por línea o separadas por comas. Si alguna aparece en el veredicto o en el detalle que devuelve la fuente, el caso va a revisión manual aunque la regla de arriba diga «Pasa solo» (y aunque la fuente no lo marque como hallazgo). Es una lista amplia para ir afinándola: quite las que manden casos de más y agregue las que vea en los certificados. Aquí se mira sobre todo la entidad afectada de cada fallo: sirve para que un fallo pequeño o antiguo no pase solo si fue, por ejemplo, contra una empresa de transporte." },
      { clave: "ant_contraloria_sin_respuesta", etiqueta: "La consulta no responde", ayuda: "Es la consulta más lenta: a veces termina en segundo plano." },
    ],
  },
  {
    id: "rnmc",
    titulo: "RNMC · medidas correctivas (Código de Policía)",
    trae: "Si tiene medidas correctivas pendientes, la lista de medidas y el nombre del registro civil. Exige la fecha de expedición de la cédula.",
    cuando: "Desde la autorización de datos (y se reutiliza antes de citar).",
    casos: [
      { etiqueta: "No tiene medidas correctivas pendientes", fijo: "pasa" },
      { clave: "ant_rnmc_max_toleradas", etiqueta: "Pasa solo si tiene hasta este número de medidas pendientes", ayuda: "0 = ninguna.", sufijo: "medidas" },
      { clave: "ant_rnmc_accion_exceso", etiqueta: "Tiene más medidas que ese número" },
      { clave: "ant_rnmc_palabras_revision", etiqueta: "Palabras que siempre van a revisión manual", ayuda: "Una por línea o separadas por comas. Se buscan en la conducta de cada medida (numeral, literal, relato de los hechos y medidas impuestas, del portal de la Policía); no en el título del artículo ni en los descargos. Si alguna aparece, la revisa una persona aunque no supere el número. Una medida sin la conducta (el portal no respondió) también va a revisión." },
      { clave: "ant_rnmc_palabras_toleradas", etiqueta: "Conductas que se toleran aunque traigan una de esas palabras", ayuda: "Una por línea o separadas por comas. Si la conducta de una medida trae alguna (por ejemplo «tapabocas»: casi todas las de la pandemia quedaron como Art. 35 num. 2, desacatar una orden de policía), esa medida no va a revisión por las palabras de arriba; solo cuenta para el número máximo." },
      { etiqueta: "La fecha de expedición no corresponde a la cédula", ayuda: "El registro rechaza la consulta: no hay veredicto.", fijo: "pregunta" },
      { clave: "ant_rnmc_sin_respuesta", etiqueta: "La consulta no responde" },
    ],
  },
  {
    id: "todas",
    titulo: "Identidad · el nombre que devuelve la fuente",
    trae: "Policía, Procuraduría y RNMC devuelven el nombre de la persona consultada. Se compara con el nombre del aspirante: basta un nombre y un apellido en común.",
    cuando: "Con cada respuesta de esas tres fuentes.",
    casos: [
      { clave: "ant_nombre_no_coincide", etiqueta: "El nombre que devuelve la fuente no es el del aspirante", ayuda: "«Pasa solo»: no se compara (como hasta hoy). «Revisión manual»: una persona confirma que la consulta es de él, aunque haya salido limpia." },
      { etiqueta: "La fuente no devuelve el nombre", ayuda: "En el RNMC el veredicto vale si el RUNT ya confirmó a la persona con su cédula y apellido; si no, se toma como que no respondió.", fijo: "espera" },
    ],
  },
  {
    id: "simit",
    titulo: "SIMIT · multas de tránsito",
    trae: "El total adeudado y cada multa o acuerdo de pago.",
    cuando: EN_PRESELECCION,
    casos: [
      { clave: "simit_tope", etiqueta: "Pasa solo si debe hasta este valor", ayuda: "Tope de multas del requisito de la preselección." },
      { clave: "ant_simit_accion", etiqueta: "Debe más que el tope", ayuda: "«Propone cierre»: el proceso se cierra solo si pasan 30 minutos sin cambios. «Revisión manual»: no se cierra; el chat queda para una persona." },
      { clave: "simit_obligatorio", etiqueta: "SIMIT obligatorio para seguir", ayuda: "No: si la consulta no responde, pasa a antecedentes con la observación de que falta. Sí: espera." },
    ],
  },
  {
    id: "runt",
    titulo: "RUNT · licencia de conducción",
    trae: "El estado del conductor y cada licencia con su estado, sus categorías con fecha de vencimiento y sus restricciones.",
    cuando: EN_PRESELECCION,
    casos: [
      { clave: "licencias", etiqueta: "Categorías de licencia que sirven" },
      { clave: "licencia_vigencia_minima_meses", etiqueta: "Vigencia mínima que le debe quedar", ayuda: "0 = basta con que no esté vencida.", sufijo: "meses" },
      { etiqueta: "Licencia vencida", ayuda: "No descarta enseguida: si dice que la va a renovar, sigue con la observación; si dice que no, no cumple.", fijo: "pregunta" },
      { etiqueta: "Restricción de lentes", ayuda: "Se le recuerda en la citación que los lleve a la prueba de manejo.", fijo: "pasa" },
      { clave: "ant_licencia_accion", etiqueta: "La licencia no sirve", ayuda: "No tiene, la categoría no es de las pedidas, está cancelada, suspendida o retenida, tiene una restricción por pérdida auditiva, o está vencida y no la va a renovar. «Propone cierre»: cierra solo a los 30 minutos. «Revisión manual»: no se cierra; queda para una persona." },
      { clave: "runt_obligatorio", etiqueta: "RUNT obligatorio para seguir", ayuda: "No: si la consulta no responde, vale la licencia que dice el aspirante (con la foto y la observación). Sí: hace falta el RUNT o que una persona la verifique." },
    ],
  },
];

/** Ajustes que solo se editan en la pestaña Antecedentes (no van en Tiempos y reglas). */
export const SOLO_EN_ANTECEDENTES: readonly string[] = [
  ...TABLA_ANTECEDENTES.flatMap((f) => f.casos.map((c) => c.clave ?? "")).filter((c) => c.startsWith("ant_")),
  // Los sí/no de antes, reemplazados por «La consulta no responde».
  "policia_obligatorio",
  "procuraduria_obligatorio",
  "contraloria_obligatorio",
  "rnmc_obligatorio",
];

// ── Probador ─────────────────────────────────────────────────────────────────

export const NOMBRE_EJEMPLO = "ANA MARIA PEREZ GOMEZ";
const OTRO_NOMBRE = "CARLOS ALBERTO RUIZ DIAZ";

export type CasoProbador = "limpio" | "hallazgo" | "otro_nombre" | "no_responde" | "sin_consultar";

export const CASOS_PROBADOR: { id: CasoProbador; texto: string }[] = [
  { id: "limpio", texto: "Sin hallazgos" },
  { id: "hallazgo", texto: "Con hallazgo" },
  { id: "otro_nombre", texto: "Sin hallazgos, pero con otro nombre" },
  { id: "no_responde", texto: "La consulta falla (no responde)" },
  { id: "sin_consultar", texto: "Todavía no se consulta" },
];

export interface EjemploProbador {
  policia: CasoProbador;
  procuraduria: CasoProbador;
  contraloria: CasoProbador;
  rnmc: CasoProbador;
  /** Contraloría con hallazgo: valor y fecha del fallo. */
  contraloriaValor: number;
  contraloriaFecha: string;
  /** RNMC con hallazgo: cuántas medidas y qué dice cada una. */
  rnmcMedidas: number;
  rnmcTexto: string;
  /** Para probar las palabras: el veredicto de la Policía y de la Procuraduría, y la entidad afectada del fallo. Vacío: la frase habitual. */
  policiaTexto?: string;
  procuraduriaTexto?: string;
  contraloriaEntidad?: string;
}

export const EJEMPLO_BASE: EjemploProbador = {
  policia: "limpio",
  procuraduria: "limpio",
  contraloria: "limpio",
  rnmc: "limpio",
  contraloriaValor: 5_000_000,
  contraloriaFecha: "2024-06-15",
  rnmcMedidas: 1,
  rnmcTexto: "Consumo de bebidas alcohólicas en espacio público",
};

/**
 * Frases del veredicto de cada fuente (las que se han visto en las respuestas de
 * Croma y en los certificados). Las de «limpio» son las que ninguna palabra de la
 * lista de revisión debe encontrar.
 */
export const FRASES = {
  policia: { limpio: "NO TIENE ASUNTOS PENDIENTES CON LAS AUTORIDADES JUDICIALES", hallazgo: "TIENE ASUNTOS PENDIENTES CON LAS AUTORIDADES JUDICIALES" },
  procuraduria: { limpio: "El ciudadano no presenta antecedentes", hallazgo: "El ciudadano presenta antecedentes" },
  contraloria: { limpio: "NO SE ENCUENTRA REPORTADO COMO RESPONSABLE FISCAL", hallazgo: "SE ENCUENTRA REPORTADO COMO RESPONSABLE FISCAL" },
} as const;
/** Otras formas de la frase «limpia» que se han visto (certificados oficiales y la respuesta larga de la Contraloría). */
export const OTRAS_FRASES_LIMPIAS: readonly string[] = [
  "NO REGISTRA SANCIONES NI INHABILIDADES VIGENTES",
  "Que una vez consultado el Sistema de Información del Boletín de Responsables Fiscales 'SIBOR', hoy martes 17 de noviembre de 2026, a las 23:38:32, el número de identificación, relacionado a continuación, NO SE ENCUENTRA REPORTADO COMO RESPONSABLE FISCAL",
  "El documento de identidad no se encuentra registrado en el sistema",
];

/** La respuesta de Croma que correspondería a ese caso, con la forma real de cada fuente. */
export function consultaDeEjemplo(fuente: FuenteAntecedentes, e: EjemploProbador): ConsultaGuardada | null {
  const caso = e[fuente];
  if (caso === "sin_consultar") return null;
  if (caso === "no_responde") return { fuente, estado: "error", resultado: null, error: "Croma no respondió" };
  const hallazgo = caso === "hallazgo";
  // La Contraloría no devuelve el nombre: «otro nombre» ahí es un caso limpio.
  const nombre = caso === "otro_nombre" ? OTRO_NOMBRE : NOMBRE_EJEMPLO;
  switch (fuente) {
    case "policia":
      return { fuente, estado: "ok", resultado: { full_name: nombre, has_records: hallazgo, status: e.policiaTexto?.trim() || (hallazgo ? FRASES.policia.hallazgo : FRASES.policia.limpio) } };
    case "procuraduria":
      return { fuente, estado: "ok", resultado: { found: true, full_name: nombre, has_records: hallazgo, status: e.procuraduriaTexto?.trim() || (hallazgo ? FRASES.procuraduria.hallazgo : FRASES.procuraduria.limpio) } };
    case "contraloria":
      return {
        fuente,
        estado: "ok",
        resultado: {
          is_fiscal_responsible: hallazgo,
          status: hallazgo ? FRASES.contraloria.hallazgo : FRASES.contraloria.limpio,
          records: hallazgo ? [{ ruling_number: "001", ruling_date: e.contraloriaFecha, amount: e.contraloriaValor, affected_entity: e.contraloriaEntidad?.trim() || "Entidad de ejemplo" }] : [],
        },
      };
    case "rnmc":
      return {
        fuente,
        estado: "ok",
        resultado: {
          found: true,
          full_name: nombre,
          has_pending_measures: hallazgo,
          status: hallazgo ? "Tiene medidas correctivas pendientes por cumplir" : "No tiene medidas correctivas pendientes por cumplir",
          pending_measures: hallazgo ? Array.from({ length: Math.max(1, Math.min(20, Math.round(e.rnmcMedidas) || 1)) }, (_, i) => ({ expediente: `EJ-${i + 1}`, comportamiento: e.rnmcTexto })) : [],
        },
      };
  }
}

/** Lo que harían las reglas con ese ejemplo. */
export function probarReglas(reglas: ReglasAntecedentes, e: EjemploProbador, hoy: Date = new Date()): EvaluacionAntecedentes {
  const consultas = (["policia", "procuraduria", "contraloria", "rnmc"] as const).map((f) => consultaDeEjemplo(f, e)).filter((c): c is ConsultaGuardada => c != null);
  // En el probador la identidad se da por confirmada: lo que se prueba son las reglas.
  return evaluarAntecedentes(consultas, { reglas, hoy, nombre: NOMBRE_EJEMPLO, identidadConfirmada: true });
}

/** El veredicto global, en las mismas palabras de los selectores. */
export const TEXTO_VEREDICTO: Record<EvaluacionAntecedentes["veredicto"], { titulo: string; detalle: string }> = {
  limpio: { titulo: "Pasa solo", detalle: "Sin hallazgos: queda «Listo para citar»." },
  tolerable: { titulo: "Pasa solo", detalle: "Tiene hallazgos, pero las reglas los toleran: queda «Listo para citar»." },
  revision: { titulo: "Revisión manual", detalle: "Queda en «Antecedentes por revisar» hasta que una persona apruebe o rechace. Al aspirante se le dice que una persona revisará su proceso." },
  descarta: { titulo: "Propone cierre", detalle: "Gestivo propone cerrar el proceso; lo confirma una persona (también puede aprobarlo)." },
  pendiente: { titulo: "Espera", detalle: "Falta la respuesta de una fuente: el proceso no avanza hasta que responda o alguien la marque «Lo revisé a mano»." },
};
