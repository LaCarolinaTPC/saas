// Alertas de un tanqueo de combustible. Aparte del lector del archivo para que
// las pantallas de cliente las usen sin cargar la librería de Excel.

export const ALERTAS_COMBUSTIBLE = [
  "vehiculo_no_existe",
  "placa_distinta",
  "interno_por_placa",
  "factura_compartida",
  "precio_distinto",
  "volumen_alto",
  "sin_hora",
] as const;
export type AlertaCombustible = (typeof ALERTAS_COMBUSTIBLE)[number];

/** Por encima de esto un tanqueo se marca; el p99,9 de 2026 es 41 galones. */
export const GALONES_ALTO = 45;

export const ALERTA_COMBUSTIBLE_LABEL: Record<AlertaCombustible, string> = {
  vehiculo_no_existe: "bus fuera del maestro",
  placa_distinta: "placa distinta a la del maestro",
  interno_por_placa: "bus tomado de la placa",
  factura_compartida: "factura a nombre de varios buses",
  precio_distinto: "precio por galón distinto al del día",
  volumen_alto: `más de ${GALONES_ALTO} galones`,
  sin_hora: "sin hora",
};
