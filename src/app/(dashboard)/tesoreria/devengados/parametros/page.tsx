import { getBaseDiaria, getFechaOperativa } from "@/lib/devengados/data";
import { getCurrentPermissions } from "@/lib/permissions";
import { ParametrosClient } from "./parametros-client";

export const dynamic = "force-dynamic";

export default async function ParametrosDevengadosPage() {
  const [baseDiaria, fechaOperativa, perms] = await Promise.all([
    getBaseDiaria(),
    getFechaOperativa(),
    getCurrentPermissions(),
  ]);
  return (
    <ParametrosClient
      baseDiaria={baseDiaria}
      fechaOperativa={fechaOperativa}
      esAdmin={perms.isAdmin}
    />
  );
}
