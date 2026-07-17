import { getBaseDiaria, getFechaOperativa } from "@/lib/devengados/data";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { getEstadoSyncGema } from "@/lib/gema/actions";
import { ParametrosClient } from "./parametros-client";

export const dynamic = "force-dynamic";
// La sincronización manual con GEMA (server action de esta página) puede
// tardar varios minutos; mismo presupuesto que el cron.
export const maxDuration = 300;

export default async function ParametrosDevengadosPage() {
  const perms = await requireTesoreriaSub("parametros");
  const [baseDiaria, fechaOperativa, syncGema] = await Promise.all([
    getBaseDiaria(),
    getFechaOperativa(),
    getEstadoSyncGema(),
  ]);
  return (
    <ParametrosClient
      baseDiaria={baseDiaria}
      fechaOperativa={fechaOperativa}
      esAdmin={perms.isAdmin}
      syncGema={syncGema}
    />
  );
}
