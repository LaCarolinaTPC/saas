import { redirect } from "next/navigation";

/**
 * El módulo Contratación se fusionó con Candidatos: los procesos de
 * contratación ahora se gestionan desde /candidatos (vista "Procesos").
 * Esta ruta se conserva solo para no romper enlaces antiguos.
 */
export default async function ContratacionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) qs.set(key, value);
  }
  const suffix = qs.toString();
  redirect(suffix ? `/candidatos?${suffix}` : "/candidatos");
}
