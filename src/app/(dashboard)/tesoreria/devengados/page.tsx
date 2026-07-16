import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseDiaria, getFechaOperativa } from "@/lib/devengados/data";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { CajaClient } from "./caja-client";

export const dynamic = "force-dynamic";

type ConductorRow = {
  cedula: string;
  nombre: string;
  codigo: string | null;
  estado: string | null;
};

export default async function DevengadosCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  await requireTesoreriaSub("caja");
  const { fecha } = await searchParams;
  const supabase = createAdminClient();

  // Maestro de conductores para el buscador de caja (paginado por el
  // límite de 1000 filas de Supabase).
  const all: ConductorRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("conductores")
      .select("cedula, nombre, codigo, estado")
      .eq("estado", "ACTIVO")
      .order("nombre", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as ConductorRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }

  const baseDiaria = await getBaseDiaria();
  // El módulo entero se para en la fecha operativa (día real, salvo que un
  // administrador la haya fijado en un día cerrado para pruebas).
  const { fecha: hoy, esSimulada } = await getFechaOperativa();
  // Fecha de corte para consultar quincenas ya cerradas (nunca futura).
  const fechaCorte =
    fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= hoy ? fecha : hoy;

  return (
    <CajaClient
      conductores={all}
      baseDiaria={baseDiaria}
      hoy={hoy}
      fechaCorte={fechaCorte}
      esSimulada={esSimulada}
    />
  );
}
