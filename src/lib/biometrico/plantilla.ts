/**
 * Quién cuenta como conductor de la plantilla. Parte PURA: se prueba sola.
 *
 * Es la lista contra la que se mide la ausencia, así que meter a quien no
 * maneja llena la pantalla de falsos candidatos y meter de menos esconde
 * ausencias de verdad.
 *
 * Filtros, pedidos el 2026-10-19: **estado ACTIVO**, **sin reubicar**, sin las
 * cédulas de relleno, y **solo las que GEMA conoce**
 * (`src/lib/conductores/confirmacion.ts`).
 */
// Relativo y no con el alias `@/`: estas pruebas corren con `tsx --test` y así
// no dependen de que resuelva los `paths` del tsconfig.
import { confirmadoPorGema } from "../conductores/confirmacion";

/** Las columnas de `conductores` que deciden si entra a la plantilla. */
export interface FilaConductor {
  cedula: string | null;
  estado: string | null;
  reubicado: string | null;
  fecha_ingreso: string | null;
  /** `codigo_personal` de GEMA: su presencia confirma la ficha (respaldo). */
  codigo: string | null;
  created_at: string | null;
  /** `solo_informativo`: la señal explícita, y la que manda. */
  solo_informativo?: boolean | null;
  /** Solo la usa `activoEnFecha`; la plantilla mira el estado de hoy. */
  fecha_retiro?: string | null;
}

/**
 * Cédulas de relleno: no son personas.
 *
 * Las dos están `ACTIVO` en `conductores` y sin reubicar, así que sin este
 * filtro entraban a la plantilla y salían como candidatas a ausencia **todos
 * los días**.
 *
 * | cédula      | en `conductores`              | en el despacho                  |
 * |-------------|-------------------------------|---------------------------------|
 * | `99999999`  | `NO DEFINIDO NO DEFINIDO…`    | 130 filas en 14 días, **0 rodó** |
 * | `999999991` | `CONDUCTOR  SIN .`            | no aparece                      |
 *
 * `99999999` es el relleno de un viaje sin conductor asignado (en el despacho
 * sale con el nombre `CONDUCTOR  SIN .`), y el taller la usa. Ninguna de las
 * 130 filas salió a rodar, lo que confirma que no es nadie.
 *
 * Se filtran en los dos lados: no entran a la plantilla y no cuentan como
 * presencia, porque un bus despachado sin conductor no es una persona que vino.
 */
export const CEDULAS_NO_PERSONA: ReadonlySet<string> = new Set(["99999999", "999999991"]);

/** ¿Esa cédula es de una persona de verdad? */
export function esPersona(cedula: string | null): boolean {
  const c = (cedula ?? "").trim();
  return c.length > 0 && !CEDULAS_NO_PERSONA.has(c);
}

/**
 * ¿Está activo?
 *
 * En la base `conductores.estado` solo tiene dos valores: `ACTIVO` (200) y
 * `RETIRADO` (1.089), medido el 2026-10-19 sobre las 1.289 filas. Se acepta
 * también `"1"` por si el origen cambia a una bandera numérica.
 *
 * Nota de diseño: el criterio es el estado de HOY, no el de la fecha mirada.
 * Hay 12 conductores `ACTIVO` con `fecha_retiro` puesta —dato contradictorio
 * del origen— y el estado gana. La consecuencia es que una fecha pasada se lee
 * con la plantilla de hoy: quien se retiró la semana pasada no aparece en los
 * días en que sí trabajaba. Se eligió así a propósito, por ser una regla que
 * se puede explicar en una frase.
 */
export function estaActivo(estado: string | null): boolean {
  const s = (estado ?? "").trim().toUpperCase();
  return s === "ACTIVO" || s === "1";
}

/**
 * ¿Está reubicado? Un reubicado sigue en la empresa pero ya no maneja, así que
 * no se le espera un despacho.
 *
 * En la base `conductores.reubicado` es texto: `null` en 1.269 filas y `"SI"`
 * en 20 (16 de ellas entre los 200 activos). **No existe el valor `"0"`**, así
 * que «reubicado en 0» es el nulo. Se tratan como «no reubicado» el nulo, el
 * vacío y las formas explícitas de negación, por si el origen empieza a
 * escribirlas.
 *
 * Comprobado el 2026-10-19: de los 16 activos reubicados, **ninguno** aparece
 * rodando en `historico_despacho` ese día. No manejan.
 */
export function estaReubicado(reubicado: string | null): boolean {
  const s = (reubicado ?? "").trim().toUpperCase();
  if (!s) return false;
  return s !== "0" && s !== "NO" && s !== "FALSE" && s !== "N";
}

/**
 * ¿Se le espera trabajar esa fecha?
 *
 * Activo, sin reubicar y ya ingresado. Lo de la fecha de ingreso es aparte de
 * los otros dos: quien todavía no había entrado no puede faltar.
 */
export function entraEnPlantilla(c: FilaConductor, fecha: string): boolean {
  if (!esPersona(c.cedula)) return false;
  if (c.fecha_ingreso && c.fecha_ingreso > fecha) return false;
  if (!estaActivo(c.estado)) return false;
  if (estaReubicado(c.reubicado)) return false;
  // GEMA es el dueño del maestro: si no la conoce, no entra. Decisión del
  // usuario el 2026-10-19, y es la regla correcta aunque parezca dura — si
  // GEMA no tiene al conductor, **tampoco puede despacharlo**, porque el
  // despacho sale de ahí. Así que una ficha sin confirmar saldría como ausente
  // todos los días. Había 19 así.
  if (!confirmadoPorGema(c)) return false;
  return true;
}

/**
 * ¿Estaba activo ESA fecha? Para los esperados que se DEDUCEN de un bus
 * (despacho asignado sin salir, histórico, conductor fijo del vehículo).
 *
 * A diferencia de la plantilla, aquí sí cuenta la fecha mirada: quien está
 * RETIRADO hoy pero se retiró DESPUÉS de ese día sigue siendo esperado ese día,
 * porque su falta pudo ser real. El día del retiro ya no cuenta. Medido el
 * 2026-10-28: con el estado de hoy, el 20 de octubre perdía 4 esperados que se
 * retiraron entre el 21 y el 27; con la fecha de retiro ese día no cambia.
 *
 * Las demás reglas son las de la plantilla: persona de verdad, ya ingresada,
 * sin reubicar y confirmada por GEMA.
 */
export function activoEnFecha(c: FilaConductor, fecha: string): boolean {
  if (!esPersona(c.cedula)) return false;
  if (c.fecha_ingreso && c.fecha_ingreso > fecha) return false;
  if (estaReubicado(c.reubicado)) return false;
  if (!confirmadoPorGema(c)) return false;
  if (estaActivo(c.estado)) return true;
  return !!c.fecha_retiro && c.fecha_retiro > fecha;
}
