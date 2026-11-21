/**
 * Una llamada al modelo con todos los archivos de una ráfaga (entrega 4, R1).
 * Solo servidor: no toca la base (eso es ./ejecutar). Lo usa también
 * scripts/evaluar-lectura.mts para calibrar con documentos reales.
 */
import type { AgenteClaves, AgenteConfig } from "@/lib/comunicaciones/agente/config";
import { generarConAdjuntos, modeloPreciso, type ImagenEntrada } from "@/lib/comunicaciones/agente/proveedores";
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
  /** Respuesta cruda, para el error cuando no se pudo interpretar. */
  texto: string;
}

export async function leerArchivos(
  archivos: ImagenEntrada[],
  ctx: { config: AgenteConfig; claves: AgenteClaves; preciso: boolean; hoy: string; cedulaProceso?: string | null }
): Promise<ResultadoLectura> {
  const lote = archivos.slice(0, MAX_ARCHIVOS);
  const r = await generarConAdjuntos(ctx.config, ctx.claves, SISTEMA_LECTURA, instruccionLectura(lote.length), lote, {
    modelo: ctx.preciso ? modeloPreciso(ctx.config.proveedor) : null,
    // Una hoja de vida larga trae muchas experiencias y referencias.
    maxTokens: 6000,
    timeoutMs: 90_000,
  });
  return {
    docs: interpretarRespuesta(r.texto, lote.length, { hoy: ctx.hoy, cedulaProceso: ctx.cedulaProceso }),
    modelo: r.modeloUsado,
    tokensEntrada: r.tokensEntrada,
    tokensSalida: r.tokensSalida,
    texto: r.texto,
  };
}
