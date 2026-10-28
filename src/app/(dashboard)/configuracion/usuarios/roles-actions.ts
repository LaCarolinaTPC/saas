"use server";

/**
 * Acciones de la pantalla nueva de usuarios y roles (sistema de permisos por
 * acción, src/lib/permisos). Solo el super.
 *
 * Mientras mande el sistema viejo (modo viejo o sombra), los roles nuevos se
 * reconstruyen desde `user_types` cada vez que cambian: editar aquí se perdería.
 * Por eso todo lo que escribe exige `permisos.motor = nuevo`, salvo el propio
 * cambio de modo.
 */
import { refresh } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { estaBloqueado } from "@/lib/auth-estado";
import { getCurrentPermissions } from "@/lib/permissions";
import { setSettingValue } from "@/lib/settings";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { PERMISO_POR_CLAVE } from "@/lib/permisos/catalogo";
import { CLAVE_MOTOR, motorActual, olvidarMotor, type Motor } from "@/lib/permisos/fuente";
import { reconstruirDesdeViejo, sincronizarCatalogo } from "@/lib/permisos/bd";

type Resultado = { ok: true } | { ok: false; error: string };
type Db = ReturnType<typeof createAdminClient>;

const CLAVE_ROL_RE = /^[a-z0-9_]{2,40}$/;

async function exigirSuper(opciones: { soloNuevo?: boolean } = { soloNuevo: true }) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) throw new Error("Solo un administrador puede gestionar usuarios y roles.");
  const db = createAdminClient();
  if (opciones.soloNuevo && (await motorActual(db)) !== "nuevo") {
    throw new Error("Primero hay que pasar al sistema nuevo de roles: mientras mande el viejo, estos cambios se perderían.");
  }
  return { perms, db };
}

async function intentar(fn: () => Promise<void>): Promise<Resultado> {
  try {
    await fn();
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const falla = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

/** Permisos válidos para un rol o un usuario: del catálogo y no reservados al super. */
function validarPermisos(permisos: string[]): string[] {
  const limpios = [...new Set(permisos)];
  const malos = limpios.filter((p) => !PERMISO_POR_CLAVE.has(p) || PERMISO_POR_CLAVE.get(p)!.soloSuper);
  if (malos.length) throw new Error(`Permisos no válidos: ${malos.join(", ")}`);
  return limpios.sort();
}

/** Usuarios activos (no bloqueados) que tienen algún rol super activo. */
async function superActivos(db: Db): Promise<Set<string>> {
  const [{ data: supers, error: e1 }, { data: auth, error: e2 }] = await Promise.all([
    db.from("roles").select("clave").eq("es_super", true).eq("activo", true),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  falla(e1);
  falla(e2);
  const claves = (supers ?? []).map((r) => r.clave as string);
  if (!claves.length) return new Set();
  const { data: ur, error } = await db.from("usuario_roles").select("user_id").in("rol", claves);
  falla(error);
  const bloqueados = new Set((auth?.users ?? []).filter((u) => estaBloqueado(u.banned_until)).map((u) => u.id));
  return new Set((ur ?? []).map((x) => x.user_id as string).filter((id) => !bloqueados.has(id)));
}

// ── Modo ─────────────────────────────────────────────────────────────────────

/**
 * Pasa al sistema nuevo (o vuelve al viejo, en sombra).
 *
 * A `nuevo`: antes se ponen las tablas al día con lo último del viejo, y se
 * niega si la sombra anotó a alguien que PIERDE acceso en los últimos 7 días.
 * A `sombra`: lo que se haya cambiado en el sistema nuevo se reemplaza por lo
 * del viejo en la siguiente sincronización.
 */
export async function cambiarMotorPermisos(destino: Exclude<Motor, "viejo">): Promise<Resultado> {
  return intentar(async () => {
    const { perms, db } = await exigirSuper({ soloNuevo: false });
    const antes = await motorActual(db);
    if (antes === destino) return;
    if (destino === "nuevo") {
      await sincronizarCatalogo({ forzar: true }, db);
      await reconstruirDesdeViejo({ forzar: true }, db);
      const desde = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await db.from("permisos_discrepancias").select("email, perdidos").gte("dia", desde);
      falla(error);
      const conPerdidos = (data ?? []).filter((d) => (d.perdidos as string[]).length > 0);
      if (conPerdidos.length) {
        throw new Error(
          `La sombra anotó ${conPerdidos.length} usuario(s) que perderían acceso (${conPerdidos.map((d) => d.email).join(", ")}). Revise «npm run permisos:discrepancias» antes de pasar.`
        );
      }
      if ((await superActivos(db)).size === 0) throw new Error("No hay ningún administrador activo en el sistema nuevo.");
    }
    await setSettingValue(CLAVE_MOTOR, destino, perms.userId ?? undefined);
    olvidarMotor();
    await logTesoreriaAudit({ accion: "cambio_sistema_permisos", modulo: "seguridad", valorAnterior: antes, valorNuevo: destino, detalle: {} });
  });
}

// ── Roles ────────────────────────────────────────────────────────────────────

export interface RolEntrada {
  clave: string;
  nombre: string;
  descripcion: string | null;
  permisos: string[];
  activo: boolean;
}

/** Crea o actualiza un rol (no el super: ese lo tiene todo y no se edita). */
export async function guardarRol(entrada: RolEntrada, nuevo: boolean): Promise<Resultado> {
  return intentar(async () => {
    const { perms, db } = await exigirSuper();
    const clave = entrada.clave.trim();
    const nombre = entrada.nombre.trim();
    if (!CLAVE_ROL_RE.test(clave)) throw new Error("La clave del rol: 2 a 40 letras minúsculas, números o _.");
    if (!nombre) throw new Error("El rol necesita un nombre.");
    const permisos = validarPermisos(entrada.permisos);

    const { data: actual, error: e0 } = await db.from("roles").select("clave, es_super, activo").eq("clave", clave).maybeSingle();
    falla(e0);
    if (nuevo && actual) throw new Error(`Ya existe un rol con la clave «${clave}».`);
    if (!nuevo && !actual) throw new Error("El rol no existe.");
    if (actual?.es_super) throw new Error("El rol administrador lo tiene todo y no se edita.");

    const ahora = new Date().toISOString();
    const { error: e1 } = await db.from("roles").upsert(
      { clave, nombre, descripcion: entrada.descripcion?.trim() || null, activo: entrada.activo, es_super: false, updated_at: ahora, updated_by: perms.userId },
      { onConflict: "clave" }
    );
    falla(e1);
    const { data: previos, error: e2 } = await db.from("rol_permisos").select("permiso").eq("rol", clave);
    falla(e2);
    const tenia = new Set((previos ?? []).map((x) => x.permiso as string));
    const quiere = new Set(permisos);
    const quitar = [...tenia].filter((p) => !quiere.has(p));
    const agregar = permisos.filter((p) => !tenia.has(p));
    if (quitar.length) falla((await db.from("rol_permisos").delete().eq("rol", clave).in("permiso", quitar)).error);
    if (agregar.length) falla((await db.from("rol_permisos").insert(agregar.map((permiso) => ({ rol: clave, permiso })))).error);

    await logTesoreriaAudit({
      accion: nuevo ? "rol_creado" : "rol_editado",
      modulo: "seguridad",
      valorAnterior: nuevo ? null : JSON.stringify([...tenia].sort()),
      valorNuevo: JSON.stringify(permisos),
      detalle: { rol: clave, nombre, activo: entrada.activo, agregados: agregar, quitados: quitar },
    });
  });
}

/** Borra un rol que nadie usa. Los de sistema no se borran (se pueden desactivar). */
export async function eliminarRolNuevo(clave: string): Promise<Resultado> {
  return intentar(async () => {
    const { db } = await exigirSuper();
    const { data: rol, error } = await db.from("roles").select("es_super, es_sistema").eq("clave", clave).maybeSingle();
    falla(error);
    if (!rol) throw new Error("El rol no existe.");
    if (rol.es_super || rol.es_sistema) throw new Error("Es un rol del sistema: no se borra, se puede desactivar.");
    const { count, error: e2 } = await db.from("usuario_roles").select("*", { count: "exact", head: true }).eq("rol", clave);
    falla(e2);
    if (count) throw new Error(`Lo tienen ${count} usuario(s): quíteselo antes de borrarlo.`);
    falla((await db.from("roles").delete().eq("clave", clave)).error);
    await logTesoreriaAudit({ accion: "rol_eliminado", modulo: "seguridad", detalle: { rol: clave } });
  });
}

// ── Usuarios ─────────────────────────────────────────────────────────────────

/** Los roles de un usuario (varios). No se puede dejar el sistema sin super. */
export async function asignarRolesUsuario(userId: string, roles: string[]): Promise<Resultado> {
  return intentar(async () => {
    const { db } = await exigirSuper();
    const quiere = [...new Set(roles)];
    const { data: existentes, error } = await db.from("roles").select("clave, es_super").in("clave", quiere.length ? quiere : ["-"]);
    falla(error);
    if ((existentes ?? []).length !== quiere.length) throw new Error("Algún rol no existe.");

    const supers = await superActivos(db);
    if (supers.has(userId) && supers.size === 1 && !(existentes ?? []).some((r) => r.es_super)) {
      throw new Error("Es el último administrador activo: no se le puede quitar el rol administrador.");
    }

    const { data: previos, error: e2 } = await db.from("usuario_roles").select("rol").eq("user_id", userId);
    falla(e2);
    const tenia = (previos ?? []).map((x) => x.rol as string);
    const quitar = tenia.filter((r) => !quiere.includes(r));
    const agregar = quiere.filter((r) => !tenia.includes(r));
    if (quitar.length) falla((await db.from("usuario_roles").delete().eq("user_id", userId).in("rol", quitar)).error);
    if (agregar.length) falla((await db.from("usuario_roles").insert(agregar.map((rol) => ({ user_id: userId, rol })))).error);
    await logTesoreriaAudit({
      accion: "cambio_rol",
      modulo: "seguridad",
      valorAnterior: JSON.stringify(tenia.sort()),
      valorNuevo: JSON.stringify(quiere.sort()),
      detalle: { userId },
    });
  });
}

/**
 * Permisos individuales de una persona, sin crearle un rol: `concedidos` se
 * suman a sus roles y `quitados` se le restan.
 */
export async function guardarPermisosIndividuales(userId: string, concedidos: string[], quitados: string[]): Promise<Resultado> {
  return intentar(async () => {
    const { perms, db } = await exigirSuper();
    const c = validarPermisos(concedidos);
    const q = validarPermisos(quitados).filter((p) => !c.includes(p));
    const { data: previos, error } = await db.from("usuario_permisos").select("permiso, concedido").eq("user_id", userId);
    falla(error);
    falla((await db.from("usuario_permisos").delete().eq("user_id", userId)).error);
    const filas = [
      ...c.map((permiso) => ({ user_id: userId, permiso, concedido: true, created_by: perms.userId })),
      ...q.map((permiso) => ({ user_id: userId, permiso, concedido: false, created_by: perms.userId })),
    ];
    if (filas.length) falla((await db.from("usuario_permisos").insert(filas)).error);
    await logTesoreriaAudit({
      accion: "cambio_permisos_individuales",
      modulo: "seguridad",
      valorAnterior: JSON.stringify(previos ?? []),
      valorNuevo: JSON.stringify({ concedidos: c, quitados: q }),
      detalle: { userId },
    });
  });
}

/** Crea un usuario con sus roles. La clave es provisional: la cambia al entrar. */
export async function crearUsuarioConRoles(entrada: { fullName: string; email: string; password: string; roles: string[] }): Promise<Resultado> {
  return intentar(async () => {
    const { db } = await exigirSuper();
    const fullName = entrada.fullName.trim();
    const email = entrada.email.trim().toLowerCase();
    if (!fullName) throw new Error("El nombre es obligatorio.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email no válido.");
    if (entrada.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
    if (entrada.roles.length === 0) throw new Error("Asigne al menos un rol.");

    const { data, error } = await db.auth.admin.createUser({
      email,
      password: entrada.password,
      email_confirm: true,
      user_metadata: { full_name: fullName, must_change_password: true },
    });
    if (error) throw new Error(/already|registered|exists/i.test(error.message) ? `Ya existe un usuario con el email ${email}.` : error.message);

    falla((await db.from("profiles").upsert({ id: data.user.id, full_name: fullName, email })).error);
    falla((await db.from("usuario_roles").insert([...new Set(entrada.roles)].map((rol) => ({ user_id: data.user.id, rol })))).error);
    await logTesoreriaAudit({ accion: "usuario_creado", modulo: "seguridad", valorNuevo: JSON.stringify(entrada.roles), detalle: { email, fullName } });
  });
}
