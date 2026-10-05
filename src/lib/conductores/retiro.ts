/**
 * Conductores · causa de retiro — parte pura, usable en cliente.
 *
 * RRHH registra por qué se retiró cada conductor: una causa de este catálogo
 * y una nota libre. Se guarda en `conductores_retiro` (migración
 * 20261005214330), una fila por cédula y fecha de retiro. La clave es lo que
 * queda en la base: no cambie una clave existente, agregue otra.
 */

export type TipoRetiro = "voluntario" | "empresa" | "otro";

export const TIPO_RETIRO_LABEL: Record<TipoRetiro, string> = {
  voluntario: "Decisión del conductor",
  empresa: "Decisión de la empresa",
  otro: "Otras causas",
};

export interface CausaRetiro {
  clave: string;
  label: string;
  tipo: TipoRetiro;
}

export const CAUSAS_RETIRO: CausaRetiro[] = [
  { clave: "RENUNCIA_VOLUNTARIA", label: "Renuncia voluntaria", tipo: "voluntario" },
  { clave: "MEJOR_OFERTA", label: "Mejor oferta laboral", tipo: "voluntario" },
  { clave: "MOTIVOS_PERSONALES", label: "Motivos personales o familiares", tipo: "voluntario" },
  { clave: "INCONFORMIDAD", label: "Inconformidad con condiciones (pago, turnos, vehículo)", tipo: "voluntario" },
  { clave: "ABANDONO_CARGO", label: "Abandono del cargo", tipo: "voluntario" },
  { clave: "JUSTA_CAUSA", label: "Terminación con justa causa (disciplinaria)", tipo: "empresa" },
  { clave: "SIN_JUSTA_CAUSA", label: "Terminación sin justa causa", tipo: "empresa" },
  { clave: "BAJO_RENDIMIENTO", label: "Bajo rendimiento o producción", tipo: "empresa" },
  { clave: "ACCIDENTALIDAD", label: "Accidentalidad o infracciones de tránsito", tipo: "empresa" },
  { clave: "PERIODO_PRUEBA", label: "No superó el período de prueba", tipo: "empresa" },
  { clave: "FIN_CONTRATO", label: "Terminación del contrato", tipo: "empresa" },
  { clave: "SALUD", label: "Salud o incapacidad", tipo: "otro" },
  { clave: "PENSION", label: "Pensión", tipo: "otro" },
  { clave: "FALLECIMIENTO", label: "Fallecimiento", tipo: "otro" },
  { clave: "OTRA", label: "Otra (explicar en la nota)", tipo: "otro" },
];

const POR_CLAVE = new Map(CAUSAS_RETIRO.map((c) => [c.clave, c]));

export function causaRetiro(clave: string | null | undefined): CausaRetiro | null {
  return clave ? (POR_CLAVE.get(clave) ?? null) : null;
}

/** Etiqueta de la causa; una clave desconocida se muestra tal cual. */
export function causaLabel(clave: string | null | undefined): string {
  if (!clave) return "Sin registrar";
  return POR_CLAVE.get(clave)?.label ?? clave;
}

export const NOTA_MAX = 2000;

export interface RetiroRegistrado {
  cedula: string;
  fechaRetiro: string | null;
  causa: string;
  nota: string | null;
  registradoPor: string | null;
  registradoAt: string;
  actualizadoPor: string | null;
  actualizadoAt: string;
}

/** Valida lo que se va a guardar; devuelve el mensaje de error o null. */
export function validarRetiro(causa: string, nota: string): string | null {
  if (!POR_CLAVE.has(causa)) return "Elija una causa de retiro de la lista.";
  const n = nota.trim();
  if (causa === "OTRA" && n.length < 5) return "Con la causa «Otra» explique el motivo en la nota (mínimo 5 caracteres).";
  if (n.length > NOTA_MAX) return `La nota no puede pasar de ${NOTA_MAX} caracteres.`;
  return null;
}

/**
 * De los registros de un conductor, el que corresponde a su retiro vigente:
 * el de su fecha_retiro actual; si no hay, el más reciente.
 */
export function retiroVigente(registros: RetiroRegistrado[], fechaRetiro: string | null): RetiroRegistrado | null {
  if (!registros.length) return null;
  const exacto = registros.find((r) => r.fechaRetiro === fechaRetiro);
  if (exacto) return exacto;
  return [...registros].sort((a, b) => b.actualizadoAt.localeCompare(a.actualizadoAt))[0];
}
