/**
 * Abre el archivo subido (KML o KMZ) y devuelve el texto del KML. Sirve en el
 * navegador (vista previa) y en el servidor (validación definitiva).
 * KMZ es un zip: Google Earth guarda el KML principal como `doc.kml`.
 */
export const KML_ACCEPT = ".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz";

export function extensionKml(nombre: string): "kml" | "kmz" | null {
  const m = nombre.toLowerCase().match(/\.(kml|kmz)$/);
  return m ? (m[1] as "kml" | "kmz") : null;
}

const esZip = (b: Uint8Array) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

export async function textoKml(datos: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  if (!esZip(bytes)) return new TextDecoder("utf-8").decode(bytes);
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const kmls = Object.values(zip.files).filter((f) => !f.dir && /\.kml$/i.test(f.name));
  const principal = kmls.find((f) => /(^|\/)doc\.kml$/i.test(f.name)) ?? kmls[0];
  if (!principal) throw new Error("El KMZ no trae ningún archivo .kml adentro.");
  return principal.async("string");
}
