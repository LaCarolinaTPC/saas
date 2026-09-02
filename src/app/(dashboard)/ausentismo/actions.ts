"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import {
  CONTACTO_KEYS,
  SOPORTE_KEYS,
  claveDesdeNombre,
  type Concepto,
} from "@/lib/ausentismo/constants";

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

function validar(input: RegistroInput) {
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
    fecha: input.fecha,
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

/**
 * El concepto debe existir en el catálogo. Al crear se exige que esté activo;
 * al editar se tolera uno inactivo solo si el registro ya lo tenía (así una
 * edición de otro campo no obliga a reclasificar).
 */
async function assertConcepto(
  supabase: Admin,
  tipo: string,
  opts: { permitirInactivoSi?: string | null } = {}
) {
  const { data } = await supabase
    .from("ausentismo_conceptos")
    .select("key, activo")
    .eq("key", tipo)
    .maybeSingle();
  if (!data) throw new Error("El tipo de ausencia no existe en el catálogo.");
  if (!data.activo && opts.permitirInactivoSi !== tipo) {
    throw new Error("Ese tipo de ausencia está inactivo. Elige otro.");
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

export async function crearRegistro(
  input: RegistroInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertAusentismo();
    const fila = validar(input);
    const supabase = createAdminClient();
    await Promise.all([
      assertConcepto(supabase, fila.tipo),
      assertVehiculo(supabase, fila.codigo_vehiculo),
    ]);

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
  input: RegistroInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const perms = await assertAusentismo();
    const fila = validar(input);
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

    await Promise.all([
      assertConcepto(supabase, fila.tipo, { permitirInactivoSi: prev.tipo }),
      assertVehiculo(supabase, fila.codigo_vehiculo),
    ]);

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
    const SELECT = "key, nombre, orden, activo, cuenta_reincidencia, exige_soporte";

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
