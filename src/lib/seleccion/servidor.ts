/**
 * Selección de conductores en el servidor: ajustes configurables, semáforo de
 * preselección guardado en el proceso y avance automático a antecedentes.
 * Sin sesión: lo usan la pantalla, el asistente de WhatsApp y las tareas.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { CAUSA_ANTECEDENTES, type ResultadoPreseleccionGuardado } from "@/lib/contratacion/constants";
import { ACTOR_SISTEMA, cambiarEstadoProceso, registrarEvento } from "@/lib/contratacion/servidor";
import {
  REGLAS_POR_DEFECTO,
  cartaLaboralPendiente,
  causaPropuesta,
  debeAvanzarAAntecedentes,
  faltaSoloSimit,
  debeConsultarRunt,
  debeConsultarSimit,
  evaluarPreseleccion,
  licenciaVerificadaDesdeRunt,
  reglasDesdeAjustes,
  type ReglasPreseleccion,
} from "./preseleccion";

/**
 * ¿Dijo que renueva la licencia vencida? null si no se sabe o si falta la
 * migración 20261117214219 (la columna no existe y la consulta falla sola).
 */
async function leerRenovara(procesoId: string): Promise<boolean | null> {
  const { data, error } = await createAdminClient().from("procesos_contratacion").select("renovara_licencia").eq("id", procesoId).maybeSingle();
  if (error || !data) return null;
  return (data.renovara_licencia as boolean | null) ?? null;
}
import { renderizarMensaje, type MensajeSeleccion } from "./mensajes";
import type { AjusteSeleccion } from "./ajustes";
import type { ResumenRunt } from "@/lib/verificacion/proveedores";
import type { FechaRechazada, LicenciaVerificada } from "@/lib/comunicaciones/agente/motor";
import { fechaExpedicionRechazada, verificacionEnCurso } from "@/lib/verificacion/servidor";
import { proveedorAntecedentes } from "@/lib/verificacion/proveedores";
import { FUENTES_ANTECEDENTES, evaluarAntecedentes, type ConsultaGuardada, type EvaluacionAntecedentes, type FuenteAntecedentes } from "./antecedentes";
import { PREFILTRO_VACIO, prefiltroCompleto, type DatosPrefiltro } from "./extraccion";
import { enviarTexto } from "@/lib/comunicaciones/whatsapp";
import { registrarSaliente } from "@/lib/comunicaciones/registro";
import { ventanaAbierta } from "@/lib/comunicaciones/seguimiento";
import { FIRMA_SELECCION } from "./envio";

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

  const [reglas, renovara] = await Promise.all([leerReglas(), leerRenovara(procesoId)]);
  const simitEstado = (p.simit as string | null) ?? null;
  const resultado = evaluarPreseleccion(
    {
      edad: (p.edad as number | null) ?? null,
      ciudad: (p.ciudad_residencia as string | null) ?? null,
      dispuestoTraslado: (p.dispuesto_traslado as boolean | null) ?? null,
      licencia: (p.licencia_categoria as string | null) ?? null,
      licenciaVerificada: Boolean(p.licencia_verificada_runt),
      licenciaRunt: (p.licencia_runt as ResumenRunt | null) ?? null,
      licenciaRenovara: renovara,
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
  // SIMIT opcional (ajuste `simit_obligatorio` en «no»): si ya se intentó y Croma
  // no respondió, no detiene al aspirante; pasa con la observación de que falta.
  const sinSimit = estado === "pendiente" && faltaSoloSimit(resultado) && !(await simitObligatorio()) && (await simitSinRespuesta(procesoId));
  if (debeAvanzarAAntecedentes({ estado, autorizacion_datos: p.autorizacion_datos as string | null }, resultado, sinSimit)) {
    const r = await cambiarEstadoProceso(procesoId, "antecedentes", {
      actor: ACTOR_SISTEMA,
      detalle:
        resultado.global === "pasa"
          ? { motivo: "Preselección con los 4 requisitos en verde y autorización de datos aceptada." }
          : { motivo: "Edad, residencia y licencia en verde. Falta el SIMIT (Croma no respondió): revisarlo a mano.", falta_simit: true },
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
  const { data: p, error } = await db.from("procesos_contratacion").select("licencia_runt").eq("id", procesoId).maybeSingle();
  if (error || !p?.licencia_runt) return null;
  // Mismo cálculo que el semáforo (y que el chat de prueba), con la respuesta sobre la renovación.
  const [reglas, renovara] = await Promise.all([leerReglas(), leerRenovara(procesoId)]);
  return licenciaVerificadaDesdeRunt(p.licencia_runt as ResumenRunt, reglas, new Date(), renovara);
}

/**
 * Fecha de expedición que el RNMC rechazó en el proceso de la conversación
 * (no corresponde a la cédula): el asistente la vuelve a pedir. null si no hay.
 */
export async function fechaRechazadaDeConversacion(conversacionId: string): Promise<FechaRechazada | null> {
  const { data: conv } = await createAdminClient().from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  const procesoId = (conv?.proceso_id as string | null) ?? null;
  return procesoId ? fechaExpedicionRechazada(procesoId) : null;
}

/** ¿La verificación del aspirante de la conversación sigue en curso (Croma demorado, RUNT pendiente)? */
export async function verificacionDemoradaDeConversacion(conversacionId: string): Promise<boolean> {
  const { data: conv } = await createAdminClient().from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  const procesoId = (conv?.proceso_id as string | null) ?? null;
  return procesoId ? verificacionEnCurso(procesoId) : false;
}

/** ¿Ya se consultó el RUNT para esta cédula? Si la cédula cambió (la corrigió), no. */
export function runtConsultadoPara(runt: ResumenRunt | null, cedula: string | null): boolean {
  if (!runt) return false;
  if (!runt.cedula) return true;
  return runt.cedula === (cedula ?? "").replace(/\D/g, "");
}

/**
 * ¿El SIMIT es obligatorio para pasar a antecedentes? Ajuste `simit_obligatorio`
 * (migración 20261118221044); sin el ajuste, sí.
 */
export async function simitObligatorio(): Promise<boolean> {
  const fila = (await leerAjustes().catch(() => [])).find((a) => a.clave === "simit_obligatorio");
  return fila ? fila.valor !== false : true;
}

/** ¿Ya se intentó el SIMIT de este proceso y Croma no ha respondido (en curso o con error)? */
async function simitSinRespuesta(procesoId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("verificaciones_externas")
    .select("estado")
    .eq("proceso_id", procesoId)
    .eq("fuente", "simit")
    .neq("estado", "reiniciada")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !error && (data?.estado === "error" || data?.estado === "pendiente");
}

/**
 * ¿El RNMC es obligatorio para «Listo para citar»? Ajuste `rnmc_obligatorio`
 * (migración 20261118190946); sin el ajuste, sí. En «no», mientras Croma no
 * responde el RNMC, los antecedentes quedan limpios sin él (con la observación).
 */
export async function rnmcObligatorio(): Promise<boolean> {
  const fila = (await leerAjustes().catch(() => [])).find((a) => a.clave === "rnmc_obligatorio");
  return fila ? fila.valor !== false : true;
}

/**
 * ¿El RUNT ya confirmó a la persona? Encontró la cédula consultada con su
 * apellido y el nombre no es de otra persona. Con eso un RNMC sin nombre vale
 * (el certificado de la Policía ya no imprime el nombre: 18-nov-2026).
 */
export async function identidadConfirmadaRunt(procesoId: string): Promise<boolean> {
  const { data } = await createAdminClient().from("procesos_contratacion").select("cedula, licencia_runt").eq("id", procesoId).maybeSingle();
  const r = (data?.licencia_runt as ResumenRunt | null) ?? null;
  if (!r || r.registrado === false || !r.identidadVerificada || r.nombreNoCoincide) return false;
  // Que sea de la cédula actual (si la corrigió, el RUNT anterior no vale).
  return runtConsultadoPara(r, (data?.cedula as string | null) ?? null);
}

/** Evalúa los antecedentes guardados del proceso (Policía, Procuraduría, Contraloría, RNMC). */
export async function evaluarAntecedentesProceso(procesoId: string): Promise<EvaluacionAntecedentes | null> {
  const { data, error } = await createAdminClient()
    .from("verificaciones_externas")
    .select("fuente, estado, resultado, error")
    .eq("proceso_id", procesoId)
    .in("fuente", [...FUENTES_ANTECEDENTES])
    // Las de antes de reiniciar un candidato del chat de prueba no cuentan.
    .neq("estado", "reiniciada")
    .order("created_at", { ascending: false });
  if (error) return null;
  const [identidadConfirmada, opcionales] = await Promise.all([identidadConfirmadaRunt(procesoId), fuentesOpcionales()]);
  const ev = evaluarAntecedentes((data ?? []) as ConsultaGuardada[], { identidadConfirmada, opcionales });
  await sincronizarAntecedentes(procesoId, ev).catch((e) => console.error("[seleccion] columna de antecedentes:", e));
  return ev;
}

/**
 * Lleva el resultado de los antecedentes a la columna «Antecedentes» del
 * proceso (la que se ve en la lista de Candidatos), que antes solo se llenaba
 * a mano. Con veredicto (limpio u hallazgo) manda lo consultado; mientras
 * falten fuentes solo pone «pendiente» si estaba vacía (no pisa lo de Gestión Humana).
 */
async function sincronizarAntecedentes(procesoId: string, ev: EvaluacionAntecedentes): Promise<void> {
  if (!ev.fuentes.some((f) => f.estado !== "sin_consultar")) return;
  const db = createAdminClient();
  if (ev.resultado === "pendiente") {
    await db.from("procesos_contratacion").update({ antecedentes: "pendiente" }).eq("id", procesoId).is("antecedentes", null);
    return;
  }
  const valor = ev.resultado === "limpio" ? "ok" : "con_antecedentes";
  await db.from("procesos_contratacion").update({ antecedentes: valor }).eq("id", procesoId).or(`antecedentes.is.null,antecedentes.neq.${valor}`);
}

/**
 * Fuentes de antecedentes que hoy no son obligatorias (ajustes
 * `policia_obligatorio`, `procuraduria_obligatorio`, `contraloria_obligatorio`
 * y `rnmc_obligatorio` en «no»). Sin el ajuste, la fuente es obligatoria.
 */
export async function fuentesOpcionales(): Promise<FuenteAntecedentes[]> {
  const ajustes = await leerAjustes().catch(() => []);
  return FUENTES_ANTECEDENTES.filter((f) => ajustes.find((a) => a.clave === `${f}_obligatorio`)?.valor === false);
}

/**
 * «Listo para citar» (pedido de GH del 17-nov-2026): prefiltro completo,
 * autorización aceptada, preselección sin rojos y, con Croma configurado,
 * los cuatro antecedentes limpios. Se marca una sola vez: el chat queda para
 * Gestión Humana sin pausar al agente. Sin Croma, como antes (sin antecedentes).
 * `datos` sirve cuando el proceso no tiene conversación (chat de prueba).
 */
export async function marcarListoParaCitar(procesoId: string, datos?: DatosPrefiltro | null): Promise<boolean> {
  const db = createAdminClient();
  const { data: p } = await db
    .from("procesos_contratacion")
    .select("estado, autorizacion_datos, preseleccion, reingreso, licencia_runt, licencia_categoria, licencia_verificada_runt")
    .eq("id", procesoId)
    .maybeSingle();
  if (!p || p.autorizacion_datos !== "si") return false;
  // Trabajó antes en la empresa: lo revisa una persona (lista «Reingresos por revisar»).
  if (p.reingreso) return false;
  if ((p.preseleccion as ResultadoPreseleccionGuardado | null)?.global === "no_cumple") return false;
  const { data: conv } = await db
    .from("wa_conversaciones")
    .select("id, prefiltro")
    .eq("proceso_id", procesoId)
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const prefiltro = (datos ?? (conv?.prefiltro as Partial<DatosPrefiltro> | null)) ?? null;
  // La licencia verificada en el RUNT cuenta aunque no la haya escrito: con ella el
  // asistente ya no se la pregunta (18-nov-2026), y sin esto nunca quedaría listo.
  const licenciaRunt = p.licencia_verificada_runt && p.licencia_categoria ? (p.licencia_categoria as string) : null;
  if (!prefiltro || !prefiltroCompleto({ ...PREFILTRO_VACIO, ...prefiltro, licencia: prefiltro.licencia ?? licenciaRunt })) return false;
  let faltaRnmc = false;
  // Lo que Croma no respondió y hay que revisar a mano (fuentes opcionales, SIMIT, RUNT).
  const faltan: string[] = [];
  if (proveedorAntecedentes()) {
    if (p.estado !== "antecedentes") return false;
    const ev = await evaluarAntecedentesProceso(procesoId);
    if (ev?.resultado !== "limpio") return false;
    faltaRnmc = ev.faltaRnmc === true;
    faltan.push(...(ev.faltan ?? []));
    // Sin el RUNT el semáforo usó la licencia que dijo el aspirante: falta verificarla.
    if (!p.licencia_runt) faltan.push("runt");
  }
  const { data: ya } = await db
    .from("procesos_contratacion_eventos")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("detalle->>listo_para_citar", "true")
    .gte("created_at", await inicioVigenteProceso(procesoId))
    .limit(1)
    .maybeSingle();
  if (ya) return false;
  if (conv) await db.from("wa_conversaciones").update({ requiere_humano: true }).eq("id", conv.id);
  // Con el RNMC opcional y sin su respuesta, queda la observación para que Gestión Humana lo revise a mano.
  // Pasó sin el SIMIT (opcional y Croma no respondió): queda la observación y no se cita solo.
  const pre = p.preseleccion as ResultadoPreseleccionGuardado | null;
  const faltaSimit = !!pre && pre.simit?.color !== "verde";
  if (faltaSimit) faltan.push("simit");
  await registrarEvento(
    procesoId,
    {
      tipo: "dato",
      detalle: { listo_para_citar: true, ...(faltaRnmc ? { falta_rnmc: true } : {}), ...(faltaSimit ? { falta_simit: true } : {}), ...(faltan.length ? { faltan } : {}) },
    },
    ACTOR_SISTEMA
  );
  // Con el ajuste `cita_automatica`, Gestivo lo cita de una vez (import diferido: la agenda usa este módulo).
  await import("./agenda-servidor")
    .then((m) => m.citarAutomaticamente(procesoId, { faltaRnmc: faltan.length > 0 }))
    .catch((e) => console.error("[seleccion] cita automática:", e));
  return true;
}

/**
 * Desde cuándo valen las marcas de «una sola vez» del proceso (Listo para
 * citar, revisión de antecedentes, aviso de no seleccionado, reingreso): desde
 * el último reinicio del chat de prueba (evento con detalle.reiniciado), o
 * desde siempre. Así, al reiniciar un candidato de prueba, todo vuelve a pasar.
 */
export async function inicioVigenteProceso(procesoId: string): Promise<string> {
  const { data } = await createAdminClient()
    .from("procesos_contratacion_eventos")
    .select("created_at")
    .eq("proceso_id", procesoId)
    .eq("detalle->>reiniciado", "true")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.created_at as string | undefined) ?? "1970-01-01T00:00:00Z";
}

/** Aviso al aspirante cuando sus antecedentes quedan para revisión (texto por defecto del catálogo). */
export const AVISO_REVISION_PERSONAL =
  "Gracias por tu paciencia. Una persona de Gestión Humana revisará tu proceso y se contactará contigo pronto. Mantente atento a tu teléfono.";

/**
 * Antecedentes con hallazgos (pedido de GH del 17-nov-2026, mientras se
 * definen las reglas de la selección automática): el caso queda para revisión
 * de una persona y se le avisa al aspirante que alguien lo contactará, sin
 * hablarle de antecedentes. Con la ventana de 24 h abierta sale el mensaje; si
 * no, queda como borrador para Gestión Humana. Una sola vez por proceso.
 * Devuelve el texto del aviso cuando lo marca (null si no corresponde).
 */
export async function marcarRevisionAntecedentes(procesoId: string): Promise<string | null> {
  const ev = await evaluarAntecedentesProceso(procesoId);
  if (ev?.resultado !== "hallazgo") return null;
  const db = createAdminClient();
  const { data: ya } = await db
    .from("procesos_contratacion_eventos")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("detalle->>revision_antecedentes", "true")
    .gte("created_at", await inicioVigenteProceso(procesoId))
    .limit(1)
    .maybeSingle();
  if (ya) return null;

  const catalogo = await leerMensaje("revision_antecedentes").catch(() => null);
  const texto = catalogo?.texto?.trim() || AVISO_REVISION_PERSONAL;
  const { data: conv } = await db
    .from("wa_conversaciones")
    .select("id, ultimo_entrante_at, wa_contactos(telefono)")
    .eq("proceso_id", procesoId)
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  let aviso: "enviado" | "borrador" | "fallido" | "sin_conversacion" = "sin_conversacion";
  if (conv) {
    const contacto = (Array.isArray(conv.wa_contactos) ? conv.wa_contactos[0] : conv.wa_contactos) as { telefono?: string } | null;
    if (contacto?.telefono && ventanaAbierta((conv.ultimo_entrante_at as string | null) ?? null, new Date())) {
      const envio = await enviarTexto(contacto.telefono, texto);
      await registrarSaliente(conv.id as string, envio, { contenido: texto }, FIRMA_SELECCION, { automatico: true });
      aviso = envio.ok ? "enviado" : "fallido";
    } else {
      const borrador = { clave: "revision_antecedentes", texto, plantilla: null, parametros: null, creado_at: new Date().toISOString() };
      await db.from("wa_conversaciones").update({ borrador_sugerido: borrador }).eq("id", conv.id);
      aviso = "borrador";
    }
    await db.from("wa_conversaciones").update({ requiere_humano: true }).eq("id", conv.id);
  }
  const hallazgos = ev.fuentes.filter((f) => f.estado === "hallazgo").map((f) => f.fuente);
  await registrarEvento(procesoId, { tipo: "dato", detalle: { revision_antecedentes: true, fuentes: hallazgos, aviso } }, ACTOR_SISTEMA);
  return texto;
}

/** ¿El proceso de la conversación quedó para revisión de antecedentes por una persona? */
export async function antecedentesEnRevisionDeConversacion(conversacionId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data: conv } = await db.from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  if (!conv?.proceso_id) return false;
  const { data } = await db
    .from("procesos_contratacion_eventos")
    .select("id")
    .eq("proceso_id", conv.proceso_id)
    .eq("detalle->>revision_antecedentes", "true")
    .gte("created_at", await inicioVigenteProceso(conv.proceso_id as string))
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/** Minutos con el semáforo en rojo antes del cierre automático (da tiempo a convencerlo de trasladarse o a que corrija un dato). */
export const ESPERA_CIERRE_MINUTOS = 30;

/**
 * Cierre automático de los que no pasan la preselección (pedido de GH del
 * 17-nov-2026): el proceso se cierra con la causa del requisito incumplido
 * (edad, residencia, licencia, SIMIT) cuando el semáforo lleva al menos
 * ESPERA_CIERRE_MINUTOS en rojo sin cambiar y sin mensajes nuevos del aspirante
 * (mientras escribe, el asistente lo sigue atendiendo). Solo los del asistente y del chat
 * de prueba, y solo en Preselección: lo que lleva Gestión Humana no se toca.
 * Lo corre el cron de seguimiento.
 */
export async function cerrarNoPreseleccionados(ahora: Date = new Date()): Promise<{ cerrados: number }> {
  const db = createAdminClient();
  const { data: procesos, error } = await db
    .from("procesos_contratacion")
    .select("id, requisito_incumplido, preseleccion")
    .eq("estado", "pendiente")
    .in("origen", ["whatsapp_agente", "chat_prueba"])
    .not("requisito_incumplido", "is", null)
    .limit(100);
  if (error || !procesos?.length) return { cerrados: 0 };
  let cerrados = 0;
  for (const p of procesos) {
    if ((p.preseleccion as ResultadoPreseleccionGuardado | null)?.global !== "no_cumple") continue;
    // Desde cuándo está en rojo: el último cambio del semáforo.
    const { data: ev } = await db
      .from("procesos_contratacion_eventos")
      .select("created_at, detalle")
      .eq("proceso_id", p.id)
      .eq("tipo", "preseleccion")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const desde = ev && (ev.detalle as { global?: string } | null)?.global === "no_cumple" ? Date.parse(ev.created_at as string) : NaN;
    if (!Number.isFinite(desde) || ahora.getTime() - desde < ESPERA_CIERRE_MINUTOS * 60_000) continue;
    // Mientras siga escribiendo no se cierra: puede cambiar la respuesta (p. ej.
    // aceptar el traslado). Cuentan 30 min también desde su último mensaje.
    const { data: convs } = await db.from("wa_conversaciones").select("ultimo_entrante_at").eq("proceso_id", p.id);
    const ultimoMensaje = Math.max(0, ...(convs ?? []).map((c) => Date.parse((c.ultimo_entrante_at as string | null) ?? "") || 0));
    if (ahora.getTime() - ultimoMensaje < ESPERA_CIERRE_MINUTOS * 60_000) continue;
    const r = await cambiarEstadoProceso(p.id as string, "cierre", {
      actor: ACTOR_SISTEMA,
      causa: p.requisito_incumplido as string,
      detalle: { motivo: "No pasó la preselección: cierre automático.", automatico: true },
    }).catch((e) => {
      console.error("[seleccion] cierre automático:", e);
      return null;
    });
    if (r?.cambiado) cerrados++;
  }
  return { cerrados };
}

/** Aviso cuando el proceso se cierra por antecedentes: no dice el motivo (texto por defecto del catálogo). */
export const AVISO_NO_SELECCIONADO =
  "Gracias por tu interés y por el tiempo que dedicaste a tu proceso. Te informamos que en esta ocasión no continúas en el proceso de selección. Te deseamos muchos éxitos.";

/**
 * Proceso cerrado por antecedentes (por Gestión Humana tras revisar, o por las
 * reglas automáticas cuando existan): se le avisa al aspirante que no pasó el
 * proceso de selección, sin decirle por qué. Con la ventana de 24 h abierta
 * sale el mensaje; si no, queda como borrador. Una sola vez por proceso.
 */
export async function avisarCierrePorAntecedentes(procesoId: string): Promise<"enviado" | "borrador" | "fallido" | "sin_conversacion" | null> {
  const db = createAdminClient();
  const { data: p } = await db.from("procesos_contratacion").select("estado, causa_no_contrato").eq("id", procesoId).maybeSingle();
  if (p?.estado !== "cierre" || p.causa_no_contrato !== CAUSA_ANTECEDENTES) return null;
  const { data: ya } = await db
    .from("procesos_contratacion_eventos")
    .select("id")
    .eq("proceso_id", procesoId)
    .eq("detalle->>aviso_no_seleccionado", "true")
    .gte("created_at", await inicioVigenteProceso(procesoId))
    .limit(1)
    .maybeSingle();
  if (ya) return null;
  const catalogo = await leerMensaje("no_seleccionado").catch(() => null);
  const texto = catalogo?.texto?.trim() || AVISO_NO_SELECCIONADO;
  const { data: conv } = await db
    .from("wa_conversaciones")
    .select("id, ultimo_entrante_at, wa_contactos(telefono)")
    .eq("proceso_id", procesoId)
    .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  let aviso: "enviado" | "borrador" | "fallido" | "sin_conversacion" = "sin_conversacion";
  if (conv) {
    const contacto = (Array.isArray(conv.wa_contactos) ? conv.wa_contactos[0] : conv.wa_contactos) as { telefono?: string } | null;
    if (contacto?.telefono && ventanaAbierta((conv.ultimo_entrante_at as string | null) ?? null, new Date())) {
      const envio = await enviarTexto(contacto.telefono, texto);
      await registrarSaliente(conv.id as string, envio, { contenido: texto }, FIRMA_SELECCION, { automatico: true });
      aviso = envio.ok ? "enviado" : "fallido";
    } else {
      const borrador = { clave: "no_seleccionado", texto, plantilla: null, parametros: null, creado_at: new Date().toISOString() };
      await db.from("wa_conversaciones").update({ borrador_sugerido: borrador, requiere_humano: true }).eq("id", conv.id);
      aviso = "borrador";
    }
  }
  await registrarEvento(procesoId, { tipo: "dato", detalle: { aviso_no_seleccionado: true, aviso } }, ACTOR_SISTEMA);
  return aviso;
}

/** ¿El proceso de la conversación se cerró por antecedentes? (el asistente no debe decir el motivo) */
export async function cerradoPorAntecedentesDeConversacion(conversacionId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data: conv } = await db.from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  if (!conv?.proceso_id) return false;
  const { data: p } = await db.from("procesos_contratacion").select("estado, causa_no_contrato").eq("id", conv.proceso_id).maybeSingle();
  return p?.estado === "cierre" && p.causa_no_contrato === CAUSA_ANTECEDENTES;
}
