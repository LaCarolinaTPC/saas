import { getAnalisisQuincena } from "@/lib/devengados/data";
import { nowBogotaISO } from "@/lib/utils";
import { AnalisisClient } from "./analisis-client";

export const dynamic = "force-dynamic";

export default async function AnalisisQuincenaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { fecha } = await searchParams;
  const hoy = nowBogotaISO().slice(0, 10);
  const fechaCorte = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoy;

  const { baseDiaria, quincena, filas } = await getAnalisisQuincena(fechaCorte);

  return (
    <AnalisisClient
      filas={filas}
      baseDiaria={baseDiaria}
      quincena={quincena}
      fechaCorte={fechaCorte}
    />
  );
}
