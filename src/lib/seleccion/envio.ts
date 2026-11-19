/**
 * Envía un mensaje del catálogo de selección a una conversación, según su
 * modo (N2) y la ventana de 24 h (NF2):
 *  - «revisar antes de enviar»: no envía; deja el texto como borrador sugerido
 *    en el chat y lo marca para una persona, que lo ajusta y envía (N4).
 *  - automático con la ventana abierta: texto libre con el texto del catálogo.
 *  - automático con la ventana cerrada: la plantilla aprobada de Meta. Si no
 *    está aprobada todavía, no se envía nada.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPlantilla, enviarTexto, renderizarPlantilla } from "@/lib/comunicaciones/whatsapp";
import { registrarSaliente } from "@/lib/comunicaciones/registro";
import { ventanaAbierta } from "@/lib/comunicaciones/seguimiento";
import { parametrosPlantilla, renderizarMensaje, type MensajeSeleccion } from "./mensajes";

export const FIRMA_SELECCION = "Selección automática";

export type ResultadoEnvio = "enviado" | "borrador" | "sin_plantilla" | "falta_dato" | "fallido";

export interface BorradorSugerido {
  clave: string;
  texto: string;
  /** Plantilla y parámetros para enviarlo con un clic si la ventana está cerrada. */
  plantilla: string | null;
  parametros: string[] | null;
  creado_at: string;
}

/** Texto y plantilla de un mensaje del catálogo con sus valores (lo que saldría). */
export function prepararMensaje(m: MensajeSeleccion, valores: Record<string, string>, nota?: string | null) {
  const base = renderizarMensaje(m.texto, valores);
  const aprobada = m.plantilla_nombre && m.plantilla_estado === "APPROVED" ? m.plantilla_nombre : null;
  const parametros = aprobada ? parametrosPlantilla(m.plantilla_variables, valores) : null;
  return { texto: nota ? `${base} ${nota}` : base, aprobada, parametros };
}

/**
 * Envío directo (entrega 2): lo pidió una persona que ya vio el mensaje (por
 * ejemplo, al citar), así que no pasa por «revisar antes de enviar». Con la
 * ventana de 24 h abierta sale como texto (con la nota, si la hay); cerrada,
 * por la plantilla aprobada y, si hay nota, esta queda en el chat como
 * borrador. Si no se puede enviar (sin plantilla o falta un dato) y
 * `borradorSiNoSale`, el texto queda como borrador para una persona.
 * No pausa al asistente: el aspirante puede responder «Sí, voy».
 */
export async function enviarMensajeDirecto(p: {
  conversacionId: string;
  telefono: string;
  ultimoEntranteAt: string | null;
  mensaje: MensajeSeleccion;
  valores: Record<string, string>;
  nota?: string | null;
  firma?: string | null;
  borradorSiNoSale?: boolean;
  /** No enviar: dejarlo como borrador para una persona (por ejemplo, si al mensaje le falta un dato). */
  soloBorrador?: boolean;
  ahora?: Date;
}): Promise<{ resultado: ResultadoEnvio; texto: string }> {
  const ahora = p.ahora ?? new Date();
  const { texto, aprobada, parametros } = prepararMensaje(p.mensaje, p.valores, p.nota);
  const firma = p.firma ?? FIRMA_SELECCION;
  const borrador = async (): Promise<ResultadoEnvio> => {
    const b: BorradorSugerido = { clave: p.mensaje.clave, texto, plantilla: aprobada, parametros, creado_at: ahora.toISOString() };
    const { error } = await createAdminClient().from("wa_conversaciones").update({ borrador_sugerido: b, requiere_humano: true }).eq("id", p.conversacionId);
    return error ? "fallido" : "borrador";
  };

  if (p.soloBorrador) return { resultado: await borrador(), texto };
  if (ventanaAbierta(p.ultimoEntranteAt, ahora)) {
    const envio = await enviarTexto(p.telefono, texto);
    await registrarSaliente(p.conversacionId, envio, { contenido: texto }, firma, { automatico: true });
    return { resultado: envio.ok ? "enviado" : "fallido", texto };
  }
  if (!aprobada || !parametros) {
    if (p.borradorSiNoSale) return { resultado: await borrador(), texto };
    return { resultado: !aprobada ? "sin_plantilla" : "falta_dato", texto };
  }
  const envio = await enviarPlantilla(p.telefono, { nombre: aprobada, idioma: "es", encabezado: [], cuerpo: parametros });
  const m = p.mensaje;
  const contenido = m.plantilla_texto_aprobado ? renderizarPlantilla(m.plantilla_texto_aprobado, parametros) : renderizarMensaje(m.texto, p.valores);
  await registrarSaliente(p.conversacionId, envio, { contenido, plantilla: aprobada }, firma, { automatico: true });
  return { resultado: envio.ok ? "enviado" : "fallido", texto: contenido };
}

export async function enviarMensajeSeleccion(p: {
  conversacionId: string;
  telefono: string;
  ultimoEntranteAt: string | null;
  mensaje: MensajeSeleccion;
  valores: Record<string, string>;
  ahora?: Date;
}): Promise<ResultadoEnvio> {
  const ahora = p.ahora ?? new Date();
  const { mensaje: m } = p;
  const texto = renderizarMensaje(m.texto, p.valores);
  const aprobada = m.plantilla_nombre && m.plantilla_estado === "APPROVED" ? m.plantilla_nombre : null;
  const parametros = aprobada ? parametrosPlantilla(m.plantilla_variables, p.valores) : null;

  if (m.modo === "revisar") {
    const borrador: BorradorSugerido = { clave: m.clave, texto, plantilla: aprobada, parametros, creado_at: ahora.toISOString() };
    const { error } = await createAdminClient()
      .from("wa_conversaciones")
      .update({ borrador_sugerido: borrador, requiere_humano: true })
      .eq("id", p.conversacionId);
    return error ? "fallido" : "borrador";
  }

  if (ventanaAbierta(p.ultimoEntranteAt, ahora)) {
    const envio = await enviarTexto(p.telefono, texto);
    await registrarSaliente(p.conversacionId, envio, { contenido: texto }, FIRMA_SELECCION, { automatico: true });
    return envio.ok ? "enviado" : "fallido";
  }

  if (!aprobada) return "sin_plantilla";
  if (!parametros) return "falta_dato";
  const envio = await enviarPlantilla(p.telefono, { nombre: aprobada, idioma: "es", encabezado: [], cuerpo: parametros });
  const contenido = m.plantilla_texto_aprobado ? renderizarPlantilla(m.plantilla_texto_aprobado, parametros) : texto;
  await registrarSaliente(p.conversacionId, envio, { contenido, plantilla: aprobada }, FIRMA_SELECCION, { automatico: true });
  return envio.ok ? "enviado" : "fallido";
}
