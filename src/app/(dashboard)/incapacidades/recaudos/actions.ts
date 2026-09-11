"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarOperacion } from "@/lib/incapacidades/auditoria";
import { ConflictoVersion, type Actor } from "@/lib/incapacidades/liquidacion";
import { anularRecaudo, aplicarRecaudo, registrarRecaudo } from "@/lib/incapacidades/recaudos";

const RUTA = "/incapacidades/recaudos";
const UUID_RE = /^[0-9a-f-]{36}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function texto(fd: FormData, k: string): string | null {
  const s = String(fd.get(k) ?? "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}
function numero(fd: FormData, k: string, etiqueta: string): number | null {
  const s = texto(fd, k);
  if (s == null) return null;
  const limpio = s.replace(/\$/g, "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(limpio);
  if (!Number.isFinite(n)) throw new Error(`${etiqueta}: no es un número.`);
  return n;
}
function volver(params: Record<string, string>, recaudo?: string | null): never {
  const p = new URLSearchParams(params);
  if (recaudo) p.set("recaudo", recaudo);
  redirect(`${RUTA}?${p.toString()}`);
}
async function exigirEdicion(): Promise<Actor> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) throw new Error("No tienes acceso al módulo.");
  if (!perms.puedeEditar) throw new Error("Tu tipo de usuario consulta el módulo pero no registra recaudos.");
  return { email: perms.userEmail, rol: perms.userType };
}
const mensajeDe = (e: unknown) => (e instanceof ConflictoVersion ? e.message : e instanceof Error ? e.message : String(e));

export async function accionRegistrarRecaudo(fd: FormData): Promise<void> {
  let salida: Record<string, string>;
  let recaudoId: string | null = null;
  try {
    const actor = await exigirEdicion();
    const entidad = texto(fd, "entidad_catalogo_id");
    if (!entidad || !UUID_RE.test(entidad)) throw new Error("Elige la entidad que giró.");
    const fecha = texto(fd, "fecha_giro");
    if (!fecha || !FECHA_RE.test(fecha)) throw new Error("La fecha de giro es obligatoria.");
    const valor = numero(fd, "valor", "Valor del giro");
    if (valor == null) throw new Error("El valor del giro es obligatorio.");
    const r = await registrarRecaudo({
      entidad_catalogo_id: entidad,
      fecha_giro: fecha,
      valor,
      referencia: texto(fd, "referencia"),
      medio: texto(fd, "medio"),
      observaciones: texto(fd, "observaciones"),
    }, actor);
    recaudoId = r.id;
    await auditarOperacion({ accion: "recaudo_registrado", expedienteId: null, rol: actor.rol, valor: r.valor, valorNuevo: `${r.entidad_nombre} · ${r.fecha_giro}${r.referencia ? ` · ${r.referencia}` : ""}`, detalle: { recaudo_id: r.id, entidad_id: r.entidad_catalogo_id } });
    revalidatePath(RUTA);
    salida = { ok: `Recaudo de ${r.entidad_nombre} por ${Math.round(r.valor).toLocaleString("es-CO")} registrado. Ahora aplícalo a los expedientes.` };
  } catch (e) {
    salida = { error: mensajeDe(e) };
  }
  volver(salida, recaudoId);
}

export async function accionAplicarRecaudo(fd: FormData): Promise<void> {
  let salida: Record<string, string>;
  const recaudoId = String(fd.get("recaudo_id") ?? "");
  try {
    const actor = await exigirEdicion();
    if (!UUID_RE.test(recaudoId)) throw new Error("Recaudo no válido.");
    const expedienteId = String(fd.get("expediente_id") ?? "");
    if (!UUID_RE.test(expedienteId)) throw new Error("Elige el expediente.");
    const valor = numero(fd, "valor", "Valor a aplicar");
    if (valor == null) throw new Error("El valor a aplicar es obligatorio.");
    const a = await aplicarRecaudo(recaudoId, expedienteId, valor, actor);
    await auditarOperacion({ accion: "recaudo_aplicado", expedienteId, rol: actor.rol, valor: a.valor_aplicado, valorNuevo: `recaudo ${recaudoId.slice(0, 8)} · ${a.valor_aplicado}`, detalle: { aplicacion_id: a.id, recaudo_id: recaudoId } });
    revalidatePath(RUTA);
    revalidatePath(`/incapacidades/${expedienteId}`);
    revalidatePath("/incapacidades");
    revalidatePath("/incapacidades/conciliacion");
    salida = { ok: `Aplicados ${Math.round(a.valor_aplicado).toLocaleString("es-CO")} al expediente.` };
  } catch (e) {
    salida = { error: mensajeDe(e) };
  }
  volver(salida, UUID_RE.test(recaudoId) ? recaudoId : null);
}

export async function accionAnularRecaudo(fd: FormData): Promise<void> {
  let salida: Record<string, string>;
  try {
    const actor = await exigirEdicion();
    const id = String(fd.get("recaudo_id") ?? "");
    if (!UUID_RE.test(id)) throw new Error("Recaudo no válido.");
    const r = await anularRecaudo(id, texto(fd, "motivo"), actor);
    await auditarOperacion({ accion: "recaudo_anulado", expedienteId: null, rol: actor.rol, valor: r.valor, valorNuevo: r.motivo_anulacion, detalle: { recaudo_id: r.id } });
    revalidatePath(RUTA);
    salida = { ok: "Recaudo anulado; la evidencia se conserva." };
  } catch (e) {
    salida = { error: mensajeDe(e) };
  }
  volver(salida);
}
