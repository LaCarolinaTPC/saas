/**
 * De dónde salen los permisos de un usuario: las tablas del sistema de roles
 * (`usuario_roles`, `roles`, `rol_permisos`, `usuario_permisos`). El sistema
 * anterior (`profiles.user_type` + `user_types`) se retiró el 2026-11-10.
 *
 * Recibe el cliente de base para poder usarse desde el proxy, que arma el suyo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { permisosEfectivos, puede, SIN_PERMISOS, type PermisosEfectivos } from "./motor";

export interface PermisosDeUsuario {
  efectivos: PermisosEfectivos;
  /** Claves de sus roles activos. */
  roles: string[];
  /** El perfil leído (select *), para quien lo necesite. */
  perfil: Record<string, unknown> | null;
}

/** Lanza solo si la base falla; sin perfil devuelve sin permisos. */
export async function permisosDeUsuario(db: SupabaseClient, userId: string): Promise<PermisosDeUsuario> {
  // select("*") a propósito: columnas que pueden faltar en instalaciones viejas.
  const { data: perfil, error } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil) return { efectivos: SIN_PERMISOS, roles: [], perfil: null };
  const { roles, efectivos } = await efectivosDesdeTablas(db, userId);
  return { perfil, roles, efectivos };
}

/** Permisos según las tablas de roles (roles activos + individuales). */
export async function efectivosDesdeTablas(
  db: SupabaseClient,
  userId: string
): Promise<{ roles: string[]; efectivos: PermisosEfectivos }> {
  const [{ data: ur, error: e1 }, { data: up, error: e2 }] = await Promise.all([
    db.from("usuario_roles").select("rol").eq("user_id", userId),
    db.from("usuario_permisos").select("permiso, concedido").eq("user_id", userId),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);
  const claves = (ur ?? []).map((r) => String(r.rol));
  const [{ data: roles, error: e3 }, { data: rp, error: e4 }] = claves.length
    ? await Promise.all([
        db.from("roles").select("clave, es_super, activo").in("clave", claves),
        db.from("rol_permisos").select("rol, permiso").in("rol", claves),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (e3 || e4) throw new Error((e3 ?? e4)!.message);
  const activos = (roles ?? []).filter((r) => r.activo);
  return {
    roles: activos.map((r) => String(r.clave)),
    efectivos: permisosEfectivos({
      roles: activos.map((r) => ({
        super: !!r.es_super,
        permisos: (rp ?? []).filter((x) => x.rol === r.clave).map((x) => String(x.permiso)),
      })),
      concedidos: (up ?? []).filter((x) => x.concedido).map((x) => String(x.permiso)),
      quitados: (up ?? []).filter((x) => !x.concedido).map((x) => String(x.permiso)),
    }),
  };
}

/**
 * Permisos de TODOS los usuarios en una sola lectura (4 consultas), para
 * listados como los cajeros de Tesorería. Sin perfil o sin roles: sin permisos.
 */
export async function efectivosDeTodos(db: SupabaseClient): Promise<Map<string, { roles: string[]; efectivos: PermisosEfectivos }>> {
  const leer = async <T,>(tabla: string, columnas: string): Promise<T[]> => {
    const salida: T[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await db.from(tabla).select(columnas).range(desde, desde + 999);
      if (error) throw new Error(`leer ${tabla}: ${error.message}`);
      salida.push(...((data ?? []) as T[]));
      if ((data ?? []).length < 1000) return salida;
    }
  };
  const [ur, up, roles, rp] = await Promise.all([
    leer<{ user_id: string; rol: string }>("usuario_roles", "user_id, rol"),
    leer<{ user_id: string; permiso: string; concedido: boolean }>("usuario_permisos", "user_id, permiso, concedido"),
    leer<{ clave: string; es_super: boolean; activo: boolean }>("roles", "clave, es_super, activo"),
    leer<{ rol: string; permiso: string }>("rol_permisos", "rol, permiso"),
  ]);
  const rolActivo = new Map(roles.filter((r) => r.activo).map((r) => [r.clave, r]));
  const permisosDeRol = new Map<string, string[]>();
  for (const x of rp) permisosDeRol.set(x.rol, [...(permisosDeRol.get(x.rol) ?? []), x.permiso]);
  const usuarios = new Set([...ur.map((x) => x.user_id), ...up.map((x) => x.user_id)]);
  const salida = new Map<string, { roles: string[]; efectivos: PermisosEfectivos }>();
  for (const id of usuarios) {
    const suyos = ur.filter((x) => x.user_id === id && rolActivo.has(x.rol)).map((x) => x.rol);
    const ind = up.filter((x) => x.user_id === id);
    salida.set(id, {
      roles: suyos,
      efectivos: permisosEfectivos({
        roles: suyos.map((r) => ({ super: !!rolActivo.get(r)!.es_super, permisos: permisosDeRol.get(r) ?? [] })),
        concedidos: ind.filter((x) => x.concedido).map((x) => x.permiso),
        quitados: ind.filter((x) => !x.concedido).map((x) => x.permiso),
      }),
    });
  }
  return salida;
}

/**
 * Ids de los usuarios que tienen un permiso (el super lo tiene todo), para
 * notificar a quien corresponde. No mira si están desactivados: eso lo filtra
 * quien llama con `profiles.is_active`.
 */
export async function usuariosConPermiso(db: SupabaseClient, permiso: string): Promise<string[]> {
  const todos = await efectivosDeTodos(db);
  return [...todos].filter(([, x]) => puede(x.efectivos, permiso)).map(([id]) => id);
}

/**
 * Pantalla de inicio propia de un rol, cuando no es la primera del menú. El
 * rol Tesorería entra directo a la Caja de devengados (antes, un caso especial
 * escrito en el proxy).
 */
export const INICIO_POR_ROL: Record<string, string> = {
  tesoreria: "/tesoreria/devengados",
};
