/**
 * Buscador de la pantalla de Selección (25-nov-2026): con tantos mensajes,
 * tiempos, reglas y pestañas, una opción se pierde. Arma un índice de todo lo
 * que se puede cambiar (mensajes del catálogo, cada ajuste con su sección, los
 * casos de antecedentes y las secciones de las demás pestañas) y busca en él
 * sin tildes ni mayúsculas. Al elegir un resultado, la pantalla abre su pestaña
 * y baja hasta la opción. PURO: se prueba y lo usa el componente.
 */
import type { AjusteSeleccion } from "./ajustes";
import type { MensajeSeleccion } from "./mensajes";
import { agruparAjustes } from "./secciones-ajustes";
import { TABLA_ANTECEDENTES } from "./secciones-antecedentes";

export type PestanaBuscable = "mensajes" | "tiempos" | "antecedentes" | "laboratorios" | "ia" | "canal" | "probar";

export const NOMBRE_PESTANA: Record<PestanaBuscable, string> = {
  mensajes: "Mensajes",
  tiempos: "Tiempos y reglas",
  antecedentes: "Antecedentes",
  laboratorios: "Laboratorios",
  ia: "IA",
  canal: "Canal de WhatsApp",
  probar: "Probar el asistente",
};

export interface EntradaBuscador {
  pestana: PestanaBuscable;
  /** Lo que se muestra en el resultado. */
  titulo: string;
  /** Dónde está: «Tiempos y reglas › Citación y prueba de manejo». */
  donde: string;
  /** Id del elemento al que se baja; si no hay, `encabezado`. */
  ancla?: string;
  /** Texto del título de la sección a la que se baja (pestañas sin ids propios). */
  encabezado?: string;
  /** Todo el texto en el que se busca, ya normalizado. */
  texto: string;
}

/** Id del elemento de un ajuste y de un mensaje en la pantalla. */
export const anclaAjuste = (clave: string) => `ajuste-${clave}`;
export const anclaMensaje = (clave: string) => `mensaje-${clave}`;

/** Sin tildes, en minúsculas y sin signos: «¿Citación?» → «citacion». */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

/** Secciones de las pestañas que no son listas de ajustes, con las palabras por las que se buscan. */
const FIJAS: { pestana: PestanaBuscable; titulo: string; encabezado?: string; ancla?: string; palabras: string }[] = [
  { pestana: "tiempos", titulo: "Conversación por WhatsApp", ancla: "conversacion", palabras: "horario de los mensajes automaticos recordatorio silencio no responde sigues interesado pasar a una persona espera" },
  { pestana: "tiempos", titulo: "Rutas del reconocimiento de ruta", ancla: anclaAjuste("rutas_minimas"), palabras: "lista de rutas obligatorias agregar ruta gema" },
  { pestana: "antecedentes", titulo: "Probar con un ejemplo", ancla: "probador", palabras: "probador simular caso reglas palabras certificado" },
  { pestana: "antecedentes", titulo: "Aplicar las reglas a los aspirantes en curso", ancla: "aplicar", palabras: "reevaluar volver a evaluar aplicar ahora" },
  { pestana: "laboratorios", titulo: "Laboratorios", encabezado: "Laboratorios", palabras: "laboratorio examenes medicos biobac rescate direccion telefono correo whatsapp reparto dias de atencion orden word frase resultado" },
  { pestana: "laboratorios", titulo: "Carta del banco", encabezado: "Carta del banco", palabras: "banco de bogota cuenta de ahorros carta firma sello firmante cargo plantilla word pdf" },
  { pestana: "laboratorios", titulo: "Orden del día al laboratorio", encabezado: "Orden del día al laboratorio", palabras: "orden diaria correo citados enviar vista previa" },
  { pestana: "laboratorios", titulo: "Simulador de laboratorios", encabezado: "Simulador", palabras: "simular reparto respuesta del laboratorio documentos al aspirante" },
  { pestana: "ia", titulo: "Chat: proveedor y modelo del asistente", encabezado: "Chat", palabras: "ia modelo proveedor anthropic claude openrouter openai haiku sonnet clave api" },
  { pestana: "ia", titulo: "Documentos: IA que lee cédula, licencia y hoja de vida", encabezado: "Documentos", palabras: "lectura documentos modelo proveedor fotos pdf word" },
  { pestana: "ia", titulo: "Voz: transcripción de audios", encabezado: "Voz", palabras: "audios notas de voz transcribir whisper gpt 4o" },
  { pestana: "ia", titulo: "Instrucciones del agente (prompt)", encabezado: "Instrucciones del agente", palabras: "prompt instrucciones tono estilo como habla el asistente" },
  { pestana: "ia", titulo: "Proceso de selección: preguntas del asistente", encabezado: "Proceso de selección", palabras: "preguntas requisitos orden datos que pide prefiltro" },
  { pestana: "ia", titulo: "Paso a una persona", encabezado: "Paso a una persona", palabras: "transferencia humano frases hablar con una persona memoria espera antes de responder segundos" },
  { pestana: "ia", titulo: "Últimas respuestas del asistente", encabezado: "Últimas respuestas", palabras: "historial ejecuciones tokens costo errores" },
  { pestana: "canal", titulo: "Canal de WhatsApp: credenciales de Meta", encabezado: "Canal de WhatsApp", palabras: "phone number id access token waba app secret verify token numero conectado" },
  { pestana: "canal", titulo: "Webhook en Meta", encabezado: "Webhook en Meta", palabras: "webhook url callback verificacion" },
  { pestana: "probar", titulo: "Probar el asistente (chat de prueba)", palabras: "chat de prueba simular aspirante croma simulado profesor" },
];

/** Todo lo que se puede buscar. `disponibles`: las pestañas que ve esta persona (IA y Canal son del administrador). */
export function indiceSeleccion(mensajes: readonly MensajeSeleccion[], ajustes: readonly AjusteSeleccion[], disponibles: readonly PestanaBuscable[]): EntradaBuscador[] {
  const out: EntradaBuscador[] = [];
  const porClave = new Map(ajustes.map((a) => [a.clave, a]));

  for (const m of mensajes) {
    out.push({
      pestana: "mensajes",
      titulo: m.nombre,
      donde: "Mensajes",
      ancla: anclaMensaje(m.clave),
      texto: normalizar(`${m.nombre} ${m.cuando} ${m.clave} ${m.texto} ${m.plantilla_nombre ?? ""} mensaje`),
    });
  }

  for (const s of agruparAjustes([...ajustes])) {
    out.push({ pestana: "tiempos", titulo: s.titulo, donde: "Tiempos y reglas", ancla: s.id, texto: normalizar(`${s.titulo} ${s.detalle} seccion`) });
    for (const f of s.filas) {
      out.push({
        pestana: "tiempos",
        titulo: f.etiqueta,
        donde: `Tiempos y reglas › ${s.titulo}`,
        ancla: anclaAjuste(f.ajuste.clave),
        texto: normalizar(`${f.etiqueta} ${f.ayuda ?? ""} ${f.ajuste.nombre} ${f.ajuste.clave} ${s.titulo}`),
      });
    }
  }

  for (const fuente of TABLA_ANTECEDENTES) {
    out.push({ pestana: "antecedentes", titulo: fuente.titulo, donde: "Antecedentes", ancla: `ant-${fuente.id}`, texto: normalizar(`${fuente.titulo} ${fuente.trae} ${fuente.id} croma fuente`) });
    for (const c of fuente.casos) {
      const a = c.clave ? porClave.get(c.clave) : undefined;
      // Sin la migración el ajuste todavía no existe: no hay a dónde ir.
      if (c.clave && !a) continue;
      out.push({
        pestana: "antecedentes",
        titulo: c.etiqueta,
        donde: `Antecedentes › ${fuente.titulo}`,
        ancla: a ? anclaAjuste(a.clave) : `ant-${fuente.id}`,
        texto: normalizar(`${c.etiqueta} ${c.ayuda ?? ""} ${a?.nombre ?? ""} ${c.clave ?? ""} ${fuente.titulo}`),
      });
    }
  }

  for (const f of FIJAS) {
    out.push({ pestana: f.pestana, titulo: f.titulo, donde: NOMBRE_PESTANA[f.pestana], ancla: f.ancla, encabezado: f.encabezado, texto: normalizar(`${f.titulo} ${f.palabras} ${NOMBRE_PESTANA[f.pestana]}`) });
  }

  return out.filter((e) => disponibles.includes(e.pestana));
}

/**
 * Resultados para lo escrito: tienen que estar todas las palabras (cada una
 * puede ser el comienzo de una palabra: «cita» encuentra «citación»). Primero
 * los que la traen en el título, después por el orden de la pantalla.
 */
export function buscarEnSeleccion(indice: readonly EntradaBuscador[], consulta: string, max = 12): EntradaBuscador[] {
  const palabras = normalizar(consulta).split(" ").filter((p) => p.length >= 2);
  if (!palabras.length) return [];
  const puntaje = (e: EntradaBuscador): number => {
    const titulo = ` ${normalizar(e.titulo)}`;
    const todo = ` ${e.texto}`;
    let p = 0;
    for (const w of palabras) {
      // Solo al comienzo de una palabra: «firma» no debe traer «confirmar».
      if (!todo.includes(` ${w}`)) return -1;
      // En el título pesa más.
      p += titulo.includes(` ${w}`) ? 6 : 2;
    }
    return p;
  };
  return indice
    .map((e, i) => ({ e, i, p: puntaje(e) }))
    .filter((x) => x.p >= 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, max)
    .map((x) => x.e);
}
