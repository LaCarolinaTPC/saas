import { createAdminClient } from "@/lib/supabase/admin";
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

/** Función de Tesorería que respalda cada aviso de Recobros. */
const FUNCION_AVISO: Record<Exclude<keyof RolRecobros, "mantenimiento">, string> = {
  auxiliar: "cartulina",
  caja: "caja",
  directora: "recobros_incobrable",
  subgerencia: "recobros_subgerencia",
  operativo: "recobros_operativo",
  directorMantenimiento: "recobros_correcciones",
};

/**
 * Para quién son los avisos de Recobros. Un usuario normal: lo que puede
 * hacer (`rolRecobros`). Un administrador lo puede todo, pero los avisos de
 * todos los roles serían ruido: solo ve los de las funciones que tenga
 * asignadas de forma explícita (permiso individual o un rol que no sea super),
 * con «Crear y editar».
 */
export async function rolAvisosRecobros(perms: Permissions): Promise<RolRecobros> {
  if (!perms.isAdmin) return rolRecobros(perms).acciones;
  const rol: RolRecobros = {
    auxiliar: false, mantenimiento: false, directorMantenimiento: false, subgerencia: false,
    caja: false, operativo: false, directora: false,
  };
  if (!perms.userId) return rol;
  const db = createAdminClient();
  const [{ data: up }, { data: ur }] = await Promise.all([
    db.from("usuario_permisos").select("permiso, concedido").eq("user_id", perms.userId).like("permiso", "tesoreria.%"),
    db.from("usuario_roles").select("rol").eq("user_id", perms.userId),
  ]);
  const claves = (ur ?? []).map((r) => String(r.rol));
  const { data: roles } = claves.length
    ? await db.from("roles").select("clave").in("clave", claves).eq("activo", true).eq("es_super", false)
    : { data: [] };
  const deRoles = roles?.length
    ? (await db.from("rol_permisos").select("permiso").in("rol", roles.map((r) => String(r.clave))).like("permiso", "tesoreria.%")).data ?? []
    : [];
  const tiene = new Set(deRoles.map((r) => String(r.permiso)));
  for (const p of up ?? []) {
    if (p.concedido) tiene.add(String(p.permiso));
    else tiene.delete(String(p.permiso));
  }
  for (const [k, f] of Object.entries(FUNCION_AVISO) as [keyof typeof FUNCION_AVISO, string][]) {
    rol[k] = tiene.has(`tesoreria.${f}.editar`);
  }
  return rol;
}
