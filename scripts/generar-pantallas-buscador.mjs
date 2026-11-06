#!/usr/bin/env node
/**
 * Índice de pantallas del buscador global: recorre las páginas del panel y
 * escribe src/lib/buscador/pantallas.generated.json. Corre solo antes de
 * `npm run dev` y `npm run build`, así que una página nueva entra sola y una
 * borrada sale sola. No hay que tocarlo al agregar pantallas.
 *
 * El JSON va versionado para que `tsc` y las pruebas funcionen en un clon limpio.
 * Si queda atrasado no hace daño: el build lo regenera. La mezcla con el menú
 * (NAV_TREE) está en src/lib/buscador/pantallas.ts, porque este script no puede
 * importar TypeScript.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PANEL = join(RAIZ, "src", "app", "(dashboard)");
const SALIDA = join(RAIZ, "src", "lib", "buscador", "pantallas.generated.json");

const TITULO = /\btitulo=(?:"([^"]+)"|\{"([^"]+)"\})/;
const TITULO_TOPBAR = /<TopBar\b[^>]*?\btitle=(?:"([^"]+)"|\{"([^"]+)"\})/;
const SOLO_ADMIN = /if\s*\(\s*!perms\.isAdmin\s*\)/;

function paginas(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return paginas(p);
    return n === "page.tsx" ? [p] : [];
  });
}

/** «alta-manual» → «Alta manual». */
function legible(segmento) {
  const s = segmento.replace(/[-_]+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tituloDe(fuente, partes) {
  const m = fuente.match(TITULO) ?? fuente.match(TITULO_TOPBAR);
  const t = m?.[1] ?? m?.[2];
  return t?.trim() || legible(partes.at(-1) ?? "Inicio");
}

const filas = [];
for (const archivo of paginas(PANEL)) {
  const partes = relative(PANEL, dirname(archivo))
    .split(sep)
    .filter((s) => s && !s.startsWith("("));
  // Una ficha necesita un parámetro: se llega a ella por las fuentes de registros.
  if (partes.some((s) => s.startsWith("["))) continue;
  const fuente = readFileSync(archivo, "utf8");
  filas.push({ href: `/${partes.join("/")}`, titulo: tituloDe(fuente, partes), soloAdmin: SOLO_ADMIN.test(fuente) });
}
filas.sort((a, b) => (a.href < b.href ? -1 : a.href > b.href ? 1 : 0));

const contenido = `${JSON.stringify(filas, null, 2)}\n`;
const anterior = existsSync(SALIDA) ? readFileSync(SALIDA, "utf8").replace(/\r\n/g, "\n") : null;
if (anterior !== contenido) {
  writeFileSync(SALIDA, contenido, "utf8");
  console.log(`[buscador] índice actualizado: ${filas.length} pantallas.`);
}
