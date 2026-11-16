/**
 * Plantillas de Meta del catálogo de selección (N3): estado sincronizado con
 * Meta y envío a aprobación de una versión nueva cuando cambia el texto.
 * Mientras Meta no apruebe la nueva, se sigue usando la aprobada.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { crearPlantilla, listarEstadosPlantillas } from "@/lib/comunicaciones/whatsapp";
import { EJEMPLOS, aFormatoMeta, siguienteVersionPlantilla, type MensajeSeleccion } from "./mensajes";

/** Actualiza el estado de las plantillas del catálogo con lo que dice Meta. */
export async function sincronizarPlantillas(): Promise<{ ok: true; actualizadas: number } | { ok: false; error: string }> {
  const r = await listarEstadosPlantillas();
  if (!r.ok) return r;
  const porNombre = new Map(r.plantillas.map((p) => [p.nombre, p]));
  const db = createAdminClient();
  const { data, error } = await db.from("seleccion_mensajes").select("*").not("plantilla_nombre", "is", null);
  if (error) return { ok: false, error: error.message };

  let actualizadas = 0;
  for (const m of (data ?? []) as MensajeSeleccion[]) {
    const activa = porNombre.get(m.plantilla_nombre!);
    const propuesta = m.plantilla_propuesta_nombre ? porNombre.get(m.plantilla_propuesta_nombre) : undefined;
    const patch: Record<string, unknown> = { plantilla_revisada_at: new Date().toISOString() };

    if (propuesta?.estado === "APPROVED") {
      // La versión nueva ya está aprobada: pasa a ser la que se usa.
      patch.plantilla_nombre = propuesta.nombre;
      patch.plantilla_estado = "APPROVED";
      patch.plantilla_texto_aprobado = propuesta.cuerpo;
      patch.plantilla_categoria = propuesta.categoria;
      patch.plantilla_propuesta_nombre = null;
      patch.plantilla_propuesta_texto = null;
      patch.plantilla_propuesta_estado = null;
    } else {
      patch.plantilla_estado = activa?.estado ?? "NO_EXISTE";
      if (activa?.estado === "APPROVED") {
        patch.plantilla_texto_aprobado = activa.cuerpo;
        patch.plantilla_categoria = activa.categoria;
      }
      if (m.plantilla_propuesta_nombre) patch.plantilla_propuesta_estado = propuesta?.estado ?? "NO_EXISTE";
    }
    const { error: e } = await db.from("seleccion_mensajes").update(patch).eq("clave", m.clave);
    if (!e) actualizadas++;
  }
  return { ok: true, actualizadas };
}

/**
 * Envía a Meta una versión nueva de la plantilla con el texto actual del
 * mensaje. No toca la aprobada: esa se sigue usando hasta que Meta apruebe.
 */
export async function enviarVersionPlantilla(clave: string): Promise<{ ok: true; nombre: string } | { ok: false; error: string }> {
  const db = createAdminClient();
  const { data, error } = await db.from("seleccion_mensajes").select("*").eq("clave", clave).maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "El mensaje no existe." };
  const m = data as MensajeSeleccion;
  if (!m.plantilla_nombre) return { ok: false, error: "Este mensaje no usa plantilla de Meta: se envía solo dentro de la ventana de 24 horas." };

  const base = m.plantilla_propuesta_nombre ?? m.plantilla_nombre;
  const nombre = siguienteVersionPlantilla(base);
  const cuerpo = aFormatoMeta(m.texto, m.plantilla_variables);
  if (/\{[a-z_]+\}/.test(cuerpo)) {
    return { ok: false, error: "El texto usa variables que la plantilla no tiene; use solo las del mensaje." };
  }
  const r = await crearPlantilla({
    nombre,
    categoria: m.plantilla_categoria === "MARKETING" ? "MARKETING" : "UTILITY",
    cuerpo,
    ejemplos: m.plantilla_variables.map((v) => EJEMPLOS[v] ?? v),
    botones: m.plantilla_botones,
  });
  if (!r.ok) return r;
  await db
    .from("seleccion_mensajes")
    .update({ plantilla_propuesta_nombre: nombre, plantilla_propuesta_texto: m.texto, plantilla_propuesta_estado: r.estado })
    .eq("clave", clave);
  return { ok: true, nombre };
}
