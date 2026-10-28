/**
 * Conductor dominante de un bus en la ventana del histórico. Parte PURA: se
 * prueba sola (`dominante.test.ts`).
 *
 * Solo puede ganar quien `admite` acepta —en la pantalla, los conductores
 * activos de la plantilla—. Sin ese filtro, un conductor retirado seguía
 * saliendo como esperado de su antiguo bus durante los 45 días de la ventana:
 * el 2026-10-27 el 702 salió en GEMA con la cédula de relleno `99999999`, la
 * cascada bajó al histórico y el dominante era 72231546, RETIRADO desde el
 * 2026-10-21. Había 40 retirados en esa misma ventana expuestos a lo mismo.
 */

/**
 * @param porCedula cédula -> días distintos en que sacó el bus.
 * @param admite    quién puede ser el esperado.
 * @returns el admitido con más días, y su confianza medida sobre TODOS los días
 *          del bus (incluidos los de quien no se admite), para no inflarla.
 */
export function dominanteDelBus(
  porCedula: ReadonlyMap<string, ReadonlySet<string>> | undefined,
  admite: (cedula: string) => boolean
): { cedula: string; confianza: number } | null {
  if (!porCedula) return null;
  let mejor: string | null = null;
  let mejorDias = 0;
  let total = 0;
  for (const [ced, dias] of porCedula) {
    total += dias.size;
    if (!admite(ced)) continue;
    // Empate: gana el primero leído, como antes.
    if (dias.size > mejorDias) {
      mejor = ced;
      mejorDias = dias.size;
    }
  }
  if (!mejor || total === 0) return null;
  return { cedula: mejor, confianza: mejorDias / total };
}
