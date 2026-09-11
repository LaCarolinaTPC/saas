/**
 * Etiquetas, colores y formatos del módulo de Recuperación de incapacidades.
 * Puro: sirve en cliente y servidor.
 */

/** Borrador mínimo de estados mientras la decisión 12.13 siga abierta. */
export const ESTADOS_EXPEDIENTE = [
  { key: "recibido", label: "Recibido", color: "#64748B" },
  { key: "en_completar", label: "En completar", color: "#2563EB" },
  { key: "liquidado", label: "Liquidado", color: "#7C3AED" },
  { key: "radicado", label: "Radicado", color: "#0891B2" },
  { key: "con_recaudo", label: "Con recaudo", color: "#D97706" },
  { key: "conciliado", label: "Conciliado", color: "#059669" },
  { key: "cerrado", label: "Cerrado", color: "#111827" },
  { key: "excepcion", label: "Excepción", color: "#DC2626" },
] as const;

export type EstadoExpediente = (typeof ESTADOS_EXPEDIENTE)[number]["key"];

export function etiquetaEstado(k: string | null | undefined): string {
  return ESTADOS_EXPEDIENTE.find((e) => e.key === k)?.label ?? (k ?? "—");
}

export function colorEstado(k: string | null | undefined): string {
  return ESTADOS_EXPEDIENTE.find((e) => e.key === k)?.color ?? "#64748B";
}

/**
 * De dónde sale cada dato del expediente (plan, pantalla 1). El color acompaña
 * a la columna para que nadie tome un dato recibido por uno confirmado.
 */
export const PROCEDENCIA = {
  recibido: { label: "Recibido de la matriz EPS", color: "#64748B" },
  homologado: { label: "Homologado con el catálogo", color: "#0F766E" },
  calculado: { label: "Calculado por el motor", color: "#6D28D9" },
  completado: { label: "Completado por RRHH", color: "#047857" },
} as const;

export const RECIBIDO_DESDE_LABEL: Record<string, string> = {
  matriz_formulario: "Formulario de la matriz",
  matriz_excel: "Carga Excel de la matriz",
  alta_manual: "Alta manual (anterior al corte)",
};

export const PERSONA_FUENTE_LABEL: Record<string, string> = {
  conductores: "Maestro de conductores",
  employees: "Empleados",
  sin_resolver: "Sin resolver",
};

export const CLASES_ENTIDAD = ["EPS", "ARL", "OTRA"] as const;

/** Pesos colombianos sin decimales; los importes del motor se redondean solo al mostrar. */
export function cop(n: number | string | null | undefined): string {
  if (n == null || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  return `$ ${Math.round(v).toLocaleString("es-CO")}`;
}

/** AAAA-MM-DD → DD/MM/AAAA. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = iso.slice(0, 10);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota",
  });
}

export function plural(n: number, uno: string, varios: string): string {
  return `${n.toLocaleString("es-CO")} ${n === 1 ? uno : varios}`;
}
