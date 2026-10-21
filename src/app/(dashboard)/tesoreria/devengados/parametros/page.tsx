import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseDiaria, getBloqueosActivos, getFechaOperativa } from "@/lib/devengados/data";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { getEstadoSyncGema } from "@/lib/gema/actions";
import { getEstadoMgx, getUltimasCorridasMgx } from "@/lib/mgx/actions";
import { ParametrosClient } from "./parametros-client";

export const dynamic = "force-dynamic";
// La sincronización manual con GEMA (server action de esta página) puede
// tardar varios minutos; mismo presupuesto que el cron. La de MGX trabaja por
// pasos de ~200 s dentro de este mismo tope.
export const maxDuration = 300;

export default async function ParametrosDevengadosPage() {
  const perms = await requireTesoreriaSub("parametros");
  const [baseDiaria, fechaOperativa, syncGema, bloqueos, syncMgx, corridasMgx] = await Promise.all([
    getBaseDiaria(),
    getFechaOperativa(),
    getEstadoSyncGema(),
    getBloqueosActivos(),
    perms.isAdmin ? getEstadoMgx() : Promise.resolve([]),
    perms.isAdmin ? getUltimasCorridasMgx() : Promise.resolve([]),
  ]);

  // Maestro de conductores para el buscador de bloqueos (solo admin lo usa).
  const conductores: { cedula: string; nombre: string; codigo: string | null }[] = [];
  if (perms.isAdmin) {
    const supabase = createAdminClient();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("conductores")
        .select("cedula, nombre, codigo")
        .eq("estado", "ACTIVO")
        .order("nombre", { ascending: true })
        // Desempate único: con >1000 activos y nombres repetidos, la
        // paginación sin orden total puede repetir/perder conductores.
        .order("cedula", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as typeof conductores;
      conductores.push(...rows);
      if (rows.length < PAGE) break;
    }
  }

  return (
    <ParametrosClient
      baseDiaria={baseDiaria}
      fechaOperativa={fechaOperativa}
      esAdmin={perms.isAdmin}
      syncGema={syncGema}
      bloqueos={bloqueos}
      conductores={conductores}
      syncMgx={syncMgx}
      corridasMgx={corridasMgx}
    />
  );
}
