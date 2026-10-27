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

export type ViajeAccidente = { bus: string | null; ruta: string | null };

/**
 * Viaje que GEMA tenía activo para el conductor a la hora del accidente.
 * La ruta pertenece al viaje histórico: no usamos `vehiculos.ruta`, porque esa
 * es la asignación actual del bus y puede haber cambiado desde el accidente.
 */
export async function buscarViajeAccidente(cedula: string, fechaHora: string): Promise<ViajeAccidente | null> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "accidentabilidad") && !canAccess(perms, "reporte_accidente")) {
    throw new Error("Sin acceso a Accidentabilidad.");
  }
  if (!cedula.trim() || !fechaHora) return null;

  const instante = new Date(fechaHora);
  if (Number.isNaN(instante.getTime())) return null;
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instante);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  const dia = `${p("year")}-${p("month")}-${p("day")}`;
  const hora = `${p("hour")}:${p("minute")}:00`;
  const admin = createAdminClient();
  const { data } = await admin
    .from("historico_despacho")
    .select("codigo, ruta_programada, hora_despacho, estado, timbradas")
    .eq("conductor_ced", cedula.trim())
    .eq("fecha_viaje", dia)
    .order("hora_despacho");
  const viajes = (data ?? []).filter((v) =>
    (v.timbradas ?? 0) > 0 || ["DESPACHADO", "NO_FINALIZADO", "PENDIENTE", "POR_LIQUIDAR"].includes(String(v.estado ?? "").toUpperCase())
  );
  if (!viajes.length) return null;
  const previos = viajes.filter((v) => String(v.hora_despacho ?? "99:99:99") <= hora);
  const viaje = previos.at(-1) ?? viajes[0];
  return { bus: viaje.codigo == null ? null : String(viaje.codigo), ruta: viaje.ruta_programada ?? null };
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
  // Una foto quitada del reporte también sale de la pantalla TV. (La lectura
  // del TV filtra igual por `fotos`; esto mantiene la columna limpia.)
  const { data: tv } = await admin.from("accidentes").select("fotos_pantalla").eq("id", id).maybeSingle();
  const enPantalla = (tv?.fotos_pantalla as string[] | null | undefined) ?? null;
  const { error } = await admin
    .from("accidentes")
    .update({
      [campo]: actuales.filter((p) => p !== path),
      ...(campo === "fotos" && enPantalla?.includes(path) ? { fotos_pantalla: enPantalla.filter((p) => p !== path) } : {}),
    })
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
 * Marca o desmarca una foto del accidente para la pantalla TV («Accidentes de
 * ayer»). Solo fotos del propio reporte; nunca deben marcarse documentos
 * (cédulas, licencias, SOAT): la pantalla es pública.
 */
export async function marcarFotoPantalla(id: string, path: string, mostrar: boolean) {
  const perms = await assertEdicion();
  const admin = createAdminClient();
  const { fotos } = await accidenteEditable(admin, id);
  if (!(fotos ?? []).includes(path)) throw new Error("La foto no es de este accidente.");
  const { data, error: eLeer } = await admin.from("accidentes").select("fotos_pantalla").eq("id", id).single();
  if (eLeer) throw new Error(eLeer.message);
  const actuales = ((data?.fotos_pantalla as string[] | null) ?? []).filter((p) => (fotos ?? []).includes(p));
  const lista = mostrar ? [...new Set([...actuales, path])] : actuales.filter((p) => p !== path);
  const { error } = await admin.from("accidentes").update({ fotos_pantalla: lista }).eq("id", id);
  if (error) throw new Error(error.message);
  await admin.from("accidente_eventos").insert({
    accidente_id: id,
    tipo: "comentario",
    comentario: mostrar ? "Se aprobó una foto para la pantalla TV." : "Se retiró una foto de la pantalla TV.",
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
