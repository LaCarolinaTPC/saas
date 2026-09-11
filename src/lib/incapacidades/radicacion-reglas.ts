/**
 * Reglas puras de la radicación (fase 4 del plan): qué exige radicar, cómo se
 * valida el código y cómo se clasifica la bandeja de cobro. Sin acceso a
 * datos; se prueba con node:test.
 */
import type { ExpedienteVista } from "./expedientes";

export type EstadoRadicacion = "solicitada" | "radicada" | "devuelta" | "anulada";

export const ESTADOS_RADICACION: { key: EstadoRadicacion; label: string; color: string }[] = [
  { key: "solicitada", label: "Solicitada", color: "#2563EB" },
  { key: "radicada", label: "Radicada", color: "#0891B2" },
  { key: "devuelta", label: "Devuelta", color: "#D97706" },
  { key: "anulada", label: "Anulada", color: "#64748B" },
];

export function etiquetaRadicacion(k: string | null | undefined): string {
  return ESTADOS_RADICACION.find((e) => e.key === k)?.label ?? (k ?? "—");
}
export function colorRadicacion(k: string | null | undefined): string {
  return ESTADOS_RADICACION.find((e) => e.key === k)?.color ?? "#64748B";
}

export const EXCEPCION_MIN = 10;

export type DatosRadicar = Pick<
  ExpedienteVista,
  | "estado" | "valor_reclamado" | "liquidacion_id" | "entidad_catalogo_id" | "entidad_nombre" | "cobrable"
  | "entidad_dias_min_cobro" | "dias_incapacidad" | "radicacion_id" | "radicacion_estado" | "matriz_eliminada_at"
>;

export interface Impedimento {
  campo: "estado" | "liquidacion" | "entidad" | "radicacion_activa" | "matriz";
  mensaje: string;
}

/**
 * Qué impide radicar (plan, 7.3): liquidación vigente con valor, entidad
 * homologada, sin otra radicación activa, expediente vivo. Lo que devuelve
 * vacío se puede radicar; si además `bajoUmbral`, hace falta la excepción.
 */
export function impedimentosParaRadicar(v: DatosRadicar): Impedimento[] {
  const out: Impedimento[] = [];
  if (v.matriz_eliminada_at) out.push({ campo: "matriz", mensaje: "La incapacidad está eliminada en la matriz EPS." });
  if (!["liquidado", "radicado"].includes(v.estado)) out.push({ campo: "estado", mensaje: `El expediente está en estado «${v.estado}»; hay que liquidar antes de radicar.` });
  if (!v.liquidacion_id || v.valor_reclamado == null) out.push({ campo: "liquidacion", mensaje: "No hay liquidación vigente ni valor reclamado." });
  if (!v.entidad_catalogo_id) out.push({ campo: "entidad", mensaje: "La entidad pagadora no está homologada." });
  if (v.radicacion_id && (v.radicacion_estado === "solicitada" || v.radicacion_estado === "radicada")) {
    out.push({ campo: "radicacion_activa", mensaje: `Ya hay una radicación ${v.radicacion_estado}; devuélvela o anúlala antes de crear otra.` });
  }
  return out;
}

/** Bajo el umbral de días de su entidad: se puede radicar solo con excepción escrita (12.17). */
export function bajoUmbral(v: Pick<DatosRadicar, "cobrable">): boolean {
  return !v.cobrable;
}

export function excepcionValida(m: string | null | undefined): m is string {
  return typeof m === "string" && m.replace(/\s+/g, " ").trim().length >= EXCEPCION_MIN;
}

/** Código de radicación: lo que devuelve la entidad. Letras, dígitos y separadores comunes, 3 a 40 caracteres. */
export function normalizarCodigo(c: string | null | undefined): string | null {
  const s = (c ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  if (s === "") return null;
  if (!/^[A-Z0-9][A-Z0-9 .\-_/]{1,38}[A-Z0-9]$/.test(s)) {
    throw new Error("El código de radicación debe tener entre 3 y 40 caracteres: letras, dígitos, punto, guion o barra.");
  }
  return s;
}

// ── Bandeja de cobro ─────────────────────────────────────────────────────────

export type PestanaCobro = "por_radicar" | "solicitadas" | "radicadas" | "devueltas" | "incidencias" | "no_cobrables";

export const PESTANAS_COBRO: { key: PestanaCobro; label: string; descripcion: string }[] = [
  { key: "por_radicar", label: "Por radicar", descripcion: "Liquidadas, cobrables y sin radicación activa" },
  { key: "solicitadas", label: "Solicitadas", descripcion: "Pedidas a la entidad, sin código todavía" },
  { key: "radicadas", label: "Radicadas", descripcion: "Con código de la entidad: cobradas" },
  { key: "devueltas", label: "Devueltas", descripcion: "La entidad las rechazó; se pueden radicar de nuevo" },
  { key: "incidencias", label: "Con incidencias", descripcion: "Sin liquidar, sin homologar, sin persona o con cambios en la matriz" },
  { key: "no_cobrables", label: "No cobrables por umbral", descripcion: "Por debajo de los días mínimos de su entidad y sin radicación" },
];

export type FilaCobro = Pick<
  ExpedienteVista,
  | "id" | "estado" | "cobrable" | "liquidacion_id" | "valor_reclamado" | "radicacion_id" | "radicacion_estado"
  | "pendiente_homologacion" | "persona_fuente" | "matriz_cambio_pendiente" | "matriz_eliminada_at" | "devoluciones"
  | "entidad_catalogo_id" | "entidad_nombre" | "entidad_clase" | "pagador_recibido" | "dias_incapacidad" | "dias_entidad"
>;

/** A qué pestaña pertenece cada expediente. Una sola, en este orden de prioridad. */
export function pestanaDe(f: FilaCobro): PestanaCobro {
  if (f.radicacion_estado === "radicada") return "radicadas";
  if (f.radicacion_estado === "solicitada") return "solicitadas";
  if (f.matriz_eliminada_at || f.pendiente_homologacion || f.persona_fuente === "sin_resolver" || f.matriz_cambio_pendiente || f.estado === "excepcion") {
    return "incidencias";
  }
  if ((f.devoluciones ?? 0) > 0 && !f.radicacion_id) return "devueltas";
  if (!f.cobrable) return "no_cobrables";
  if (f.liquidacion_id && f.valor_reclamado != null && ["liquidado", "radicado"].includes(f.estado)) return "por_radicar";
  return "incidencias";
}

export interface GrupoEntidad<T extends FilaCobro> {
  entidadId: string | null;
  entidad: string;
  clase: string | null;
  filas: T[];
  incapacidades: number;
  dias: number;
  diasEntidad: number;
  valorReclamado: number;
}

/** Agrupa por entidad homologada (o por el pagador recibido si no lo está), de mayor a menor valor. */
export function agruparPorEntidad<T extends FilaCobro>(filas: T[]): GrupoEntidad<T>[] {
  const m = new Map<string, GrupoEntidad<T>>();
  for (const f of filas) {
    const key = f.entidad_catalogo_id ?? `recibido:${f.pagador_recibido ?? "sin pagador"}`;
    let g = m.get(key);
    if (!g) {
      g = { entidadId: f.entidad_catalogo_id, entidad: f.entidad_nombre ?? f.pagador_recibido ?? "Sin pagador", clase: f.entidad_clase, filas: [], incapacidades: 0, dias: 0, diasEntidad: 0, valorReclamado: 0 };
      m.set(key, g);
    }
    g.filas.push(f);
    g.incapacidades++;
    g.dias += f.dias_incapacidad ?? 0;
    g.diasEntidad += f.dias_entidad ?? 0;
    g.valorReclamado += Number(f.valor_reclamado ?? 0);
  }
  return [...m.values()].sort((a, b) => b.valorReclamado - a.valorReclamado || a.entidad.localeCompare(b.entidad, "es"));
}

export function contarPestanas(filas: FilaCobro[]): Record<PestanaCobro, number> {
  const c: Record<PestanaCobro, number> = { por_radicar: 0, solicitadas: 0, radicadas: 0, devueltas: 0, incidencias: 0, no_cobrables: 0 };
  for (const f of filas) c[pestanaDe(f)]++;
  return c;
}
