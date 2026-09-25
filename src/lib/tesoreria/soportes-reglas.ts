/**
 * Soportes de descuentos de afiliados: reglas puras (cliente y servidor).
 * Los sube Tesorería por vehículo y fecha; el afiliado los ve y descarga en
 * el portal (migración 20260925223057).
 */
import type { FilaTercero } from "./liquidacion-afiliados";

export const TIPOS_SOPORTE = [
  { key: "obligaciones", label: "Pago de obligaciones" },
  { key: "combustible", label: "Combustible" },
  { key: "poliza", label: "Póliza" },
  { key: "anticipo", label: "Anticipo" },
  { key: "facturas", label: "Facturas" },
  { key: "otro", label: "Otro" },
] as const;
export type TipoSoporte = (typeof TIPOS_SOPORTE)[number]["key"];
export const ETIQUETA_TIPO: Record<TipoSoporte, string> = Object.fromEntries(TIPOS_SOPORTE.map((t) => [t.key, t.label])) as Record<TipoSoporte, string>;

export function esTipoSoporte(v: string | null | undefined): v is TipoSoporte {
  return TIPOS_SOPORTE.some((t) => t.key === v);
}

/**
 * Vercel admite unos 4,5 MB por petición: cada archivo va en su propia
 * petición y con este tope.
 */
export const SOPORTE_LIMITE_BYTES = 4 * 1024 * 1024;
export const SOPORTE_ACCEPT = ".pdf,image/jpeg,image/png,image/webp";
export const SOPORTE_MIMES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Tipo real del archivo por sus primeros bytes, no por la extensión ni por lo
 * que declare el navegador. null si no es PDF, JPG, PNG ni WebP.
 */
export function tipoPorContenido(b: Uint8Array): string | null {
  const empieza = (...bytes: number[]) => bytes.every((x, i) => b[i] === x);
  if (empieza(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (empieza(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (empieza(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (empieza(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** Soporte tal como lo reciben la pantalla y el portal (sin la ruta en Storage). */
export interface SoporteVista {
  id: string;
  codigoVehiculo: string;
  fecha: string;
  tipo: TipoSoporte;
  concepto: string;
  valor: number | null;
  archivoNombre: string;
  archivoMime: string;
  archivoTamano: number;
  subidoPorEmail: string | null;
  createdAt: string;
}

export type EstadoRespaldo = "soportado" | "parcial" | "sin_soporte" | "solo_soporte";

export const ESTADO_RESPALDO_LABEL: Record<EstadoRespaldo, string> = {
  soportado: "Soportado",
  parcial: "Soporte parcial",
  sin_soporte: "Sin soporte",
  solo_soporte: "Soporte sin descuento en GEMA",
};

export interface RespaldoDia {
  fecha: string;
  /** Descuentos otros de GEMA ese día (pago de obligaciones). */
  descuento: number;
  /** Suma de los valores de los soportes de obligaciones ese día. */
  soportado: number;
  soportes: number;
  estado: EstadoRespaldo;
}

/**
 * Cruce, por fecha, del pago de obligaciones de GEMA contra los soportes de
 * tipo "obligaciones" de ese vehículo. Tolera un peso de diferencia por
 * redondeo. Un soporte sin valor cuenta como soporte pero no suma.
 */
export function cruzarObligaciones(filas: Pick<FilaTercero, "fecha" | "descuentos_otros">[], soportes: SoporteVista[]): RespaldoDia[] {
  const descuento = new Map<string, number>();
  for (const f of filas) {
    const v = Number(f.descuentos_otros ?? 0);
    if (v) descuento.set(f.fecha, (descuento.get(f.fecha) ?? 0) + v);
  }
  const soportado = new Map<string, { suma: number; n: number }>();
  for (const s of soportes) {
    if (s.tipo !== "obligaciones") continue;
    const x = soportado.get(s.fecha) ?? { suma: 0, n: 0 };
    x.suma += Number(s.valor ?? 0);
    x.n++;
    soportado.set(s.fecha, x);
  }
  const fechas = [...new Set([...descuento.keys(), ...soportado.keys()])].sort();
  return fechas.map((fecha) => {
    const d = Math.round(descuento.get(fecha) ?? 0);
    const s = soportado.get(fecha) ?? { suma: 0, n: 0 };
    const suma = Math.round(s.suma);
    const estado: EstadoRespaldo =
      d === 0 ? "solo_soporte"
      : s.n === 0 ? "sin_soporte"
      : Math.abs(suma - d) <= 1 ? "soportado"
      : "parcial";
    return { fecha, descuento: d, soportado: suma, soportes: s.n, estado };
  });
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
