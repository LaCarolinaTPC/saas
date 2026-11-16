/**
 * Selección de conductores en el servidor: ajustes configurables, semáforo de
 * preselección guardado en el proceso y avance automático a antecedentes.
 * Sin sesión: lo usan la pantalla, el asistente de WhatsApp y las tareas.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResultadoPreseleccionGuardado } from "@/lib/contratacion/constants";
import { ACTOR_SISTEMA, cambiarEstadoProceso, registrarEvento } from "@/lib/contratacion/servidor";
import {
  REGLAS_POR_DEFECTO,
  cartaLaboralPendiente,
  causaPropuesta,
  debeAvanzarAAntecedentes,
  debeConsultarRunt,
  debeConsultarSimit,
  evaluarPreseleccion,
  reglasDesdeAjustes,
  type ReglasPreseleccion,
} from "./preseleccion";
import { renderizarMensaje, type MensajeSeleccion } from "./mensajes";
import type { AjusteSeleccion } from "./ajustes";
import type { ResumenRunt } from "@/lib/verificacion/proveedores";
import type { LicenciaVerificada } from "@/lib/comunicaciones/agente/motor";

export type { AjusteSeleccion };

/** Filas de seleccion_ajustes; vacío si la migración aún no está aplicada. */
export async function leerAjustes(): Promise<AjusteSeleccion[]> {
  const { data, error } = await createAdminClient().from("seleccion_ajustes").select("*").order("orden");
  if (error) return [];
  return (data ?? []) as AjusteSeleccion[];
}

export async function leerReglas(): Promise<ReglasPreseleccion> {
  const filas = await leerAjustes();
  return filas.length ? reglasDesdeAjustes(filas) : REGLAS_POR_DEFECTO;
}

/** Valor de un ajuste (o el de respaldo si no existe o está vacío). */
export function valorAjuste<T>(ajustes: AjusteSeleccion[], clave: string, respaldo: T): T {
  const v = ajustes.find((a) => a.clave === clave)?.valor;
  if (v === undefined || v === null || v === "") return respaldo;
  return v as T;
}

/** Catálogo de mensajes; vacío si la migración aún no está aplicada. */
export async function leerMensajes(): Promise<MensajeSeleccion[]> {
  const { data, error } = await createAdminClient().from("seleccion_mensajes").select("*").order("orden");
  if (error) return [];
  return (data ?? []) as MensajeSeleccion[];
}

export async function leerMensaje(clave: string): Promise<MensajeSeleccion | null> {
  const { data, error } = await createAdminClient().from("seleccion_mensajes").select("*").eq("clave", clave).maybeSingle();
  if (error) return null;
  return (data as MensajeSeleccion | null) ?? null;
}

/** Valores fijos para las variables de los mensajes (dirección, laboratorio, enlace a la política). */
export function valoresFijos(ajustes: AjusteSeleccion[]): Record<string, string> {
  return {
    direccion: String(valorAjuste(ajustes, "direccion_sede", "")),
    laboratorio: String(valorAjuste(ajustes, "laboratorio_nombre", "")),
    enlace_politica: String(valorAjuste(ajustes, "enlace_politica", "")),
  };
}

/**
 * Texto de la autorización de datos (A4) listo para el asistente, con el
 * enlace a la política si está configurado. Null si el catálogo no existe.
 */
export async function textoAutorizacion(): Promise<string | null> {
  const [mensaje, ajustes] = await Promise.all([leerMensaje("autorizacion_datos"), leerAjustes()]);
  if (!mensaje) return null;
  return renderizarMensaje(mensaje.texto, valoresFijos(ajustes));
}

const SIMIT_REGISTRADO = new Set(["ok", "deuda", "acuerdo_pago"]);

export interface Reevaluacion {
  resultado: ResultadoPreseleccionGuardado;
  causaPropuesta: string | null;
  avanzo: boolean;
  consultarSimit: boolean;
  consultarRunt: boolean;
}

/**
 * Recalcula el semáforo del proceso y lo guarda. Si cambió el resultado global
 * deja el evento en el historial; con los 4 en verde y la autorización
 * aceptada pasa solo a antecedentes. Devuelve null si el proceso no existe o
 * la migración no está aplicada.
 */
export async function reevaluarPreseleccion(procesoId: string): Promise<Reevaluacion | null> {
  const admin = createAdminClient();
  const { data: p, error } = await admin
    .from("procesos_contratacion")
    .select(
      "id, estado, cedula, edad, ciudad_residencia, dispuesto_traslado, licencia_categoria, licencia_verificada_runt, licencia_runt, simit, simit_valor, experiencia_meses, autorizacion_datos, preseleccion"
    )
    .eq("id", procesoId)
    .maybeSingle();
  if (error || !p) return null;

  const reglas = await leerReglas();
  const simitEstado = (p.simit as string | null) ?? null;
  const resultado = evaluarPreseleccion(
    {
      edad: (p.edad as number | null) ?? null,
      ciudad: (p.ciudad_residencia as string | null) ?? null,
      dispuestoTraslado: (p.dispuesto_traslado as boolean | null) ?? null,
      licencia: (p.licencia_categoria as string | null) ?? null,
      licenciaVerificada: Boolean(p.licencia_verificada_runt),
      licenciaRunt: (p.licencia_runt as ResumenRunt | null) ?? null,
      simitEstado,
      simitValor: p.simit_valor == null ? null : Number(p.simit_valor),
      // El estado del SIMIT solo lo registran Croma o Gestión Humana, nunca el aspirante.
      simitVerificado: simitEstado != null && SIMIT_REGISTRADO.has(simitEstado),
      experienciaMeses: (p.experiencia_meses as number | null) ?? null,
    },
    reglas
  );

  const anterior = p.preseleccion as ResultadoPreseleccionGuardado | null;
  const causa = causaPropuesta(resultado);
  await admin
    .from("procesos_contratacion")
    .update({
      preseleccion: resultado,
      requisito_incumplido: causa,
      carta_laboral_pendiente: cartaLaboralPendiente((p.experiencia_meses as number | null) ?? null, reglas),
    })
    .eq("id", procesoId);

  if (anterior?.global !== resultado.global || anterior?.incumplido !== resultado.incumplido) {
    await registrarEvento(
      procesoId,
      {
        tipo: "preseleccion",
        causa,
        detalle: {
          global: resultado.global,
          edad: resultado.edad.color,
          residencia: resultado.residencia.color,
          licencia: resultado.licencia.color,
          simit: resultado.simit.color,
        },
      },
      ACTOR_SISTEMA
    );
  }

  let avanzo = false;
  const estado = p.estado as string;
  if (debeAvanzarAAntecedentes({ estado, autorizacion_datos: p.autorizacion_datos as string | null }, resultado)) {
    const r = await cambiarEstadoProceso(procesoId, "antecedentes", {
      actor: ACTOR_SISTEMA,
      detalle: { motivo: "Preselección con los 4 requisitos en verde y autorización de datos aceptada." },
    });
    avanzo = r.cambiado;
  }

  const consultarSimit = debeConsultarSimit(
    {
      cedula: (p.cedula as string | null) ?? null,
      autorizacion_datos: p.autorizacion_datos as string | null,
      simitConsultado: simitEstado != null && SIMIT_REGISTRADO.has(simitEstado),
    },
    resultado
  );
  const consultarRunt = debeConsultarRunt(
    {
      cedula: (p.cedula as string | null) ?? null,
      autorizacion_datos: p.autorizacion_datos as string | null,
      // Se vuelve a consultar solo si el aspirante corrigió la cédula.
      runtConsultado: runtConsultadoPara((p.licencia_runt as ResumenRunt | null) ?? null, (p.cedula as string | null) ?? null),
    },
    resultado
  );
  return { resultado, causaPropuesta: causa, avanzo, consultarSimit, consultarRunt };
}

/**
 * Lo que el asistente necesita de la selección para cada respuesta: el texto
 * de la autorización (A4) y los requisitos del cargo (B1), desde el catálogo y
 * los ajustes. Sin la migración, vacío: el asistente funciona como antes.
 */
export async function contextoSeleccion(): Promise<{
  autorizacion: string;
  requisitos: { edadMinima: number; edadMaxima: number; ciudades: string[]; licencias: string[] } | null;
}> {
  const [autorizacion, ajustes] = await Promise.all([textoAutorizacion().catch(() => null), leerAjustes()]);
  const reglas = ajustes.length ? reglasDesdeAjustes(ajustes) : null;
  return {
    autorizacion: autorizacion ?? "",
    requisitos: reglas
      ? { edadMinima: reglas.edadMinima, edadMaxima: reglas.edadMaxima, ciudades: reglas.ciudades, licencias: reglas.licencias }
      : null,
  };
}

/**
 * Licencia verificada en el RUNT del proceso de la conversación, para que el
 * asistente no la pregunte y, si no cumple, se lo diga enseguida. null si la
 * conversación no tiene proceso, si la licencia no se ha verificado o si falta la migración.
 */
export async function licenciaVerificadaDeConversacion(conversacionId: string): Promise<LicenciaVerificada | null> {
  const db = createAdminClient();
  const { data: conv } = await db.from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  const procesoId = (conv?.proceso_id as string | null) ?? null;
  if (!procesoId) return null;
  const { data: p, error } = await db.from("procesos_contratacion").select("licencia_runt, preseleccion").eq("id", procesoId).maybeSingle();
  if (error || !p?.licencia_runt) return null;
  const licencia = (p.preseleccion as ResultadoPreseleccionGuardado | null)?.licencia;
  if (!licencia || licencia.origen !== "verificado") return null;
  if ((p.licencia_runt as ResumenRunt).registrado === false) return { estado: "confirmar_cedula", motivo: licencia.motivo };
  if (licencia.color === "pendiente") return null;
  return { estado: licencia.color === "verde" ? "cumple" : "no_cumple", motivo: licencia.motivo };
}

/** ¿Ya se consultó el RUNT para esta cédula? Si la cédula cambió (la corrigió), no. */
export function runtConsultadoPara(runt: ResumenRunt | null, cedula: string | null): boolean {
  if (!runt) return false;
  if (!runt.cedula) return true;
  return runt.cedula === (cedula ?? "").replace(/\D/g, "");
}
