/**
 * Rellena una plantilla de Word (.docx) con los datos del aspirante: la orden
 * de servicio de exámenes y la carta del banco (Salud Ocupacional,
 * 21-nov-2026). Las marcas van entre llaves en el documento: {nombre},
 * {cedula}, {fecha}… PURO salvo por jszip (ya está en el proyecto por la
 * lectura de hojas de vida).
 *
 * Word a veces parte una marca en varios fragmentos de texto («{nom» +
 * «bre}»), sobre todo si se corrigió a mano. Antes de reemplazar se juntan:
 * entre la llave que abre y la que cierra solo puede haber etiquetas XML y
 * letras, y las etiquetas sobran (cierran y reabren el mismo texto).
 */
import JSZip from "jszip";

/** Las partes del documento donde puede haber marcas. */
const PARTES = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

const escaparXml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Junta las marcas partidas y las reemplaza por su valor. Las que no tienen valor quedan vacías. */
export function rellenarXml(xml: string, valores: Record<string, string>): { xml: string; usadas: string[]; faltan: string[] } {
  const usadas = new Set<string>();
  const faltan = new Set<string>();
  const salida = xml.replace(/\{((?:<[^<>]*>|[a-z_])+)\}/g, (entero, interior: string) => {
    const clave = interior.replace(/<[^<>]*>/g, "");
    if (!/^[a-z_]+$/.test(clave)) return entero;
    usadas.add(clave);
    const valor = valores[clave];
    if (valor == null || !String(valor).trim()) faltan.add(clave);
    // Las etiquetas de en medio se quitan: el valor queda en el primer fragmento de texto.
    return escaparXml(String(valor ?? ""));
  });
  return { xml: salida, usadas: [...usadas], faltan: [...faltan] };
}

/** Las marcas que tiene una plantilla (para avisar en la configuración si falta alguna). */
export async function marcasDeDocx(plantilla: Buffer | Uint8Array): Promise<string[]> {
  const zip = await JSZip.loadAsync(plantilla);
  const marcas = new Set<string>();
  for (const nombre of Object.keys(zip.files).filter((n) => PARTES.test(n))) {
    const xml = await zip.file(nombre)!.async("string");
    for (const m of rellenarXml(xml, {}).usadas) marcas.add(m);
  }
  return [...marcas].sort();
}

/** El .docx con las marcas reemplazadas, más las que no tenían valor. */
export async function rellenarDocx(plantilla: Buffer | Uint8Array, valores: Record<string, string>): Promise<{ docx: Buffer; faltan: string[] }> {
  const zip = await JSZip.loadAsync(plantilla);
  const faltan = new Set<string>();
  for (const nombre of Object.keys(zip.files).filter((n) => PARTES.test(n))) {
    const xml = await zip.file(nombre)!.async("string");
    const r = rellenarXml(xml, valores);
    for (const f of r.faltan) faltan.add(f);
    zip.file(nombre, r.xml);
  }
  const docx = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { docx, faltan: [...faltan] };
}

export const MIME_DOCX_DOCUMENTO = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Marcas que entiende Gestivo en la orden y en la carta. */
export const MARCAS_DOCUMENTO: Record<string, string> = {
  nombre: "Nombre completo del aspirante (en mayúsculas)",
  cedula: "Número de cédula",
  cargo: "Cargo (por defecto, CONDUCTOR - COBRADOR)",
  fecha: "Fecha del documento (dd/mm/aaaa)",
  fecha_cita: "Fecha de la cita en el laboratorio",
  hora: "Hora de la cita",
  laboratorio: "Nombre del laboratorio",
  laboratorio_direccion: "Dirección del laboratorio",
  laboratorio_telefono: "Teléfono del laboratorio",
};
