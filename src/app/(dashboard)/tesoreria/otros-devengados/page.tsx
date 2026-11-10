import { createAdminClient } from "@/lib/supabase/admin";
import { canAccessSub, tienePermiso } from "@/lib/permissions";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { nowBogotaISO } from "@/lib/utils";
import {
  cargarCortesSinNomina,
  cargarCruce,
  listarConductoresActivos,
  listarPeriodos,
  ocultarDetalle,
} from "@/lib/otros-devengados/data";
import { OtrosDevengadosClient } from "./otros-devengados-client";

export const dynamic = "force-dynamic";

export default async function OtrosDevengadosPage({
  searchParams,
}: {
  searchParams: Promise<{ per?: string }>;
}) {
  const perms = await requireTesoreriaSub("otros_devengados");
  const { per } = await searchParams;
  const db = createAdminClient();
  const hoy = nowBogotaISO().slice(0, 10);

  const periodos = await listarPeriodos(db, hoy);
  // Por defecto, la quincena cerrada más reciente.
  const elegido =
    periodos.find((p) => p.codigo === per) ?? periodos.find((p) => p.cerrada) ?? periodos[0] ?? null;
  const completo = elegido ? await cargarCruce(db, elegido) : null;
  // El detalle del cálculo (producción, salario y conceptos de nómina) solo lo
  // ven Nómina y los administradores: a los demás no se les envía.
  const verDetalle = canAccessSub(perms, "tesoreria", "otros_devengados_detalle");
  const cruce = completo && !verDetalle ? ocultarDetalle(completo) : completo;
  // Cortes que ya empezaron y todavía no tienen nómina en MGX: el casino se
  // puede ir cargando; el cruce sale cuando llegue la nómina.
  const cortesSinNomina = await cargarCortesSinNomina(db, hoy, periodos);
  const conductoresActivos = cortesSinNomina.length ? await listarConductoresActivos(db) : [];

  return (
    <OtrosDevengadosClient
      periodos={periodos}
      cruce={cruce}
      cortesSinNomina={cortesSinNomina}
      conductoresActivos={conductoresActivos}
      puedeEntregar={tienePermiso(perms, "tesoreria.otros_devengados.editar")}
      puedeCargarNomina={tienePermiso(perms, "tesoreria.otros_devengados.editar") && verDetalle}
      verDetalle={verDetalle}
      esAdmin={perms.isAdmin}
    />
  );
}
