import { canAccessSub, type Permissions } from "@/lib/permissions";

/**
 * Quién abre la página de Recobros y qué ve. Mientras la fase 5 no cree la
 * función propia del módulo (con subgerencia, Operativo y el director de
 * Mantenimiento), entran los mismos de la pestaña «Solicitudes a cámaras»:
 * cartulina, caja y la directora (recobros_incobrable). Un cajero sin otro
 * rol ve solo los recobros por cobrar.
 */
export function rolRecobros(perms: Permissions) {
  const cartulina = canAccessSub(perms, "tesoreria", "cartulina");
  const caja = canAccessSub(perms, "tesoreria", "caja");
  const directora = canAccessSub(perms, "tesoreria", "recobros_incobrable");
  const admin = perms.isAdmin;
  return {
    ve: admin || cartulina || caja || directora,
    soloCajero: caja && !cartulina && !directora && !admin,
    cartulina, caja, directora, admin,
  };
}
