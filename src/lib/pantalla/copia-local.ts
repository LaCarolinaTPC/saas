/**
 * Copia local del televisor (solo navegador): la última respuesta de
 * `/api/display` y los medios que usa, para no consultar la base en cada
 * reinicio y seguir mostrando la presentación sin red.
 *
 * Usa IndexedDB porque guarda blobs y funciona sin HTTPS, a diferencia de la
 * Cache API. Nada de esto debe tumbar la pantalla: si el navegador no lo soporta
 * o falla, cada función devuelve vacío y el TV se comporta como sin copia.
 *
 * Las rutas de los medios llevan un UUID y no se reescriben (`rutasParaMedio`),
 * así que un medio guardado nunca queda desactualizado.
 */

import { cabeEnLocal } from "./copia-local-reglas";
import type { RespuestaDisplay } from "./tipos-display";

const BASE = "gestivo-display";
const INSTANTANEA = "instantanea";
const MEDIOS = "medios";
const CLAVE_ACTUAL = "actual";

export interface CopiaLocal {
  clavePrefijo: string;
  /** Reloj del TV al recibirla (`Date.now()`). */
  recibidoAt: number;
  respuesta: RespuestaDisplay;
}

let abierta: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  abierta ??= new Promise<IDBDatabase>((ok, mal) => {
    const req = indexedDB.open(BASE, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(INSTANTANEA);
      req.result.createObjectStore(MEDIOS);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
    req.onblocked = () => mal(new Error("IndexedDB bloqueada"));
  }).catch((e) => {
    abierta = null;
    throw e;
  });
  return abierta;
}

async function operar<T>(
  almacen: string,
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const db = await abrir();
  return new Promise<T | undefined>((ok, mal) => {
    const tx = db.transaction(almacen, modo);
    const req = fn(tx.objectStore(almacen));
    tx.oncomplete = () => ok(req ? req.result : undefined);
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error);
  });
}

export async function leerCopia(): Promise<CopiaLocal | null> {
  try {
    return (await operar<CopiaLocal>(INSTANTANEA, "readonly", (s) => s.get(CLAVE_ACTUAL))) ?? null;
  } catch {
    return null;
  }
}

export async function guardarCopia(copia: CopiaLocal): Promise<void> {
  try {
    await operar(INSTANTANEA, "readwrite", (s) => s.put(copia, CLAVE_ACTUAL));
  } catch (e) {
    console.warn("[display] no se pudo guardar la copia local:", e);
  }
}

/** Claves `bucket/path` de los medios guardados. */
export async function clavesDeMedios(): Promise<string[]> {
  try {
    const claves = await operar<IDBValidKey[]>(MEDIOS, "readonly", (s) => s.getAllKeys());
    return (claves ?? []).map(String);
  } catch {
    return [];
  }
}

export async function leerMedio(clave: string): Promise<Blob | null> {
  try {
    return (await operar<Blob>(MEDIOS, "readonly", (s) => s.get(clave))) ?? null;
  } catch {
    return null;
  }
}

/** false si no se pudo guardar (por ejemplo, sin espacio): el medio sigue por red. */
export async function guardarMedio(clave: string, blob: Blob): Promise<boolean> {
  try {
    await operar(MEDIOS, "readwrite", (s) => s.put(blob, clave));
    return true;
  } catch (e) {
    console.warn("[display] no se pudo guardar un medio:", e);
    return false;
  }
}

export async function borrarMedios(claves: readonly string[]): Promise<void> {
  if (claves.length === 0) return;
  try {
    await operar(MEDIOS, "readwrite", (s) => {
      for (const c of claves) s.delete(c);
    });
  } catch {
    /* se reintenta en la siguiente actualización */
  }
}

/** Al revocar o cambiar de clave: no debe quedar nada del TV anterior. */
export async function borrarTodo(): Promise<void> {
  try {
    await operar(INSTANTANEA, "readwrite", (s) => s.clear());
    await operar(MEDIOS, "readwrite", (s) => s.clear());
  } catch {
    /* sin IndexedDB no hay nada que borrar */
  }
}

async function espacioLocal(): Promise<{ usado: number; cuota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e?.quota ? { usado: e.usage ?? 0, cuota: e.quota } : null;
  } catch {
    return null;
  }
}

/** Le pide al navegador no borrar la copia cuando necesite espacio. */
export function pedirPersistencia(): void {
  void navigator.storage?.persist?.().catch(() => {});
}

/**
 * Baja un medio si cabe. null si falla o no cabe: el TV lo sigue pidiendo por
 * red con su URL firmada. Mira el tamaño antes de leer el cuerpo.
 */
export async function bajarMedio(url: string): Promise<Blob | null> {
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) return null;
    const tamano = Number(r.headers.get("content-length")) || 0;
    if (!cabeEnLocal(tamano, await espacioLocal())) {
      void r.body?.cancel().catch(() => {});
      return null;
    }
    const blob = await r.blob();
    return tamano || cabeEnLocal(blob.size, await espacioLocal()) ? blob : null;
  } catch {
    return null;
  }
}
