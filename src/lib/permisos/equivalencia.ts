/**
 * Traducción SIN PÉRDIDA del sistema anterior (un `user_types` por usuario,
 * `permisos_individuales`, `puede_editar` y el `profiles.role` heredado) al
 * nuevo (roles con permisos por acción, varios por usuario, y excepciones).
 *
 * Dos mitades:
 *  - `accesoViejo`: lo que el sistema anterior le deja hacer a un usuario,
 *    calculado con SUS funciones (`modulosEfectivos`, `subAllowed`,
 *    `hrefToModule`…), igual que el proxy y el menú de hoy.
 *  - `equivalencia`: los roles y excepciones nuevos. Las excepciones de cada
 *    usuario salen de la diferencia entre lo que tenía y lo que da su rol, así
 *    que el resultado es el mismo por construcción; las pruebas y
 *    `npm run permisos:comparar` lo verifican por los dos caminos.
 *
 * PURO. `npm run test:permisos`.
 */
import {
  ALL_MODULES,
  hrefToModule,
  hrefToSubmodule,
  modulosEfectivos,
  normalizarIndividuales,
  subAllowed,
  type PermisosIndividuales,
} from "@/lib/permissions-shared";
import { FUNCION_POR_VIEJA, MODULO_POR_CLAVE, accionesDe, claveFuncion, claveModulo } from "./catalogo";
import { permisosEfectivos, type PermisosEfectivos } from "./motor";

export interface RolViejo {
  key: string;
  nombre?: string | null;
  descripcion?: string | null;
  modulos: unknown;
  submodulos?: unknown;
  puede_editar?: boolean | null;
  es_sistema?: boolean | null;
}

export interface UsuarioViejo {
  id: string;
  email?: string | null;
  user_type: string | null;
  permisos_individuales?: unknown;
  /** `profiles.role` heredado: admin y rrhh evalúan accidentes. */
  role?: string | null;
}

/** Los que evaluaban accidentes por `profiles.role` (src/lib/actions.ts). */
export const ROLES_REVISORES = ["admin", "rrhh"];

export interface AccesoViejo {
  isAdmin: boolean;
  modulos: string[];
  submodulos: Record<string, string[]>;
  individuales: PermisosIndividuales;
  puedeEditar: boolean;
  evaluaAccidentes: boolean;
}

const submodulosDe = (rol: RolViejo | null): Record<string, string[]> =>
  rol?.submodulos && typeof rol.submodulos === "object" && !Array.isArray(rol.submodulos)
    ? (rol.submodulos as Record<string, string[]>)
    : {};

/** Lo mismo que calcula `getCurrentPermissions` (sin rol válido: nada). */
export function accesoViejo(u: UsuarioViejo, rol: RolViejo | null): AccesoViejo {
  const evaluaAccidentes = ROLES_REVISORES.includes(u.role ?? "");
  if (!u.user_type || !rol) {
    return { isAdmin: false, modulos: [], submodulos: {}, individuales: {}, puedeEditar: false, evaluaAccidentes };
  }
  const isAdmin = u.user_type === "admin";
  const individuales = isAdmin ? {} : normalizarIndividuales(u.permisos_individuales);
  return {
    isAdmin,
    modulos: modulosEfectivos(rol.modulos, individuales),
    submodulos: submodulosDe(rol),
    individuales,
    puedeEditar: !!rol.puede_editar,
    evaluaAccidentes,
  };
}

/** ¿Abría la ruta? Lo mismo que el proxy de hoy. */
export function rutaViejaPermitida(a: AccesoViejo, href: string): boolean {
  if (a.isAdmin) return true;
  return hrefViejoVisible(a, href);
}

/** ¿Salía en el menú? Lo mismo que el menú de hoy (el admin, según su fila). */
export function hrefViejoVisible(a: AccesoViejo, href: string): boolean {
  const m = hrefToModule(href);
  if (m === null) return true;
  if (!a.modulos.includes(m)) return false;
  const sub = hrefToSubmodule(href);
  if (sub === null) return true;
  return subAllowed(a.submodulos, m, sub, a.isAdmin, a.individuales.submodulos);
}

/** Sub-funciones (claves viejas) que tiene, solo de módulos que tiene. */
export function subsViejas(a: AccesoViejo): string[] {
  const salida: string[] = [];
  for (const [vieja, { modulo }] of FUNCION_POR_VIEJA) {
    if (!a.modulos.includes(modulo)) continue;
    if (subAllowed(a.submodulos, modulo, vieja, a.isAdmin, a.individuales.submodulos)) salida.push(vieja);
  }
  return salida;
}

/**
 * Los permisos nuevos que equivalen a un acceso viejo:
 *  - cada módulo → `ver`, y las acciones de nivel `editar` si `puede_editar`;
 *  - cada sub-función permitida → `funcion.ver` (y `funcion.editar` igual);
 *  - `profiles.role` admin/rrhh → `accidentabilidad.evaluar`.
 */
export function permisosDeAccesoViejo(a: AccesoViejo): Set<string> {
  const s = new Set<string>();
  for (const m of a.modulos) {
    const def = MODULO_POR_CLAVE.get(m);
    if (!def) continue;
    for (const ac of accionesDe(def)) {
      if (ac.nivel === "ver" || (ac.nivel === "editar" && a.puedeEditar)) s.add(claveModulo(m, ac.clave));
    }
  }
  for (const vieja of subsViejas(a)) {
    const { modulo, funcion } = FUNCION_POR_VIEJA.get(vieja)!;
    s.add(claveFuncion(modulo, funcion.clave, "ver"));
    if (a.puedeEditar) s.add(claveFuncion(modulo, funcion.clave, "editar"));
  }
  if (a.evaluaAccidentes) s.add(claveModulo("accidentabilidad", "evaluar"));
  return s;
}

export interface RolNuevo {
  clave: string;
  nombre: string;
  descripcion: string | null;
  super: boolean;
  sistema: boolean;
  permisos: string[];
}

export interface AsignacionNueva {
  userId: string;
  roles: string[];
  concedidos: string[];
  quitados: string[];
}

/** Los permisos que da un rol viejo por sí solo, sin ajustes de nadie. */
export function rolNuevoDesdeViejo(rol: RolViejo): RolNuevo {
  const esSuper = rol.key === "admin";
  const acceso = accesoViejo({ id: "", user_type: rol.key }, rol);
  return {
    clave: rol.key,
    nombre: rol.nombre || rol.key,
    descripcion: rol.descripcion ?? null,
    super: esSuper,
    sistema: !!rol.es_sistema,
    permisos: esSuper ? [] : [...permisosDeAccesoViejo(acceso)].sort(),
  };
}

/** Roles nuevos y la asignación de cada usuario (rol + excepciones). */
export function equivalencia(
  roles: RolViejo[],
  usuarios: UsuarioViejo[]
): { roles: RolNuevo[]; usuarios: AsignacionNueva[] } {
  const rolesNuevos = roles.map(rolNuevoDesdeViejo);
  const porClave = new Map(roles.map((r) => [r.key, r]));
  const nuevosPorClave = new Map(rolesNuevos.map((r) => [r.clave, r]));

  const asignaciones = usuarios.map((u): AsignacionNueva => {
    const rolViejo = u.user_type ? porClave.get(u.user_type) ?? null : null;
    const rolNuevo = u.user_type ? nuevosPorClave.get(u.user_type) ?? null : null;
    if (!rolViejo || !rolNuevo) {
      // Sin rol válido no tenía nada, salvo quizá evaluar accidentes.
      const solo = permisosDeAccesoViejo(accesoViejo(u, null));
      return { userId: u.id, roles: [], concedidos: [...solo].sort(), quitados: [] };
    }
    if (rolNuevo.super) return { userId: u.id, roles: [rolNuevo.clave], concedidos: [], quitados: [] };
    const tenia = permisosDeAccesoViejo(accesoViejo(u, rolViejo));
    const daElRol = new Set(rolNuevo.permisos);
    return {
      userId: u.id,
      roles: [rolNuevo.clave],
      concedidos: [...tenia].filter((p) => !daElRol.has(p)).sort(),
      quitados: [...daElRol].filter((p) => !tenia.has(p)).sort(),
    };
  });
  return { roles: rolesNuevos, usuarios: asignaciones };
}

/** Los permisos efectivos nuevos de una asignación. */
export function efectivosDe(a: AsignacionNueva, roles: Map<string, RolNuevo>): PermisosEfectivos {
  return permisosEfectivos({
    roles: a.roles.flatMap((r) => {
      const rol = roles.get(r);
      return rol ? [{ super: rol.super, permisos: rol.permisos }] : [];
    }),
    concedidos: a.concedidos,
    quitados: a.quitados,
  });
}

/** Módulos de pantalla conocidos por el sistema viejo (para recorrerlos). */
export const MODULOS_VIEJOS: readonly string[] = ALL_MODULES;
