"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getConceptos,
  getHistoricoReincidencias,
  type HistoricoReincidencias,
} from "@/lib/ausentismo/data";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import {
  CONTACTO_KEYS,
  SOPORTE_KEYS,
  DIAS_DESCARGOS,
  DIAS_TERMINACION,
  NIVEL_ALERTA_LABEL,
  claveDesdeNombre,
  conceptoLabels,
  esNotificable,
  type Concepto,
  type Notificacion,
} from "@/lib/ausentismo/constants";
import { describirPeriodo, seCruzan, type RegistroConPeriodo } from "@/lib/ausentismo/periodos";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLAVE_RE = /^[a-z0-9_]{1,40}$/;

type Admin = ReturnType<typeof createAdminClient>;

/** Todas las acciones exigen el módulo en el servidor (no solo en la UI). */
async function assertAusentismo() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    throw new Error("No tienes acceso al módulo de Ausentismo.");
  }
  return perms;
}

/**
 * Bitácora del módulo: cualquier creación, edición o eliminación deja rastro
 * con el antes/después y quién lo hizo. Nunca bloquea la operación.
 */
async function logAusentismo(entry: {
  registroId: string;
  accion: "creado" | "editado" | "eliminado";
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
    console.error("[ausentismo] no se pudo escribir la bitácora:", e);
  }
}

export interface RegistroInput {
  fecha: string;
  cedula: string;
  codigo: string | null;
  nombre: string;
  telefono: string | null;
  tipo: string;
  contacto: string | null;
  justificacion: string | null;
  incapacidadInicio: string | null;
  incapacidadFin: string | null;
  reintegro: string | null;
  soporte: string;
  /** Solo tiene sentido cuando `soporte` no es "no_aplica". */
  soporteObservaciones: string | null;
  /** `vehiculos.codigo` del maestro GEMA; opcional. */
  codigoVehiculo: string | null;
  /** Rango de la ausencia. El inicio es obligatorio; el fin puede quedar abierto. */
  fechaInicio: string;
  fechaFin: string | null;
  /** Solo en edición: por qué se modifica el registro. Obligatorio al editar. */
  motivoModificacion?: string | null;
}

/**
 * Un concepto que cubre rango (vacaciones) necesita las dos fechas: son las
 * que presentan al ausente cada día. Y su día operativo es siempre el inicio
 * del periodo, para que la fila no quede escondida fuera de su propio rango.
 */
function validar(input: RegistroInput, concepto: Concepto) {
  if (!FECHA_RE.test(input.fecha)) throw new Error("Fecha no válida.");
  const cedula = input.cedula.replace(/\D/g, "");
  if (!cedula) throw new Error("Falta la cédula del conductor.");
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("Falta el nombre del conductor.");
  // La existencia del concepto se comprueba contra el catálogo (assertConcepto).
  if (!CLAVE_RE.test(input.tipo)) throw new Error("Tipo de ausencia no válido.");
  if (input.contacto && !CONTACTO_KEYS.has(input.contacto)) {
    throw new Error("Detalle de contacto no válido.");
  }
  if (!SOPORTE_KEYS.has(input.soporte)) throw new Error("Soporte no válido.");
  if (!FECHA_RE.test(input.fechaInicio)) {
    throw new Error("Fecha de inicio del reporte no válida.");
  }
  for (const [campo, v] of [
    ["fin del reporte", input.fechaFin],
    ["inicio de incapacidad", input.incapacidadInicio],
    ["fin de incapacidad", input.incapacidadFin],
    ["reintegro", input.reintegro],
  ] as const) {
    if (v && !FECHA_RE.test(v)) throw new Error(`Fecha de ${campo} no válida.`);
  }
  if (input.fechaFin && input.fechaFin < input.fechaInicio) {
    throw new Error("La fecha final del reporte no puede ser antes de la inicial.");
  }
  if (concepto.cubre_rango && !input.fechaFin) {
    throw new Error(
      `${concepto.nombre} necesita fecha de terminación: es la que presenta al ausente cada día del periodo.`
    );
  }
  if (
    input.incapacidadInicio &&
    input.incapacidadFin &&
    input.incapacidadFin < input.incapacidadInicio
  ) {
    throw new Error("El fin de la incapacidad no puede ser antes del inicio.");
  }
  const codigoVehiculo = input.codigoVehiculo?.trim() || null;
  if (codigoVehiculo && !/^[A-Za-z0-9-]{1,20}$/.test(codigoVehiculo)) {
    throw new Error("Código de vehículo no válido.");
  }
  return {
    // En un concepto que cubre rango, el día operativo es el inicio.
    fecha: concepto.cubre_rango ? input.fechaInicio : input.fecha,
    cedula,
    codigo: input.codigo?.trim() || null,
    nombre,
    telefono: input.telefono?.trim() || null,
    tipo: input.tipo,
    contacto: input.contacto || null,
    justificacion: input.justificacion?.trim() || null,
    incapacidad_inicio: input.incapacidadInicio || null,
    incapacidad_fin: input.incapacidadFin || null,
    reintegro: input.reintegro || null,
    soporte: input.soporte,
    // Sin soporte no hay nada que observar: se descarta lo que haya quedado
    // escrito antes de cambiar el selector.
    soporte_observaciones:
      input.soporte !== "no_aplica"
        ? input.soporteObservaciones?.trim() || null
        : null,
    codigo_vehiculo: codigoVehiculo,
    fecha_inicio: input.fechaInicio,
    fecha_fin: input.fechaFin || null,
  };
}

const SELECT_CONCEPTO = "key, nombre, orden, activo, cuenta_reincidencia, exige_soporte, cubre_rango";

/**
 * El concepto debe existir en el catálogo. Al crear se exige que esté activo;
 * al editar se tolera uno inactivo solo si el registro ya lo tenía (así una
 * edición de otro campo no obliga a reclasificar). Se devuelve entero porque
 * `cubre_rango` cambia la validación de las fechas.
 */
async function leerConcepto(
  supabase: Admin,
  tipo: string,
  opts: { permitirInactivoSi?: string | null } = {}
): Promise<Concepto> {
  if (!CLAVE_RE.test(tipo)) throw new Error("Tipo de ausencia no válido.");
  const { data } = await supabase
    .from("ausentismo_conceptos")
    .select(SELECT_CONCEPTO)
    .eq("key", tipo)
    .maybeSingle();
  if (!data) throw new Error("El tipo de ausencia no existe en el catálogo.");
  if (!data.activo && opts.permitirInactivoSi !== tipo) {
    throw new Error("Ese tipo de ausencia está inactivo. Elige otro.");
  }
  return data as Concepto;
}

// ── Periodos que ya ocupan al conductor ──────────────────────────────────────

/** Lo que el formulario necesita saber de un periodo que estorba. */
export interface PeriodoVecino extends RegistroConPeriodo {
  id: string;
}

/**
 * Periodos vigentes del conductor (conceptos con `cubre_rango`) que se cruzan
 * con las fechas que se van a guardar. Es lo que evita que a alguien de
 * vacaciones se le agregue otra novedad día tras día.
 *
 * `fecha_fin` nulo solo lo traen registros anteriores a esta regla; cubren un
 * único día y `seCruzan` los trata así.
 */
async function periodosQueCruzan(
  supabase: Admin,
  cedula: string,
  fechaInicio: string,
  fechaFin: string | null,
  excluirId: string | null
): Promise<PeriodoVecino[]> {
  const { data: catalogo } = await supabase
    .from("ausentismo_conceptos")
    .select("key")
    .eq("cubre_rango", true);
  const claves = (catalogo ?? []).map((c) => c.key as string);
  if (claves.length === 0) return [];

  const fin = fechaFin ?? fechaInicio;
  let q = supabase
    .from("ausentismo_registros")
    .select("id, fecha, tipo, fecha_inicio, fecha_fin")
    .eq("cedula", cedula)
    .in("tipo", claves)
    .lte("fecha_inicio", fin)
    .or(`fecha_fin.gte.${fechaInicio},fecha_fin.is.null`)
    .order("fecha_inicio")
    .limit(20);
  if (excluirId) q = q.neq("id", excluirId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as PeriodoVecino[]).filter((p) =>
    seCruzan(
      { inicio: p.fecha_inicio ?? p.fecha, fin: p.fecha_fin },
      { inicio: fechaInicio, fin }
    )
  );
}

/**
 * Comprueba los cruces antes de guardar. Repetir el mismo concepto sobre las
 * mismas fechas se rechaza siempre: es el registro que ya existe y hay que
 * editarlo. Un concepto distinto (se incapacitó estando de vacaciones, renunció)
 * sí puede convivir, pero se pide confirmación.
 */
async function revisarPeriodos(
  supabase: Admin,
  fila: { cedula: string; tipo: string; fecha_inicio: string; fecha_fin: string | null },
  excluirId: string | null,
  forzarCruce: boolean
): Promise<{ ok: true; cruces: PeriodoVecino[] } | { ok: false; error: string; periodos: PeriodoVecino[] }> {
  const cruces = await periodosQueCruzan(
    supabase, fila.cedula, fila.fecha_inicio, fila.fecha_fin, excluirId
  );
  if (cruces.length === 0) return { ok: true, cruces };

  const labels = conceptoLabels(await getConceptos());
  const describir = (ps: PeriodoVecino[]) => ps.map((p) => describirPeriodo(p, labels)).join("; ");

  const mismos = cruces.filter((p) => p.tipo === fila.tipo);
  if (mismos.length > 0) {
    throw new Error(
      `Este conductor ya tiene ${describir(mismos)}. No se registra otra vez: ` +
        "edita ese periodo si hay que corregir las fechas."
    );
  }
  if (!forzarCruce) {
    return {
      ok: false,
      error:
        `Este conductor está en ${describir(cruces)}. ` +
        "Confirma si de todos modos hay que registrar esta novedad dentro del periodo.",
      periodos: cruces,
    };
  }
  return { ok: true, cruces };
}

/**
 * Consulta previa desde el formulario: en cuanto hay conductor y fechas, avisa
 * que ya está en un periodo, antes de llenar el resto y pulsar Guardar.
 */
export async function periodosDelConductor(input: {
  cedula: string;
  fechaInicio: string;
  fechaFin: string | null;
  excluirId?: string | null;
}): Promise<PeriodoVecino[]> {
  try {
    await assertAusentismo();
    const cedula = input.cedula.replace(/\D/g, "");
    if (!cedula || !FECHA_RE.test(input.fechaInicio)) return [];
    if (input.fechaFin && !FECHA_RE.test(input.fechaFin)) return [];
    return await periodosQueCruzan(
      createAdminClient(), cedula, input.fechaInicio, input.fechaFin ?? null, input.excluirId ?? null
    );
  } catch {
    // El aviso es una ayuda: si falla, el guardado vuelve a comprobarlo.
    return [];
  }
}

/**
 * El vehículo debe existir en el maestro que sincroniza GEMA. No se exige que
 * siga activo: un registro de hace meses puede apuntar a una buseta ya retirada.
 */
async function assertVehiculo(supabase: Admin, codigo: string | null) {
  if (!codigo) return;
  const { data } = await supabase
    .from("vehiculos")
    .select("codigo")
    .eq("codigo", codigo)
    .maybeSingle();
  if (!data) throw new Error("El vehículo no existe en el maestro de Gestivo.");
}

/**
 * Resultado de guardar. `requiereConfirmacion` es el cruce con un periodo de
 * otro concepto: la pantalla lo muestra y reenvía con `forzarCruce`.
 */
export interface GuardarResultado {
  success: boolean;
  error?: string;
  requiereConfirmacion?: boolean;
  periodos?: PeriodoVecino[];
}

/** Opciones del guardado; hoy solo la confirmación del cruce con un periodo. */
export interface GuardarOpciones {
  forzarCruce?: boolean;
}

export async function crearRegistro(
  input: RegistroInput,
  opts: GuardarOpciones = {}
): Promise<GuardarResultado> {
  try {
    const perms = await assertAusentismo();
    const supabase = createAdminClient();
    const concepto = await leerConcepto(supabase, input.tipo);
    const fila = validar(input, concepto);
    await assertVehiculo(supabase, fila.codigo_vehiculo);

    // Evita el doble registro del mismo conductor el mismo día.
    const { data: existente } = await supabase
      .from("ausentismo_registros")
      .select("id")
      .eq("fecha", fila.fecha)
      .eq("cedula", fila.cedula)
      .maybeSingle();
    if (existente) {
      return {
        success: false,
        error: "Este conductor ya tiene un registro en esa fecha. Edítalo en la lista.",
      };
    }

    // Y el doble registro dentro de un periodo ya abierto (vacaciones).
    const revision = await revisarPeriodos(supabase, fila, null, opts.forzarCruce === true);
    if (!revision.ok) {
      return { success: false, error: revision.error, requiereConfirmacion: true, periodos: revision.periodos };
    }

    // El buscador no trae teléfono: se completa del maestro de conductores.
    if (!fila.telefono) {
      const { data: cond } = await supabase
        .from("conductores")
        .select("celular, telefono")
        .eq("cedula", fila.cedula)
        .maybeSingle();
      fila.telefono = cond?.celular || cond?.telefono || null;
    }

    const { data, error } = await supabase
      .from("ausentismo_registros")
      .insert({
        ...fila,
        created_by: perms.userId,
        created_by_email: perms.userEmail,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logAusentismo({
      registroId: data.id,
      accion: "creado",
      nuevo: fila,
      userId: perms.userId,
      userEmail: perms.userEmail,
    });

    revalidatePath("/ausentismo");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function actualizarRegistro(
  id: string,
  input: RegistroInput,
  opts: GuardarOpciones = {}
): Promise<GuardarResultado> {
  try {
    const perms = await assertAusentismo();
    // Toda modificación posterior lleva motivo: es lo que permite validar
    // después el registro inicial contra el actual.
    const motivo = input.motivoModificacion?.trim() || "";
    if (!motivo) throw new Error("Indica el motivo de la modificación.");
    if (motivo.length > 200) throw new Error("El motivo no puede pasar de 200 caracteres.");
    const supabase = createAdminClient();

    const { data: prev, error: readError } = await supabase
      .from("ausentismo_registros")
      .select("*")
      .eq("id", id)
      .single();
    if (readError) throw new Error("Registro no encontrado.");

    const concepto = await leerConcepto(supabase, input.tipo, { permitirInactivoSi: prev.tipo });
    const fila = validar(input, concepto);
    await assertVehiculo(supabase, fila.codigo_vehiculo);

    // El propio registro queda fuera de la comprobación de cruces.
    const revision = await revisarPeriodos(supabase, fila, id, opts.forzarCruce === true);
    if (!revision.ok) {
      return { success: false, error: revision.error, requiereConfirmacion: true, periodos: revision.periodos };
    }

    // `tipo_inicial` y `tipo_modificado_at` los sella el trigger en la base;
    // aquí solo se anota quién y por qué.
    const cambios = {
      ...fila,
      modificado_por_email: perms.userEmail,
      motivo_modificacion: motivo,
    };

    const { error } = await supabase
      .from("ausentismo_registros")
      .update(cambios)
      .eq("id", id);
    if (error) throw new Error(error.message);

    await logAusentismo({
      registroId: id,
      accion: "editado",
      anterior: prev,
      nuevo: cambios,
      userId: perms.userId,
      userEmail: perms.userEmail,
    });

    revalidatePath("/ausentismo");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ConceptoInput {
  nombre: string;
  cuentaReincidencia: boolean;
  exigeSoporte: boolean;
  /** El ausente se presenta todos los días entre inicio y fin (vacaciones). */
  cubreRango: boolean;
}

/**
 * Da de alta un concepto desde el propio formulario. Exige permiso de edición
 * en el módulo. Si ya existe uno con el mismo nombre (sin importar mayúsculas)
 * o la misma clave, devuelve el existente en vez de duplicarlo. Los conceptos
 * nunca se borran desde la app: se desactivan en la base si hace falta.
 */
export async function crearConcepto(
  input: ConceptoInput
): Promise<{ success: boolean; error?: string; concepto?: Concepto; existente?: boolean }> {
  try {
    const perms = await assertAusentismo();
    if (!perms.puedeEditar) {
      throw new Error("Tu tipo de usuario no puede crear conceptos.");
    }
    const nombre = input.nombre.trim().replace(/\s+/g, " ");
    if (nombre.length < 3) throw new Error("El nombre debe tener al menos 3 caracteres.");
    if (nombre.length > 80) throw new Error("El nombre no puede pasar de 80 caracteres.");
    const key = claveDesdeNombre(nombre);
    if (!key) throw new Error("El nombre debe tener al menos una letra o un número.");

    const supabase = createAdminClient();
    const SELECT = SELECT_CONCEPTO;

    const [porClave, porNombre] = await Promise.all([
      supabase.from("ausentismo_conceptos").select(SELECT).eq("key", key).maybeSingle(),
      supabase
        .from("ausentismo_conceptos")
        .select(SELECT)
        .ilike("nombre", nombre.replace(/[%_]/g, ""))
        .limit(1)
        .maybeSingle(),
    ]);
    const existente = porClave.data ?? porNombre.data;
    if (existente) {
      revalidatePath("/ausentismo");
      return { success: true, concepto: existente as Concepto, existente: true };
    }

    // Los nuevos van al final, antes de "Otra" si aún conserva su orden.
    const { data: ultimo } = await supabase
      .from("ausentismo_conceptos")
      .select("orden")
      .neq("key", "otra")
      .order("orden", { ascending: false })
      .limit(1)
      .maybeSingle();
    const orden = (ultimo?.orden ?? 100) + 10;

    const { data, error } = await supabase
      .from("ausentismo_conceptos")
      .insert({
        key,
        nombre,
        orden,
        activo: true,
        cuenta_reincidencia: input.cuentaReincidencia,
        exige_soporte: input.exigeSoporte,
        cubre_rango: input.cubreRango,
        created_by_email: perms.userEmail,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);

    revalidatePath("/ausentismo");
    return { success: true, concepto: data as Concepto };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Notificaciones de descargos y terminación ────────────────────────────────

export interface NotificacionInput {
  cedula: string;
  codigo: string | null;
  nombre: string;
  /** descargos | terminacion */
  nivel: string;
  rachaDesde: string;
  rachaHasta: string;
  dias: number;
  /** Día en que se entregó la notificación. */
  notificadoEn: string;
  observaciones: string | null;
}

/**
 * Marca como notificada la citación a descargos o la terminación de contrato
 * de un conductor para su racha actual de días sin justificar. Exige que la
 * racha alcance los días del nivel; si ya hay una marca vigente para esa racha,
 * la devuelve en vez de duplicarla.
 */
export async function marcarNotificacion(
  input: NotificacionInput
): Promise<{ success: boolean; error?: string; notificacion?: Notificacion; existente?: boolean }> {
  try {
    const perms = await assertAusentismo();
    if (!esNotificable(input.nivel)) throw new Error("Nivel de notificación no válido.");
    const cedula = input.cedula.replace(/\D/g, "");
    if (!cedula) throw new Error("Falta la cédula del conductor.");
    const nombre = input.nombre.trim();
    if (!nombre) throw new Error("Falta el nombre del conductor.");
    for (const [campo, v] of [
      ["inicio de la racha", input.rachaDesde],
      ["fin de la racha", input.rachaHasta],
      ["notificación", input.notificadoEn],
    ] as const) {
      if (!FECHA_RE.test(v)) throw new Error(`Fecha de ${campo} no válida.`);
    }
    if (input.rachaHasta < input.rachaDesde) throw new Error("La racha termina antes de empezar.");
    const dias = Math.trunc(Number(input.dias));
    const minimo = input.nivel === "terminacion" ? DIAS_TERMINACION : DIAS_DESCARGOS;
    if (!Number.isFinite(dias) || dias < minimo) {
      throw new Error(`${NIVEL_ALERTA_LABEL[input.nivel]} exige ${minimo} o más días seguidos sin justificar.`);
    }
    const observaciones = input.observaciones?.trim() || null;
    if (observaciones && observaciones.length > 300) {
      throw new Error("Las observaciones no pueden pasar de 300 caracteres.");
    }

    const supabase = createAdminClient();
    const SELECT = "id, cedula, nivel, racha_desde, racha_hasta, dias, notificado_en, observaciones, created_by_email, created_at";

    // Ya notificado para una racha que se solapa con esta: no se duplica.
    const { data: previa } = await supabase
      .from("ausentismo_notificaciones")
      .select(SELECT)
      .eq("cedula", cedula)
      .eq("nivel", input.nivel)
      .is("anulada_en", null)
      .lte("racha_desde", input.rachaHasta)
      .gte("racha_hasta", input.rachaDesde)
      .limit(1)
      .maybeSingle();
    if (previa) {
      revalidatePath("/ausentismo");
      return { success: true, notificacion: previa as Notificacion, existente: true };
    }

    const { data, error } = await supabase
      .from("ausentismo_notificaciones")
      .insert({
        cedula,
        codigo: input.codigo?.trim() || null,
        nombre,
        nivel: input.nivel,
        racha_desde: input.rachaDesde,
        racha_hasta: input.rachaHasta,
        dias,
        notificado_en: input.notificadoEn,
        observaciones,
        created_by: perms.userId,
        created_by_email: perms.userEmail,
      })
      .select(SELECT)
      .single();
    if (error) throw new Error(error.message);

    revalidatePath("/ausentismo");
    return { success: true, notificacion: data as Notificacion };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Anula una marca de notificación con motivo; la fila se conserva como rastro. */
export async function anularNotificacion(
  id: string,
  motivo: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertAusentismo();
    const m = motivo.trim();
    if (!m) throw new Error("Indica el motivo de la anulación.");
    if (m.length > 200) throw new Error("El motivo no puede pasar de 200 caracteres.");
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("ausentismo_notificaciones")
      .update({ anulada_en: new Date().toISOString(), anulada_por_email: perms.userEmail, motivo_anulacion: m })
      .eq("id", id)
      .is("anulada_en", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("La notificación no existe o ya estaba anulada.");
    revalidatePath("/ausentismo");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function eliminarRegistro(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertAusentismo();
    const supabase = createAdminClient();

    const { data: prev, error: readError } = await supabase
      .from("ausentismo_registros")
      .select("*")
      .eq("id", id)
      .single();
    if (readError) throw new Error("Registro no encontrado.");

    const { error } = await supabase
      .from("ausentismo_registros")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);

    await logAusentismo({
      registroId: id,
      accion: "eliminado",
      anterior: prev,
      userId: perms.userId,
      userEmail: perms.userEmail,
    });

    revalidatePath("/ausentismo");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Reporte de reincidencias históricas ──────────────────────────────────────

/**
 * Reincidencias de un rango largo, abiertas mes a mes. Se pide desde la
 * pestaña Reincidentes y se calcula al vuelo: no toca la base más que para
 * leer los registros del rango y el estado de los conductores.
 */
export async function obtenerHistoricoReincidencias(input: {
  desde: string;
  hasta: string;
  minimo: number;
  incluirRetirados: boolean;
}): Promise<{ success: boolean; error?: string; historico?: HistoricoReincidencias }> {
  try {
    await assertAusentismo();
    for (const [campo, v] of [["desde", input.desde], ["hasta", input.hasta]] as const) {
      if (!FECHA_RE.test(v)) throw new Error(`La fecha "${campo}" no es válida.`);
    }
    if (input.hasta < input.desde) throw new Error("El rango termina antes de empezar.");
    const minimo = Math.trunc(Number(input.minimo));
    if (!Number.isFinite(minimo) || minimo < 1 || minimo > 20) {
      throw new Error("El mínimo de ausencias debe estar entre 1 y 20.");
    }
    const conceptos = await getConceptos();
    const historico = await getHistoricoReincidencias({
      desde: input.desde,
      hasta: input.hasta,
      conceptos,
      minimo,
      incluirRetirados: input.incluirRetirados,
    });
    return { success: true, historico };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
