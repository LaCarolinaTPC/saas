/**
 * Formatos de archivo que se pueden leer (23-nov-2026): lo que se le manda al
 * modelo de «Documentos» según el tipo. El modelo lee fotos y PDF; de los
 * documentos de texto (Word .docx, OpenDocument .odt, RTF, texto plano) se saca
 * el texto (y las imágenes pegadas, en .docx y .odt). Lo usan la lectura de los
 * archivos que llegan por WhatsApp y el chat de prueba.
 *
 * El Word antiguo (.doc, binario) no se lee: se pide guardarlo como .docx o PDF.
 */
import JSZip from "jszip";
import type { ImagenEntrada } from "@/lib/comunicaciones/agente/proveedores";
import { MIME_DOCX, extraerDocx } from "./docx";
import { FORMATOS_LEGIBLES, MIME_ODT } from "./formatos-aceptados";

export { MIME_ODT };
const TIPOS_IMAGEN = new Set(["image/jpeg", "image/png", "image/webp"]);

export type FormatoArchivo = "imagen" | "pdf" | "docx" | "odt" | "rtf" | "texto";

const limpiarMime = (m: string | null | undefined) => String(m ?? "").split(";")[0].trim().toLowerCase();
const extension = (n: string | null | undefined) => (String(n ?? "").match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();

/**
 * El formato por el tipo o, si no viene o es genérico (WhatsApp a veces manda
 * «application/octet-stream»), por la extensión. null si no se puede leer.
 */
export function formatoDe(mime: string | null | undefined, nombre?: string | null): FormatoArchivo | null {
  const m = limpiarMime(mime);
  const ext = extension(nombre);
  const generico = !m || m === "application/octet-stream" || m === "application/zip" || m === "binary/octet-stream";
  if (TIPOS_IMAGEN.has(m)) return "imagen";
  if (m === "application/pdf" || (generico && ext === "pdf")) return "pdf";
  if (m === MIME_DOCX || (generico && ext === "docx")) return "docx";
  if (m === MIME_ODT || (generico && ext === "odt")) return "odt";
  if (m === "application/rtf" || m === "text/rtf" || ((generico || m === "application/msword") && ext === "rtf")) return "rtf";
  if (m === "text/plain" || (generico && ext === "txt")) return "texto";
  if (generico && ["jpg", "jpeg", "png", "webp"].includes(ext)) return "imagen";
  return null;
}

/** Un Word antiguo (.doc): se avisa que lo guarde como .docx o PDF. */
export function esDocAntiguo(mime: string | null | undefined, nombre?: string | null): boolean {
  return extension(nombre) === "doc" || (limpiarMime(mime) === "application/msword" && extension(nombre) !== "rtf");
}

/** El tipo que se guarda para el archivo (en la carpeta del candidato), según su formato. */
export function mimeDeFormato(formato: FormatoArchivo, mime: string | null | undefined, nombre?: string | null): string {
  if (formato === "imagen") {
    const m = limpiarMime(mime);
    if (TIPOS_IMAGEN.has(m)) return m;
    const ext = extension(nombre);
    return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  }
  return { pdf: "application/pdf", docx: MIME_DOCX, odt: MIME_ODT, rtf: "application/rtf", texto: "text/plain" }[formato];
}

const ENTIDADES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/** Texto de content.xml de un .odt. PURO. Párrafos y títulos en su línea; celdas de una fila con « | ». */
export function odtATexto(xml: string): string {
  return xml
    .replace(/<table:table-cell\b[^>]*>([\s\S]*?)<\/table:table-cell>/g, (_, celda: string) => `${celda.replace(/<\/text:(p|h)>/g, " ")}</table:table-cell>`)
    .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, n: string | undefined) => " ".repeat(Number(n ?? 1)))
    .replace(/<text:tab\s*\/>/g, " ")
    .replace(/<text:line-break\s*\/>/g, "\n")
    .replace(/<\/table:table-cell>/g, " | ")
    .replace(/<\/table:table-row>/g, "\n")
    .replace(/<\/text:(p|h)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENTIDADES[e] ?? e)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\| ?\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

// Windows-1252 en 0x80–0x9F (el resto coincide con Latin-1).
const CP1252: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž",
  0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};
const byteATexto = (b: number) => CP1252[b] ?? String.fromCharCode(b);

/**
 * Texto de un RTF. PURO. Quita las tablas de fuentes y colores, los grupos
 * «\*» y los comandos; respeta \par, \line, \tab, \'hh (Windows-1252) y \uN.
 */
export function rtfATexto(rtf: string): string {
  let out = "";
  let i = 0;
  const n = rtf.length;
  // Pila de grupos: si el grupo se descarta (fonttbl, colortbl, \*…) y cuántos caracteres saltar tras \uN.
  const pila: { omitir: boolean; uc: number }[] = [{ omitir: false, uc: 1 }];
  let saltar = 0;
  const DESCARTAR = new Set(["fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "headerl", "headerr", "footerl", "footerr", "object", "themedata", "datastore", "latentstyles", "xmlnstbl", "listtable", "listoverridetable", "rsidtbl", "generator"]);
  const actual = () => pila[pila.length - 1];
  const emitir = (s: string) => {
    if (actual().omitir) return;
    if (saltar > 0) {
      saltar--;
      return;
    }
    out += s;
  };
  while (i < n) {
    const c = rtf[i];
    if (c === "{") {
      pila.push({ ...actual() });
      i++;
    } else if (c === "}") {
      if (pila.length > 1) pila.pop();
      i++;
    } else if (c === "\\") {
      const sig = rtf[i + 1];
      if (sig === "\\" || sig === "{" || sig === "}") {
        emitir(sig);
        i += 2;
      } else if (sig === "'") {
        emitir(byteATexto(parseInt(rtf.slice(i + 2, i + 4), 16)));
        i += 4;
      } else if (sig === "*") {
        actual().omitir = true;
        i += 2;
      } else if (sig === "~") {
        emitir(" ");
        i += 2;
      } else if (sig === "\n" || sig === "\r") {
        emitir("\n");
        i += 2;
      } else {
        const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
        if (!m) {
          i++;
          continue;
        }
        i += m[0].length;
        const palabra = m[1];
        const num = m[2] != null ? Number(m[2]) : null;
        if (DESCARTAR.has(palabra)) actual().omitir = true;
        else if (palabra === "par" || palabra === "line" || palabra === "row") emitir("\n");
        else if (palabra === "tab" || palabra === "cell") emitir(" ");
        else if (palabra === "uc" && num != null) actual().uc = num;
        else if (palabra === "u" && num != null) {
          emitir(String.fromCharCode(num < 0 ? num + 65536 : num));
          saltar = actual().uc;
        }
      }
    } else if (c === "\n" || c === "\r") {
      i++;
    } else {
      emitir(c);
      i++;
    }
  }
  return out
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

const MAX_TEXTO = 60_000;
const MAX_IMAGENES = 3;
const MIN_BYTES_IMAGEN = 15_000;
const MAX_BYTES_IMAGEN = 3_000_000;

/** Texto e imágenes de un .odt. Lanza si no es un OpenDocument válido. */
async function extraerOdt(bytes: Buffer | Uint8Array): Promise<{ texto: string; imagenes: { tipo: "image/jpeg" | "image/png"; base64: string }[] }> {
  const zip = await JSZip.loadAsync(bytes);
  const contenido = zip.file("content.xml");
  if (!contenido) throw new Error("El archivo no parece un documento OpenDocument (.odt).");
  const texto = odtATexto(await contenido.async("string")).slice(0, MAX_TEXTO);
  const imagenes: { tipo: "image/jpeg" | "image/png"; base64: string }[] = [];
  const medios = Object.values(zip.files)
    .filter((f) => !f.dir && /^Pictures\/.+\.(jpe?g|png)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const f of medios) {
    if (imagenes.length >= MAX_IMAGENES) break;
    const datos = await f.async("nodebuffer");
    if (datos.byteLength < MIN_BYTES_IMAGEN || datos.byteLength > MAX_BYTES_IMAGEN) continue;
    imagenes.push({ tipo: /\.png$/i.test(f.name) ? "image/png" : "image/jpeg", base64: datos.toString("base64") });
  }
  return { texto, imagenes };
}

/** Texto de un archivo de texto: UTF-8 o, si no lo es, Windows-1252 (los .txt de Windows). */
function decodificarTexto(bytes: Buffer | Uint8Array): string {
  const b = Buffer.from(bytes);
  const utf8 = b.toString("utf8");
  return utf8.includes("�") ? Array.from(b, byteATexto).join("") : utf8.replace(/^﻿/, "");
}

export type ArchivoParaModelo = { ok: true; archivo: ImagenEntrada; formato: FormatoArchivo } | { ok: false; estado: "ilegible" | "error" | "omitido"; error: string };

/** Lo que se le manda al modelo de un archivo, según su formato. */
export async function archivoParaModelo(bytes: Buffer | Uint8Array, mime: string | null | undefined, nombre?: string | null): Promise<ArchivoParaModelo> {
  const formato = formatoDe(mime, nombre);
  if (!formato) {
    return esDocAntiguo(mime, nombre)
      ? { ok: false, estado: "omitido", error: "Es un Word antiguo (.doc): no se puede leer. Pídale que lo guarde como .docx o PDF." }
      : { ok: false, estado: "omitido", error: `Este tipo de archivo no se puede leer. Se leen: ${FORMATOS_LEGIBLES}.` };
  }
  const nombreArchivo = nombre?.trim() || undefined;
  try {
    if (formato === "imagen" || formato === "pdf") {
      return { ok: true, formato, archivo: { tipo: mimeDeFormato(formato, mime, nombre) as ImagenEntrada["tipo"], base64: Buffer.from(bytes).toString("base64"), nombre: nombreArchivo } };
    }
    const { texto, imagenes } =
      formato === "docx"
        ? await extraerDocx(bytes)
        : formato === "odt"
          ? await extraerOdt(bytes)
          : { texto: (formato === "rtf" ? rtfATexto(decodificarTexto(bytes)) : decodificarTexto(bytes)).slice(0, MAX_TEXTO), imagenes: [] };
    if (!texto.trim() && !imagenes.length) return { ok: false, estado: "ilegible", error: "El documento está vacío." };
    const etiqueta = { docx: "documento.docx", odt: "documento.odt", rtf: "documento.rtf", texto: "documento.txt" }[formato];
    return { ok: true, formato, archivo: { tipo: "text/plain", base64: "", texto, nombre: nombreArchivo ?? etiqueta, adjuntas: imagenes } };
  } catch (e) {
    return { ok: false, estado: "error", error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}
