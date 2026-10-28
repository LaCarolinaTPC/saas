/**
 * Lo que necesita la pantalla de usuarios y roles, sin servidor:
 *
 *  - `arbolDePermisos`: el catálogo agrupado como el menú (Financiera,
 *    Operativo, Mantenimiento, Recursos Humanos, Configuración…) → módulo →
 *    acciones y funciones. Lo que se marca en un rol se ve igual que en el menú.
 *  - Atajos de nivel por módulo (Sin acceso · Ver · Editar · Todo) y el nivel
 *    que tiene un conjunto de permisos. Las funciones sensibles no entran en
 *    Ver ni Editar: se marcan a propósito, como antes.
 *  - «¿Quién tiene X?» y de dónde le viene cada permiso a una persona.
 *
 * PURO. `npm run test:permisos`.
 */
import { NAV_TREE } from "@/lib/constants";
import { MODULOS, accionesDe, claveFuncion, claveModulo, type ModuloDef } from "./catalogo";
import { destinoDeRuta, permisosEfectivos, type PermisosEfectivos } from "./motor";

export interface AccionNodo {
  clave: string;
  etiqueta: string;
  nivel: "ver" | "editar" | "especial";
}

export interface FuncionNodo {
  clave: string;
  etiqueta: string;
  sensible: boolean;
  soloSuper: boolean;
  acciones: AccionNodo[];
}

export interface ModuloNodo {
  clave: string;
  etiqueta: string;
  acciones: AccionNodo[];
  funciones: FuncionNodo[];
}

export interface GrupoNodo {
  clave: string;
  etiqueta: string;
  modulos: ModuloNodo[];
}

/** Grupo del menú en el que aparece cada módulo (por su primera opción). */
function grupoDeModulo(): Map<string, { clave: string; etiqueta: string }> {
  const m = new Map<string, { clave: string; etiqueta: string }>();
  for (const e of NAV_TREE) {
    const hojas = e.kind === "link" ? [e.href] : e.items.map((i) => i.href);
    const grupo = e.kind === "link" ? { clave: "general", etiqueta: "General" } : { clave: e.key, etiqueta: e.label };
    for (const h of hojas) {
      const d = destinoDeRuta(h);
      if (d && !m.has(d.modulo)) m.set(d.modulo, grupo);
    }
  }
  return m;
}

export function arbolDePermisos(modulos: ModuloDef[] = MODULOS): GrupoNodo[] {
  const grupos = grupoDeModulo();
  const salida = new Map<string, GrupoNodo>();
  for (const m of modulos) {
    const g = m.soloDatos
      ? { clave: "datos", etiqueta: "Datos para agentes y API" }
      : grupos.get(m.clave) ?? { clave: "otros", etiqueta: "Otros" };
    if (!salida.has(g.clave)) salida.set(g.clave, { ...g, modulos: [] });
    salida.get(g.clave)!.modulos.push({
      clave: m.clave,
      etiqueta: m.etiqueta,
      acciones: accionesDe(m).map((a) => ({ clave: claveModulo(m.clave, a.clave), etiqueta: a.etiqueta, nivel: a.nivel })),
      funciones: (m.funciones ?? []).map((f) => ({
        clave: f.clave,
        etiqueta: f.etiqueta,
        sensible: !!f.sensible,
        soloSuper: !!f.soloSuper,
        acciones: accionesDe(f).map((a) => ({ clave: claveFuncion(m.clave, f.clave, a.clave), etiqueta: a.etiqueta, nivel: a.nivel })),
      })),
    });
  }
  return [...salida.values()];
}

// ── Niveles por módulo ───────────────────────────────────────────────────────

export type NivelModulo = "ninguno" | "ver" | "editar" | "todo" | "personalizado";

/** Todos los permisos asignables de un módulo (sin los reservados al super). */
export function permisosDelModulo(m: ModuloNodo): string[] {
  return [...m.acciones.map((a) => a.clave), ...m.funciones.filter((f) => !f.soloSuper).flatMap((f) => f.acciones.map((a) => a.clave))];
}

/** Lo que marca cada atajo. */
export function permisosDeNivel(m: ModuloNodo, nivel: Exclude<NivelModulo, "personalizado">): string[] {
  if (nivel === "ninguno") return [];
  if (nivel === "todo") return permisosDelModulo(m);
  const entra = (n: AccionNodo["nivel"]) => n === "ver" || (nivel === "editar" && n === "editar");
  return [
    ...m.acciones.filter((a) => entra(a.nivel)).map((a) => a.clave),
    ...m.funciones.filter((f) => !f.sensible && !f.soloSuper).flatMap((f) => f.acciones.filter((a) => entra(a.nivel)).map((a) => a.clave)),
  ];
}

export function nivelDelModulo(m: ModuloNodo, tiene: ReadonlySet<string>): NivelModulo {
  const propios = new Set(permisosDelModulo(m).filter((p) => tiene.has(p)));
  for (const n of ["ninguno", "ver", "editar", "todo"] as const) {
    const esperado = permisosDeNivel(m, n);
    if (esperado.length === propios.size && esperado.every((p) => propios.has(p))) return n;
  }
  return "personalizado";
}

/** El conjunto con el módulo puesto en ese nivel (lo demás queda igual). */
export function aplicarNivel(
  m: ModuloNodo,
  tiene: ReadonlySet<string>,
  nivel: Exclude<NivelModulo, "personalizado">
): Set<string> {
  const salida = new Set(tiene);
  for (const p of permisosDelModulo(m)) salida.delete(p);
  for (const p of permisosDeNivel(m, nivel)) salida.add(p);
  return salida;
}

// ── Quién tiene qué ──────────────────────────────────────────────────────────

export interface RolDatos {
  clave: string;
  nombre: string;
  super: boolean;
  activo: boolean;
  permisos: string[];
}

export interface UsuarioDatos {
  id: string;
  roles: string[];
  concedidos: string[];
  quitados: string[];
}

export function efectivosDeUsuario(u: UsuarioDatos, roles: Map<string, RolDatos>): PermisosEfectivos {
  return permisosEfectivos({
    roles: u.roles.flatMap((r) => {
      const rol = roles.get(r);
      return rol && rol.activo ? [{ super: rol.super, permisos: rol.permisos }] : [];
    }),
    concedidos: u.concedidos,
    quitados: u.quitados,
  });
}

/** De dónde le viene un permiso: los roles que lo dan, «individual», o nada. */
export function origenDe(u: UsuarioDatos, roles: Map<string, RolDatos>, permiso: string): string[] {
  if (u.quitados.includes(permiso) && !u.concedidos.includes(permiso)) return [];
  const desde: string[] = [];
  for (const r of u.roles) {
    const rol = roles.get(r);
    if (!rol || !rol.activo) continue;
    if (rol.super) desde.push(`${rol.nombre} (todo)`);
    else if (rol.permisos.includes(permiso)) desde.push(rol.nombre);
  }
  if (u.concedidos.includes(permiso)) desde.push("individual");
  return desde;
}

/** Quiénes tienen el permiso, y por qué. */
export function quienTiene(
  permiso: string,
  usuarios: UsuarioDatos[],
  roles: Map<string, RolDatos>
): { userId: string; origen: string[] }[] {
  return usuarios
    .filter((u) => efectivosDeUsuario(u, roles).super || efectivosDeUsuario(u, roles).permisos.has(permiso))
    .map((u) => ({ userId: u.id, origen: origenDe(u, roles, permiso) }));
}

/** Lo que pierde un usuario si su asignación pasa de `antes` a `despues`. */
export function permisosQuePierde(antes: UsuarioDatos, despues: UsuarioDatos, roles: Map<string, RolDatos>): string[] {
  const a = efectivosDeUsuario(antes, roles);
  const d = efectivosDeUsuario(despues, roles);
  if (d.super) return [];
  if (a.super) return ["todo (deja de ser super)"];
  return [...a.permisos].filter((p) => !d.permisos.has(p)).sort();
}
