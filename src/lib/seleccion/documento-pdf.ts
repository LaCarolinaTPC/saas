/**
 * Llena una plantilla en PDF con los datos del aspirante (pedido del
 * 23-nov-2026: la carta del banco sale en PDF para que la impriman).
 *
 * Gestión Humana escribe las marcas en el Word ({nombre}, {cedula}, {cargo},
 * {fecha_larga}…), lo guarda como PDF y lo sube. Como el valor casi nunca mide
 * lo mismo que la marca («{nombre}» frente a «LUIS FERNANDO GÓMEZ RUIZ»), no se
 * escribe encima: el párrafo que tiene marcas se vuelve a componer, justificado
 * y con la misma letra, y lo de abajo baja si hace falta.
 *
 * Modo limpio (el normal): de la plantilla se quita todo el texto (queda lo
 * gráfico: logo, líneas, imágenes) y se vuelve a escribir entero, así el PDF no
 * guarda las marcas escondidas. Si no se puede (texto girado, letras que no hay
 * en las estándar, texto dentro de bloques que no se limpian), modo tapado: el
 * párrafo original queda debajo de un rectángulo blanco.
 *
 * La letra de cada fragmento sale del nombre de la fuente del PDF
 * («TimesNewRomanPS-BoldItalicMT» → Times negrita cursiva). Si el PDF no lo
 * dice, se averigua por el ancho (con cuidado: en un párrafo justificado el
 * ancho incluye los espacios estirados). Solo servidor.
 */
import { PDFArray, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream, rgb, type PDFFont, type PDFPage, type PDFRef } from "pdf-lib";
import { getDocumentProxy } from "unpdf";
import { quitarTexto } from "./pdf-sin-texto";

const MARCA = /\{([a-z_]+)\}/g;
const TIENE_MARCA = /\{[a-z_]+\}/;
const FAMILIAS = {
  times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanBoldItalic],
  helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBold, StandardFonts.HelveticaBoldOblique],
} as const;

interface Fragmento {
  str: string;
  x: number;
  y: number;
  w: number;
  tam: number;
  /** Nombre de la fuente en el PDF, si se pudo leer. */
  fuente: string | null;
}

type Familia = keyof typeof FAMILIAS;
type Familias = Record<Familia, PDFFont[]>;

/** La letra estándar que corresponde al nombre de la fuente del PDF; null si no se reconoce. */
export function letraPorNombre(nombre: string | null | undefined): { familia: Familia; negrita: boolean; cursiva: boolean } | null {
  // Sin el prefijo del subconjunto incrustado («BCDGEE+TimesNewRomanPS-BoldMT»).
  const n = String(nombre ?? "").replace(/^[A-Z]{6}\+/, "").toLowerCase();
  if (!n) return null;
  const familia: Familia | null = /times|serif|georgia|cambria|garamond|book/.test(n) ? "times" : /arial|helvetica|calibri|verdana|tahoma|segoe|sans/.test(n) ? "helvetica" : null;
  if (!familia) return null;
  return { familia, negrita: /bold|black|heavy|semibold|demi/.test(n), cursiva: /italic|oblique/.test(n) };
}

interface Linea {
  y: number;
  tam: number;
  fragmentos: Fragmento[];
  izquierda: number;
  derecha: number;
}

/** Ancho de un texto en una letra; null si la letra no tiene algún carácter. */
function ancho(fuente: PDFFont, texto: string, tam: number): number | null {
  try {
    return fuente.widthOfTextAtSize(texto, tam);
  } catch {
    return null;
  }
}

/** La letra del fragmento: por el nombre de su fuente o, si no se sabe, por el ancho. */
function letraDe(f: Fragmento, fuentes: PDFFont[]): PDFFont {
  const porNombre = letraPorNombre(f.fuente);
  if (porNombre) return fuentes[(porNombre.cursiva ? 1 : 0) + (porNombre.negrita ? 2 : 0)];
  // Por el ancho, sin los espacios (en un párrafo justificado vienen estirados).
  const sinEspacios = { ...f, str: f.str.replace(/\s+/g, ""), w: f.w * (f.str.replace(/\s+/g, "").length / Math.max(1, f.str.length)) };
  return letraPorAncho(sinEspacios, fuentes);
}

/** La letra estándar cuyo ancho se parece más al del fragmento. */
function letraPorAncho(f: Fragmento, fuentes: PDFFont[]): PDFFont {
  let mejor = fuentes[0];
  let error = Infinity;
  for (const fu of fuentes) {
    const a = ancho(fu, f.str, f.tam);
    if (a == null) continue;
    const e = Math.abs(a - f.w);
    if (e < error) {
      error = e;
      mejor = fu;
    }
  }
  return mejor;
}

/** Agrupa los fragmentos por renglón (misma altura), de arriba abajo. */
function renglones(fragmentos: Fragmento[]): Linea[] {
  const lineas: Linea[] = [];
  for (const f of [...fragmentos].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const l = lineas.find((x) => Math.abs(x.y - f.y) < Math.max(1.5, f.tam * 0.25));
    if (l) l.fragmentos.push(f);
    else lineas.push({ y: f.y, tam: f.tam, fragmentos: [f], izquierda: 0, derecha: 0 });
  }
  for (const l of lineas) {
    l.fragmentos.sort((a, b) => a.x - b.x);
    l.izquierda = Math.min(...l.fragmentos.map((f) => f.x));
    l.derecha = Math.max(...l.fragmentos.map((f) => f.x + f.w));
    l.tam = Math.max(...l.fragmentos.map((f) => f.tam));
  }
  return lineas.sort((a, b) => b.y - a.y);
}

/** Los renglones seguidos (mismo margen y separación de un renglón) forman un párrafo. */
function parrafos(lineas: Linea[]): Linea[][] {
  const grupos: Linea[][] = [];
  for (const l of lineas) {
    const ultimo = grupos[grupos.length - 1];
    const previa = ultimo?.[ultimo.length - 1];
    const sigue = previa && Math.abs(previa.izquierda - l.izquierda) < 3 && Math.abs(previa.tam - l.tam) < 0.6 && previa.y - l.y < l.tam * 1.6;
    if (sigue) ultimo.push(l);
    else grupos.push([l]);
  }
  return grupos;
}

interface Palabra {
  texto: string;
  fuente: PDFFont;
}

/** Compone las palabras en renglones del ancho dado (codicioso). */
function partir(palabras: Palabra[], anchoMax: number, tam: number, espacio: number): Palabra[][] {
  const out: Palabra[][] = [];
  let actual: Palabra[] = [];
  let usado = 0;
  for (const p of palabras) {
    const w = ancho(p.fuente, p.texto, tam) ?? 0;
    const extra = actual.length ? espacio + w : w;
    if (actual.length && usado + extra > anchoMax) {
      out.push(actual);
      actual = [p];
      usado = w;
    } else {
      actual.push(p);
      usado += extra;
    }
  }
  if (actual.length) out.push(actual);
  return out;
}

export interface ResultadoPdf {
  pdf: Uint8Array;
  usadas: string[];
  faltan: string[];
  /**
   * «limpio»: se quitó todo el texto de la plantilla y se volvió a escribir (el
   * PDF no guarda las marcas). «tapado»: el párrafo original quedó debajo de un
   * rectángulo blanco.
   */
  modo: "limpio" | "tapado";
}

/** Las marcas que tiene una plantilla PDF (para avisar en la configuración). */
export async function marcasDePdf(plantilla: Uint8Array): Promise<string[]> {
  const doc = await getDocumentProxy(new Uint8Array(plantilla), { fontExtraProperties: true });
  const marcas = new Set<string>();
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    const texto = (tc.items as { str?: string }[]).map((i) => i.str ?? "").join("");
    for (const m of texto.matchAll(MARCA)) marcas.add(m[1]);
  }
  return [...marcas];
}

interface PaginaLeida {
  /** Índice de la página (desde 0). */
  indice: number;
  fragmentos: Fragmento[];
  girada: boolean;
}

/** Las páginas con marcas, con sus fragmentos de texto, letra y posición. */
async function leerPaginas(plantilla: Uint8Array): Promise<PaginaLeida[]> {
  // fontExtraProperties: para leer el nombre de cada fuente (negrita, cursiva).
  const lector = await getDocumentProxy(new Uint8Array(plantilla), { fontExtraProperties: true });
  const out: PaginaLeida[] = [];
  for (let n = 1; n <= lector.numPages; n++) {
    const hoja = await lector.getPage(n);
    const tc = await hoja.getTextContent();
    // Carga las fuentes para poder leer su nombre.
    await hoja.getOperatorList().catch(() => null);
    const nombreFuente = (id: string | undefined): string | null => {
      try {
        return id ? ((hoja.commonObjs.get(id) as { name?: string } | null)?.name ?? null) : null;
      } catch {
        return null;
      }
    };
    const items = (tc.items as { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string }[]).filter((i) => i.str && i.str.trim() && i.transform);
    const fragmentos: Fragmento[] = items.map((i) => ({ str: i.str!, x: i.transform![4], y: i.transform![5], w: i.width ?? 0, tam: Math.abs(i.height || i.transform![3]) || 11, fuente: nombreFuente(i.fontName) }));
    if (!fragmentos.some((f) => TIENE_MARCA.test(f.str))) continue;
    const girada = items.some((i) => Math.abs(i.transform![1]) > 0.01 || Math.abs(i.transform![2]) > 0.01);
    out.push({ indice: n - 1, fragmentos, girada });
  }
  return out;
}

/**
 * La plantilla sin el texto de esas páginas (queda lo gráfico: logo, líneas,
 * imágenes), o null si no se pudo: secuencias que no se leen, o texto que sigue
 * apareciendo después de limpiar (p. ej. dentro de un bloque incrustado).
 */
async function sinTexto(plantilla: Uint8Array, indices: number[]): Promise<Uint8Array | null> {
  try {
    const doc = await PDFDocument.load(plantilla);
    for (const idx of indices) {
      const pagina = doc.getPage(idx);
      const c = pagina.node.Contents();
      if (!c) continue;
      const secuencias = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
      const refs: PDFRef[] = [];
      for (const s of secuencias) {
        if (!(s instanceof PDFRawStream)) return null;
        const limpio = quitarTexto(decodePDFRawStream(s).decode());
        refs.push(doc.context.register(doc.context.flateStream(limpio)));
      }
      pagina.node.set(PDFName.of("Contents"), doc.context.obj(refs));
    }
    const bytes = await doc.save();
    // Se comprueba que de verdad no quedó texto en esas páginas.
    const lector = await getDocumentProxy(new Uint8Array(bytes));
    for (const idx of indices) {
      const tc = await (await lector.getPage(idx + 1)).getTextContent();
      if ((tc.items as { str?: string }[]).some((i) => i.str?.trim())) return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

interface Trazo {
  texto: string;
  x: number;
  y: number;
  tam: number;
  fuente: PDFFont;
}

interface Tapa {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Qué escribir en la página y dónde. El párrafo con marcas se vuelve a componer
 * (justificado, con la letra de cada fragmento); los de abajo bajan si creció,
 * hasta un espacio grande que lo absorba (el de la firma). En modo limpio se
 * escribe todo (la plantilla ya no tiene texto); en tapado, solo lo que cambia,
 * y se tapa su sitio original.
 */
function planPagina(
  fragmentos: Fragmento[],
  familias: Familias,
  valores: Record<string, string>,
  usadas: Set<string>,
  faltan: Set<string>,
  limpio: boolean
): { trazos: Trazo[]; tapas: Tapa[]; dibujable: boolean } {
  const lineas = renglones(fragmentos);
  const margenDerecho = Math.max(...lineas.map((l) => l.derecha));

  // La familia de letra de la página: la de las fuentes del PDF o, si no se sabe, la que mejor explica los anchos.
  const conNombre = fragmentos.map((f) => letraPorNombre(f.fuente)).filter((x) => x != null);
  const errorDe = (fuentes: PDFFont[]) =>
    fragmentos.reduce((s, f) => {
      const a = ancho(letraPorAncho(f, fuentes), f.str, f.tam);
      return s + (a == null ? f.w : Math.abs(a - f.w));
    }, 0);
  const fuentes = conNombre.length
    ? familias[conNombre.filter((x) => x.familia === "times").length >= conNombre.length / 2 ? "times" : "helvetica"]
    : errorDe(familias.times) <= errorDe(familias.helvetica)
      ? familias.times
      : familias.helvetica;

  const grupos = parrafos(lineas);
  const tieneMarca = (par: Linea[]) => par.some((l) => l.fragmentos.some((f) => TIENE_MARCA.test(f.str)));
  const trazos: Trazo[] = [];
  const tapas: Tapa[] = [];
  let dibujable = true;
  const poner = (texto: string, x: number, y: number, tam: number, fuente: PDFFont) => {
    if (!texto) return;
    if (ancho(fuente, texto, tam) == null) dibujable = false;
    else trazos.push({ texto, x, y, tam, fuente });
  };
  /** Palabras repartidas a lo ancho (renglón justificado) o seguidas con el espacio normal. */
  const renglon = (palabras: Palabra[], x0: number, y: number, tam: number, anchoMax: number | null, espacioNormal: number) => {
    const anchos = palabras.map((p) => ancho(p.fuente, p.texto, tam) ?? 0);
    const espacio = anchoMax != null && palabras.length > 1 ? (anchoMax - anchos.reduce((s, a) => s + a, 0)) / (palabras.length - 1) : espacioNormal;
    let x = x0;
    palabras.forEach((p, j) => {
      poner(p.texto, x, y, tam, p.fuente);
      x += anchos[j] + espacio;
    });
  };

  let desplazamiento = 0;
  grupos.forEach((par, idx) => {
    const tamOriginal = par[0].tam;
    const interlineado = par.length > 1 ? (par[0].y - par[par.length - 1].y) / (par.length - 1) : tamOriginal * 1.15;
    const izquierda = par[0].izquierda;
    const conMarca = tieneMarca(par);
    const seMueve = conMarca || desplazamiento > 0.5;
    const espacioNormal = ancho(fuentes[0], " ", tamOriginal) ?? tamOriginal * 0.25;
    const y0 = par[0].y - desplazamiento;
    let renglonesNuevos = par.length;

    if (conMarca) {
      // Un párrafo de varios renglones justificado ocupa todo el ancho; uno de un renglón puede crecer hasta el margen.
      const derecha = Math.max(margenDerecho, ...par.map((l) => l.derecha));
      const anchoMax = derecha - izquierda;
      const palabras: Palabra[] = [];
      for (const l of par) {
        for (const f of l.fragmentos) {
          const fuente = letraDe(f, fuentes);
          const reemplazado = f.str.replace(MARCA, (_, clave: string) => {
            usadas.add(clave);
            const v = String(valores[clave] ?? "").trim();
            if (!v) faltan.add(clave);
            return v;
          });
          for (const t of reemplazado.split(/\s+/).filter(Boolean)) palabras.push({ texto: t, fuente });
        }
      }
      const compuestos = partir(palabras, anchoMax, tamOriginal, espacioNormal);
      renglonesNuevos = compuestos.length;
      compuestos.forEach((r, i) => renglon(r, izquierda, y0 - i * interlineado, tamOriginal, par.length > 1 && i < compuestos.length - 1 ? anchoMax : null, espacioNormal));
    } else if (limpio || seMueve) {
      // Sin marcas: cada renglón en su sitio (bajado si hace falta). Los de un párrafo justificado se
      // vuelven a justificar; los demás se escriben fragmento por fragmento, donde estaban.
      par.forEach((l, i) => {
        const y = l.y - desplazamiento;
        if (par.length > 1 && i < par.length - 1) {
          const palabras = l.fragmentos.flatMap((f) => f.str.split(/\s+/).filter(Boolean).map((texto) => ({ texto, fuente: letraDe(f, fuentes) })));
          renglon(palabras, l.izquierda, y, l.tam, l.derecha - l.izquierda, espacioNormal);
        } else {
          for (const f of l.fragmentos) {
            const fuente = letraDe(f, fuentes);
            const inicial = f.str.match(/^\s*/)![0];
            poner(f.str.trim(), f.x + (inicial ? (ancho(fuente, inicial, f.tam) ?? 0) : 0), y, f.tam, fuente);
          }
        }
      });
    }

    if (!limpio && seMueve) {
      const derecha = Math.max(conMarca ? margenDerecho : 0, ...par.map((l) => l.derecha));
      const arriba = par[0].y + tamOriginal;
      const abajo = par[par.length - 1].y - tamOriginal * 0.35;
      tapas.push({ x: izquierda - 2, y: abajo, w: derecha - izquierda + 4, h: arriba - abajo });
    }

    // ¿Cuánto debe bajar el bloque siguiente para conservar la separación original?
    const siguiente = grupos[idx + 1];
    if (!siguiente) return;
    const fondoNuevo = y0 - (renglonesNuevos - 1) * interlineado;
    const separacion = par[par.length - 1].y - siguiente[0].y;
    let falta = siguiente[0].y - (fondoNuevo - separacion);
    // Un espacio grande (más de tres renglones, p. ej. el de la firma) absorbe lo que crezca.
    if (separacion > interlineado * 3) falta -= separacion - interlineado * 2;
    desplazamiento = Math.max(0, falta);
  });
  return { trazos, tapas, dibujable };
}

/** Escribe el plan sobre la base: la plantilla (tapado) o la plantilla sin texto (limpio). */
async function escribir(base: Uint8Array, paginas: PaginaLeida[], valores: Record<string, string>, limpio: boolean): Promise<ResultadoPdf | null> {
  const doc = await PDFDocument.load(base);
  const familias: Familias = {
    times: await Promise.all(FAMILIAS.times.map((f) => doc.embedFont(f))),
    helvetica: await Promise.all(FAMILIAS.helvetica.map((f) => doc.embedFont(f))),
  };
  const usadas = new Set<string>();
  const faltan = new Set<string>();
  for (const p of paginas) {
    const plan = planPagina(p.fragmentos, familias, valores, usadas, faltan, limpio);
    // En limpio no puede faltar nada: si una letra no se puede escribir, se usa el modo tapado.
    if (limpio && !plan.dibujable) return null;
    const pagina: PDFPage = doc.getPage(p.indice);
    // Primero se tapa todo y después se escribe: si no, tapar un bloque en su sitio original cortaría el de arriba que ya bajó.
    for (const t of plan.tapas) pagina.drawRectangle({ x: t.x, y: t.y, width: t.w, height: t.h, color: rgb(1, 1, 1) });
    for (const t of plan.trazos) pagina.drawText(t.texto, { x: t.x, y: t.y, size: t.tam, font: t.fuente, color: rgb(0, 0, 0) });
  }
  return { pdf: await doc.save(), usadas: [...usadas], faltan: [...faltan], modo: limpio ? "limpio" : "tapado" };
}

/**
 * La plantilla con las marcas reemplazadas, más las que no tenían valor. Se
 * intenta el modo limpio (sin texto de la plantilla, todo reescrito) y, si no se
 * puede, el tapado. `modo` fuerza uno (pruebas).
 */
export async function rellenarPdf(plantilla: Uint8Array, valores: Record<string, string>, opciones: { modo?: "limpio" | "tapado" } = {}): Promise<ResultadoPdf> {
  const paginas = await leerPaginas(plantilla);
  if (!paginas.length) return { pdf: plantilla, usadas: [], faltan: [], modo: "limpio" };
  if (opciones.modo !== "tapado" && !paginas.some((p) => p.girada)) {
    const base = await sinTexto(plantilla, paginas.map((p) => p.indice));
    const r = base ? await escribir(base, paginas, valores, true) : null;
    if (r) return r;
  }
  return (await escribir(plantilla, paginas, valores, false))!;
}
