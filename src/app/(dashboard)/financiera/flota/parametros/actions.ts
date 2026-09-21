"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import { guardarParametro, leerParametros } from "@/lib/financiera/consulta";
import { reabrirPeriodo } from "@/lib/financiera/consolidacion";
import { esPeriodoValido, parametroValido, type IndicadorSemaforo } from "@/lib/financiera/motor";

const RUTA = "/financiera/flota/parametros";
const INDICADORES: IndicadorSemaforo[] = ["rentabilidad", "gasto_timbrada", "productividad"];

function volver(params: Record<string, string>): never {
  const q = new URLSearchParams(params).toString();
  redirect(q ? `${RUTA}?${q}` : RUTA);
}

/** Los parámetros y la reapertura son del administrador (SUBS_SOLO_ADMIN). */
async function exigirPermiso() {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "financiera", "fin_parametros")) {
    throw new Error("Solo el administrador puede cambiar los parámetros de Financiera.");
  }
  return perms;
}

/**
 * Cambia los umbrales de un indicador. Afecta a todos los semáforos del
 * módulo, así que queda en la bitácora con el valor anterior.
 */
export async function actualizarUmbrales(formData: FormData): Promise<void> {
  let error: string | null = null;
  try {
    const perms = await exigirPermiso();
    const indicador = String(formData.get("indicador") ?? "") as IndicadorSemaforo;
    if (!INDICADORES.includes(indicador)) throw new Error("Indicador no válido.");

    const excelente = Number(String(formData.get("excelente") ?? "").replace(",", "."));
    const aceptable = Number(String(formData.get("aceptable") ?? "").replace(",", "."));
    if (!Number.isFinite(excelente) || !Number.isFinite(aceptable)) {
      throw new Error("Los umbrales deben ser números.");
    }

    const actuales = await leerParametros();
    const anterior = actuales[indicador];
    const nuevo = { ...anterior, umbralExcelente: excelente, umbralAceptable: aceptable };
    if (!parametroValido(nuevo)) {
      throw new Error(
        anterior.mayorEsMejor
          ? "En este indicador, mayor es mejor: el umbral de excelente no puede ser menor que el de aceptable."
          : "En este indicador, menor es mejor: el umbral de excelente no puede ser mayor que el de aceptable."
      );
    }
    if (anterior.umbralExcelente === excelente && anterior.umbralAceptable === aceptable) {
      volver({ ok: "sin_cambios" });
    }
    await guardarParametro(nuevo, perms.userEmail ?? null, anterior);
    revalidatePath(RUTA);
    revalidatePath("/financiera/flota");
    revalidatePath("/financiera/flota/timbrada");
    revalidatePath("/financiera/flota/productividad");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  volver(error ? { error } : { ok: "umbrales" });
}

/**
 * Reabre un período cerrado: exige motivo y guarda una copia de las cifras
 * antes de tocarlas. El período se recalcula en la siguiente corrida y GEMA
 * lo vuelve a cerrar.
 */
export async function reabrir(formData: FormData): Promise<void> {
  let error: string | null = null;
  try {
    const perms = await exigirPermiso();
    const periodo = String(formData.get("periodo") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (!esPeriodoValido(periodo)) throw new Error("Período no válido.");
    if (motivo.length < 10) throw new Error("Explica en el motivo por qué se reabre: al menos 10 caracteres.");
    await reabrirPeriodo(periodo, perms.userEmail ?? "", motivo);
    revalidatePath(RUTA);
    revalidatePath("/financiera/flota/datos");
    revalidatePath("/financiera/flota/auditoria");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  volver(error ? { error } : { ok: "reabierto" });
}
