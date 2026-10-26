/**
 * Reduce una imagen en el navegador antes de subirla (solo cliente).
 *
 * Las fotos del celular pesan 3-8 MB y Vercel corta el cuerpo de una petición
 * en 4,5 MB. Si el navegador no puede decodificarla, devuelve el archivo tal
 * cual y quien recibe decide.
 *
 * `formato: "conservar"` deja los PNG como PNG (logos con transparencia) y
 * convierte lo demás a JPEG.
 */
export async function comprimirImagen(
  file: File,
  opts: { ladoMax: number; calidad: number; formato?: "image/jpeg" | "conservar" }
): Promise<{ blob: Blob; ancho: number | null; alto: number | null }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const escala = Math.min(1, opts.ladoMax / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const tipo = opts.formato === "conservar" && file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, opts.calidad));
    if (!blob) return { blob: file, ancho: canvas.width, alto: canvas.height };
    // Un PNG pequeño puede crecer al re-codificarlo: se queda el original.
    if (blob.size >= file.size && escala === 1 && file.type === tipo) return { blob: file, ancho: canvas.width, alto: canvas.height };
    return { blob, ancho: canvas.width, alto: canvas.height };
  } catch {
    return { blob: file, ancho: null, alto: null };
  }
}
