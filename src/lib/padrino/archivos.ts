/**
 * Validación de los archivos del Plan Padrino (funciones puras).
 *
 * El MIME lo declara el navegador y no es confiable: la firma binaria
 * (magic bytes) confirma que el contenido es de verdad PDF, JPG o PNG.
 */

export const CERT_MIMES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
export const CERT_MAX = 8 * 1024 * 1024;

const FIRMAS: Record<string, number[][]> = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46, 0x2d]], // %PDF-
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
};

/** El contenido corresponde al MIME declarado (firma binaria al inicio del archivo). */
export function firmaCoincide(mime: string, bytes: Uint8Array): boolean {
  const firmas = FIRMAS[mime];
  if (!firmas) return false;
  return firmas.some((f) => f.length <= bytes.length && f.every((b, i) => bytes[i] === b));
}

/**
 * Evita la inyección de fórmulas al abrir un Excel exportado: un valor que
 * empiece por =, +, - o @ (o tab/CR) se antepone con apóstrofo para que el
 * programa de hojas de cálculo lo trate como texto.
 */
export function textoSeguroExcel(v: string | null | undefined): string {
  const s = v ?? "";
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
