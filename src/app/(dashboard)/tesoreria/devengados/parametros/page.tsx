import { getBaseDiaria, getFechaOperativa } from "@/lib/devengados/data";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { ParametrosClient } from "./parametros-client";

export const dynamic = "force-dynamic";

export default async function ParametrosDevengadosPage() {
  const perms = await requireTesoreriaSub("parametros");
  const [baseDiaria, fechaOperativa] = await Promise.all([
    getBaseDiaria(),
    getFechaOperativa(),
  ]);
  return (
    <ParametrosClient
      baseDiaria={baseDiaria}
      fechaOperativa={fechaOperativa}
      esAdmin={perms.isAdmin}
    />
  );
}
