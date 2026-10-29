import { canAccessSub, puedeEditarEn, type Permissions } from "@/lib/permissions";
import type { RolRecobros } from "./recobros";

/**
 * Quién abre la página de Recobros y qué puede hacer en ella. Cada rol es una
 * función de Tesorería: cartulina (auxiliar), caja (cajeros),
 * recobros_incobrable (directora), y las sensibles de la fase 5:
 * recobros_subgerencia, recobros_operativo y recobros_correcciones (director
 * de Mantenimiento). Un cajero sin otro rol solo ve los recobros por cobrar.
 * Actuar exige además «Crear y editar» en esa función.
 */
export function rolRecobros(perms: Permissions) {
  const sub = (s: string) => canAccessSub(perms, "tesoreria", s);
  const edita = (s: string) => sub(s) && puedeEditarEn(perms, `tesoreria.${s}`);
  const cartulina = sub("cartulina");
  const caja = sub("caja");
  const directora = sub("recobros_incobrable");
  const subgerencia = sub("recobros_subgerencia");
  const operativo = sub("recobros_operativo");
  const correcciones = sub("recobros_correcciones");
  const admin = perms.isAdmin;
  /** Lo que la persona puede hacer (para las reglas y los botones). */
  const acciones: RolRecobros = {
    auxiliar: edita("cartulina"),
    mantenimiento: false,
    directorMantenimiento: edita("recobros_correcciones"),
    subgerencia: edita("recobros_subgerencia"),
    caja: edita("caja"),
    operativo: edita("recobros_operativo"),
    directora: edita("recobros_incobrable"),
  };
  return {
    ve: admin || cartulina || caja || directora || subgerencia || operativo || correcciones,
    soloCajero: caja && !cartulina && !directora && !subgerencia && !operativo && !correcciones && !admin,
    acciones,
  };
}
