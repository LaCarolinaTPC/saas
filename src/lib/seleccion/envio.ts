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
