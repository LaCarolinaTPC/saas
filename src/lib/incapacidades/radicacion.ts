/**
 * Radicación ante la entidad (fase 4), lado servidor. Las reglas puras están
 * en radicacion-reglas.ts. Todas las escrituras sobre el expediente llevan
 * control de versión, como en liquidacion.ts.
 *
 * Estados del expediente que mueve: `liquidado` → `radicado` cuando la
 * radicación queda radicada; vuelve a `liquidado` cuando se devuelve o se
 * anula y no queda otra activa.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { ExpedienteVista } from "./expedientes";
import { ConflictoVersion, type Actor } from "./liquidacion";
import { motivoValido } from "./liquidacion-reglas";
import {
  bajoUmbral,
  excepcionValida,
  impedimentosParaRadicar,
  normalizarCodigo,
  type EstadoRadicacion,
} from "./radicacion-reglas";

export interface RadicacionFila {
  id: string;
  expediente_id: string;
  entidad_catalogo_id: string;
  estado: EstadoRadicacion;
  fecha_solicitud: string;
  fecha_radicacion: string | null;
  codigo_radicacion: string | null;
  valor_reclamado: number;
  liquidacion_id: string | null;
  bajo_umbral: boolean;
  excepcion_motivo: string | null;
  motivo_devolucion: string | null;
  devuelta_at: string | null;
  observaciones: string | null;
  registrada_por_email: string | null;
  created_at: string;
  updated_at: string;
  anulada_at: string | null;
  anulada_por_email: string | null;
  motivo_anulacion: string | null;
}

export class ImpideRadicar extends Error {
  constructor(mensajes: string[]) {
    super(`No se puede radicar: ${mensajes.join(" ")}`);
    this.name = "ImpideRadicar";
  }
}

export async function listarRadicaciones(expedienteId: string): Promise<RadicacionFila[]> {
  const { data, error } = await createAdminClient()
    .from("incapacidad_radicaciones")
    .select("*")
    .eq("expediente_id", expedienteId)
    .order("created_at", { ascending: false })
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as RadicacionFila[];
}

async function leerVista(id: string): Promise<ExpedienteVista> {
  const { data, error } = await createAdminClient().from("vw_incapacidad_expedientes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("El expediente no existe.");
  return data as ExpedienteVista;
}

async function leerRadicacion(id: string): Promise<RadicacionFila> {
  const { data, error } = await createAdminClient().from("incapacidad_radicaciones").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("La radicación no existe.");
  return data as RadicacionFila;
}

async function bitacora(expedienteId: string, accion: string, antes: unknown, despues: unknown, email: string | null) {
  try {
    await createAdminClient().from("ausentismo_log").insert({ registro_id: expedienteId, accion, datos_anteriores: antes ?? null, datos_nuevos: despues ?? null, user_email: email });
  } catch (e) {
    console.error("[incapacidades] no se pudo escribir la bitácora:", e);
  }
}

async function estadoExpediente(id: string, version: number, estado: "liquidado" | "radicado") {
  const { data, error } = await createAdminClient()
    .from("incapacidad_expedientes")
    .update({ estado })
    .eq("id", id)
    .eq("version", version)
    .is("eliminado_at", null)
    .select("version");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new ConflictoVersion();
}

/** Error de la base por código repetido → mensaje que RRHH entiende. */
function traducir(e: { code?: string; message: string }, codigo: string | null): Error {
  if (e.code === "23505" && e.message.includes("ux_incapacidad_radicaciones_codigo")) {
    return new Error(`Ya existe una radicación con el código ${codigo ?? ""} ante esta entidad.`);
  }
  if (e.code === "23505" && e.message.includes("ux_incapacidad_radicaciones_activa")) {
    return new Error("El expediente ya tiene una radicación activa.");
  }
  return new Error(e.message);
}

export interface DatosRadicar {
  fecha_solicitud: string;
  fecha_radicacion: string | null;
  codigo_radicacion: string | null;
  excepcion_motivo: string | null;
  observaciones: string | null;
}

/**
 * Crea la radicación. Con código y fecha queda `radicada` y el expediente pasa
 * a `radicado`; sin código queda `solicitada`. Bajo el umbral de la entidad
 * exige la excepción escrita.
 */
export async function radicar(expedienteId: string, version: number, d: DatosRadicar, actor: Actor): Promise<RadicacionFila> {
  const v = await leerVista(expedienteId);
  if (v.version !== version) throw new ConflictoVersion();
  const imp = impedimentosParaRadicar(v);
  if (imp.length) throw new ImpideRadicar(imp.map((i) => i.mensaje));

  const codigo = normalizarCodigo(d.codigo_radicacion);
  if (codigo && !d.fecha_radicacion) throw new Error("Con código de radicación hace falta la fecha de radicación.");
  if (!codigo && d.fecha_radicacion) throw new Error("Con fecha de radicación hace falta el código que devolvió la entidad.");
  if (d.fecha_radicacion && d.fecha_radicacion < d.fecha_solicitud) throw new Error("La radicación no puede ser anterior a la solicitud.");

  const esBajoUmbral = bajoUmbral(v);
  if (esBajoUmbral && !excepcionValida(d.excepcion_motivo)) {
    throw new Error(`La incapacidad tiene ${v.dias_incapacidad ?? "—"} día(s) y el umbral de ${v.entidad_nombre ?? "la entidad"} es ${v.entidad_dias_min_cobro ?? "—"}: para radicarla escribe la excepción (mínimo 10 caracteres).`);
  }

  const estado: EstadoRadicacion = codigo ? "radicada" : "solicitada";
  const { data, error } = await createAdminClient()
    .from("incapacidad_radicaciones")
    .insert({
      expediente_id: expedienteId,
      entidad_catalogo_id: v.entidad_catalogo_id,
      estado,
      fecha_solicitud: d.fecha_solicitud,
      fecha_radicacion: d.fecha_radicacion,
      codigo_radicacion: codigo,
      valor_reclamado: v.valor_reclamado,
      liquidacion_id: v.liquidacion_id,
      bajo_umbral: esBajoUmbral,
      excepcion_motivo: esBajoUmbral ? d.excepcion_motivo!.replace(/\s+/g, " ").trim() : null,
      observaciones: d.observaciones,
      registrada_por_email: actor.email,
    })
    .select("*")
    .single();
  if (error) throw traducir(error, codigo);
  const r = data as RadicacionFila;

  if (estado === "radicada" && v.estado !== "radicado") await estadoExpediente(expedienteId, version, "radicado");
  await bitacora(expedienteId, "radicacion_registrada", null, { radicacion_id: r.id, estado, codigo, fecha_solicitud: d.fecha_solicitud, fecha_radicacion: d.fecha_radicacion, valor_reclamado: v.valor_reclamado, bajo_umbral: esBajoUmbral, excepcion: r.excepcion_motivo }, actor.email);
  return r;
}

/** La entidad devolvió el código: la solicitud pasa a radicada. */
export async function marcarRadicada(radicacionId: string, version: number, d: { fecha_radicacion: string; codigo_radicacion: string }, actor: Actor): Promise<RadicacionFila> {
  const r = await leerRadicacion(radicacionId);
  if (r.estado !== "solicitada") throw new Error(`La radicación está ${r.estado}; solo una solicitada puede marcarse radicada.`);
  const v = await leerVista(r.expediente_id);
  if (v.version !== version) throw new ConflictoVersion();
  const codigo = normalizarCodigo(d.codigo_radicacion);
  if (!codigo) throw new Error("Escribe el código que devolvió la entidad.");
  if (d.fecha_radicacion < r.fecha_solicitud) throw new Error("La radicación no puede ser anterior a la solicitud.");

  const { data, error } = await createAdminClient()
    .from("incapacidad_radicaciones")
    .update({ estado: "radicada", fecha_radicacion: d.fecha_radicacion, codigo_radicacion: codigo })
    .eq("id", radicacionId)
    .eq("estado", "solicitada")
    .select("*")
    .single();
  if (error) throw traducir(error, codigo);
  if (v.estado !== "radicado") await estadoExpediente(r.expediente_id, version, "radicado");
  await bitacora(r.expediente_id, "radicacion_radicada", { estado: "solicitada" }, { radicacion_id: radicacionId, codigo, fecha_radicacion: d.fecha_radicacion }, actor.email);
  return data as RadicacionFila;
}

/** La entidad rechazó la radicación. El expediente vuelve a liquidado y se puede radicar de nuevo. */
export async function devolver(radicacionId: string, version: number, motivo: string | null, actor: Actor): Promise<RadicacionFila> {
  const r = await leerRadicacion(radicacionId);
  if (r.estado !== "solicitada" && r.estado !== "radicada") throw new Error(`La radicación está ${r.estado}; no se puede devolver.`);
  if (!motivoValido(motivo)) throw new Error("Escribe el motivo de la devolución (mínimo 5 caracteres).");
  const v = await leerVista(r.expediente_id);
  if (v.version !== version) throw new ConflictoVersion();

  const { data, error } = await createAdminClient()
    .from("incapacidad_radicaciones")
    .update({ estado: "devuelta", motivo_devolucion: motivo.replace(/\s+/g, " ").trim(), devuelta_at: new Date().toISOString() })
    .eq("id", radicacionId)
    .in("estado", ["solicitada", "radicada"])
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (v.estado === "radicado") await estadoExpediente(r.expediente_id, version, "liquidado");
  await bitacora(r.expediente_id, "radicacion_devuelta", { estado: r.estado, codigo: r.codigo_radicacion }, { radicacion_id: radicacionId, motivo }, actor.email);
  return data as RadicacionFila;
}

/** Error de captura: se anula con motivo y conserva la evidencia. */
export async function anular(radicacionId: string, version: number, motivo: string | null, actor: Actor): Promise<RadicacionFila> {
  const r = await leerRadicacion(radicacionId);
  if (r.estado === "anulada") throw new Error("La radicación ya está anulada.");
  if (!motivoValido(motivo)) throw new Error("Escribe el motivo de la anulación (mínimo 5 caracteres).");
  const v = await leerVista(r.expediente_id);
  if (v.version !== version) throw new ConflictoVersion();

  const eraActiva = r.estado === "solicitada" || r.estado === "radicada";
  const { data, error } = await createAdminClient()
    .from("incapacidad_radicaciones")
    .update({ estado: "anulada", anulada_at: new Date().toISOString(), anulada_por_email: actor.email, motivo_anulacion: motivo.replace(/\s+/g, " ").trim() })
    .eq("id", radicacionId)
    .neq("estado", "anulada")
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  if (eraActiva && v.estado === "radicado") await estadoExpediente(r.expediente_id, version, "liquidado");
  await bitacora(r.expediente_id, "radicacion_anulada", { estado: r.estado, codigo: r.codigo_radicacion }, { radicacion_id: radicacionId, motivo }, actor.email);
  return data as RadicacionFila;
}
