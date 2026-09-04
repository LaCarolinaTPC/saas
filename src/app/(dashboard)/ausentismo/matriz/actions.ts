"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import {
  MATRIZ_SELECT, type CatalogoItem, type MatrizFila, type TipoCatalogo,
} from "@/lib/ausentismo/matriz";
import {
  CIE10_RE, FECHA_ISO_RE, ORIGENES_ARL, ORIGENES_SOAT, TIPOS_CONDUCTOR,
  diaAnterior, diaDe, diasEntre, limpio, mesDe, normalizarCie10,
} from "@/lib/ausentismo/matriz-reglas";
import { auditarCatalogoCreado, auditarMatriz } from "@/lib/ausentismo/auditoria";

type Admin = ReturnType<typeof createAdminClient>;

/** Alta, edición y eliminación exigen el módulo y permiso de edición, en el servidor. */
async function assertEdicion() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    throw new Error("No tienes acceso al módulo de Ausentismo.");
  }
  if (!perms.puedeEditar) {
    throw new Error("Tu tipo de usuario no puede registrar en la matriz.");
  }
  return perms;
}

/** Lee una fila completa de la matriz o falla con un mensaje para el usuario. */
async function leerFila(supabase: Admin, id: string): Promise<MatrizFila> {
  const { data, error } = await supabase
    .from("ausentismo")
    .select(MATRIZ_SELECT)
    .eq("id", id)
    .single();
  if (error || !data) throw new Error("Incapacidad no encontrada.");
  // El select es una cadena compuesta: el tipado de supabase-js no la interpreta.
  return data as unknown as MatrizFila;
}

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

// ── Maestro de empleados ─────────────────────────────────────────────────────

export interface EmpleadoMaestro {
  cedula: string;
  nombre: string;
  cargo: string;
  tipo_conductor: string;
  /** ACTIVO | RETIRADO */
  estado: string;
  eps: string | null;
  arl: string | null;
  fuente: "conductores" | "empleados";
}

function desdeConductor(c: {
  cedula: string; nombre: string; tipo_conductor: string | null; estado: string;
  eps: string | null; arl: string | null; reubicado: string | null;
}): EmpleadoMaestro {
  const reubicado = (c.reubicado ?? "").trim().toUpperCase();
  const tipo = (c.tipo_conductor ?? "").trim().toUpperCase();
  return {
    cedula: c.cedula,
    nombre: c.nombre,
    cargo: "CONDUCTOR",
    tipo_conductor:
      reubicado === "SI" || reubicado === "S" ? "REUBICADO" : tipo || "EMPRESA",
    estado: (c.estado ?? "ACTIVO").toUpperCase(),
    eps: limpio(c.eps),
    arl: limpio(c.arl),
    fuente: "conductores",
  };
}

function desdeEmpleado(e: {
  document_number: string; full_name: string; position: string; status: string | null;
  eps: string | null; arl: string | null;
}): EmpleadoMaestro {
  return {
    cedula: e.document_number,
    nombre: e.full_name,
    cargo: (e.position ?? "").toUpperCase(),
    tipo_conductor: "ADMINISTRATIVO",
    estado: e.status === "retirado" ? "RETIRADO" : "ACTIVO",
    eps: limpio(e.eps),
    arl: limpio(e.arl),
    fuente: "empleados",
  };
}

const SEL_CONDUCTOR = "cedula, nombre, tipo_conductor, estado, eps, arl, reubicado";
const SEL_EMPLEADO = "document_number, full_name, position, status, eps, arl";

/**
 * Busca en los dos maestros que sincroniza GEMA: conductores y el resto del
 * personal (employees). En la matriz actual 176 de 206 cédulas son
 * conductores y 19 son empleados; los demás cargos (inspector, auxiliar…)
 * viven en employees.
 */
export async function buscarEmpleado(q: string): Promise<EmpleadoMaestro[]> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) return [];
  const t = q.trim();
  if (t.length < 2) return [];
  const supabase = createAdminClient();
  const numerico = /^\d+$/.test(t);

  let qc = supabase.from("conductores").select(SEL_CONDUCTOR).limit(10);
  let qe = supabase.from("employees").select(SEL_EMPLEADO).not("document_number", "is", null).limit(10);
  if (numerico) {
    qc = qc.like("cedula", `${t}%`);
    qe = qe.like("document_number", `${t}%`);
  } else {
    qc = qc.ilike("nombre", `%${t}%`);
    qe = qe.ilike("full_name", `%${t}%`);
  }
  const [c, e] = await Promise.all([qc.order("nombre"), qe.order("full_name")]);

  const vistos = new Set<string>();
  const out: EmpleadoMaestro[] = [];
  for (const row of c.data ?? []) {
    const m = desdeConductor(row as Parameters<typeof desdeConductor>[0]);
    if (!vistos.has(m.cedula)) { vistos.add(m.cedula); out.push(m); }
  }
  for (const row of e.data ?? []) {
    const m = desdeEmpleado(row as Parameters<typeof desdeEmpleado>[0]);
    if (!vistos.has(m.cedula)) { vistos.add(m.cedula); out.push(m); }
  }
  return out.slice(0, 15);
}

async function obtenerEmpleado(supabase: Admin, cedula: string): Promise<EmpleadoMaestro | null> {
  const { data: c } = await supabase
    .from("conductores").select(SEL_CONDUCTOR).eq("cedula", cedula).maybeSingle();
  if (c) return desdeConductor(c as Parameters<typeof desdeConductor>[0]);
  const { data: e } = await supabase
    .from("employees").select(SEL_EMPLEADO).eq("document_number", cedula).limit(1).maybeSingle();
  if (e) return desdeEmpleado(e as Parameters<typeof desdeEmpleado>[0]);
  return null;
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

interface CatalogoFila {
  id: string; codigo: string | null; nombre: string; relacionado: string | null;
  activo: boolean; usos: number; ultimo_uso: string | null;
}

/** Busca un valor del catálogo por nombre (o por código si `porCodigo`), sin distinguir mayúsculas. */
async function enCatalogo(
  supabase: Admin,
  tipo: TipoCatalogo,
  valor: string,
  porCodigo = false
): Promise<CatalogoFila | null> {
  const v = valor.replace(/[%_]/g, "");
  const { data } = await supabase
    .from("ausentismo_catalogos")
    .select("id, codigo, nombre, relacionado, activo, usos, ultimo_uso")
    .eq("tipo", tipo)
    .ilike(porCodigo ? "codigo" : "nombre", v)
    .limit(1)
    .maybeSingle();
  return (data as CatalogoFila | null) ?? null;
}

/** Exige que el valor exista y esté activo. Devuelve el valor canónico del catálogo. */
async function exigirCatalogo(
  supabase: Admin,
  tipo: TipoCatalogo,
  valor: string | null,
  etiqueta: string,
  porCodigo = false
): Promise<{ fila: CatalogoFila; valor: string }> {
  const v = limpio(valor);
  if (!v) throw new Error(`Falta ${etiqueta}.`);
  const fila = await enCatalogo(supabase, tipo, v, porCodigo);
  if (!fila) {
    throw new Error(`${etiqueta} "${v}" no está en el catálogo. Elígelo de la lista o créalo.`);
  }
  if (!fila.activo) throw new Error(`${etiqueta} "${fila.nombre}" está inactivo.`);
  return { fila, valor: porCodigo ? (fila.codigo ?? v) : fila.nombre };
}

/** Suma un uso al valor del catálogo. Nunca bloquea la operación. */
async function contarUso(supabase: Admin, fila: CatalogoFila | null | undefined, fecha: string) {
  if (!fila) return;
  try {
    await supabase
      .from("ausentismo_catalogos")
      .update({
        usos: (fila.usos ?? 0) + 1,
        ultimo_uso: !fila.ultimo_uso || fila.ultimo_uso < fecha ? fecha : fila.ultimo_uso,
      })
      .eq("id", fila.id);
  } catch {
    // el conteo es informativo
  }
}

// ── Alta en el catálogo desde los selectores ─────────────────────────────────

/** Tipos que se pueden crear desde el formulario. ORIGEN y GRD son listas cerradas. */
export type TipoCreable = "EPS" | "ARL" | "IPS" | "PROFESIONAL" | "CIE10";
const TIPOS_CREABLES: ReadonlySet<string> = new Set(["EPS", "ARL", "IPS", "PROFESIONAL", "CIE10"]);
const SELECT_CATALOGO = "id, tipo, codigo, nombre, relacionado, activo, verificado, usos";

export interface NuevoCatalogoInput {
  tipo: TipoCreable;
  /** EPS/ARL/IPS/PROFESIONAL: el nombre. CIE10: el diagnóstico (DX). */
  nombre: string;
  /** EPS/ARL: NIT o código de la Superintendencia (obligatorio). CIE10: el código. */
  codigo?: string | null;
  /** PROFESIONAL: IPS habitual. CIE10: GRD. */
  relacionado?: string | null;
}

/**
 * Crea un valor del catálogo desde el selector. Lo creado así nace activo
 * pero sin verificar, para que un admin lo confirme después. Si ya existe
 * uno equivalente (mismo nombre sin importar mayúsculas, o mismo código) se
 * devuelve el existente en vez de duplicar.
 */
export async function crearCatalogo(
  input: NuevoCatalogoInput
): Promise<{ success: boolean; error?: string; item?: CatalogoItem; existente?: boolean }> {
  try {
    const perms = await assertEdicion();
    if (!TIPOS_CREABLES.has(input.tipo)) throw new Error("Ese tipo de catálogo no se crea desde aquí.");
    const supabase = createAdminClient();

    const nombre = limpio(input.nombre);
    if (!nombre || nombre.length < 3) throw new Error("El nombre debe tener al menos 3 caracteres.");
    if (nombre.length > 120) throw new Error("El nombre no puede pasar de 120 caracteres.");

    let codigo: string | null = null;
    let relacionado: string | null = null;

    if (input.tipo === "CIE10") {
      codigo = normalizarCie10(input.codigo);
      if (!CIE10_RE.test(codigo)) {
        throw new Error("CIE10 no válido. Formato: letra, dos dígitos y opcional un carácter (M545, I10X).");
      }
      const grd = await exigirCatalogo(supabase, "GRD", input.relacionado ?? null, "el GRD");
      relacionado = grd.valor;
      const existente = await enCatalogo(supabase, "CIE10", codigo, true);
      if (existente) return { success: true, existente: true, item: await leerItem(supabase, existente.id) };
    } else if (input.tipo === "EPS" || input.tipo === "ARL") {
      // Las entidades exigen su código (NIT o código Supersalud) para poder verificarlas.
      codigo = (limpio(input.codigo) ?? "").toUpperCase().replace(/\s/g, "");
      if (!/^[A-Z0-9.-]{3,20}$/.test(codigo)) {
        throw new Error(`Indica el NIT o código de la ${input.tipo} (3 a 20 caracteres, letras y números).`);
      }
      const porCodigo = await enCatalogo(supabase, input.tipo, codigo, true);
      if (porCodigo) return { success: true, existente: true, item: await leerItem(supabase, porCodigo.id) };
    } else if (input.tipo === "PROFESIONAL" && limpio(input.relacionado)) {
      // La IPS habitual solo se guarda si existe en el catálogo.
      const ips = await enCatalogo(supabase, "IPS", limpio(input.relacionado)!);
      relacionado = ips?.nombre ?? null;
    }

    if (input.tipo !== "CIE10") {
      const porNombre = await enCatalogo(supabase, input.tipo, nombre);
      if (porNombre) return { success: true, existente: true, item: await leerItem(supabase, porNombre.id) };
    }

    const { data, error } = await supabase
      .from("ausentismo_catalogos")
      .insert({
        tipo: input.tipo,
        codigo,
        nombre,
        relacionado,
        activo: true,
        verificado: false,
        usos: 0,
        created_by_email: perms.userEmail,
      })
      .select(SELECT_CATALOGO)
      .single();
    if (error) {
      // El índice único ignora tildes y mayúsculas: hay uno equivalente.
      if (error.code === "23505") {
        throw new Error(`Ya existe "${nombre}" en el catálogo con otra escritura (tildes o mayúsculas). Búscalo en la lista.`);
      }
      throw new Error(error.message);
    }

    await auditarCatalogoCreado({ tipo: input.tipo, nombre, codigo, relacionado }, perms.userType);
    revalidatePath("/ausentismo");
    return { success: true, item: data as unknown as CatalogoItem };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function leerItem(supabase: Admin, id: string): Promise<CatalogoItem> {
  const { data, error } = await supabase
    .from("ausentismo_catalogos")
    .select(SELECT_CATALOGO)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as CatalogoItem;
}

// ── Datos administrativos (momento 1), compartidos por apertura y edición ───

export interface AdministrativosInput {
  consecutivo: string | null;
  indicador: string;
  origen: string;
  fechaInicio: string;
  fechaFin: string;
  /** Días perdidos. Se calculan de las fechas; si viene un valor distinto se rechaza. */
  dias: number | null;
  eps: string | null;
  arl: string | null;
  ips: string | null;
  profesional: string | null;
  tipoConductor: string;
}

interface Cruce { fecha_inicio: string; fecha_fin: string; origen: string | null }

type Preparado =
  | {
      ok: true;
      campos: Record<string, unknown>;
      usados: CatalogoFila[];
      cruces: Cruce[];
      /**
       * Id de una fila eliminada lógicamente con la misma llave natural. La
       * llave sigue ocupada en la base, así que en vez de insertar se
       * reutiliza esa fila (queda restaurada con los datos nuevos).
       */
      reutilizarId: string | null;
    }
  | { ok: false; requiereConfirmacion: true; error: string };

/**
 * Valida los datos administrativos contra las reglas y el catálogo y arma
 * las columnas a guardar. `excluirId` deja fuera la propia fila cuando se
 * edita. Las filas eliminadas lógicamente no cuentan en ninguna comprobación.
 * Si hay solape y no se forzó, devuelve la petición de confirmación.
 */
async function prepararAdministrativos(
  supabase: Admin,
  cedula: string,
  input: AdministrativosInput,
  opts: { excluirId?: string | null; forzarSolape?: boolean }
): Promise<Preparado> {
  // Fechas.
  if (!FECHA_ISO_RE.test(input.fechaInicio)) throw new Error("Fecha de inicio no válida.");
  if (!FECHA_ISO_RE.test(input.fechaFin)) throw new Error("Fecha fin no válida.");
  if (input.fechaFin < input.fechaInicio) throw new Error("La fecha fin no puede ser anterior al inicio.");
  if (input.fechaInicio > hoyBogota()) throw new Error("La fecha de inicio no puede ser futura.");

  // Días perdidos: siempre los días calendario entre inicio y fin, ambos
  // incluidos. Si el cliente mandó otro valor se rechaza: los días no se
  // digitan, se calculan de las fechas (la base lo vuelve a comprobar).
  const dias = diasEntre(input.fechaInicio, input.fechaFin);
  if (dias < 1) throw new Error("Los días perdidos deben ser al menos 1.");
  if (input.dias != null && !Number.isNaN(input.dias) && Math.trunc(input.dias) !== dias) {
    throw new Error(
      `Los días no coinciden con las fechas: del ${input.fechaInicio} al ${input.fechaFin} son ${dias} día${dias === 1 ? "" : "s"}, no ${Math.trunc(input.dias)}.`
    );
  }

  // Al editar, la propia fila no cuenta en las comprobaciones.
  const excluirId = opts.excluirId ?? null;

  // Indicador y consecutivo.
  const indicador = (input.indicador ?? "").toUpperCase();
  if (indicador !== "INICIAL" && indicador !== "PRORROGA") {
    throw new Error("El indicador debe ser Inicial o Prórroga.");
  }
  let consecutivo = limpio(input.consecutivo);
  if (indicador === "PRORROGA") {
    // Debe existir una incapacidad del mismo empleado que termine el día anterior.
    let qPrevia = supabase
      .from("ausentismo")
      .select("id, consecutivo_incapacidad, fecha_inicio, fecha_fin")
      .eq("cedula", cedula)
      .is("eliminado_at", null)
      .eq("fecha_fin", diaAnterior(input.fechaInicio));
    if (excluirId) qPrevia = qPrevia.neq("id", excluirId);
    const { data: previa } = await qPrevia
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!previa) {
      throw new Error(
        `Una prórroga exige una incapacidad previa del mismo empleado que termine el ${diaAnterior(input.fechaInicio)}. No hay ninguna registrada.`
      );
    }
    // La prórroga hereda el consecutivo de la incapacidad que prolonga.
    consecutivo = consecutivo ?? previa.consecutivo_incapacidad ?? null;
    if (!consecutivo) throw new Error("La prórroga necesita el consecutivo de la incapacidad.");
  } else if (consecutivo) {
    // Un consecutivo inicial no se repite para el mismo empleado.
    let qRepetido = supabase
      .from("ausentismo")
      .select("id, fecha_inicio")
      .eq("cedula", cedula)
      .is("eliminado_at", null)
      .eq("consecutivo_incapacidad", consecutivo)
      .eq("indicador_prorroga", "INICIAL");
    if (excluirId) qRepetido = qRepetido.neq("id", excluirId);
    const { data: repetido } = await qRepetido.limit(1).maybeSingle();
    if (repetido) {
      throw new Error(`El consecutivo ${consecutivo} ya existe para este empleado (inicio ${repetido.fecha_inicio}).`);
    }
  }

  // Solape con otra incapacidad del mismo empleado: se pide confirmación.
  let qCruces = supabase
    .from("ausentismo")
    .select("fecha_inicio, fecha_fin, origen")
    .eq("cedula", cedula)
    .is("eliminado_at", null)
    .lte("fecha_inicio", input.fechaFin)
    .gte("fecha_fin", input.fechaInicio);
  if (excluirId) qCruces = qCruces.neq("id", excluirId);
  const { data: crucesData } = await qCruces.limit(3);
  const cruces = (crucesData ?? []) as Cruce[];
  if (cruces.length > 0 && !opts.forzarSolape) {
    const detalle = cruces.map((c) => `${c.fecha_inicio} → ${c.fecha_fin} (${c.origen})`).join(", ");
    return {
      ok: false,
      requiereConfirmacion: true,
      error: `Se cruza con otra incapacidad del mismo empleado: ${detalle}. ¿Guardar de todos modos? Quedará marcada para revisión.`,
    };
  }

  // Catálogos.
  const origen = await exigirCatalogo(supabase, "ORIGEN", input.origen, "el origen", true);
  const esArl = ORIGENES_ARL.has(origen.valor);
  const eps = limpio(input.eps) ? await exigirCatalogo(supabase, "EPS", input.eps, "la EPS") : null;
  const arl = esArl ? await exigirCatalogo(supabase, "ARL", input.arl, "la ARL") : null;
  if (!esArl && !eps) throw new Error("Falta la EPS.");
  const ips = await exigirCatalogo(supabase, "IPS", input.ips, "la IPS");
  const profesional = await exigirCatalogo(supabase, "PROFESIONAL", input.profesional, "el profesional responsable");

  const tipoConductor = (input.tipoConductor ?? "").toUpperCase();
  if (!(TIPOS_CONDUCTOR as readonly string[]).includes(tipoConductor)) {
    throw new Error("Tipo de conductor no válido.");
  }

  // Duplicado exacto por llave natural. Si la que ocupa la llave está
  // eliminada lógicamente, se reutiliza en vez de rechazar.
  let qExistente = supabase
    .from("ausentismo")
    .select("id, eliminado_at")
    .eq("cedula", cedula)
    .eq("fecha_inicio", input.fechaInicio)
    .eq("consecutivo_llave", consecutivo ?? "");
  if (excluirId) qExistente = qExistente.neq("id", excluirId);
  const { data: existente } = await qExistente.maybeSingle();
  if (existente && !existente.eliminado_at) {
    throw new Error("Ya existe una incapacidad de este empleado con esa fecha de inicio y consecutivo.");
  }

  return {
    ok: true,
    reutilizarId: existente?.id ?? null,
    cruces,
    usados: [origen.fila, eps?.fila, arl?.fila, ips.fila, profesional.fila].filter(Boolean) as CatalogoFila[],
    campos: {
      consecutivo_incapacidad: consecutivo,
      indicador_prorroga: indicador,
      dias_it_pagados: dias,
      origen: origen.valor,
      fecha_inicio: input.fechaInicio,
      fecha_fin: input.fechaFin,
      mes_inicio: mesDe(input.fechaInicio),
      dia_ocurrencia: diaDe(input.fechaInicio),
      // `eps` conserva el pagador como en el Excel: la ARL cuando es AT/EL.
      eps: eps?.valor ?? arl?.valor ?? null,
      arl: arl?.valor ?? null,
      ips: ips.valor,
      profesional_responsable: profesional.valor,
      tipo_conductor: tipoConductor,
    },
  };
}

// ── Diagnóstico (momento 2), compartido por cierre y edición ────────────────

export interface DiagnosticoInput {
  cie10: string;
  /** Si viene vacío se toma el DX del catálogo para ese código. */
  dx: string | null;
  /** SI | NO. Solo puede ser SI cuando el origen es AT. */
  soat: string;
  /** Si viene vacío se toma el GRD del catálogo para ese código. */
  grd: string | null;
}

async function prepararDiagnostico(
  supabase: Admin,
  origen: string | null,
  input: DiagnosticoInput
): Promise<{ campos: Record<string, unknown>; usados: CatalogoFila[] }> {
  const codigo = normalizarCie10(input.cie10);
  if (!codigo || !CIE10_RE.test(codigo)) {
    throw new Error("CIE10 no válido. Formato: una letra, dos dígitos y opcionalmente un carácter más (M545, I10X, J00).");
  }
  const cie = await enCatalogo(supabase, "CIE10", codigo, true);
  if (!cie) {
    throw new Error(`El CIE10 ${codigo} no está en el catálogo. Créalo con su diagnóstico antes de cerrar.`);
  }
  if (!cie.activo) throw new Error(`El CIE10 ${codigo} está inactivo.`);

  const dx = limpio(input.dx) ?? cie.nombre;
  if (dx.length < 3) throw new Error("El diagnóstico es demasiado corto.");

  const grd = await exigirCatalogo(supabase, "GRD", limpio(input.grd) ?? cie.relacionado, "el GRD");

  const soat = (input.soat ?? "NO").toUpperCase() === "SI" ? "SI" : "NO";
  if (soat === "SI" && !ORIGENES_SOAT.has(origen ?? "")) {
    throw new Error("SOAT solo aplica cuando el origen es accidente de trabajo (AT).");
  }

  return {
    usados: [cie, grd.fila],
    campos: { cie10: codigo, diagnostico: dx, soat, grd: grd.valor },
  };
}

// ── Registro completo (datos administrativos + diagnóstico) ──────────────────

export interface RegistroInput extends AdministrativosInput {
  cedula: string;
  /** Obligatorio: la incapacidad se registra completa y nace cerrada. */
  diagnostico: DiagnosticoInput;
  /** El usuario confirmó registrar aunque se cruce con otra incapacidad. */
  forzarSolape?: boolean;
}

export interface MatrizResultado {
  success: boolean;
  error?: string;
  /** El servidor pide confirmación antes de guardar (solape). */
  requiereConfirmacion?: boolean;
  fila?: MatrizFila;
}

/**
 * Registra una incapacidad completa en un solo paso: datos administrativos y
 * diagnóstico (CIE10, DX, SOAT, GRD). La fila nace cerrada y protegida de la
 * carga del Excel. Si la llave natural la ocupa una fila eliminada
 * lógicamente, esa fila se reutiliza (queda restaurada con los datos nuevos).
 */
export async function registrarIncapacidad(input: RegistroInput): Promise<MatrizResultado> {
  try {
    const perms = await assertEdicion();
    const supabase = createAdminClient();

    // Empleado: debe existir en el maestro; de ahí salen nombre, cargo y estado.
    const cedula = input.cedula.replace(/\D/g, "");
    if (!cedula) throw new Error("Falta el documento de identidad.");
    const emp = await obtenerEmpleado(supabase, cedula);
    if (!emp) throw new Error("El documento no está en el maestro de conductores ni de empleados.");

    const prep = await prepararAdministrativos(
      supabase,
      cedula,
      { ...input, tipoConductor: input.tipoConductor || emp.tipo_conductor },
      { forzarSolape: input.forzarSolape }
    );
    if (!prep.ok) return { success: false, requiereConfirmacion: true, error: prep.error };

    const diag = await prepararDiagnostico(supabase, prep.campos.origen as string, input.diagnostico);

    const ahora = new Date().toISOString();
    const fila: Record<string, unknown> = {
      cedula,
      nombre: emp.nombre,
      cargo: emp.cargo,
      estado: emp.estado,
      ...prep.campos,
      ...diag.campos,
      estado_registro: "cerrado",
      origen_registro: "formulario",
      revision: prep.cruces.length > 0 ? ["solape"] : [],
      abierto_por_email: perms.userEmail,
      cerrado_por_email: perms.userEmail,
      cerrado_at: ahora,
      source_file: "formulario",
    };

    let anterior: MatrizFila | null = null;
    let guardada: MatrizFila;
    if (prep.reutilizarId) {
      // La fila eliminada se restaura con los datos nuevos; se limpia el rastro
      // de la eliminación y de modificaciones anteriores.
      anterior = await leerFila(supabase, prep.reutilizarId);
      const { data, error } = await supabase
        .from("ausentismo")
        .update({
          ...fila,
          eliminado_at: null,
          eliminado_por_email: null,
          motivo_eliminacion: null,
          modificado_por_email: null,
          motivo_modificacion: null,
        })
        .eq("id", prep.reutilizarId)
        .select(MATRIZ_SELECT)
        .single();
      if (error) throw new Error(error.message);
      guardada = data as unknown as MatrizFila;
    } else {
      const { data, error } = await supabase
        .from("ausentismo")
        .insert(fila)
        .select(MATRIZ_SELECT)
        .single();
      if (error) throw new Error(error.message);
      guardada = data as unknown as MatrizFila;
    }

    await Promise.all([
      ...prep.usados.map((u) => contarUso(supabase, u, input.fechaInicio)),
      ...diag.usados.map((u) => contarUso(supabase, u, input.fechaInicio)),
      auditarMatriz({
        accion: "incapacidad_registrada",
        registroId: guardada.id,
        anterior,
        nuevo: guardada,
        extra: {
          solape_confirmado: prep.cruces.length > 0,
          reutilizo_eliminada: !!prep.reutilizarId,
        },
        userId: perms.userId,
        userEmail: perms.userEmail,
        rol: perms.userType,
      }),
    ]);

    revalidatePath("/ausentismo");
    return { success: true, fila: guardada };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Edición con motivo ───────────────────────────────────────────────────────

export interface EdicionInput extends AdministrativosInput {
  id: string;
  /** Obligatorio: por qué se modifica el registro. */
  motivo: string;
  /** Obligatorio: al guardar, el registro queda cerrado con este diagnóstico. */
  diagnostico: DiagnosticoInput;
  forzarSolape?: boolean;
}

/**
 * Modifica cualquier incapacidad, venga del Excel o del formulario, incluidas
 * las que el Excel dejó pendientes de diagnóstico: al guardar quedan
 * cerradas. Exige motivo, guarda quién la modificó y la pasa a origen
 * "formulario" para que la carga del Excel no la pise. El empleado no se
 * cambia: si el documento está mal, se elimina y se registra otra.
 */
export async function editarIncapacidad(input: EdicionInput): Promise<MatrizResultado> {
  try {
    const perms = await assertEdicion();
    const motivo = limpio(input.motivo);
    if (!motivo) throw new Error("Indica el motivo de la modificación.");
    if (motivo.length > 200) throw new Error("El motivo no puede pasar de 200 caracteres.");
    const supabase = createAdminClient();

    const fila = await leerFila(supabase, input.id);
    if (fila.eliminado_at) {
      throw new Error("Esta incapacidad está eliminada. Restáurala antes de modificarla.");
    }

    // Nombre, cargo y estado se refrescan del maestro si el empleado sigue
    // allí; las filas viejas sin maestro conservan lo que traían.
    const emp = await obtenerEmpleado(supabase, fila.cedula);

    const prep = await prepararAdministrativos(
      supabase,
      fila.cedula,
      { ...input, tipoConductor: input.tipoConductor || fila.tipo_conductor || emp?.tipo_conductor || "EMPRESA" },
      { excluirId: fila.id, forzarSolape: input.forzarSolape }
    );
    if (!prep.ok) return { success: false, requiereConfirmacion: true, error: prep.error };

    const diag = await prepararDiagnostico(supabase, prep.campos.origen as string, input.diagnostico);

    // La marca de solape se recalcula; las demás (prórroga sin previa,
    // duplicado retirado) se conservan para que RRHH las revise.
    const revision = fila.revision.filter((m) => m !== "solape");
    if (prep.cruces.length > 0) revision.push("solape");

    const yaCerrada = fila.estado_registro === "cerrado";
    const cambios: Record<string, unknown> = {
      ...prep.campos,
      ...diag.campos,
      nombre: emp?.nombre ?? fila.nombre,
      cargo: emp?.cargo ?? fila.cargo,
      estado: emp?.estado ?? fila.estado,
      revision,
      estado_registro: "cerrado",
      cerrado_por_email: yaCerrada ? fila.cerrado_por_email : perms.userEmail,
      cerrado_at: yaCerrada ? fila.cerrado_at : new Date().toISOString(),
      modificado_por_email: perms.userEmail,
      motivo_modificacion: motivo,
      origen_registro: "formulario",
    };

    const { data: actualizada, error } = await supabase
      .from("ausentismo")
      .update(cambios)
      .eq("id", input.id)
      .select(MATRIZ_SELECT)
      .single();
    if (error) throw new Error(error.message);
    const nueva = actualizada as unknown as MatrizFila;

    const fecha = input.fechaInicio;
    await Promise.all([
      ...prep.usados.map((u) => contarUso(supabase, u, fecha)),
      ...diag.usados.map((u) => contarUso(supabase, u, fecha)),
      auditarMatriz({
        accion: "incapacidad_editada",
        registroId: input.id,
        anterior: fila,
        nuevo: nueva,
        motivo,
        extra: { cerro_pendiente: !yaCerrada, solape_confirmado: prep.cruces.length > 0 },
        userId: perms.userId,
        userEmail: perms.userEmail,
        rol: perms.userType,
      }),
    ]);

    revalidatePath("/ausentismo");
    return { success: true, fila: nueva };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Eliminación lógica y restauración ────────────────────────────────────────

/**
 * Elimina una incapacidad registrada por error. Es una eliminación lógica: la
 * fila queda marcada, sale de la matriz, los indicadores y las exportaciones,
 * la carga del Excel no la vuelve a traer y se puede restaurar. Exige motivo.
 */
export async function eliminarIncapacidad(input: { id: string; motivo: string }): Promise<MatrizResultado> {
  try {
    const perms = await assertEdicion();
    const motivo = limpio(input.motivo);
    if (!motivo) throw new Error("Indica el motivo de la eliminación.");
    if (motivo.length > 200) throw new Error("El motivo no puede pasar de 200 caracteres.");
    const supabase = createAdminClient();

    const fila = await leerFila(supabase, input.id);
    if (fila.eliminado_at) throw new Error("Esta incapacidad ya está eliminada.");

    const { data, error } = await supabase
      .from("ausentismo")
      .update({
        eliminado_at: new Date().toISOString(),
        eliminado_por_email: perms.userEmail,
        motivo_eliminacion: motivo,
      })
      .eq("id", input.id)
      .select(MATRIZ_SELECT)
      .single();
    if (error) throw new Error(error.message);
    const nueva = data as unknown as MatrizFila;

    await auditarMatriz({
      accion: "incapacidad_eliminada",
      registroId: input.id,
      anterior: fila,
      nuevo: nueva,
      motivo,
      userId: perms.userId,
      userEmail: perms.userEmail,
      rol: perms.userType,
    });

    revalidatePath("/ausentismo");
    return { success: true, fila: nueva };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Deshace una eliminación: la fila vuelve a la matriz tal como estaba. */
export async function restaurarIncapacidad(input: { id: string; motivo?: string | null }): Promise<MatrizResultado> {
  try {
    const perms = await assertEdicion();
    const motivo = limpio(input.motivo);
    if (motivo && motivo.length > 200) throw new Error("El motivo no puede pasar de 200 caracteres.");
    const supabase = createAdminClient();

    const fila = await leerFila(supabase, input.id);
    if (!fila.eliminado_at) throw new Error("Esta incapacidad no está eliminada.");

    const { data, error } = await supabase
      .from("ausentismo")
      .update({
        eliminado_at: null,
        eliminado_por_email: null,
        motivo_eliminacion: null,
        modificado_por_email: perms.userEmail,
        motivo_modificacion: motivo ? `Restaurada: ${motivo}` : "Restaurada tras eliminación",
      })
      .eq("id", input.id)
      .select(MATRIZ_SELECT)
      .single();
    if (error) throw new Error(error.message);
    const nueva = data as unknown as MatrizFila;

    await auditarMatriz({
      accion: "incapacidad_restaurada",
      registroId: input.id,
      anterior: fila,
      nuevo: nueva,
      motivo,
      extra: { eliminada_por: fila.eliminado_por_email, motivo_eliminacion: fila.motivo_eliminacion },
      userId: perms.userId,
      userEmail: perms.userEmail,
      rol: perms.userType,
    });

    revalidatePath("/ausentismo");
    return { success: true, fila: nueva };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
