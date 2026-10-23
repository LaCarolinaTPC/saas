/**
 * Formato de horas y fechas de la pantalla de Marcaciones.
 *
 * Vivía dentro de `marcaciones-client.tsx`. Se saca aquí porque ahora lo usan
 * también las descargas (`marcaciones-export.ts`), y **el archivo tiene que
 * decir la misma hora que la pantalla**: si cada uno formatea por su cuenta,
 * un PDF con horas distintas a lo que se ve es peor que no tener PDF.
 *
 * Por qué `Intl` con `America/Bogota` y no cortar el texto ISO: **PostgREST
 * devuelve los `timestamptz` normalizados a `+00:00`**, no en la zona en que
 * se escribieron. El agente manda `2026-10-13T06:42:10-05:00` y al releerlo
 * vuelve como `2026-10-13T11:42:10+00:00`; leer el `HH:MM` del texto mostraba
 * UTC, cinco horas adelantado.
 */
const EN_BOGOTA = { timeZone: "America/Bogota" } as const;

/** `HH:MM` en hora de Colombia de un instante ISO. */
export function hora(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    ...EN_BOGOTA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t));
}

/** `DD/MM` en hora de Colombia de un instante ISO (o de una fecha `YYYY-MM-DD`). */
export function fechaCorta(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat("es-CO", {
    ...EN_BOGOTA,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(t));
}

/** `HH:MM:SS` de GEMA a `HH:MM`. Ya viene en hora de Colombia, sin zona. */
export function horaCorta(h: string | null | undefined): string {
  return h && h.length >= 5 ? h.slice(0, 5) : "—";
}

/** `2026-10-20` → `martes, 20 de octubre de 2026`, para el título del informe. */
export function fechaLarga(fecha: string): string {
  const t = Date.parse(`${fecha}T12:00:00-05:00`);
  if (Number.isNaN(t)) return fecha;
  return new Intl.DateTimeFormat("es-CO", {
    ...EN_BOGOTA,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(t));
}
