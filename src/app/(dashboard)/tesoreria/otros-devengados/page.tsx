import { createAdminClient } from "@/lib/supabase/admin";
import { tienePermiso } from "@/lib/permissions";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { nowBogotaISO } from "@/lib/utils";
import { cargarCruce, listarPeriodos } from "@/lib/otros-devengados/data";
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
  const cruce = elegido ? await cargarCruce(db, elegido) : null;

  return (
    <OtrosDevengadosClient
      periodos={periodos}
      cruce={cruce}
      puedeEntregar={tienePermiso(perms, "tesoreria.otros_devengados.editar")}
    />
  );
}
