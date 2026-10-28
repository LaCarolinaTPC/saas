/**
 * Las tareas que corre el latido (ver `reglas.ts` y `ejecutor.ts`).
 *
 * Para agregar una: un `id` estable (es la llave en `tareas_programadas`), de
 * dónde sale su hora y si está activa, y qué hace. Lo que devuelve `ejecutar`
 * queda en `ultimo_resultado`; si lanza, el error queda anotado y el siguiente
 * latido la reintenta.
 */
import { getSettingValue } from "@/lib/settings";
import { CLAVE_ACTIVO, CLAVE_HORA, horaEfectiva } from "@/lib/biometrico/auto-pendientes";
import { registrarPendientesDelDia } from "@/lib/biometrico/data";

export interface Tarea {
  id: string;
  nombre: string;
  programacion(): Promise<{ hora: string; activa: boolean }>;
  ejecutar(ctx: { hoy: string; manual: boolean }): Promise<Record<string, unknown>>;
}

/** Id de la tarea de ausentes de Marcaciones. */
export const TAREA_PENDIENTES = "ausentismo.pendientes";

export const TAREAS: Tarea[] = [
  {
    id: TAREA_PENDIENTES,
    nombre: "Registrar como pendientes a los que no rodaron ni marcaron (Marcaciones)",
    // La misma hora y el mismo interruptor que se editan en Marcaciones.
    async programacion() {
      const [hora, activo] = await Promise.all([getSettingValue(CLAVE_HORA), getSettingValue(CLAVE_ACTIVO)]);
      return { hora: horaEfectiva(hora), activa: (activo ?? "si").trim().toLowerCase() !== "no" };
    },
    async ejecutar({ hoy, manual }) {
      const r = await registrarPendientesDelDia(hoy, { manual });
      if (r.error) throw new Error(r.error);
      return { creados: r.creados, eliminados: r.eliminados, motivo: r.motivo, detalle: r.detalle };
    },
  },
];
