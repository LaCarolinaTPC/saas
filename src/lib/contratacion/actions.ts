"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { firmarMedios } from "@/lib/comunicaciones/medios";
import { getCurrentPermissions, canAccess, puedeEditarEn } from "@/lib/permissions";
import { CAUSA_ANTECEDENTES, ESTADOS_REVISION_REINGRESO, FILTRO_REINGRESOS, campoFecha } from "@/lib/contratacion/constants";
import { vinculoConEmpresa } from "@/lib/seleccion/vinculo-servidor";
import type { VinculoEmpresa } from "@/lib/seleccion/vinculo";
import { enlazarPrerregistro, sincronizarConProceso } from "@/lib/padrino/servidor";
import {
  actorUsuario,
  asegurarAltaContratado,
  asegurarCandidato,
  cambiarEstadoProceso,
  errorDuplicado,
  procesoAbiertoPorCedula,
  registrarEvento,
  vincularCandidatoVacante,
} from "@/lib/contratacion/servidor";
import { avisarCierrePorAntecedentes, reevaluarPreseleccion } from "@/lib/seleccion/servidor";
import { consultarSimitProceso, type ResultadoConsultaSimit } from "@/lib/verificacion/servidor";

export interface ProcesoInput {
  fecha_creacion: string;
  nombre: string;
  cedula: string;
  vacancy_id: string | null;
  celular: string | null;
  reingreso: boolean;
  estado: string;
  causa_no_contrato: string | null;
  observacion: string | null;
  simit: string | null;
  simit_valor: number;
  antecedentes: string | null;
  licencia_categoria: string | null;
  medio_postulacion: string | null;
  fecha_citacion: string | null;
  fecha_examenes: string | null;
  fecha_examenes_fase2: string | null;
  fecha_prueba_manejo: string | null;
  fecha_contrato: string | null;
  // Prefiltro (entrega 1 de selección). Opcionales: sin la migración no se envían.
  edad?: number | null;
  ciudad_residencia?: string | null;
  dispuesto_traslado?: boolean | null;
  experiencia_meses?: number | null;
  licencia_verificada_runt?: boolean;
}

async function assertEditor() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") || !puedeEditarEn(perms, "candidatos")) {
    throw new Error("No tienes permisos para gestionar procesos de contratación.");
  }
  return perms;
}

const entero = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.round(n);
};

/** Columnas del prefiltro agregadas en la migración 20261113205625. */
const COLUMNAS_PREFILTRO = ["edad", "ciudad_residencia", "dispuesto_traslado", "experiencia_meses", "licencia_verificada_runt"] as const;

interface FilaProceso {
  fecha_creacion: string;
  nombre: string;
  cedula: string;
  vacancy_id: string | null;
  celular: string | null;
  reingreso: boolean;
  estado: string;
  causa_no_contrato: string | null;
  observacion: string | null;
  simit: string | null;
  simit_valor: number;
  antecedentes: string | null;
  licencia_categoria: string | null;
  medio_postulacion: string | null;
  fecha_citacion: string | null;
  fecha_examenes: string | null;
  fecha_examenes_fase2: string | null;
  fecha_prueba_manejo: string | null;
  fecha_contrato: string | null;
  edad?: number | null;
  ciudad_residencia?: string | null;
  dispuesto_traslado?: boolean | null;
  experiencia_meses?: number | null;
  licencia_verificada_runt?: boolean;
}

function sanitize(input: ProcesoInput): FilaProceso {
  const row: FilaProceso = {
    fecha_creacion: input.fecha_creacion,
    nombre: input.nombre.trim().toUpperCase(),
    cedula: input.cedula.trim(),
    vacancy_id: input.vacancy_id || null,
    celular: input.celular?.trim() || null,
    reingreso: input.reingreso,
    estado: input.estado,
    causa_no_contrato: input.estado === "cierre" ? input.causa_no_contrato?.trim() || null : null,
    observacion: input.observacion?.trim() || null,
    simit: input.simit || null,
    simit_valor: Number.isFinite(input.simit_valor) ? input.simit_valor : 0,
    antecedentes: input.antecedentes || null,
    licencia_categoria: input.licencia_categoria?.trim() || null,
    medio_postulacion: input.medio_postulacion || null,
    fecha_citacion: input.fecha_citacion || null,
    fecha_examenes: input.fecha_examenes || null,
    fecha_examenes_fase2: input.fecha_examenes_fase2 || null,
    fecha_prueba_manejo: input.fecha_prueba_manejo || null,
    fecha_contrato: input.fecha_contrato || null,
  };
  // Solo se escriben si el formulario los trae, para no pisar lo que dejó el asistente.
  if ("edad" in input) row.edad = entero(input.edad);
  if ("ciudad_residencia" in input) row.ciudad_residencia = input.ciudad_residencia?.trim() || null;
  if ("dispuesto_traslado" in input) row.dispuesto_traslado = input.dispuesto_traslado ?? null;
  if ("experiencia_meses" in input) row.experiencia_meses = entero(input.experiencia_meses);
  if ("licencia_verificada_runt" in input) row.licencia_verificada_runt = Boolean(input.licencia_verificada_runt);
  return row;
}

function sinPrefiltro<T extends object>(fila: T): T {
  const copia = { ...fila } as Record<string, unknown>;
  for (const c of COLUMNAS_PREFILTRO) delete copia[c];
  return copia as T;
}

/** Columnas que se comparan para dejar en el historial qué se editó. */
const CAMPOS_HISTORIAL = [
  "nombre", "cedula", "celular", "vacancy_id", "reingreso", "simit", "simit_valor", "antecedentes", "licencia_categoria",
  "medio_postulacion", "fecha_citacion", "fecha_examenes", "fecha_examenes_fase2", "fecha_prueba_manejo", "fecha_contrato",
  "edad", "ciudad_residencia", "dispuesto_traslado", "experiencia_meses", "licencia_verificada_runt", "observacion",
];

/** Crea el proceso (y el candidato si no existe). Devuelve el id del proceso. */
export async function createProceso(input: ProcesoInput): Promise<{ id: string }> {
  const perms = await assertEditor();
  if (!input.nombre.trim() || !input.cedula.trim()) {
    throw new Error("Nombre y cédula son obligatorios.");
  }
  const row = sanitize(input);
  if (row.estado !== "contratado" && row.estado !== "cierre" && (await procesoAbiertoPorCedula(row.cedula))) {
    throw new Error(`Ya hay un proceso abierto para la cédula ${row.cedula}. Ciérrelo o edítelo en lugar de crear otro.`);
  }
  const admin = createAdminClient();
  const candidateId = await asegurarCandidato(row);
  let { data, error } = await admin
    .from("procesos_contratacion")
    .insert({ ...row, candidate_id: candidateId, created_by: perms.userId })
    .select("id")
    .single();
  // Sin la migración 20261113205625: guarda solo las columnas de siempre.
  if (error && /column|schema cache/i.test(error.message)) {
    ({ data, error } = await admin
      .from("procesos_contratacion")
      .insert({ ...sinPrefiltro(row), candidate_id: candidateId, created_by: perms.userId })
      .select("id")
      .single());
  }
  if (error || !data) throw errorDuplicado(error ?? { message: "No se pudo crear el proceso." }, row.cedula);
  const id = data.id as string;
  const actor = actorUsuario(perms);
  await registrarEvento(id, { tipo: "creado", estadoNuevo: row.estado, causa: row.causa_no_contrato }, actor);
  await vincularCandidatoVacante(candidateId, row.vacancy_id, row.estado);
  // Plan Padrino: si un padrino prerregistró esta cédula, el registro se enlaza solo.
  await enlazarPrerregistro(id, perms);
  if (row.estado === "contratado") {
    await asegurarAltaContratado({ ...row, candidate_id: candidateId });
    await sincronizarConProceso(id, perms);
  }
  await reevaluarPreseleccion(id);
  revalidatePath("/candidatos");
  return { id };
}

export async function updateProceso(id: string, input: ProcesoInput) {
  const perms = await assertEditor();
  const admin = createAdminClient();
  const row = sanitize(input);
  if (row.estado === "cierre" && !row.causa_no_contrato) {
    throw new Error("Para cerrar el proceso hay que indicar la causa.");
  }
  const { data: antes } = await admin.from("procesos_contratacion").select("*").eq("id", id).maybeSingle();
  if (!antes) throw new Error("El proceso no existe.");
  if (row.estado !== "contratado" && row.estado !== "cierre" && (await procesoAbiertoPorCedula(row.cedula, id))) {
    throw new Error(`Ya hay otro proceso abierto para la cédula ${row.cedula}.`);
  }

  const candidateId = await asegurarCandidato(row);
  // El estado se cambia aparte, para que quede en el historial con su causa.
  const { estado, causa_no_contrato, ...resto } = row;
  const { error } = await admin
    .from("procesos_contratacion")
    .update({ ...resto, candidate_id: candidateId, updated_by: perms.userId })
    .eq("id", id);
  if (error) {
    // Sin la migración 20261113205625: guarda solo las columnas de siempre.
    if (/column|schema cache/i.test(error.message)) {
      const r2 = await admin.from("procesos_contratacion").update({ ...sinPrefiltro(resto), candidate_id: candidateId }).eq("id", id);
      if (r2.error) throw errorDuplicado(r2.error, row.cedula);
    } else {
      throw errorDuplicado(error, row.cedula);
    }
  }

  const actor = actorUsuario(perms);
  const fila = row as unknown as Record<string, unknown>;
  const cambios = CAMPOS_HISTORIAL.filter((c) => c in fila && String(antes[c] ?? "") !== String(fila[c] ?? ""));
  if (cambios.length) {
    await registrarEvento(id, { tipo: "dato", detalle: { campos: cambios } }, actor);
  }
  const estadoActual = antes.estado as string;
  if (estado !== estadoActual) {
    await cambiarEstadoProceso(id, estado, { actor, causa: causa_no_contrato });
  } else {
    if (estado === "cierre" && causa_no_contrato !== antes.causa_no_contrato) {
      await admin.from("procesos_contratacion").update({ causa_no_contrato }).eq("id", id);
    }
    await vincularCandidatoVacante(candidateId, row.vacancy_id, estado);
    if (estado === "contratado") {
      await asegurarAltaContratado({ ...row, candidate_id: candidateId });
      await sincronizarConProceso(id, perms);
    }
  }
  // Por si se corrigió la cédula del proceso y ahora coincide con un prerregistro.
  await enlazarPrerregistro(id, perms);
  await reevaluarPreseleccion(id);
  // Cerrado por antecedentes desde la ficha: aviso sin el motivo (una sola vez).
  if (estado === "cierre" && causa_no_contrato?.trim() === CAUSA_ANTECEDENTES) {
    await avisarCierrePorAntecedentes(id).catch((e) => console.error("[seleccion] aviso de cierre por antecedentes:", e));
  }
  revalidatePath("/candidatos");
}

/**
 * Cambio rápido de estado desde la tabla o el tablero (sin abrir el
 * formulario). Al cerrar hay que dar la causa.
 */
export async function updateProcesoEstado(id: string, estado: string, causa?: string | null) {
  const perms = await assertEditor();
  await cambiarEstadoProceso(id, estado, { actor: actorUsuario(perms), causa });
  // Cierre por antecedentes: al aspirante se le dice solo que no pasó el proceso, sin el motivo.
  if (estado === "cierre" && causa?.trim() === CAUSA_ANTECEDENTES) {
    await avisarCierrePorAntecedentes(id).catch((e) => console.error("[seleccion] aviso de cierre por antecedentes:", e));
  }
  revalidatePath("/candidatos");
}

/** Botón «Consultar SIMIT» de la ficha (Croma si está configurado; si no, modo manual). */
export async function consultarSimit(id: string): Promise<ResultadoConsultaSimit> {
  const perms = await assertEditor();
  const r = await consultarSimitProceso(id, actorUsuario(perms));
  revalidatePath("/candidatos");
  return r;
}

export interface EventoProcesoVista {
  id: string;
  tipo: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  causa: string | null;
  detalle: Record<string, unknown> | null;
  actor: "usuario" | "agente" | "sistema";
  usuario_email: string | null;
  created_at: string;
}

/** Historial del proceso, del más reciente al más antiguo. */
export async function listarEventosProceso(id: string): Promise<EventoProcesoVista[]> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("Sin permisos para ver candidatos.");
  const { data, error } = await createAdminClient()
    .from("procesos_contratacion_eventos")
    .select("id, tipo, estado_anterior, estado_nuevo, causa, detalle, actor, usuario_email, created_at")
    .eq("proceso_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []) as EventoProcesoVista[];
}

export interface ConsultaExternaVista {
  id: string;
  fuente: string;
  proveedor: string;
  estado: string;
  valor: number | null;
  /** Respuesta completa de la fuente (Croma), tal como llegó. */
  resultado: unknown;
  error: string | null;
  consultado_por: string | null;
  created_at: string;
}

/** ¿La cédula del proceso ya está en Gestivo como conductor (activo o retirado, con la causa de retiro)? */
export async function vinculoEmpresaProceso(id: string): Promise<VinculoEmpresa | null> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("Sin permisos para ver candidatos.");
  const { data } = await createAdminClient().from("procesos_contratacion").select("cedula").eq("id", id).maybeSingle();
  return vinculoConEmpresa((data?.cedula as string | null) ?? null);
}

/** Consultas a fuentes externas (Croma: RUNT, SIMIT…) del proceso, de la más reciente a la más antigua. */
export async function listarConsultasExternas(id: string): Promise<ConsultaExternaVista[]> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("Sin permisos para ver candidatos.");
  const { data, error } = await createAdminClient()
    .from("verificaciones_externas")
    .select("id, fuente, proveedor, estado, valor, resultado, error, consultado_por, created_at")
    .eq("proceso_id", id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return (data ?? []) as ConsultaExternaVista[];
}

export interface DocumentoProceso {
  id: string;
  origen: "whatsapp" | "chat_prueba";
  /** image, document, audio, video… */
  tipo: string;
  nombre: string | null;
  fecha: string;
  /** URL firmada de una hora. */
  url: string | null;
  /** Lectura automática (cédula), si se hizo. */
  lectura: string | null;
}

/**
 * Documentos del candidato: lo que mandó por WhatsApp (fotos, PDF, audios) en
 * las conversaciones ligadas al proceso, con la lectura automática de la
 * cédula, y las fotos subidas en el chat de prueba. Los archivos viven en el
 * bucket privado «whatsapp»; aquí van con URL firmada de una hora.
 */
export async function listarDocumentosProceso(id: string): Promise<DocumentoProceso[]> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("Sin permisos para ver candidatos.");
  const db = createAdminClient();
  const docs: (Omit<DocumentoProceso, "url"> & { ruta: string })[] = [];
  const { data: convs } = await db.from("wa_conversaciones").select("id").eq("proceso_id", id);
  const ids = (convs ?? []).map((c) => c.id as string);
  if (ids.length) {
    const { data: msjs } = await db
      .from("wa_mensajes")
      .select("id, media_tipo, nombre_archivo, media_path, timestamp")
      .in("conversacion_id", ids)
      .eq("direccion", "entrante")
      .not("media_path", "is", null)
      .neq("media_tipo", "sticker")
      .order("timestamp", { ascending: false })
      .limit(60);
    const lecturas = new Map<string, string>();
    const { data: lect, error: eLect } = await db.from("wa_mensajes").select("id, lectura").in("conversacion_id", ids).not("lectura", "is", null);
    if (!eLect) for (const l of lect ?? []) {
      const r = (l.lectura as { resumen?: string | null } | null)?.resumen;
      if (r) lecturas.set(l.id as string, r);
    }
    for (const m of msjs ?? []) {
      docs.push({
        id: m.id as string,
        origen: "whatsapp",
        tipo: (m.media_tipo as string) ?? "document",
        nombre: (m.nombre_archivo as string | null) ?? null,
        fecha: m.timestamp as string,
        ruta: m.media_path as string,
        lectura: lecturas.get(m.id as string) ?? null,
      });
    }
  }
  // Fotos del chat de prueba (procesos/<id>/…) con su lectura al lado (.lectura.txt).
  const { data: archivos } = await db.storage.from("whatsapp").list(`procesos/${id}`, { limit: 100, sortBy: { column: "name", order: "desc" } });
  for (const a of archivos ?? []) {
    if (a.name.endsWith(".lectura.txt")) continue;
    const ruta = `procesos/${id}/${a.name}`;
    let lectura: string | null = null;
    if ((archivos ?? []).some((x) => x.name === `${a.name}.lectura.txt`)) {
      const { data: txt } = await db.storage.from("whatsapp").download(`${ruta}.lectura.txt`);
      lectura = txt ? (await txt.text()).trim() || null : null;
    }
    docs.push({ id: ruta, origen: "chat_prueba", tipo: "image", nombre: null, fecha: a.created_at ?? new Date().toISOString(), ruta, lectura });
  }
  const urls = await firmarMedios(docs.map((d) => d.ruta));
  return docs
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map(({ ruta, ...d }) => ({ ...d, url: urls.get(ruta) ?? null }));
}

export interface PostulacionAnterior {
  id: string;
  fecha_creacion: string;
  estado: string;
  causa_no_contrato: string | null;
}

/**
 * B3: otras postulaciones de la misma persona, por cédula o por teléfono
 * (últimos 10 dígitos), para mostrar que ya había escrito antes.
 */
export async function postulacionesAnteriores(params: { procesoId?: string; cedula?: string | null; telefono?: string | null }): Promise<PostulacionAnterior[]> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") && !canAccess(perms, "comunicaciones")) throw new Error("Sin permisos.");
  const cedula = params.cedula?.trim();
  const digitos = (params.telefono ?? "").replace(/\D/g, "").slice(-10);
  const filtros: string[] = [];
  if (cedula) filtros.push(`cedula.eq.${cedula.replace(/[^0-9A-Za-z]/g, "")}`);
  if (digitos.length >= 7) filtros.push(`celular.ilike.%${digitos.slice(-7)}`);
  if (!filtros.length) return [];
  let q = createAdminClient()
    .from("procesos_contratacion")
    .select("id, fecha_creacion, estado, causa_no_contrato")
    .or(filtros.join(","))
    .order("fecha_creacion", { ascending: false })
    .limit(20);
  if (params.procesoId) q = q.neq("id", params.procesoId);
  const { data } = await q;
  return (data ?? []) as PostulacionAnterior[];
}

export async function deleteProceso(id: string) {
  await assertEditor();
  const admin = createAdminClient();
  const { error } = await admin.from("procesos_contratacion").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/candidatos");
}

export interface ExportFilters {
  q?: string;
  estado?: string;
  medio?: string;
  /** Campo de fecha que segmenta el rango: creacion (por defecto) | citacion. */
  campo?: string;
  desde?: string;
  hasta?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXPORT_MAX = 5000;

/**
 * Filas para la exportación a Excel de la relación de procesos: mismos
 * filtros de la pantalla pero SIN paginar (la tabla pagina de a 50).
 * Solo lectura; requiere acceso al módulo candidatos.
 */
export async function exportarProcesos(
  f: ExportFilters
): Promise<{ rows: Record<string, unknown>[]; error?: string }> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) {
    return { rows: [], error: "Sin permisos para exportar candidatos." };
  }
  const admin = createAdminClient();
  const campo = campoFecha(f.campo);
  let q = admin
    .from("procesos_contratacion")
    .select("*, vacancies(title)")
    .order(campo.columna, { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(EXPORT_MAX);
  if (f.q) {
    const term = f.q.replace(/[%,()]/g, " ").trim();
    if (term) q = q.or(`nombre.ilike.%${term}%,cedula.ilike.%${term}%,celular.ilike.%${term}%`);
  }
  // «Reingresos por revisar»: trabajaron antes en la empresa y siguen en la preselección.
  if (f.estado === FILTRO_REINGRESOS) q = q.eq("reingreso", "true").in("estado", ESTADOS_REVISION_REINGRESO);
  else if (f.estado && f.estado !== "todos") q = q.eq("estado", f.estado);
  if (f.medio && f.medio !== "todos") q = q.eq("medio_postulacion", f.medio);
  if (f.desde && DATE_RE.test(f.desde)) q = q.gte(campo.columna, f.desde);
  if (f.hasta && DATE_RE.test(f.hasta)) q = q.lte(campo.columna, f.hasta);
  const { data, error } = await q;
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as Record<string, unknown>[] };
}
