/**
 * Lecturas de la gestión de la pantalla informativa (solo servidor). Las
 * páginas verifican el módulo antes de llamarlas.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { firmarMedios } from "./dispositivos";
import { duracionTotal, validarPresentacion, presentacionVacia, type Presentacion, type TipoMedio } from "./modelo";

export interface PresentacionResumen {
  id: string;
  nombre: string;
  version: number;
  publicadaAt: string | null;
  updatedAt: string;
  publicada: boolean;
  /** Hay cambios en el borrador que los TV todavía no ven. */
  cambiosSinPublicar: boolean;
  diapositivas: number;
  duracionSeg: number;
  dispositivos: number;
}

export interface PresentacionFila {
  id: string;
  nombre: string;
  borrador: Presentacion;
  version: number;
  publicadaAt: string | null;
  updatedAt: string;
  cambiosSinPublicar: boolean;
}

export type EstadoDispositivo = "esperando_tv" | "activa" | "revocada";

export interface DispositivoFila {
  id: string;
  nombre: string;
  keyPrefix: string | null;
  presentacionId: string | null;
  estado: EstadoDispositivo;
  vinculadoAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface MedioBiblioteca {
  id: string;
  tipo: TipoMedio;
  nombre: string;
  path: string;
  posterPath: string | null;
  mime: string;
  bytes: number;
  ancho: number | null;
  alto: number | null;
  duracionSeg: number | null;
  createdAt: string;
  url: string | null;
  posterUrl: string | null;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function getPresentaciones(): Promise<PresentacionResumen[]> {
  const admin = createAdminClient();
  const [{ data, error }, { data: disp }] = await Promise.all([
    admin
      .from("pantalla_presentaciones")
      .select("id, nombre, borrador, publicada, version, publicada_at, updated_at")
      .order("updated_at", { ascending: false }),
    admin.from("pantalla_dispositivos").select("presentacion_id").eq("is_active", true),
  ]);
  if (error) throw new Error(error.message);
  const porPresentacion = new Map<string, number>();
  for (const d of disp ?? []) {
    if (d.presentacion_id) porPresentacion.set(d.presentacion_id, (porPresentacion.get(d.presentacion_id) ?? 0) + 1);
  }
  return (data ?? []).map((p) => {
    const borrador = validarPresentacion(p.borrador) ?? presentacionVacia();
    return {
      id: p.id,
      nombre: p.nombre,
      version: p.version ?? 0,
      publicadaAt: p.publicada_at,
      updatedAt: p.updated_at,
      publicada: Boolean(p.publicada),
      cambiosSinPublicar: !igual(p.borrador, p.publicada),
      diapositivas: borrador.diapositivas.length,
      duracionSeg: Math.round(duracionTotal(borrador)),
      dispositivos: porPresentacion.get(p.id) ?? 0,
    };
  });
}

export async function getPresentacion(id: string): Promise<PresentacionFila | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await createAdminClient()
    .from("pantalla_presentaciones")
    .select("id, nombre, borrador, publicada, version, publicada_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    nombre: data.nombre,
    borrador: validarPresentacion(data.borrador) ?? presentacionVacia(),
    version: data.version ?? 0,
    publicadaAt: data.publicada_at,
    updatedAt: data.updated_at,
    cambiosSinPublicar: !igual(data.borrador, data.publicada),
  };
}

/** La publicada, para la vista previa «como la ven los TV». */
export async function getPresentacionPublicada(id: string): Promise<Presentacion | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createAdminClient().from("pantalla_presentaciones").select("publicada").eq("id", id).maybeSingle();
  return data?.publicada ? validarPresentacion(data.publicada) : null;
}

export async function getDispositivos(): Promise<DispositivoFila[]> {
  const { data, error } = await createAdminClient()
    .from("pantalla_dispositivos")
    .select("id, nombre, key_prefix, presentacion_id, is_active, vinculado_at, last_seen_at, created_at, revoked_at")
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    id: d.id,
    nombre: d.nombre,
    keyPrefix: d.key_prefix,
    presentacionId: d.presentacion_id,
    estado: !d.is_active ? "revocada" : d.key_prefix ? "activa" : "esperando_tv",
    vinculadoAt: d.vinculado_at,
    lastSeenAt: d.last_seen_at,
    createdAt: d.created_at,
    revokedAt: d.revoked_at,
  }));
}

export async function getMediosBiblioteca(): Promise<MedioBiblioteca[]> {
  const { data, error } = await createAdminClient()
    .from("pantalla_medios")
    .select("id, tipo, nombre, path, poster_path, mime, bytes, ancho, alto, duracion_seg, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return conUrls(data ?? []);
}

type FilaMedio = {
  id: string;
  tipo: string;
  nombre: string;
  path: string;
  poster_path: string | null;
  mime: string;
  bytes: number | string;
  ancho: number | null;
  alto: number | null;
  duracion_seg: number | string | null;
  created_at: string;
};

export async function conUrls(filas: FilaMedio[]): Promise<MedioBiblioteca[]> {
  const refs = filas.flatMap((m) => [
    { ref: { bucket: "pantalla" as const, path: m.path }, tipo: (m.tipo === "video" ? "video" : "imagen") as TipoMedio },
    ...(m.poster_path ? [{ ref: { bucket: "pantalla" as const, path: m.poster_path }, tipo: "imagen" as TipoMedio }] : []),
  ]);
  const urls = refs.length ? await firmarMedios(refs) : {};
  return filas.map((m) => ({
    id: m.id,
    tipo: m.tipo === "video" ? "video" : "imagen",
    nombre: m.nombre,
    path: m.path,
    posterPath: m.poster_path,
    mime: m.mime,
    bytes: Number(m.bytes),
    ancho: m.ancho,
    alto: m.alto,
    duracionSeg: m.duracion_seg == null ? null : Number(m.duracion_seg),
    createdAt: m.created_at,
    url: urls[`pantalla/${m.path}`] ?? null,
    posterUrl: m.poster_path ? (urls[`pantalla/${m.poster_path}`] ?? null) : null,
  }));
}
