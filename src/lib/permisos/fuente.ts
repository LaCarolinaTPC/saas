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

  const viejo = await efectivosDesdeViejo(db, userId, perfil);
  if (!viejo) return { ...VACIO(motor), perfil };
  return { motor, perfil, ...viejo };
}

/** Permisos según el sistema viejo (`user_types`), traducidos; null sin rol válido. */
async function efectivosDesdeViejo(
  db: SupabaseClient,
  userId: string,
  perfil: Record<string, unknown>
): Promise<{ rolViejo: RolViejo; roles: string[]; efectivos: PermisosEfectivos } | null> {
  const userType = (perfil.user_type as string | null) ?? null;
  if (!userType) return null;
  const { data: tipo, error: e5 } = await db.from("user_types").select("*").eq("key", userType).maybeSingle();
  if (e5) throw new Error(e5.message);
  if (!tipo) return null;
  const rolViejo = tipo as RolViejo;
  const a = accesoViejo(
    { id: userId, user_type: userType, permisos_individuales: perfil.permisos_individuales, role: (perfil.role as string | null) ?? null },
    rolViejo
  );
  return {
    rolViejo,
    roles: [userType],
    efectivos: a.isAdmin
      ? permisosEfectivos({ roles: [{ super: true, permisos: [] }] })
      : permisosEfectivos({ roles: [{ permisos: permisosDeAccesoViejo(a) }] }),
  };
}

/** Cada cuánto se vuelve a leer el sistema que no decide, por usuario. */
export const CONTRASTE_MS = 5 * 60_000;

const cacheContraste = new Map<string, { valor: ContrasteDeUsuario; hasta: number }>();

/** Tras reconstruir las tablas nuevas, que el contraste se lea de nuevo. */
export function olvidarContrastes(): void {
  cacheContraste.clear();
}

export interface ContrasteDeUsuario {
  viejo: PermisosEfectivos | null;
  nuevo: PermisosEfectivos | null;
  rolViejo: string | null;
  rolesNuevos: string[];
  /** Mensaje si no se pudo leer el sistema que no decide. */
  error: string | null;
}

/**
 * Los permisos del usuario en los DOS sistemas, para comparar cada chequeo
 * (src/lib/permisos/incidencias.ts). El que decide sale de `base`; el otro se
 * lee y se recuerda `CONTRASTE_MS` por usuario y proceso (se olvida antes si
 * las tablas nuevas se reconstruyen). En `viejo` no se compara.
 * Nunca lanza: si el otro falla, queda null con el error.
 */
export async function contrasteDeUsuario(db: SupabaseClient, userId: string, base: PermisosDeUsuario): Promise<ContrasteDeUsuario | null> {
  if (base.motor === "viejo" || !base.perfil) return null;
  const k = `${base.motor}|${userId}`;
  const c = cacheContraste.get(k);
  if (c && c.hasta > Date.now()) {
    return base.motor === "sombra" ? { ...c.valor, viejo: base.efectivos } : { ...c.valor, nuevo: base.efectivos };
  }
  let valor: ContrasteDeUsuario;
  try {
    if (base.motor === "sombra") {
      const n = await efectivosDesdeTablas(db, userId);
      valor = { viejo: base.efectivos, nuevo: n.efectivos, rolViejo: base.roles[0] ?? null, rolesNuevos: n.roles, error: null };
    } else {
      const v = await efectivosDesdeViejo(db, userId, base.perfil);
      // Sin rol viejo (alguien creado ya en el sistema nuevo) no hay contra qué comparar.
      valor = { viejo: v?.efectivos ?? null, nuevo: base.efectivos, rolViejo: v?.roles[0] ?? null, rolesNuevos: base.roles, error: null };
    }
  } catch (e) {
    valor = {
      viejo: base.motor === "sombra" ? base.efectivos : null,
      nuevo: base.motor === "nuevo" ? base.efectivos : null,
      rolViejo: base.motor === "sombra" ? base.roles[0] ?? null : null,
      rolesNuevos: base.motor === "nuevo" ? base.roles : [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
  if (cacheContraste.size > 2000) cacheContraste.clear();
  cacheContraste.set(k, { valor, hasta: Date.now() + CONTRASTE_MS });
  return valor;
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
