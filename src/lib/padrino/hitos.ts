/**
 * Hitos de pago del Plan Padrino (funciones puras). Spec RQ-05 y RQ-06.
 *
 * Un hito se causa a su fecha (ingreso + N meses calendario) solo si en esa
 * fecha (a) el referido conserva permanencia efectiva y (b) el padrino
 * mantiene contrato vigente. Los datos de permanencia vienen de GEMA
 * (conductores / employees), sincronizados cada día a las 3:00 a. m.
 */

import { sumarDias, sumarMeses } from "./reglas";

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
  /** A quién se le paga este hito (desde v3 hay filas del padrino y del referido). */
  beneficiario: "padrino" | "referido";
  cedula_beneficiario: string | null;
  nombre_beneficiario: string | null;
  referido: {
    cedula_referido: string;
    nombre_referido: string | null;
    cedula_padrino: string;
    nombre_padrino: string | null;
    padrino_tipo: string;
    esquema: "A" | "B" | "C";
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
  /**
   * Vínculos del padrino en GEMA: puede tener ambos (p. ej. un conductor que
   * pasó a empleado). `inicio` es el comienzo del vínculo actual (reingreso o
   * ingreso del conductor, hire_date del empleado): si empezó después del
   * ingreso del referido, el padrino se retiró y volvió en medio. Sin dato se
   * supone vigente desde siempre (como antes).
   */
  padrinoConductor: { estado: string; fechaRetiro: string | null; inicio?: string | null } | null;
  padrinoEmpleado: { status: string; fechaRetiro: string | null; inicio?: string | null } | null;
  /** Autorización de empleado padrino; null si nunca se autorizó. revocadoEl (AAAA-MM-DD) la quita desde esa fecha. */
  autorizacionEmpleado: { revocadoEl: string | null } | null;
}

export type ResultadoHito =
  | { estado: "pendiente"; motivo: string | null }
  | { estado: "por_aprobar"; motivo: null }
  | { estado: "no_causado"; motivo: string; cancelaSiguientes: boolean };

/** Lo que cambia según el beneficiario del hito y la versión de la política. */
export interface OpcionesHito {
  /** Sin dato: el padrino (todos los hitos de la v2 son del padrino). */
  beneficiario?: "padrino" | "referido";
  /** `lista_blanca` (v2): un empleado padrino además debe estar autorizado. */
  modoEmpleados?: "lista_blanca" | "excluidos";
  /** La parte del padrino exige que siga con contrato vigente a la fecha. */
  padrinoDebeSeguirActivo?: boolean;
}

/**
 * Evalúa un hito pendiente. `fechaIngreso` es el inicio del conteo del
 * referido en el plan: un retiro anterior es de otra vinculación y no cuenta.
 *
 * La parte del referido solo exige la permanencia del referido (sección 5 de
 * la política v3); la del padrino exige además que él siga vigente: si se
 * retira pierde lo suyo, pero el referido conserva lo propio.
 */
export function evaluarHito(fechaCausacion: string, fechaIngreso: string, hoy: string, h: HechosPermanencia, o: OpcionesHito = {}): ResultadoHito {
  const beneficiario = o.beneficiario ?? "padrino";
  const listaBlanca = (o.modoEmpleados ?? "lista_blanca") === "lista_blanca";
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

  if (beneficiario === "referido" || o.padrinoDebeSeguirActivo === false) return { estado: "por_aprobar", motivo: null };

  // (b) Contrato vigente del padrino a la fecha de causación, por cualquiera
  // de sus vínculos: un conductor que pasó a empleado (o al revés) no pierde
  // el hito mientras alguno estuviera vigente ese día.
  const c = h.padrinoConductor;
  const e = h.padrinoEmpleado;
  if (!c && !e) return { estado: "no_causado", motivo: "Padrino sin contrato: no aparece en conductores ni en empleados.", cancelaSiguientes: false };
  const conductorVigente = c !== null && (c.estado === "ACTIVO" || (c.fechaRetiro !== null && c.fechaRetiro > fechaCausacion));
  const empleadoVigente = e !== null && (e.status === "activo" || e.status === "periodo_prueba" || (e.fechaRetiro !== null && e.fechaRetiro > fechaCausacion));
  // La autorización se mira a la fecha de causación: una revocación posterior no tumba un hito ya causado.
  // Solo en la v2 (lista blanca): desde la v3 cualquier empleado vigente puede ser padrino.
  const autorizado = !listaBlanca || (h.autorizacionEmpleado !== null && (h.autorizacionEmpleado.revocadoEl === null || h.autorizacionEmpleado.revocadoEl > fechaCausacion));
  if (conductorVigente || (empleadoVigente && autorizado)) {
    // Además, sin interrupción desde el ingreso del referido: si se retiró y
    // lo recontrataron, perdió lo que no se había causado (GH, 2026-11-07).
    const reingreso = reingresoEnMedio(vinculosPadrino(c, autorizado ? e : null), fechaIngreso, fechaCausacion);
    if (!reingreso) return { estado: "por_aprobar", motivo: null };
    return {
      estado: "no_causado",
      motivo: `El padrino se retiró después del ingreso del referido y reingresó el ${fmt(reingreso)}: perdió los pagos que no se habían causado.`,
      cancelaSiguientes: false,
    };
  }
  if (empleadoVigente) {
    const rev = h.autorizacionEmpleado?.revocadoEl;
    return {
      estado: "no_causado",
      motivo: rev
        ? `El padrino no estaba autorizado como empleado padrino a la fecha de causación: la autorización se revocó el ${fmt(rev)}.`
        : "El padrino no está autorizado como empleado padrino.",
      cancelaSiguientes: false,
    };
  }
  const retiro = c?.fechaRetiro ?? e?.fechaRetiro ?? null;
  return { estado: "no_causado", motivo: `Padrino sin contrato vigente${retiro ? `: se retiró el ${fmt(retiro)}` : ""}.`, cancelaSiguientes: false };
}

type Vinculo = { inicio: string | null; fin: string | null };

/**
 * Tramos en que el padrino tuvo contrato: [inicio, fin), con `fin` el día del
 * retiro (null: sigue vigente) e `inicio` null si se desconoce (desde siempre).
 * Un conductor activo por reingreso cuyo retiro anterior sigue en GEMA aporta
 * también ese tramo anterior.
 */
function vinculosPadrino(c: HechosPermanencia["padrinoConductor"], e: HechosPermanencia["padrinoEmpleado"]): Vinculo[] {
  const out: Vinculo[] = [];
  if (c) {
    const activo = c.estado === "ACTIVO";
    if (activo) {
      out.push({ inicio: c.inicio ?? null, fin: null });
      if (c.inicio && c.fechaRetiro && c.fechaRetiro < c.inicio) out.push({ inicio: null, fin: c.fechaRetiro });
    } else if (c.fechaRetiro) out.push({ inicio: c.inicio ?? null, fin: c.fechaRetiro });
  }
  if (e) {
    const activo = e.status === "activo" || e.status === "periodo_prueba";
    if (activo) out.push({ inicio: e.inicio ?? null, fin: null });
    else if (e.fechaRetiro) out.push({ inicio: e.inicio ?? null, fin: e.fechaRetiro });
  }
  return out;
}

/**
 * Si los tramos no cubren sin hueco de `desde` a `hasta` (inclusive), la
 * fecha en que el padrino volvió a entrar después del hueco; null si los
 * cubren. Un tramo que empieza el día siguiente al retiro de otro no es hueco
 * (p. ej. de conductor a empleado).
 */
export function reingresoEnMedio(vinculos: Vinculo[], desde: string, hasta: string): string | null {
  let cursor = desde;
  for (let i = 0; i <= vinculos.length; i++) {
    const tope = sumarDias(cursor, 1);
    const cubre = vinculos.filter((v) => (v.inicio === null || v.inicio <= tope) && (v.fin === null || v.fin > cursor));
    if (!cubre.length) {
      const siguiente = vinculos.map((v) => v.inicio).filter((x): x is string => x !== null && x > tope).sort()[0];
      // Hueco: aunque haya vuelto después de la causación, ese día no estaba vigente.
      return siguiente ?? cursor;
    }
    if (cubre.some((v) => v.fin === null || v.fin > hasta)) return null;
    cursor = cubre.map((v) => v.fin!).sort().at(-1)!;
  }
  return null;
}

/**
 * Estado del referido según sus hitos: sigue en seguimiento mientras haya
 * alguno sin terminar; completado si se pagaron todos los que no se
 * cancelaron; si no, terminado sin completar. Un cancelado solo pesa junto a
 * un «no causado» (retiro del referido), que ya lo deja terminado; uno que
 * sobró al pasar a otra versión de la política no impide completar.
 */
export function estadoReferidoPorHitos(hitos: { estado: string }[]): "en_seguimiento" | "completado" | "terminado" {
  if (!hitos.length || hitos.some((h) => !HITO_FINAL.has(h.estado))) return "en_seguimiento";
  const vigentes = hitos.filter((h) => h.estado !== "cancelado");
  return vigentes.length && vigentes.every((h) => h.estado === "pagado") ? "completado" : "terminado";
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
  /** Desde la v3 también se le paga al referido; sin dato, al padrino. */
  beneficiario?: "padrino" | "referido";
  nombreReferido?: string | null;
}) {
  const [a, m] = h.fechaPago.split("-");
  const alReferido = h.beneficiario === "referido";
  return {
    cedula: alReferido ? h.cedulaReferido : h.cedulaPadrino,
    nombre: alReferido ? (h.nombreReferido ?? null) : h.nombrePadrino,
    mes_entrega: `${MESES_MAYUS[Number(m) - 1]} ${a}`,
    periodo: `${a}-${m}-01`,
    valor: h.valor,
    concepto: alReferido
      ? `PLAN PADRINO ${h.esquema}${h.numero} - BONO REFERIDO`
      : `PLAN PADRINO ${h.esquema}${h.numero} - REFERIDO ${h.cedulaReferido}`,
    source_file: FUENTE_INCENTIVO_PADRINO,
  };
}

export const BENEFICIARIO_LABEL: Record<"padrino" | "referido", string> = { padrino: "Padrino", referido: "Referido" };

// ── Pagos simulados (simulador de la política) ──────────────────────────────

/** Qué pasa en el escenario: quién se retira y antes de cumplir qué mes (sin dato: permanece). */
export interface EscenarioPagos {
  referidoSeRetiraAntesDelMes?: number | null;
  padrinoSeRetiraAntesDelMes?: number | null;
  /** Fechas reales de retiro (AAAA-MM-DD): mandan sobre los meses (comparativo del tablero). */
  fechaRetiroReferido?: string | null;
  fechaRetiroPadrino?: string | null;
}

export interface PagoSimulado {
  numero: number;
  meses: number;
  descripcion: string;
  beneficiario: "padrino" | "referido";
  valor: number;
  fechaCausacion: string;
  /** Se paga, no se causa, se cancela por un retiro anterior del referido, o su fecha no ha llegado (`hasta`). */
  resultado: ResultadoProyeccion;
  motivo: string | null;
}

export type ResultadoProyeccion = "se_paga" | "no_causado" | "cancelado" | "pendiente";

/**
 * Proyecta hitos con `evaluarHito`, la misma función de la evaluación diaria:
 * en orden de causación, un retiro del referido cancela los siguientes. Los
 * que todavía no llegan a su fecha (respecto de `hoy`) quedan «pendiente».
 */
export function proyectarHitos<T extends { numero: number; beneficiario: "padrino" | "referido"; fechaCausacion: string }>(
  hitos: T[],
  fechaIngreso: string,
  hechos: HechosPermanencia,
  opciones: Omit<OpcionesHito, "beneficiario">,
  hoy: string
): (T & { resultado: ResultadoProyeccion; motivo: string | null })[] {
  let cortado: number | null = null;
  return [...hitos]
    .sort((a, b) => a.fechaCausacion.localeCompare(b.fechaCausacion) || a.numero - b.numero || a.beneficiario.localeCompare(b.beneficiario))
    .map((h) => {
      if (cortado !== null && h.numero > cortado) {
        return { ...h, resultado: "cancelado" as const, motivo: "Se cancela: el referido se retiró en un hito anterior." };
      }
      const r = evaluarHito(h.fechaCausacion, fechaIngreso, hoy, hechos, { ...opciones, beneficiario: h.beneficiario });
      if (r.estado === "pendiente") return { ...h, resultado: "pendiente" as const, motivo: r.motivo };
      if (r.estado === "no_causado") {
        if (r.cancelaSiguientes) cortado = h.numero;
        return { ...h, resultado: "no_causado" as const, motivo: r.motivo };
      }
      return { ...h, resultado: "se_paga" as const, motivo: null };
    });
}

/**
 * Cómo serían los pagos de un esquema en un escenario de permanencia. No
 * repite la regla: arma los hechos del escenario (un retiro el día anterior a
 * cumplir el mes N) y proyecta cada hito con `proyectarHitos`, la misma
 * evaluación de todos los días, así que el simulador no puede discrepar de lo
 * real.
 */
export function pagosSimulados(
  hitos: { numero: number; meses: number; descripcion: string; beneficiario: "padrino" | "referido"; valor: number }[],
  fechaIngreso: string,
  escenario: EscenarioPagos,
  opciones: Omit<OpcionesHito, "beneficiario"> = {},
  /** Solo cuentan los hitos que se causan hasta esta fecha; los demás quedan «pendiente». */
  hasta: string | null = null
) {
  const retiro = (mes: number | null | undefined) => (mes ? sumarDias(sumarMeses(fechaIngreso, mes), -1) : null);
  const fr = escenario.fechaRetiroReferido ?? retiro(escenario.referidoSeRetiraAntesDelMes);
  const fp = escenario.fechaRetiroPadrino ?? retiro(escenario.padrinoSeRetiraAntesDelMes);
  const hechos: HechosPermanencia = {
    referido: fr ? { estado: "RETIRADO", fechaRetiro: fr } : { estado: "ACTIVO", fechaRetiro: null },
    padrinoConductor: fp ? { estado: "RETIRADO", fechaRetiro: fp } : { estado: "ACTIVO", fechaRetiro: null },
    padrinoEmpleado: null,
    autorizacionEmpleado: null,
  };
  // Sin `hasta`, todos vencidos: se simula el plan completo, no lo que va corrido hoy.
  const conFecha = hitos.map((h) => ({ ...h, fechaCausacion: sumarMeses(fechaIngreso, h.meses) }));
  const pagos: PagoSimulado[] = proyectarHitos(conFecha, fechaIngreso, hechos, opciones, hasta ?? "9999-12-31").map((h) =>
    h.resultado === "pendiente" ? { ...h, motivo: "Su fecha todavía no llega." } : h
  );
  const suma = (b: "padrino" | "referido") => pagos.filter((p) => p.resultado === "se_paga" && p.beneficiario === b).reduce((s, p) => s + p.valor, 0);
  const padrino = suma("padrino");
  const referido = suma("referido");
  return { pagos, totales: { padrino, referido, total: padrino + referido } };
}
