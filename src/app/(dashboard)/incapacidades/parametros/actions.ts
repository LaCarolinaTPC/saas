"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentPermissions } from "@/lib/permissions";
import { auditarCatalogo, auditarParametro } from "@/lib/incapacidades/auditoria";
import {
  guardarCorte,
  guardarEntidad,
  leerCorte,
  leerEntidad,
  type CamposEntidad,
} from "@/lib/incapacidades/expedientes";
import { CLASES_ENTIDAD } from "@/lib/incapacidades/formato";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const RUTA = "/incapacidades/parametros";

function volver(params: Record<string, string>): never {
  const q = new URLSearchParams(params).toString();
  redirect(q ? `${RUTA}?${q}` : RUTA);
}

async function exigirAdmin() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) throw new Error("Solo el administrador puede cambiar los parámetros del módulo.");
  return perms;
}

/**
 * Cambia la fecha de corte de gestión. Moverla hacia atrás NO crea expedientes
 * retroactivos: eso exige el alta manual, con motivo (plan, 7.1).
 */
export async function actualizarCorte(formData: FormData): Promise<void> {
  let error: string | null = null;
  try {
    const perms = await exigirAdmin();
    const fecha = String(formData.get("fecha_corte") ?? "").trim();
    if (!FECHA_RE.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) {
      throw new Error("La fecha de corte debe tener la forma AAAA-MM-DD.");
    }
    const anterior = await leerCorte();
    if (anterior !== fecha) {
      await guardarCorte(fecha, perms.userEmail);
      await auditarParametro({ clave: "fecha_corte_gestion", anterior, nuevo: fecha, rol: perms.userType });
    }
    revalidatePath(RUTA);
    revalidatePath("/incapacidades");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  volver(error ? { error } : { ok: "corte" });
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

/** Clase, NIT, vigencia y umbral de días cobrables de una EPS o ARL del catálogo. */
export async function actualizarEntidad(formData: FormData): Promise<void> {
  let error: string | null = null;
  try {
    const perms = await exigirAdmin();
    const id = String(formData.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Entidad no válida.");
    const actual = await leerEntidad(id);
    if (!actual) throw new Error("La entidad no existe en el catálogo.");

    const clase = textoONull(formData.get("clase"));
    if (clase != null && !(CLASES_ENTIDAD as readonly string[]).includes(clase)) throw new Error("Clase no válida.");
    const nit = textoONull(formData.get("nit"));
    if (nit != null && !/^[0-9.\- ]{5,20}$/.test(nit)) throw new Error("El NIT solo admite dígitos, puntos y guion.");
    const vigenteDesde = textoONull(formData.get("vigente_desde"));
    const vigenteHasta = textoONull(formData.get("vigente_hasta"));
    for (const f of [vigenteDesde, vigenteHasta]) {
      if (f != null && !FECHA_RE.test(f)) throw new Error("Las fechas de vigencia deben tener la forma AAAA-MM-DD.");
    }
    if (vigenteDesde && vigenteHasta && vigenteHasta < vigenteDesde) throw new Error("La vigencia termina antes de empezar.");
    const diasTexto = textoONull(formData.get("dias_min_cobro"));
    let diasMin: number | null = null;
    if (diasTexto != null) {
      diasMin = Number(diasTexto);
      if (!Number.isInteger(diasMin) || diasMin < 0 || diasMin > 365) {
        throw new Error("El umbral de días cobrables debe ser un entero entre 0 y 365.");
      }
    }

    const nuevo: CamposEntidad = {
      clase: clase as CamposEntidad["clase"],
      nit,
      vigente_desde: vigenteDesde,
      vigente_hasta: vigenteHasta,
      dias_min_cobro: diasMin,
    };
    const anterior: CamposEntidad = {
      clase: actual.clase,
      nit: actual.nit,
      vigente_desde: actual.vigente_desde,
      vigente_hasta: actual.vigente_hasta,
      dias_min_cobro: actual.dias_min_cobro,
    };
    if (JSON.stringify(anterior) !== JSON.stringify(nuevo)) {
      await guardarEntidad(id, nuevo);
      await auditarCatalogo({
        entidadId: id,
        nombre: actual.nombre,
        anterior: anterior as unknown as Record<string, unknown>,
        nuevo: nuevo as unknown as Record<string, unknown>,
        rol: perms.userType,
      });
    }
    revalidatePath(RUTA);
    revalidatePath("/incapacidades");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  volver(error ? { error } : { ok: "entidad" });
}
