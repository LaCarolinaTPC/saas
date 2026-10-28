/**
 * Lectura y escritura de las tablas de permisos (migración
 * `20261028011725_roles_y_permisos_dinamicos.sql`). Las decisiones son puras y
 * viven en `sincronizar.ts`, `equivalencia.ts` y `motor.ts`; aquí solo se lee,
 * se escribe y se recuerda la huella de lo último sincronizado.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettingValue, setSettingValue } from "@/lib/settings";
import { PERMISOS } from "./catalogo";
import { equivalencia, type RolViejo, type UsuarioViejo } from "./equivalencia";
import type { PermisosEfectivos } from "./motor";
import { efectivosDesdeTablas, motorActual, olvidarContrastes, type Motor } from "./fuente";
import {
  huella,
  planCatalogo,
  planReconstruccion,
  planVacio,
  type EstadoNuevo,
  type PermisoBd,
  type RolBd,
  type RolPermiso,
} from "./sincronizar";

type Db = ReturnType<typeof createAdminClient>;

const CLAVE_HUELLA_CATALOGO = "permisos.huella_catalogo";
const CLAVE_HUELLA_VIEJO = "permisos.huella_viejo";

export type { Motor };

/** El interruptor. Sin la migración (o sin valor) manda el viejo. */
export const leerMotor = (db: Db = createAdminClient()) => motorActual(db);

const falla = (que: string, e: { message: string } | null) => {
  if (e) throw new Error(`${que}: ${e.message}`);
};

/** Lee una tabla entera, de a 1000 filas. */
async function todo<T>(db: Db, tabla: string, columnas = "*"): Promise<T[]> {
  const salida: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from(tabla).select(columnas).range(desde, desde + 999);
    falla(`leer ${tabla}`, error);
    salida.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return salida;
  }
}

async function enLotes<T>(filas: T[], hacer: (lote: T[]) => PromiseLike<{ error: { message: string } | null }>, que: string) {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await hacer(filas.slice(i, i + 500));
    falla(que, error);
  }
}

// ── Sistema viejo ────────────────────────────────────────────────────────────

export async function leerViejo(db: Db = createAdminClient()): Promise<{ roles: RolViejo[]; usuarios: UsuarioViejo[] }> {
  // select("*"): columnas que pueden faltar en instalaciones viejas, igual que
  // getCurrentPermissions.
  const [roles, perfiles] = await Promise.all([
    todo<RolViejo>(db, "user_types"),
    todo<Record<string, unknown>>(db, "profiles"),
  ]);
  return {
    roles: roles.sort((a, b) => a.key.localeCompare(b.key)),
    usuarios: perfiles
      .map((p) => ({
        id: String(p.id),
        email: (p.email as string | null) ?? null,
        user_type: (p.user_type as string | null) ?? null,
        permisos_individuales: p.permisos_individuales ?? null,
        role: (p.role as string | null) ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

/** Deja la tabla `permisos` igual al código. Solo trabaja si el catálogo cambió. */
export async function sincronizarCatalogo(opciones: { forzar?: boolean } = {}, db: Db = createAdminClient()) {
  const h = huella(PERMISOS);
  if (!opciones.forzar && (await getSettingValue(CLAVE_HUELLA_CATALOGO)) === h) return null;

  const [existentes, rolPermisos] = await Promise.all([
    todo<PermisoBd>(db, "permisos", "clave, modulo, funcion, accion, nivel, etiqueta, sensible, solo_super, obsoleto"),
    todo<RolPermiso>(db, "rol_permisos", "rol, permiso"),
  ]);
  const plan = planCatalogo(PERMISOS, existentes, rolPermisos);
  // Primero la herencia: si algo se corta a la mitad, la siguiente pasada vuelve
  // a ver el permiso como nuevo y la completa.
  await enLotes(plan.herencia, (l) => db.from("rol_permisos").upsert(l, { onConflict: "rol,permiso", ignoreDuplicates: true }), "heredar permisos");
  const ahora = new Date().toISOString();
  await enLotes(plan.guardar.map((p) => ({ ...p, updated_at: ahora })), (l) => db.from("permisos").upsert(l, { onConflict: "clave" }), "guardar permisos");
  if (plan.obsoletar.length) {
    const { error } = await db.from("permisos").update({ obsoleto: true, updated_at: ahora }).in("clave", plan.obsoletar);
    falla("marcar obsoletos", error);
  }
  await setSettingValue(CLAVE_HUELLA_CATALOGO, h);
  return { guardados: plan.guardar.length, obsoletos: plan.obsoletar.length, heredados: plan.herencia.length };
}

// ── Roles y asignaciones ─────────────────────────────────────────────────────

export async function leerEstadoNuevo(db: Db = createAdminClient()): Promise<EstadoNuevo> {
  const [roles, rolPermisos, usuarioRoles, usuarioPermisos] = await Promise.all([
    todo<RolBd>(db, "roles", "clave, nombre, descripcion, es_super, es_sistema, activo"),
    todo<RolPermiso>(db, "rol_permisos", "rol, permiso"),
    todo<{ user_id: string; rol: string }>(db, "usuario_roles", "user_id, rol"),
    todo<{ user_id: string; permiso: string; concedido: boolean }>(db, "usuario_permisos", "user_id, permiso, concedido"),
  ]);
  return { roles, rolPermisos, usuarioRoles, usuarioPermisos };
}

/**
 * Mientras el sistema viejo mande, reconstruye roles y asignaciones desde
 * `user_types` y `profiles` con la traducción probada. Solo trabaja si lo
 * viejo cambió desde la última vez (o con `forzar`).
 */
export async function reconstruirDesdeViejo(opciones: { forzar?: boolean } = {}, db: Db = createAdminClient()) {
  const viejo = await leerViejo(db);
  const h = huella(viejo);
  if (!opciones.forzar && (await getSettingValue(CLAVE_HUELLA_VIEJO)) === h) return null;

  const plan = planReconstruccion(equivalencia(viejo.roles, viejo.usuarios), await leerEstadoNuevo(db));
  if (!planVacio(plan)) {
    const ahora = new Date().toISOString();
    await enLotes(plan.rolesGuardar.map((r) => ({ ...r, updated_at: ahora })), (l) => db.from("roles").upsert(l, { onConflict: "clave" }), "guardar roles");
    await enLotes(plan.rolPermisosAgregar, (l) => db.from("rol_permisos").upsert(l, { onConflict: "rol,permiso", ignoreDuplicates: true }), "agregar permisos de rol");
    for (const [rol, permisos] of agrupar(plan.rolPermisosQuitar, (x) => x.rol, (x) => x.permiso)) {
      const { error } = await db.from("rol_permisos").delete().eq("rol", rol).in("permiso", permisos);
      falla("quitar permisos de rol", error);
    }
    await enLotes(plan.usuarioRolesAgregar, (l) => db.from("usuario_roles").upsert(l, { onConflict: "user_id,rol", ignoreDuplicates: true }), "asignar roles");
    for (const [userId, roles] of agrupar(plan.usuarioRolesQuitar, (x) => x.user_id, (x) => x.rol)) {
      const { error } = await db.from("usuario_roles").delete().eq("user_id", userId).in("rol", roles);
      falla("quitar roles", error);
    }
    await enLotes(plan.usuarioPermisosGuardar, (l) => db.from("usuario_permisos").upsert(l, { onConflict: "user_id,permiso" }), "permisos individuales");
    for (const [userId, permisos] of agrupar(plan.usuarioPermisosQuitar, (x) => x.user_id, (x) => x.permiso)) {
      const { error } = await db.from("usuario_permisos").delete().eq("user_id", userId).in("permiso", permisos);
      falla("quitar permisos individuales", error);
    }
    // Al final: los roles que ya no existen arrastran sus asignaciones (CASCADE).
    if (plan.rolesBorrar.length) {
      const { error } = await db.from("roles").delete().in("clave", plan.rolesBorrar);
      falla("borrar roles", error);
    }
  }
  await setSettingValue(CLAVE_HUELLA_VIEJO, h);
  // Lo recordado para comparar ya no vale: que se lea de nuevo.
  olvidarContrastes();
  return {
    roles: plan.rolesGuardar.length,
    permisosDeRol: plan.rolPermisosAgregar.length + plan.rolPermisosQuitar.length,
    asignaciones: plan.usuarioRolesAgregar.length + plan.usuarioRolesQuitar.length,
    individuales: plan.usuarioPermisosGuardar.length + plan.usuarioPermisosQuitar.length,
  };
}

function agrupar<T>(filas: T[], llave: (x: T) => string, valor: (x: T) => string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const f of filas) m.set(llave(f), [...(m.get(llave(f)) ?? []), valor(f)]);
  return m;
}

// ── Permisos de un usuario ───────────────────────────────────────────────────

/** Permisos efectivos de un usuario según las tablas nuevas. */
export async function efectivosNuevosDe(userId: string, db: Db = createAdminClient()): Promise<PermisosEfectivos> {
  return (await efectivosDesdeTablas(db, userId)).efectivos;
}

// ── Mantenimiento automático ─────────────────────────────────────────────────

let ultimaRevision = 0;
let enCurso: Promise<void> | null = null;

/**
 * Catálogo al día y, mientras mande el viejo, roles reconstruidos desde él. Lo
 * llama la sombra; como mucho una vez por minuto por proceso. Nunca lanza.
 */
export function mantenerAlDia(motor: Motor): Promise<void> {
  if (enCurso) return enCurso;
  if (Date.now() - ultimaRevision < 60_000) return Promise.resolve();
  ultimaRevision = Date.now();
  enCurso = (async () => {
    try {
      await sincronizarCatalogo();
      if (motor !== "nuevo") await reconstruirDesdeViejo();
    } catch (e) {
      console.error("[permisos] mantener al día:", e instanceof Error ? e.message : e);
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}
