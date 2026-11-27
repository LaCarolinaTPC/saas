"use client";

import type { LecturasFicha } from "@/app/api/candidatos/lectura/lecturas";

/**
 * Lee un dato de la ficha del proceso por la ruta /api/candidatos/lectura en vez
 * de llamar la server action directo (27-nov-2026): las actions de una página
 * van en fila y la ficha tardaba más de 10 s en cargar. Misma firma y mismo
 * resultado que la función del servidor.
 */
export async function leerFicha<K extends keyof LecturasFicha>(fn: K, ...args: Parameters<LecturasFicha[K]>): Promise<Awaited<ReturnType<LecturasFicha[K]>>> {
  const res = await fetch("/api/candidatos/lectura", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fn, args }),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))) as { ok: boolean; r?: unknown; error?: string };
  if (!j.ok) throw new Error(j.error ?? "No se pudo leer.");
  return j.r as Awaited<ReturnType<LecturasFicha[K]>>;
}
