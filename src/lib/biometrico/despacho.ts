/**
 * Presencia según el despacho de GEMA. Parte PURA: se prueba sola.
 *
 * La regla, pedida el 2026-10-19: si la cédula del conductor aparece en
 * `historico_despacho` con un viaje que de verdad salió, se asume que **no está
 * ausente**, y ese primer viaje es la prueba que se muestra. Las huellas del
 * biométrico quedan por fuera de la decisión por ahora.
 *
 * ## Por qué no basta con que exista la fila
 *
 * `historico_despacho` trae también lo que estaba programado y no rodó, así que
 * la fila sola no prueba nada. Medido sobre las 6.560 filas del 6 al 19 de
 * octubre de 2026:
 *
 * | estado          | filas | hora real | con llegada | con timbradas |
 * |-----------------|-------|-----------|-------------|---------------|
 * | `DESPACHADO`    |  4886 |      4886 |        4515 |          4775 |
 * | `NO_DESPACHADO` |  1274 |      1255 |          18 |             0 |
 * | `POR_DESPACHAR` |   273 |         0 |           0 |             0 |
 * | `NO_FINALIZADO` |   105 |       105 |         101 |           102 |
 * | `PENDIENTE`     |    13 |        13 |          13 |            13 |
 * | `POR_LIQUIDAR`  |     9 |         9 |           7 |             0 |
 *
 * Dos trampas que salieron de ahí:
 *
 * 1. **`POR_DESPACHAR` trae `hora_despacho = 00:00:00`**: es el relleno de lo
 *    que todavía no sale. Son los turnos de más tarde del mismo día.
 * 2. **`NO_DESPACHADO` trae hora real** (1.255 de 1.274) y aun así no rodó: esa
 *    hora es la **planeada**. Fiarse de la hora habría dado por presentes 1.255
 *    viajes que nunca salieron.
 *
 * Lo que de verdad separa un viaje que rodó es la evidencia física: las
 * **timbradas** (0 en las 1.274 de `NO_DESPACHADO` y en las 273 de
 * `POR_DESPACHAR`; 4.775 de 4.886 en `DESPACHADO`).
 *
 * De ahí la regla de abajo: la lista de estados, **o** evidencia de timbradas.
 * Hoy la segunda no cambia ningún número —0 filas entran solo por ella— y está
 * puesta como red: si GEMA agrega un estado nuevo para un viaje que sí rodó, se
 * cuenta igual en vez de aparecer como una ausencia falsa.
 */

import { esPersona } from "./plantilla";

/** Una fila de `historico_despacho`, con lo que hace falta para decidir. */
export interface FilaDespacho {
  conductor_ced: string | null;
  hora_despacho: string | null;
  codigo: string | null;
  turno: number | null;
  viaje: number | null;
  estado: string | null;
  ruta_programada: string | null;
  timbradas: number | null;
}

/**
 * Estados en que el viaje salió a rodar.
 *
 * Quedan fuera a propósito `POR_DESPACHAR` (programado, aún no sale) y
 * `NO_DESPACHADO` (no rodó, aunque traiga hora planeada).
 */
export const ESTADOS_SALIO: ReadonlySet<string> = new Set([
  "DESPACHADO",
  "NO_FINALIZADO",
  "PENDIENTE",
  "POR_LIQUIDAR",
]);

/**
 * Estados en que el viaje todavía **puede** salir: el turno no ha empezado.
 *
 * Solo `POR_DESPACHAR`, y las 273 filas de octubre traen `hora_despacho =
 * 00:00:00`, coherente con «aún no pasa nada».
 *
 * `NO_DESPACHADO` queda FUERA a propósito, y la diferencia importa: ese viaje
 * ya no va a salir. Si a alguien se le cayeron todos sus viajes, lo correcto es
 * que aparezca como candidato a ausencia para que RRHH lo mire —el bus se pudo
 * varar, pero también pudo no presentarse—, no esconderlo en «turno sin
 * empezar».
 */
export const ESTADOS_PENDIENTE: ReadonlySet<string> = new Set(["POR_DESPACHAR"]);

/** ¿Ese viaje todavía puede salir? */
export function sigueEnEspera(fila: Pick<FilaDespacho, "estado">): boolean {
  return ESTADOS_PENDIENTE.has((fila.estado ?? "").trim().toUpperCase());
}

/** Hora de relleno de lo que todavía no sale. */
const HORA_RELLENO = "00:00:00";

/**
 * ¿Ese viaje salió a rodar?
 *
 * Pide solo las dos columnas que decide, para que el histórico de 45 días —que
 * no necesita hora ni ruta— pueda usar la misma regla sin traer campos de más.
 */
export function salioARodar(fila: Pick<FilaDespacho, "estado" | "timbradas">): boolean {
  if ((fila.timbradas ?? 0) > 0) return true;
  const estado = (fila.estado ?? "").trim().toUpperCase();
  return ESTADOS_SALIO.has(estado);
}

/** El primer viaje que salió, que es la prueba de que la persona vino. */
export interface PrimerViaje {
  /** Hora del despacho, tal cual la trae GEMA (`HH:MM:SS`). */
  hora: string;
  bus: string | null;
  turno: number | null;
  viaje: number | null;
  ruta: string | null;
  estado: string | null;
  /** Viajes que ya salieron ese día. */
  viajes: number;
}

export interface PresenciaDelDia {
  /** Cédula -> su primer viaje. Estar aquí es «no está ausente». */
  trabajaron: Map<string, PrimerViaje>;
  /**
   * Cédulas con algún viaje que **todavía puede salir** y ninguno que haya
   * salido. No son ausencias: su turno no ha empezado. El primer viaje real del
   * día va de las 03:55 a las 16:40, así que «hoy» siempre está a medias.
   *
   * A quien se le cayeron todos los viajes (`NO_DESPACHADO`) NO está aquí: sale
   * como candidato a ausencia, que es lo que hay que mirar.
   */
  porSalir: Set<string>;
}

/**
 * Agrupa las filas del día por conductor y saca su primer viaje.
 *
 * Una fila sin cédula se ignora: no se puede atribuir. En la práctica no pasa
 * —0 de 6.560 filas de octubre vienen sin `conductor_ced`— pero la columna
 * admite nulos.
 */
export function presenciaDelDia(filas: FilaDespacho[]): PresenciaDelDia {
  const trabajaron = new Map<string, PrimerViaje>();
  const enEspera = new Set<string>();

  for (const f of filas) {
    const cedula = (f.conductor_ced ?? "").trim();
    // Sin cédula no se puede atribuir, y las de relleno no son personas: un
    // bus despachado sin conductor no es alguien que vino.
    if (!esPersona(cedula)) continue;
    if (sigueEnEspera(f)) enEspera.add(cedula);
    if (!salioARodar(f)) continue;

    // Una hora de relleno en un viaje que salió no debería existir (0 casos en
    // octubre), pero si apareciera no puede ganar como «primer viaje».
    const hora = (f.hora_despacho ?? "").trim() || HORA_RELLENO;
    const ya = trabajaron.get(cedula);
    if (!ya) {
      trabajaron.set(cedula, {
        hora,
        bus: f.codigo ?? null,
        turno: f.turno ?? null,
        viaje: f.viaje ?? null,
        ruta: f.ruta_programada ?? null,
        estado: f.estado ?? null,
        viajes: 1,
      });
      continue;
    }
    ya.viajes += 1;
    const mejor = ya.hora === HORA_RELLENO || (hora !== HORA_RELLENO && hora < ya.hora);
    if (mejor) {
      ya.hora = hora;
      ya.bus = f.codigo ?? null;
      ya.turno = f.turno ?? null;
      ya.viaje = f.viaje ?? null;
      ya.ruta = f.ruta_programada ?? null;
      ya.estado = f.estado ?? null;
    }
  }

  // Quien ya rodó no está esperando nada, aunque le queden viajes por salir.
  const porSalir = new Set<string>();
  for (const c of enEspera) if (!trabajaron.has(c)) porSalir.add(c);

  return { trabajaron, porSalir };
}
