import { redirect } from "next/navigation";
import { canAccess, canAccessSub, getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyBogota } from "@/lib/operativo/constants";
import { claveCorte, cortesHasta } from "@/lib/otros-devengados/calculo";
import { listarNovedades } from "@/lib/otros-devengados/data";
import { EncabezadoOperativo, PestanasOperativo } from "../ui";
import { DescuentosClient } from "./descuentos-client";

export const dynamic = "force-dynamic";

/**
 * Operativo · Descuentos a conductores por corte: pérdida de turno, pérdida
 * de viaje y devolución de viaje, que Tesorería aplica sobre los otros
 * devengados de la quincena (opción Otros devengados).
 */
export default async function DescuentosConductoresPage({
  searchParams,
}: {
  searchParams: Promise<{ corte?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const puedeEditar =
    perms.isAdmin ||
    puedeEditarEn(perms, "operativo") ||
    (canAccessSub(perms, "tesoreria", "otros_devengados") && tienePermiso(perms, "tesoreria.otros_devengados.editar"));

  const { corte } = await searchParams;
  const cortes = cortesHasta(hoyBogota());
  const elegido = cortes.find((c) => claveCorte(c) === corte) ?? cortes[0];
  const db = createAdminClient();

  const [novedades, conductores] = await Promise.all([
    listarNovedades(db, elegido, { incluirAnuladas: true, tipos: ["perdida_turno", "perdida_viaje", "devolucion_viaje"] }),
    (async () => {
      const out: { cedula: string; nombre: string; codigo: string | null }[] = [];
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await db
          .from("conductores")
          .select("cedula, nombre, codigo")
          .eq("estado", "ACTIVO")
          .order("nombre", { ascending: true })
          .order("cedula", { ascending: true })
          .range(desde, desde + 999);
        if (error) throw error;
        out.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return out;
    })(),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <EncabezadoOperativo titulo="Operativo · Descuentos a conductores">
        <PestanasOperativo activa="descuentos" />
      </EncabezadoOperativo>
      <DescuentosClient
        cortes={cortes}
        corte={elegido}
        novedades={novedades}
        conductores={conductores}
        puedeEditar={puedeEditar}
      />
    </div>
  );
}
