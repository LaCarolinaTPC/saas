"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions } from "@/lib/permissions";

async function assertAdmin() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) throw new Error("Solo un administrador puede gestionar usuarios.");
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

export async function setCargoMapping(cargo: string, userType: string) {
  await assertAdmin();
  const admin = createAdminClient();
  if (!userType) {
    const { error } = await admin.from("cargo_user_type").delete().eq("cargo", cargo);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .from("cargo_user_type")
      .upsert({ cargo, user_type: userType }, { onConflict: "cargo" });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/configuracion/usuarios");
}
