/**
 * Reglas puras de recaudos, ajustes y saldo (fase 5 del plan). Sin acceso a
 * datos; se prueban con node:test.
 *
 * Vocabulario (plan, sección 16): «pago» es un recaudo recibido de la entidad
 * y aplicado a una incapacidad. El saldo operativo es
 *   valor reclamado − abonos aplicados − ajustes que extinguen saldo
 * Base exigible POR CONFIRMAR (12.5): mientras tanto la base es el valor
 * reclamado y la pantalla muestra siempre los tres componentes.
 */

export interface ComponentesSaldo {
  /** Base exigible: el valor reclamado del expediente (12.5 por confirmar). */
  valorReclamado: number | null;
  /** Σ aplicaciones de recaudos no anuladas. */
  abonos: number;
  /** Σ ajustes que extinguen saldo, no anulados. Positivo reduce lo exigible. */
  ajustes: number;
}

export type EstadoConciliacion = "sin_base" | "sin_recaudo" | "parcial" | "completo" | "sobrepago" | "diferencia";

export const ESTADOS_CONCILIACION: Record<EstadoConciliacion, { label: string; color: string; legado: string }> = {
  sin_base: { label: "Sin valor reclamado", color: "#64748B", legado: "—" },
  sin_recaudo: { label: "Sin recaudo", color: "#64748B", legado: "NO PAGADO" },
  parcial: { label: "Abono parcial", color: "#D97706", legado: "NO PAGADO" },
  completo: { label: "Conciliado", color: "#059669", legado: "LO DEBIDO" },
  sobrepago: { label: "Sobrepago", color: "#7C3AED", legado: "A FAVOR" },
  diferencia: { label: "Diferencia por ajustes", color: "#B45309", legado: "NO PAGADO" },
};

export interface Saldo {
  saldo: number;
  estado: EstadoConciliacion;
  /** Dentro de la tolerancia aprobada: se puede cerrar sin excepción. */
  dentroTolerancia: boolean;
}

/** A dos decimales, para comparar dinero sin ruido de coma flotante. */
export const dinero = (x: number): number => Math.round(x * 100) / 100;

/**
 * Saldo operativo y su lectura. La tolerancia (12.6 por confirmar) es un
 * parámetro; cero significa exacto, como el indicador Y del libro.
 */
export function calcularSaldo(c: ComponentesSaldo, tolerancia = 0): Saldo {
  if (c.valorReclamado == null) return { saldo: 0, estado: "sin_base", dentroTolerancia: false };
  if (!Number.isFinite(tolerancia) || tolerancia < 0) throw new Error("La tolerancia debe ser un número mayor o igual a cero.");
  const saldo = dinero(c.valorReclamado - c.abonos - c.ajustes);
  const dentro = Math.abs(saldo) <= tolerancia;
  let estado: EstadoConciliacion;
  if (dentro) estado = "completo";
  else if (saldo < 0) estado = "sobrepago";
  else if (c.abonos > 0) estado = "parcial";
  else if (c.ajustes !== 0) estado = "diferencia";
  else estado = "sin_recaudo";
  return { saldo, estado, dentroTolerancia: dentro };
}

/** Estado del expediente que corresponde al saldo (borrador de 12.13). */
export function estadoExpedienteSegunSaldo(
  actual: string,
  s: Saldo,
  c: ComponentesSaldo
): "radicado" | "con_recaudo" | "conciliado" | null {
  if (!["radicado", "con_recaudo", "conciliado"].includes(actual)) return null;
  if (s.estado === "sin_base") return null;
  if (s.dentroTolerancia && (c.abonos > 0 || c.ajustes !== 0)) return "conciliado";
  if (c.abonos > 0 || c.ajustes !== 0) return "con_recaudo";
  return "radicado";
}

// ── Recaudos y aplicaciones ──────────────────────────────────────────────────

export const MEDIOS_RECAUDO = [
  { key: "transferencia", label: "Transferencia" },
  { key: "consignacion", label: "Consignación" },
  { key: "cruce", label: "Cruce de cuentas" },
  { key: "cheque", label: "Cheque" },
  { key: "otro", label: "Otro" },
] as const;

export type MedioRecaudo = (typeof MEDIOS_RECAUDO)[number]["key"];

export function esMedio(v: string | null | undefined): v is MedioRecaudo {
  return MEDIOS_RECAUDO.some((m) => m.key === v);
}

export interface RecaudoParaAplicar {
  valor: number;
  aplicado: number;
  anulado: boolean;
  entidad_catalogo_id: string;
}

export interface ExpedienteParaAplicar {
  estado: string;
  entidad_catalogo_id: string | null;
  radicacion_estado: string | null;
  valor_reclamado: number | null;
  saldo: number;
}

/**
 * Cuánto de un recaudo se puede aplicar a un expediente. La aplicación nunca
 * supera lo que le queda al recaudo; el sobrepago de un expediente se
 * permite (queda visible), no se bloquea.
 */
export function validarAplicacion(r: RecaudoParaAplicar, e: ExpedienteParaAplicar, valor: number): void {
  if (r.anulado) throw new Error("El recaudo está anulado.");
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("El valor a aplicar debe ser mayor que cero.");
  const disponible = dinero(r.valor - r.aplicado);
  if (dinero(valor) > disponible) {
    throw new Error(`El recaudo solo tiene ${disponible.toLocaleString("es-CO")} sin aplicar; no se pueden aplicar ${dinero(valor).toLocaleString("es-CO")}.`);
  }
  if (!e.entidad_catalogo_id || e.entidad_catalogo_id !== r.entidad_catalogo_id) {
    throw new Error("El recaudo es de otra entidad: solo se aplica a expedientes radicados ante la misma.");
  }
  if (!["radicado", "con_recaudo"].includes(e.estado) || e.radicacion_estado !== "radicada") {
    throw new Error(`El expediente está «${e.estado}»; un recaudo se aplica a expedientes radicados.`);
  }
  if (e.valor_reclamado == null) throw new Error("El expediente no tiene valor reclamado.");
}

// ── Ajustes monetarios ───────────────────────────────────────────────────────

/** Tipos de ajuste (12.6 por confirmar): el signo lo da el valor, el efecto en el saldo `extingue_saldo`. */
export const TIPOS_AJUSTE = [
  { key: "glosa_aceptada", label: "Glosa aceptada", ayuda: "La entidad reconoce menos; se acepta y extingue esa parte del saldo.", extinguePorDefecto: true },
  { key: "descuento_entidad", label: "Descuento de la entidad", ayuda: "Retención o descuento aplicado por la entidad en el giro.", extinguePorDefecto: true },
  { key: "diferencia_redondeo", label: "Diferencia de redondeo", ayuda: "Centavos o pesos de diferencia entre lo reclamado y lo girado.", extinguePorDefecto: true },
  { key: "correccion", label: "Corrección", ayuda: "Corrige un valor reclamado mal calculado; puede subir o bajar el saldo.", extinguePorDefecto: true },
  { key: "nota_informativa", label: "Nota informativa", ayuda: "Registra una diferencia sin extinguir saldo (sigue exigible).", extinguePorDefecto: false },
] as const;

export type TipoAjuste = (typeof TIPOS_AJUSTE)[number]["key"];

export function esTipoAjuste(v: string | null | undefined): v is TipoAjuste {
  return TIPOS_AJUSTE.some((t) => t.key === v);
}

export function validarAjuste(d: { tipo: string | null; valor: number | null; motivo: string | null }): void {
  if (!esTipoAjuste(d.tipo)) throw new Error("Tipo de ajuste no válido.");
  if (d.valor == null || !Number.isFinite(d.valor) || d.valor === 0) throw new Error("El valor del ajuste debe ser distinto de cero (positivo reduce el saldo, negativo lo aumenta).");
  if (!d.motivo || d.motivo.replace(/\s+/g, " ").trim().length < 5) throw new Error("Escribe el motivo del ajuste (mínimo 5 caracteres).");
}

// ── Cierre ───────────────────────────────────────────────────────────────────

/**
 * Cerrar exige saldo dentro de la tolerancia o una excepción escrita (plan 7.3).
 * Devuelve si el cierre es por excepción.
 */
export function validarCierre(s: Saldo, motivo: string | null): { porExcepcion: boolean } {
  if (s.estado === "sin_base") throw new Error("No se puede cerrar un expediente sin valor reclamado.");
  if (s.dentroTolerancia) return { porExcepcion: false };
  if (!motivo || motivo.replace(/\s+/g, " ").trim().length < 10) {
    throw new Error(`El saldo es ${s.saldo.toLocaleString("es-CO")}: cerrar con saldo exige una excepción aprobada de al menos 10 caracteres.`);
  }
  return { porExcepcion: true };
}
