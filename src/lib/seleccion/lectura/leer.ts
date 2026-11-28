/**
 * Una llamada al modelo con todos los archivos de una ráfaga (entrega 4, R1).
 * Solo servidor: no toca la base (eso es ./ejecutar). Lo usa también
 * scripts/evaluar-lectura.mts para calibrar con documentos reales.
 */
import type { AgenteClaves, AgenteConfig } from "@/lib/comunicaciones/agente/config";
import { generarConAdjuntos, type ImagenEntrada } from "@/lib/comunicaciones/agente/proveedores";
import { SISTEMA_LECTURA, instruccionLectura } from "./esquema";
import { interpretarRespuesta, type DocumentoLeido } from "./interpretar";

/**
 * Máximo de archivos por llamada: una hoja de vida en varias fotos, más la
 * cédula y la licencia, caben juntas; lo que sobre se lee en la siguiente pasada.
 */
export const MAX_ARCHIVOS = 12;

export interface ResultadoLectura {
  docs: DocumentoLeido[] | null;
  modelo: string;
  tokensEntrada: number | null;
  tokensSalida: number | null;
  /** Costo real si el proveedor lo dio (ver RespuestaModelo.costoUsd); si no, se estima con los tokens. */
  costoUsd: number | null;
  /** Respuesta cruda, para el error cuando no se pudo interpretar. */
  texto: string;
}

type CtxLectura = { config: AgenteConfig; claves: AgenteClaves; hoy: string; cedulaProceso?: string | null };

/**
 * Lee con el proveedor y el modelo de «Documentos» (pestaña IA de Selección).
 * Si la respuesta no se entiende (28-nov-2026: pasó en una batería con una hoja de
 * vida y tres cartas; una respuesta mal formada o cortada por largo dejaba todos
 * los archivos en error), se lee otra vez en dos mitades y se juntan los resultados.
 */
export async function leerArchivos(archivos: ImagenEntrada[], ctx: CtxLectura): Promise<ResultadoLectura> {
  const lote = archivos.slice(0, MAX_ARCHIVOS);
  const r = await leerUnaVez(lote, ctx);
  if (r.docs) return r;  // Uno solo: un segundo intento. Varios: cada mitad por su lado (respuestas más cortas).
  const partes = lote.length > 1 ? [lote.slice(0, Math.ceil(lote.length / 2)), lote.slice(Math.ceil(lote.length / 2))] : [lote];
  const leidas: ResultadoLectura[] = [];
  for (const parte of partes) leidas.push(await leerUnaVez(parte, ctx));
  const suma = (k: "tokensEntrada" | "tokensSalida" | "costoUsd") =>
    [r, ...leidas].reduce<number | null>((t, x) => (x[k] == null ? t : (t ?? 0) + (x[k] as number)), null);
  const base = { modelo: leidas.at(-1)?.modelo ?? r.modelo, tokensEntrada: suma("tokensEntrada"), tokensSalida: suma("tokensSalida"), costoUsd: suma("costoUsd") };
  if (leidas.some((x) => !x.docs)) return { ...base, docs: null, texto: leidas.find((x) => !x.docs)?.texto ?? r.texto };
  // Los índices de archivo de la segunda mitad se corren a su lugar en el lote.
  let corrimiento = 0;
  const docs: DocumentoLeido[] = [];
  partes.forEach((parte, i) => {
    for (const d of leidas[i].docs!) docs.push({ ...d, archivos: d.archivos.map((k) => k + corrimiento) });
    corrimiento += parte.length;
  });
  return { ...base, docs, texto: leidas.map((x) => x.texto).join("\n") };
}

async function leerUnaVez(lote: ImagenEntrada[], ctx: CtxLectura): Promise<ResultadoLectura> {
  const r = await generarConAdjuntos(ctx.config, ctx.claves, SISTEMA_LECTURA, instruccionLectura(lote.length), lote, {
    // Una hoja de vida larga trae muchas experiencias y referencias.
    maxTokens: 6000,
    timeoutMs: 90_000,
  });
  return {
    docs: interpretarRespuesta(r.texto, lote.length, { hoy: ctx.hoy, cedulaProceso: ctx.cedulaProceso }),
    modelo: r.modeloUsado,
    tokensEntrada: r.tokensEntrada,
    tokensSalida: r.tokensSalida,
    costoUsd: r.costoUsd ?? null,
    texto: r.texto,
  };
}
