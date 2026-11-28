/**
 * Lectura de los documentos que llegan por WhatsApp (entrega 4, A6 y R1–R7):
 * reserva cada archivo (una fila en seleccion_lecturas por mensaje, única),
 * revisa el ajuste y el tope, lee la ráfaga en una sola llamada y guarda la
 * clase, los campos y el costo. Nada se aplica al proceso: queda como
 * propuesta para «Documentos leídos».
 *
 * Corre desde responderConAgente (con límite de tiempo) y, lo que no alcance,
 * desde el cron de seguimiento. Las fotos que la lectura de la cédula de la
 * entrega 1 ya reconoció como cédula no se vuelven a mandar al modelo: se
 * guardan con lo que ya se leyó.
 */
import { randomUUID } from "node:crypto";
import { NOMBRE_CLASE } from "./esquema";
import { createAdminClient } from "@/lib/supabase/admin";
import { configDocumentos, getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import type { ImagenEntrada } from "@/lib/comunicaciones/agente/proveedores";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import type { LecturaCedula } from "../lectura-cedula";
import type { LecturaGuardada } from "../lectura-fotos";
import { costoUsd } from "../consumos";
import { registrarConsumo, topeAlcanzado } from "../consumos-servidor";
import { esConversacionDeLaboratorio } from "../laboratorio-servidor";
import { leerAjustes, leerMensaje, valorAjuste } from "../servidor";
import { enviarMensajeSeleccion } from "../envio";
import { camposDeDocumento, conCedulaAlDia, resumenParaAsistente } from "./interpretar";
import { leerArchivos, MAX_ARCHIVOS } from "./leer";
import { archivoParaModelo, esDocAntiguo, formatoDe } from "./formatos";
import { validarDocumentosAutomaticos } from "./revision-servidor";
import { conContradicciones, type DatosAspirante, type LecturaPrevia } from "./contradicciones";
import type { CampoLeido, ClaseDocumento } from "./esquema";

/** Por archivo y por llamada. Las fotos de WhatsApp pesan menos de 1 MB; un PDF escaneado, varios. */
const MAX_BYTES_ARCHIVO = 8_000_000;
const MAX_BYTES_LOTE = 24_000_000;
/** Una reserva que lleva más que esto en «pendiente» se da por perdida (la función se cortó). */
const RESERVA_VENCIDA_MS = 5 * 60_000;

interface MensajeArchivo {
  id: string;
  media_path: string;
  mime_type: string | null;
  media_tipo: string;
  nombre_archivo: string | null;
  lectura: LecturaGuardada | null;
}

// Fotos, PDF, Word (.docx), OpenDocument (.odt), RTF y texto (./formatos). El Word antiguo (.doc)
// también entra, para dejar la lectura «omitida» con el aviso de guardarlo como .docx o PDF.
const legible = (m: Pick<MensajeArchivo, "mime_type" | "nombre_archivo">) =>
  formatoDe(m.mime_type, m.nombre_archivo) != null || esDocAntiguo(m.mime_type, m.nombre_archivo);

/** ¿Está encendida la lectura? El modelo es el de «Documentos» en la pestaña IA de Selección. */
async function ajustesLectura(): Promise<{ activa: boolean }> {
  const a = await leerAjustes().catch(() => []);
  return { activa: valorAjuste<unknown>(a, "lectura_activa", true) !== false };
}

/** Campos de una cédula ya leída por la lectura de la entrega 1. */
function camposDeCedulaPrevia(l: LecturaCedula, hoy: string, cedulaProceso: string | null): CampoLeido[] {
  const campos = [
    { campo: "numero", valor: l.numero },
    { campo: "nombres", valor: l.nombres },
    { campo: "apellidos", valor: l.apellidos },
    { campo: "fecha_nacimiento", valor: l.fechaNacimiento },
    { campo: "fecha_expedicion", valor: l.fechaExpedicion },
    { campo: "lugar_expedicion", valor: l.lugarExpedicion },
  ]
    .filter((c) => c.valor)
    .map((c) => ({ ...c, valor: String(c.valor), confianza: "alta" as const, evidencia: null, pagina: null }));
  return camposDeDocumento({ clase: "cedula", campos, experiencias: [], referencias: [] }, { hoy, cedulaProceso });
}

/**
 * Lee los archivos del aspirante que aún no tienen lectura (de las últimas
 * 24 h, máx. 12 por llamada) y solo si ya autorizó el tratamiento de sus
 * datos. Nunca lanza. Devuelve cuántos archivos leyó.
 */
export async function leerDocumentosPendientes(conversacionId: string): Promise<number> {
  try {
    const leidos = await leer(conversacionId);
    // Las cartas laborales que coinciden con la hoja de vida se validan solas (23-nov-2026).
    if (leidos > 0) {
      const { data: conv } = await createAdminClient().from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
      if (conv?.proceso_id) {
        await validarDocumentosAutomaticos(conv.proceso_id as string).catch((e) => console.error("[seleccion] validación automática de documentos:", e));
      }
    }
    return leidos;
  } catch (e) {
    console.error("[seleccion] lectura de documentos:", e);
    return 0;
  }
}

async function leer(conversacionId: string): Promise<number> {
  const db = createAdminClient();
  const desde = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: filas, error } = await db
    .from("wa_mensajes")
    .select("id, media_path, mime_type, media_tipo, nombre_archivo, lectura")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "entrante")
    .in("media_tipo", ["image", "document"])
    .not("media_path", "is", null)
    .gte("timestamp", desde)
    .order("timestamp", { ascending: true })
    .limit(30);
  if (error || !filas?.length) return 0;
  const candidatos = (filas as MensajeArchivo[]).filter(legible);
  if (!candidatos.length) return 0;

  // Sin la migración de la entrega 4 no hay tabla: no se lee nada.
  const { data: ya, error: eYa } = await db.from("seleccion_lecturas").select("wa_mensaje_id").in("wa_mensaje_id", candidatos.map((m) => m.id));
  if (eYa) return 0;
  const leidos = new Set((ya ?? []).map((x) => x.wa_mensaje_id as string));
  const nuevos = candidatos.filter((m) => !leidos.has(m.id));
  if (!nuevos.length) return 0;

  const { activa } = await ajustesLectura();
  if (!activa || (await topeAlcanzado())) return 0;
  if (await esConversacionDeLaboratorio(conversacionId)) return 0;

  const { data: conv } = await db.from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  const procesoId = (conv?.proceso_id as string | null) ?? null;
  const { data: proc } = procesoId
    ? await db.from("procesos_contratacion").select("cedula, autorizacion_datos, nombre, fecha_nacimiento, edad, ciudad_residencia, celular, experiencia_meses").eq("id", procesoId).maybeSingle()
    : { data: null };
  // NF3 (Ley 1581): sin la autorización del aspirante no se manda su hoja de vida al
  // modelo ni se guarda lo leído. Los archivos esperan; se leen cuando autorice (hasta 24 h).
  if (proc?.autorizacion_datos !== "si") return 0;
  const cedulaProceso = (proc?.cedula as string | null) ?? null;
  const hoy = fechaBogota(new Date().toISOString());

  // Reserva: solo sigue con los mensajes cuya fila creó esta ejecución.
  const lote = nuevos.slice(0, MAX_ARCHIVOS);
  const { data: reservadas } = await db
    .from("seleccion_lecturas")
    .upsert(
      lote.map((m) => ({ wa_mensaje_id: m.id, conversacion_id: conversacionId, proceso_id: procesoId, estado: "pendiente" })),
      { onConflict: "wa_mensaje_id", ignoreDuplicates: true }
    )
    .select("id, wa_mensaje_id");
  const filaDe = new Map((reservadas ?? []).map((r) => [r.wa_mensaje_id as string, r.id as string]));
  const mios = lote.filter((m) => filaDe.has(m.id));
  if (!mios.length) return 0;

  const guardar = async (id: string, cambios: Record<string, unknown>) => {
    const r = await db.from("seleccion_lecturas").update({ ...cambios, updated_at: new Date().toISOString() }).eq("id", id);
    // Sin la migración 20261124230624 la base no acepta la clase «certificado_bancario»:
    // queda como «otro», con el resumen y los campos leídos para quien lo revisa.
    if (r.error && cambios.clase === "certificado_bancario" && /clase|check/i.test(r.error.message)) {
      return db
        .from("seleccion_lecturas")
        .update({ ...cambios, clase: "otro", resumen: `Certificado bancario: ${String(cambios.resumen ?? "")}`.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", id);
    }
    return r;
  };

  // Cédulas que ya leyó la lectura de la entrega 1: se guardan sin otra llamada.
  const paraModelo: MensajeArchivo[] = [];
  for (const m of mios) {
    const previa = m.lectura?.datos as LecturaCedula | null | undefined;
    if (previa?.esCedula) {
      const campos = camposDeCedulaPrevia(previa, hoy, cedulaProceso);
      await guardar(filaDe.get(m.id)!, { clase: "cedula", estado: "leido", campos, resumen: m.lectura?.resumen ?? "cédula", modelo: m.lectura?.modelo ?? null });
    } else {
      paraModelo.push(m);
    }
  }
  if (!paraModelo.length) return mios.length;

  // Descarga, dentro de los topes de tamaño.
  const archivos: ImagenEntrada[] = [];
  const enLlamada: MensajeArchivo[] = [];
  let total = 0;
  for (const m of paraModelo) {
    const { data: archivo, error: eDescarga } = await db.storage.from("whatsapp").download(m.media_path);
    if (eDescarga || !archivo) {
      await guardar(filaDe.get(m.id)!, { estado: "error", error: eDescarga?.message ?? "No se pudo descargar el archivo." });
      continue;
    }
    const bytes = Buffer.from(await archivo.arrayBuffer());
    if (bytes.length > MAX_BYTES_ARCHIVO || total + bytes.length > MAX_BYTES_LOTE) {
      await guardar(filaDe.get(m.id)!, { estado: "omitido", error: "El archivo es demasiado pesado para leerlo." });
      continue;
    }
    total += bytes.length;
    const a = await archivoParaModelo(bytes, m.mime_type, m.nombre_archivo);
    if (!a.ok) {
      await guardar(filaDe.get(m.id)!, { estado: a.estado, error: a.error });
      continue;
    }
    archivos.push(a.archivo);
    enLlamada.push(m);
  }
  if (!archivos.length) return mios.length - paraModelo.length;

  const { config, claves } = await getAgenteConClaves();
  let r;
  try {
    r = await leerArchivos(archivos, { config, claves, hoy, cedulaProceso });
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    for (const m of enLlamada) await guardar(filaDe.get(m.id)!, { estado: "error", error });
    return 0;
  }
  const costo = r.costoUsd ?? costoUsd(r.modelo, r.tokensEntrada, r.tokensSalida);
  await registrarConsumo({ concepto: "lectura", proveedor: configDocumentos(config).proveedor, modelo: r.modelo, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, costoUsd: costo, conversacionId, procesoId });
  const parte = Math.round((costo / enLlamada.length) * 1_000_000) / 1_000_000;
  if (!r.docs) {
    // El principio y el final de la respuesta, y los tokens: una respuesta cortada por largo se ve aquí.
    const detalle = `Respuesta sin JSON (${r.tokensSalida ?? "?"} tokens de salida): ${r.texto.slice(0, 120)} … ${r.texto.slice(-120)}`;
    for (const m of enLlamada) await guardar(filaDe.get(m.id)!, { estado: "error", error: detalle, modelo: r.modelo, costo_usd: parte });
    return 0;
  }
  // ¿Contradice lo que ya sabemos? (27-nov-2026): contra el proceso y los documentos ya leídos
  // (y los de esta misma tanda); las advertencias quedan como nota del campo para quien revisa.
  const aspirante: DatosAspirante = {
    nombre: (proc?.nombre as string | null) ?? null,
    cedula: cedulaProceso,
    fecha_nacimiento: (proc?.fecha_nacimiento as string | null) ?? null,
    edad: (proc?.edad as number | null) ?? null,
    ciudad_residencia: (proc?.ciudad_residencia as string | null) ?? null,
    celular: (proc?.celular as string | null) ?? null,
    experiencia_meses: (proc?.experiencia_meses as number | null) ?? null,
  };
  const { data: otras } = procesoId ? await db.from("seleccion_lecturas").select("clase, campos").eq("proceso_id", procesoId).eq("estado", "leido") : { data: [] };
  const previas: LecturaPrevia[] = ((otras ?? []) as { clase: ClaseDocumento; campos: CampoLeido[] | null }[]).map((o) => ({ clase: o.clase, campos: o.campos ?? [] }));
  for (const leido of r.docs) {
    const revisado = leido.estado === "leido" ? conContradicciones(leido.clase as ClaseDocumento, leido.campos, aspirante, previas, hoy) : { campos: leido.campos, avisos: [] as string[] };
    const campos = revisado.campos;
    const d = { ...leido, campos };
    if (d.estado === "leido") previas.push({ clase: d.clase as ClaseDocumento, campos });
    const grupo = d.archivos.length > 1 ? randomUUID() : null;
    for (const [k, i] of d.archivos.entries()) {
      const m = enLlamada[i];
      // Los campos van en la primera fila del documento; las demás comparten grupo.
      await guardar(filaDe.get(m.id)!, {
        clase: d.clase as ClaseDocumento,
        estado: d.estado,
        campos: k === 0 ? d.campos : [],
        resumen: d.resumen,
        grupo,
        modelo: r.modelo,
        costo_usd: parte,
      });
    }
    // Contradice los datos del aspirante: lo revisa una persona (27-nov-2026, se avisa).
    const claras = revisado.avisos.filter((a) => a.startsWith("⚠"));
    const primera = d.archivos.length ? filaDe.get(enLlamada[d.archivos[0]]?.id) : undefined;
    if (claras.length && procesoId && primera) {
      const { notificar, enlaceProceso } = await import("../notificaciones-servidor");
      const nombre = aspirante.nombre?.trim() || `Aspirante CC ${cedulaProceso ?? ""}`;
      await notificar("documentos", {
        clave: primera,
        procesoId,
        titulo: `${nombre}: ${NOMBRE_CLASE[d.clase as ClaseDocumento] ?? "documento"} no cuadra con sus datos`,
        detalle: `${claras.join(" ")} Revíselo en Candidatos › ficha › Documentos leídos.`,
        enlace: enlaceProceso(cedulaProceso, procesoId),
      });
    }
  }
  return mios.length;
}

/**
 * Lo que ve el asistente de cada archivo leído, por id de mensaje. Las fotos
 * de un mismo documento llevan la lectura completa en la primera.
 */
export async function lecturasDocumentosDeConversacion(conversacionId: string): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const db = createAdminClient();
  const { data, error } = await db
    .from("seleccion_lecturas")
    .select("wa_mensaje_id, grupo, clase, estado, resumen, error, campos, created_at")
    .eq("conversacion_id", conversacionId)
    // «omitido» y «error» también (25-nov-2026): antes el asistente no sabía que el archivo no se pudo abrir.
    .in("estado", ["leido", "ilegible", "omitido", "error"])
    .order("created_at", { ascending: true })
    .limit(60);
  if (error) return m;
  // La cédula que el proceso tiene hoy: la comparación guardada es la del momento de la lectura (R2).
  const { data: conv } = await db.from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  const { data: proc } = conv?.proceso_id ? await db.from("procesos_contratacion").select("cedula").eq("id", conv.proceso_id).maybeSingle() : { data: null };
  const cedulaProceso = (proc?.cedula as string | null) ?? null;
  const vistos = new Set<string>();
  for (const f of data ?? []) {
    // La cédula ya la describe la lectura de la entrega 1 (wa_mensajes.lectura), con más detalle.
    if (!f.wa_mensaje_id || f.clase === "cedula") continue;
    const g = f.grupo as string | null;
    if (g && vistos.has(g)) {
      m.set(f.wa_mensaje_id as string, "otra página del mismo documento");
      continue;
    }
    if (g) vistos.add(g);
    const estado = f.estado as "leido" | "ilegible" | "omitido" | "error";
    const clase = ((f.clase as ClaseDocumento | null) ?? "otro") as ClaseDocumento;
    m.set(
      f.wa_mensaje_id as string,
      resumenParaAsistente({
        clase,
        estado,
        resumen: (estado === "omitido" ? (f.error as string | null) : (f.resumen as string | null)) ?? "",
        campos: conCedulaAlDia(clase, (f.campos as CampoLeido[]) ?? [], cedulaProceso),
      })
    );
  }
  return m;
}

/**
 * R6, lo que el asistente no alcanzó a pedir: los archivos que quedaron
 * ilegibles cuando el asistente ya había respondido (los leyó el cron, o la
 * lectura terminó después del límite). Se le envía una sola vez el mensaje
 * «reenviar_archivo» del catálogo. Si el asistente ya le escribió después de
 * la lectura, él mismo lo pidió: solo se marca. Nunca lanza.
 */
export async function pedirReenvioIlegibles(ahora: Date = new Date()): Promise<{ pedidos: number; omitida?: string }> {
  const db = createAdminClient();
  const desde = new Date(ahora.getTime() - 24 * 3_600_000).toISOString();
  // Dos minutos de gracia: lo reciente lo está respondiendo el asistente.
  const hasta = new Date(ahora.getTime() - 2 * 60_000).toISOString();
  const { data, error } = await db
    .from("seleccion_lecturas")
    .select("id, conversacion_id, updated_at")
    .eq("estado", "ilegible")
    .is("reenvio_pedido_at", null)
    .not("conversacion_id", "is", null)
    .gte("updated_at", desde)
    .lte("updated_at", hasta)
    .limit(100);
  // Sin la migración de la entrega 4 no existe la columna.
  if (error) return { pedidos: 0, omitida: `consulta: ${error.message}` };
  if (!data?.length) return { pedidos: 0 };
  const porConversacion = new Map<string, { ids: string[]; ultima: string }>();
  for (const f of data) {
    const c = f.conversacion_id as string;
    const g = porConversacion.get(c) ?? { ids: [], ultima: "" };
    g.ids.push(f.id as string);
    if (String(f.updated_at) > g.ultima) g.ultima = String(f.updated_at);
    porConversacion.set(c, g);
  }
  const mensaje = await leerMensaje("reenviar_archivo");
  let pedidos = 0;
  for (const [conversacionId, g] of porConversacion) {
    try {
      // Reserva: dos corridas a la vez no lo piden dos veces.
      const { data: tomadas } = await db.from("seleccion_lecturas").update({ reenvio_pedido_at: ahora.toISOString() }).in("id", g.ids).is("reenvio_pedido_at", null).select("id");
      if (!tomadas?.length) continue;
      const { data: saliente } = await db
        .from("wa_mensajes")
        .select("timestamp")
        .eq("conversacion_id", conversacionId)
        .eq("direccion", "saliente")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Ya se le escribió después de saber que era ilegible: el asistente (o una persona) lo pidió.
      if (saliente?.timestamp && new Date(String(saliente.timestamp)).getTime() > new Date(g.ultima).getTime()) continue;
      if (!mensaje || (await esConversacionDeLaboratorio(conversacionId))) continue;
      const { data: conv } = await db.from("wa_conversaciones").select("id, ultimo_entrante_at, wa_contactos(telefono)").eq("id", conversacionId).maybeSingle();
      const contacto = (Array.isArray(conv?.wa_contactos) ? conv?.wa_contactos[0] : conv?.wa_contactos) as { telefono?: string } | null | undefined;
      if (!conv || !contacto?.telefono) continue;
      const r = await enviarMensajeSeleccion({ conversacionId, telefono: contacto.telefono, ultimoEntranteAt: (conv.ultimo_entrante_at as string | null) ?? null, mensaje, valores: {}, ahora });
      if (r === "enviado" || r === "borrador") pedidos++;
    } catch (e) {
      console.error("[seleccion] pedir de nuevo un archivo ilegible:", e);
    }
  }
  return { pedidos };
}

/**
 * Para el cron: conversaciones con archivos de las últimas 24 h sin leer (o
 * con una reserva vencida). Lee hasta `maxConversaciones`.
 */
export async function leerDocumentosPendientesCron(maxConversaciones = 5): Promise<{ conversaciones: number; archivos: number }> {
  const db = createAdminClient();
  const { activa } = await ajustesLectura();
  // Como en el asistente: solo con el proceso de selección activo en el agente.
  const { config } = await getAgenteConClaves();
  if (!activa || !config.activo || config.preguntasRequisitos.trim() === "") return { conversaciones: 0, archivos: 0 };
  // Reservas perdidas: se borran para volver a intentar.
  await db.from("seleccion_lecturas").delete().eq("estado", "pendiente").lt("updated_at", new Date(Date.now() - RESERVA_VENCIDA_MS).toISOString());
  const desde = new Date(Date.now() - 24 * 3_600_000).toISOString();
  // Dos minutos de gracia: lo reciente lo está leyendo el asistente.
  const hasta = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: msgs, error } = await db
    .from("wa_mensajes")
    .select("id, conversacion_id, mime_type, nombre_archivo")
    .eq("direccion", "entrante")
    .in("media_tipo", ["image", "document"])
    .not("media_path", "is", null)
    .gte("timestamp", desde)
    .lte("timestamp", hasta)
    .limit(300);
  if (error || !msgs?.length) return { conversaciones: 0, archivos: 0 };
  const validos = msgs.filter((m) => legible(m));
  const { data: ya, error: eYa } = await db.from("seleccion_lecturas").select("wa_mensaje_id").in("wa_mensaje_id", validos.map((m) => m.id as string));
  if (eYa) return { conversaciones: 0, archivos: 0 };
  const leidos = new Set((ya ?? []).map((x) => x.wa_mensaje_id as string));
  const conArchivos = [...new Set(validos.filter((m) => !leidos.has(m.id as string)).map((m) => m.conversacion_id as string))];
  if (!conArchivos.length) return { conversaciones: 0, archivos: 0 };
  // Solo las de quien ya autorizó sus datos (NF3): las demás no se leen y no deben gastar el cupo de la corrida.
  const { data: enlazadas } = await db.from("wa_conversaciones").select("id, proceso_id").in("id", conArchivos).not("proceso_id", "is", null);
  const procesos = (enlazadas ?? []).map((c) => c.proceso_id as string);
  const { data: autorizados } = procesos.length ? await db.from("procesos_contratacion").select("id").in("id", procesos).eq("autorizacion_datos", "si") : { data: [] as { id: string }[] };
  const conPermiso = new Set((autorizados ?? []).map((p) => p.id as string));
  const permitidas = new Set((enlazadas ?? []).filter((c) => conPermiso.has(c.proceso_id as string)).map((c) => c.id as string));
  const convs = conArchivos.filter((c) => permitidas.has(c)).slice(0, maxConversaciones);
  let archivos = 0;
  for (const c of convs) archivos += await leerDocumentosPendientes(c);
  return { conversaciones: convs.length, archivos };
}
