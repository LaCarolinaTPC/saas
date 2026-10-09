"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import type { FactorPolitica, TipoCatalogo } from "./formato";
import { rutasDeFotos } from "./fotos";
import { rutaDeCroquis, validarCroquis } from "./croquis";

async function assertAcceso() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "accidentabilidad")) throw new Error("Sin acceso a Accidentabilidad.");
  return perms;
}

async function assertAdmin() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) throw new Error("Solo un administrador puede configurar los catálogos de accidentalidad.");
}

export type VehiculoSugerido = { codigo: string; placa: string | null; ruta: string | null };

/** Autocompletado del vehículo propio por N.º interno o placa (maestro de GEMA). */
export async function buscarVehiculos(q: string): Promise<VehiculoSugerido[]> {
  // También lo usa el auxiliar de ruta al reportar, que no tiene Accidentabilidad.
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "accidentabilidad") && !canAccess(perms, "reporte_accidente")) {
    throw new Error("Sin acceso a Accidentabilidad.");
  }
  const term = q.replace(/[%,()]/g, " ").trim();
  if (!term) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("vehiculos")
    .select("codigo, placa, ruta")
    .or(`codigo.ilike.${term}%,placa.ilike.%${term}%`)
    .order("codigo")
    .limit(8);
  return (data ?? []) as VehiculoSugerido[];
}

/** Registra quién cerró la investigación del accidente. */
export async function guardarCierreInvestigacion(id: string, funcionario: string) {
  const perms = await assertAcceso();
  if (!perms.puedeEditar) throw new Error("No tienes permisos para editar accidentes.");
  const admin = createAdminClient();
  const valor = funcionario.trim() || null;
  const { error } = await admin.from("accidentes").update({ funcionario_cierre: valor }).eq("id", id);
  if (error) throw new Error(error.message);
  await admin.from("accidente_eventos").insert({
    accidente_id: id,
    tipo: "comentario",
    comentario: valor ? `Cierre de la investigación: atendió ${valor}.` : "Se borró el funcionario de cierre.",
    user_id: perms.userId,
  });
  revalidatePath(`/accidentabilidad/consultar/${id}`);
}

// ── Fotos del accidente y croquis del IPAT ──────────────────────────────────

/** Columnas que guardan listas de fotos del bucket (fotos/<uuid>). */
export type CampoFotos = "fotos" | "ipat_croquis";
const NOMBRE_CAMPO: Record<CampoFotos, [string, string]> = {
  fotos: ["una foto", "fotos"],
  ipat_croquis: ["una foto del croquis del IPAT", "fotos del croquis del IPAT"],
};

async function accidenteEditable(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await admin
    .from("accidentes")
    .select("fotos, ipat_croquis, origen")
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("No se encontró el accidente.");
  if (data.origen === "historico") throw new Error("El registro histórico no se edita.");
  return data as { fotos: string[] | null; ipat_croquis: string[] | null };
}

async function assertEdicion() {
  const perms = await assertAcceso();
  if (!perms.puedeEditar) throw new Error("No tienes permisos para editar accidentes.");
  return perms;
}

/** Agrega fotos ya subidas por /api/rotacion/accidentes/fotos al reporte. */
export async function agregarFotosAccidente(id: string, paths: string[], campo: CampoFotos = "fotos") {
  const perms = await assertEdicion();
  const nuevas = rutasDeFotos(paths);
  if (nuevas.length === 0) return;
  const admin = createAdminClient();
  const actuales = (await accidenteEditable(admin, id))[campo] ?? [];
  const lista = [...new Set([...actuales, ...nuevas])];
  const cambio = campo === "fotos" ? { fotos: lista, tiene_fotos: true } : { ipat_croquis: lista };
  const { error } = await admin.from("accidentes").update(cambio).eq("id", id);
  if (error) throw new Error(error.message);
  const [una, varias] = NOMBRE_CAMPO[campo];
  await admin.from("accidente_eventos").insert({
    accidente_id: id,
    tipo: "comentario",
    comentario: nuevas.length === 1 ? `Se agregó ${una}.` : `Se agregaron ${nuevas.length} ${varias}.`,
    user_id: perms.userId,
  });
  revalidatePath(`/accidentabilidad/consultar/${id}`);
}

/** Quita una foto del reporte. El archivo se conserva en el bucket. */
export async function quitarFotoAccidente(id: string, path: string, campo: CampoFotos = "fotos") {
  const perms = await assertEdicion();
  const admin = createAdminClient();
  const actuales = (await accidenteEditable(admin, id))[campo] ?? [];
  if (!actuales.includes(path)) return;
  const { error } = await admin
    .from("accidentes")
    .update({ [campo]: actuales.filter((p) => p !== path) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await admin.from("accidente_eventos").insert({
    accidente_id: id,
    tipo: "comentario",
    comentario: `Se quitó ${NOMBRE_CAMPO[campo][0]}.`,
    user_id: perms.userId,
  });
  revalidatePath(`/accidentabilidad/consultar/${id}`);
}

/**
 * Guarda el croquis corregido: el PNG nuevo (ya subido) y su dibujo. La
 * imagen anterior se conserva en el bucket; el historial registra el cambio.
 */
export async function guardarCroquisAccidente(id: string, croquis: unknown, path: string) {
  const perms = await assertEdicion();
  const ruta = rutaDeCroquis(path);
  const dibujo = validarCroquis(croquis);
  if (!ruta || !dibujo) throw new Error("El croquis no es válido.");
  const admin = createAdminClient();
  await accidenteEditable(admin, id);
  const { error } = await admin
    .from("accidentes")
    .update({ croquis_path: ruta, croquis_json: dibujo, croquis_omitido_motivo: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await admin.from("accidente_eventos").insert({
    accidente_id: id,
    tipo: "comentario",
    comentario: "Se actualizó el croquis.",
    user_id: perms.userId,
  });
  revalidatePath(`/accidentabilidad/consultar/${id}`);
}

// ── Catálogos configurables ─────────────────────────────────────────────────

function slug(label: string) {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "item"
  );
}

function revalidarCatalogos() {
  revalidatePath("/accidentabilidad/catalogos");
  revalidatePath("/accidentabilidad/reportar");
}

export async function crearItemCatalogo(input: {
  tipo: TipoCatalogo;
  label: string;
  codigo?: string;
  categoria?: string | null;
  factor_politica?: FactorPolitica | null;
}) {
  await assertAdmin();
  const label = input.label.trim();
  if (!label) throw new Error("El nombre es obligatorio.");
  if (input.tipo === "factor" && !input.codigo?.trim()) throw new Error("El código es obligatorio.");
  const codigo = input.tipo === "factor" ? input.codigo!.trim() : slug(label);

  const admin = createAdminClient();
  const { data: max } = await admin
    .from("accidente_catalogos")
    .select("orden")
    .eq("tipo", input.tipo)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin.from("accidente_catalogos").insert({
    tipo: input.tipo,
    codigo,
    label,
    categoria: input.tipo === "factor" ? input.categoria || null : null,
    factor_politica: input.tipo === "factor" ? input.factor_politica || null : null,
    orden: (max?.orden ?? 0) + 1,
  });
  if (error) {
    if (error.code === "23505") throw new Error(`Ya existe «${codigo}» en este catálogo.`);
    throw new Error(error.message);
  }
  revalidarCatalogos();
}

export async function actualizarItemCatalogo(
  id: string,
  patch: { label?: string; activo?: boolean; categoria?: string | null; factor_politica?: FactorPolitica | null }
) {
  await assertAdmin();
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    if (!patch.label.trim()) throw new Error("El nombre es obligatorio.");
    row.label = patch.label.trim();
  }
  if (patch.activo !== undefined) row.activo = patch.activo;
  if (patch.categoria !== undefined) row.categoria = patch.categoria || null;
  if (patch.factor_politica !== undefined) row.factor_politica = patch.factor_politica || null;
  const admin = createAdminClient();
  const { error } = await admin.from("accidente_catalogos").update(row).eq("id", id);
  if (error) throw new Error(error.message);
  revalidarCatalogos();
}
