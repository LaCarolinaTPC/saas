/**
 * Motor de permisos: qué puede un usuario, qué ruta abre y qué ve en el menú.
 *
 * Un usuario tiene uno o varios roles (la unión de sus permisos) y, encima,
 * excepciones: permisos concedidos o quitados solo a él. El rol super lo tiene
 * todo. Lo que no está en el catálogo (obsoleto o desconocido) no da nada.
 *
 * PURO: lo usan el proxy, el servidor y el menú. `npm run test:permisos`.
 */
import {
  MODULOS,
  PERMISO_POR_CLAVE,
  RUTAS_SIN_FUNCION,
  claveFuncion,
  claveModulo,
  type ModuloDef,
  type PermisoDef,
} from "./catalogo";

export interface PermisosEfectivos {
  super: boolean;
  permisos: ReadonlySet<string>;
}

export const SIN_PERMISOS: PermisosEfectivos = { super: false, permisos: new Set() };

export interface EntradaPermisos {
  roles: { super?: boolean; permisos: Iterable<string> }[];
  concedidos?: Iterable<string>;
  quitados?: Iterable<string>;
}

/**
 * Unión de los roles, más lo concedido, menos lo quitado. Se descarta lo que no
 * esté en el catálogo y lo reservado al super. Tener cualquier permiso de un
 * módulo implica poder entrar (`modulo.ver`).
 */
export function permisosEfectivos(
  e: EntradaPermisos,
  catalogo: ReadonlyMap<string, PermisoDef> = PERMISO_POR_CLAVE
): PermisosEfectivos {
  const esSuper = e.roles.some((r) => r.super);
  if (esSuper) return { super: true, permisos: new Set(catalogo.keys()) };

  const base = new Set<string>();
  for (const r of e.roles) for (const p of r.permisos) base.add(p);
  for (const p of e.quitados ?? []) base.delete(p);
  for (const p of e.concedidos ?? []) base.add(p);

  const salida = new Set<string>();
  for (const p of base) {
    const def = catalogo.get(p);
    if (!def || def.soloSuper) continue;
    salida.add(p);
    // Una acción especial (evaluar accidentes) no abre la pantalla por sí sola.
    if (def.nivel === "especial") continue;
    const ver = claveModulo(def.modulo, "ver");
    if (catalogo.has(ver)) salida.add(ver);
  }
  return { super: false, permisos: salida };
}

export function puede(ef: PermisosEfectivos, clave: string): boolean {
  return ef.super || ef.permisos.has(clave);
}

/** ¿Tiene alguna acción del módulo (o de sus funciones)? */
export function tieneModulo(ef: PermisosEfectivos, modulo: string): boolean {
  return puede(ef, claveModulo(modulo, "ver"));
}

// ── Rutas ────────────────────────────────────────────────────────────────────

export interface DestinoRuta {
  modulo: string;
  funcion: string | null;
}

interface EntradaRuta extends DestinoRuta {
  prefijo: string;
  exacta: boolean;
}

function tablaDeRutas(modulos: ModuloDef[]): EntradaRuta[] {
  const t: EntradaRuta[] = [];
  for (const m of modulos) {
    if (m.rutaExacta) t.push({ prefijo: m.rutaExacta, exacta: true, modulo: m.clave, funcion: null });
    for (const r of m.rutas) t.push({ prefijo: r, exacta: false, modulo: m.clave, funcion: null });
    for (const f of m.funciones ?? []) {
      for (const r of f.rutas ?? []) t.push({ prefijo: r, exacta: false, modulo: m.clave, funcion: f.clave });
    }
  }
  for (const r of RUTAS_SIN_FUNCION) t.push({ prefijo: r.prefijo, exacta: false, modulo: r.modulo, funcion: null });
  // Gana el prefijo más largo; a igual largo, la función (es más específica).
  return t.sort((a, b) => b.prefijo.length - a.prefijo.length || Number(!!b.funcion) - Number(!!a.funcion));
}

const TABLA = tablaDeRutas(MODULOS);

/** Módulo y función que guardan una ruta, o null si la ruta no es de ninguno. */
export function destinoDeRuta(href: string, tabla: EntradaRuta[] = TABLA): DestinoRuta | null {
  for (const e of tabla) {
    if (e.exacta ? href === e.prefijo : href.startsWith(e.prefijo)) {
      return { modulo: e.modulo, funcion: e.funcion };
    }
  }
  return null;
}

/** El permiso que exige abrir una ruta (null si es libre). */
export function permisoDeRuta(href: string): string | null {
  const d = destinoDeRuta(href);
  if (!d) return null;
  return d.funcion ? claveFuncion(d.modulo, d.funcion, "ver") : claveModulo(d.modulo, "ver");
}

export function rutaPermitida(ef: PermisosEfectivos, href: string): boolean {
  const d = destinoDeRuta(href);
  if (!d || ef.super) return true;
  if (!tieneModulo(ef, d.modulo)) return false;
  return d.funcion ? puede(ef, claveFuncion(d.modulo, d.funcion, "ver")) : true;
}

/** Primera pantalla que puede abrir, en el orden del catálogo. */
export function inicioDe(ef: PermisosEfectivos): string | null {
  for (const m of MODULOS) {
    if (!tieneModulo(ef, m.clave)) continue;
    if (rutaPermitida(ef, m.inicio)) return m.inicio;
    for (const f of m.funciones ?? []) {
      if (f.inicio && rutaPermitida(ef, f.inicio)) return f.inicio;
    }
  }
  return null;
}

// ── Menú ─────────────────────────────────────────────────────────────────────

type Hoja = { href: string };
type Entrada<H extends Hoja> = (H & { kind: "link" }) | { kind: "group"; items: H[] };

/** El menú con solo lo que puede abrir; los grupos vacíos desaparecen. */
export function menuVisible<H extends Hoja, E extends Entrada<H>>(ef: PermisosEfectivos, arbol: E[]): E[] {
  return arbol.flatMap((e): E[] => {
    if (e.kind === "link") return rutaPermitida(ef, e.href) ? [e] : [];
    const items = e.items.filter((i) => rutaPermitida(ef, i.href));
    return items.length ? [{ ...e, items }] : [];
  });
}

/** Los href visibles de un menú, para comparar. */
export function hrefsDelMenu(arbol: Entrada<Hoja>[]): string[] {
  return arbol.flatMap((e) => (e.kind === "link" ? [e.href] : e.items.map((i) => i.href)));
}
