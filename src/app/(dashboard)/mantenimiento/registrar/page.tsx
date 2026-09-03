import { Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { RegistrarDanoClient } from "./registrar-client";

export const dynamic = "force-dynamic";

// Módulo aparte de Mantenimiento, para poder darle a quien solo captura daños
// esta pantalla sin abrirle el historial, las alertas ni los frenos. Quien
// tenga el área completa también entra: `mantenimiento` lo cubre.
//
// Los conductores no pasan por aquí: reportan sin cuenta desde /reportar-dano.
export default async function RegistrarDanoPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "registro_dano") && !canAccess(perms, "mantenimiento")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const db = createAdminClient();
  const [vehiculosResult, conductoresResult, conceptosResult] = await Promise.all([
    // `estado = 1` es el vehículo activo para su gestión en el maestro que GEMA
    // sincroniza; la vista de origen no documenta el resto de valores.
    db.from("vehiculos").select("codigo, placa, marca, clase, ruta, cedula_conductor").eq("estado", 1).order("codigo"),
    db.from("conductores").select("cedula, nombre, codigo").eq("estado", "ACTIVO").order("nombre"),
    db.from("mantenimiento_conceptos").select("id, nombre, descripcion").eq("activo", true).order("nombre"),
  ]);
  const errores = [vehiculosResult, conductoresResult, conceptosResult]
    .flatMap((r) => (r.error ? [r.error.message] : []));

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Wrench className="h-5 w-5 text-[#4F46E5]" />
          <h1 className="text-xl font-semibold text-gray-900">Registrar daño</h1>
        </div>
      </div>
      <RegistrarDanoClient
        vehiculos={vehiculosResult.data ?? []}
        conductores={conductoresResult.data ?? []}
        conceptos={conceptosResult.data ?? []}
        erroresCarga={errores}
        puedeEditar={perms.puedeEditar}
      />
    </div>
  );
}
