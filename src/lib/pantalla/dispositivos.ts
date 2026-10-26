/**
 * Televisores de la pantalla informativa (E/S, solo servidor).
 *
 * Vinculación estilo Google TV, sin teclear nada en el TV:
 *   1. El TV pide un código (`iniciarVinculacion`) y lo muestra en grande.
 *   2. Alguien con el módulo `pantalla` lo teclea en Gestivo (`vincularTv`
 *      en actions.ts): se crea el dispositivo SIN clave.
 *   3. En su siguiente sondeo (`estadoVinculacion`) el TV recibe una clave
 *      larga generada en ese instante; en la base solo queda su SHA-256.
 *   4. El TV la guarda en su navegador y la manda en `x-display-key`.
 *
 * Revocar un dispositivo deja su clave sin efecto: el TV recibe 401, la borra
 * y vuelve solo a la pantalla del código para que lo vinculen de nuevo.
 *
 * No se reutiliza `api_keys` (Data API / MCP): esas claves dan acceso a datos
 * por rol; estas solo identifican un televisor y su presentación.
 */

import { randomBytes, randomInt } from "crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey } from "@/lib/external/api-keys";
import { CODIGO_VIDA_MS, Limitador, generarCodigo, segundosRestantes } from "./vinculacion-reglas";
import type { RefMedio, TipoMedio } from "./modelo";

export const DISPLAY_KEY_PREFIX = "dsp_";
export const HEADER_CLAVE = "x-display-key";
const PREFIJO_VISIBLE = DISPLAY_KEY_PREFIX.length + 6;

export function generarClaveDisplay(): { key: string; prefix: string; hash: string } {
  const key = `${DISPLAY_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, PREFIJO_VISIBLE), hash: hashApiKey(key) };
}

export function esFormatoClave(s: unknown): s is string {
  return typeof s === "string" && /^dsp_[A-Za-z0-9_-]{32}$/.test(s);
}

export function generarTokenTv(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashApiKey(token) };
}

export const limiteIniciar = new Limitador(10, 60_000);
export const limiteEstado = new Limitador(30, 60_000);

/** Misma lectura de IP que la Data API (src/lib/external/auth.ts). */
export function ipDe(request: NextRequest | Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

// ── Vinculación ─────────────────────────────────────────────────────────────

export async function iniciarVinculacion(
  ip: string | null
): Promise<{ codigo: string; tokenTv: string; expiraEnSeg: number }> {
  const admin = createAdminClient();
  // Limpieza sin cron: lo vencido (pendiente o nunca recogido) sobra.
  await admin.from("pantalla_vinculaciones").delete().lt("expira_at", new Date().toISOString());

  const { token, hash } = generarTokenTv();
  const expira = new Date(Date.now() + CODIGO_VIDA_MS);
  for (let intento = 0; intento < 5; intento++) {
    const codigo = generarCodigo(() => randomInt(1_000_000));
    const { error } = await admin.from("pantalla_vinculaciones").insert({
      codigo,
      token_tv_hash: hash,
      expira_at: expira.toISOString(),
      ip: ip?.slice(0, 64) ?? null,
    });
    if (!error) return { codigo, tokenTv: token, expiraEnSeg: Math.floor(CODIGO_VIDA_MS / 1000) };
    // 23505 = otro TV tiene ese código vigente: se prueba otro.
    if (error.code !== "23505") throw new Error(error.message);
  }
  throw new Error("No se pudo generar un código.");
}

export type EstadoVinculacion =
  | { estado: "pendiente"; expiraEnSeg: number }
  | { estado: "completada"; clave: string; dispositivo: { nombre: string } }
  | { estado: "desconocida" };

export async function estadoVinculacion(tokenTv: string): Promise<EstadoVinculacion> {
  const admin = createAdminClient();
  const { data: v } = await admin
    .from("pantalla_vinculaciones")
    .select("id, estado, expira_at, dispositivo_id")
    .eq("token_tv_hash", hashApiKey(tokenTv))
    .maybeSingle();
  const ahora = new Date();
  if (!v || new Date(v.expira_at as string) <= ahora) return { estado: "desconocida" };
  if (v.estado === "pendiente") {
    return { estado: "pendiente", expiraEnSeg: segundosRestantes({ expira_at: v.expira_at as string }, ahora) };
  }
  if (!v.dispositivo_id) return { estado: "desconocida" };

  // Entrega única: la clave se genera ahora y solo se asigna si el dispositivo
  // todavía no tiene una. Dos sondeos simultáneos: uno gana, el otro no recibe nada.
  const { key, prefix, hash } = generarClaveDisplay();
  const { data: disp } = await admin
    .from("pantalla_dispositivos")
    .update({ key_hash: hash, key_prefix: prefix, vinculado_at: ahora.toISOString() })
    .eq("id", v.dispositivo_id)
    .is("key_hash", null)
    .eq("is_active", true)
    .select("nombre")
    .maybeSingle();
  if (!disp) return { estado: "desconocida" };
  await admin.from("pantalla_vinculaciones").delete().eq("id", v.id);
  return { estado: "completada", clave: key, dispositivo: { nombre: disp.nombre as string } };
}

// ── Identificación del TV ───────────────────────────────────────────────────

export interface Dispositivo {
  id: string;
  nombre: string;
  presentacionId: string | null;
}

/** El TV que hace la petición, o null si la clave falta, no existe o está revocada. */
export async function identificarDispositivo(request: NextRequest | Request): Promise<Dispositivo | null> {
  const clave = request.headers.get(HEADER_CLAVE)?.trim();
  if (!esFormatoClave(clave)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("pantalla_dispositivos")
    .select("id, nombre, presentacion_id, last_seen_at")
    .eq("key_hash", hashApiKey(clave))
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  // «Último visto» con un minuto de holgura: no hace falta escribir en cada sondeo.
  const visto = data.last_seen_at ? new Date(data.last_seen_at as string).getTime() : 0;
  if (Date.now() - visto > 60_000) {
    await admin.from("pantalla_dispositivos").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  }
  return { id: data.id as string, nombre: data.nombre as string, presentacionId: (data.presentacion_id as string | null) ?? null };
}

// ── URLs firmadas estables ──────────────────────────────────────────────────

/**
 * Firma con caché en memoria: `createSignedUrls` da un token distinto en cada
 * llamada, y si la URL cambiara en cada sondeo el TV volvería a descargar todas
 * las imágenes y videos. Así la URL se mantiene mientras sea válida.
 */
const FIRMA = {
  imagen: { segundos: 2 * 3600, renovarMs: 100 * 60_000 },
  video: { segundos: 12 * 3600, renovarMs: 10 * 3600_000 },
} as const;

type Firma = { url: string; renovar: number };
const g = globalThis as unknown as { __pantallaFirmas?: Map<string, Firma> };
const firmas = (g.__pantallaFirmas ??= new Map());

export async function firmarMedios(refs: readonly { ref: RefMedio; tipo: TipoMedio }[]): Promise<Record<string, string>> {
  const ahora = Date.now();
  const salida: Record<string, string> = {};
  const faltan = new Map<string, { ref: RefMedio; tipo: TipoMedio }[]>();
  for (const r of refs) {
    const k = `${r.ref.bucket}/${r.ref.path}`;
    const f = firmas.get(k);
    if (f && f.renovar > ahora) {
      salida[k] = f.url;
      continue;
    }
    const grupo = `${r.ref.bucket}|${r.tipo}`;
    faltan.set(grupo, [...(faltan.get(grupo) ?? []), r]);
  }
  if (faltan.size === 0) return salida;
  if (firmas.size > 2000) {
    for (const [k, f] of firmas) if (f.renovar <= ahora) firmas.delete(k);
  }
  const admin = createAdminClient();
  await Promise.all(
    [...faltan.entries()].map(async ([grupo, lista]) => {
      const [bucket, tipo] = grupo.split("|") as [RefMedio["bucket"], TipoMedio];
      const { data } = await admin.storage.from(bucket).createSignedUrls(
        lista.map((r) => r.ref.path),
        FIRMA[tipo].segundos
      );
      for (const d of data ?? []) {
        if (!d.signedUrl || !d.path) continue;
        const k = `${bucket}/${d.path}`;
        firmas.set(k, { url: d.signedUrl, renovar: ahora + FIRMA[tipo].renovarMs });
        salida[k] = d.signedUrl;
      }
    })
  );
  return salida;
}
