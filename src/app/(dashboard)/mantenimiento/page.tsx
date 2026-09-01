import { Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { cargarAlertas, cargarReportes } from "@/lib/mantenimiento/danos";
import { MantenimientoClient } from "./mantenimiento-client";

export const dynamic = "force-dynamic";

// Página de entrada del módulo: capturar un daño y ver de un vistazo lo
// reciente. El historial completo vive en /mantenimiento/reportes y la gestión
// de alertas en /mantenimiento/alertas.
export default async function MantenimientoPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "mantenimiento")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const db = createAdminClient();
  const [vehiculosResult, conductoresResult, conceptosResult, reportesResult, alertasResult] = await Promise.all([
    // `estado = 1` es el vehículo activo para su gestión en el maestro que GEMA
    // sincroniza; la vista de origen no documenta el resto de valores.
    db.from("vehiculos").select("codigo, placa, marca, clase, ruta, cedula_conductor").eq("estado", 1).order("codigo"),
    db.from("conductores").select("cedula, nombre").eq("estado", "ACTIVO").order("nombre"),
    db.from("mantenimiento_conceptos").select("id, nombre").eq("activo", true).order("nombre"),
    cargarReportes(15),
    cargarAlertas(200),
  ]);
  const errors = [vehiculosResult, conductoresResult, conceptosResult, reportesResult, alertasResult]
    .flatMap((result) => (result.error ? [result.error.message] : []));
  const alertas = alertasResult.data ?? [];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Wrench className="h-5 w-5 text-[#4F46E5]" />
          <h1 className="text-xl font-semibold text-gray-900">Mantenimiento</h1>
        </div>
      </div>
      <MantenimientoClient
        vehiculos={vehiculosResult.data ?? []}
        conductores={conductoresResult.data ?? []}
        conceptos={conceptosResult.data ?? []}
        reportes={reportesResult.data ?? []}
        alertasAbiertas={alertas.filter((a) => a.estado === "abierta")}
        erroresCarga={errors}
        puedeEditar={perms.puedeEditar}
      />
    </div>
  );
}
