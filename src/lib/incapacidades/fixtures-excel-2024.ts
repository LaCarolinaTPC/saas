/**
 * Fixtures sintéticos para las pruebas del motor: una fila por cada una de las
 * 79 filas completas del libro (anexo A de la especificación).
 *
 * La especificación conserva las FÓRMULAS de esas filas, no sus valores, y el
 * plan prohíbe que ningún dato del libro entre a GESTIVO. Por eso los valores
 * de aquí se generan de forma determinista para cubrir todas las ramas de las
 * 14 fórmulas; no son personas ni incapacidades reales.
 */

/** Filas elegibles de la hoja `2024`, tal como las lista el anexo A. 79 en total. */
export const FILAS_ANEXO_A: readonly number[] = [
  27, 28, 30, 34, 35, 37, 38, 39, 40, 41, 43, 45, 46, 47, 48, 50, 51, 55, 57, 58, 59, 60, 63, 68, 69, 70, 71,
  72, 73, 74, 76, 78, 79, 80, 83, 85, 86, 87, 89, 90, 96, 105, 109, 113, 115, 117, 120, 124, 126, 127, 128,
  129, 130, 131, 132, 138, 142, 143, 144, 148, 155, 161, 164, 169, 174, 176, 181, 223, 229, 231, 237, 252,
  253, 259, 345, 448, 453, 458, 463,
];

/** Columnas con fórmula exigidas en cada fila: 13 × 79 = 1.027. */
export const COLUMNAS_FORMULA = ["C", "I", "M", "N", "O", "P", "Q", "S", "T", "U", "V", "W", "Y"] as const;

/** La única fila cuya Q lleva ROUND(…, 0). */
export const FILA_ROUND0 = 70;

/** Catálogo exacto de entidades del libro (anexo E). */
export const ENTIDADES_EXCEL = [
  "ARL EQUIDAD SEGUROS", "CAJACOPI EPS", "COOMEVA EPS", "COOSALUD", "EPS SANITAS", "FAMISANAR EPS",
  "MEDIMÁS EPS", "MUTUAL SER", "NUEVA EPS", "SALUD TOTAL EPS", "SURA EPS", "AXA COLPATRIA",
  "SEGUROS BOLIVAR", "ARL SURA", "ADRES",
] as const;

/**
 * Cómo se fija X (valor pagado) en relación con T (valor cobrado), que solo se
 * conoce después de evaluar la fila. Cubre los tres resultados de Y y el
 * umbral de S (X > 1).
 */
export type ModoPago =
  | { tipo: "fijo"; valor: number | string | null }
  | { tipo: "igual_a_T" }
  | { tipo: "T_menos"; delta: number }
  | { tipo: "T_mas"; delta: number };

export interface FilaSintetica {
  fila: number;
  /** (B) cédula sintética; 0 en algunas filas para la rama vacía de S. */
  cedula: number;
  /** (F) salario básico. */
  salario: number;
  /** (G) inicio ISO o null (I = 0). */
  inicio: string | null;
  /** (H) fin ISO. */
  fin: string | null;
  /** (J) entidad literal del anexo E. */
  entidad: string;
  /** (K) tipo: EG, EP, AT, LM, LP o vacío. */
  tipo: string;
  /** (L) INICIAL, PRORROGA o vacío. */
  modalidad: string;
  /** (R) SI, NO, vacío… incluye minúsculas para probar la comparación de Excel. */
  cobrada: string;
  /** (X) cómo fijar el valor pagado. */
  pago: ModoPago;
}

const SALARIOS = [1_300_000, 1_423_500, 2_000_000, 1_750_333, 3_250_000, 987_654, 1_160_000];
const DIAS = [1, 2, 3, 5, 7, 10, 15, 30, 45, 90, 180, 2, 1, 3];
const TIPOS = ["EG", "EG", "AT", "EP", "LM", "LP", "", "EG", "AT", "eg"];
const MODALIDADES = ["INICIAL", "INICIAL", "PRORROGA", "INICIAL", "", "INICIAL", "inicial"];
const COBRADAS = ["SI", "NO", "", "SI", "si", "NO", "SI"];
const PAGOS: ModoPago[] = [
  { tipo: "igual_a_T" },
  { tipo: "fijo", valor: 0 },
  { tipo: "T_menos", delta: 0.01 },
  { tipo: "fijo", valor: 1 },
  { tipo: "T_mas", delta: 500 },
  { tipo: "fijo", valor: 1.01 },
  { tipo: "igual_a_T" },
  { tipo: "fijo", valor: null },
  { tipo: "fijo", valor: 100 },
  { tipo: "T_menos", delta: 1 },
  { tipo: "T_mas", delta: 0.005 },
];

function isoMasDias(base: string, dias: number): string {
  return new Date(Date.parse(`${base}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Las 79 filas sintéticas, siempre en el mismo orden y con los mismos valores. */
export function filasSinteticas(): FilaSintetica[] {
  return FILAS_ANEXO_A.map((fila, i) => {
    // Cada 11 filas una sin fecha de inicio (I = 0); las cédulas 0 caen en otras.
    const sinInicio = i % 11 === 10;
    const dias = DIAS[i % DIAS.length];
    const inicio = sinInicio ? null : isoMasDias("2024-01-01", i * 3);
    // ARL SURA aparece con frecuencia porque es la única entidad con regla propia en el libro.
    const entidad = i % 4 === 1 ? "ARL SURA" : ENTIDADES_EXCEL[i % ENTIDADES_EXCEL.length];
    return {
      fila,
      cedula: i % 13 === 7 ? 0 : 10_000_000 + i * 7_919,
      // La fila 70 lleva un salario que deja Q con decimales, para que el ROUND se note.
      salario: fila === FILA_ROUND0 ? 1_234_567 : SALARIOS[i % SALARIOS.length],
      inicio,
      fin: sinInicio ? isoMasDias("2024-01-01", i * 3 + dias - 1) : isoMasDias(inicio!, dias - 1),
      entidad,
      tipo: TIPOS[i % TIPOS.length],
      modalidad: MODALIDADES[i % MODALIDADES.length],
      cobrada: COBRADAS[i % COBRADAS.length],
      pago: PAGOS[i % PAGOS.length],
    };
  });
}
