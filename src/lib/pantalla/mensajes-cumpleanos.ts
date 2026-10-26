/**
 * Mensajes de felicitación del widget de cumpleaños a pantalla completa.
 *
 * Están escritos para servir igual a una persona que a varias («su día»,
 * «su vida») y sin género, porque el widget no sabe ni lo uno ni lo otro de
 * antemano. Puro: se prueba con node --test.
 */

export const MENSAJES_CUMPLEANOS = [
  "Que este nuevo año llegue cargado de salud, alegría y muchos kilómetros sin contratiempos.",
  "Todo el equipo celebra con alegría este día tan especial. ¡Que se cumplan todos sus sueños!",
  "Gracias por el esfuerzo de cada día. ¡Hoy la celebración es en su honor!",
  "Que la vida siempre ponga en su camino buenas rutas, buenas personas y muchas razones para sonreír.",
  "Hoy celebramos su vida y su valioso trabajo en esta gran familia. ¡Feliz día!",
  "Que cada kilómetro de este nuevo año esté lleno de bendiciones, salud y prosperidad.",
  "Su compromiso mueve a esta empresa: hoy toda la alegría es para celebrar su día.",
  "Que este nuevo año traiga nuevas metas, nuevos logros y mucha felicidad junto a su familia.",
  "Deseamos que este día esté lleno de sonrisas, abrazos y momentos inolvidables.",
  "Con cariño y gratitud, todo el equipo celebra su día. ¡Muchas felicidades!",
  "Que nunca falten la salud, el trabajo y la alegría. ¡Muchas bendiciones en este nuevo año!",
  "Un año más de vida es un regalo: que sea un día para disfrutar al máximo.",
] as const;

/** Para quienes cumplen años en la empresa (mismas reglas: sirven a una o a varias personas, sin género). */
export const MENSAJES_ANIVERSARIO = [
  "Gracias por su compromiso y por cada kilómetro recorrido junto a esta empresa.",
  "Su experiencia y dedicación hacen grande a esta familia. ¡Gracias por seguir en la ruta!",
  "Celebramos su trayectoria, su esfuerzo y su lealtad. ¡Por muchos años más!",
  "Su trabajo de cada día mueve a la ciudad y a esta empresa. ¡Gracias de corazón!",
  "Un año más construyendo juntos. Gracias por su confianza y su entrega.",
  "Su constancia es ejemplo para todo el equipo. ¡Que vengan muchos logros más!",
  "Gracias por hacer parte de esta historia. ¡Felicitaciones por un año más con nosotros!",
  "Hoy reconocemos el camino recorrido a nuestro lado. ¡Gracias por tanto!",
  "Que este nuevo año en la empresa traiga nuevos retos, aprendizajes y satisfacciones.",
  "Cada año a su lado es un orgullo para todo el equipo. ¡Muchas felicidades!",
] as const;

/** «1 año», «10 años». */
export const textoAnios = (n: number) => (n === 1 ? "1 año" : `${n} años`);

/**
 * Índice de un mensaje al azar, distinto del `anterior` cuando hay más de
 * uno: así el TV no repite el mismo mensaje dos vueltas seguidas.
 * `azar` en [0, 1), por defecto Math.random (inyectable para los tests).
 */
export function elegirMensaje(cantidad: number, anterior: number | null, azar: number = Math.random()): number {
  if (cantidad <= 1) return 0;
  const a = Math.min(0.999999, Math.max(0, azar));
  if (anterior == null || anterior < 0 || anterior >= cantidad) return Math.floor(a * cantidad);
  // Se elige entre los otros `cantidad - 1` y se salta el anterior.
  const i = Math.floor(a * (cantidad - 1));
  return i >= anterior ? i + 1 : i;
}

/** «Ana Pérez», «Ana Pérez y Luis Gómez», «Ana, Luis y Marta». */
export function unirNombres(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}
