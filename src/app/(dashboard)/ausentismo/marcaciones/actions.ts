"use server";

/**
 * Acciones de la pantalla de Marcaciones.
 */
import { revalidatePath } from "next/cache";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { setSettingValue } from "@/lib/settings";
import { CLAVE_ACTIVO, CLAVE_HORA, minutosDeHora } from "@/lib/biometrico/auto-pendientes";
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

export interface ResultadoHora {
  ok: boolean;
  error?: string;
  hora?: string;
  activo?: boolean;
}

/**
 * Cambia la hora a la que Gestivo deja escritos los pendientes, y si lo hace.
 *
 * Exige `puedeEditar` —a diferencia de `refrescarDespacho`— porque sí cambia el
 * comportamiento del módulo: de esta hora depende que se creen registros de
 * ausentismo solos.
 */
export async function guardarHoraPendientes(
  hora: string,
  activo: boolean
): Promise<ResultadoHora> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    return { ok: false, error: "No tienes acceso al módulo de Ausentismo." };
  }
  // El mismo criterio que usa la página para pintar los botones de edición
  // (ver page.tsx): administrador, o con permiso de edición.
  if (!perms.isAdmin && !perms.puedeEditar) {
    return { ok: false, error: "No tienes permiso para cambiar la configuración." };
  }

  // Se valida con la MISMA función que decide después: si aquí se aceptara una
  // hora que allá no se entiende, el módulo caería a la de por omisión sin que
  // nadie supiera por qué.
  if (minutosDeHora(hora) === null) {
    return { ok: false, error: "La hora debe tener la forma HH:MM, entre 00:00 y 23:59." };
  }

  await Promise.all([
    setSettingValue(CLAVE_HORA, hora.trim(), perms.userId ?? undefined),
    setSettingValue(CLAVE_ACTIVO, activo ? "si" : "no", perms.userId ?? undefined),
  ]);

  revalidatePath("/ausentismo/marcaciones");
  revalidatePath("/ausentismo");
  return { ok: true, hora: hora.trim(), activo };
}
