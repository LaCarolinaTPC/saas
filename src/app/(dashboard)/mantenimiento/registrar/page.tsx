import { Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
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
      <PageHeader titulo="Registrar daño" icono={Wrench} />
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
