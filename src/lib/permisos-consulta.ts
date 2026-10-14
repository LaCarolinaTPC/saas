/**
 * Consultas de UI sobre el sistema de permisos: filtrar la matriz de permisos y
 * responder «¿quién tiene este permiso?».
 *
 * Vive aparte de permissions-shared.ts a propósito: ese archivo es el CONTRATO
 * de reglas que importan el middleware, el menú y el servidor, y conviene no
 * engordarlo. La dependencia va en un solo sentido: este módulo importa de
 * permissions-shared y nunca al revés.
 *
 * Aquí no hay ni una regla nueva de permisos: todo se resuelve con
 * modulosEfectivos, subAllowed, origenModulo y origenSub, las mismas que
 * aplican el middleware y cada pantalla. Si alguna vez discrepan, es un error.
 */
import { coincideTexto } from "@/lib/tabla/filtros";
import {
  MODULE_LABELS,
  MODULE_SUBS,
  origenModulo,
  origenSub,
  SIN_INDIVIDUALES,
  SUB_TO_MODULE,
  SUBMODULE_LABELS,
  SUBS_SENSIBLES,
  SUBS_SOLO_ADMIN,
  type ModuleKey,
  type OrigenPermiso,
  type PermisosIndividuales,
} from "@/lib/permissions-shared";

/** Un permiso consultable: un módulo completo o una sub-función. */
export type PermisoConsultable =
  | { tipo: "modulo"; modulo: ModuleKey }
  | { tipo: "sub"; sub: string; modulo: keyof typeof MODULE_SUBS };

/**
 * Nombre corto y detalle de una sub-función: la etiqueta trae el detalle entre
 * paréntesis ("Caja de devengados (aprobar entregas…)").
 *
 * Se parte por " (" y no por "(": es lo más conservador, porque un nombre que
 * llevara un paréntesis pegado no se trocearía por error.
 */
export function partirEtiqueta(sub: string): { nombre: string; detalle: string | null } {
  const etiqueta = SUBMODULE_LABELS[sub] ?? sub;
  const abre = etiqueta.indexOf(" (");
  if (abre === -1) return { nombre: etiqueta.trim(), detalle: null };
  const cola = etiqueta.slice(abre + 2);
  const detalle = (cola.endsWith(")") ? cola.slice(0, -1) : cola).trim();
  return { nombre: etiqueta.slice(0, abre).trim(), detalle: detalle || null };
}

/** Resuelve una clave suelta (de la URL o del selector). null si no existe. */
export function permisoDesdeClave(clave: string): PermisoConsultable | null {
  if (!clave) return null;
  const modulo = SUB_TO_MODULE[clave];
  if (modulo) return { tipo: "sub", sub: clave, modulo };
  if (clave in MODULE_LABELS) return { tipo: "modulo", modulo: clave as ModuleKey };
  return null;
}

/** Etiqueta legible de un permiso, para títulos y chips. */
export function etiquetaPermiso(p: PermisoConsultable): string {
  if (p.tipo === "modulo") return MODULE_LABELS[p.modulo] ?? p.modulo;
  return `${MODULE_LABELS[p.modulo] ?? p.modulo} › ${partirEtiqueta(p.sub).nombre}`;
}

/** La clave con la que se guarda un permiso en la URL. */
export function clavePermiso(p: PermisoConsultable): string {
  return p.tipo === "modulo" ? p.modulo : p.sub;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtrado de la matriz de permisos por rol
// ─────────────────────────────────────────────────────────────────────────────

export interface RolMatriz {
  key: string;
  nombre: string;
  descripcion: string | null;
}

/**
 * Qué filas (roles) y qué columnas (sub-funciones) se pintan de la matriz de un
 * módulo. Es SOLO presentación.
 *
 * Importante: el componente de la fila debe seguir recibiendo la lista COMPLETA
 * de sub-funciones, porque de ella deriva su estado inicial y el cálculo de si
 * guarda `null` (sin restricción) o la lista explícita. Si se le pasara esta
 * lista recortada, al marcar una casilla con el filtro puesto guardaría «sin
 * restricción» y abriría el módulo entero.
 *
 * Jerarquía padre/hijo, igual que el panel de permisos individuales: si coincide
 * el módulo se muestra entero; una sub-función que coincide se muestra sola.
 */
export function filtrarMatrizPermisos<T extends RolMatriz>(args: {
  filtro: string;
  /** Clave del módulo, para que buscar "financiera" también acierte. */
  modulo: string;
  subs: readonly string[];
  roles: readonly T[];
}): { roles: T[]; subs: string[] } {
  const { filtro, modulo, subs, roles } = args;
  if (!filtro.trim()) return { roles: [...roles], subs: [...subs] };

  // El módulo coincide: se muestra completo, sin recortar nada.
  if (coincideTexto(filtro, MODULE_LABELS[modulo as ModuleKey], modulo)) {
    return { roles: [...roles], subs: [...subs] };
  }

  // Las columnas se comparan contra el NOMBRE CORTO y la clave, nunca contra el
  // detalle entre paréntesis: ese texto es prosa explicativa llena de palabras
  // comunes ("consulta", "imprimir", "aprobar"), y buscar el nombre de un rol
  // como "Consulta" recortaba columnas que solo lo tenían en su descripción.
  const subsCoinciden = subs.filter((s) =>
    coincideTexto(filtro, partirEtiqueta(s).nombre, s)
  );
  const rolesCoinciden = roles.filter((r) =>
    coincideTexto(filtro, r.nombre, r.key, r.descripcion)
  );

  if (!subsCoinciden.length && !rolesCoinciden.length) return { roles: [], subs: [] };
  return {
    roles: rolesCoinciden.length ? rolesCoinciden : [...roles],
    subs: subsCoinciden.length ? subsCoinciden : [...subs],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿Quién tiene este permiso?
// ─────────────────────────────────────────────────────────────────────────────

/** Forma mínima de un rol, para no depender de los tipos del componente. */
export interface RolConsulta {
  key: string;
  nombre: string;
  modulos: string[];
  submodulos?: Record<string, string[]> | null;
}

/** Forma mínima de un usuario. */
export interface UsuarioConsulta {
  id: string;
  full_name: string;
  email: string;
  user_type: string | null;
  activo: boolean;
  permisos_individuales: PermisosIndividuales;
}

export interface AccesoRol {
  key: string;
  nombre: string;
  permitido: boolean;
  origen: OrigenPermiso;
}

export interface AccesoUsuario {
  id: string;
  nombre: string;
  email: string;
  rolKey: string | null;
  /** Nombre del rol, o "sin rol" si no tiene o si el rol fue eliminado. */
  rolNombre: string;
  activo: boolean;
  permitido: boolean;
  origen: OrigenPermiso;
  /** Tiene la sub-función pero no su módulo: no le sirve de nada. */
  bloqueadoPorModulo: boolean;
}

export interface ResultadoQuienTiene {
  permiso: PermisoConsultable;
  etiqueta: string;
  /** Reservado al administrador: ni un permiso individual lo concede. */
  reservadoAdmin: boolean;
  /** Sensible: el rol no lo da por defecto, hay que concederlo explícitamente. */
  sensible: boolean;
  /** TODOS los roles con su veredicto; con acceso primero, luego por nombre. */
  roles: AccesoRol[];
  /** TODOS los usuarios; con acceso primero, activos antes que desactivados. */
  usuarios: AccesoUsuario[];
  resumen: {
    rolesConAcceso: number;
    rolesTotal: number;
    /** Solo usuarios activos. */
    usuariosConAcceso: number;
    usuariosTotal: number;
    /** Con acceso heredado del rol. */
    porRol: number;
    /** Con acceso por un permiso individual. */
    concedidos: number;
    /** Un permiso individual se lo quita, aunque su rol lo dé. */
    denegados: number;
    /** Desactivados que lo tendrían si se reactivaran. */
    inactivosConAcceso: number;
  };
}

const SIN_ROL: RolConsulta = { key: "", nombre: "sin rol", modulos: [], submodulos: {} };

/** Veredicto de un permiso para un rol y unos ajustes individuales dados. */
function evaluar(
  permiso: PermisoConsultable,
  rol: RolConsulta,
  individuales: PermisosIndividuales,
  esAdmin: boolean
): { permitido: boolean; origen: OrigenPermiso; bloqueadoPorModulo: boolean } {
  // El administrador siempre puede, sin mirar modulos ni ajustes. No se usa
  // modulosEfectivos aquí a propósito: el array `modulos` del rol admin puede
  // no listarlos todos, y su acceso total no viene de ahí.
  if (esAdmin) return { permitido: true, origen: "admin", bloqueadoPorModulo: false };

  if (permiso.tipo === "modulo") {
    const { permitido, origen } = origenModulo(rol.modulos, individuales, permiso.modulo);
    return { permitido, origen, bloqueadoPorModulo: false };
  }

  // Una sub-función exige también su módulo (igual que canAccessSub): sin eso,
  // conceder "Auditoría" a quien no tiene Tesorería sería un falso positivo.
  const mod = origenModulo(rol.modulos, individuales, permiso.modulo);
  const sub = origenSub(rol.submodulos ?? {}, individuales, permiso.modulo, permiso.sub, false);
  return {
    permitido: mod.permitido && sub.permitido,
    origen: sub.origen,
    bloqueadoPorModulo: sub.permitido && !mod.permitido,
  };
}

/**
 * Quién puede usar un permiso: los roles que lo dan y los usuarios que lo
 * tienen, con el origen de cada uno.
 *
 * Devuelve TODOS los roles y usuarios con su veredicto, no solo los que pueden:
 * así la UI decide qué pinta y los contadores («3 de 7 roles lo dan») salen sin
 * recalcular nada.
 */
export function quienTienePermiso(
  permiso: PermisoConsultable,
  roles: readonly RolConsulta[],
  usuarios: readonly UsuarioConsulta[]
): ResultadoQuienTiene {
  const sub = permiso.tipo === "sub" ? permiso.sub : null;
  const porClave = new Map(roles.map((r) => [r.key, r]));

  const rolesEvaluados: AccesoRol[] = roles
    .map((r) => {
      const { permitido, origen } = evaluar(permiso, r, SIN_INDIVIDUALES, r.key === "admin");
      return { key: r.key, nombre: r.nombre, permitido, origen };
    })
    .sort(
      (a, b) =>
        Number(b.permitido) - Number(a.permitido) || a.nombre.localeCompare(b.nombre, "es")
    );

  const usuariosEvaluados: AccesoUsuario[] = usuarios
    .map((u) => {
      const esAdmin = u.user_type === "admin";
      const rol = (u.user_type ? porClave.get(u.user_type) : undefined) ?? SIN_ROL;
      // Los ajustes individuales se ignoran para el admin, igual que en
      // getCurrentPermissions: si no, un ajuste suelto en la base dejaría al
      // sistema sin administrador aparente.
      const individuales = esAdmin ? SIN_INDIVIDUALES : u.permisos_individuales;
      const { permitido, origen, bloqueadoPorModulo } = evaluar(permiso, rol, individuales, esAdmin);
      return {
        id: u.id,
        nombre: u.full_name || u.email || "—",
        email: u.email,
        rolKey: u.user_type,
        rolNombre: esAdmin ? (porClave.get("admin")?.nombre ?? "Administrador") : rol.nombre,
        activo: u.activo,
        permitido,
        origen,
        bloqueadoPorModulo,
      };
    })
    .sort(
      (a, b) =>
        Number(b.permitido) - Number(a.permitido) ||
        Number(b.activo) - Number(a.activo) ||
        a.nombre.localeCompare(b.nombre, "es")
    );

  const activos = usuariosEvaluados.filter((u) => u.activo);
  return {
    permiso,
    etiqueta: etiquetaPermiso(permiso),
    reservadoAdmin: sub ? SUBS_SOLO_ADMIN.has(sub) : false,
    sensible: sub ? SUBS_SENSIBLES.has(sub) : false,
    roles: rolesEvaluados,
    usuarios: usuariosEvaluados,
    resumen: {
      rolesConAcceso: rolesEvaluados.filter((r) => r.permitido).length,
      rolesTotal: rolesEvaluados.length,
      usuariosConAcceso: activos.filter((u) => u.permitido).length,
      usuariosTotal: activos.length,
      porRol: activos.filter((u) => u.permitido && u.origen === "rol").length,
      concedidos: activos.filter((u) => u.permitido && u.origen === "concedido").length,
      denegados: usuariosEvaluados.filter((u) => u.origen === "denegado").length,
      inactivosConAcceso: usuariosEvaluados.filter((u) => !u.activo && u.permitido).length,
    },
  };
}
