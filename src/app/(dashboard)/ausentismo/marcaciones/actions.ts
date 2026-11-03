"use server";

/**
 * Acciones de la pantalla de Marcaciones.
 */
import { revalidatePath } from "next/cache";
import { getCurrentPermissions, canAccess, puedeEditarEn } from "@/lib/permissions";
import { setSettingValue } from "@/lib/settings";
import { CLAVE_ACTIVO } from "@/lib/biometrico/auto-pendientes";
import {
  CLAVE_REGLAS,
  parsearReglas,
  validarReglas,
  type ReglasPendientes,
  type ResultadoPrueba,
} from "@/lib/biometrico/reglas-pendientes";
import { getSimulacionDelDia } from "@/lib/biometrico/data";
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

export interface ResultadoActivo {
  ok: boolean;
  error?: string;
  activo?: boolean;
}

/**
 * El interruptor general «Registrar solo»: si Gestivo deja escritos los
 * pendientes. La hora y los días ya no van aquí: dependen del tipo de día y
 * se editan en «Configurar filtros».
 *
 * Exige `puedeEditar` —a diferencia de `refrescarDespacho`— porque sí cambia el
 * comportamiento del módulo: de esto depende que se creen registros de
 * ausentismo solos.
 */
export async function guardarActivoPendientes(activo: boolean): Promise<ResultadoActivo> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    return { ok: false, error: "No tienes acceso al módulo de Ausentismo." };
  }
  // El mismo criterio que usa la página para pintar los botones de edición
  // (ver page.tsx): administrador, o con permiso de edición.
  if (!puedeEditarEn(perms, "ausentismo")) {
    return { ok: false, error: "No tienes permiso para cambiar la configuración." };
  }
  await setSettingValue(CLAVE_ACTIVO, activo ? "si" : "no", perms.userId ?? undefined);
  revalidatePath("/ausentismo/marcaciones");
  revalidatePath("/ausentismo");
  return { ok: true, activo };
}

export interface ResultadoReglas {
  ok: boolean;
  error?: string;
}

/**
 * Guarda los filtros de los pendientes automáticos. **Mandan sobre la tarea
 * real** desde la siguiente pasada: a quién registra, qué días corre y a qué
 * hora. Cambiar la hora de hoy cambia la ranura de la tarea, así que si ya
 * corrió puede volver a correr con la nueva (como pasaba al cambiar la hora).
 */
export async function guardarFiltrosPendientes(reglas: ReglasPendientes): Promise<ResultadoReglas> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    return { ok: false, error: "No tienes acceso al módulo de Ausentismo." };
  }
  if (!puedeEditarEn(perms, "ausentismo")) {
    return { ok: false, error: "No tienes permiso para cambiar la configuración." };
  }
  const error = validarReglas(reglas);
  if (error) return { ok: false, error };

  // Se guarda lo que `parsearReglas` entiende: descarta campos de más que
  // vinieran del cliente. Lo validado pasa igual (lo cubre la prueba de ida y
  // vuelta en `reglas-pendientes.test.ts`).
  const limpio = parsearReglas(JSON.stringify(reglas));
  await setSettingValue(CLAVE_REGLAS, JSON.stringify(limpio), perms.userId ?? undefined);

  revalidatePath("/ausentismo/marcaciones");
  revalidatePath("/ausentismo");
  return { ok: true };
}

export interface ResultadoSimulacion {
  ok: boolean;
  error?: string;
  resultado?: ResultadoPrueba;
}

/**
 * La «Prueba de filtros» de otro día, para el calendario de la sección. Solo
 * lee: basta con el permiso de ver el módulo.
 */
export async function simularReglasEnFecha(fecha: string): Promise<ResultadoSimulacion> {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    return { ok: false, error: "No tienes acceso al módulo de Ausentismo." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha + "T12:00:00Z"))) {
    return { ok: false, error: "Fecha inválida." };
  }
  const hoy = hoyBogota();
  if (fecha > hoy) return { ok: false, error: "Solo se puede probar hasta hoy." };
  try {
    const { resultado } = await getSimulacionDelDia(fecha, hoy);
    return { ok: true, resultado };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo simular ese día." };
  }
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
