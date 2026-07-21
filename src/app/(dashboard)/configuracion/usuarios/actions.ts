"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { estaBloqueado } from "@/lib/auth-estado";
import { getCurrentPermissions } from "@/lib/permissions";
import { MODULE_SUBS } from "@/lib/permissions-shared";
import { logTesoreriaAudit } from "@/lib/devengados/audit";

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

  revalidatePath("/configuracion/usuarios");
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

  // No dejar el sistema sin ningún administrador activo.
  if (!activo && perfil?.user_type === "admin") {
    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("user_type", "admin");
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

  revalidatePath("/configuracion/usuarios");
}

export async function createUser(input: {
  fullName: string;
  email: string;
  password: string;
  userType: string;
  scopeDepartments: string[];
}) {
  await assertAdmin();
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName) throw new Error("El nombre es obligatorio.");
  if (!email) throw new Error("El email es obligatorio.");
  if (input.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    // La clave asignada es provisional: el usuario debe personalizarla en
    // su primer ingreso (cambio obligatorio de contraseña).
    user_metadata: { full_name: fullName, must_change_password: true },
  });
  if (error) throw new Error(error.message);

  // El trigger on_auth_user_created ya insertó el perfil; asignamos tipo y alcance
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      user_type: input.userType,
      scope_departments: input.scopeDepartments.length ? input.scopeDepartments : null,
    })
    .eq("id", data.user.id);
  if (profileError) throw new Error(profileError.message);

  await logTesoreriaAudit({
    accion: "usuario_creado",
    modulo: "seguridad",
    valorNuevo: input.userType,
    detalle: { email, fullName, userType: input.userType },
  });

  revalidatePath("/configuracion/usuarios");
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

  revalidatePath("/configuracion/usuarios");
}

export async function updateUserType(
  userId: string,
  userType: string,
  scopeDepartments: string[]
) {
  await assertAdmin();
  const admin = createAdminClient();
  const { data: prev } = await admin
    .from("profiles")
    .select("user_type, email")
    .eq("id", userId)
    .maybeSingle();
  const { error } = await admin
    .from("profiles")
    .update({
      user_type: userType,
      scope_departments: scopeDepartments.length ? scopeDepartments : null,
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);

  await logTesoreriaAudit({
    accion: "cambio_rol",
    modulo: "seguridad",
    valorAnterior: prev?.user_type ?? null,
    valorNuevo: userType,
    detalle: { userId, email: prev?.email ?? null },
  });

  revalidatePath("/configuracion/usuarios");
}
