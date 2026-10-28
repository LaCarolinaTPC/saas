/**
 * Qué escribir en la base para que quede igual al código, sin escribir nada:
 *
 *  - `planCatalogo`: la tabla `permisos` contra el catálogo. Lo nuevo se crea,
 *    lo cambiado se actualiza, lo retirado queda obsoleto (no se borra) y lo que
 *    vuelve se reactiva. Una acción NUEVA de un módulo o función que ya existía
 *    la reciben los roles que ya tenían ese nivel ahí (quien editaba Ausentismo
 *    recibe «Ausentismo · exportar» si se agrega con nivel `editar`), para que
 *    afinar un módulo no le quite nada a nadie.
 *  - `planReconstruccion`: roles y asignaciones contra lo que sale de la
 *    traducción del sistema viejo. Mientras el viejo mande (modo sombra), lo
 *    nuevo se reconstruye desde él cada vez que cambia.
 *
 * PURO. `npm run test:permisos`.
 */
import type { Nivel, PermisoDef } from "./catalogo";
import type { AsignacionNueva, RolNuevo } from "./equivalencia";

export interface PermisoBd {
  clave: string;
  modulo: string;
  funcion: string | null;
  accion: string;
  nivel: Nivel;
  etiqueta: string;
  sensible: boolean;
  solo_super: boolean;
  obsoleto: boolean;
}

export interface RolPermiso {
  rol: string;
  permiso: string;
}

/** Huella corta y estable de cualquier dato serializable (para saber si cambió). */
export function huella(dato: unknown): string {
  const texto = JSON.stringify(dato);
  let h1 = 0x811c9dc5;
  let h2 = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2, 31) + c) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

const aBd = (p: PermisoDef): PermisoBd => ({
  clave: p.clave,
  modulo: p.modulo,
  funcion: p.funcion,
  accion: p.accion,
  nivel: p.nivel,
  etiqueta: p.etiqueta,
  sensible: p.sensible,
  solo_super: p.soloSuper,
  obsoleto: false,
});

const alcance = (p: { modulo: string; funcion: string | null }) => `${p.modulo}|${p.funcion ?? ""}`;

export function planCatalogo(
  catalogo: PermisoDef[],
  existentes: PermisoBd[],
  rolPermisos: RolPermiso[]
): { guardar: PermisoBd[]; obsoletar: string[]; herencia: RolPermiso[] } {
  const enBd = new Map(existentes.map((p) => [p.clave, p]));
  const enCodigo = new Set(catalogo.map((p) => p.clave));

  const guardar: PermisoBd[] = [];
  const nuevos: PermisoDef[] = [];
  for (const p of catalogo) {
    const fila = aBd(p);
    const actual = enBd.get(p.clave);
    if (!actual) nuevos.push(p);
    const cambio = !actual || (Object.keys(fila) as (keyof PermisoBd)[]).some((k) => actual[k] !== fila[k]);
    if (cambio) guardar.push(fila);
  }
  const obsoletar = existentes.filter((p) => !p.obsoleto && !enCodigo.has(p.clave)).map((p) => p.clave);

  // Herencia por nivel: solo hacia acciones nuevas de un alcance que ya existía.
  const vigentes = new Map(existentes.filter((p) => !p.obsoleto && enCodigo.has(p.clave)).map((p) => [p.clave, p]));
  const herencia: RolPermiso[] = [];
  const yaTiene = new Set(rolPermisos.map((x) => `${x.rol}|${x.permiso}`));
  for (const n of nuevos) {
    if (n.nivel === "especial") continue;
    const roles = new Set(
      rolPermisos
        .filter((x) => {
          const p = vigentes.get(x.permiso);
          return p && alcance(p) === alcance(n) && p.nivel === n.nivel;
        })
        .map((x) => x.rol)
    );
    for (const rol of roles) {
      if (!yaTiene.has(`${rol}|${n.clave}`)) herencia.push({ rol, permiso: n.clave });
    }
  }
  return { guardar, obsoletar, herencia };
}

export interface RolBd {
  clave: string;
  nombre: string;
  descripcion: string | null;
  es_super: boolean;
  es_sistema: boolean;
  activo: boolean;
}

export interface EstadoNuevo {
  roles: RolBd[];
  rolPermisos: RolPermiso[];
  usuarioRoles: { user_id: string; rol: string }[];
  usuarioPermisos: { user_id: string; permiso: string; concedido: boolean }[];
}

export interface PlanReconstruccion {
  rolesGuardar: RolBd[];
  rolesBorrar: string[];
  rolPermisosAgregar: RolPermiso[];
  rolPermisosQuitar: RolPermiso[];
  usuarioRolesAgregar: { user_id: string; rol: string }[];
  usuarioRolesQuitar: { user_id: string; rol: string }[];
  usuarioPermisosGuardar: { user_id: string; permiso: string; concedido: boolean }[];
  usuarioPermisosQuitar: { user_id: string; permiso: string }[];
}

/** Lo mínimo que hay que escribir para que lo nuevo quede igual a lo deseado. */
export function planReconstruccion(
  deseado: { roles: RolNuevo[]; usuarios: AsignacionNueva[] },
  actual: EstadoNuevo
): PlanReconstruccion {
  const rolesActuales = new Map(actual.roles.map((r) => [r.clave, r]));
  const rolesGuardar: RolBd[] = [];
  for (const r of deseado.roles) {
    const fila: RolBd = {
      clave: r.clave,
      nombre: r.nombre,
      descripcion: r.descripcion,
      es_super: r.super,
      es_sistema: r.sistema,
      activo: true,
    };
    const a = rolesActuales.get(r.clave);
    if (!a || (Object.keys(fila) as (keyof RolBd)[]).some((k) => a[k] !== fila[k])) rolesGuardar.push(fila);
  }
  const clavesDeseadas = new Set(deseado.roles.map((r) => r.clave));
  const rolesBorrar = actual.roles.filter((r) => !clavesDeseadas.has(r.clave)).map((r) => r.clave);

  const diff = <T>(quiero: T[], tengo: T[], llave: (x: T) => string) => {
    const q = new Map(quiero.map((x) => [llave(x), x]));
    const t = new Map(tengo.map((x) => [llave(x), x]));
    return {
      agregar: [...q].filter(([k]) => !t.has(k)).map(([, v]) => v),
      quitar: [...t].filter(([k]) => !q.has(k)).map(([, v]) => v),
    };
  };

  const rp = diff(
    deseado.roles.flatMap((r) => r.permisos.map((permiso) => ({ rol: r.clave, permiso }))),
    actual.rolPermisos.filter((x) => clavesDeseadas.has(x.rol)),
    (x) => `${x.rol}|${x.permiso}`
  );
  const ur = diff(
    deseado.usuarios.flatMap((u) => u.roles.map((rol) => ({ user_id: u.userId, rol }))),
    actual.usuarioRoles,
    (x) => `${x.user_id}|${x.rol}`
  );
  const upQuiero = deseado.usuarios.flatMap((u) => [
    ...u.concedidos.map((permiso) => ({ user_id: u.userId, permiso, concedido: true })),
    ...u.quitados.map((permiso) => ({ user_id: u.userId, permiso, concedido: false })),
  ]);
  const up = diff(upQuiero, actual.usuarioPermisos, (x) => `${x.user_id}|${x.permiso}|${x.concedido}`);
  const upQuieroLlaves = new Set(upQuiero.map((x) => `${x.user_id}|${x.permiso}`));

  return {
    rolesGuardar,
    rolesBorrar,
    rolPermisosAgregar: rp.agregar,
    rolPermisosQuitar: rp.quitar,
    usuarioRolesAgregar: ur.agregar,
    usuarioRolesQuitar: ur.quitar,
    usuarioPermisosGuardar: up.agregar,
    // Lo que cambió de concedido a quitado se sobrescribe (upsert), no se borra.
    usuarioPermisosQuitar: up.quitar
      .filter((x) => !upQuieroLlaves.has(`${x.user_id}|${x.permiso}`))
      .map(({ user_id, permiso }) => ({ user_id, permiso })),
  };
}

export const planVacio = (p: PlanReconstruccion) => Object.values(p).every((v) => v.length === 0);
