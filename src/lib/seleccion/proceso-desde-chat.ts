/**
 * Del chat al proceso (A1, A4, A5, B3): lee la conversación con el modelo,
 * guarda lo que el aspirante dijo y crea o actualiza su proceso de
 * contratación sin duplicados por cédula. Corre en paralelo con la respuesta
 * del asistente, dentro del mismo webhook, y nunca debe hacer fallar esa
 * respuesta: cualquier error se registra y se sigue.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgenteClaves, AgenteConfig } from "@/lib/comunicaciones/agente/config";
import { modeloSolicitado } from "@/lib/comunicaciones/agente/config";
import { generarRespuesta } from "@/lib/comunicaciones/agente/proveedores";
import {
  ACTOR_AGENTE,
  asegurarCandidato,
  cambiarEstadoProceso,
  errorDuplicado,
  procesoAbiertoPorCedula,
  registrarEvento,
} from "@/lib/contratacion/servidor";
import { enlazarPrerregistro } from "@/lib/padrino/servidor";
import {
  consultarAntecedentesProceso,
  consultarPoliciaProceso,
  consultarRuntProceso,
  consultarSimitProceso,
  fechaExpedicionRechazada,
  nombreParaRunt,
} from "@/lib/verificacion/servidor";
import { proveedorRunt } from "@/lib/verificacion/proveedores";
import { cedulaLeidaDeProceso } from "./lectura-fotos";
import {
  PREFILTRO_VACIO,
  SISTEMA_EXTRACCION,
  edadEfectiva,
  fusionarPrefiltro,
  interpretarExtraccion,
  prefiltroCompleto,
  transcribir,
  type DatosPrefiltro,
  type MensajeTranscripcion,
} from "./extraccion";
import { categoriasDeLicencia } from "./preseleccion";
import type { ResultadoPreseleccionGuardado } from "@/lib/contratacion/constants";
import { marcarListoParaCitar, reevaluarPreseleccion, textoAutorizacion } from "./servidor";
import { CAUSAS_REABRIBLES, cambioQueReabre, cambiosDesdeChat } from "./actualizacion-chat";
import type { MotivoRegreso } from "@/lib/comunicaciones/agente/motor";
import { aplicarVinculo } from "./vinculo-servidor";
import { lecturasDeConversacion } from "./lectura-fotos";

/** Mensajes que lee la extracción: los datos suelen estar al inicio del chat. */
const MENSAJES_EXTRACCION = 80;

const ABIERTO = (estado: string | null | undefined) => estado !== "contratado" && estado !== "cierre";

/** Teléfono de WhatsApp (57XXXXXXXXXX) al formato del proceso (los 10 dígitos locales). */
export function celularLocal(telefono: string): string {
  const d = telefono.replace(/\D/g, "");
  return d.length > 10 && d.startsWith("57") ? d.slice(-10) : d;
}

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

interface ProcesoActual {
  id: string;
  estado: string;
  cedula?: string | null;
  origen?: string | null;
  nombre: string | null;
  edad: number | null;
  ciudad_residencia: string | null;
  dispuesto_traslado: boolean | null;
  licencia_categoria: string | null;
  experiencia_meses: number | null;
  hoja_vida_recibida_at: string | null;
  autorizacion_datos: string | null;
  licencia_verificada_runt: boolean | null;
}

const COLUMNAS =
  "id, estado, cedula, origen, nombre, edad, ciudad_residencia, dispuesto_traslado, licencia_categoria, experiencia_meses, hoja_vida_recibida_at, autorizacion_datos, licencia_verificada_runt";

/** Proceso abierto con ese celular (últimos 7 dígitos, como la ficha de Comunicaciones). */
async function procesoAbiertoPorCelular(celular: string): Promise<{ id: string } | null> {
  const d = celular.replace(/\D/g, "");
  if (d.length < 7) return null;
  const { data } = await createAdminClient()
    .from("procesos_contratacion")
    .select("id")
    .ilike("celular", `%${d.slice(-7)}`)
    .not("estado", "in", "(contratado,cierre)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id as string } : null;
}

/**
 * Ejecuta la extracción y actualiza el proceso. Se salta si ya no hay nada que
 * extraer (prefiltro completo y proceso más allá de la preselección).
 */
export async function actualizarDesdeChat(
  conversacionId: string,
  config: AgenteConfig,
  claves: AgenteClaves,
  hooks: { trasRunt?: () => Promise<void> } = {}
): Promise<void> {
  const db = createAdminClient();
  const { data: conv, error } = await db
    .from("wa_conversaciones")
    .select("id, proceso_id, prefiltro, wa_contactos(telefono, nombre)")
    .eq("id", conversacionId)
    .maybeSingle();
  // Sin la migración 20261113205625 no existe prefiltro: no hay a dónde guardar.
  if (error || !conv) return;

  const previo = (conv.prefiltro as Partial<DatosPrefiltro> | null) ?? null;
  let procesoEnlazado: ProcesoActual | null = null;
  if (conv.proceso_id) {
    const { data } = await db.from("procesos_contratacion").select(COLUMNAS).eq("id", conv.proceso_id).maybeSingle();
    procesoEnlazado = (data as ProcesoActual | null) ?? null;
  }
  // Se cerró solo (no pasó la preselección o quedó incomunicado) y la persona
  // vuelve a escribir, quizá días después: se sigue leyendo el chat por si hay
  // que reabrirlo (pedido de GH del 18-nov-2026).
  const causaCierre = procesoEnlazado?.estado === "cierre" ? await cierreAutomatico(procesoEnlazado.id) : null;
  // Ya en curso más allá de la preselección y con todo respondido: nada que hacer.
  // En «Antecedentes» se sigue leyendo: puede faltar la hoja de vida para quedar «Listo para citar».
  if (procesoEnlazado && procesoEnlazado.estado !== "pendiente" && procesoEnlazado.estado !== "antecedentes" && procesoEnlazado.autorizacion_datos && !causaCierre) return;
  // Con todo respondido ya no hace falta leer, salvo en «Pendiente»: ahí todavía
  // puede cambiar una respuesta (p. ej. acepta el traslado) y cambiar la preselección.
  if (previo && prefiltroCompleto({ ...PREFILTRO_VACIO, ...previo }) && procesoEnlazado?.autorizacion_datos && procesoEnlazado.estado !== "pendiente" && !causaCierre) return;

  const { data: filas } = await db
    .from("wa_mensajes")
    .select("id, direccion, contenido, media_tipo, timestamp")
    .eq("conversacion_id", conversacionId)
    .order("timestamp", { ascending: false })
    .limit(MENSAJES_EXTRACCION);
  // Lo leído de la foto de la cédula va junto a su mensaje (solo cuenta confirmado).
  const lecturas = await lecturasDeConversacion(conversacionId).catch(() => new Map<string, string>());
  const mensajes: (MensajeTranscripcion & { timestamp: string })[] = (filas ?? []).reverse().map((m) => ({
    id: m.id as string,
    direccion: m.direccion as "entrante" | "saliente",
    contenido: (m.contenido as string | null) ?? "",
    mediaTipo: (m.media_tipo as string | null) ?? null,
    lectura: lecturas.get(m.id as string) ?? null,
    timestamp: m.timestamp as string,
  }));
  if (!mensajes.some((m) => m.direccion === "entrante")) return;

  const { texto, idPorNumero } = transcribir(mensajes);
  const inicio = Date.now();
  let extraido: DatosPrefiltro | null = null;
  try {
    const r = await generarRespuesta(config, claves, SISTEMA_EXTRACCION, [{ role: "user", content: texto }]);
    extraido = interpretarExtraccion(r.texto);
    await db.from("wa_agente_ejecuciones").insert({
      conversacion_id: conversacionId,
      proveedor: config.proveedor,
      modelo_solicitado: modeloSolicitado(config),
      modelo_usado: r.modeloUsado,
      tokens_entrada: r.tokensEntrada,
      tokens_salida: r.tokensSalida,
      duracion_ms: Date.now() - inicio,
      resultado: "extraccion",
      error: extraido ? null : "La respuesta del modelo no trajo un JSON válido.",
    });
  } catch (e) {
    await db.from("wa_agente_ejecuciones").insert({
      conversacion_id: conversacionId,
      proveedor: config.proveedor,
      modelo_solicitado: modeloSolicitado(config),
      duracion_ms: Date.now() - inicio,
      resultado: "extraccion",
      error: (e instanceof Error ? e.message : String(e)).slice(0, 1000),
    });
    return;
  }
  if (!extraido) return;

  const datos = fusionarPrefiltro(previo, extraido);
  await db.from("wa_conversaciones").update({ prefiltro: datos }).eq("id", conversacionId);
  if (!datos.busca_trabajo) return;

  if (procesoEnlazado && causaCierre) {
    // Sigue igual (un saludo, una pregunta): el proceso se queda cerrado.
    if ((await reabrirSiVuelve(procesoEnlazado, datos)) !== "reabierto") return;
    procesoEnlazado = { ...procesoEnlazado, estado: "pendiente" };
    // Queda para una persona: que lo llamen, ya que volvió (sin pausar al asistente).
    await db.from("wa_conversaciones").update({ requiere_humano: true }).eq("id", conversacionId);
  }

  const contacto = (Array.isArray(conv.wa_contactos) ? conv.wa_contactos[0] : conv.wa_contactos) as { telefono: string; nombre: string | null } | null;
  const celular = contacto?.telefono ? celularLocal(contacto.telefono) : null;
  const autorizacionMensajeId = datos.autorizacion_mensaje ? idPorNumero.get(datos.autorizacion_mensaje) ?? null : null;
  const autorizacionAt = autorizacionMensajeId ? mensajes.find((m) => m.id === autorizacionMensajeId)?.timestamp ?? null : null;

  const r = await registrarAspirante({
    datos,
    procesoEnlazado,
    celular,
    autorizacionAt,
    autorizacionMensajeId,
    origen: "whatsapp_agente",
    // Enlazado antes del RUNT: el seguimiento del asistente lee el proceso por la conversación.
    alTenerProceso: async (id) => {
      if (conv.proceso_id !== id) await db.from("wa_conversaciones").update({ proceso_id: id }).eq("id", conversacionId);
    },
    trasRunt: hooks.trasRunt,
  });
  if (!r) return;

  // «Listo para citar»: con el prefiltro completo, la preselección sin rojos y
  // los antecedentes limpios, el chat se marca para Gestión Humana (una sola
  // vez) sin pausar al agente, que sigue resolviendo dudas.
  if (prefiltroCompleto(datos)) await marcarListoParaCitar(r.procesoId, datos).catch((e) => console.error("[seleccion] listo para citar:", e));
}

/** Motivo con que el asistente retoma con quien vuelve después de un cierre automático; null si no aplica. */
export async function motivoRegreso(procesoId: string | null | undefined): Promise<MotivoRegreso | null> {
  if (!procesoId) return null;
  const causa = await cierreAutomatico(procesoId);
  const motivo = (Object.keys(CAUSAS_REABRIBLES) as MotivoRegreso[]).find((k) => CAUSAS_REABRIBLES[k] === causa);
  return motivo ?? null;
}

/** Lo mismo, a partir de la conversación de WhatsApp. */
export async function regresoDeConversacion(conversacionId: string): Promise<MotivoRegreso | null> {
  const { data } = await createAdminClient().from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  return motivoRegreso((data?.proceso_id as string | null) ?? null);
}

/**
 * La persona volvió a escribir y su proceso se había cerrado solo: lo reabre
 * en «Preselección» si lo que dice ahora lo justifica (cambioQueReabre).
 *  - "reabierto": quedó abierto otra vez (con la novedad en el historial);
 *  - "sigue_cerrado": se cerró solo, pero no cambió lo que lo descartó;
 *  - "no_aplica": no está cerrado, o lo cerró una persona u otra causa.
 * Lo usan el flujo real y el chat de prueba.
 */
export async function reabrirSiVuelve(p: ProcesoActual, datos: DatosPrefiltro): Promise<"reabierto" | "sigue_cerrado" | "no_aplica"> {
  if (p.estado !== "cierre") return "no_aplica";
  const causa = await cierreAutomatico(p.id);
  if (!causa) return "no_aplica";
  const ahoraDice = {
    edad: edadEfectiva(datos, hoyBogota()),
    ciudad_residencia: datos.ciudad,
    dispuesto_traslado: datos.dispuesto_traslado,
    licencia_categoria: licenciaNormalizada(datos.licencia),
    experiencia_meses: datos.experiencia_meses,
    renovara_licencia: datos.renovara_licencia,
    autorizacion: datos.autorizacion,
  };
  if (!cambioQueReabre(causa, p, ahoraDice)) return "sigue_cerrado";
  const r = await cambiarEstadoProceso(p.id, "pendiente", {
    actor: ACTOR_AGENTE,
    detalle: { reabierto: true, causa_anterior: causa, motivo: "Volvió a escribir después del cierre automático." },
  }).catch((e) => {
    console.error("[seleccion] no se pudo reabrir el proceso:", e);
    return null;
  });
  return r?.cambiado ? "reabierto" : "sigue_cerrado";
}

/**
 * Causa del cierre si el proceso lo cerró el sistema por su cuenta (el cron:
 * no pasó la preselección o quedó incomunicado). null si lo cerró una persona
 * o el asistente, o si no está cerrado: esos no se reabren solos.
 */
async function cierreAutomatico(procesoId: string): Promise<string | null> {
  const db = createAdminClient();
  const [{ data: p }, { data: ev }] = await Promise.all([
    db.from("procesos_contratacion").select("estado, causa_no_contrato").eq("id", procesoId).maybeSingle(),
    db
      .from("procesos_contratacion_eventos")
      .select("actor, estado_nuevo")
      .eq("proceso_id", procesoId)
      .eq("tipo", "estado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (p?.estado !== "cierre" || ev?.estado_nuevo !== "cierre" || ev.actor !== "sistema") return null;
  // Solo las causas que la persona puede revertir: antecedentes o «Ya trabaja
  // en la empresa» no se reabren ni hacen leer el chat de nuevo.
  const causa = (p.causa_no_contrato as string | null) ?? null;
  return causa && (Object.values(CAUSAS_REABRIBLES) as string[]).includes(causa) ? causa : null;
}

export interface RegistroAspirante {
  datos: DatosPrefiltro;
  /** Proceso ya enlazado a la conversación, si lo hay. */
  procesoEnlazado?: ProcesoActual | null;
  celular: string | null;
  autorizacionAt: string | null;
  autorizacionMensajeId: string | null;
  /** whatsapp_agente (flujo real) o chat_prueba (casilla «Guardar en Candidatos» del chat de prueba). */
  origen: "whatsapp_agente" | "chat_prueba";
  /** Se llama con el proceso creado o encontrado, antes de las consultas. */
  alTenerProceso?: (procesoId: string) => Promise<void>;
  /**
   * Se llama apenas termina el intento de consulta del RUNT (haya resultado o
   * no), en paralelo con el SIMIT: ahí el asistente cuenta el resultado. También
   * cuando el RNMC rechaza la fecha de expedición: el asistente la vuelve a pedir.
   */
  trasRunt?: () => Promise<void>;
  /**
   * Consultar los antecedentes aunque en este mismo turno se hayan consultado
   * el RUNT o el SIMIT (chat de prueba). En el webhook no: alargarían el turno
   * y los lanza el cron o el siguiente mensaje.
   */
  antecedentesSiempre?: boolean;
  /**
   * No consultar Croma (chat de prueba con Croma simulado): se guarda el
   * candidato y se evalúa el semáforo; quien llama pone los resultados simulados.
   */
  sinCroma?: boolean;
  /**
   * Tiempo para las consultas a Croma de este turno. Lo que no alcanza (RUNT,
   * SIMIT) lo termina el cron y el asistente avisa el resultado.
   */
  tiempoMs?: number;
  /** Nombres y apellidos leídos en la foto de la cédula (chat de prueba); en WhatsApp se buscan en la conversación. */
  fotoCedula?: { nombres: string | null; apellidos: string | null } | null;
}


/**
 * Tiempo para Croma dentro del webhook, que tiene 300 s (maxDuration): antes
 * van la espera, la lectura de la foto y la extracción, y queda margen.
 */
const TIEMPO_WEBHOOK_MS = 220_000;
/**
 * En el turno del aspirante, un trabajo que Croma deja en curso se sigue hasta
 * un minuto (pedido de GH del 18-nov-2026: Croma estaba tardando 25–60 s). El
 * cron sigue con 25 s, porque atiende varios procesos en sus 5 minutos.
 */
const SEGUIR_EN_TURNO_MS = 60_000;
/** Lo que necesita el RUNT para caber: hasta 30 s de la consulta y un minuto siguiendo el trabajo si Croma lo deja en curso. */
const TIEMPO_RUNT_MS = 92_000;
const TIEMPO_SIMIT_MS = 90_000;

/**
 * Guarda al aspirante como candidato: crea o completa su proceso sin
 * duplicados por cédula y, con la autorización, consulta el RUNT y después el
 * SIMIT en Croma. Lo que devuelve Croma queda en el proceso (licencia_runt,
 * simit) y la respuesta completa en verificaciones_externas.
 */
export async function registrarAspirante(p: RegistroAspirante): Promise<{ procesoId: string; preseleccion: ResultadoPreseleccionGuardado | null } | null> {
  const { datos, celular, autorizacionAt, autorizacionMensajeId } = p;
  // Sin cédula todavía no se crea el proceso (la cédula evita duplicados), salvo
  // que ya exista uno enlazado o abierto con ese celular.
  let proceso = p.procesoEnlazado && ABIERTO(p.procesoEnlazado.estado) ? p.procesoEnlazado : null;
  if (!proceso && datos.cedula) {
    const porCedula = await procesoAbiertoPorCedula(datos.cedula);
    if (porCedula) proceso = await leerProceso(porCedula.id);
  }
  if (!proceso && celular) {
    const porCelular = await procesoAbiertoPorCelular(celular);
    if (porCelular) proceso = await leerProceso(porCelular.id);
  }

  // El aspirante corrigió la cédula (p. ej. el RNMC dijo que la fecha no
  // coincidía y era el número el que estaba mal): el proceso pasa a la nueva.
  if (proceso && datos.cedula) proceso = await corregirCedula(proceso, datos.cedula);

  let procesoId: string | null = proceso?.id ?? null;
  if (!proceso) {
    // Queda como candidato apenas autoriza (con la cédula, que evita
    // duplicados); antes, lo que dijo solo vive en la conversación. El nombre
    // ya no se pregunta y lo trae el RUNT: mientras tanto queda el que dio o
    // «POR CONFIRMAR» (el del perfil de WhatsApp no: suele ser un apodo).
    if (!datos.cedula || datos.autorizacion !== "si") return null;
    procesoId = await crearProceso(datos, datos.nombre ?? NOMBRE_POR_CONFIRMAR, celular, autorizacionAt, autorizacionMensajeId, p.origen);
  } else {
    await completarProceso(proceso, datos, autorizacionAt, autorizacionMensajeId);
  }
  if (!procesoId) return null;
  await guardarCamposNuevos(procesoId, datos);
  // El número de WhatsApp desde el que escribe: si el proceso no tenía celular (por
  // ejemplo, lo creó Gestión Humana a mano sin él), queda con ese. No pisa uno ya escrito.
  if (celular) {
    const db = createAdminClient();
    await db.from("procesos_contratacion").update({ celular }).eq("id", procesoId).is("celular", null);
    await db.from("procesos_contratacion").update({ celular }).eq("id", procesoId).eq("celular", "");
  }
  await p.alTenerProceso?.(procesoId);

  // Lo primero, antes de cualquier consulta a Croma (pedido de GH del
  // 18-nov-2026): ¿ya está en Gestivo como conductor? Activo: el proceso se
  // cierra («Ya trabaja en la empresa») y no se consulta nada, ni el RUNT.
  // Retirado: queda como reingreso para que lo revise una persona, y la selección sigue.
  if ((await aplicarVinculo(procesoId, datos.cedula)) === "cerrado") return { procesoId, preseleccion: null };
  if (p.sinCroma) return { procesoId, preseleccion: (await reevaluarPreseleccion(procesoId))?.resultado ?? null };

  // Pedido de GH del 18-nov-2026. El asistente pide la cédula con el primer
  // apellido, o la foto de la cédula, y con eso se consulta el RUNT de una vez
  // para descartar por licencia (el RUNT va siempre con el apellido: sin él,
  // Croma puede abrir el registro de otra persona). La fecha de expedición se
  // pide después, si todo va bien, y se usa en antecedentes para el RNMC (que
  // tarda y puede bloquear consultas repetidas: así se consulta menos).
  // Sin Croma configurado no hay nada de esto: sigue como antes (modo manual).
  const tiempo = p.tiempoMs ?? TIEMPO_WEBHOOK_MS;
  const fin = Date.now() + tiempo;
  const queda = () => fin - Date.now();
  const conCroma = Boolean(proveedorRunt());

  const cedulaLimpia = (datos.cedula ?? "").replace(/\D/g, "");
  const foto = p.fotoCedula ?? (cedulaLimpia ? await cedulaLeidaDeProceso(procesoId, cedulaLimpia).catch(() => null) : null);
  const nombre = await nombreParaRunt(procesoId, foto, datos.primer_apellido).catch(() => ({ nombre: null, apellido: null, origen: null }));
  // Sin apellido todavía: el RUNT espera (el asistente se lo pide).
  const esperaNombre = conCroma && !nombre.nombre;

  let reeval = await reevaluarPreseleccion(procesoId);

  // La licencia primero, en el RUNT (con la autorización ya dada): si no tiene,
  // está vencida o no es de la categoría, el semáforo queda en rojo enseguida
  // y no se gasta la consulta del SIMIT.
  let seguimiento: Promise<void> | null = null;
  let policia: Promise<void> | null = null;
  // Si se acabó el tiempo del turno, el RUNT y el SIMIT los termina el cron
  // (consultarRuntFaltantes) y el asistente le avisa con el resultado.
  const sinTiempo = !esperaNombre && reeval?.consultarRunt && queda() < TIEMPO_RUNT_MS;
  if (sinTiempo) console.warn(`[seleccion] sin tiempo para el RUNT en este turno (proceso ${procesoId}): lo termina el cron.`);
  if (reeval?.consultarRunt && !esperaNombre && !sinTiempo) {
    const runt = await consultarRuntProceso(procesoId, ACTOR_AGENTE, { nombreRegistro: nombre.nombre, apellido: nombre.apellido, seguirMs: SEGUIR_EN_TURNO_MS }).catch((e) => {
      console.error("[seleccion] RUNT:", e);
      return null;
    });
    if (runt?.modo === "consultado") reeval = await reevaluarPreseleccion(procesoId);
    seguimiento = p.trasRunt ? p.trasRunt().catch((e) => console.error("[seleccion] seguimiento de la revisión:", e)) : null;
    // Sin nombre en el RUNT (la cédula no aparece o viene sin nombre), el nombre
    // sale de la Policía, en paralelo con lo demás (pedido de GH del 17-nov-2026).
    if (runt?.modo === "consultado") policia = consultarPoliciaSiFaltaNombre(procesoId);
  }

  if (reeval?.consultarSimit && !esperaNombre && queda() >= TIEMPO_SIMIT_MS) {
    // Con Croma sin configurar responde «manual» sin consultar nada.
    await consultarSimitProceso(procesoId, ACTOR_AGENTE, { seguirMs: SEGUIR_EN_TURNO_MS }).catch((e) => console.error("[seleccion] SIMIT:", e));
    reeval = (await reevaluarPreseleccion(procesoId)) ?? reeval;
  }
  await Promise.all([seguimiento, policia]);

  // Cumple los 4 (pasó a «Antecedentes»): Policía, Procuraduría, Contraloría y
  // RNMC (este con la fecha de expedición; si no la tiene todavía, espera).
  const pesado = Boolean(seguimiento) || reeval?.consultarSimit || sinTiempo;
  if (!esperaNombre && (!pesado || p.antecedentesSiempre)) {
    const { data: estado } = await createAdminClient().from("procesos_contratacion").select("estado").eq("id", procesoId).maybeSingle();
    if (estado?.estado === "antecedentes") {
      const antes = await fechaExpedicionRechazada(procesoId).catch(() => null);
      await consultarAntecedentesProceso(procesoId, ACTOR_AGENTE, { esperarRnmcMs: Math.min(90_000, Math.max(20_000, queda())), seguirMs: SEGUIR_EN_TURNO_MS }).catch((e) =>
        console.error("[seleccion] antecedentes:", e)
      );
      // El RNMC acaba de decir que la fecha no corresponde a la cédula: el asistente la vuelve a pedir.
      const despues = await fechaExpedicionRechazada(procesoId).catch(() => null);
      if (despues && despues.intentos !== antes?.intentos && p.trasRunt) {
        await p.trasRunt().catch((e) => console.error("[seleccion] seguimiento de la revisión:", e));
      }
    }
  }
  return { procesoId, preseleccion: reeval?.resultado ?? null };
}

/**
 * Pasa el proceso a la cédula corregida por el aspirante. Solo en procesos del
 * asistente o del chat de prueba y en «Pendiente» (lo que lleva Gestión Humana
 * no se toca). Lo consultado con la cédula anterior deja de valer: nombre,
 * RUNT y SIMIT se limpian para volver a consultarlos con la nueva (el RNMC y el
 * rechazo de la fecha ya se leen por cédula). Si ya hay otro proceso abierto
 * con la nueva cédula, se sigue con ese. Devuelve el proceso con que seguir.
 */
async function corregirCedula(p: ProcesoActual, nueva: string): Promise<ProcesoActual | null> {
  const limpia = nueva.replace(/\D/g, "");
  const actual = String(p.cedula ?? "").replace(/\D/g, "");
  if (!limpia || !actual || limpia === actual) return p;
  if (p.estado !== "pendiente" || (p.origen !== "whatsapp_agente" && p.origen !== "chat_prueba")) return p;
  const otro = await procesoAbiertoPorCedula(limpia, p.id);
  if (otro) return leerProceso(otro.id);
  const db = createAdminClient();
  const { error } = await db
    .from("procesos_contratacion")
    .update({
      cedula: limpia,
      nombre: NOMBRE_POR_CONFIRMAR,
      licencia_runt: null,
      licencia_verificada_runt: false,
      simit: null,
      simit_valor: 0,
    })
    .eq("id", p.id);
  if (error) {
    console.error("[seleccion] no se pudo corregir la cédula del proceso:", error.message);
    return p;
  }
  // El candidato va por cédula: el proceso pasa al de la cédula nueva (se crea si no existe).
  const { data: proc } = await db.from("procesos_contratacion").select("celular").eq("id", p.id).maybeSingle();
  const candidateId = await asegurarCandidato({
    cedula: limpia,
    nombre: NOMBRE_POR_CONFIRMAR,
    celular: (proc?.celular as string | null) ?? null,
    medio_postulacion: "whatsapp",
  });
  if (candidateId) await db.from("procesos_contratacion").update({ candidate_id: candidateId }).eq("id", p.id);
  await registrarEvento(p.id, { tipo: "dato", detalle: { cedula: { anterior: actual, nueva: limpia }, origen: p.origen } }, ACTOR_AGENTE);
  return { ...p, cedula: limpia, licencia_verificada_runt: false };
}

/** Consulta la Policía solo si el RUNT no trajo el nombre. Nunca lanza. */
async function consultarPoliciaSiFaltaNombre(procesoId: string): Promise<void> {
  try {
    const { data } = await createAdminClient().from("procesos_contratacion").select("licencia_runt").eq("id", procesoId).maybeSingle();
    if ((data?.licencia_runt as { nombre?: string | null } | null)?.nombre) return;
    await consultarPoliciaProceso(procesoId, ACTOR_AGENTE, { seguirMs: SEGUIR_EN_TURNO_MS });
  } catch (e) {
    console.error("[seleccion] Policía:", e);
  }
}

/** Proceso del chat de prueba para seguir con él (p. ej. si el aspirante corrige la cédula); null si no es de prueba. */
export async function procesoDePrueba(id: string): Promise<ProcesoActual | null> {
  const p = await leerProceso(id);
  return p?.origen === "chat_prueba" ? p : null;
}

async function leerProceso(id: string): Promise<ProcesoActual | null> {
  const { data } = await createAdminClient().from("procesos_contratacion").select(COLUMNAS).eq("id", id).maybeSingle();
  return (data as ProcesoActual | null) ?? null;
}

function licenciaNormalizada(licencia: string | null): string | null {
  if (!licencia) return null;
  const cats = categoriasDeLicencia(licencia);
  return cats.length ? cats.join(", ") : licencia;
}

/** Nombre del proceso mientras el RUNT no trae el oficial. */
export const NOMBRE_POR_CONFIRMAR = "POR CONFIRMAR";

/**
 * Guarda la fecha de nacimiento (si el proceso aún no la tiene) y si dijo que
 * renueva la licencia vencida (vale la última respuesta). Va aparte y sin
 * hacer fallar nada: sin la migración 20261117214219 las columnas no existen.
 */
async function guardarCamposNuevos(procesoId: string, d: DatosPrefiltro): Promise<void> {
  const db = createAdminClient();
  const aviso = (e: { message: string } | null) =>
    e && console.warn("[seleccion] no se guardó un dato nuevo del chat (¿falta la migración 20261117214219?):", e.message);
  if (d.fecha_nacimiento) {
    const { error } = await db.from("procesos_contratacion").update({ fecha_nacimiento: d.fecha_nacimiento }).eq("id", procesoId).is("fecha_nacimiento", null);
    aviso(error);
  }
  if (d.fecha_expedicion) {
    const { error } = await db.from("procesos_contratacion").update({ cedula_fecha_expedicion: d.fecha_expedicion }).eq("id", procesoId);
    aviso(error);
  }
  if (d.renovara_licencia != null) {
    const { error } = await db.from("procesos_contratacion").update({ renovara_licencia: d.renovara_licencia }).eq("id", procesoId);
    aviso(error);
  }
}

async function crearProceso(
  d: DatosPrefiltro,
  nombre: string,
  celular: string | null,
  autorizacionAt: string | null,
  autorizacionMensajeId: string | null,
  origen: RegistroAspirante["origen"] = "whatsapp_agente"
): Promise<string | null> {
  const db = createAdminClient();
  const textoAut = d.autorizacion ? await textoAutorizacion() : null;
  const fila = {
    fecha_creacion: hoyBogota(),
    nombre: nombre.trim().toUpperCase(),
    cedula: d.cedula!,
    celular,
    reingreso: false,
    estado: "pendiente",
    medio_postulacion: "whatsapp",
    origen,
    simit_valor: 0,
    edad: edadEfectiva(d, hoyBogota()),
    ciudad_residencia: d.ciudad,
    dispuesto_traslado: d.dispuesto_traslado,
    licencia_categoria: licenciaNormalizada(d.licencia),
    experiencia_meses: d.experiencia_meses,
    hoja_vida_recibida_at: d.hoja_vida ? new Date().toISOString() : null,
    autorizacion_datos: d.autorizacion,
    autorizacion_datos_at: d.autorizacion ? autorizacionAt ?? new Date().toISOString() : null,
    autorizacion_datos_texto: textoAut,
    autorizacion_mensaje_id: autorizacionMensajeId,
  };
  const candidateId = await asegurarCandidato({ cedula: fila.cedula, nombre: fila.nombre, celular, medio_postulacion: "whatsapp" });
  const { data, error } = await db.from("procesos_contratacion").insert({ ...fila, candidate_id: candidateId }).select("id").single();
  if (error) {
    // Carrera: otro mensaje creó el proceso un instante antes. Se usa ese.
    const existente = await procesoAbiertoPorCedula(fila.cedula);
    if (existente) return existente.id;
    console.error("[seleccion] no se pudo crear el proceso desde el chat:", errorDuplicado(error, fila.cedula).message);
    return null;
  }
  const id = data.id as string;
  await registrarEvento(id, { tipo: "creado", estadoNuevo: "pendiente", detalle: { origen } }, ACTOR_AGENTE);
  if (d.autorizacion) {
    await registrarEvento(id, { tipo: "autorizacion", detalle: { respuesta: d.autorizacion } }, ACTOR_AGENTE);
  }
  await enlazarPrerregistro(id, ACTOR_AGENTE);
  return id;
}

/**
 * Completa el proceso existente con lo extraído. Solo llena lo que está vacío:
 * lo que ya escribió Gestión Humana no se pisa. La autorización se registra
 * una vez (y un «no» posterior a un «sí» también, como retiro).
 */
/** Campos del proceso que una persona cambió a mano en Candidatos (historial «dato» con actor usuario). */
async function camposEditadosAMano(procesoId: string): Promise<Set<string>> {
  const { data, error } = await createAdminClient()
    .from("procesos_contratacion_eventos")
    .select("detalle")
    .eq("proceso_id", procesoId)
    .eq("tipo", "dato")
    .eq("actor", "usuario");
  const campos = new Set<string>();
  if (error) return campos;
  for (const e of data ?? []) {
    const lista = (e.detalle as { campos?: unknown } | null)?.campos;
    if (Array.isArray(lista)) for (const c of lista) if (typeof c === "string") campos.add(c);
  }
  return campos;
}

async function completarProceso(
  p: ProcesoActual,
  d: DatosPrefiltro,
  autorizacionAt: string | null,
  autorizacionMensajeId: string | null
): Promise<void> {
  // Vale la última respuesta del chat (si cambió de opinión sobre el traslado,
  // la ciudad…), salvo lo que GH editó a mano y la licencia verificada en el RUNT.
  const patch: Record<string, unknown> = cambiosDesdeChat(
    p,
    {
      edad: edadEfectiva(d, hoyBogota()),
      ciudad_residencia: d.ciudad,
      dispuesto_traslado: d.dispuesto_traslado,
      licencia_categoria: licenciaNormalizada(d.licencia),
      experiencia_meses: d.experiencia_meses,
    },
    await camposEditadosAMano(p.id)
  );
  if (!p.hoja_vida_recibida_at && d.hoja_vida) patch.hoja_vida_recibida_at = new Date().toISOString();

  const cambiaAutorizacion = d.autorizacion && d.autorizacion !== p.autorizacion_datos;
  if (cambiaAutorizacion) {
    patch.autorizacion_datos = d.autorizacion;
    patch.autorizacion_datos_at = autorizacionAt ?? new Date().toISOString();
    patch.autorizacion_datos_texto = await textoAutorizacion();
    patch.autorizacion_mensaje_id = autorizacionMensajeId;
  }
  if (!Object.keys(patch).length) return;

  const { error } = await createAdminClient().from("procesos_contratacion").update(patch).eq("id", p.id);
  if (error) {
    console.error("[seleccion] no se pudo actualizar el proceso desde el chat:", error.message);
    return;
  }
  const campos = Object.keys(patch).filter((k) => !k.startsWith("autorizacion"));
  if (campos.length) await registrarEvento(p.id, { tipo: "dato", detalle: { campos, origen: "whatsapp_agente" } }, ACTOR_AGENTE);
  if (cambiaAutorizacion) await registrarEvento(p.id, { tipo: "autorizacion", detalle: { respuesta: d.autorizacion } }, ACTOR_AGENTE);
}
