import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseDiaria } from "@/lib/devengados/data";
import { nowBogotaISO } from "@/lib/utils";
import { CajaClient } from "./caja-client";

export const dynamic = "force-dynamic";

type ConductorRow = {
  cedula: string;
  nombre: string;
  codigo: string | null;
  estado: string | null;
};

export default async function DevengadosCajaPage() {
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
  const hoy = nowBogotaISO().slice(0, 10);

  return <CajaClient conductores={all} baseDiaria={baseDiaria} hoy={hoy} />;
}
