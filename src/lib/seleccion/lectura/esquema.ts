/**
 * Lectura de documentos del aspirante (entrega 4, A6 y R1–R7): clases, campos
 * y la forma de la respuesta del modelo. PURO.
 *
 * Una sola llamada por ráfaga con todas las fotos o PDF (máx. 8): el modelo
 * clasifica cada archivo, junta los que son un mismo documento (las fotos de
 * las páginas de una hoja de vida) y extrae los campos con su confianza y la
 * evidencia (el texto que vio). Nada leído se aplica solo: una persona lo
 * acepta, corrige o rechaza en «Documentos leídos».
 */
import { z } from "zod";

export const CLASES = ["cedula", "licencia", "hoja_vida", "carta_laboral", "otro"] as const;
export type ClaseDocumento = (typeof CLASES)[number];

export const NOMBRE_CLASE: Record<ClaseDocumento, string> = {
  cedula: "Cédula",
  licencia: "Licencia de conducción",
  hoja_vida: "Hoja de vida",
  carta_laboral: "Carta laboral",
  otro: "Otro documento",
};

export type Confianza = "alta" | "media" | "baja";

/** Campos que se piden por clase, en el orden en que se muestran. */
export const CAMPOS_POR_CLASE: Record<ClaseDocumento, { campo: string; etiqueta: string }[]> = {
  cedula: [
    { campo: "numero", etiqueta: "Número" },
    { campo: "nombres", etiqueta: "Nombres" },
    { campo: "apellidos", etiqueta: "Apellidos" },
    { campo: "fecha_nacimiento", etiqueta: "Fecha de nacimiento" },
    { campo: "fecha_expedicion", etiqueta: "Fecha de expedición" },
    { campo: "lugar_expedicion", etiqueta: "Lugar de expedición" },
  ],
  licencia: [
    { campo: "numero", etiqueta: "Número" },
    { campo: "nombre", etiqueta: "Nombre" },
    { campo: "categorias", etiqueta: "Categorías y vencimiento" },
    { campo: "restricciones", etiqueta: "Restricciones" },
  ],
  hoja_vida: [
    { campo: "nombre", etiqueta: "Nombre" },
    { campo: "cedula", etiqueta: "Cédula" },
    { campo: "telefono", etiqueta: "Teléfono" },
    { campo: "ciudad", etiqueta: "Ciudad" },
    { campo: "fecha_nacimiento", etiqueta: "Fecha de nacimiento" },
  ],
  carta_laboral: [
    { campo: "empresa", etiqueta: "Empresa" },
    { campo: "nombre", etiqueta: "A nombre de" },
    { campo: "cargo", etiqueta: "Cargo" },
    { campo: "desde", etiqueta: "Desde" },
    { campo: "hasta", etiqueta: "Hasta" },
    { campo: "telefono_empresa", etiqueta: "Teléfono de la empresa" },
    { campo: "firmante", etiqueta: "Quién firma" },
  ],
  otro: [],
};

/** Campos que se calculan o que son listas (no los dice el modelo tal cual). */
export const ETIQUETA_CAMPO_EXTRA: Record<string, string> = {
  experiencias: "Experiencia laboral",
  referencias: "Referencias",
  experiencia_conduccion_meses: "Meses de experiencia en conducción",
  edad: "Edad",
  cedula_coincide: "¿La cédula coincide con la del proceso?",
};

export function etiquetaCampo(clase: ClaseDocumento, campo: string): string {
  return CAMPOS_POR_CLASE[clase].find((c) => c.campo === campo)?.etiqueta ?? ETIQUETA_CAMPO_EXTRA[campo] ?? campo;
}

// ── Respuesta del modelo ─────────────────────────────────────────────────────

const texto = z.union([z.string(), z.number()]).nullish().transform((v) => (v == null ? null : String(v).trim() || null));
const confianza = z
  .string()
  .nullish()
  .transform((v): Confianza => (v === "alta" || v === "media" || v === "baja" ? v : "baja"));

export const esquemaExperiencia = z.object({
  empresa: texto,
  cargo: texto,
  /** AAAA-MM; null si no lo dice. */
  desde: texto,
  /** AAAA-MM, «actual» o null. */
  hasta: texto,
  vehiculo: texto,
  conduccion: z.boolean().nullish().transform((v) => v === true),
});
export type ExperienciaLeida = z.infer<typeof esquemaExperiencia>;

export const esquemaReferencia = z.object({
  nombre: texto,
  telefono: texto,
  tipo: z
    .string()
    .nullish()
    .transform((v): "laboral" | "personal" => (v === "laboral" ? "laboral" : "personal")),
  empresa: texto,
});
export type ReferenciaLeida = z.infer<typeof esquemaReferencia>;

export const esquemaDocumento = z.object({
  archivos: z.array(z.number().int()).default([]),
  clase: z
    .string()
    .transform((v): ClaseDocumento => ((CLASES as readonly string[]).includes(v) ? (v as ClaseDocumento) : "otro")),
  legible: z.boolean().default(true),
  motivo: texto,
  resumen: texto,
  campos: z
    .array(
      z.object({
        campo: z.string(),
        valor: texto,
        confianza,
        evidencia: texto,
        pagina: z.number().int().nullish().transform((v) => v ?? null),
      })
    )
    .default([]),
  experiencias: z.array(esquemaExperiencia).default([]),
  referencias: z.array(esquemaReferencia).default([]),
});
export type DocumentoModelo = z.infer<typeof esquemaDocumento>;

export const esquemaRespuesta = z.object({ documentos: z.array(esquemaDocumento).default([]) });

// ── Lo que se guarda ─────────────────────────────────────────────────────────

export type DecisionCampo = "aceptado" | "corregido" | "rechazado";

/** Un campo leído (seleccion_lecturas.campos). */
export interface CampoLeido {
  campo: string;
  /** Texto, número o, para las listas, el arreglo leído. */
  valor: unknown;
  confianza: Confianza;
  evidencia: string | null;
  pagina: number | null;
  /** Lo calculó Gestivo a partir de lo leído (meses de experiencia, edad…). */
  calculado?: boolean;
  /** Advertencia para quien revisa: «2 periodos sin fecha», «no coincide con la digitada». */
  nota?: string | null;
  decision: DecisionCampo | null;
  valor_final: unknown;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export const SISTEMA_LECTURA = `Lees documentos que envía por WhatsApp un aspirante a conductor de bus en Colombia: fotos o PDF de su cédula, su licencia de conducción, su hoja de vida o una carta laboral; a veces el texto sacado de un documento de Word, con las imágenes que traía pegadas. Respondes solo con JSON válido, sin texto antes ni después.

Reglas:
- Copia lo que ves; no inventes ni completes datos. Si un campo no se ve, no lo incluyas.
- Confianza: «alta» si se lee claro; «media» si hay que interpretar (letra a mano, foto torcida); «baja» si es una suposición.
- En «evidencia» copia el texto exacto que viste para ese campo (máximo 80 caracteres).
- Fechas en AAAA-MM-DD; en la experiencia laboral, AAAA-MM (o «actual»). Si solo hay año, usa AAAA-01 y confianza media.
- Varios archivos pueden ser un solo documento: las fotos de las páginas de una hoja de vida (muchas veces fotos con el celular, una por página, a veces en desorden o con una página repetida) o el frente y el reverso de la cédula. Júntalos en un documento con todos sus números de archivo y lee la experiencia y las referencias de todas las páginas, sin repetir lo que salga dos veces.
- Si un archivo de Word trae imágenes pegadas (una foto de la cédula, de la licencia o de un certificado), son parte de ese mismo documento: úsalas para completar sus campos (por ejemplo, la cédula o la fecha de nacimiento de la hoja de vida).
- Si un archivo no se puede leer (borroso, cortado, oscuro), ponlo con «legible»: false y el motivo.`;

export function instruccionLectura(nArchivos: number): string {
  return `Hay ${nArchivos} ${nArchivos === 1 ? "archivo" : "archivos"} (numerados desde 1). Clasifica cada uno y extrae los datos. Responde con este JSON:
{"documentos":[{"archivos":[1],"clase":"cedula|licencia|hoja_vida|carta_laboral|otro","legible":true,"motivo":null,"resumen":"una frase con lo principal","campos":[{"campo":"...","valor":"...","confianza":"alta|media|baja","evidencia":"...","pagina":1}],"experiencias":[],"referencias":[]}]}

Campos por clase:
- cedula: numero (solo dígitos), nombres, apellidos, fecha_nacimiento, fecha_expedicion, lugar_expedicion.
- licencia: numero, nombre, categorias (texto: cada categoría con su vencimiento, p. ej. «C2 vence 2029-03-14; B1 vence 2029-03-14»), restricciones (p. ej. «usar lentes»; vacío si no tiene).
- hoja_vida: nombre, cedula, telefono, ciudad, fecha_nacimiento. Además «experiencias»: [{"empresa","cargo","desde":"AAAA-MM","hasta":"AAAA-MM|actual","vehiculo","conduccion":true si manejó vehículos}] y «referencias»: [{"nombre","telefono","tipo":"laboral|personal","empresa"}].
- carta_laboral: empresa, nombre (del trabajador), cargo, desde, hasta, telefono_empresa, firmante. Si la carta da un teléfono de contacto, ponlo también en «referencias» como laboral.
- otro: solo el resumen.`;
}
