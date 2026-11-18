/**
 * Lectura automática de las fotos que manda el aspirante (pedido de GH del
 * 17-nov-2026): al llegar una foto, antes de que el asistente responda, el
 * modelo del asistente intenta leer la cédula y la lectura queda en el mensaje
 * (wa_mensajes.lectura). El asistente la ve y, en vez de preguntar los datos,
 * los muestra y pide confirmarlos; la extracción solo los usa confirmados.
 * Las fotos de la cédula que no sirven (ilegibles, o reemplazadas por otra
 * mejor del mismo lado) se borran del bucket para no llenar el espacio; la
 * lectura queda en el mensaje, así el asistente sabe que llegó y por qué no sirvió.
 * Sin la migración 20261117214219 la columna no existe y no se lee nada.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgenteClaves, AgenteConfig } from "@/lib/comunicaciones/agente/config";
import { leerImagen, type ImagenEntrada } from "@/lib/comunicaciones/agente/proveedores";
import {
  INSTRUCCION_LECTURA_CEDULA,
  SISTEMA_LECTURA_CEDULA,
  fotosADescartar,
  interpretarLecturaCedula,
  resumenLectura,
  type LecturaCedula,
  type MotivoDescarte,
} from "./lectura-cedula";

/** Lectura guardada en wa_mensajes.lectura. */
export interface LecturaGuardada {
  tipo: "cedula";
  /** Resumen en palabras que ven el asistente y la extracción. */
  resumen: string | null;
  datos?: unknown;
  modelo?: string | null;
  error?: string | null;
  at: string;
  /** El archivo se borró del bucket porque no servía. */
  descartada?: MotivoDescarte;
}

/** Fotos más pesadas no se mandan al modelo (las de WhatsApp suelen pesar menos de 1 MB). */
const MAX_BYTES = 3_500_000;
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Lee las últimas fotos del aspirante que aún no tienen lectura (máx. `limite`).
 * Nunca lanza: si algo falla, deja la lectura con el error para no reintentar en bucle.
 */
export async function leerFotosPendientes(conversacionId: string, config: AgenteConfig, claves: AgenteClaves, limite = 2): Promise<number> {
  const db = createAdminClient();
  const desde = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const { data: fotos, error } = await db
    .from("wa_mensajes")
    .select("id, media_path, mime_type")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "entrante")
    .eq("media_tipo", "image")
    .not("media_path", "is", null)
    .is("lectura", null)
    .gte("timestamp", desde)
    .order("timestamp", { ascending: false })
    .limit(limite);
  if (error || !fotos?.length) return 0;
  let leidas = 0;
  for (const f of fotos) {
    const guardar = (lectura: LecturaGuardada) => db.from("wa_mensajes").update({ lectura }).eq("id", f.id);
    const at = new Date().toISOString();
    try {
      const tipo = String(f.mime_type ?? "image/jpeg").split(";")[0].trim().toLowerCase();
      if (!TIPOS.has(tipo)) {
        await guardar({ tipo: "cedula", resumen: null, error: `Formato no soportado: ${tipo}`, at });
        continue;
      }
      const { data: archivo, error: eDescarga } = await db.storage.from("whatsapp").download(f.media_path as string);
      if (eDescarga || !archivo) {
        await guardar({ tipo: "cedula", resumen: null, error: eDescarga?.message ?? "No se pudo descargar la foto.", at });
        continue;
      }
      const bytes = Buffer.from(await archivo.arrayBuffer());
      if (bytes.length > MAX_BYTES) {
        await guardar({ tipo: "cedula", resumen: "la foto es demasiado pesada para leerla; pídele otra", error: "Foto demasiado pesada.", at });
        continue;
      }
      const imagen: ImagenEntrada = { tipo: tipo as ImagenEntrada["tipo"], base64: bytes.toString("base64") };
      const r = await leerImagen(config, claves, SISTEMA_LECTURA_CEDULA, INSTRUCCION_LECTURA_CEDULA, imagen);
      const lectura = interpretarLecturaCedula(r.texto);
      await guardar({
        tipo: "cedula",
        resumen: lectura ? resumenLectura(lectura) : "no se pudo leer la foto",
        datos: lectura,
        modelo: r.modeloUsado,
        error: lectura ? null : `Respuesta sin JSON: ${r.texto.slice(0, 200)}`,
        at,
      });
      leidas++;
    } catch (e) {
      await guardar({ tipo: "cedula", resumen: null, error: (e instanceof Error ? e.message : String(e)).slice(0, 500), at });
    }
  }
  if (leidas) await descartarFotosInnecesarias(conversacionId).catch((e) => console.error("[seleccion] descarte de fotos:", e));
  return leidas;
}

const NOMBRE_DESCARTADA: Record<MotivoDescarte, string> = {
  ilegible: "Foto de la cédula descartada: no se pudo leer",
  reemplazada: "Foto de la cédula descartada: llegó otra mejor del mismo lado",
};

/**
 * Borra del bucket las fotos de la cédula que no sirven (ver fotosADescartar).
 * También se limpia media_id: si no, asegurarMedios la volvería a bajar de Meta.
 */
export async function descartarFotosInnecesarias(conversacionId: string): Promise<number> {
  const db = createAdminClient();
  const { data: fotos, error } = await db
    .from("wa_mensajes")
    .select("id, media_path, lectura")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "entrante")
    .eq("media_tipo", "image")
    .not("media_path", "is", null)
    .not("lectura", "is", null)
    .order("timestamp", { ascending: true })
    .limit(30);
  if (error || !fotos?.length) return 0;
  const lecturas = fotos.map((f) => ((f.lectura as LecturaGuardada | null)?.datos as LecturaCedula | null | undefined) ?? null);
  let borradas = 0;
  for (const [i, motivo] of fotosADescartar(lecturas)) {
    const f = fotos[i];
    const { error: eBorrar } = await db.storage.from("whatsapp").remove([f.media_path as string]);
    if (eBorrar) {
      console.error("[seleccion] no se pudo borrar la foto:", eBorrar.message);
      continue;
    }
    await db
      .from("wa_mensajes")
      .update({
        media_path: null,
        media_id: null,
        nombre_archivo: NOMBRE_DESCARTADA[motivo],
        lectura: { ...(f.lectura as LecturaGuardada), descartada: motivo },
      })
      .eq("id", f.id);
    borradas++;
  }
  return borradas;
}

/**
 * Nombres y apellidos leídos en la foto de la cédula que mandó el aspirante,
 * para consultar el RUNT con su apellido sin esperar al RNMC (pedido de GH del
 * 18-nov-2026). Solo una lectura de cédula cuyo número sea el del proceso; la
 * más reciente. null si no hay (o falta la migración de la lectura).
 */
export async function cedulaLeidaDeProceso(procesoId: string, cedula: string): Promise<{ nombres: string | null; apellidos: string | null } | null> {
  const db = createAdminClient();
  const { data: convs } = await db.from("wa_conversaciones").select("id").eq("proceso_id", procesoId).limit(5);
  const ids = (convs ?? []).map((c) => c.id as string);
  if (!ids.length) return null;
  const { data, error } = await db
    .from("wa_mensajes")
    .select("lectura, timestamp")
    .in("conversacion_id", ids)
    .not("lectura", "is", null)
    .order("timestamp", { ascending: false })
    .limit(30);
  if (error) return null;
  const limpia = cedula.replace(/\D/g, "");
  for (const f of data ?? []) {
    const l = (f.lectura as LecturaGuardada | null)?.datos as LecturaCedula | null | undefined;
    if (l?.esCedula && l.numero === limpia && l.apellidos) return { nombres: l.nombres, apellidos: l.apellidos };
  }
  return null;
}

/** Resumen de la lectura por id de mensaje (vacío si no hay o falta la migración). */
export async function lecturasDeConversacion(conversacionId: string): Promise<Map<string, string>> {
  const { data, error } = await createAdminClient()
    .from("wa_mensajes")
    .select("id, lectura")
    .eq("conversacion_id", conversacionId)
    .not("lectura", "is", null)
    .limit(50);
  const m = new Map<string, string>();
  if (error) return m;
  for (const f of data ?? []) {
    const resumen = (f.lectura as LecturaGuardada | null)?.resumen;
    if (resumen) m.set(f.id as string, resumen);
  }
  return m;
}
