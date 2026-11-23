/**
 * Carpeta del aspirante (entrega 3, H1): los documentos que pide el ajuste
 * `carpeta_items` con su estado, las referencias y los archivos del proceso
 * en el bucket privado `seleccion`. Solo servidor; quien llama revisa los
 * permisos. Mismo patrón de archivos que src/lib/incapacidades/adjuntos.ts:
 * nombre irrepetible, URL firmada de una hora y anulación con motivo.
 */
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { leerAjustes, valorAjuste } from "./servidor";
import type { EstadoCarpeta } from "./contratacion";
import { verificarExperienciaDeEmpresa } from "./experiencia-servidor";

export const BUCKET_SELECCION = "seleccion";
const URL_FIRMADA_SEG = 60 * 60;

export const ADJUNTO_MIMES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  // Hojas de vida en Word (lectura de documentos).
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
export const ADJUNTO_LIMITE_BYTES = 10 * 1024 * 1024;

/** Tipos de archivo además de los ítems de la carpeta (que van con su nombre). */
export const TIPOS_FIJOS: Record<string, string> = {
  examen_f1: "Exámenes, fase 1",
  examen_f2: "Exámenes, fase 2",
  // Entrega 4: resultado de la psicotécnica hecha en una IPS.
  psicotecnica: "Psicotécnica",
  otro: "Otro",
};

/** Clave de archivo de un ítem de la carpeta: «Carta laboral» → «carpeta:carta-laboral». */
export const tipoDeItem = (item: string) =>
  `carpeta:${item.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

export const ITEMS_CARPETA_POR_DEFECTO = ["Hoja de vida", "Fotocopia de la cédula", "Fotocopia de la licencia", "Carta laboral", "Referencia laboral", "Referencia personal"];

export async function itemsCarpeta(): Promise<string[]> {
  const v = valorAjuste<unknown>(await leerAjustes().catch(() => []), "carpeta_items", ITEMS_CARPETA_POR_DEFECTO);
  return Array.isArray(v) && v.length ? v.map(String) : ITEMS_CARPETA_POR_DEFECTO;
}

export interface AdjuntoVista {
  id: string;
  tipo: string;
  nombre: string;
  mime: string;
  tamano: number;
  subidoPor: string | null;
  createdAt: string;
  url: string | null;
}

export interface ItemCarpetaVista {
  item: string;
  tipo: string;
  estado: EstadoCarpeta;
  nota: string | null;
  validadoPor: string | null;
  validadoAt: string | null;
  archivos: AdjuntoVista[];
}

export interface ReferenciaVista {
  id: string;
  tipo: "laboral" | "personal";
  nombre: string;
  telefono: string | null;
  empresa: string | null;
  origen: string | null;
  habloCon: string | null;
  resultado: string | null;
  validadaAt: string | null;
  validadaPor: string | null;
}

export interface CarpetaVista {
  items: ItemCarpetaVista[];
  /** Archivos que no son de un ítem (exámenes, otros). */
  otros: AdjuntoVista[];
  referencias: ReferenciaVista[];
}

/** La carpeta del proceso. null si falta la migración de la entrega 3. */
export async function carpetaDeProceso(procesoId: string): Promise<CarpetaVista | null> {
  const db = createAdminClient();
  const [items, estados, adjuntos, refs] = await Promise.all([
    itemsCarpeta(),
    db.from("seleccion_carpeta_items").select("item, estado, nota, validado_por, validado_at").eq("proceso_id", procesoId),
    db.from("seleccion_adjuntos").select("id, tipo, ruta, nombre, mime, tamano, subido_por, created_at").eq("proceso_id", procesoId).is("anulado_at", null).order("created_at", { ascending: false }),
    db.from("seleccion_referencias").select("*").eq("proceso_id", procesoId).order("created_at"),
  ]);
  if (estados.error || adjuntos.error || refs.error) return null;
  const rutas = (adjuntos.data ?? []).map((a) => a.ruta as string);
  const urls = new Map<string, string>();
  if (rutas.length) {
    const { data: firmadas } = await db.storage.from(BUCKET_SELECCION).createSignedUrls(rutas, URL_FIRMADA_SEG);
    for (const f of firmadas ?? []) if (f.path && f.signedUrl) urls.set(f.path, f.signedUrl);
  }
  const archivos: AdjuntoVista[] = (adjuntos.data ?? []).map((a) => ({
    id: a.id as string,
    tipo: a.tipo as string,
    nombre: a.nombre as string,
    mime: a.mime as string,
    tamano: Number(a.tamano),
    subidoPor: (a.subido_por as string | null) ?? null,
    createdAt: a.created_at as string,
    url: urls.get(a.ruta as string) ?? null,
  }));
  const tiposItems = new Set(items.map(tipoDeItem));
  return {
    items: items.map((item) => {
      const e = (estados.data ?? []).find((x) => x.item === item);
      const tipo = tipoDeItem(item);
      return {
        item,
        tipo,
        estado: ((e?.estado as EstadoCarpeta | undefined) ?? "pendiente"),
        nota: (e?.nota as string | null) ?? null,
        validadoPor: (e?.validado_por as string | null) ?? null,
        validadoAt: (e?.validado_at as string | null) ?? null,
        archivos: archivos.filter((a) => a.tipo === tipo),
      };
    }),
    otros: archivos.filter((a) => !tiposItems.has(a.tipo)),
    referencias: (refs.data ?? []).map((r) => ({
      id: r.id as string,
      tipo: r.tipo as ReferenciaVista["tipo"],
      nombre: r.nombre as string,
      telefono: (r.telefono as string | null) ?? null,
      empresa: (r.empresa as string | null) ?? null,
      origen: (r.origen as string | null) ?? null,
      habloCon: (r.hablo_con as string | null) ?? null,
      resultado: (r.resultado as string | null) ?? null,
      validadaAt: (r.validada_at as string | null) ?? null,
      validadaPor: (r.validada_por as string | null) ?? null,
    })),
  };
}

/** Estado de los ítems de la carpeta, para las condiciones para contratar. */
export async function estadosCarpeta(procesoId: string): Promise<{ item: string; estado: EstadoCarpeta }[]> {
  const { data, error } = await createAdminClient().from("seleccion_carpeta_items").select("item, estado").eq("proceso_id", procesoId);
  return error ? [] : ((data ?? []) as { item: string; estado: EstadoCarpeta }[]);
}

/** Cambia el estado de un documento de la carpeta. Validar deja quién y cuándo. */
export async function marcarItemCarpeta(
  procesoId: string,
  item: string,
  estado: EstadoCarpeta,
  nota: string | null,
  actor: ActorProceso
): Promise<{ ok: boolean; error?: string }> {
  if (!["pendiente", "recibido", "validado"].includes(estado)) return { ok: false, error: "Estado no válido." };
  const items = await itemsCarpeta();
  if (!items.includes(item)) return { ok: false, error: "Ese documento no está en la lista de la carpeta." };
  const validado = estado === "validado";
  const { error } = await createAdminClient().from("seleccion_carpeta_items").upsert(
    {
      proceso_id: procesoId,
      item,
      estado,
      nota: String(nota ?? "").trim().slice(0, 500) || null,
      validado_por: validado ? actor.userEmail : null,
      validado_at: validado ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "proceso_id,item" }
  );
  if (error) return { ok: false, error: `No se pudo guardar (${error.message}).` };
  await registrarEvento(procesoId, { tipo: "carpeta", detalle: { item, estado } }, actor);
  return { ok: true };
}

/** Nota con la que un archivo deja el documento «recibido»: así, anulado el último archivo, vuelve a «pendiente» (lo recibido en físico no). */
const NOTA_CON_ARCHIVO = "Con archivo adjunto";

/** Sube el archivo y registra la fila; si la fila falla, borra el archivo. Un archivo de un ítem pendiente lo deja «recibido». */
export async function guardarAdjuntoSeleccion(
  d: { procesoId: string; tipo: string; nombre: string; mime: string; buffer: Buffer; origen?: "subido" | "whatsapp"; waMensajeId?: string | null },
  actor: ActorProceso
): Promise<string> {
  const db = createAdminClient();
  const ext = ADJUNTO_MIMES[d.mime] ?? "bin";
  const ruta = `${d.procesoId}/${d.tipo.replace(/[^a-z0-9_-]/gi, "_")}/${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
  const { error: e1 } = await db.storage.from(BUCKET_SELECCION).upload(ruta, d.buffer, { contentType: d.mime, upsert: false });
  if (e1) throw new Error(`No se pudo guardar el archivo (${e1.message}). ¿Falta aplicar la migración de la entrega 3?`);
  const { data, error } = await db
    .from("seleccion_adjuntos")
    .insert({
      proceso_id: d.procesoId,
      tipo: d.tipo,
      ruta,
      nombre: d.nombre.slice(0, 200),
      mime: d.mime,
      tamano: d.buffer.byteLength,
      // Entrega 4: el documento que llegó por WhatsApp y se aceptó en «Documentos leídos».
      origen: d.origen ?? "subido",
      wa_mensaje_id: d.waMensajeId ?? null,
      subido_por: actor.userEmail,
    })
    .select("id")
    .single();
  if (error) {
    await db.storage.from(BUCKET_SELECCION).remove([ruta]).catch(() => undefined);
    throw new Error(error.message);
  }
  const item = (await itemsCarpeta()).find((i) => tipoDeItem(i) === d.tipo);
  if (item) {
    const actual = (await estadosCarpeta(d.procesoId)).find((e) => e.item === item)?.estado ?? "pendiente";
    if (actual === "pendiente") await marcarItemCarpeta(d.procesoId, item, "recibido", NOTA_CON_ARCHIVO, actor);
  }
  await registrarEvento(d.procesoId, { tipo: "carpeta", detalle: { archivo: d.nombre, tipo: d.tipo } }, actor);
  return data.id as string;
}

export async function anularAdjuntoSeleccion(adjuntoId: string, motivo: string, actor: ActorProceso): Promise<{ ok: boolean; error?: string; procesoId?: string }> {
  const m = String(motivo ?? "").trim();
  if (m.length < 5) return { ok: false, error: "Escriba el motivo (mínimo 5 caracteres)." };
  const { data, error } = await createAdminClient()
    .from("seleccion_adjuntos")
    .update({ anulado_at: new Date().toISOString(), anulado_por: actor.userEmail, anulado_motivo: m.slice(0, 300) })
    .eq("id", adjuntoId)
    .is("anulado_at", null)
    .select("proceso_id, nombre, tipo")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "El archivo no existe o ya estaba anulado." };
  await registrarEvento(data.proceso_id as string, { tipo: "carpeta", detalle: { archivo_anulado: data.nombre, motivo: m } }, actor);
  // Era el único archivo de un documento que quedó «recibido» por él: vuelve a «pendiente» (23-nov-2026).
  await devolverAPendienteSinArchivo(data.proceso_id as string, data.tipo as string, actor).catch(() => undefined);
  return { ok: true, procesoId: data.proceso_id as string };
}

async function devolverAPendienteSinArchivo(procesoId: string, tipo: string, actor: ActorProceso): Promise<void> {
  const item = (await itemsCarpeta()).find((i) => tipoDeItem(i) === tipo);
  if (!item) return;
  const db = createAdminClient();
  const [{ count }, { data: fila }] = await Promise.all([
    db.from("seleccion_adjuntos").select("id", { count: "exact", head: true }).eq("proceso_id", procesoId).eq("tipo", tipo).is("anulado_at", null),
    db.from("seleccion_carpeta_items").select("estado, nota").eq("proceso_id", procesoId).eq("item", item).maybeSingle(),
  ]);
  if ((count ?? 0) > 0 || fila?.estado !== "recibido" || fila.nota !== NOTA_CON_ARCHIVO) return;
  await marcarItemCarpeta(procesoId, item, "pendiente", null, actor);
}

/** Una referencia nueva del aspirante. */
export async function agregarReferencia(
  procesoId: string,
  d: { tipo: "laboral" | "personal"; nombre: string; telefono?: string | null; empresa?: string | null; origen?: string | null },
  actor: ActorProceso
): Promise<{ ok: boolean; error?: string }> {
  if (d.tipo !== "laboral" && d.tipo !== "personal") return { ok: false, error: "Elija si es laboral o personal." };
  const nombre = String(d.nombre ?? "").trim().slice(0, 120);
  if (nombre.length < 3) return { ok: false, error: "Escriba el nombre de la referencia." };
  const t = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n) || null;
  const { error } = await createAdminClient()
    .from("seleccion_referencias")
    .insert({ proceso_id: procesoId, tipo: d.tipo, nombre, telefono: t(d.telefono, 30), empresa: t(d.empresa, 120), origen: t(d.origen, 120), registrada_por: actor.userEmail });
  if (error) return { ok: false, error: `No se pudo guardar la referencia (${error.message}).` };
  await registrarEvento(procesoId, { tipo: "carpeta", detalle: { referencia: nombre, tipo: d.tipo } }, actor);
  return { ok: true };
}

/** Deja constancia de la llamada a la referencia: con quién se habló y qué dijo. */
export async function validarReferencia(referenciaId: string, d: { habloCon: string; resultado: string }, actor: ActorProceso): Promise<{ ok: boolean; error?: string }> {
  const habloCon = String(d.habloCon ?? "").trim().slice(0, 120);
  const resultado = String(d.resultado ?? "").trim().slice(0, 1000);
  if (!habloCon || resultado.length < 5) return { ok: false, error: "Escriba con quién habló y qué le dijeron." };
  const { data, error } = await createAdminClient()
    .from("seleccion_referencias")
    .update({ hablo_con: habloCon, resultado, validada_at: new Date().toISOString(), validada_por: actor.userEmail })
    .eq("id", referenciaId)
    .select("proceso_id, nombre, tipo, empresa")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "La referencia no existe." };
  await registrarEvento(data.proceso_id as string, { tipo: "carpeta", detalle: { referencia_validada: data.nombre, hablo_con: habloCon } }, actor);
  // Una referencia laboral validada verifica la experiencia en su empresa (se puede cambiar a mano en la ficha).
  if (data.tipo === "laboral" && data.empresa) {
    await verificarExperienciaDeEmpresa(data.proceso_id as string, data.empresa as string, "referencia", `Habló con ${habloCon}: ${resultado}`, actor).catch(() => 0);
  }
  return { ok: true };
}
