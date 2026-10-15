/**
 * Hitos de pago del Plan Padrino (funciones puras). Spec RQ-05 y RQ-06.
 *
 * Un hito se causa a su fecha (ingreso + N meses calendario) solo si en esa
 * fecha (a) el referido conserva permanencia efectiva y (b) el padrino
 * mantiene contrato vigente. Los datos de permanencia vienen de GEMA
 * (conductores / employees), sincronizados cada día a las 3:00 a. m.
 */

export const ESTADOS_HITO = [
  { value: "pendiente", label: "Pendiente", bg: "#F1F5F9", color: "#64748B" },
  { value: "por_aprobar", label: "Por aprobar", bg: "#FEF3C7", color: "#B45309" },
  { value: "aprobado", label: "Aprobado", bg: "#DBEAFE", color: "#2563EB" },
  { value: "pagado", label: "Pagado", bg: "#D1FAE5", color: "#059669" },
  { value: "rechazado", label: "Rechazado", bg: "#FEE2E2", color: "#DC2626" },
  { value: "no_causado", label: "No causado", bg: "#F1F5F9", color: "#475569" },
  { value: "cancelado", label: "Cancelado", bg: "#F1F5F9", color: "#94A3B8" },
] as const;

export type EstadoHito = (typeof ESTADOS_HITO)[number]["value"];
export const estadoHito = (v: string) => ESTADOS_HITO.find((e) => e.value === v) ?? null;

export const VISTAS_HITOS = [
  { value: "por_aprobar", label: "Por aprobar" },
  { value: "aprobado", label: "Aprobados por pagar" },
  { value: "proximos", label: "Próximos 30 días" },
  { value: "todos", label: "Todos" },
] as const;

export interface FiltrosHitos {
  vista: string;
  /** Rango de fecha de causación (AAAA-MM-DD). */
  desde: string | null;
  hasta: string | null;
  q: string;
}

export interface HitoFila {
  id: string;
  referido_id: string;
  numero: number;
  descripcion: string;
  valor: number;
  requiere_desempeno: boolean;
  fecha_causacion: string;
  estado: string;
  motivo: string | null;
  evaluado_at: string | null;
  desempeno_satisfactorio: boolean | null;
  aprobado_por_email: string | null;
  aprobado_at: string | null;
  observacion_aprobacion: string | null;
  pagado_por_email: string | null;
  fecha_pago: string | null;
  referencia_pago: string | null;
  referido: {
    cedula_referido: string;
    nombre_referido: string | null;
    cedula_padrino: string;
    nombre_padrino: string | null;
    padrino_tipo: string;
    esquema: "A" | "B";
    fecha_ingreso: string | null;
    created_by: string | null;
    created_by_email: string | null;
  };
}

/** Estados en que el hito ya no cambia. */
export const HITO_FINAL = new Set<string>(["pagado", "rechazado", "no_causado", "cancelado"]);

const fmt = (f: string) => f.split("-").reverse().join("/");

export interface HechosPermanencia {
  /** Conductor referido según GEMA; null si GEMA todavía no lo tiene. */
  referido: { estado: string; fechaRetiro: string | null } | null;
  /** Padrino: conductor o empleado según GEMA. */
  padrino:
    | { tipo: "conductor"; estado: string; fechaRetiro: string | null }
    | { tipo: "empleado"; status: string; fechaRetiro: string | null; autorizado: boolean }
    | null;
}

export type ResultadoHito =
  | { estado: "pendiente"; motivo: string | null }
  | { estado: "por_aprobar"; motivo: null }
  | { estado: "no_causado"; motivo: string; cancelaSiguientes: boolean };

/**
 * Evalúa un hito pendiente. `fechaIngreso` es el inicio del conteo del
 * referido en el plan: un retiro anterior es de otra vinculación y no cuenta.
 */
export function evaluarHito(fechaCausacion: string, fechaIngreso: string, hoy: string, h: HechosPermanencia): ResultadoHito {
  if (fechaCausacion > hoy) return { estado: "pendiente", motivo: null };

  // (a) Permanencia efectiva del referido a la fecha de causación.
  const r = h.referido;
  if (!r) return { estado: "pendiente", motivo: "GEMA todavía no tiene al referido como conductor." };
  if (r.estado !== "ACTIVO") {
    if (!r.fechaRetiro || r.fechaRetiro < fechaIngreso) {
      return { estado: "pendiente", motivo: `GEMA lo muestra ${r.estado} sin una fecha de retiro posterior al ingreso (${fmt(fechaIngreso)}): revise el dato.` };
    }
    if (r.fechaRetiro <= fechaCausacion) {
      return { estado: "no_causado", motivo: `El referido se retiró el ${fmt(r.fechaRetiro)}, antes de la fecha de causación.`, cancelaSiguientes: true };
    }
    // Se retiró después: a la fecha de causación seguía activo.
  }

  // (b) Contrato vigente del padrino a la fecha de causación.
  const p = h.padrino;
  if (!p) return { estado: "no_causado", motivo: "Padrino sin contrato: no aparece en conductores ni en empleados.", cancelaSiguientes: false };
  const activo = p.tipo === "conductor" ? p.estado === "ACTIVO" : p.status === "activo" || p.status === "periodo_prueba";
  const vigente = activo || (p.fechaRetiro !== null && p.fechaRetiro > fechaCausacion);
  if (!vigente) {
    return { estado: "no_causado", motivo: `Padrino sin contrato vigente${p.fechaRetiro ? `: se retiró el ${fmt(p.fechaRetiro)}` : ""}.`, cancelaSiguientes: false };
  }
  if (p.tipo === "empleado" && !p.autorizado) {
    return { estado: "no_causado", motivo: "El padrino ya no está autorizado como empleado padrino.", cancelaSiguientes: false };
  }
  return { estado: "por_aprobar", motivo: null };
}

/**
 * Estado del referido según sus hitos: sigue en seguimiento mientras haya
 * alguno sin terminar; completado si todos se pagaron; si no, terminado sin
 * completar.
 */
export function estadoReferidoPorHitos(hitos: { estado: string }[]): "en_seguimiento" | "completado" | "terminado" {
  if (!hitos.length || hitos.some((h) => !HITO_FINAL.has(h.estado))) return "en_seguimiento";
  return hitos.every((h) => h.estado === "pagado") ? "completado" : "terminado";
}

/** Error de la aprobación o rechazo de un hito, o null si procede. */
export function validarAprobacionHito(p: {
  estado: string;
  aprobar: boolean;
  observacion: string;
  requiereDesempeno: boolean;
  desempenoSatisfactorio: boolean;
  aprobadorId: string | null;
  registradoPorId: string | null;
}): string | null {
  if (p.estado !== "por_aprobar") return "Este hito no está por aprobar.";
  // Segregación de funciones (RQ-07): quien registró el referido no aprueba sus hitos.
  if (p.aprobadorId && p.registradoPorId && p.aprobadorId === p.registradoPorId) {
    return "Usted registró este referido: otra persona debe aprobar o rechazar sus hitos.";
  }
  const obs = p.observacion.trim();
  if (obs.length > 2000) return "La observación no puede pasar de 2000 caracteres.";
  if (!p.aprobar) return obs ? null : "Escriba por qué se rechaza el hito.";
  if (p.requiereDesempeno && !p.desempenoSatisfactorio) {
    return "Este hito exige desempeño satisfactorio: márquelo para aprobar, o rechace el hito con la observación.";
  }
  return null;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Error del registro de pago, o null si procede. */
export function validarPago(estado: string, fechaPago: string, referencia: string, hoy: string): string | null {
  if (estado !== "aprobado") return "Solo se marcan como pagados los hitos aprobados.";
  if (!FECHA_RE.test(fechaPago)) return "Indique la fecha de pago.";
  if (fechaPago > hoy) return "La fecha de pago no puede ser futura.";
  const ref = referencia.trim();
  if (!ref) return "Indique la referencia del pago (concepto de nómina, comprobante o planilla).";
  if (ref.length > 120) return "La referencia no puede pasar de 120 caracteres.";
  return null;
}

// ── Incentivos (fase 3, RQ-12) ──────────────────────────────────────────────

/** source_file de las filas de `incentivos` que escribe Gestivo; la carga del Excel no las borra. */
export const FUENTE_INCENTIVO_PADRINO = "gestivo-plan-padrino";

const MESES_MAYUS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/**
 * Fila de `incentivos` para un hito pagado, con el mismo formato que la
 * carga del Excel: mes_entrega «NOVIEMBRE 2026» y periodo el primer día del
 * mes de pago.
 */
export function filaIncentivo(h: {
  fechaPago: string;
  valor: number;
  esquema: string;
  numero: number;
  cedulaPadrino: string;
  nombrePadrino: string | null;
  cedulaReferido: string;
}) {
  const [a, m] = h.fechaPago.split("-");
  return {
    cedula: h.cedulaPadrino,
    nombre: h.nombrePadrino,
    mes_entrega: `${MESES_MAYUS[Number(m) - 1]} ${a}`,
    periodo: `${a}-${m}-01`,
    valor: h.valor,
    concepto: `PLAN PADRINO ${h.esquema}${h.numero} - REFERIDO ${h.cedulaReferido}`,
    source_file: FUENTE_INCENTIVO_PADRINO,
  };
}
