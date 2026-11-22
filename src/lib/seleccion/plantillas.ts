/**
 * Plantillas de Meta del catálogo de selección (N3): estado sincronizado con
 * Meta y envío a aprobación de una versión nueva cuando cambia el texto.
 * Mientras Meta no apruebe la nueva, se sigue usando la aprobada.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { crearPlantilla, listarEstadosPlantillas } from "@/lib/comunicaciones/whatsapp";
import { EJEMPLOS, aFormatoMeta, siguienteVersionPlantilla, variablesDe, type MensajeSeleccion } from "./mensajes";

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
    const patch: Record<string, unknown> = { plantilla_revisada_at: new Date().toISOString() };
    // Una versión nueva enviada desde otra base (desarrollo es copia de producción y usa la
    // misma cuenta de Meta) no queda anotada aquí: si en Meta hay una «_vN» más nueva con el
    // mismo texto que el mensaje, se adopta como la propuesta.
    const detectada = m.plantilla_propuesta_nombre ? null : versionNuevaEnMeta(m, r.plantillas);
    if (detectada) {
      m.plantilla_propuesta_nombre = detectada.nombre;
      m.plantilla_propuesta_variables = variablesDe(m.texto);
      patch.plantilla_propuesta_nombre = detectada.nombre;
      patch.plantilla_propuesta_texto = m.texto;
      patch.plantilla_propuesta_variables = m.plantilla_propuesta_variables;
    }
    const propuesta = m.plantilla_propuesta_nombre ? porNombre.get(m.plantilla_propuesta_nombre) : undefined;

    if (propuesta?.estado === "APPROVED") {
      // La versión nueva ya está aprobada: pasa a ser la que se usa.
      patch.plantilla_nombre = propuesta.nombre;
      patch.plantilla_estado = "APPROVED";
      patch.plantilla_texto_aprobado = propuesta.cuerpo;
      patch.plantilla_categoria = propuesta.categoria;
      patch.plantilla_botones = propuesta.botones;
      // La versión nueva puede traer variables distintas: desde ahora se envía con las suyas.
      if (m.plantilla_propuesta_variables?.length || m.plantilla_propuesta_nombre) {
        patch.plantilla_variables = m.plantilla_propuesta_variables ?? m.plantilla_variables;
        patch.plantilla_propuesta_variables = null;
      }
      patch.plantilla_propuesta_nombre = null;
      patch.plantilla_propuesta_texto = null;
      patch.plantilla_propuesta_estado = null;
    } else {
      patch.plantilla_estado = activa?.estado ?? "NO_EXISTE";
      if (activa?.estado === "APPROVED") {
        patch.plantilla_texto_aprobado = activa.cuerpo;
        patch.plantilla_categoria = activa.categoria;
        patch.plantilla_botones = activa.botones;
      }
      if (m.plantilla_propuesta_nombre) patch.plantilla_propuesta_estado = propuesta?.estado ?? "NO_EXISTE";
    }
    const { error: e } = await db.from("seleccion_mensajes").update(patch).eq("clave", m.clave);
    if (!e) actualizadas++;
  }
  return { ok: true, actualizadas };
}

/** La «_vN» más nueva que la activa, en Meta, cuyo cuerpo es el texto actual del mensaje. */
export function versionNuevaEnMeta(
  m: Pick<MensajeSeleccion, "plantilla_nombre" | "texto">,
  plantillas: { nombre: string; cuerpo: string }[]
): { nombre: string } | null {
  if (!m.plantilla_nombre) return null;
  const raiz = m.plantilla_nombre.replace(/_v\d+$/, "");
  const actual = Number(m.plantilla_nombre.match(/_v(\d+)$/)?.[1] ?? 1);
  const cuerpo = aFormatoMeta(m.texto, variablesDe(m.texto));
  let mejor: { nombre: string; n: number } | null = null;
  for (const p of plantillas) {
    if (!p.nombre.startsWith(`${raiz}_v`)) continue;
    const n = Number(p.nombre.slice(raiz.length + 2));
    if (!Number.isInteger(n) || n <= actual || p.cuerpo !== cuerpo) continue;
    if (!mejor || n > mejor.n) mejor = { nombre: p.nombre, n };
  }
  return mejor ? { nombre: mejor.nombre } : null;
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
  // Primera vez (nunca se envió ni se aprobó, p. ej. «sel_orden_laboratorio»): con su nombre, sin «_v2».
  // «NO_EXISTE» (la sincronización no la encontró en Meta, p. ej. porque Meta rechazó el envío) también es primera vez.
  const primera = (!m.plantilla_estado || m.plantilla_estado === "NO_EXISTE") && !m.plantilla_texto_aprobado && !m.plantilla_propuesta_nombre;
  const nombre = primera ? m.plantilla_nombre : siguienteVersionPlantilla(base);
  // Las variables de la versión nueva salen del texto, en orden de aparición
  // (la aprobada sigue enviándose con las suyas hasta que Meta apruebe esta).
  const variables = variablesDe(m.texto);
  const cuerpo = aFormatoMeta(m.texto, variables);
  const r = await crearPlantilla({
    nombre,
    categoria: m.plantilla_categoria === "MARKETING" ? "MARKETING" : "UTILITY",
    cuerpo,
    ejemplos: variables.map((v) => EJEMPLOS[v] ?? v),
    botones: m.plantilla_botones,
  });
  if (!r.ok) return r;
  await db
    .from("seleccion_mensajes")
    .update(
      primera
        ? // La primera vez es la plantilla misma (no hay una aprobada que se siga usando mientras tanto).
          { plantilla_estado: r.estado, plantilla_variables: variables }
        : { plantilla_propuesta_nombre: nombre, plantilla_propuesta_texto: m.texto, plantilla_propuesta_estado: r.estado, plantilla_propuesta_variables: variables }
    )
    .eq("clave", clave);
  return { ok: true, nombre };
}
