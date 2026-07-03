"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";

async function assertAdmin() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) throw new Error("Solo un administrador puede gestionar usuarios.");
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
    user_metadata: { full_name: fullName },
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

  revalidatePath("/configuracion/usuarios");
}

export async function updateUserType(
  userId: string,
  userType: string,
  scopeDepartments: string[]
) {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      user_type: userType,
      scope_departments: scopeDepartments.length ? scopeDepartments : null,
    })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/configuracion/usuarios");
}
