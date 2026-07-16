import { getAnalisisQuincena, getFechaOperativa } from "@/lib/devengados/data";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { AnalisisClient } from "./analisis-client";

export const dynamic = "force-dynamic";

export default async function AnalisisQuincenaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  await requireTesoreriaSub("analisis");
  const { fecha } = await searchParams;
  const { fecha: hoy } = await getFechaOperativa();
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
