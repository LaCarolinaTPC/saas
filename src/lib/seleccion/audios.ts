/**
 * Audios del aspirante (entrega 4, A6): se transcriben al llegar, antes de que
 * el asistente responda, y la transcripción queda en wa_mensajes.transcripcion.
 * El asistente y la extracción la leen junto al audio; lo dicho en audio
 * cuenta como declarado. La bandeja la muestra bajo el reproductor.
 *
 * Transcribe con el proveedor y el modelo de «Voz» (Candidatos › Selección › IA); si no
 * hay clave o falla, con el otro proveedor (OpenRouter u OpenAI).
 *
 * Cada audio se intenta una vez (transcripcion_at lo reserva, también si
 * falla). Sin la migración de la entrega 4 no hay columnas y no se hace nada.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgenteConfig } from "@/lib/comunicaciones/agente/config";
import { hayTranscripcion, transcribirAudio, type ModeloTranscripcion } from "@/lib/ia/transcripcion";
import { registrarConsumo, topeAlcanzado } from "./consumos-servidor";
import { calidadTranscripcion, transcripcionParaGuardar } from "./calidad-audio";

/** El segundo modelo, para comparar: el otro de los dos (Whisper es unas quince veces más barato). */
export const modeloDeControl = (m: ModeloTranscripcion): ModeloTranscripcion => (m === "whisper" ? "gpt4o_mini" : "whisper");
import { leerAjustes, valorAjuste } from "./servidor";

/** Los proveedores aceptan hasta 25 MB; un audio de WhatsApp de 10 minutos pesa unos 2 MB. */
const MAX_BYTES = 20_000_000;

/**
 * ¿Está encendida la transcripción (ajuste `transcribir_audios`)? El proveedor
 * y el modelo son los de «Voz» en la pestaña IA de Selección.
 */
async function ajustesTranscripcion(): Promise<{ activa: boolean; modelo: ModeloTranscripcion; proveedor: "openrouter" | "openai" }> {
  const [ajustes, config] = await Promise.all([leerAjustes().catch(() => []), getAgenteConfig()]);
  return {
    activa: valorAjuste<unknown>(ajustes, "transcribir_audios", true) !== false,
    modelo: config.vozModelo,
    proveedor: config.vozProveedor,
  };
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
  const { activa, modelo, proveedor } = await ajustesTranscripcion();
  if (!activa || (await topeAlcanzado())) return 0;
  // Sin clave de OpenRouter ni de OpenAI no se reserva ni se descarga nada: se intenta cuando la configuren.
  if (!(await hayTranscripcion())) return 0;

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
      const r = await transcribirAudio(bytes, String(a.mime_type ?? "audio/ogg"), String(a.nombre_archivo ?? ""), { modelo, proveedor });
      if (!r.ok) {
        // Sin clave no se marca como intentado: se reintenta cuando la configuren.
        if (r.sinClave) await db.from("wa_mensajes").update({ transcripcion_at: null }).eq("id", a.id);
        else console.error("[seleccion] transcripción:", r.error);
        continue;
      }
      const procesoId = (conv?.proceso_id as string | null) ?? null;
      // El costo se registra aunque el audio no tuviera palabras: el proveedor lo cobra igual.
      await registrarConsumo({ concepto: "transcripcion", proveedor: r.proveedor, modelo: r.modelo, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, costoUsd: r.costoUsd, conversacionId, procesoId });
      // Control con el otro modelo (23-nov-2026): con ruido fuerte el modelo inventa
      // algo con apariencia normal; si los dos no coinciden, no se confía en lo transcrito.
      let control: Awaited<ReturnType<typeof transcribirAudio>> | null = null;
      if (r.texto?.trim()) {
        control = await transcribirAudio(bytes, String(a.mime_type ?? "audio/ogg"), String(a.nombre_archivo ?? ""), { modelo: modeloDeControl(modelo), proveedor });
        if (control.ok) {
          await registrarConsumo({ concepto: "transcripcion", proveedor: control.proveedor, modelo: control.modelo, tokensEntrada: control.tokensEntrada, tokensSalida: control.tokensSalida, costoUsd: control.costoUsd, conversacionId, procesoId });
        }
      }
      const calidad = calidadTranscripcion(r.texto, control?.ok ? control.texto : null, !r.texto?.trim() || control?.ok === true);
      await db.from("wa_mensajes").update({ transcripcion: transcripcionParaGuardar(r.texto, calidad).slice(0, 8000) }).eq("id", a.id);
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
