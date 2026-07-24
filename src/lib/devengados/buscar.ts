/**
 * Regla de búsqueda por código (solicitud de Nestor, 24-jul-2026): si lo
 * digitado son solo dígitos cortos se trata como CÓDIGO de conductor (o de
 * vehículo) y debe coincidir EXACTO — buscar "114" no puede traer 11142.
 * Las cédulas (7+ dígitos) y los nombres siguen con coincidencia parcial.
 */
export function esBusquedaCodigo(q: string): boolean {
  return /^\d{1,6}$/.test(q);
}
