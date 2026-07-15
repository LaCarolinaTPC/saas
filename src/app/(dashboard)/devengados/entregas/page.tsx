import { getEntregasDia } from "@/lib/devengados/data";
import { nowBogotaISO } from "@/lib/utils";
import { EntregasClient } from "./entregas-client";

export const dynamic = "force-dynamic";

export default async function EntregasPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { fecha } = await searchParams;
  const hoy = nowBogotaISO().slice(0, 10);
  const fechaSel = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoy;

  const entregas = await getEntregasDia(fechaSel);

  return <EntregasClient entregas={entregas} fecha={fechaSel} />;
}
