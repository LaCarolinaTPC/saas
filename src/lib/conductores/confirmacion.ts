/**
 * ¿GEMA conoce de verdad a este conductor? Parte PURA: se prueba sola.
 *
 * ## El problema que resuelve
 *
 * Contratación crea la ficha del conductor al contratar
 * (`ensureAltaContratado` en `src/lib/contratacion/actions.ts`) con la cédula
 * que se escribió en el proceso, confiando en que «GEMA completará los datos en
 * el siguiente sync». Eso funciona… **si la cédula está bien digitada**.
 *
 * Si está mal, GEMA nunca la reconoce, el upsert por cédula nunca la toca —y
 * el sync **no borra filas**—, así que la ficha se queda en `ACTIVO` para
 * siempre. Resultado: un conductor fantasma que ninguna pantalla puede
 * distinguir de uno real, y que sale como candidato a ausencia todos los días.
 *
 * Medido el 2026-10-19 sobre las 1.289 filas de `conductores`: **19 fantasmas**,
 * los 19 en `ACTIVO`, 18 de ellos creados por Contratación. Ejemplos, con la
 * persona real al lado:
 *
 * | ficha fantasma | la real en GEMA | error |
 * |---|---|---|
 * | `100191507` ALEJANDRO GONZALEZ | `1001915077` GONZALEZ GONZALEZ ALEJANDRO ARNALDO, retirado | falta el último dígito |
 * | `100177958` DANIEL BARRIOS | `1001779588` BARRIOS LOPEZ DANIEL JOSE, retirado | falta el último dígito |
 * | `8803158` ERWIN JIMENEZ | `8803185` JIMENEZ CANTILLO ERWIN ALFREDO, retirado | dígitos transpuestos |
 * | `724432641` IVAN MARTINEZ | `72432641` MARTINEZ HOYOS IVAN ANTONIO, activo | un dígito de más |
 * | `11051674660` ROBINSON POSADA | — | 11 dígitos, imposible |
 *
 * El orden del nombre lo confirma: las fichas de Contratación se escriben
 * «NOMBRE APELLIDO» a mano y GEMA usa «APELLIDO NOMBRE».
 *
 * ## La señal
 *
 * `conductores.solo_informativo` lo dice explícitamente, y es lo que manda. Lo
 * mantiene el sync de GEMA: `false` en todo lo que la vista trae, `true` en lo
 * que sobrevive al espejo por tener historial colgando. Contratación crea sus
 * altas con `true`.
 *
 * El respaldo es `codigo` (el `codigo_personal` de GEMA), que el sync escribe
 * siempre: **los 1.270 que GEMA conoce lo tienen y ninguno de los 19
 * fantasmas**, incluidos los 1.089 retirados. Se conserva como señal porque la
 * columna la agrega una migración que se aplica a mano.
 *
 * ## Qué significa «solo informativo»
 *
 * Que la ficha se conserva **únicamente** para no perder lo que cuelga de ella
 * —había 10 registros de ausentismo y 594 marcaciones del biométrico a nombre
 * de tres de esas cédulas, que son de personas REALES mal archivadas— y que
 * **no entra en ningún proceso de la compañía**: ni plantilla de ausentismo, ni
 * base de la tasa, ni candidatos a ausencia en Marcaciones.
 *
 * ## La gracia
 *
 * Una ficha recién creada tampoco tiene código todavía: el cron de GEMA corre
 * una vez al día. Así que «sin código» solo significa fantasma **pasado un
 * plazo**. Calibrado con los datos: los 19 fantasmas tienen **66 días o más**,
 * y un conductor real aparece con código en **3 a 10 días**. 30 días deja
 * margen de sobra por los dos lados.
 */

/** Lo que hace falta de `conductores` para saber si GEMA la confirmó. */
export interface FichaConductor {
  codigo: string | null;
  created_at: string | null;
  /**
   * `conductores.solo_informativo`: la columna que lo dice en voz alta.
   *
   * Es la autoridad cuando viene. Opcional a propósito: la columna la agrega la
   * migración `20261020003247`, que en esta instalación se aplica a mano, y
   * hasta entonces la señal sigue siendo `codigo`.
   */
  solo_informativo?: boolean | null;
}

/**
 * Días que se le dan a GEMA para confirmar una ficha nueva antes de tratarla
 * como un error de digitación.
 */
export const DIAS_GRACIA_CONFIRMACION = 30;

/**
 * ¿GEMA conoce esta ficha?
 *
 * Manda `solo_informativo` cuando viene; si no, se cae a `codigo`, que es la
 * señal que se usaba antes de que existiera la columna.
 */
export function confirmadoPorGema(c: FichaConductor): boolean {
  if (c.solo_informativo === true) return false;
  if (c.solo_informativo === false) return true;
  return (c.codigo ?? "").trim().length > 0;
}

/**
 * Lo contrario, con el nombre que usa la gente: la ficha está **solo para
 * información** y no debe entrar en ningún proceso de la compañía.
 */
export function soloInformativo(c: FichaConductor): boolean {
  return !confirmadoPorGema(c);
}

/** Días calendario entre un `created_at` ISO y una fecha ISO. */
function diasDesde(creado: string, hasta: string): number {
  const a = Date.parse(creado);
  if (Number.isNaN(a)) return 0;
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.floor((b - a) / 86_400_000);
}

/**
 * ¿Es un alta de Contratación que GEMA ya debería haber confirmado y no lo
 * hizo? Entonces la cédula está mal y la ficha no corresponde a nadie.
 *
 * Sin `created_at` se devuelve `false`: no se castiga una ficha por no saber
 * cuándo nació.
 */
export function altaSinConfirmarVencida(c: FichaConductor, hoy: string): boolean {
  if (confirmadoPorGema(c)) return false;
  if (!c.created_at) return false;
  return diasDesde(c.created_at, hoy) > DIAS_GRACIA_CONFIRMACION;
}

/**
 * ¿Hay que contar a este conductor como parte de la operación?
 *
 * Es la pregunta que se hacen las pantallas: una ficha fantasma no es nadie, y
 * una recién creada sí cuenta mientras GEMA tiene plazo para confirmarla.
 */
export function cuentaComoConductor(c: FichaConductor, hoy: string): boolean {
  return !altaSinConfirmarVencida(c, hoy);
}
