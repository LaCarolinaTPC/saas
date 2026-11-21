/**
 * Prueba psicosensotécnica — los dos cuestionarios de personalidad e
 * integridad (PURO).
 *
 * Cumplen la labor de las pruebas comerciales que usaba Gestión Humana
 * (perfil de personalidad con competencias y riesgos, y prueba de valores),
 * sin copiarlas. Desde la versión 1.3 de la batería (21-nov-2026), donde el
 * International Personality Item Pool (ipip.ori.org, dominio público, uso
 * comercial permitido) tiene un ítem equivalente se usa ese ítem del IPIP-NEO
 * (Goldberg), traducido al español por nosotros: la traducción no está
 * validada. Lo que IPIP no cubre (rumor, alcohol, corrupción, manejo de la
 * información, simulación y las situaciones propias del conductor de bus) es
 * de redacción propia. Cada ítem IPIP guarda su original en `ipip`, y ninguno
 * repite los de la prueba de cinco rasgos de la misma batería.
 *
 * Sin baremos colombianos: el puntaje de 0 a 100 es el promedio de las
 * respuestas, no un percentil. El perfil esperado del cargo es configurable y
 * el concepto lo da la psicóloga.
 */

export const ESCALA_ACUERDO = ["Totalmente en desacuerdo", "En desacuerdo", "Ni de acuerdo ni en desacuerdo", "De acuerdo", "Totalmente de acuerdo"] as const;

/**
 * rasgo: estilo de personalidad (ni bueno ni malo; se compara con el cargo) ·
 * competencia: más es mejor · riesgo: más es peor · valor: integridad, más es
 * mejor · control: virtudes poco probables (detecta respuestas para quedar bien).
 */
export type GrupoEscala = "rasgo" | "competencia" | "riesgo" | "valor" | "control";

export const NOMBRE_GRUPO: Record<GrupoEscala, string> = {
  rasgo: "Personalidad",
  competencia: "Competencias",
  riesgo: "Riesgos",
  valor: "Valores",
  control: "Sinceridad",
};

export interface Escala {
  id: string;
  nombre: string;
  grupo: GrupoEscala;
  /** Solo integridad: factor al que pertenece el valor. */
  factor?: "rectitud" | "honra" | "confidencialidad";
  descripcion: string;
  /** Para el rasgo predominante. */
  alto?: string;
  /** Pregunta sugerida para la entrevista cuando sale fuera de lo esperado. */
  entrevista: string;
}

export interface ItemEscala {
  id: string;
  escala: string;
  texto: string;
  /** Estar de acuerdo puntúa en contra de la escala. */
  invertido?: boolean;
  /** Frase para la psicóloga si la respuesta va en la dirección de riesgo. */
  riesgo?: string;
  /** Pregunta sugerida para la entrevista en ese caso. */
  entrevista?: string;
  /** Si es del IPIP-NEO: el ítem original en inglés (la traducción es propia, sin validar). */
  ipip?: string;
}

// ── Perfil del cargo: personalidad, competencias y riesgos ─────────────────
// Aparte de la prueba de personalidad de cinco rasgos (IPIP, en ./bateria),
// que se mantiene: esta compara al aspirante con lo que espera el cargo.

export const ESCALAS_PERFIL: Escala[] = [
  {
    id: "dominancia", nombre: "Dominancia", grupo: "rasgo",
    descripcion: "Toma la iniciativa, decide rápido y afronta retos; le gusta dirigir.",
    alto: "Directo y decidido. Puede pasar por encima de la opinión de los demás.",
    entrevista: "Cuénteme una situación en la que tuvo que tomar una decisión difícil sin poder consultar a nadie. ¿Qué hizo?",
  },
  {
    id: "influencia", nombre: "Influencia", grupo: "rasgo",
    descripcion: "Sociable, persuasivo y entusiasta; se relaciona con facilidad.",
    alto: "Comunicativo y optimista. Puede descuidar el orden y los detalles.",
    entrevista: "¿Cómo maneja a un pasajero que quiere conversar o discutir mientras usted conduce?",
  },
  {
    id: "serenidad", nombre: "Serenidad", grupo: "rasgo",
    descripcion: "Calmado, paciente y constante; prefiere la estabilidad.",
    alto: "Estable y paciente, bueno siguiendo procedimientos. Puede costarle adaptarse a cambios rápidos.",
    entrevista: "Describa un día muy pesado en el trabajo. ¿Qué hizo para mantener la calma?",
  },
  {
    id: "cumplimiento", nombre: "Cumplimiento", grupo: "rasgo",
    descripcion: "Cuidadoso, ordenado y apegado a las normas y procedimientos.",
    alto: "Riguroso y metódico. Puede volverse inflexible o indeciso.",
    entrevista: "¿Qué hace cuando una instrucción de la empresa le parece innecesaria?",
  },
  { id: "trabajo_equipo", nombre: "Trabajo en equipo", grupo: "competencia", descripcion: "Colabora con los compañeros y comparte lo que sabe.", entrevista: "Cuénteme una vez en la que ayudó a un compañero sin que se lo pidieran." },
  { id: "asertividad", nombre: "Asertividad", grupo: "competencia", descripcion: "Dice lo que piensa con respeto y escucha a los demás.", entrevista: "¿Cómo le diría a un compañero que algo de lo que hace le molesta?" },
  { id: "responsabilidad", nombre: "Responsabilidad", grupo: "competencia", descripcion: "Cumple horarios y compromisos y cuida los equipos que le entregan.", entrevista: "¿Qué hace cuando sabe que no va a poder llegar a tiempo a un turno?" },
  { id: "orientacion_resultados", nombre: "Orientación a resultados", grupo: "competencia", descripcion: "Se pone metas y actúa con prontitud.", entrevista: "¿Qué meta se puso en su último trabajo y cómo le fue?" },
  { id: "servicio", nombre: "Servicio al usuario", grupo: "competencia", descripcion: "Trata con amabilidad y paciencia al público.", entrevista: "Cuénteme cómo atendió a un usuario grosero o molesto." },
  { id: "adaptabilidad", nombre: "Adaptabilidad", grupo: "competencia", descripcion: "Se acomoda a cambios de ruta, de horario o de reglas.", entrevista: "¿Cómo reaccionó la última vez que le cambiaron el horario o la ruta sin aviso?" },
  { id: "ansiedad", nombre: "Ansiedad", grupo: "riesgo", descripcion: "Preocupación, nervios y tensión frecuentes.", entrevista: "¿Qué situaciones del trabajo lo ponen más nervioso y qué hace al respecto?" },
  { id: "animo_bajo", nombre: "Ánimo bajo", grupo: "riesgo", descripcion: "Tristeza, cansancio y poca motivación frecuentes.", entrevista: "¿Cómo ha estado de ánimo en los últimos meses? ¿Qué le ayuda cuando se siente desanimado?" },
  { id: "agresividad", nombre: "Agresividad", grupo: "riesgo", descripcion: "Tendencia a responder con rabia o con fuerza.", entrevista: "Cuénteme la última vez que se enojó mucho en la vía. ¿Qué pasó y cómo reaccionó?" },
  { id: "impulsividad", nombre: "Impulsividad", grupo: "riesgo", descripcion: "Actúa o decide sin pensar en las consecuencias.", entrevista: "Describa una decisión que tomó de afán y de la que después se arrepintió." },
  { id: "rumor", nombre: "Rumor", grupo: "riesgo", descripcion: "Tendencia a repetir comentarios no confirmados sobre otros.", entrevista: "¿Qué hace cuando escucha un comentario sobre un compañero y no sabe si es cierto?" },
  {
    id: "simulacion", nombre: "Simulación", grupo: "control",
    descripcion: "Se atribuye virtudes poco probables: puede estar respondiendo para dar una imagen demasiado favorable.",
    entrevista: "Hábleme de un error que haya cometido en el trabajo y de lo que aprendió.",
  },
];

const P = (escala: string, n: number, texto: string, extra: Partial<ItemEscala> = {}): ItemEscala => ({ id: `${escala}_${n}`, escala, texto, ...extra });
/** Ítem del IPIP-NEO (Goldberg), traducido; `ipip` = el original en inglés. Id propio: no se confunde con las respuestas de la versión anterior. */
const I = (escala: string, n: number, texto: string, ipip: string, extra: Partial<ItemEscala> = {}): ItemEscala => ({ id: `${escala}_i${n}`, escala, texto, ipip, ...extra });

const ITEMS_PERFIL_POR_ESCALA: ItemEscala[] = [
  // Dominancia ≈ IPIP-NEO E3 (asertividad, en el sentido de tomar el mando).
  I("dominancia", 1, "Asumo el mando.", "Take charge."),
  I("dominancia", 2, "Trato de dirigir a los demás.", "Try to lead others."),
  I("dominancia", 3, "Tomo el control de las situaciones.", "Take control of things."),
  I("dominancia", 4, "Espero a que otros abran el camino.", "Wait for others to lead the way.", { invertido: true }),
  I("dominancia", 5, "Busco influir en los demás.", "Seek to influence others."),
  I("dominancia", 6, "Me guardo mis opiniones.", "Hold back my opinions.", { invertido: true }),
  // Influencia ≈ IPIP-NEO E1 (cordialidad) y E3 (persuasión).
  I("influencia", 1, "Hago amigos con facilidad.", "Make friends easily."),
  I("influencia", 2, "Entro en confianza rápido con la gente.", "Warm up quickly to others."),
  I("influencia", 3, "Le levanto el ánimo a la gente.", "Cheer people up."),
  I("influencia", 4, "Soy difícil de conocer.", "Am hard to get to know.", { invertido: true }),
  I("influencia", 5, "Mantengo a los demás a distancia.", "Keep others at a distance.", { invertido: true }),
  I("influencia", 6, "Logro convencer a otros de hacer cosas.", "Can talk others into doing things."),
  // Serenidad ≈ IPIP-NEO N2 invertida (ira) y O4 invertida (gusto por lo conocido).
  I("serenidad", 1, "Mantengo la calma.", "Keep my cool."),
  I("serenidad", 2, "Rara vez me irrito.", "Rarely get irritated."),
  I("serenidad", 3, "Prefiero quedarme con lo que ya conozco.", "Prefer to stick with things that I know."),
  I("serenidad", 4, "Pierdo los estribos.", "Lose my temper.", { invertido: true }),
  I("serenidad", 5, "Casi nunca me enojo.", "Seldom get mad."),
  I("serenidad", 6, "Con frecuencia estoy de mal humor.", "Am often in a bad mood.", { invertido: true }),
  // Cumplimiento ≈ IPIP-NEO C2 (orden), C6 (cautela) y C3 (sentido del deber).
  I("cumplimiento", 1, "Hago las cosas según un plan.", "Do things according to a plan."),
  I("cumplimiento", 2, "Evito cometer errores.", "Avoid mistakes."),
  I("cumplimiento", 3, "Quiero que todo quede exactamente bien.", "Want everything to be \"just right.\""),
  I("cumplimiento", 4, "Rompo las reglas.", "Break rules.", {
    invertido: true,
    riesgo: "Reconoce que rompe las reglas.",
    entrevista: "¿En qué casos le parece válido saltarse un procedimiento de la empresa?",
  }),
  I("cumplimiento", 5, "El desorden no me molesta.", "Am not bothered by disorder.", { invertido: true }),
  I("cumplimiento", 6, "Me gusta ordenar.", "Like to tidy up."),
  // Trabajo en equipo ≈ IPIP-NEO A3 (altruismo) y A4 (cooperación).
  I("trabajo_equipo", 1, "Me encanta ayudar a los demás.", "Love to help others."),
  I("trabajo_equipo", 2, "Me anticipo a lo que necesitan los demás.", "Anticipate the needs of others."),
  I("trabajo_equipo", 3, "Le llevo la contraria a los demás.", "Contradict others.", { invertido: true }),
  I("trabajo_equipo", 4, "Le doy la espalda a los demás.", "Turn my back on others.", { invertido: true }),
  // Asertividad: IPIP no tiene una escala de decir las cosas con respeto; dos ítems IPIP y dos propios.
  I("asertividad", 1, "Escojo mis palabras con cuidado.", "Choose my words with care."),
  I("asertividad", 2, "Tengo la lengua afilada.", "Have a sharp tongue.", { invertido: true }),
  P("asertividad", 1, "Cuando algo me molesta, lo digo con respeto."),
  P("asertividad", 3, "Escucho a los demás antes de dar mi opinión."),
  // Responsabilidad ≈ IPIP-NEO C3 (sentido del deber); la puntualidad, propia.
  I("responsabilidad", 1, "Cumplo mis promesas.", "Keep my promises."),
  I("responsabilidad", 2, "Pago mis cuentas a tiempo.", "Pay my bills on time."),
  I("responsabilidad", 3, "Hago que otros cumplan con mis deberes.", "Get others to do my duties.", {
    invertido: true,
    riesgo: "Reconoce que deja sus deberes en manos de otros.",
    entrevista: "Cuénteme qué hacía cuando no alcanzaba a cumplir con una tarea en su último trabajo.",
  }),
  P("responsabilidad", 1, "Llego a tiempo a mis compromisos.", {
    riesgo: "No se describe como puntual.",
    entrevista: "¿Cuántas veces llegó tarde en su último trabajo y por qué?",
  }),
  // Orientación a resultados ≈ IPIP-NEO C4 (búsqueda de logros).
  I("orientacion_resultados", 1, "Trabajo duro.", "Work hard."),
  I("orientacion_resultados", 2, "Convierto los planes en hechos.", "Turn plans into actions."),
  I("orientacion_resultados", 3, "Hago solo lo justo para salir del paso.", "Do just enough work to get by.", { invertido: true }),
  I("orientacion_resultados", 4, "Hago más de lo que se espera de mí.", "Do more than what's expected of me."),
  // Servicio ≈ IPIP-NEO A3 (altruismo); el trato al público molesto, propio.
  I("servicio", 1, "Tengo una palabra amable para todos.", "Have a good word for everyone."),
  P("servicio", 1, "Trato con amabilidad a las personas aunque estén molestas."),
  I("servicio", 2, "Me es indiferente lo que sienten los demás.", "Am indifferent to the feelings of others.", {
    invertido: true,
    riesgo: "Se describe indiferente a lo que sienten los demás.",
    entrevista: "¿Qué hace cuando un pasajero le reclama de mala manera por algo que no es su culpa?",
  }),
  I("servicio", 3, "Miro a los demás por encima del hombro.", "Look down on others.", { invertido: true }),
  // Adaptabilidad ≈ IPIP-NEO O4 (gusto por la novedad).
  I("adaptabilidad", 1, "Prefiero la variedad a la rutina.", "Prefer variety to routine."),
  I("adaptabilidad", 2, "Me gusta empezar cosas nuevas.", "Like to begin new things."),
  I("adaptabilidad", 3, "No me gustan los cambios.", "Dislike changes.", { invertido: true }),
  I("adaptabilidad", 4, "Me apego a las formas de siempre.", "Am attached to conventional ways.", { invertido: true }),
  // Ansiedad ≈ IPIP-NEO N1.
  I("ansiedad", 1, "Temo lo peor.", "Fear for the worst."),
  I("ansiedad", 2, "Le tengo miedo a muchas cosas.", "Am afraid of many things."),
  I("ansiedad", 3, "Me enredo en mis problemas.", "Get caught up in my problems."),
  I("ansiedad", 4, "Los acontecimientos no me alteran con facilidad.", "Am not easily disturbed by events.", { invertido: true }),
  // Ánimo bajo ≈ IPIP-NEO N3.
  I("animo_bajo", 1, "A menudo me siento decaído.", "Am often down in the dumps."),
  I("animo_bajo", 2, "Me siento desesperado.", "Feel desperate."),
  I("animo_bajo", 3, "Siento que mi vida no tiene rumbo.", "Feel that my life lacks direction."),
  I("animo_bajo", 4, "Me siento bien conmigo mismo.", "Feel comfortable with myself.", { invertido: true }),
  // Agresividad ≈ IPIP-NEO N2 (ira) y A4 invertida.
  I("agresividad", 1, "Me desquito con los demás.", "Get back at others.", {
    riesgo: "Dice que se desquita con los demás.",
    entrevista: "¿Qué hace cuando otro conductor le cierra el paso o lo insulta?",
  }),
  I("agresividad", 2, "Le grito a la gente.", "Yell at people.", { riesgo: "Dice que le grita a la gente." }),
  I("agresividad", 3, "Me enojo con facilidad.", "Get angry easily."),
  I("agresividad", 4, "No me molesto con facilidad.", "Am not easily annoyed.", { invertido: true }),
  // Impulsividad ≈ IPIP-NEO C6 invertida (cautela) y N5 (falta de moderación).
  I("impulsividad", 1, "Actúo sin pensar.", "Act without thinking.", { riesgo: "Reconoce que actúa sin pensar." }),
  I("impulsividad", 2, "Tomo decisiones precipitadas.", "Make rash decisions."),
  I("impulsividad", 3, "Hago cosas de las que después me arrepiento.", "Do things I later regret."),
  I("impulsividad", 4, "Resisto las tentaciones con facilidad.", "Easily resist temptations.", { invertido: true }),
  // Rumor: sin equivalente en IPIP; ítems propios.
  P("rumor", 1, "Me entero de la vida de mis compañeros."),
  P("rumor", 2, "Comento con otros lo que escucho sobre un compañero.", { riesgo: "Dice que comenta con otros lo que escucha sobre sus compañeros." }),
  P("rumor", 3, "Si no sé si algo es cierto, no lo repito.", { invertido: true }),
  P("rumor", 4, "Me gusta saber los chismes del trabajo."),
  // Simulación: virtudes poco probables (propios; IPIP no trae escala de deseabilidad social).
  P("simulacion", 1, "Nunca he dicho una mentira, ni siquiera una pequeña."),
  P("simulacion", 2, "Jamás me he enojado con nadie."),
  P("simulacion", 3, "Nunca he llegado tarde a ninguna parte."),
  P("simulacion", 4, "Siempre he cumplido todas las normas, sin excepción."),
  P("simulacion", 5, "Nunca he hablado mal de alguien a sus espaldas."),
  P("simulacion", 6, "Jamás he sentido envidia de otra persona."),
];

// ── Integridad y valores ───────────────────────────────────────────────────

export const FACTORES_INTEGRIDAD = [
  { id: "rectitud", nombre: "Rectitud", descripcion: "No violencia, rechazo al alcohol y las sustancias en el trabajo, y cumplimiento de normas." },
  { id: "honra", nombre: "Honra", descripcion: "Respeto por el dinero y los bienes ajenos; rechazo al fraude y a la corrupción." },
  { id: "confidencialidad", nombre: "Confidencialidad", descripcion: "Cuidado de la información y veracidad." },
] as const;

export const ESCALAS_INTEGRIDAD: Escala[] = [
  { id: "no_violencia", nombre: "No violencia", grupo: "valor", factor: "rectitud", descripcion: "Resuelve los conflictos sin agresión.", entrevista: "¿Qué haría si un pasajero lo insulta y lo provoca durante el recorrido?" },
  { id: "alcohol", nombre: "Rechazo al alcohol y las sustancias", grupo: "valor", factor: "rectitud", descripcion: "Considera incompatibles el alcohol y las sustancias con el trabajo y la conducción.", entrevista: "¿Qué opina de tomarse un par de cervezas al almuerzo en un día de trabajo?" },
  { id: "normas", nombre: "Cumplimiento de normas", grupo: "valor", factor: "rectitud", descripcion: "Respeta las normas de la empresa y de tránsito aunque nadie lo vigile.", entrevista: "Cuénteme una norma con la que no esté de acuerdo y cómo la cumple." },
  { id: "honestidad", nombre: "Honestidad", grupo: "valor", factor: "honra", descripcion: "Respeta el dinero y los bienes ajenos y de la empresa.", entrevista: "¿Qué haría si al final del turno le sobra dinero en el recaudo?" },
  { id: "no_fraude", nombre: "Conducta no fraudulenta", grupo: "valor", factor: "honra", descripcion: "No engaña ni altera documentos o cuentas para obtener un beneficio.", entrevista: "¿Qué haría si se equivoca en las cuentas a su favor y nadie se da cuenta?" },
  { id: "no_corrupcion", nombre: "No corrupción", grupo: "valor", factor: "honra", descripcion: "Rechaza sobornos, dádivas y favores indebidos.", entrevista: "¿Qué haría si alguien le ofrece dinero por dejar subir pasajeros sin pagar?" },
  { id: "informacion", nombre: "Manejo de la información", grupo: "valor", factor: "confidencialidad", descripcion: "Guarda la información de la empresa, los compañeros y los usuarios.", entrevista: "¿Qué información de su trabajo anterior considera que no debe comentar con nadie?" },
  { id: "veracidad", nombre: "Veracidad", grupo: "valor", factor: "confidencialidad", descripcion: "Dice la verdad e informa lo que pasa aunque lo perjudique.", entrevista: "Cuénteme una vez en la que reconoció un error aunque le trajera problemas." },
  {
    id: "simulacion", nombre: "Simulación", grupo: "control",
    descripcion: "Se atribuye virtudes poco probables: puede estar respondiendo para dar una imagen demasiado favorable.",
    entrevista: "¿Alguna vez se ha quedado con algo que no era suyo, aunque fuera pequeño? ¿Qué pasó?",
  },
];

const G = (escala: string, n: number, texto: string, extra: Partial<ItemEscala> = {}): ItemEscala => ({ id: `g_${escala}_${n}`, escala, texto, ...extra });
/** Ítem del IPIP-NEO, traducido (ver `I`). */
const GI = (escala: string, n: number, texto: string, ipip: string, extra: Partial<ItemEscala> = {}): ItemEscala => ({ id: `g_${escala}_i${n}`, escala, texto, ipip, ...extra });

const ITEMS_INTEGRIDAD_POR_ESCALA: ItemEscala[] = [
  // No violencia: dos ítems IPIP-NEO (A4 invertida) y tres propios del trabajo.
  GI("no_violencia", 1, "Me encanta una buena pelea.", "Love a good fight.", {
    invertido: true,
    riesgo: "Dice que le encanta una buena pelea.",
  }),
  G("no_violencia", 2, "A veces un golpe es la única forma de hacerse respetar.", {
    invertido: true,
    riesgo: "Está de acuerdo en que a veces un golpe es la única forma de hacerse respetar.",
    entrevista: "¿En qué situación le parecería justificado llegar a los golpes?",
  }),
  GI("no_violencia", 2, "Guardo rencor.", "Hold a grudge.", { invertido: true }),
  G("no_violencia", 4, "La violencia nunca soluciona un problema de trabajo."),
  G("no_violencia", 5, "Cuando estoy muy enojado, me retiro antes de decir algo de lo que me arrepienta."),
  // Alcohol y sustancias: sin equivalente en IPIP; ítems propios.
  G("alcohol", 1, "Un trago en horario de trabajo no le hace daño a nadie.", {
    invertido: true,
    riesgo: "Considera que un trago en horario de trabajo no le hace daño a nadie.",
    entrevista: "¿Qué efectos cree que tiene un par de tragos en la forma de conducir?",
  }),
  G("alcohol", 2, "Manejar después de tomar, aunque sea poco, es peligroso."),
  G("alcohol", 3, "Si un compañero llega con tragos a trabajar, hay que avisar."),
  G("alcohol", 4, "Tomarse unas cervezas ayuda a soportar un mal día de trabajo.", {
    invertido: true,
    riesgo: "Ve el alcohol como una forma de soportar un mal día de trabajo.",
  }),
  G("alcohol", 5, "Una persona que consume sustancias no debe conducir un vehículo con pasajeros."),
  // Cumplimiento de normas: dos ítems IPIP-NEO (C3) y tres propios.
  GI("normas", 1, "Trato de seguir las reglas.", "Try to follow the rules."),
  GI("normas", 2, "Hago lo contrario de lo que me piden.", "Do the opposite of what is asked.", { invertido: true }),
  G("normas", 1, "Las normas de la empresa se cumplen aunque nadie esté mirando."),
  G("normas", 2, "Saltarse una norma pequeña para terminar más rápido está bien.", {
    invertido: true,
    riesgo: "Acepta saltarse normas pequeñas para terminar más rápido.",
  }),
  G("normas", 4, "Las normas de tránsito son más bien sugerencias.", {
    invertido: true,
    riesgo: "Considera las normas de tránsito como sugerencias.",
    entrevista: "¿Qué norma de tránsito cree que se puede pasar por alto, y por qué?",
  }),
  // Honestidad: dos ítems IPIP-NEO (A2, moralidad) y tres propios.
  GI("honestidad", 1, "Me aprovecho de los demás.", "Take advantage of others.", {
    invertido: true,
    riesgo: "Reconoce que se aprovecha de los demás.",
  }),
  GI("honestidad", 2, "Nunca haría trampa con mis impuestos.", "Would never cheat on my taxes."),
  G("honestidad", 1, "Si encuentro dinero que no es mío en el vehículo, lo entrego."),
  G("honestidad", 2, "Quedarse con lo que olvidan los pasajeros no es robar.", {
    invertido: true,
    riesgo: "Cree que quedarse con lo que olvidan los pasajeros no es robar.",
    entrevista: "¿Qué hace con un objeto que un pasajero olvidó en el bus?",
  }),
  G("honestidad", 5, "Nunca usaría la plata del recaudo para un gasto personal, ni siquiera prestada."),
  // Conducta no fraudulenta: dos ítems IPIP-NEO (A2) y tres propios.
  GI("no_fraude", 1, "Hago trampa para salir adelante.", "Cheat to get ahead.", {
    invertido: true,
    riesgo: "Reconoce que hace trampa para salir adelante.",
  }),
  GI("no_fraude", 2, "Sé cómo darles la vuelta a las reglas.", "Know how to get around the rules.", { invertido: true }),
  G("no_fraude", 1, "Alteraría un documento si con eso consigo el trabajo que quiero.", {
    invertido: true,
    riesgo: "Alteraría un documento para conseguir un trabajo.",
    entrevista: "¿Qué opina de quien modifica un certificado laboral para que lo contraten?",
  }),
  G("no_fraude", 3, "Si me equivoco en las cuentas, lo informo aunque me descuenten."),
  G("no_fraude", 5, "Entrego cuentas claras aunque nadie las revise."),
  // No corrupción: sin equivalente en IPIP; ítems propios.
  G("no_corrupcion", 1, "Aceptaría dinero por dejar subir pasajeros sin pagar.", {
    invertido: true,
    riesgo: "Aceptaría dinero por dejar subir pasajeros sin pagar.",
    entrevista: "¿Qué hace si un pasajero le ofrece la mitad del pasaje para no registrarlo?",
  }),
  G("no_corrupcion", 2, "Si un agente de tránsito me pide plata para no ponerme un comparendo, se la doy.", {
    invertido: true,
    riesgo: "Le daría dinero a un agente de tránsito para evitar un comparendo.",
  }),
  G("no_corrupcion", 3, "Rechazaría un regalo que buscara un favor a cambio."),
  G("no_corrupcion", 4, "Usar una palanca para conseguir un beneficio es normal.", { invertido: true }),
  G("no_corrupcion", 5, "Informaría si veo a un compañero cobrando pasajes sin registrarlos."),
  // Manejo de la información: sin equivalente en IPIP; ítems propios.
  G("informacion", 1, "Lo que me cuentan en confianza no lo repito."),
  G("informacion", 2, "Comentar los problemas internos de la empresa con amigos no tiene nada de malo.", { invertido: true }),
  G("informacion", 3, "Los datos de los pasajeros y de los compañeros son privados."),
  G("informacion", 4, "Compartiría información de la empresa si me pagan bien.", {
    invertido: true,
    riesgo: "Compartiría información de la empresa a cambio de dinero.",
  }),
  G("informacion", 5, "Si veo información que no me corresponde, no la uso."),
  // Veracidad: dos ítems IPIP-NEO (C3 y A2) y tres propios.
  GI("veracidad", 1, "Digo la verdad.", "Tell the truth."),
  GI("veracidad", 2, "Tergiverso los hechos.", "Misrepresent the facts.", { invertido: true }),
  G("veracidad", 2, "Si cometo un error, lo reconozco."),
  G("veracidad", 3, "A veces es mejor ocultar lo que pasó para no complicar las cosas.", {
    invertido: true,
    riesgo: "Considera que a veces es mejor ocultar lo que pasó.",
    entrevista: "Si tiene un pequeño choque sin testigos, ¿qué hace?",
  }),
  G("veracidad", 4, "Cuando hay un incidente en la ruta, informo exactamente lo que ocurrió."),
  // Simulación: virtudes poco probables (propios).
  G("simulacion", 1, "Nunca en mi vida he tomado algo que no era mío, ni siquiera un lapicero."),
  G("simulacion", 2, "Jamás he dicho una mentira."),
  G("simulacion", 3, "Siempre he respetado todas las señales de tránsito."),
  G("simulacion", 4, "Nunca me he quedado con un cambio de más."),
  G("simulacion", 5, "Jamás he pensado en hacer trampa."),
  G("simulacion", 6, "Nunca he criticado a un jefe."),
];

/**
 * Orden de presentación: se intercalan las escalas para que no salgan
 * seguidas varias preguntas de lo mismo (es más difícil responder «para
 * quedar bien» en una escala que se reconoce).
 */
export function intercalar(items: ItemEscala[]): ItemEscala[] {
  const grupos = new Map<string, ItemEscala[]>();
  for (const it of items) grupos.set(it.escala, [...(grupos.get(it.escala) ?? []), it]);
  // Las escalas más largas primero: así la última vuelta (donde solo quedan ellas) no repite la escala con que terminó la anterior.
  const colas = [...grupos.values()].sort((a, b) => b.length - a.length);
  const salida: ItemEscala[] = [];
  for (let i = 0; salida.length < items.length; i++) for (const c of colas) if (c[i]) salida.push(c[i]);
  return salida;
}

export const ITEMS_PERFIL: ItemEscala[] = intercalar(ITEMS_PERFIL_POR_ESCALA);
export const ITEMS_INTEGRIDAD: ItemEscala[] = intercalar(ITEMS_INTEGRIDAD_POR_ESCALA);

/** Escalas de personalidad que se comparan con el perfil del cargo (todas menos la de simulación). */
export const ESCALAS_CON_PERFIL = ESCALAS_PERFIL.filter((e) => e.grupo !== "control");
