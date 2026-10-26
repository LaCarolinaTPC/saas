"use server";

/**
 * Server Actions de la pantalla informativa. Todas exigen el módulo `pantalla`
 * y devuelven `{ ok: false, error }` en vez de lanzar: en producción Next
 * esconde el mensaje de un error lanzado y la persona solo vería «algo falló».
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAccesoPantalla } from "./acceso";
import { firmarMedios } from "./dispositivos";
import { conUrls, type MedioBiblioteca } from "./consultas";
import {
  MAX_BYTES,
  RUTA_FOTO_ACCIDENTE,
  presentacionVacia,
  tamanoJson,
  usaMedio,
  validarPresentacion,
  validarRefImagen,
  type Presentacion,
  type RefMedio,
  type TipoMedio,
} from "./modelo";
import { esRutaMedio, nombreVisible, rutasParaMedio, tipoDeMime, validarDeclaracion } from "./medios-reglas";
import { normalizarCodigo } from "./vinculacion-reglas";

type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;

async function conAcceso<R extends { ok: boolean }>(
  fn: (p: { userId: string | null; email: string | null }) => Promise<R>
): Promise<R | { ok: false; error: string }> {
  try {
    const perms = await assertAccesoPantalla();
    return await fn({ userId: perms.userId, email: perms.userEmail });
  } catch (e) {
    console.error("[pantalla] acción:", e);
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo completar la acción." };
  }
}

function nombreValido(nombre: unknown): string | null {
  const n = typeof nombre === "string" ? nombre.replace(/\s+/g, " ").trim() : "";
  return n.length >= 1 && n.length <= 80 ? n : null;
}

function revalidar(id?: string) {
  revalidatePath("/pantalla");
  if (id) revalidatePath(`/pantalla/${id}`);
}

// ── Presentaciones ──────────────────────────────────────────────────────────

export async function crearPresentacion(nombre: string): Promise<Resultado<{ id: string }>> {
  return conAcceso(async ({ userId, email }) => {
    const n = nombreValido(nombre);
    if (!n) return { ok: false, error: "El nombre debe tener entre 1 y 80 caracteres." };
    const { data, error } = await createAdminClient()
      .from("pantalla_presentaciones")
      .insert({ nombre: n, borrador: presentacionVacia(), created_by: userId, created_by_email: email })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidar();
    return { ok: true, id: data.id as string };
  });
}

export async function renombrarPresentacion(id: string, nombre: string): Promise<Resultado> {
  return conAcceso(async () => {
    const n = nombreValido(nombre);
    if (!UUID.test(id) || !n) return { ok: false, error: "El nombre debe tener entre 1 y 80 caracteres." };
    const { error } = await createAdminClient().from("pantalla_presentaciones").update({ nombre: n }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidar(id);
    return { ok: true };
  });
}

export async function duplicarPresentacion(id: string): Promise<Resultado<{ id: string }>> {
  return conAcceso(async ({ userId, email }) => {
    if (!UUID.test(id)) return { ok: false, error: "Presentación no válida." };
    const admin = createAdminClient();
    const { data: p } = await admin.from("pantalla_presentaciones").select("nombre, borrador").eq("id", id).maybeSingle();
    if (!p) return { ok: false, error: "La presentación ya no existe." };
    const { data, error } = await admin
      .from("pantalla_presentaciones")
      .insert({
        nombre: `${p.nombre} (copia)`.slice(0, 80),
        borrador: validarPresentacion(p.borrador) ?? presentacionVacia(),
        created_by: userId,
        created_by_email: email,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidar();
    return { ok: true, id: data.id as string };
  });
}

export async function eliminarPresentacion(id: string): Promise<Resultado> {
  return conAcceso(async () => {
    if (!UUID.test(id)) return { ok: false, error: "Presentación no válida." };
    const admin = createAdminClient();
    const { data: tvs } = await admin
      .from("pantalla_dispositivos")
      .select("nombre")
      .eq("presentacion_id", id)
      .eq("is_active", true);
    if (tvs && tvs.length > 0) {
      return {
        ok: false,
        error: `La están mostrando: ${tvs.map((t) => t.nombre).join(", ")}. Asígneles otra presentación antes de eliminarla.`,
      };
    }
    const { error } = await admin.from("pantalla_presentaciones").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidar();
    return { ok: true };
  });
}

/**
 * Guarda el borrador. `updatedAtVisto` es el `updated_at` que el editor leyó:
 * si otra persona (u otra pestaña) guardó después, no se pisa su trabajo.
 */
export async function guardarBorrador(
  id: string,
  presentacion: unknown,
  updatedAtVisto: string
): Promise<Resultado<{ updatedAt: string }> | { ok: false; error: string; conflicto: true }> {
  return conAcceso(async () => {
    if (!UUID.test(id)) return { ok: false, error: "Presentación no válida." };
    const p = validarPresentacion(presentacion);
    if (!p) return { ok: false, error: "La presentación no tiene un formato válido." };
    if (tamanoJson(p) > MAX_BYTES) return { ok: false, error: "La presentación es demasiado grande. Quite elementos o diapositivas." };
    const admin = createAdminClient();
    const updatedAt = new Date().toISOString();
    const { data, error } = await admin
      .from("pantalla_presentaciones")
      .update({ borrador: p, updated_at: updatedAt })
      .eq("id", id)
      .eq("updated_at", updatedAtVisto)
      .select("updated_at")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) {
      const { data: existe } = await admin.from("pantalla_presentaciones").select("id").eq("id", id).maybeSingle();
      if (!existe) return { ok: false, error: "La presentación ya no existe." };
      return {
        ok: false,
        conflicto: true,
        error: "Alguien más guardó cambios en esta presentación. Recargue la página para ver la última versión.",
      };
    }
    revalidatePath("/pantalla");
    return { ok: true, updatedAt: data.updated_at as string };
  });
}

/** Copia el borrador a la versión publicada: los TV la toman en su siguiente consulta. */
export async function publicar(id: string): Promise<Resultado<{ version: number }>> {
  return conAcceso(async () => {
    if (!UUID.test(id)) return { ok: false, error: "Presentación no válida." };
    const admin = createAdminClient();
    const { data } = await admin.from("pantalla_presentaciones").select("borrador, version").eq("id", id).maybeSingle();
    if (!data) return { ok: false, error: "La presentación ya no existe." };
    const p = validarPresentacion(data.borrador);
    if (!p || p.diapositivas.length === 0) return { ok: false, error: "Agregue al menos una diapositiva antes de publicar." };
    const version = (data.version ?? 0) + 1;
    const { error } = await admin
      .from("pantalla_presentaciones")
      .update({ publicada: p, publicada_at: new Date().toISOString(), version })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidar(id);
    return { ok: true, version };
  });
}

/** Los TV que la muestran pasan a «sin presentación publicada». */
export async function retirarPublicacion(id: string): Promise<Resultado> {
  return conAcceso(async () => {
    if (!UUID.test(id)) return { ok: false, error: "Presentación no válida." };
    const admin = createAdminClient();
    const { data } = await admin.from("pantalla_presentaciones").select("version").eq("id", id).maybeSingle();
    const { error } = await admin
      .from("pantalla_presentaciones")
      .update({ publicada: null, publicada_at: null, version: (data?.version ?? 0) + 1 })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidar(id);
    return { ok: true };
  });
}

// ── Televisores ─────────────────────────────────────────────────────────────

/** Vincula el TV que muestra `codigo`. El TV recoge su clave solo, en su siguiente sondeo. */
export async function vincularTv(codigo: string, nombre: string, presentacionId: string | null): Promise<Resultado<{ id: string }>> {
  return conAcceso(async ({ userId, email }) => {
    const c = normalizarCodigo(codigo);
    if (!c) return { ok: false, error: "El código son 6 dígitos." };
    const n = nombreValido(nombre);
    if (!n) return { ok: false, error: "Póngale un nombre al TV (por ejemplo «Recepción»)." };
    if (presentacionId && !UUID.test(presentacionId)) return { ok: false, error: "Presentación no válida." };
    const admin = createAdminClient();
    const { data: v } = await admin
      .from("pantalla_vinculaciones")
      .select("id")
      .eq("codigo", c)
      .eq("estado", "pendiente")
      .gt("expira_at", new Date().toISOString())
      .maybeSingle();
    if (!v) return { ok: false, error: "Código no válido o vencido. Mire el código que muestra el TV ahora." };

    const { data: disp, error } = await admin
      .from("pantalla_dispositivos")
      .insert({ nombre: n, presentacion_id: presentacionId, created_by: userId, created_by_email: email })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };

    const { data: marcada } = await admin
      .from("pantalla_vinculaciones")
      .update({ estado: "completada", dispositivo_id: disp.id })
      .eq("id", v.id)
      .eq("estado", "pendiente")
      .select("id")
      .maybeSingle();
    if (!marcada) {
      // Otra persona tecleó el mismo código un instante antes.
      await admin.from("pantalla_dispositivos").delete().eq("id", disp.id);
      return { ok: false, error: "Ese código ya se usó." };
    }
    revalidar();
    return { ok: true, id: disp.id as string };
  });
}

export async function asignarPresentacion(dispositivoId: string, presentacionId: string | null): Promise<Resultado> {
  return conAcceso(async () => {
    if (!UUID.test(dispositivoId) || (presentacionId && !UUID.test(presentacionId))) {
      return { ok: false, error: "Datos no válidos." };
    }
    const { error } = await createAdminClient()
      .from("pantalla_dispositivos")
      .update({ presentacion_id: presentacionId })
      .eq("id", dispositivoId)
      .eq("is_active", true);
    if (error) return { ok: false, error: error.message };
    revalidar();
    return { ok: true };
  });
}

export async function renombrarDispositivo(id: string, nombre: string): Promise<Resultado> {
  return conAcceso(async () => {
    const n = nombreValido(nombre);
    if (!UUID.test(id) || !n) return { ok: false, error: "El nombre debe tener entre 1 y 80 caracteres." };
    const { error } = await createAdminClient().from("pantalla_dispositivos").update({ nombre: n }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidar();
    return { ok: true };
  });
}

/**
 * Deja la clave del TV sin efecto. El TV lo nota en su siguiente consulta (un
 * minuto como mucho), borra la clave y vuelve a mostrar un código para que lo
 * vinculen de nuevo si la revocación fue un error.
 */
export async function revocarDispositivo(id: string): Promise<Resultado> {
  return conAcceso(async () => {
    if (!UUID.test(id)) return { ok: false, error: "TV no válido." };
    const { error } = await createAdminClient()
      .from("pantalla_dispositivos")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidar();
    return { ok: true };
  });
}

/** Solo los que no autentican: revocados o que nunca recogieron su clave. */
export async function eliminarDispositivo(id: string): Promise<Resultado> {
  return conAcceso(async () => {
    if (!UUID.test(id)) return { ok: false, error: "TV no válido." };
    const admin = createAdminClient();
    const { data } = await admin.from("pantalla_dispositivos").select("is_active, key_hash").eq("id", id).maybeSingle();
    if (!data) return { ok: true };
    if (data.is_active && data.key_hash) return { ok: false, error: "Revóquelo primero." };
    const { error } = await admin.from("pantalla_dispositivos").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidar();
    return { ok: true };
  });
}

// ── Medios ──────────────────────────────────────────────────────────────────

/**
 * Prepara la subida directa del navegador a Storage. El nombre del archivo lo
 * decide el servidor; la URL firmada solo sirve para esa ruta (2 horas).
 */
export async function prepararSubida(decl: {
  nombre: string;
  mime: string;
  bytes: number;
}): Promise<Resultado<{ path: string; token: string; poster: { path: string; token: string } | null }>> {
  return conAcceso(async () => {
    const error = validarDeclaracion(decl);
    if (error) return { ok: false, error };
    const { path, posterPath } = rutasParaMedio(randomUUID(), decl.mime);
    const bucket = createAdminClient().storage.from("pantalla");
    const firma = await bucket.createSignedUploadUrl(path);
    if (firma.error || !firma.data) return { ok: false, error: firma.error?.message ?? "No se pudo preparar la subida." };
    let poster: { path: string; token: string } | null = null;
    if (posterPath) {
      const fp = await bucket.createSignedUploadUrl(posterPath);
      if (fp.data) poster = { path: posterPath, token: fp.data.token };
    }
    return { ok: true, path, token: firma.data.token, poster };
  });
}

/** Registra en la biblioteca lo que el navegador ya subió. Tamaño y tipo se toman de Storage, no del navegador. */
export async function registrarMedio(m: {
  path: string;
  posterPath: string | null;
  nombre: string;
  ancho: number | null;
  alto: number | null;
  duracionSeg: number | null;
}): Promise<Resultado<{ medio: MedioBiblioteca }>> {
  return conAcceso(async ({ userId, email }) => {
    if (!esRutaMedio(m.path) || /\.poster\./.test(m.path)) return { ok: false, error: "Archivo no válido." };
    const admin = createAdminClient();
    const archivo = m.path.split("/")[1];
    const { data: lista } = await admin.storage.from("pantalla").list("biblioteca", { search: archivo, limit: 5 });
    const obj = lista?.find((o) => o.name === archivo);
    if (!obj) return { ok: false, error: "El archivo no llegó a Storage. Intente subirlo de nuevo." };
    const meta = (obj.metadata ?? {}) as { size?: number; mimetype?: string };
    const mime = String(meta.mimetype ?? "");
    const bytes = Number(meta.size ?? 0);
    const tipo = tipoDeMime(mime);
    const invalido = validarDeclaracion({ nombre: m.nombre || "archivo", mime, bytes });
    if (!tipo || invalido) {
      await admin.storage.from("pantalla").remove([m.path, ...(m.posterPath ? [m.posterPath] : [])]);
      return { ok: false, error: invalido ?? "Tipo de archivo no permitido." };
    }
    let posterPath: string | null = null;
    if (tipo === "video" && m.posterPath && esRutaMedio(m.posterPath) && m.posterPath === m.path.replace(/\.(mp4|webm)$/i, ".poster.jpg")) {
      const pa = m.posterPath.split("/")[1];
      const { data: lp } = await admin.storage.from("pantalla").list("biblioteca", { search: pa, limit: 2 });
      if (lp?.some((o) => o.name === pa)) posterPath = m.posterPath;
    }
    const entero = (v: number | null) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
    const dur = typeof m.duracionSeg === "number" && Number.isFinite(m.duracionSeg) && m.duracionSeg > 0 ? Math.round(m.duracionSeg * 100) / 100 : null;
    const { data, error } = await admin
      .from("pantalla_medios")
      .insert({
        tipo,
        nombre: nombreVisible(m.nombre || archivo),
        path: m.path,
        poster_path: posterPath,
        mime,
        bytes,
        ancho: entero(m.ancho),
        alto: entero(m.alto),
        duracion_seg: tipo === "video" ? dur : null,
        created_by: userId,
        created_by_email: email,
      })
      .select("id, tipo, nombre, path, poster_path, mime, bytes, ancho, alto, duracion_seg, created_at")
      .single();
    if (error) return { ok: false, error: error.message };
    const [medio] = await conUrls([data]);
    revalidatePath("/pantalla");
    return { ok: true, medio };
  });
}

export async function renombrarMedio(id: string, nombre: string): Promise<Resultado> {
  return conAcceso(async () => {
    const n = nombreValido(nombre);
    if (!UUID.test(id) || !n) return { ok: false, error: "El nombre debe tener entre 1 y 80 caracteres." };
    const { error } = await createAdminClient().from("pantalla_medios").update({ nombre: n }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/pantalla");
    return { ok: true };
  });
}

/** Borra archivo, póster y fila. Si alguna presentación lo usa, no borra y dice cuál. */
export async function eliminarMedio(id: string): Promise<Resultado | { ok: false; error: string; usadoEn: string[] }> {
  return conAcceso(async () => {
    if (!UUID.test(id)) return { ok: false, error: "Archivo no válido." };
    const admin = createAdminClient();
    const { data: m } = await admin.from("pantalla_medios").select("path, poster_path").eq("id", id).maybeSingle();
    if (!m) return { ok: true };
    const { data: ps } = await admin.from("pantalla_presentaciones").select("nombre, borrador, publicada");
    const usadoEn = (ps ?? [])
      .filter((p) =>
        [p.borrador, p.publicada].some((j) => {
          const v = j ? validarPresentacion(j) : null;
          return v ? usaMedio(v, "pantalla", m.path) : false;
        })
      )
      .map((p) => p.nombre as string);
    if (usadoEn.length) {
      return { ok: false, usadoEn, error: `Está en uso en: ${usadoEn.join(", ")}. Quítelo de ahí primero.` };
    }
    await admin.storage.from("pantalla").remove([m.path, ...(m.poster_path ? [m.poster_path] : [])]);
    const { error } = await admin.from("pantalla_medios").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/pantalla");
    return { ok: true };
  });
}

export interface FotoAccidente {
  path: string;
  url: string;
  consecutivo: number | null;
  fecha: string | null;
}

/** Fotos de los accidentes más recientes, para elegirlas en una diapositiva. */
export async function listarFotosAccidentes(limite = 40): Promise<Resultado<{ fotos: FotoAccidente[] }>> {
  return conAcceso(async () => {
    const { data, error } = await createAdminClient()
      .from("accidentes")
      .select("consecutivo, fecha_accidente, fotos")
      .eq("origen", "gestivo")
      .not("fotos", "is", null)
      .order("fecha_accidente", { ascending: false })
      .limit(Math.min(100, Math.max(1, limite)));
    if (error) return { ok: false, error: error.message };
    const items: Omit<FotoAccidente, "url">[] = [];
    for (const a of data ?? []) {
      for (const p of (a.fotos as string[] | null) ?? []) {
        if (RUTA_FOTO_ACCIDENTE.test(p)) {
          items.push({ path: p, consecutivo: a.consecutivo ?? null, fecha: a.fecha_accidente ? String(a.fecha_accidente).slice(0, 10) : null });
        }
      }
    }
    const urls = await firmarMedios(items.map((i) => ({ ref: { bucket: "accidentes" as const, path: i.path }, tipo: "imagen" as const })));
    return {
      ok: true,
      fotos: items.filter((i) => urls[`accidentes/${i.path}`]).map((i) => ({ ...i, url: urls[`accidentes/${i.path}`] })),
    };
  });
}

/** URLs firmadas para que el editor pinte lo que acaba de insertar. */
export async function firmarRefs(refs: { ref: RefMedio; tipo: TipoMedio }[]): Promise<Resultado<{ urls: Record<string, string> }>> {
  return conAcceso(async () => {
    const validos = refs.filter(
      (r) =>
        (r.tipo === "imagen" && validarRefImagen(r.ref)) ||
        (r.tipo === "video" && r.ref?.bucket === "pantalla" && esRutaMedio(r.ref.path))
    );
    return { ok: true, urls: await firmarMedios(validos.slice(0, 200)) };
  });
}

/** Para reabrir el editor con la presentación recién guardada (p. ej. tras un conflicto). */
export async function leerBorrador(id: string): Promise<Resultado<{ borrador: Presentacion; updatedAt: string }>> {
  return conAcceso(async () => {
    if (!UUID.test(id)) return { ok: false, error: "Presentación no válida." };
    const { data } = await createAdminClient().from("pantalla_presentaciones").select("borrador, updated_at").eq("id", id).maybeSingle();
    if (!data) return { ok: false, error: "La presentación ya no existe." };
    return { ok: true, borrador: validarPresentacion(data.borrador) ?? presentacionVacia(), updatedAt: data.updated_at as string };
  });
}
