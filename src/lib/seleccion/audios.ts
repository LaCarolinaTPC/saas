/**
 * Audios del aspirante (entrega 4, A6): se transcriben al llegar, antes de que
 * el asistente responda, y la transcripción queda en wa_mensajes.transcripcion.
 * El asistente y la extracción la leen junto al audio; lo dicho en audio
 * cuenta como declarado. La bandeja la muestra bajo el reproductor.
 *
 * Cada audio se intenta una vez (transcripcion_at lo reserva, también si
 * falla). Sin la migración de la entrega 4 no hay columnas y no se hace nada.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { MODELO_TRANSCRIPCION, transcribirAudio } from "@/lib/ia/transcripcion";
import { getOpenAIKey } from "@/lib/settings";
import { registrarConsumo, topeAlcanzado } from "./consumos-servidor";
import { leerAjustes, valorAjuste } from "./servidor";

/** OpenAI acepta hasta 25 MB; un audio de WhatsApp de 10 minutos pesa ~10 MB. */
const MAX_BYTES = 20_000_000;

/** ¿Está encendida la transcripción (ajuste `transcribir_audios`)? */
async function activa(): Promise<boolean> {
  const ajustes = await leerAjustes().catch(() => []);
  return valorAjuste<unknown>(ajustes, "transcribir_audios", true) !== false;
}

/**
 * Transcribe los últimos audios del aspirante que aún no se han intentado
 * (máx. `limite`, de las últimas 24 h). Nunca lanza. Devuelve cuántos transcribió.
 */
export async function transcribirAudiosPendientes(conversacionId: string, limite = 3): Promise<number> {
  const db = createAdminClient();
  const desde = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: audios, error } = await db
    .from("wa_mensajes")
    .select("id, media_path, mime_type, nombre_archivo")
    .eq("conversacion_id", conversacionId)
    .eq("direccion", "entrante")
    .eq("media_tipo", "audio")
    .not("media_path", "is", null)
    .is("transcripcion_at", null)
    .gte("timestamp", desde)
    .order("timestamp", { ascending: true })
    .limit(limite);
  if (error || !audios?.length) return 0;
  if (!(await activa()) || (await topeAlcanzado())) return 0;
  // Sin clave de OpenAI no se reserva ni se descarga nada: se intenta cuando la configuren.
  if (!(await getOpenAIKey())) return 0;

  const { data: conv } = await db.from("wa_conversaciones").select("proceso_id").eq("id", conversacionId).maybeSingle();
  let hechas = 0;
  for (const a of audios) {
    // Reserva: si otra ejecución ya lo tomó, se salta.
    const { data: tomado } = await db
      .from("wa_mensajes")
      .update({ transcripcion_at: new Date().toISOString() })
      .eq("id", a.id)
      .is("transcripcion_at", null)
      .select("id");
    if (!tomado?.length) continue;
    try {
      const { data: archivo, error: eDescarga } = await db.storage.from("whatsapp").download(a.media_path as string);
      if (eDescarga || !archivo) continue;
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      if (bytes.byteLength > MAX_BYTES) continue;
      const r = await transcribirAudio(bytes, String(a.mime_type ?? "audio/ogg"), String(a.nombre_archivo ?? ""));
      if (!r.ok) {
        // Sin clave no se marca como intentado: se reintenta cuando la configuren.
        if (r.sinClave) await db.from("wa_mensajes").update({ transcripcion_at: null }).eq("id", a.id);
        else console.error("[seleccion] transcripción:", r.error);
        continue;
      }
      if (!r.texto) continue;
      await db.from("wa_mensajes").update({ transcripcion: r.texto.slice(0, 8000) }).eq("id", a.id);
      await registrarConsumo({
        concepto: "transcripcion",
        proveedor: "openai",
        modelo: MODELO_TRANSCRIPCION,
        tokensEntrada: r.tokensEntrada,
        tokensSalida: r.tokensSalida,
        costoUsd: r.costoUsd,
        conversacionId,
        procesoId: (conv?.proceso_id as string | null) ?? null,
      });
      hechas++;
    } catch (e) {
      console.error("[seleccion] transcripción:", e);
    }
  }
  return hechas;
}

/** Transcripción por id de mensaje (vacío si no hay o falta la migración). */
export async function transcripcionesDeConversacion(conversacionId: string): Promise<Map<string, string>> {
  const { data, error } = await createAdminClient()
    .from("wa_mensajes")
    .select("id, transcripcion")
    .eq("conversacion_id", conversacionId)
    .not("transcripcion", "is", null)
    .limit(100);
  const m = new Map<string, string>();
  if (error) return m;
  for (const f of data ?? []) if (f.transcripcion) m.set(f.id as string, f.transcripcion as string);
  return m;
}
