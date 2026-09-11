"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarOperacion } from "@/lib/incapacidades/auditoria";
import { IncidenciaMotor } from "@/lib/incapacidades/motor";
import {
  ConflictoVersion,
  FaltanDatos,
  completarDatos,
  homologar,
  liquidarExpediente,
  sobrescribir,
  type Actor,
} from "@/lib/incapacidades/liquidacion";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function texto(fd: FormData, k: string): string | null {
  const s = String(fd.get(k) ?? "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

function fecha(fd: FormData, k: string, etiqueta: string): string | null {
  const s = texto(fd, k);
  if (s == null) return null;
  if (!FECHA_RE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) throw new Error(`${etiqueta}: fecha no válida.`);
  return s;
}

/** Número desde el formulario: admite "1.300.000", "1300000" y "1300000,50". */
function numero(fd: FormData, k: string, etiqueta: string): number | null {
  const s = texto(fd, k);
  if (s == null) return null;
  const limpio = s.replace(/\$/g, "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(limpio);
  if (!Number.isFinite(n)) throw new Error(`${etiqueta}: no es un número.`);
  return n;
}

function volver(id: string, params: Record<string, string>): never {
  redirect(`/incapacidades/${id}?${new URLSearchParams(params).toString()}#gestion`);
}

async function exigirEdicion(): Promise<Actor> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) throw new Error("No tienes acceso al módulo.");
  if (!perms.puedeEditar) throw new Error("Tu tipo de usuario consulta el módulo pero no edita expedientes.");
  return { email: perms.userEmail, rol: perms.userType };
}

function mensajeDe(e: unknown): string {
  if (e instanceof FaltanDatos) return e.message;
  if (e instanceof ConflictoVersion) return e.message;
  if (e instanceof IncidenciaMotor) return `Incidencia del motor: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

function idYVersion(fd: FormData): { id: string; version: number } {
  const id = String(fd.get("id") ?? "");
  const version = Number(fd.get("version"));
  if (!UUID_RE.test(id)) throw new Error("Expediente no válido.");
  if (!Number.isInteger(version) || version < 1) throw new Error("Versión no válida.");
  return { id, version };
}

function resumenResultado(base: string, r: { ajustes: string[]; recalculado: boolean; avisos: string[] }): Record<string, string> {
  const partes = [base];
  if (r.ajustes.length) partes.push(`ajustes: ${r.ajustes.join(", ")}`);
  if (r.recalculado) partes.push("liquidación recalculada");
  const out: Record<string, string> = { ok: partes.join(" · ") };
  if (r.avisos.length) out.aviso = r.avisos.join(" ");
  return out;
}

export async function accionCompletar(fd: FormData): Promise<void> {
  let id = "";
  let salida: Record<string, string>;
  try {
    const actor = await exigirEdicion();
    const iv = idYVersion(fd);
    id = iv.id;
    const salario = numero(fd, "salario_base", "Salario base");
    const fuente = texto(fd, "salario_fuente");
    const r = await completarDatos(id, iv.version, {
      responsable_email: texto(fd, "responsable_email"),
      salario_base: salario,
      salario_vigencia_desde: fecha(fd, "salario_vigencia_desde", "Vigencia del salario"),
      salario_fuente: fuente === "employees" ? "employees" : fuente === "manual" ? "manual" : null,
      observaciones: texto(fd, "observaciones"),
      proxima_accion: texto(fd, "proxima_accion"),
      proxima_accion_fecha: fecha(fd, "proxima_accion_fecha", "Fecha de la próxima acción"),
      motivo: texto(fd, "motivo"),
    }, actor);
    await auditarOperacion({ accion: "expediente_completado", expedienteId: id, rol: actor.rol, valorNuevo: salario != null ? `salario ${salario}` : "sin salario", detalle: { ajustes: r.ajustes, recalculado: r.recalculado } });
    revalidatePath(`/incapacidades/${id}`);
    revalidatePath("/incapacidades");
    salida = resumenResultado("Datos guardados", r);
  } catch (e) {
    salida = { error: mensajeDe(e) };
  }
  if (!id) redirect("/incapacidades");
  volver(id, salida);
}

/** Acepta la sugerencia de salario de empleados: mismo camino que completar, con fuente `employees`. */
export async function accionAceptarSugerencia(fd: FormData): Promise<void> {
  fd.set("salario_fuente", "employees");
  await accionCompletar(fd);
}

export async function accionHomologar(fd: FormData): Promise<void> {
  let id = "";
  let salida: Record<string, string>;
  try {
    const actor = await exigirEdicion();
    const iv = idYVersion(fd);
    id = iv.id;
    const modalidad = texto(fd, "modalidad_ajustada");
    if (modalidad != null && modalidad !== "INICIAL" && modalidad !== "PRORROGA") throw new Error("Modalidad no válida.");
    const entidad = texto(fd, "entidad_catalogo_id");
    if (entidad != null && !UUID_RE.test(entidad)) throw new Error("Entidad no válida.");
    const r = await homologar(id, iv.version, {
      tipo_homologado: texto(fd, "tipo_homologado"),
      entidad_catalogo_id: entidad,
      modalidad_ajustada: modalidad as "INICIAL" | "PRORROGA" | null,
      motivo: texto(fd, "motivo"),
    }, actor);
    await auditarOperacion({ accion: "expediente_homologado", expedienteId: id, rol: actor.rol, valorNuevo: `tipo ${texto(fd, "tipo_homologado") ?? "—"} · entidad ${entidad ?? "—"}`, detalle: { ajustes: r.ajustes, recalculado: r.recalculado } });
    revalidatePath(`/incapacidades/${id}`);
    revalidatePath("/incapacidades");
    salida = resumenResultado("Homologación guardada", r);
  } catch (e) {
    salida = { error: mensajeDe(e) };
  }
  if (!id) redirect("/incapacidades");
  volver(id, salida);
}

export async function accionSobrescribir(fd: FormData): Promise<void> {
  let id = "";
  let salida: Record<string, string>;
  try {
    const actor = await exigirEdicion();
    const iv = idYVersion(fd);
    id = iv.id;
    const dias = numero(fd, "dias_entidad_ajustados", "Días a cargo ajustados");
    const valor = numero(fd, "valor_reclamado_ajustado", "Valor reclamado ajustado");
    const r = await sobrescribir(id, iv.version, {
      dias_entidad_ajustados: dias,
      valor_reclamado_ajustado: valor,
      motivo: texto(fd, "motivo"),
    }, actor);
    await auditarOperacion({ accion: "ajuste_liquidacion", expedienteId: id, rol: actor.rol, valorNuevo: `días ${dias ?? "—"} · valor ${valor ?? "—"}`, detalle: { ajustes: r.ajustes, recalculado: r.recalculado, avisos: r.avisos } });
    revalidatePath(`/incapacidades/${id}`);
    revalidatePath("/incapacidades");
    salida = r.ajustes.length ? resumenResultado("Sobrescritura guardada", r) : { ok: "Sin cambios." };
  } catch (e) {
    salida = { error: mensajeDe(e) };
  }
  if (!id) redirect("/incapacidades");
  volver(id, salida);
}

export async function accionLiquidar(fd: FormData): Promise<void> {
  let id = "";
  let salida: Record<string, string>;
  try {
    const actor = await exigirEdicion();
    id = String(fd.get("id") ?? "");
    if (!UUID_RE.test(id)) throw new Error("Expediente no válido.");
    const r = await liquidarExpediente(id, actor, { origen: "manual" });
    await auditarOperacion({
      accion: "liquidacion_calculada", expedienteId: id, rol: actor.rol, valor: r.valorReclamado,
      valorNuevo: `${r.reglaCodigo} · ${r.diasEntidad} d · reclamado ${r.valorReclamado}`,
      detalle: { liquidacion_id: r.liquidacionId, avisos: r.avisos },
    });
    revalidatePath(`/incapacidades/${id}`);
    revalidatePath("/incapacidades");
    salida = { ok: `Liquidado con ${r.reglaCodigo}: ${r.diasEntidad} día(s) a cargo de la entidad.` };
    if (r.avisos.length) salida.aviso = r.avisos.join(" ");
  } catch (e) {
    salida = { error: mensajeDe(e) };
    if (id) {
      const perms = await getCurrentPermissions().catch(() => null);
      await auditarOperacion({ accion: "liquidacion_calculada", expedienteId: id, rol: perms?.userType ?? null, resultado: "fallido", valorNuevo: salida.error, detalle: {} });
    }
  }
  if (!id) redirect("/incapacidades");
  volver(id, salida);
}
