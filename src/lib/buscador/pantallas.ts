/**
 * Pantallas que se pueden buscar: el menú (`NAV_TREE`) más las páginas fuera de él
 * (pestañas y pantallas internas), que salen de pantallas.generated.json. Solo
 * servidor en la práctica: el cliente importa únicamente el tipo, para no mandar
 * al navegador la lista de las pantallas que el usuario no puede ver.
 */

import { NAV_TREE } from "@/lib/constants";
import { destinoDeRuta, puede, rutaPermitida, type PermisosEfectivos } from "@/lib/permisos/motor";
import { AJUSTES, EXCLUIR, EXTRAS } from "./ajustes";
import generadas from "./pantallas.generated.json";
import { normalizar } from "./texto";

export interface PantallaBuscable {
  href: string;
  titulo: string;
  /** Dónde queda, por ejemplo «Financiera › Tesorería». */
  grupo: string;
  /** Título, grupo y sinónimos, ya normalizados. */
  texto: string;
}

interface Interna {
  href: string;
  titulo: string;
  grupo: string;
  soloAdmin: boolean;
  exige?: string[];
  palabras: string[];
  deMenu: boolean;
}

interface EntradaMenu {
  href: string;
  label: string;
  grupo: string;
}

function entradasDelMenu(): EntradaMenu[] {
  return NAV_TREE.flatMap((e) =>
    e.kind === "link"
      ? [{ href: e.href, label: e.label, grupo: "Menú" }]
      : e.items.map((i) => ({ href: i.href, label: i.label, grupo: i.seccion ? `${e.label} › ${i.seccion}` : e.label }))
  );
}

function legible(href: string): string {
  const s = (href.split("/").at(-1) ?? "").replace(/[-_]+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** El grupo de una página fuera del menú: el de la opción de menú que la contiene. */
function grupoCercano(href: string, menu: readonly EntradaMenu[]): string {
  let mejor: EntradaMenu | null = null;
  for (const m of menu) {
    if (m.href !== "/" && href.startsWith(`${m.href}/`) && (!mejor || m.href.length > mejor.href.length)) mejor = m;
  }
  return mejor ? `${mejor.grupo} › ${mejor.label}` : "Otras pantallas";
}

/** Mezcla menú y páginas (PURO, para probarlo). Un título repetido lleva su último segmento. */
export function construirPantallas(paginas: readonly { href: string; titulo: string; soloAdmin: boolean }[]): Interna[] {
  const menu = entradasDelMenu();
  const delMenu = new Set(menu.map((m) => m.href));
  const porHref = new Map(paginas.map((p) => [p.href, p]));
  const excluidas = new Set(EXCLUIR);

  const lista: Interna[] = [
    ...menu.map((m) => ({
      href: m.href,
      titulo: AJUSTES[m.href]?.titulo ?? m.label,
      grupo: m.grupo,
      soloAdmin: porHref.get(m.href)?.soloAdmin ?? false,
      exige: AJUSTES[m.href]?.exige,
      palabras: AJUSTES[m.href]?.palabras ?? [],
      deMenu: true,
    })),
    ...paginas
      .filter((p) => !delMenu.has(p.href) && !excluidas.has(p.href))
      .map((p) => ({
        href: p.href,
        titulo: AJUSTES[p.href]?.titulo ?? p.titulo,
        grupo: grupoCercano(p.href, menu),
        soloAdmin: p.soloAdmin,
        exige: AJUSTES[p.href]?.exige,
        palabras: AJUSTES[p.href]?.palabras ?? [],
        deMenu: false,
      })),
  ];

  const veces = new Map<string, number>();
  for (const p of lista) {
    const k = normalizar(p.titulo);
    veces.set(k, (veces.get(k) ?? 0) + 1);
  }
  return lista.map((p) =>
    // Las del menú conservan su etiqueta: las distingue el grupo.
    !p.deMenu && (veces.get(normalizar(p.titulo)) ?? 0) > 1 ? { ...p, titulo: `${p.titulo} · ${legible(p.href)}` } : p
  );
}

/**
 * La regla única de visibilidad, para pantallas y registros. A diferencia de
 * `rutaPermitida`, una ruta sin dueño en el catálogo no se muestra.
 */
export function rutaVisible(ef: PermisosEfectivos, href: string, opciones: { soloAdmin?: boolean; exige?: readonly string[] } = {}): boolean {
  if (destinoDeRuta(href) === null || !rutaPermitida(ef, href)) return false;
  if (opciones.soloAdmin && !ef.super) return false;
  return !opciones.exige || opciones.exige.some((c) => puede(ef, c));
}

const TODAS = construirPantallas(generadas);

/** Las pantallas que este usuario puede abrir, listas para buscar en el navegador. */
export function pantallasVisibles(ef: PermisosEfectivos): PantallaBuscable[] {
  const visibles = TODAS.filter((p) => rutaVisible(ef, p.href, p)).map((p) => ({
    href: p.href,
    titulo: p.titulo,
    grupo: p.grupo,
    palabras: p.palabras,
  }));
  const extras = EXTRAS.map((e) => ({ href: e.href, titulo: e.titulo, grupo: e.grupo, palabras: e.palabras ?? [] }));
  return [...visibles, ...extras].map(({ palabras, ...p }) => ({
    ...p,
    texto: normalizar([p.titulo, p.grupo, ...palabras].join(" ")),
  }));
}
