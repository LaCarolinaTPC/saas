"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { esEmpresa, esModulo, etiquetaPar, expandirAlcance, parValido, type Empresa, type Modulo, type Par } from "./catalogo";
import {
  abrirCorrida,
  cerrarCorrida,
  sincronizarPares,
  type FilaMgxCorridas,
  type FilaMgxTablas,
  type ResultadoPar,
} from "./sync";

/**
 * La sincronización de MGX desde Tesorería › Parámetros. Solo administradores:
 * escribe datos contables y de nómina de las siete empresas.
 *
 * La pantalla trabaja por PASOS: cada llamada a `sincronizarMgxPaso` corre
 * hasta `PRESUPUESTO_MS` y devuelve lo que falta; el cliente vuelve a llamar
 * hasta terminar. El progreso de cada tabla queda en `mgx_tablas` después de
 * cada lote, así que un paso cortado no pierde nada.
 */

const PRESUPUESTO_MS = Number(process.env.MGX_SYNC_BUDGET_MS ?? 200_000);
const RUTA = "/tesoreria/devengados/parametros";

export interface AlcanceMgx {
  empresa?: Empresa | null;
  modulo?: Modulo | null;
  tabla?: string | null;
}

export interface PasoMgx {
  ok: boolean;
  corridaId?: number;
  hechos: ResultadoPar[];
  pendientes: Par[];
  error?: string;
}

async function exigirAdmin() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) throw new Error("Solo un administrador puede sincronizar con MGX.");
  return perms;
}

/** Los pares de un alcance, sin los desactivados en el catálogo. */
export async function planificarMgx(alcance: AlcanceMgx): Promise<{ ok: boolean; pares: Par[]; error?: string }> {
  try {
    await exigirAdmin();
    const pares = expandirAlcance({
      empresa: alcance.empresa && esEmpresa(alcance.empresa) ? alcance.empresa : undefined,
      modulo: alcance.modulo && esModulo(alcance.modulo) ? alcance.modulo : undefined,
      tabla: alcance.tabla ?? undefined,
    });
    const db = createAdminClient();
    const { data, error } = await db.from("mgx_tablas").select("empresa, modulo, tabla").eq("activa", false);
    if (error) throw new Error(error.message);
    const inactivas = new Set((data ?? []).map((r) => `${r.empresa}.${r.modulo}.${r.tabla}`));
    return { ok: true, pares: pares.filter((p) => !inactivas.has(`${p.empresa}.${p.modulo}.${p.tabla}`)) };
  } catch (e) {
    return { ok: false, pares: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Un paso. La primera llamada (sin `corridaId`) abre la corrida; la que deja
 * `pendientes` vacío la cierra y la audita. `alcance` solo se usa para la
 * bitácora.
 */
export async function sincronizarMgxPaso(
  pares: Par[],
  corridaId: number | null,
  alcance: AlcanceMgx
): Promise<PasoMgx> {
  let perms;
  try {
    perms = await exigirAdmin();
  } catch (e) {
    return { ok: false, hechos: [], pendientes: pares, error: e instanceof Error ? e.message : String(e) };
  }
  // No se confía en lo que manda el cliente: cada par tiene que existir en MGX.
  const validos = (Array.isArray(pares) ? pares : []).filter((p) => parValido(p));
  if (validos.length !== (pares?.length ?? 0)) {
    return { ok: false, hechos: [], pendientes: [], error: "La lista de tablas trae algo que no existe en MGX." };
  }

  const db = createAdminClient();
  let id = corridaId;
  try {
    if (!id) id = await abrirCorrida(db, { origen: "manual", usuarioEmail: perms.userEmail, alcance });
    const { hechos, pendientes } = await sincronizarPares(db, validos, { deadline: Date.now() + PRESUPUESTO_MS }, id);
    if (!pendientes.length) {
      const errores = hechos.filter((h) => h.error);
      await cerrarCorrida(db, id, errores.length ? "error" : "ok", errores.map((h) => `${etiquetaPar(h.par)}: ${h.error}`).join("\n") || null);
      await auditar(db, id, perms.userType, errores.length ? "fallido" : "exitoso");
    }
    revalidatePath(RUTA);
    return { ok: true, corridaId: id, hechos, pendientes };
  } catch (e) {
    // Error de conexión con MGX o de la propia bitácora: se corta la corrida.
    const msg = e instanceof Error ? e.message : String(e);
    if (id) {
      await cerrarCorrida(db, id, "error", msg);
      await auditar(db, id, perms.userType, "fallido", msg);
    }
    revalidatePath(RUTA);
    return { ok: false, corridaId: id ?? undefined, hechos: [], pendientes: validos, error: msg };
  }
}

/** «Detener»: deja la corrida como parcial. Lo hecho queda; lo que falta se retoma después. */
export async function detenerMgx(corridaId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const perms = await exigirAdmin();
    const db = createAdminClient();
    await cerrarCorrida(db, corridaId, "parcial", "Detenida por el usuario");
    await auditar(db, corridaId, perms.userType, "exitoso", "detenida por el usuario");
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function auditar(
  db: ReturnType<typeof createAdminClient>,
  corridaId: number,
  rol: string | null,
  resultado: "exitoso" | "fallido",
  nota?: string
) {
  const { data } = await db.from("mgx_corridas").select("*").eq("id", corridaId).maybeSingle();
  const { data: tablas } = await db
    .from("mgx_tablas")
    .select("empresa, modulo, tabla, estado, filas, error")
    .eq("corrida_id", corridaId);
  await logTesoreriaAudit({
    accion: "sincronizacion_mgx",
    modulo: "sincronizacion",
    resultado,
    rol: rol ?? undefined,
    detalle: {
      corrida: corridaId,
      alcance: data?.alcance ?? null,
      filas: data?.filas ?? 0,
      nota: nota ?? null,
      errores: (tablas ?? []).filter((t) => t.error).map((t) => ({ tabla: `${t.empresa}${t.modulo}.${t.tabla}`, error: t.error })),
    },
  });
}

/** Estado de los 109 pares para la pantalla. */
export async function getEstadoMgx(): Promise<FilaMgxTablas[]> {
  // Como las demás acciones de este archivo: solo el administrador.
  if (!(await getCurrentPermissions()).isAdmin) return [];
  const db = createAdminClient();
  const { data, error } = await db.from("mgx_tablas").select("*").order("empresa").order("modulo").order("tabla");
  if (error) return [];
  return (data ?? []) as FilaMgxTablas[];
}

export async function getUltimasCorridasMgx(n = 5): Promise<FilaMgxCorridas[]> {
  // Como las demás acciones de este archivo: solo el administrador.
  if (!(await getCurrentPermissions()).isAdmin) return [];
  const db = createAdminClient();
  const { data, error } = await db.from("mgx_corridas").select("*").order("iniciada_at", { ascending: false }).limit(n);
  if (error) return [];
  return (data ?? []) as FilaMgxCorridas[];
}
