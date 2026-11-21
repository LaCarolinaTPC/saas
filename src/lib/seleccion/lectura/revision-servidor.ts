/**
 * «Documentos leídos» (entrega 4, R5): lo que se leyó de los archivos del
 * aspirante y su revisión por una persona. Aceptar un campo lo aplica al
 * proceso solo si el dato estaba vacío (y marca su origen como «leído»), crea
 * las referencias, marca el documento como recibido en la carpeta y copia el
 * archivo a la carpeta. Solo servidor; quien llama revisa los permisos.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { firmarMedios } from "@/lib/comunicaciones/medios";
import { registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { ADJUNTO_MIMES, estadosCarpeta, guardarAdjuntoSeleccion, itemsCarpeta, marcarItemCarpeta, tipoDeItem } from "../carpeta-servidor";
import { cambiosParaProceso, conCalculados, itemDeClase, referenciasAceptadas } from "./interpretar";
import type { CampoLeido, ClaseDocumento, DecisionCampo } from "./esquema";

export interface ArchivoLeido {
  lecturaId: string;
  waMensajeId: string | null;
  url: string | null;
  mime: string | null;
  nombre: string | null;
  adjuntoId: string | null;
}

export interface DocumentoLeidoVista {
  /** Fila que lleva los campos (la primera del documento). */
  id: string;
  clase: ClaseDocumento;
  estado: "pendiente" | "leido" | "ilegible" | "error" | "omitido";
  resumen: string | null;
  error: string | null;
  campos: CampoLeido[];
  archivos: ArchivoLeido[];
  modelo: string | null;
  costoUsd: number;
  revisadoPor: string | null;
  revisadoAt: string | null;
  createdAt: string;
}

interface FilaLectura {
  id: string;
  wa_mensaje_id: string | null;
  adjunto_id: string | null;
  conversacion_id: string | null;
  proceso_id: string | null;
  grupo: string | null;
  clase: ClaseDocumento;
  estado: DocumentoLeidoVista["estado"];
  campos: CampoLeido[] | null;
  resumen: string | null;
  error: string | null;
  modelo: string | null;
  costo_usd: number | string | null;
  revisado_por: string | null;
  revisado_at: string | null;
  created_at: string;
}

async function conversacionesDe(procesoId: string): Promise<string[]> {
  const { data } = await createAdminClient().from("wa_conversaciones").select("id").eq("proceso_id", procesoId).limit(5);
  return (data ?? []).map((c) => c.id as string);
}

/** Lo leído del proceso, por documento (las fotos de un mismo documento juntas). null si falta la migración. */
export async function lecturasDeProceso(procesoId: string): Promise<DocumentoLeidoVista[] | null> {
  // Va dentro de un filtro .or(): solo un UUID.
  if (!/^[0-9a-f-]{36}$/i.test(procesoId)) return [];
  const db = createAdminClient();
  const convs = await conversacionesDe(procesoId);
  const filtro = [`proceso_id.eq.${procesoId}`, ...(convs.length ? [`conversacion_id.in.(${convs.join(",")})`] : [])].join(",");
  const { data, error } = await db.from("seleccion_lecturas").select("*").or(filtro).order("created_at", { ascending: true }).limit(100);
  if (error) return null;
  const filas = (data ?? []) as FilaLectura[];
  const ids = filas.map((f) => f.wa_mensaje_id).filter((x): x is string => !!x);
  const { data: msgs } = ids.length
    ? await db.from("wa_mensajes").select("id, media_path, mime_type, nombre_archivo").in("id", ids)
    : { data: [] as { id: string; media_path: string | null; mime_type: string | null; nombre_archivo: string | null }[] };
  const porId = new Map((msgs ?? []).map((m) => [m.id as string, m]));
  const urls = await firmarMedios((msgs ?? []).map((m) => (m.media_path as string | null) ?? "").filter(Boolean));

  const docs = new Map<string, DocumentoLeidoVista>();
  for (const f of filas) {
    const clave = f.grupo ?? f.id;
    const m = f.wa_mensaje_id ? porId.get(f.wa_mensaje_id) : undefined;
    const archivo: ArchivoLeido = {
      lecturaId: f.id,
      waMensajeId: f.wa_mensaje_id,
      url: m?.media_path ? (urls.get(m.media_path as string) ?? null) : null,
      mime: (m?.mime_type as string | null) ?? null,
      nombre: (m?.nombre_archivo as string | null) ?? null,
      adjuntoId: f.adjunto_id,
    };
    const d = docs.get(clave);
    if (d) {
      d.archivos.push(archivo);
      d.costoUsd += Number(f.costo_usd) || 0;
      if (f.campos?.length && !d.campos.length) d.campos = f.campos;
      continue;
    }
    docs.set(clave, {
      id: f.id,
      clase: f.clase,
      estado: f.estado,
      resumen: f.resumen,
      error: f.error,
      campos: f.campos ?? [],
      archivos: [archivo],
      modelo: f.modelo,
      costoUsd: Number(f.costo_usd) || 0,
      revisadoPor: f.revisado_por,
      revisadoAt: f.revisado_at,
      createdAt: f.created_at,
    });
  }
  return [...docs.values()].reverse();
}

export interface DecisionEntrada {
  campo: string;
  decision: DecisionCampo;
  valor_final?: unknown;
}

/**
 * Guarda la revisión de un documento y aplica lo aceptado. `procesoId` es el
 * de la ficha (la lectura puede ser de antes de que existiera el proceso).
 */
export async function revisarLectura(
  procesoId: string,
  lecturaId: string,
  decisiones: DecisionEntrada[],
  actor: ActorProceso
): Promise<{ ok: boolean; error?: string; aplicados?: string[] }> {
  const db = createAdminClient();
  const { data: fila, error } = await db.from("seleccion_lecturas").select("*").eq("id", lecturaId).maybeSingle();
  if (error || !fila) return { ok: false, error: "No se encontró la lectura." };
  const f = fila as FilaLectura;
  const convs = await conversacionesDe(procesoId);
  if (f.proceso_id !== procesoId && !(f.conversacion_id && convs.includes(f.conversacion_id))) return { ok: false, error: "Esa lectura no es de este proceso." };

  const decididos = new Map(decisiones.map((d) => [d.campo, d]));
  const decidido: CampoLeido[] = (f.campos ?? []).map((c) => {
    const d = decididos.get(c.campo);
    if (c.calculado || !d || !["aceptado", "corregido", "rechazado"].includes(d.decision)) return c;
    const valorFinal = d.decision === "corregido" ? (typeof d.valor_final === "string" ? d.valor_final.trim().slice(0, 500) : d.valor_final) : null;
    return { ...c, decision: d.decision, valor_final: valorFinal };
  });
  const campos = conCalculados(decidido);
  const ahora = new Date().toISOString();
  const filasGrupo = f.grupo
    ? (((await db.from("seleccion_lecturas").select("id, wa_mensaje_id, adjunto_id").eq("grupo", f.grupo)).data ?? []) as Pick<FilaLectura, "id" | "wa_mensaje_id" | "adjunto_id">[])
    : [{ id: f.id, wa_mensaje_id: f.wa_mensaje_id, adjunto_id: f.adjunto_id }];
  await db.from("seleccion_lecturas").update({ campos, proceso_id: procesoId, revisado_por: actor.userEmail, revisado_at: ahora, updated_at: ahora }).eq("id", f.id);
  if (f.grupo) await db.from("seleccion_lecturas").update({ proceso_id: procesoId, revisado_por: actor.userEmail, revisado_at: ahora }).eq("grupo", f.grupo).neq("id", f.id);

  const aplicados: string[] = [];
  const algunoAceptado = campos.some((c) => c.decision === "aceptado" || c.decision === "corregido");

  // 1. Datos del proceso, solo los vacíos.
  const { data: proc } = await db
    .from("procesos_contratacion")
    .select("fecha_nacimiento, cedula_fecha_expedicion, experiencia_meses, licencia_restricciones, edad, datos_origen")
    .eq("id", procesoId)
    .maybeSingle();
  if (proc) {
    const { cambios, origen } = cambiosParaProceso(f.clase, campos, proc as Parameters<typeof cambiosParaProceso>[2], fechaBogota(ahora));
    if (Object.keys(cambios).length) {
      const datosOrigen = { ...((proc.datos_origen as Record<string, string> | null) ?? {}), ...origen };
      const { error: eProc } = await db.from("procesos_contratacion").update({ ...cambios, datos_origen: datosOrigen, updated_at: ahora }).eq("id", procesoId);
      if (!eProc) aplicados.push(...Object.keys(cambios));
    }
  }

  // 2. Referencias (sin repetir las que ya están por nombre o teléfono).
  const refs = referenciasAceptadas(campos);
  if (refs.length) {
    const { data: existentes } = await db.from("seleccion_referencias").select("nombre, telefono").eq("proceso_id", procesoId);
    const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    const tel = (s: unknown) => String(s ?? "").replace(/\D/g, "");
    let nuevas = 0;
    for (const r of refs) {
      const repetida = (existentes ?? []).some((e) => (r.nombre && norm(e.nombre) === norm(r.nombre)) || (tel(r.telefono).length >= 7 && tel(e.telefono) === tel(r.telefono)));
      if (repetida) continue;
      const { error: eRef } = await db.from("seleccion_referencias").insert({
        proceso_id: procesoId,
        tipo: r.tipo,
        nombre: String(r.nombre ?? r.telefono ?? "Sin nombre").slice(0, 120),
        telefono: r.telefono ? String(r.telefono).slice(0, 30) : null,
        empresa: r.empresa ? String(r.empresa).slice(0, 120) : null,
        origen: f.clase === "carta_laboral" ? "carta laboral (leída)" : "hoja de vida (leída)",
        registrada_por: actor.userEmail,
      });
      if (!eRef) nuevas++;
    }
    if (nuevas) aplicados.push(`${nuevas} referencias`);
  }

  // 3. Carpeta: recibido (validar sigue siendo de una persona, a propósito) y copia del archivo.
  if (algunoAceptado || f.clase !== "otro") {
    const items = await itemsCarpeta();
    const item = itemDeClase(f.clase, items);
    if (item && algunoAceptado) {
      const actual = (await estadosCarpeta(procesoId)).find((e) => e.item === item)?.estado;
      if (!actual || actual === "pendiente") {
        const r = await marcarItemCarpeta(procesoId, item, "recibido", "Recibido por WhatsApp y revisado en «Documentos leídos»", actor);
        if (r.ok) aplicados.push(`«${item}» recibido`);
      }
    }
    if (algunoAceptado) {
      for (const g of filasGrupo) {
        if (g.adjunto_id || !g.wa_mensaje_id) continue;
        const { data: m } = await db.from("wa_mensajes").select("media_path, mime_type, nombre_archivo").eq("id", g.wa_mensaje_id).maybeSingle();
        const mime = String(m?.mime_type ?? "").split(";")[0].trim().toLowerCase();
        if (!m?.media_path || !(mime in ADJUNTO_MIMES)) continue;
        const { data: archivo } = await db.storage.from("whatsapp").download(m.media_path as string);
        if (!archivo) continue;
        try {
          const adjuntoId = await guardarAdjuntoSeleccion(
            {
              procesoId,
              tipo: item ? tipoDeItem(item) : "otro",
              nombre: (m.nombre_archivo as string | null) ?? `${f.clase}.${ADJUNTO_MIMES[mime]}`,
              mime,
              buffer: Buffer.from(await archivo.arrayBuffer()),
              origen: "whatsapp",
              waMensajeId: g.wa_mensaje_id,
            },
            actor
          );
          await db.from("seleccion_lecturas").update({ adjunto_id: adjuntoId }).eq("id", g.id);
        } catch (e) {
          console.error("[seleccion] copia del documento leído:", e);
        }
      }
    }
  }

  await registrarEvento(
    procesoId,
    {
      tipo: "carpeta",
      detalle: {
        lectura: f.clase,
        aceptados: campos.filter((c) => c.decision === "aceptado" || c.decision === "corregido").length,
        rechazados: campos.filter((c) => c.decision === "rechazado").length,
        aplicados,
      },
    },
    actor
  );
  return { ok: true, aplicados };
}

/** Cambia la clase de un documento mal clasificado (los campos se conservan). */
export async function cambiarClaseLectura(procesoId: string, lecturaId: string, clase: ClaseDocumento, actor: ActorProceso): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient();
  const { data: f } = await db.from("seleccion_lecturas").select("grupo, proceso_id, conversacion_id").eq("id", lecturaId).maybeSingle();
  if (!f) return { ok: false, error: "No se encontró la lectura." };
  if (f.proceso_id !== procesoId && !(await conversacionesDe(procesoId)).includes(f.conversacion_id as string)) return { ok: false, error: "Esa lectura no es de este proceso." };
  const q = db.from("seleccion_lecturas").update({ clase, updated_at: new Date().toISOString() });
  const { error } = f.grupo ? await q.eq("grupo", f.grupo) : await q.eq("id", lecturaId);
  if (error) return { ok: false, error: error.message };
  await registrarEvento(procesoId, { tipo: "carpeta", detalle: { lectura_clase: clase } }, actor);
  return { ok: true };
}
