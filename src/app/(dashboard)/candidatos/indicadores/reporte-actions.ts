"use server";

/**
 * Reporte diario por correo desde Candidatos › Indicadores (24-nov-2026): a
 * quién se envía, verlo como llega y enviarlo ya. Cambiarlo exige el mismo
 * permiso que Selección › Tiempos y reglas.
 */
import { revalidatePath } from "next/cache";
import { getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { armarReporteDiario } from "@/lib/seleccion/reporte-diario";
import { datosReporteDiario, enviarReporteDiario, leerConfigReporte, type ConfigReporte } from "@/lib/seleccion/reporte-diario-servidor";
import { guardarAjuste } from "../seleccion/actions";

async function exigirConfig() {
  const perms = await getCurrentPermissions();
  if (!puedeEditarEn(perms, "candidatos.seleccion_config")) throw new Error("No tienes permiso para cambiar el reporte diario.");
  return perms;
}

const fallo = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "No se pudo completar." });

export async function configReporteDiario(): Promise<ConfigReporte & { puedeEditar: boolean }> {
  const perms = await getCurrentPermissions();
  return { ...(await leerConfigReporte()), puedeEditar: puedeEditarEn(perms, "candidatos.seleccion_config") };
}

export async function guardarConfigReporte(d: { activo: boolean; para: string; copia: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirConfig();
    const lista = (s: string) =>
      String(s ?? "")
        .split(/[,;\s]+/)
        .map((x) => x.trim())
        .filter(Boolean);
    const cambios: [string, unknown][] = [
      ["reporte_diario_activo", d.activo === true],
      ["reporte_diario_correos", lista(d.para)],
      ["reporte_diario_copia", lista(d.copia)],
    ];
    for (const [clave, valor] of cambios) {
      const r = await guardarAjuste(clave, valor);
      if (!r.ok) return { ok: false, error: r.error };
    }
    revalidatePath("/candidatos/indicadores");
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** El correo tal como llega, para verlo antes de enviarlo. */
export async function vistaReporteDiario(): Promise<{ ok: boolean; html?: string; asunto?: string; error?: string }> {
  try {
    await exigirConfig();
    const c = armarReporteDiario(await datosReporteDiario(), { desarrollo: process.env.GESTIVO_ENTORNO === "desarrollo" });
    return { ok: true, html: c.html, asunto: c.asunto };
  } catch (e) {
    return fallo(e);
  }
}

export async function enviarReporteAhora(): Promise<{ ok: boolean; error?: string; para?: string[]; copia?: string[] }> {
  try {
    await exigirConfig();
    return await enviarReporteDiario({ manual: true });
  } catch (e) {
    return fallo(e);
  }
}
