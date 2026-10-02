// Reglas puras de la revisión preoperacional: validación de lo que manda el
// formulario, resultado (apto / con observación / no apto) y tablero del día.
// Sin base de datos ni React: las usan la Server Action, la pantalla y las
// pruebas, para que el semáforo que ve el inspector sea el mismo que se guarda.
import type { NivelVencimiento } from "./constants";
import { PUNTO_POR_KEY, PUNTOS_PREOP } from "./preoperacional-lista";

export type ResultadoPreop = "apto" | "apto_obs" | "no_apto";
export const RESULTADOS_PREOP: ResultadoPreop[] = ["apto", "apto_obs", "no_apto"];
export type EstadoDia = ResultadoPreop | "pendiente";

export const RESULTADO_LABEL: Record<EstadoDia, string> = {
  apto: "Apto",
  apto_obs: "Apto con observación",
  no_apto: "No apto",
  pendiente: "Pendiente",
};

export const RESULTADO_COLOR: Record<EstadoDia, { fuerte: string; suave: string; texto: string }> = {
  apto: { fuerte: "#059669", suave: "#D1FAE5", texto: "#065F46" },
  apto_obs: { fuerte: "#D97706", suave: "#FEF3C7", texto: "#92400E" },
  no_apto: { fuerte: "#DC2626", suave: "#FEE2E2", texto: "#991B1B" },
  pendiente: { fuerte: "#94A3B8", suave: "#F1F5F9", texto: "#475569" },
};

export const MAX_NOTA_FALLA = 300;
export const MAX_OBSERVACIONES = 1000;

/** Lo que manda el formulario por cada punto marcado como falla. */
export interface FallaEntrada {
  key: string;
  nota?: string | null;
  /** Concepto de Mantenimiento elegido, cuando el punto tiene varios. */
  concepto?: string | null;
}

export interface FallaValidada {
  key: string;
  critico: boolean;
  nota: string | null;
  /** null si el punto no va a Mantenimiento. */
  concepto: string | null;
}

/**
 * Valida y normaliza las fallas: rechaza puntos que no están en la lista,
 * recorta notas y deja un concepto válido para el punto (el primero si no se
 * eligió o si llegó uno que no le corresponde). Un punto repetido cuenta una vez.
 */
export function validarFallas(entrada: FallaEntrada[]): FallaValidada[] {
  if (!Array.isArray(entrada)) throw new Error("Las fallas no tienen el formato esperado.");
  const vistas = new Set<string>();
  const salida: FallaValidada[] = [];
  for (const f of entrada) {
    const punto = PUNTO_POR_KEY.get(String(f?.key ?? ""));
    if (!punto) throw new Error(`El punto «${String(f?.key ?? "")}» no está en la lista de chequeo.`);
    if (vistas.has(punto.key)) continue;
    vistas.add(punto.key);
    const nota = (f.nota ?? "").trim();
    if (nota.length > MAX_NOTA_FALLA) {
      throw new Error(`La nota de «${punto.nombre}» no puede pasar de ${MAX_NOTA_FALLA} caracteres.`);
    }
    const concepto = punto.conceptos.length === 0
      ? null
      : punto.conceptos.includes(f.concepto ?? "") ? (f.concepto as string) : punto.conceptos[0];
    salida.push({ key: punto.key, critico: punto.critico, nota: nota || null, concepto });
  }
  // En el orden de la lista, para que pantalla, Excel y base coincidan.
  const orden = new Map(PUNTOS_PREOP.map((p, i) => [p.key, i]));
  return salida.sort((a, b) => (orden.get(a.key) ?? 0) - (orden.get(b.key) ?? 0));
}

/** Vigencia de un documento al momento de la revisión (foto que se guarda). */
export interface DocumentoPreop {
  tipo: string;
  nombre: string;
  nivel: NivelVencimiento;
  fecha: string | null;
  dias: number | null;
}

/**
 * Solo un documento vencido detiene el bus. «Crítico» y «próximo» son avisos
 * de que se acerca el vencimiento, y «sin dato» tampoco bloquea: la póliza RCE
 * llega vacía de GEMA en casi toda la flota y bloquearla pararía la operación.
 */
export function documentosVencidos(docs: DocumentoPreop[]): DocumentoPreop[] {
  return docs.filter((d) => d.nivel === "vencido");
}

export function documentosSinDato(docs: DocumentoPreop[]): DocumentoPreop[] {
  return docs.filter((d) => d.nivel === "sin_dato");
}

export interface ResultadoCalculado {
  resultado: ResultadoPreop;
  fallas: number;
  fallasCriticas: number;
  documentosVencidos: number;
}

export function calcularResultado(fallas: { critico: boolean }[], docs: DocumentoPreop[]): ResultadoCalculado {
  const criticas = fallas.filter((f) => f.critico).length;
  const vencidos = documentosVencidos(docs).length;
  const resultado: ResultadoPreop = criticas > 0 || vencidos > 0 ? "no_apto" : fallas.length > 0 ? "apto_obs" : "apto";
  return { resultado, fallas: fallas.length, fallasCriticas: criticas, documentosVencidos: vencidos };
}

/** Texto del botón de guardar según el resultado que va a quedar. */
export function textoGuardar(resultado: ResultadoPreop): string {
  return resultado === "apto" ? "Guardar · APTO" : resultado === "apto_obs" ? "Guardar · CON OBSERVACIÓN" : "Guardar · NO APTO";
}

/** Revisión ya guardada, lo mínimo para el tablero del día. */
export interface RevisionDia {
  id: string;
  codigo_vehiculo: string;
  resultado: ResultadoPreop;
  created_at: string;
}

/**
 * Última revisión de cada vehículo en el día: si un bus salió no apto, lo
 * repararon y se revisó otra vez, rige la más reciente.
 */
export function ultimaPorVehiculo<T extends RevisionDia>(revisiones: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of revisiones) {
    const previa = m.get(r.codigo_vehiculo);
    if (!previa || r.created_at > previa.created_at) m.set(r.codigo_vehiculo, r);
  }
  return m;
}

export function conteoDia(codigos: string[], ultimas: Map<string, { resultado: ResultadoPreop }>): Record<EstadoDia, number> {
  const c: Record<EstadoDia, number> = { apto: 0, apto_obs: 0, no_apto: 0, pendiente: 0 };
  for (const codigo of codigos) c[ultimas.get(codigo)?.resultado ?? "pendiente"]++;
  return c;
}

/** Orden del tablero: primero lo que falta revisar y lo que no puede salir. */
export const ORDEN_ESTADO: Record<EstadoDia, number> = { pendiente: 0, no_apto: 1, apto_obs: 2, apto: 3 };

/** Compara códigos de vehículo como números cuando lo son («99» antes que «501»). */
export function compararCodigo(a: string, b: string): number {
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}
