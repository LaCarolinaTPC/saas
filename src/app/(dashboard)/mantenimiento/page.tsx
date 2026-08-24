import { Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { MantenimientoClient } from "./mantenimiento-client";

export const dynamic = "force-dynamic";

export default async function MantenimientoPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "mantenimiento")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const db = createAdminClient();
  const [{ data: busetas }, { data: conceptos }, { data: reportes }, { data: alertas }] = await Promise.all([
    db.from("busetas").select("placa, numero_interno").eq("activa", true).order("placa"),
    db.from("mantenimiento_conceptos").select("id, nombre").eq("activo", true).order("nombre"),
    db.from("mantenimiento_reportes").select("id, placa_buseta, cedula_conductor, descripcion, fecha_reporte, alerta_id, mantenimiento_conceptos(nombre), conductores(nombre)").order("fecha_reporte", { ascending: false }).limit(30),
    db.from("mantenimiento_alertas").select("id, placa_buseta, cantidad, estado, created_at, mantenimiento_conceptos(nombre)").eq("estado", "abierta").order("created_at", { ascending: false }).limit(12),
  ]);
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Wrench className="h-5 w-5 text-[#4F46E5]" />
          <h1 className="text-xl font-semibold text-gray-900">Mantenimiento</h1>
        </div>
      </div>
      <MantenimientoClient busetas={busetas ?? []} conceptos={conceptos ?? []} reportes={reportes ?? []} alertas={alertas ?? []} puedeEditar={perms.puedeEditar} />
    </div>
  );
}
