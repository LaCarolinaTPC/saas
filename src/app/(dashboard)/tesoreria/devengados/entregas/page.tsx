import { getDatosEntregasDia, getFechaOperativa } from "@/lib/devengados/data";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { EntregasClient } from "./entregas-client";

export const dynamic = "force-dynamic";

export default async function EntregasPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const perms = await requireTesoreriaSub("entregas");
  const { fecha } = await searchParams;
  const { fecha: hoy } = await getFechaOperativa();
  const fechaSel = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : hoy;

  const datos = await getDatosEntregasDia(fechaSel);

  return (
    <EntregasClient
      entregas={datos.entregas}
      cajeros={datos.cajeros}
      acumQuincena={datos.acumQuincena}
      fecha={fechaSel}
      isAdmin={perms.isAdmin}
    />
  );
}
