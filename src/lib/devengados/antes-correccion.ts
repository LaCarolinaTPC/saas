/**
 * Vista temporal "antes de la corrección" de Liquidación Producción.
 *
 * El 06-nov-2026 se borraron 289 cierres que GEMA había rehecho el 27 y 28 de
 * octubre y que GESTIVO conservaba duplicados (135 conductores). Las filas
 * borradas quedaron en `cierres_diarios_respaldo_20261106`. Mientras se le
 * explica a cada conductor la diferencia, Operativo necesita mostrar en
 * pantalla cómo se veía su liquidación antes: esta vista suma de nuevo esas
 * filas. Es SOLO de consulta y la ve una sola persona (Helmut, Operativo).
 *
 * Para retirarla: borrar este archivo, la página antes-correccion y la opción
 * `incluirSobrantesCorreccion` de liquidacion.ts.
 */
export const TABLA_RESPALDO_CORRECCION = "cierres_diarios_respaldo_20261106";

const AUTORIZADOS = new Set(["doperativo@lacarolina.com.co"]);

export function puedeVerAntesCorreccion(email: string | null | undefined): boolean {
  return !!email && AUTORIZADOS.has(email.trim().toLowerCase());
}
