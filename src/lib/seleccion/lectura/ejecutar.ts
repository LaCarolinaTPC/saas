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
import { createAdminClient } from "@/lib/supabase/admin";
import { configDocumentos, getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import type { ImagenEntrada } from "@/lib/comunicaciones/agente/proveedores";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import type { LecturaCedula } from "../lectura-cedula";
import type { LecturaGuardada } from "../lectura-fotos";
import { costoUsd } from "../consumos";
import { registrarConsumo, topeAlcanzado } from "../consumos-servidor";
import { esConversacionDeLaboratorio } from "../laboratorio-servidor";
import { leerAjustes, valorAjuste } from "../servidor";
import { camposDeDocumento, resumenParaAsistente } from "./interpretar";
import { leerArchivos, MAX_ARCHIVOS } from "./leer";
import { archivoParaModelo, esDocAntiguo, formatoDe } from "./formatos";
import { validarCartasAutomaticas } from "./revision-servidor";
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
 * 24 h, máx. 8 por llamada). Nunca lanza. Devuelve cuántos archivos leyó.
 */
export async function leerDocumentosPendientes(conversacionId: string): Promise<number> {
  try {
    const leidos = await leer(conversacionId);
    // Las cartas laborales que coinciden con la hoja de vida se validan solas (23-nov-2026).
    if (leidos > 0) {
      const { data: conv } = await createAdminClient().from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
      if (conv?.proceso_id) {
        await validarCartasAutomaticas(conv.proceso_id as string).catch((e) => console.error("[seleccion] validación automática de cartas:", e));
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
  const { data: proc } = procesoId ? await db.from("procesos_contratacion").select("cedula").eq("id", procesoId).maybeSingle() : { data: null };
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
    for (const m of enLlamada) await guardar(filaDe.get(m.id)!, { estado: "error", error: `Respuesta sin JSON: ${r.texto.slice(0, 200)}`, modelo: r.modelo, costo_usd: parte });
    return 0;
  }
  for (const d of r.docs) {
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
  }
  return mios.length;
}

/**
 * Lo que ve el asistente de cada archivo leído, por id de mensaje. Las fotos
 * de un mismo documento llevan la lectura completa en la primera.
 */
export async function lecturasDocumentosDeConversacion(conversacionId: string): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const { data, error } = await createAdminClient()
    .from("seleccion_lecturas")
    .select("wa_mensaje_id, grupo, clase, estado, resumen, campos, created_at")
    .eq("conversacion_id", conversacionId)
    .in("estado", ["leido", "ilegible"])
    .order("created_at", { ascending: true })
    .limit(60);
  if (error) return m;
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
    m.set(
      f.wa_mensaje_id as string,
      resumenParaAsistente({ clase: f.clase as ClaseDocumento, estado: f.estado as "leido" | "ilegible", resumen: (f.resumen as string) ?? "", campos: (f.campos as CampoLeido[]) ?? [] })
    );
  }
  return m;
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
  const convs = [...new Set(validos.filter((m) => !leidos.has(m.id as string)).map((m) => m.conversacion_id as string))].slice(0, maxConversaciones);
  let archivos = 0;
  for (const c of convs) archivos += await leerDocumentosPendientes(c);
  return { conversaciones: convs.length, archivos };
}
