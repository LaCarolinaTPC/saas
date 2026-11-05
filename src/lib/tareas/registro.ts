/**
 * Las tareas que corre el latido (ver `reglas.ts` y `ejecutor.ts`).
 *
 * Para agregar una: un `id` estable (es la llave en `tareas_programadas`), de
 * dónde sale su hora y si está activa, y qué hace. Lo que devuelve `ejecutar`
 * queda en `ultimo_resultado`; si lanza, el error queda anotado y el siguiente
 * latido la reintenta.
 */
import { registrarPendientesDelDia } from "@/lib/biometrico/data";
import { leerConfiguracion } from "@/lib/biometrico/pendientes-auto";
import { hoyBogota } from "@/lib/operativo/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardarUltimasPosiciones } from "@/lib/gema/gps";

export interface Tarea {
  id: string;
  nombre: string;
  /**
   * Solo la corre el latido de alguien con Gestivo abierto, nunca el del TV:
   * para tareas que solo sirven mientras alguien mira (el TV está prendido día
   * y noche y la correría sin que nadie la vea).
   */
  soloConUsuarios?: boolean;
  /** `cadaMinutos`: repetir en tramos desde `hora` (sin él, una vez al día). */
  programacion(): Promise<{ hora: string; activa: boolean; cadaMinutos?: number }>;
  ejecutar(ctx: { hoy: string; manual: boolean }): Promise<Record<string, unknown>>;
}

/** Id de la tarea de ausentes de Marcaciones. */
export const TAREA_PENDIENTES = "ausentismo.pendientes";

export const TAREAS: Tarea[] = [
  {
    id: TAREA_PENDIENTES,
    nombre: "Registrar como pendientes según los filtros de Marcaciones",
    // El interruptor «Registrar solo» y los filtros de Marcaciones: la hora y
    // si corre dependen del tipo de día de HOY (lunes a viernes, sábado,
    // domingo, festivo).
    async programacion() {
      const c = await leerConfiguracion(hoyBogota());
      return { hora: c.hora, activa: c.activo && c.diaActivo };
    },
    async ejecutar({ hoy, manual }) {
      const r = await registrarPendientesDelDia(hoy, { manual });
      if (r.error) throw new Error(r.error);
      return { creados: r.creados, eliminados: r.eliminados, motivo: r.motivo, detalle: r.detalle };
    },
  },
  {
    id: "gps.ultimas_posiciones",
    nombre: "Copiar de GEMA la última posición GPS de cada bus (cada 5 minutos)",
    // Todo el día: lo que importa es tener la foto fresca mientras alguien mira.
    // Por eso no la corre el TV (consultaba GEMA cada 5 minutos toda la noche).
    soloConUsuarios: true,
    async programacion() {
      return { hora: "00:00", activa: true, cadaMinutos: 5 };
    },
    async ejecutar() {
      return guardarUltimasPosiciones(createAdminClient());
    },
  },
  {
    id: "permisos.limpiar_metricas",
    nombre: "Borrar métricas de permisos de más de 180 días (las incidencias se conservan)",
    async programacion() {
      return { hora: "03:00", activa: true };
    },
    async ejecutar() {
      const limite = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
      const { error, count } = await createAdminClient().from("permisos_metricas_dia").delete({ count: "exact" }).lt("dia", limite);
      if (error) throw new Error(error.message);
      return { borradas: count ?? 0, antesDe: limite };
    },
  },
];
