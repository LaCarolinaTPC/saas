"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import type { FactorPolitica, TipoCatalogo } from "./formato";

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
  await assertAcceso();
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
