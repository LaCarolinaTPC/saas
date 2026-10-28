/**
 * De dónde salen los permisos de un usuario, según el interruptor
 * `app_settings` → `permisos.motor`:
 *
 *  - `viejo` / `sombra` (o sin migración): del sistema anterior (`profiles` +
 *    `user_types`), traducido con la equivalencia probada. Es EXACTAMENTE el
 *    acceso de antes, pero expresado como permisos nuevos, así que todos los
 *    guardianes pueden usar ya el motor nuevo sin cambiar a quién dejan pasar.
 *  - `nuevo`: de las tablas nuevas (`usuario_roles`, `rol_permisos`,
 *    `usuario_permisos`).
 *
 * Recibe el cliente de base para poder usarse desde el proxy, que arma el suyo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { accesoViejo, permisosDeAccesoViejo, type RolViejo } from "./equivalencia";
import { permisosEfectivos, SIN_PERMISOS, type PermisosEfectivos } from "./motor";

export type Motor = "viejo" | "sombra" | "nuevo";
export const CLAVE_MOTOR = "permisos.motor";

let cacheMotor: { valor: Motor; hasta: number } | null = null;

/** El interruptor, recordado 30 s por proceso. Sin valor: `viejo`. */
export async function motorActual(db: SupabaseClient): Promise<Motor> {
  if (cacheMotor && cacheMotor.hasta > Date.now()) return cacheMotor.valor;
  let valor: Motor = "viejo";
  try {
    const { data } = await db.from("app_settings").select("value").eq("key", CLAVE_MOTOR).maybeSingle();
    const v = (data?.value as string | undefined)?.trim();
    if (v === "sombra" || v === "nuevo") valor = v;
  } catch {
    // Sin tabla o sin red: manda el viejo.
  }
  cacheMotor = { valor, hasta: Date.now() + 30_000 };
  return valor;
}

/** Al cambiar el interruptor desde este proceso, que se lea de nuevo ya. */
export function olvidarMotor(): void {
  cacheMotor = null;
}

export interface PermisosDeUsuario {
  motor: Motor;
  efectivos: PermisosEfectivos;
  /** Claves de sus roles (en el viejo, su único `user_type`). */
  roles: string[];
  /** El perfil leído (select *), para quien lo necesite. */
  perfil: Record<string, unknown> | null;
  /** El `user_types` del perfil (sistema viejo); null en `nuevo`. */
  rolViejo: RolViejo | null;
}

const VACIO = (motor: Motor): PermisosDeUsuario => ({ motor, efectivos: SIN_PERMISOS, roles: [], perfil: null, rolViejo: null });

/** Lanza solo si la base falla; sin perfil o sin rol devuelve sin permisos. */
export async function permisosDeUsuario(db: SupabaseClient, userId: string): Promise<PermisosDeUsuario> {
  const motor = await motorActual(db);
  // select("*") a propósito: columnas que pueden faltar en instalaciones viejas.
  const { data: perfil, error } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil) return VACIO(motor);

  if (motor === "nuevo") {
    const { roles, efectivos } = await efectivosDesdeTablas(db, userId);
    return { motor, perfil, rolViejo: null, roles, efectivos };
  }

  const userType = (perfil.user_type as string | null) ?? null;
  if (!userType) return { ...VACIO(motor), perfil };
  const { data: tipo, error: e5 } = await db.from("user_types").select("*").eq("key", userType).maybeSingle();
  if (e5) throw new Error(e5.message);
  if (!tipo) return { ...VACIO(motor), perfil };
  const rolViejo = tipo as RolViejo;
  const a = accesoViejo(
    { id: userId, user_type: userType, permisos_individuales: perfil.permisos_individuales, role: (perfil.role as string | null) ?? null },
    rolViejo
  );
  return {
    motor,
    perfil,
    rolViejo,
    roles: [userType],
    efectivos: a.isAdmin
      ? permisosEfectivos({ roles: [{ super: true, permisos: [] }] })
      : permisosEfectivos({ roles: [{ permisos: permisosDeAccesoViejo(a) }] }),
  };
}

/** Permisos según las tablas nuevas (roles activos + individuales). */
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
 * Pantalla de inicio propia de un rol, cuando no es la primera del menú. El
 * rol Tesorería entra directo a la Caja de devengados (antes, un caso especial
 * escrito en el proxy).
 */
export const INICIO_POR_ROL: Record<string, string> = {
  tesoreria: "/tesoreria/devengados",
};
