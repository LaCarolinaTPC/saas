/**
 * Catálogo de mensajes de la selección (N1–N3): variables, render del texto y
 * paso a parámetros de plantilla de Meta. Funciones puras, compartidas por la
 * pantalla de configuración y el servidor.
 */

export interface MensajeSeleccion {
  clave: string;
  nombre: string;
  cuando: string;
  orden: number;
  texto: string;
  texto_sugerido: string;
  modo: "automatico" | "revisar";
  variables: string[];
  plantilla_nombre: string | null;
  plantilla_variables: string[];
  plantilla_categoria: string | null;
  plantilla_estado: string | null;
  plantilla_texto_aprobado: string | null;
  plantilla_botones: string[];
  plantilla_propuesta_nombre: string | null;
  plantilla_propuesta_texto: string | null;
  plantilla_propuesta_estado: string | null;
  /** Variables de la versión propuesta, en el orden de {{1}}, {{2}}… (pueden ser distintas de las de la aprobada). */
  plantilla_propuesta_variables?: string[] | null;
  plantilla_revisada_at: string | null;
  actualizado_por: string | null;
  updated_at: string;
}

/** Qué significa cada variable y con qué se ve en la vista previa. */
/**
 * Mensajes del catálogo que el asistente de IA usa dentro de la conversación
 * para casos frecuentes (guion de Gestión Humana del 19-nov-2026), con cuándo
 * los usa. No tienen modo de envío ni plantilla de Meta: siempre responden a
 * algo que el aspirante acaba de escribir.
 */
export const RESPUESTAS_ASISTENTE: Record<string, string> = {
  registro_completo: "Cuando ya haya respondido las preguntas, aceptado la autorización y enviado la hoja de vida (queda registrado)",
  no_cumple_licencia:
    "Cuando le digas que su licencia no sirve para el cargo (otra categoría, no tiene licencia, o el RUNT dice que está vencida o con menos vigencia de la pedida)",
  fuera_de_zona: "Cuando, después de los intentos para animarlo, siga sin poder trasladarse",
  desistimiento: "Cuando diga que ya no le interesa seguir en el proceso (si no envió la hoja de vida, quita la frase de que la conservamos)",
  agradecimiento: "Cuando solo agradezca o se despida y no le falte nada por enviar",
  vehiculos: "Si pregunta qué vehículos se manejan",
  beneficios: "Si pregunta por los beneficios de trabajar en la empresa",
  no_seleccionado: "Si escribe después de que su proceso terminó porque no pasó la revisión (sin decirle el motivo)",
};

/** Nombre del asistente de IA mientras no se configure otro (Selección › Tiempos y reglas). */
export const NOMBRE_ASISTENTE_POR_DEFECTO = "Angie";

export const VARIABLES: Record<string, { descripcion: string; ejemplo: string }> = {
  asistente: { descripcion: "Nombre del asistente de IA", ejemplo: NOMBRE_ASISTENTE_POR_DEFECTO },
  contacto: { descripcion: "Persona por la que pregunta en la cita", ejemplo: "Yisseth" },
  nombre: { descripcion: "Primer nombre del aspirante", ejemplo: "Carlos" },
  fecha: { descripcion: "Fecha de la cita", ejemplo: "jueves 19 de noviembre" },
  hora: { descripcion: "Hora", ejemplo: "1:00 p. m." },
  direccion: { descripcion: "Dirección de la sede", ejemplo: "Calle 30 # 10-20, Barranquilla" },
  laboratorio: { descripcion: "Laboratorio", ejemplo: "Laboratorio Clínico Central" },
  pendientes: { descripcion: "Documentos que faltan", ejemplo: "cartas laborales y referencias" },
  lugar: { descripcion: "Lugar de la prueba", ejemplo: "La Carolina" },
  enlace_politica: { descripcion: "Enlace a la política de datos", ejemplo: "https://www.ejemplo.com/politica-datos" },
  cedula: { descripcion: "Cédula del aspirante", ejemplo: "1045730308" },
  cargo: { descripcion: "Cargo al que aspira", ejemplo: "CONDUCTOR - COBRADOR" },
  fase: { descripcion: "Fase de los exámenes médicos", ejemplo: "1" },
  rutas: { descripcion: "Cuántas rutas debe aprender en el reconocimiento", ejemplo: "2" },
  aprendidas: { descripcion: "Cuántas rutas lleva aprendidas", ejemplo: "1" },
  correo: { descripcion: "Correo electrónico del aspirante (prueba psicotécnica)", ejemplo: "carlos.perez@gmail.com" },
};

export const EJEMPLOS: Record<string, string> = Object.fromEntries(Object.entries(VARIABLES).map(([k, v]) => [k, v.ejemplo]));

/** Variables que aparecen en el texto, en orden de aparición y sin repetir. */
export function variablesDe(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))];
}

/** Primer nombre legible a partir del nombre de WhatsApp o del proceso. */
export function primerNombre(nombre: string | null | undefined): string {
  const limpio = (nombre ?? "").replace(/[^\p{L}\s'-]/gu, " ").trim();
  const primero = limpio.split(/\s+/)[0] ?? "";
  if (primero.length < 2) return "";
  return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
}

/**
 * Reemplaza las variables. Si una viene vacía: «, {var}» desaparece con su
 * coma («Hola, {nombre}.» → «Hola.») y, si queda en medio de una frase, se
 * quita la frase entera para no dejar huecos («…aquí: {enlace}.»).
 */
export function renderizarMensaje(texto: string, valores: Record<string, string | null | undefined>): string {
  const vacia = (k: string) => !(valores[k] ?? "").toString().trim();
  let r = texto.replace(/,\s*\{([a-z_]+)\}/g, (m, k: string) => (vacia(k) ? "" : m));
  r = r.replace(/[^.!?¿¡]*\{([a-z_]+)\}[^.!?]*[.!?]?\s*/g, (frase, k: string) => (vacia(k) ? " " : frase));
  r = r.replace(/\{([a-z_]+)\}/g, (_m, k: string) => (valores[k] ?? "").toString().trim());
  return r
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    // «a las 1:00 p. m..»: el punto del valor y el de la frase.
    .replace(/(?<!\.)\.\.(?!\.)/g, ".")
    // Lo mismo con el negrito de WhatsApp en medio: «*… 9:00 a. m.*.» → «*… 9:00 a. m.*».
    .replace(/(?<!\.)\.\*\.(?!\.)/g, ".*")
    .trim();
}

/**
 * Igual que renderizarMensaje, pero respeta los saltos de línea (renderizarMensaje
 * los junta en uno solo). Para los mensajes que salen como texto libre, como la
 * bienvenida, donde Gestión Humana puede escribir varios párrafos.
 */
export function renderizarConLineas(texto: string, valores: Record<string, string | null | undefined>): string {
  return texto
    .split(/\r?\n/)
    .map((l) => (l.trim() ? renderizarMensaje(l, valores) : ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Si no hay un nombre utilizable, la plantilla va con «qué tal»: «Hola, {{1}}.»
 * queda «Hola, qué tal.», natural en español, y la plantilla sí se puede enviar
 * (Meta no acepta variables vacías).
 */
export const NOMBRE_DE_RESPALDO = "qué tal";

/** Parámetros de la plantilla de Meta ({{1}}, {{2}}…) en el orden configurado. Null si falta alguno. */
export function parametrosPlantilla(variables: string[], valores: Record<string, string | null | undefined>): string[] | null {
  const params = variables.map((v) => (valores[v] ?? "").toString().trim() || (v === "nombre" ? NOMBRE_DE_RESPALDO : ""));
  return params.every(Boolean) ? params : null;
}

/** Texto con variables nombradas → formato de Meta ({nombre} → {{1}}) según el orden de la plantilla. */
export function aFormatoMeta(texto: string, variables: string[]): string {
  return saltosDeLinea(texto).replace(/\{([a-z_]+)\}/g, (m, k: string) => {
    const i = variables.indexOf(k);
    return i >= 0 ? `{{${i + 1}}}` : m;
  });
}

/**
 * Saltos de línea como los guarda Meta («\n»). Los textos pegados en el SQL
 * Editor de Windows llegan con «\r\n» y, sin esto, parecían distintos de la
 * plantilla aprobada.
 */
export function saltosDeLinea(texto: string): string {
  return texto.replace(/\r\n?/g, "\n").trim();
}

/**
 * Nombre de la siguiente versión de una plantilla de Meta: «sel_citacion» →
 * «sel_citacion_v2» → «sel_citacion_v3». Meta no deja editar el texto de una
 * plantilla aprobada sin volver a revisarla, así que cada cambio es otra.
 */
export function siguienteVersionPlantilla(nombre: string): string {
  const m = nombre.match(/^(.*)_v(\d+)$/);
  return m ? `${m[1]}_v${Number(m[2]) + 1}` : `${nombre}_v2`;
}

/** Errores de un texto editado: variables desconocidas, llaves sueltas o vacío. */
export function validarTextoMensaje(texto: string, permitidas: string[]): string[] {
  const errores: string[] = [];
  if (!texto.trim()) errores.push("El mensaje no puede quedar vacío.");
  if (texto.length > 1024) errores.push("El mensaje supera los 1024 caracteres que admite una plantilla de Meta.");
  const desconocidas = variablesDe(texto).filter((v) => !permitidas.includes(v));
  if (desconocidas.length) errores.push(`Variables no disponibles en este mensaje: ${desconocidas.map((v) => `{${v}}`).join(", ")}.`);
  if (/\{(?![a-z_]+\})|(?<!\{[a-z_]+)\}/.test(texto)) errores.push("Hay una llave { o } sin cerrar.");
  if (/^\s*\{[a-z_]+\}/.test(texto) || /\{[a-z_]+\}[\s.!?]*$/.test(texto)) {
    errores.push("Meta no acepta un mensaje que empiece o termine en una variable.");
  }
  return errores;
}
