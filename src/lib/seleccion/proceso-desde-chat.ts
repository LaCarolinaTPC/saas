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
  errorDuplicado,
  procesoAbiertoPorCedula,
  registrarEvento,
} from "@/lib/contratacion/servidor";
import { enlazarPrerregistro } from "@/lib/padrino/servidor";
import { consultarRuntProceso, consultarSimitProceso } from "@/lib/verificacion/servidor";
import {
  PREFILTRO_VACIO,
  SISTEMA_EXTRACCION,
  fusionarPrefiltro,
  interpretarExtraccion,
  prefiltroCompleto,
  transcribir,
  type DatosPrefiltro,
  type MensajeTranscripcion,
} from "./extraccion";
import { categoriasDeLicencia } from "./preseleccion";
import { reevaluarPreseleccion, textoAutorizacion } from "./servidor";

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
  nombre: string | null;
  edad: number | null;
  ciudad_residencia: string | null;
  dispuesto_traslado: boolean | null;
  licencia_categoria: string | null;
  experiencia_meses: number | null;
  hoja_vida_recibida_at: string | null;
  autorizacion_datos: string | null;
}

const COLUMNAS =
  "id, estado, nombre, edad, ciudad_residencia, dispuesto_traslado, licencia_categoria, experiencia_meses, hoja_vida_recibida_at, autorizacion_datos";

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
  claves: AgenteClaves
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
  // Ya en curso más allá de la preselección y con todo respondido: nada que hacer.
  if (procesoEnlazado && procesoEnlazado.estado !== "pendiente" && procesoEnlazado.autorizacion_datos) return;
  if (previo && prefiltroCompleto({ ...PREFILTRO_VACIO, ...previo }) && procesoEnlazado?.autorizacion_datos) return;

  const { data: filas } = await db
    .from("wa_mensajes")
    .select("id, direccion, contenido, media_tipo, timestamp")
    .eq("conversacion_id", conversacionId)
    .order("timestamp", { ascending: false })
    .limit(MENSAJES_EXTRACCION);
  const mensajes: (MensajeTranscripcion & { timestamp: string })[] = (filas ?? []).reverse().map((m) => ({
    id: m.id as string,
    direccion: m.direccion as "entrante" | "saliente",
    contenido: (m.contenido as string | null) ?? "",
    mediaTipo: (m.media_tipo as string | null) ?? null,
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

  const contacto = (Array.isArray(conv.wa_contactos) ? conv.wa_contactos[0] : conv.wa_contactos) as { telefono: string; nombre: string | null } | null;
  const celular = contacto?.telefono ? celularLocal(contacto.telefono) : null;
  const autorizacionMensajeId = datos.autorizacion_mensaje ? idPorNumero.get(datos.autorizacion_mensaje) ?? null : null;
  const autorizacionAt = autorizacionMensajeId ? mensajes.find((m) => m.id === autorizacionMensajeId)?.timestamp ?? null : null;

  // Sin cédula todavía no se crea el proceso (la cédula evita duplicados), salvo
  // que ya exista uno enlazado o abierto con ese celular.
  let proceso = procesoEnlazado && ABIERTO(procesoEnlazado.estado) ? procesoEnlazado : null;
  if (!proceso && datos.cedula) {
    const porCedula = await procesoAbiertoPorCedula(datos.cedula);
    if (porCedula) proceso = await leerProceso(porCedula.id);
  }
  if (!proceso && celular) {
    const porCelular = await procesoAbiertoPorCelular(celular);
    if (porCelular) proceso = await leerProceso(porCelular.id);
  }

  let procesoId: string | null = proceso?.id ?? null;
  if (!proceso) {
    if (!datos.cedula || !datos.nombre) return;
    procesoId = await crearProceso(datos, celular, autorizacionAt, autorizacionMensajeId);
    if (!procesoId) return;
  } else {
    await completarProceso(proceso, datos, autorizacionAt, autorizacionMensajeId);
  }

  if (procesoId && conv.proceso_id !== procesoId) {
    await db.from("wa_conversaciones").update({ proceso_id: procesoId }).eq("id", conversacionId);
  }
  if (!procesoId) return;

  let reeval = await reevaluarPreseleccion(procesoId);

  // La licencia primero, en el RUNT (con la autorización ya dada): si no tiene,
  // está vencida o no es de la categoría, el semáforo queda en rojo enseguida,
  // el chat no se marca para citar y no se gasta la consulta del SIMIT.
  if (reeval?.consultarRunt) {
    const runt = await consultarRuntProceso(procesoId, ACTOR_AGENTE).catch((e) => {
      console.error("[seleccion] RUNT:", e);
      return null;
    });
    if (runt?.modo === "consultado") reeval = await reevaluarPreseleccion(procesoId);
  }

  // «Listo para citar»: la primera vez que el prefiltro queda completo, el chat
  // se marca para Gestión Humana sin pausar al agente, que sigue resolviendo
  // dudas hasta que una persona escriba.
  const recienCompleto = prefiltroCompleto(datos) && !(previo && prefiltroCompleto({ ...PREFILTRO_VACIO, ...previo }));
  if (recienCompleto && datos.autorizacion === "si" && reeval?.resultado.global !== "no_cumple") {
    await db.from("wa_conversaciones").update({ requiere_humano: true }).eq("id", conversacionId);
    await registrarEvento(procesoId, { tipo: "dato", detalle: { listo_para_citar: true } }, ACTOR_AGENTE);
  }

  if (reeval?.consultarSimit) {
    // Con Croma sin configurar responde «manual» sin consultar nada.
    await consultarSimitProceso(procesoId, ACTOR_AGENTE).catch((e) => console.error("[seleccion] SIMIT:", e));
  }
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

async function crearProceso(
  d: DatosPrefiltro,
  celular: string | null,
  autorizacionAt: string | null,
  autorizacionMensajeId: string | null
): Promise<string | null> {
  const db = createAdminClient();
  const textoAut = d.autorizacion ? await textoAutorizacion() : null;
  const fila = {
    fecha_creacion: hoyBogota(),
    nombre: d.nombre!.trim().toUpperCase(),
    cedula: d.cedula!,
    celular,
    reingreso: false,
    estado: "pendiente",
    medio_postulacion: "whatsapp",
    origen: "whatsapp_agente",
    simit_valor: 0,
    edad: d.edad,
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
  await registrarEvento(id, { tipo: "creado", estadoNuevo: "pendiente", detalle: { origen: "whatsapp_agente" } }, ACTOR_AGENTE);
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
async function completarProceso(
  p: ProcesoActual,
  d: DatosPrefiltro,
  autorizacionAt: string | null,
  autorizacionMensajeId: string | null
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (p.edad == null && d.edad != null) patch.edad = d.edad;
  if (!p.ciudad_residencia && d.ciudad) patch.ciudad_residencia = d.ciudad;
  if (p.dispuesto_traslado == null && d.dispuesto_traslado != null) patch.dispuesto_traslado = d.dispuesto_traslado;
  if (!p.licencia_categoria && d.licencia) patch.licencia_categoria = licenciaNormalizada(d.licencia);
  if (p.experiencia_meses == null && d.experiencia_meses != null) patch.experiencia_meses = d.experiencia_meses;
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
