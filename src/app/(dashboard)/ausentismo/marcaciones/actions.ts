"use server";

/**
 * Acciones de la pantalla de Marcaciones.
 */
import { revalidatePath } from "next/cache";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { hoyBogota } from "@/lib/operativo/constants";
import { refrescarDespachoDelDia, type RefrescoDespacho } from "@/lib/gema/despacho-al-dia";

export interface ResultadoRefresco {
  ok: boolean;
  error?: string;
  refresco?: RefrescoDespacho;
}

/**
 * Trae de GEMA `historico_despacho` del día, ahora mismo.
 *
 * **Solo esa tabla**: es la que cambia durante la jornada y la que decide la
 * presencia. Los maestros, la programación y el resto de lo operacional son
 * asunto del cron diario.
 *
 * La pantalla ya lo hace sola al abrirse si el dato tiene más de 15 minutos;
 * este botón es para **no esperar** esa ventana: alguien que acaba de despachar
 * un bus y quiere verlo reflejado. Por eso fuerza y no respeta la ventana.
 *
 * Permiso: el del módulo `ausentismo`, el mismo que para ver la pantalla. No
 * exige `puedeEditar` porque no cambia datos de la empresa — solo vuelve a
 * traer de GEMA lo que ya es de GEMA, y es idempotente.
 */
export async function refrescarDespacho(): Promise<ResultadoRefresco> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    return { ok: false, error: "No tienes acceso al módulo de Ausentismo." };
  }

  const hoy = hoyBogota();
  const refresco = await refrescarDespachoDelDia(hoy, hoy, { forzar: true });
  if (refresco.error) {
    return { ok: false, error: refresco.error, refresco };
  }

  revalidatePath("/ausentismo/marcaciones");
  return { ok: true, refresco };
}
