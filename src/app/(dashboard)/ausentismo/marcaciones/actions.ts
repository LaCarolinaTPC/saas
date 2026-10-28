"use server";

/**
 * Acciones de la pantalla de Marcaciones.
 */
import { revalidatePath } from "next/cache";
import { getCurrentPermissions, canAccess, puedeEditarEn } from "@/lib/permissions";
import { setSettingValue } from "@/lib/settings";
import { CLAVE_ACTIVO, CLAVE_HORA, minutosDeHora } from "@/lib/biometrico/auto-pendientes";
import { hoyBogota } from "@/lib/operativo/constants";
import { refrescarDespachoDelDia, type RefrescoDespacho } from "@/lib/gema/despacho-al-dia";
import { correrTareaManual } from "@/lib/tareas/ejecutor";
import { TAREA_PENDIENTES } from "@/lib/tareas/registro";

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
  if (!puedeEditarEn(perms, "ausentismo")) {
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

export interface ResultadoRegistroAhora {
  ok: boolean;
  error?: string;
  /** Lo que pasó, dicho para mostrar. */
  mensaje?: string;
}

/**
 * «Registrar ahora»: corre YA la tarea que deja escritos los pendientes de
 * hoy, sin esperar la hora y aunque ya hubiera corrido (sirve para quien quedó
 * sin rastro después de la pasada automática). No crea duplicados: a quien ya
 * tiene registro no le escribe nada.
 *
 * Exige `puedeEditar`, como cambiar la hora: escribe registros de ausentismo.
 */
export async function registrarPendientesAhora(): Promise<ResultadoRegistroAhora> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    return { ok: false, error: "No tienes acceso al módulo de Ausentismo." };
  }
  if (!puedeEditarEn(perms, "ausentismo")) {
    return { ok: false, error: "No tienes permiso para registrar novedades." };
  }

  const r = await correrTareaManual(TAREA_PENDIENTES, perms.userEmail);
  if (r.error) {
    return {
      ok: false,
      error: /tareas_programadas/.test(r.error)
        ? "Falta aplicar la migración «20261027234405_tareas_programadas_estilo_wp_cron» en el SQL Editor."
        : r.error,
    };
  }
  if (!r.corrio) return { ok: false, error: "Ya se está registrando en este momento; espera un minuto." };

  revalidatePath("/ausentismo/marcaciones");
  revalidatePath("/ausentismo");
  const creados = Number(r.resultado?.creados ?? 0);
  const detalle = r.resultado?.detalle as string | null | undefined;
  return {
    ok: true,
    mensaje:
      creados > 0
        ? `Se registraron ${creados} ${creados === 1 ? "pendiente" : "pendientes"}.`
        : detalle
          ? `No se registró nada: ${detalle}.`
          : "No había nadie por registrar.",
  };
}
