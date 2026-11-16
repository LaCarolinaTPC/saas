/**
 * Ejecuta la reactivación de aspirantes fríos (reglas en ./reactivacion.ts).
 * La llama el cron de seguimiento cada 15 minutos (/api/cron/seguimiento-whatsapp),
 * nunca el latido: así no envía desde equipos de desarrollo.
 * Sin la migración 20261113205625 no hace nada.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { leerConfigSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";
import { ACTOR_SISTEMA, cambiarEstadoProceso } from "@/lib/contratacion/servidor";
import { CAUSAS_NO_CONTRATO } from "@/lib/contratacion/constants";
import { primerNombre } from "./mensajes";
import { leerAjustes, leerMensajes, valoresFijos } from "./servidor";
import { enviarMensajeSeleccion } from "./envio";
import { accionReactivacion, tiemposDesdeAjustes, type ConversacionReactivacion } from "./reactivacion";
import type { DatosPrefiltro } from "./extraccion";

/** Tope de envíos por corrida (la siguiente, en 15 min, sigue con el resto). */
const MAX_ENVIOS = 40;
const CAUSA_INCOMUNICADO = CAUSAS_NO_CONTRATO.find((c) => c === "Incomunicado") ?? "Incomunicado";

export interface ResultadoReactivacion {
  omitida?: string;
  avisos: number;
  borradores: number;
  sinPlantilla: number;
  llamar: number;
  incomunicados: number;
  reiniciadas: number;
  fallidos: number;
}

interface Fila {
  id: string;
  estado: string | null;
  ultimo_mensaje_at: string;
  ultimo_entrante_at: string | null;
  reactivacion_paso: number;
  reactivacion_ultimo_at: string | null;
  prefiltro: Partial<DatosPrefiltro> | null;
  proceso_id: string | null;
  wa_contactos: unknown;
  procesos_contratacion: unknown;
}

const uno = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] : v) as T | null) ?? null;

export async function ejecutarReactivacion(ahora: Date = new Date()): Promise<ResultadoReactivacion> {
  const r: ResultadoReactivacion = { avisos: 0, borradores: 0, sinPlantilla: 0, llamar: 0, incomunicados: 0, reiniciadas: 0, fallidos: 0 };
  const [mensajes, ajustes, seguimiento] = await Promise.all([leerMensajes(), leerAjustes(), leerConfigSeguimiento()]);
  const aviso1 = mensajes.find((m) => m.clave === "reactivacion_1");
  const aviso2 = mensajes.find((m) => m.clave === "reactivacion_2");
  if (!aviso1 || !aviso2) return { ...r, omitida: "falta la migración 20261113205625 (catálogo de selección)" };
  const tiempos = tiemposDesdeAjustes(ajustes, seguimiento.config);
  const fijos = valoresFijos(ajustes);
  const db = createAdminClient();

  const limite = new Date(ahora.getTime() - tiempos.aviso1Horas * 3_600_000).toISOString();
  const { data, error } = await db
    .from("wa_conversaciones")
    .select(
      "id, estado, ultimo_mensaje_at, ultimo_entrante_at, reactivacion_paso, reactivacion_ultimo_at, prefiltro, proceso_id, wa_contactos(telefono, nombre), procesos_contratacion(estado, nombre, hoja_vida_recibida_at)"
    )
    .lt("reactivacion_paso", 4)
    .or(`reactivacion_paso.gt.0,ultimo_mensaje_at.lte.${limite}`)
    .order("ultimo_mensaje_at", { ascending: true })
    .limit(500);
  if (error) return { ...r, omitida: `consulta: ${error.message}` };

  let envios = 0;
  for (const f of (data ?? []) as Fila[]) {
    const proceso = uno<{ estado: string; nombre: string | null; hoja_vida_recibida_at: string | null }>(f.procesos_contratacion);
    const contacto = uno<{ telefono: string; nombre: string | null }>(f.wa_contactos);
    const c: ConversacionReactivacion = {
      ultimoMensajeAt: f.ultimo_mensaje_at,
      ultimoEntranteAt: f.ultimo_entrante_at,
      ultimoEsNuestro: !!f.ultimo_entrante_at && Date.parse(f.ultimo_mensaje_at) > Date.parse(f.ultimo_entrante_at),
      cerrada: f.estado === "cerrada",
      paso: f.reactivacion_paso ?? 0,
      ultimoPasoAt: f.reactivacion_ultimo_at,
      hojaVidaRecibida: Boolean(f.prefiltro?.hoja_vida) || Boolean(proceso?.hoja_vida_recibida_at),
      procesoEstado: proceso?.estado ?? null,
      buscaTrabajo: f.prefiltro?.busca_trabajo !== false,
      esAspirante: Boolean(f.prefiltro) || Boolean(f.proceso_id),
    };
    const accion = accionReactivacion(c, ahora, tiempos);
    if (!accion) continue;

    // Cada paso se reserva con un UPDATE condicional: dos corridas a la vez no lo repiten.
    const reservar = async (paso: number, extra: Record<string, unknown> = {}) => {
      const { data: tomada } = await db
        .from("wa_conversaciones")
        .update({ reactivacion_paso: paso, reactivacion_ultimo_at: ahora.toISOString(), ...extra })
        .eq("id", f.id)
        .eq("reactivacion_paso", c.paso)
        .select("id");
      return !!tomada?.length;
    };

    if (accion === "reiniciar") {
      if (await reservar(0, { reactivacion_ultimo_at: null, reactivacion_llamar_at: null })) r.reiniciadas++;
      continue;
    }
    if (accion === "llamar") {
      if (await reservar(3, { reactivacion_llamar_at: ahora.toISOString(), requiere_humano: true })) r.llamar++;
      continue;
    }
    if (accion === "incomunicado") {
      if (!(await reservar(4))) continue;
      if (f.proceso_id && proceso?.estado === "pendiente") {
        await cambiarEstadoProceso(f.proceso_id, "cierre", {
          actor: ACTOR_SISTEMA,
          causa: CAUSA_INCOMUNICADO,
          detalle: { motivo: `Sin respuesta en ${tiempos.incomunicadoDias} días tras la reactivación.` },
        }).catch((e) => console.error("[reactivacion] cierre por incomunicado:", e));
      }
      r.incomunicados++;
      continue;
    }

    // Avisos 1 y 2.
    if (envios >= MAX_ENVIOS || !contacto) continue;
    const mensaje = accion === "aviso1" ? aviso1 : aviso2;
    const siguiente = accion === "aviso1" ? 1 : 2;
    if (!(await reservar(siguiente))) continue;
    envios++;
    const nombre = primerNombre(f.prefiltro?.nombre ?? proceso?.nombre ?? contacto.nombre);
    const resultado = await enviarMensajeSeleccion({
      conversacionId: f.id,
      telefono: contacto.telefono,
      ultimoEntranteAt: f.ultimo_entrante_at,
      mensaje,
      valores: { ...fijos, nombre },
      ahora,
    });
    if (resultado === "enviado") r.avisos++;
    else if (resultado === "borrador") r.borradores++;
    // Un rechazo de WhatsApp queda registrado en el chat y no se reintenta (evita repetir el error cada 15 min).
    else if (resultado === "fallido") r.fallidos++;
    else {
      // Sin plantilla aprobada o sin nombre: se deshace el paso para reintentar cuando Meta apruebe.
      await db
        .from("wa_conversaciones")
        .update({ reactivacion_paso: c.paso, reactivacion_ultimo_at: c.ultimoPasoAt })
        .eq("id", f.id)
        .eq("reactivacion_paso", siguiente);
      r.sinPlantilla++;
    }
  }
  return r;
}
