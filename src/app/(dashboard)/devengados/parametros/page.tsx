import { getBaseDiaria } from "@/lib/devengados/data";
import { ParametrosClient } from "./parametros-client";

export const dynamic = "force-dynamic";

export default async function ParametrosDevengadosPage() {
  const baseDiaria = await getBaseDiaria();
  return <ParametrosClient baseDiaria={baseDiaria} />;
}
