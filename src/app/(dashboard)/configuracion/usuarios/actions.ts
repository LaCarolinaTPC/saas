"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";
import { MODULE_SUBS } from "@/lib/permissions-shared";
import { logTesoreriaAudit } from "@/lib/devengados/audit";

async function assertAdmin() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) throw new Error("Solo un administrador puede gestionar usuarios.");
  return perms;
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
