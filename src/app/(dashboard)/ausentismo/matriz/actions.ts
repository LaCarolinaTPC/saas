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

type Admin = ReturnType<typeof createAdminClient>;

/** Alta y edición exigen el módulo y permiso de edición, en el servidor. */
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

async function logMatriz(entry: {
  registroId: string;
  accion: string;
  anterior?: Record<string, unknown> | null;
  nuevo?: Record<string, unknown> | null;
  userId: string | null;
  userEmail: string | null;
}) {
  try {
    const supabase = createAdminClient();
    await supabase.from("ausentismo_log").insert({
      registro_id: entry.registroId,
      accion: entry.accion,
      datos_anteriores: entry.anterior ?? null,
      datos_nuevos: entry.nuevo ?? null,
      user_id: entry.userId,
      user_email: entry.userEmail,
    });
  } catch (e) {
    console.error("[matriz] no se pudo escribir la bitácora:", e);
  }
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
  id: string; codigo: string | null; nombre: string; activo: boolean; usos: number; ultimo_uso: string | null;
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
    .select("id, codigo, nombre, activo, usos, ultimo_uso")
    .eq("tipo", tipo)
    .ilike(porCodigo ? "codigo" : "nombre", v)
    .limit(1)
    .maybeSingle();
  return (data as CatalogoFila | null) ?? null;
}

/** Exige que el valor exista y esté activo. Devuelve el nombre canónico del catálogo. */
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
async function contarUso(supabase: Admin, fila: CatalogoFila | null, fecha: string) {
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

// ── Momento 1: apertura ──────────────────────────────────────────────────────

export interface AperturaInput {
  cedula: string;
  consecutivo: string | null;
  indicador: string;
  origen: string;
  fechaInicio: string;
  fechaFin: string;
  /** Días perdidos. Si viene vacío se calcula del rango. */
  dias: number | null;
  eps: string | null;
  arl: string | null;
  ips: string | null;
  profesional: string | null;
  tipoConductor: string;
  /** El usuario confirmó registrar aunque se cruce con otra incapacidad. */
  forzarSolape?: boolean;
}

export interface AperturaResultado {
  success: boolean;
  error?: string;
  /** El servidor pide confirmación antes de guardar (solape). */
  requiereConfirmacion?: boolean;
  fila?: MatrizFila;
}

export async function abrirIncapacidad(input: AperturaInput): Promise<AperturaResultado> {
  try {
    const perms = await assertEdicion();
    const supabase = createAdminClient();

    // Empleado: debe existir en el maestro; de ahí salen nombre, cargo y estado.
    const cedula = input.cedula.replace(/\D/g, "");
    if (!cedula) throw new Error("Falta el documento de identidad.");
    const emp = await obtenerEmpleado(supabase, cedula);
    if (!emp) throw new Error("El documento no está en el maestro de conductores ni de empleados.");

    // Fechas.
    if (!FECHA_ISO_RE.test(input.fechaInicio)) throw new Error("Fecha de inicio no válida.");
    if (!FECHA_ISO_RE.test(input.fechaFin)) throw new Error("Fecha fin no válida.");
    if (input.fechaFin < input.fechaInicio) throw new Error("La fecha fin no puede ser anterior al inicio.");
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    if (input.fechaInicio > hoy) throw new Error("La fecha de inicio no puede ser futura.");

    // Días perdidos: calculados; si el usuario escribió otro valor, se respeta.
    const diasCalc = diasEntre(input.fechaInicio, input.fechaFin);
    const dias = input.dias == null || Number.isNaN(input.dias) ? diasCalc : Math.trunc(input.dias);
    if (dias < 1) throw new Error("Los días perdidos deben ser al menos 1.");

    // Indicador y consecutivo.
    const indicador = (input.indicador ?? "").toUpperCase();
    if (indicador !== "INICIAL" && indicador !== "PRORROGA") {
      throw new Error("El indicador debe ser Inicial o Prórroga.");
    }
    let consecutivo = limpio(input.consecutivo);
    if (indicador === "PRORROGA") {
      // Debe existir una incapacidad del mismo empleado que termine el día anterior.
      const { data: previa } = await supabase
        .from("ausentismo")
        .select("id, consecutivo_incapacidad, fecha_inicio, fecha_fin")
        .eq("cedula", cedula)
        .eq("fecha_fin", diaAnterior(input.fechaInicio))
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
      const { data: repetido } = await supabase
        .from("ausentismo")
        .select("id, fecha_inicio")
        .eq("cedula", cedula)
        .eq("consecutivo_incapacidad", consecutivo)
        .eq("indicador_prorroga", "INICIAL")
        .limit(1)
        .maybeSingle();
      if (repetido) {
        throw new Error(`El consecutivo ${consecutivo} ya existe para este empleado (inicio ${repetido.fecha_inicio}).`);
      }
    }

    // Solape con otra incapacidad del mismo empleado: se pide confirmación.
    const { data: cruces } = await supabase
      .from("ausentismo")
      .select("fecha_inicio, fecha_fin, origen")
      .eq("cedula", cedula)
      .lte("fecha_inicio", input.fechaFin)
      .gte("fecha_fin", input.fechaInicio)
      .limit(3);
    if (cruces && cruces.length > 0 && !input.forzarSolape) {
      const detalle = cruces.map((c) => `${c.fecha_inicio} → ${c.fecha_fin} (${c.origen})`).join(", ");
      return {
        success: false,
        requiereConfirmacion: true,
        error: `Se cruza con otra incapacidad del mismo empleado: ${detalle}. ¿Registrar de todos modos? Quedará marcada para revisión.`,
      };
    }

    // Catálogos.
    const origen = await exigirCatalogo(supabase, "ORIGEN", input.origen, "el origen", true);
    const esArl = ORIGENES_ARL.has(origen.valor);
    const eps = limpio(input.eps)
      ? await exigirCatalogo(supabase, "EPS", input.eps, "la EPS")
      : null;
    const arl = esArl
      ? await exigirCatalogo(supabase, "ARL", input.arl, "la ARL")
      : null;
    if (!esArl && !eps) throw new Error("Falta la EPS.");
    const ips = await exigirCatalogo(supabase, "IPS", input.ips, "la IPS");
    const profesional = await exigirCatalogo(supabase, "PROFESIONAL", input.profesional, "el profesional responsable");

    const tipoConductor = (input.tipoConductor || emp.tipo_conductor).toUpperCase();
    if (!(TIPOS_CONDUCTOR as readonly string[]).includes(tipoConductor)) {
      throw new Error("Tipo de conductor no válido.");
    }

    // Duplicado exacto por llave natural.
    const { data: existente } = await supabase
      .from("ausentismo")
      .select("id")
      .eq("cedula", cedula)
      .eq("fecha_inicio", input.fechaInicio)
      .eq("consecutivo_llave", consecutivo ?? "")
      .maybeSingle();
    if (existente) {
      throw new Error("Ya existe una incapacidad de este empleado con esa fecha de inicio y consecutivo.");
    }

    const fila = {
      cedula,
      consecutivo_incapacidad: consecutivo,
      nombre: emp.nombre,
      cargo: emp.cargo,
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
      estado: emp.estado,
      soat: "NO",
      estado_registro: "pendiente",
      origen_registro: "formulario",
      revision: cruces && cruces.length > 0 ? ["solape"] : [],
      abierto_por_email: perms.userEmail,
      source_file: "formulario",
    };

    const { data: insertada, error } = await supabase
      .from("ausentismo")
      .insert(fila)
      .select(MATRIZ_SELECT)
      .single();
    if (error) throw new Error(error.message);
    // El select es una cadena compuesta: el tipado de supabase-js no la interpreta.
    const data = insertada as unknown as MatrizFila;

    await Promise.all([
      contarUso(supabase, origen.fila, input.fechaInicio),
      contarUso(supabase, eps?.fila ?? null, input.fechaInicio),
      contarUso(supabase, arl?.fila ?? null, input.fechaInicio),
      contarUso(supabase, ips.fila, input.fechaInicio),
      contarUso(supabase, profesional.fila, input.fechaInicio),
      logMatriz({
        registroId: data.id,
        accion: "matriz_abierta",
        nuevo: fila,
        userId: perms.userId,
        userEmail: perms.userEmail,
      }),
    ]);

    revalidatePath("/ausentismo");
    return { success: true, fila: data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Momento 2: cierre con el diagnóstico ─────────────────────────────────────

export interface CierreInput {
  id: string;
  cie10: string;
  /** Si viene vacío se toma el DX del catálogo para ese código. */
  dx: string | null;
  /** SI | NO. Solo puede ser SI cuando el origen es AT. */
  soat: string;
  /** Si viene vacío se toma el GRD del catálogo para ese código. */
  grd: string | null;
}

/**
 * Cierra una incapacidad pendiente con CIE10, DX, SOAT y GRD. El código debe
 * existir en el catálogo (el paso 5 permite crearlo desde el selector). Al
 * cerrar, la fila pasa a origen "formulario" aunque haya venido del Excel:
 * así la próxima carga no le devuelve los valores viejos.
 */
export async function cerrarIncapacidad(input: CierreInput): Promise<AperturaResultado> {
  try {
    const perms = await assertEdicion();
    const supabase = createAdminClient();

    const { data: prev, error: readError } = await supabase
      .from("ausentismo")
      .select(MATRIZ_SELECT)
      .eq("id", input.id)
      .single();
    if (readError || !prev) throw new Error("Incapacidad no encontrada.");
    const fila = prev as unknown as MatrizFila;
    if (fila.estado_registro === "cerrado") {
      throw new Error("Esta incapacidad ya está cerrada. Para corregirla usa la edición con motivo.");
    }

    // CIE10: formato y catálogo.
    const codigo = normalizarCie10(input.cie10);
    if (!codigo || !CIE10_RE.test(codigo)) {
      throw new Error("CIE10 no válido. Formato: una letra, dos dígitos y opcionalmente un carácter más (M545, I10X, J00).");
    }
    const cie = await enCatalogo(supabase, "CIE10", codigo, true);
    if (!cie) {
      throw new Error(`El CIE10 ${codigo} no está en el catálogo. Créalo con su diagnóstico antes de cerrar.`);
    }
    if (!cie.activo) throw new Error(`El CIE10 ${codigo} está inactivo.`);

    // DX: el del catálogo salvo que el usuario precise otro texto.
    const dx = limpio(input.dx) ?? cie.nombre;
    if (dx.length < 3) throw new Error("El diagnóstico es demasiado corto.");

    // GRD: el que trae el código, o el que eligió el usuario; siempre del catálogo.
    const { data: cieCompleto } = await supabase
      .from("ausentismo_catalogos")
      .select("relacionado")
      .eq("id", cie.id)
      .single();
    const grdPropuesto = (cieCompleto?.relacionado as string | null) ?? null;
    const grd = await exigirCatalogo(supabase, "GRD", limpio(input.grd) ?? grdPropuesto, "el GRD");

    // SOAT: solo aplica a accidentes de trabajo (tránsito).
    const soat = (input.soat ?? "NO").toUpperCase() === "SI" ? "SI" : "NO";
    if (soat === "SI" && !ORIGENES_SOAT.has(fila.origen ?? "")) {
      throw new Error("SOAT solo aplica cuando el origen es accidente de trabajo (AT).");
    }

    const cambios = {
      cie10: codigo,
      diagnostico: dx,
      soat,
      grd: grd.valor,
      estado_registro: "cerrado",
      cerrado_por_email: perms.userEmail,
      cerrado_at: new Date().toISOString(),
      // Protegida de la carga del Excel a partir de ahora.
      origen_registro: "formulario",
    };

    const { data: actualizada, error } = await supabase
      .from("ausentismo")
      .update(cambios)
      .eq("id", input.id)
      .select(MATRIZ_SELECT)
      .single();
    if (error) throw new Error(error.message);

    const fecha = fila.fecha_inicio ?? new Date().toISOString().slice(0, 10);
    await Promise.all([
      contarUso(supabase, cie, fecha),
      contarUso(supabase, grd.fila, fecha),
      logMatriz({
        registroId: input.id,
        accion: "matriz_cerrada",
        anterior: prev as unknown as Record<string, unknown>,
        nuevo: cambios,
        userId: perms.userId,
        userEmail: perms.userEmail,
      }),
    ]);

    revalidatePath("/ausentismo");
    return { success: true, fila: actualizada as unknown as MatrizFila };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
