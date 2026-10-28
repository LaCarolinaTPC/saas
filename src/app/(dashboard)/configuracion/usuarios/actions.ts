"use server";

// refresh() en vez de revalidatePath(): esta ruta es force-dynamic, así que no
// hay caché de servidor que invalidar, y revalidatePath además purgaba el caché
// de router de las demás pantallas ya visitadas, forzando a recargarlas al
// navegar. refresh() solo vuelve a pedir los datos dinámicos de esta ruta.
import { refresh } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { estaBloqueado } from "@/lib/auth-estado";
import { getCurrentPermissions } from "@/lib/permissions";
import {
  ALL_MODULES,
  ALL_SUBS,
  MODULE_LABELS,
  MODULE_SUBS,
  modulosEfectivos,
  normalizarIndividuales,
  SUB_TO_MODULE,
  SUBMODULE_LABELS,
  SUBS_SOLO_ADMIN,
  type ModuleKey,
  type PermisosIndividuales,
} from "@/lib/permissions-shared";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { motorActual } from "@/lib/permisos/fuente";

async function assertAdmin() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) throw new Error("Solo un administrador puede gestionar usuarios.");
  return perms;
}

/** Id del administrador que ejecuta la acción (para no dejarlo actuar sobre sí mismo). */
async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Clave provisional legible: sin caracteres ambiguos (O/0, I/l/1) porque el
 * administrador se la dicta al usuario por teléfono o WhatsApp.
 */
function generarClaveProvisional(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const num = "23456789";
  const pick = (s: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)))
      .map((r) => s[r % s.length])
      .join("");
  // Formato ABCD-2468-EFGH: 8 letras + 4 dígitos, fácil de dictar.
  return `${pick(abc, 4)}-${pick(num, 4)}-${pick(abc, 4)}`;
}

/**
 * Restablece la contraseña de un usuario desde el software. Devuelve la clave
 * provisional para que el administrador se la entregue; el usuario queda
 * obligado a cambiarla en su siguiente ingreso (must_change_password).
 */
export async function resetUserPassword(userId: string): Promise<{ password: string }> {
  await assertAdmin();

  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  const password = generarClaveProvisional();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    user_metadata: { must_change_password: true },
  });
  if (error) throw new Error(error.message);

  await logTesoreriaAudit({
    accion: "password_restablecido",
    modulo: "seguridad",
    // Nunca se registra la clave, solo a quién se le restableció.
    detalle: { userId, email: perfil?.email ?? null, fullName: perfil?.full_name ?? null },
  });

  // Sin refresco: la clave no se guarda en ningún sitio que la pantalla pinte
  // (se devuelve una sola vez para que el admin la entregue), así que no hay
  // nada que volver a leer del servidor.
  return { password };
}

/**
 * Activa o desactiva un usuario. Desactivar = bloqueo indefinido en Supabase
 * Auth: no puede iniciar sesión, pero se conserva su perfil y su rastro en la
 * auditoría. Es reversible.
 */
export async function setUserActive(userId: string, activo: boolean) {
  await assertAdmin();

  const yo = await currentUserId();
  if (yo && yo === userId && !activo) {
    throw new Error("No puedes desactivar tu propio usuario.");
  }

  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from("profiles")
    .select("email, full_name, user_type")
    .eq("id", userId)
    .maybeSingle();

  // No dejar el sistema sin ningún administrador activo. En el sistema nuevo de
  // roles, administrador = quien tiene un rol super (puede tener varios roles).
  const nuevo = (await motorActual(admin)) === "nuevo";
  const idsAdmin = async (): Promise<string[]> => {
    if (!nuevo) {
      const { data } = await admin.from("profiles").select("id").eq("user_type", "admin");
      return (data ?? []).map((a) => a.id as string);
    }
    const { data: supers } = await admin.from("roles").select("clave").eq("es_super", true).eq("activo", true);
    const claves = (supers ?? []).map((r) => r.clave as string);
    if (!claves.length) return [];
    const { data } = await admin.from("usuario_roles").select("user_id").in("rol", claves);
    return [...new Set((data ?? []).map((a) => a.user_id as string))];
  };
  const listaAdmin = await idsAdmin();
  if (!activo && (nuevo ? listaAdmin.includes(userId) : perfil?.user_type === "admin")) {
    const admins = listaAdmin.map((id) => ({ id }));
    const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const activos = (admins ?? []).filter((a) => {
      if (a.id === userId) return false;
      const au = authList?.users.find((u) => u.id === a.id);
      return !estaBloqueado(au?.banned_until);
    });
    if (activos.length === 0) {
      throw new Error("No se puede desactivar al último administrador activo.");
    }
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    // 100 años ≈ bloqueo permanente; "none" lo levanta.
    ban_duration: activo ? "none" : "876000h",
  });
  if (error) throw new Error(error.message);

  await logTesoreriaAudit({
    accion: activo ? "usuario_activado" : "usuario_desactivado",
    modulo: "seguridad",
    valorAnterior: activo ? "inactivo" : "activo",
    valorNuevo: activo ? "activo" : "inactivo",
    detalle: { userId, email: perfil?.email ?? null, fullName: perfil?.full_name ?? null },
  });

  refresh();
}

export async function createUser(input: {
  fullName: string;
  email: string;
  password: string;
  userType: string;
  scopeDepartments: string[];
}): Promise<{ error?: string }> {
  await assertAdmin();
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName) return { error: "El nombre es obligatorio." };
  if (!email) return { error: "El email es obligatorio." };
  if (input.password.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    // La clave asignada es provisional: el usuario debe personalizarla en
    // su primer ingreso (cambio obligatorio de contraseña).
    user_metadata: { full_name: fullName, must_change_password: true },
  });
  if (error) {
    const msg = /already|registered|exists/i.test(error.message)
      ? `Ya existe un usuario con el email ${email}.`
      : error.message;
    return { error: msg };
  }

  // Upsert en vez de update: no dependemos de que el trigger
  // on_auth_user_created haya insertado el perfil.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: data.user.id,
      full_name: fullName,
      email,
      user_type: input.userType,
      scope_departments: input.scopeDepartments.length ? input.scopeDepartments : null,
    });
  if (profileError) {
    return { error: `Usuario creado en autenticación, pero falló el perfil: ${profileError.message}` };
  }

  await logTesoreriaAudit({
    accion: "usuario_creado",
    modulo: "seguridad",
    valorNuevo: input.userType,
    detalle: { email, fullName, userType: input.userType },
  });

  refresh();
  return {};
}

/**
 * Define las sub-funciones de un módulo para un tipo de usuario.
 * `subs = null` quita la restricción (el tipo vuelve a tener todas las
 * sub-funciones del módulo). El tipo admin no se restringe.
 */
export async function updateTypeSubmodules(
  typeKey: string,
  module: string,
  subs: string[] | null
) {
  await assertAdmin();
  if (typeKey === "admin") throw new Error("El tipo administrador no se puede restringir.");

  // Allowlist: solo módulos y sub-funciones conocidas se escriben al JSONB,
  // para no envenenar submodulos con claves arbitrarias.
  if (!(module in MODULE_SUBS)) {
    throw new Error(`Módulo no válido: ${module}`);
  }
  if (subs !== null) {
    const validos = MODULE_SUBS[module as keyof typeof MODULE_SUBS] as readonly string[];
    const invalidos = subs.filter((s) => !validos.includes(s));
    if (invalidos.length) {
      throw new Error(`Sub-funciones no válidas: ${invalidos.join(", ")}`);
    }
    const reservadas = subs.filter((s) => SUBS_SOLO_ADMIN.has(s));
    if (reservadas.length) {
      throw new Error(
        `Reservadas al administrador (no concesibles): ${reservadas.join(", ")}`
      );
    }
  }

  const admin = createAdminClient();
  const { data: type, error: readError } = await admin
    .from("user_types")
    .select("*")
    .eq("key", typeKey)
    .single();
  if (readError) throw new Error(readError.message);

  const current =
    type.submodulos && typeof type.submodulos === "object" && !Array.isArray(type.submodulos)
      ? (type.submodulos as Record<string, string[]>)
      : {};
  const next = { ...current };
  if (subs === null) delete next[module];
  else next[module] = subs;

  const { error } = await admin
    .from("user_types")
    .update({ submodulos: next })
    .eq("key", typeKey);
  if (error) throw new Error(error.message);

  await logTesoreriaAudit({
    accion: "cambio_permisos",
    modulo: "seguridad",
    valorAnterior: JSON.stringify(current[module] ?? null),
    valorNuevo: JSON.stringify(subs),
    detalle: { typeKey, module },
  });

  // Sin refresco, a propósito. Esta acción la dispara CADA casilla de la matriz
  // de permisos, y la fila ya movió su estado de forma optimista antes de
  // llamarla (revierte en el catch si falla). El cliente no se remonta con un
  // refresco, así que volver a pedir el payload de la ruta —que arrastra las
  // consultas de page.tsx, incluido listUsers— no cambiaba ni un pixel.
}

/**
 * Actualiza nombre y correo de un usuario (Auth + perfil). El correo cambia
 * de inmediato (confirmado por el administrador); no hay borrado de usuarios:
 * para retirar el acceso se desactiva, conservando su rastro en auditoría.
 */
export async function updateUserProfile(
  userId: string,
  fullName: string,
  email: string
) {
  await assertAdmin();
  const nombre = fullName.trim();
  const correo = email.trim().toLowerCase();
  if (!nombre) throw new Error("El nombre es obligatorio.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error("Email no válido.");

  const admin = createAdminClient();
  const { data: prev } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (!prev) throw new Error("Usuario no encontrado.");

  const { error } = await admin.auth.admin.updateUserById(userId, {
    email: correo,
    email_confirm: true,
    user_metadata: { full_name: nombre },
  });
  if (error) throw new Error(error.message);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: nombre, email: correo })
    .eq("id", userId);
  if (profileError) throw new Error(profileError.message);

  await logTesoreriaAudit({
    accion: "usuario_editado",
    modulo: "seguridad",
    valorAnterior: JSON.stringify({ fullName: prev.full_name, email: prev.email }),
    valorNuevo: JSON.stringify({ fullName: nombre, email: correo }),
    detalle: { userId },
  });

  refresh();
}

// ============================================================
// CRUD de roles (user_types)
// ============================================================

const ROLE_KEY_RE = /^[a-z0-9_]{2,30}$/;

type RoleInput = {
  nombre: string;
  descripcion: string | null;
  modulos: string[];
  alcance: "all" | "departamentos";
  puedeEditar: boolean;
};

function validarRol(input: RoleInput): RoleInput {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El nombre del rol es obligatorio.");
  if (!["all", "departamentos"].includes(input.alcance)) {
    throw new Error("Alcance no válido.");
  }
  // Allowlist de módulos: nada fuera de ALL_MODULES entra al JSONB.
  const invalidos = input.modulos.filter(
    (m) => !ALL_MODULES.includes(m as ModuleKey)
  );
  if (invalidos.length) throw new Error(`Módulos no válidos: ${invalidos.join(", ")}`);
  return {
    nombre,
    descripcion: input.descripcion?.trim() || null,
    modulos: [...new Set(input.modulos)],
    alcance: input.alcance,
    puedeEditar: !!input.puedeEditar,
  };
}

// Las acciones de roles devuelven el error en vez de lanzarlo: en producción
// Next oculta el mensaje de un error lanzado en una Server Action y el
// navegador solo recibe el "Minified React error #441", sin decir qué falló.
async function comoResultado(fn: () => Promise<void>): Promise<{ error?: string }> {
  try {
    await fn();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createRole(input: RoleInput & { key: string }) {
  return comoResultado(() => crearRol(input));
}

export async function updateRole(key: string, input: RoleInput) {
  return comoResultado(() => editarRol(key, input));
}

export async function deleteRole(key: string) {
  return comoResultado(() => eliminarRol(key));
}

async function crearRol(input: RoleInput & { key: string }) {
  await assertAdmin();
  const key = input.key.trim().toLowerCase();
  if (!ROLE_KEY_RE.test(key)) {
    throw new Error(
      "La clave del rol debe tener 2–30 caracteres: minúsculas, números o guion bajo."
    );
  }
  const rol = validarRol(input);

  const admin = createAdminClient();
  const { data: existente } = await admin
    .from("user_types")
    .select("key")
    .eq("key", key)
    .maybeSingle();
  if (existente) throw new Error(`Ya existe un rol con la clave "${key}".`);

  const { error } = await admin.from("user_types").insert({
    key,
    nombre: rol.nombre,
    descripcion: rol.descripcion,
    modulos: rol.modulos,
    alcance: rol.alcance,
    puede_editar: rol.puedeEditar,
    es_sistema: false,
  });
  if (error) throw new Error(error.message);

  await logTesoreriaAudit({
    accion: "rol_creado",
    modulo: "seguridad",
    valorNuevo: JSON.stringify({ key, ...rol }),
    detalle: { key },
  });

  refresh();
}

async function editarRol(key: string, input: RoleInput) {
  await assertAdmin();
  // El rol admin es intocable: siempre acceso total (fail-safe del sistema).
  if (key === "admin") throw new Error("El rol administrador no se puede editar.");
  const rol = validarRol(input);

  const admin = createAdminClient();
  const { data: prev, error: readError } = await admin
    .from("user_types")
    .select("nombre, descripcion, modulos, alcance, puede_editar")
    .eq("key", key)
    .single();
  if (readError) throw new Error(readError.message);

  const { error } = await admin
    .from("user_types")
    .update({
      nombre: rol.nombre,
      descripcion: rol.descripcion,
      modulos: rol.modulos,
      alcance: rol.alcance,
      puede_editar: rol.puedeEditar,
    })
    .eq("key", key);
  if (error) throw new Error(error.message);

  await logTesoreriaAudit({
    accion: "rol_editado",
    modulo: "seguridad",
    valorAnterior: JSON.stringify(prev),
    valorNuevo: JSON.stringify(rol),
    detalle: { key },
  });

  refresh();
}

async function eliminarRol(key: string) {
  await assertAdmin();

  const admin = createAdminClient();
  const { data: rol, error: readError } = await admin
    .from("user_types")
    .select("nombre, es_sistema")
    .eq("key", key)
    .single();
  if (readError) throw new Error(readError.message);
  if (rol.es_sistema) {
    throw new Error("Los roles del sistema no se pueden eliminar.");
  }

  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_type", key);
  if ((count ?? 0) > 0) {
    throw new Error(
      `No se puede eliminar: ${count} usuario(s) tienen este rol. Reasígnalos primero.`
    );
  }

  // Las API keys también usan el rol para saber qué datos ven en el MCP y la
  // Data API. Si la columna aún no existe (migración pendiente), no hay claves
  // con rol y el error se ignora.
  const { count: claves, error: errorClaves } = await admin
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("user_type", key)
    .eq("is_active", true);
  if (!errorClaves && (claves ?? 0) > 0) {
    throw new Error(
      `No se puede eliminar: ${claves} API key(s) activas tienen este rol. Cámbiales el rol en Configuración → API primero.`
    );
  }

  const { error } = await admin.from("user_types").delete().eq("key", key);
  if (error) throw new Error(error.message);

  await logTesoreriaAudit({
    accion: "rol_eliminado",
    modulo: "seguridad",
    valorAnterior: JSON.stringify({ key, nombre: rol.nombre }),
    detalle: { key },
  });

  refresh();
}

export async function updateUserType(
  userId: string,
  userType: string,
  scopeDepartments: string[]
) {
  await assertAdmin();
  const admin = createAdminClient();
  // select("*"): permisos_individuales puede no existir aún (ver permissions.ts).
  const { data: prev } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  // Los ajustes individuales son RELATIVOS al rol: si se mueve a alguien de
  // Tesorería a Consulta y le queda colgado un {"modulos":{"tesoreria":true}},
  // seguiría entrando a Tesorería. Al cambiar de rol se retiran.
  const individualesPrevios = normalizarIndividuales(prev?.permisos_individuales);
  const teniaAjustes =
    Object.keys(individualesPrevios.modulos ?? {}).length > 0 ||
    Object.keys(individualesPrevios.submodulos ?? {}).length > 0;
  const cambiaRol = (prev?.user_type ?? null) !== userType;
  const limpiarAjustes = cambiaRol && teniaAjustes;

  const { error } = await admin
    .from("profiles")
    .update({
      user_type: userType,
      scope_departments: scopeDepartments.length ? scopeDepartments : null,
      ...(limpiarAjustes ? { permisos_individuales: {} } : {}),
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  await logTesoreriaAudit({
    accion: "cambio_rol",
    modulo: "seguridad",
    valorAnterior: prev?.user_type ?? null,
    valorNuevo: userType,
    detalle: {
      userId,
      email: prev?.email ?? null,
      ...(limpiarAjustes
        ? { individualesRetirados: JSON.stringify(individualesPrevios) }
        : {}),
    },
  });

  refresh();
}

/** Ajustes individuales tal como los envía la pantalla de permisos. */
export interface AjustesIndividualesInput {
  modulos: Record<string, boolean>;
  submodulos: Record<string, boolean>;
  motivo?: string;
}

/**
 * Lee el perfil y su rol para resolver permisos, y rechaza los casos en que no
 * tiene sentido ajustar nada. Compartido por las dos acciones de abajo.
 */
async function perfilAjustable(userId: string) {
  const admin = createAdminClient();
  // select("*"): permisos_individuales puede no existir aún (ver permissions.ts).
  const { data: perfil } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!perfil) throw new Error("Usuario no encontrado.");

  // El administrador siempre tiene acceso total: no hay nada que concederle y
  // denegarle algo podría dejar al sistema sin nadie que lo administre. Como
  // isAdmin es exactamente user_type === "admin", esto cubre también el caso
  // de un administrador ajustándose a sí mismo.
  if (perfil.user_type === "admin") {
    throw new Error(
      "El administrador siempre tiene acceso total: no admite permisos individuales."
    );
  }

  const { data: rol } = await admin
    .from("user_types")
    .select("*")
    .eq("key", perfil.user_type)
    .maybeSingle();
  if (!rol) throw new Error("El usuario no tiene un rol válido al que ajustarle permisos.");

  return { admin, perfil, rol };
}

/**
 * Permisos de UN usuario por encima de su rol. Solo se guardan las claves con
 * decisión explícita (true = conceder, false = denegar); lo que vuelve a
 * "Según el rol" se borra del JSONB, y sin ninguna decisión se guarda {}.
 */
export async function updateUserIndividualPermissions(
  userId: string,
  input: AjustesIndividualesInput
) {
  const yo = await assertAdmin();
  const { admin, perfil, rol } = await perfilAjustable(userId);

  // Allowlist, igual que updateTypeSubmodules: nada que no esté en el catálogo
  // de módulos y sub-funciones llega al JSONB, y los valores son booleanos.
  const validarMapa = (
    mapa: Record<string, boolean>,
    conocidas: readonly string[],
    etiqueta: string
  ) => {
    const invalidas = Object.keys(mapa).filter((k) => !conocidas.includes(k));
    if (invalidas.length) throw new Error(`${etiqueta} no válidos: ${invalidas.join(", ")}`);
    const noBooleanos = Object.entries(mapa).filter(([, v]) => typeof v !== "boolean");
    if (noBooleanos.length) {
      throw new Error(`${etiqueta} con valor no válido: ${noBooleanos.map(([k]) => k).join(", ")}`);
    }
    if (Object.keys(mapa).length > 64) throw new Error(`Demasiados ${etiqueta.toLowerCase()}.`);
  };
  validarMapa(input.modulos, ALL_MODULES, "Módulos");
  validarMapa(input.submodulos, ALL_SUBS, "Sub-funciones");

  // Reservadas al administrador: se rechaza incluso el false, para no dejar
  // basura inerte en el JSONB.
  const reservadas = Object.keys(input.submodulos).filter((s) => SUBS_SOLO_ADMIN.has(s));
  if (reservadas.length) {
    throw new Error(
      `Reservadas al administrador (no concesibles): ${reservadas.join(", ")}`
    );
  }

  const individuales: PermisosIndividuales = {
    modulos: input.modulos,
    submodulos: input.submodulos,
  };
  const efectivos = modulosEfectivos(rol.modulos, individuales);

  // Coherencia: una sub-función concedida sin su módulo no surte efecto
  // (canAccessSub exige el módulo). Se avisa en vez de guardarla muerta.
  for (const [sub, concedida] of Object.entries(input.submodulos)) {
    if (!concedida) continue;
    const suModulo = SUB_TO_MODULE[sub];
    if (suModulo && !efectivos.includes(suModulo)) {
      throw new Error(
        `Para conceder «${SUBMODULE_LABELS[sub] ?? sub}» también debes conceder el módulo ${MODULE_LABELS[suModulo] ?? suModulo}.`
      );
    }
  }

  // Sin ningún módulo el usuario no puede abrir nada y queda rebotando contra
  // /login, que no redirige por sesión: es un bloqueo encubierto. Para retirar
  // el acceso existe "Desactivar", que además deja rastro claro.
  if (!efectivos.length) {
    throw new Error(
      "Así el usuario no podría abrir ninguna pantalla. Si quieres retirarle el acceso, desactívalo."
    );
  }

  const motivo = (input.motivo ?? "").trim().slice(0, 300);
  const anterior = normalizarIndividuales(perfil.permisos_individuales);
  const hayAjustes =
    Object.keys(input.modulos).length > 0 || Object.keys(input.submodulos).length > 0;

  // Sin ajustes se guarda {} exacto, para que "permisos_individuales <> '{}'"
  // signifique "usuario con permisos a la medida" (lo usa el índice parcial).
  const next = hayAjustes
    ? {
        ...(Object.keys(input.modulos).length ? { modulos: input.modulos } : {}),
        ...(Object.keys(input.submodulos).length ? { submodulos: input.submodulos } : {}),
        meta: { por: yo.userId, email: yo.userEmail, at: new Date().toISOString() },
      }
    : {};

  const { error } = await admin
    .from("profiles")
    .update({ permisos_individuales: next })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  const concedidos = [
    ...Object.entries(input.modulos).filter(([, v]) => v).map(([k]) => k),
    ...Object.entries(input.submodulos).filter(([, v]) => v).map(([k]) => k),
  ];
  const denegados = [
    ...Object.entries(input.modulos).filter(([, v]) => !v).map(([k]) => k),
    ...Object.entries(input.submodulos).filter(([, v]) => !v).map(([k]) => k),
  ];

  await logTesoreriaAudit({
    accion: "cambio_permisos_individuales",
    modulo: "seguridad",
    valorAnterior: JSON.stringify(anterior),
    valorNuevo: JSON.stringify(next),
    detalle: {
      userId,
      email: perfil.email ?? null,
      fullName: perfil.full_name ?? null,
      rol: perfil.user_type ?? null,
      motivo: motivo || null,
      concedidos,
      denegados,
      modulosEfectivos: efectivos,
    },
  });

  refresh();
}

/** Devuelve al usuario a los permisos de su rol (borra todos los ajustes). */
export async function clearUserIndividualPermissions(userId: string, motivo?: string) {
  await assertAdmin();
  const { admin, perfil } = await perfilAjustable(userId);

  const anterior = normalizarIndividuales(perfil.permisos_individuales);
  const { error } = await admin
    .from("profiles")
    .update({ permisos_individuales: {} })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  await logTesoreriaAudit({
    accion: "cambio_permisos_individuales",
    modulo: "seguridad",
    valorAnterior: JSON.stringify(anterior),
    valorNuevo: "{}",
    detalle: {
      userId,
      email: perfil.email ?? null,
      fullName: perfil.full_name ?? null,
      rol: perfil.user_type ?? null,
      motivo: (motivo ?? "").trim().slice(0, 300) || null,
      restablecidoAlRol: true,
    },
  });

  refresh();
}
