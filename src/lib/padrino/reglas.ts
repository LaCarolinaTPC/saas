/**
 * Reglas del Plan Padrino (funciones puras, compartidas cliente/servidor).
 *
 * Fuente: Política de Bonificación Plan Padrino v2 y la spec
 * work/Plan Padrino/Spec_Gestivo_Plan_Padrino.md. Las consultas viven en
 * datos.ts; aquí solo se decide con los hechos ya leídos, para poder probarlo.
 *
 * Decisiones tomadas el 2026-10-15 sobre las preguntas abiertas:
 *  - Q1: el mes de permanencia es mes calendario desde la fecha de ingreso.
 *  - Q2: en el esquema B el hito 1 se paga al cumplir el mes 1 aunque no
 *    llegue a 3; el hito 2 se causa a los 3 meses desde el ingreso.
 *  - Q3: no hay registro disciplinario general; P3 revisa descargos de
 *    ausentismo y correctivos de accidentes, y si no encuentra nada queda en
 *    "revisar" para que la coordinadora lo confirme.
 */

export type Semaforo = "cumple" | "no_cumple" | "revisar";

export interface Requisito {
  codigo: string;
  titulo: string;
  estado: Semaforo;
  /** El dato que sustenta el resultado, en palabras. */
  dato: string;
}

export interface Validacion {
  padrino: Requisito[];
  referido: Requisito[];
  /** Fecha (AAAA-MM-DD, Bogotá) en que se evaluó. */
  evaluadoEl: string;
}

export const ESTADOS_REFERIDO = [
  { value: "registrado", label: "Registrado", bg: "#F1F5F9", color: "#64748B" },
  { value: "en_validacion", label: "En validación", bg: "#FEF3C7", color: "#B45309" },
  { value: "elegible", label: "Elegible", bg: "#DBEAFE", color: "#2563EB" },
  { value: "no_elegible", label: "No elegible", bg: "#FEE2E2", color: "#DC2626" },
  { value: "contratado", label: "Contratado", bg: "#D1FAE5", color: "#059669" },
  { value: "en_seguimiento", label: "En seguimiento", bg: "#E0E7FF", color: "#4F46E5" },
  { value: "completado", label: "Completado", bg: "#DCFCE7", color: "#15803D" },
  { value: "terminado", label: "Terminado sin completar", bg: "#F1F5F9", color: "#475569" },
  { value: "no_contratado", label: "No contratado", bg: "#F1F5F9", color: "#475569" },
] as const;

export type EstadoReferido = (typeof ESTADOS_REFERIDO)[number]["value"];

export const estadoReferido = (v: string) => ESTADOS_REFERIDO.find((e) => e.value === v) ?? null;

export const SEMAFORO_LABEL: Record<Semaforo, string> = {
  cumple: "Cumple",
  no_cumple: "No cumple",
  revisar: "Requiere revisión",
};


/** Meses que se miran hacia atrás para las sanciones del padrino (P3) y la hoja de vida (R2). */
export const MESES_SANCIONES = 6;
export const MESES_HOJA_VIDA = 12;

// ── Fechas ──────────────────────────────────────────────────────────────────

/**
 * Suma meses calendario a una fecha AAAA-MM-DD. Si el día no existe en el mes
 * de llegada, toma el último día (31-ene + 1 mes = 28/29-feb).
 */
export function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = total % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimo);
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const fmtCorta = (f: string) => f.split("-").reverse().join("/");

// ── Hechos que lee datos.ts ─────────────────────────────────────────────────

export interface HechosPadrino {
  cedula: string;
  conductor: { nombre: string; estado: string; tipo: string | null; fechaIngreso: string | null } | null;
  empleado: { nombre: string; status: string; cargo: string | null; area: string | null } | null;
  /**
   * El empleado está en padrino_empleados_autorizados. Los conductores
   * activos siempre pueden ser padrinos; de los empleados, solo los
   * autorizados (decisión de Gestión Humana del 2026-10-15: uno solo).
   */
  empleadoAutorizado: boolean;
  /** Descargos o terminación no anulados en los últimos 6 meses. */
  notificaciones: { nivel: string; fecha: string }[];
  /** Accidentes de los últimos 6 meses con correctivo (nivel I a IV). */
  correctivos: { fecha: string; nivel: string }[];
}

export interface HechosReferido {
  cedula: string;
  /** Proceso de contratación del que sale el referido. */
  proceso: { id: string; fechaCreacion: string; simit: string | null };
  candidatoCreado: string | null;
  otrosProcesos: { id: string; estado: string; fechaCreacion: string }[];
  conductor: { estado: string; fechaIngreso: string | null; fechaRetiro: string | null } | null;
  causaRetiro: string | null;
  notificaciones: { nivel: string; fecha: string }[];
  accidentes: { fecha: string }[];
}

/** Estados del proceso que cuentan como "en curso" (ver contratacion/constants). */
const EN_CURSO = new Set(["pendiente", "citado", "en_examenes", "en_examenes_fase2", "prueba_manejo", "en_escuela", "reconocimiento_ruta"]);

// ── Padrino: P1 a P3 ────────────────────────────────────────────────────────

export function evaluarPadrino(h: HechosPadrino, hoy: string): Requisito[] {
  const out: Requisito[] = [];
  const conductorActivo = h.conductor?.estado === "ACTIVO";
  const empleadoActivo = h.empleado?.status === "activo" || h.empleado?.status === "periodo_prueba";
  const vinculo = h.empleado ? `${h.empleado.cargo ?? "sin cargo"} · área ${h.empleado.area ?? "sin área"}` : "";

  // P1 — contrato vigente en el área operativa.
  if (conductorActivo) {
    out.push({ codigo: "P1", titulo: "Contrato vigente en el área operativa", estado: "cumple", dato: `Conductor ACTIVO${h.conductor!.tipo ? ` (${h.conductor!.tipo})` : ""}${h.conductor!.fechaIngreso ? ` desde ${fmtCorta(h.conductor!.fechaIngreso)}` : ""}.` });
  } else if (empleadoActivo) {
    out.push({
      codigo: "P1",
      titulo: "Contrato vigente en el área operativa",
      estado: h.empleadoAutorizado ? "cumple" : "no_cumple",
      dato: `Empleado activo: ${vinculo}. ${h.empleadoAutorizado ? "Autorizado como padrino." : "Solo los conductores y los empleados autorizados por Gestión Humana pueden ser padrinos."}`,
    });
  } else {
    const donde = h.conductor ? `Conductor ${h.conductor.estado}` : h.empleado ? `Empleado ${h.empleado.status}` : "No aparece en conductores ni en empleados";
    out.push({ codigo: "P1", titulo: "Contrato vigente en el área operativa", estado: "no_cumple", dato: `${donde}.` });
  }

  // P2 — no administrativo, ni Gestión Humana, ni interviene en selección, nómina, tesorería o auditoría.
  const tituloP2 = "No es administrativo ni interviene en selección, nómina, tesorería o auditoría";
  if (conductorActivo) {
    out.push({ codigo: "P2", titulo: tituloP2, estado: "cumple", dato: "Es conductor." });
  } else if (!h.empleado) {
    out.push({ codigo: "P2", titulo: tituloP2, estado: "revisar", dato: "Sin datos de cargo." });
  } else if (!h.empleadoAutorizado) {
    out.push({ codigo: "P2", titulo: tituloP2, estado: "no_cumple", dato: `${vinculo}: empleado no autorizado como padrino.` });
  } else {
    out.push({ codigo: "P2", titulo: tituloP2, estado: "cumple", dato: `${vinculo}: autorizado por Gestión Humana.` });
  }

  // P3 — sin sanciones ni procesos disciplinarios en los 6 meses previos.
  const desde = sumarMeses(hoy, -MESES_SANCIONES);
  const notif = h.notificaciones.filter((n) => n.fecha >= desde);
  const corr = h.correctivos.filter((c) => c.fecha >= desde);
  if (notif.length || corr.length) {
    const partes = [
      ...notif.map((n) => `${n.nivel === "terminacion" ? "Notificación de terminación" : "Descargos"} por ausentismo el ${fmtCorta(n.fecha)}`),
      ...corr.map((c) => `Correctivo nivel ${c.nivel} por accidente del ${fmtCorta(c.fecha)}`),
    ];
    out.push({ codigo: "P3", titulo: "Sin sanciones ni procesos disciplinarios en los últimos 6 meses", estado: "no_cumple", dato: `${partes.join("; ")}.` });
  } else {
    out.push({ codigo: "P3", titulo: "Sin sanciones ni procesos disciplinarios en los últimos 6 meses", estado: "revisar", dato: "Sin descargos de ausentismo ni correctivos por accidentes desde " + fmtCorta(desde) + ". Gestivo no tiene un registro disciplinario general: confírmelo con Gestión Humana." });
  }
  return out;
}

// ── Referido: R1 a R5 ───────────────────────────────────────────────────────

export function evaluarReferido(h: HechosReferido): Requisito[] {
  const out: Requisito[] = [];
  const inicioProceso = h.proceso.fechaCreacion;

  // R1 — sin procesos disciplinarios o laborales con la compañía.
  if (h.notificaciones.length) {
    out.push({ codigo: "R1", titulo: "Sin procesos disciplinarios o laborales con la compañía", estado: "no_cumple", dato: `${h.notificaciones.length} notificación(es) de ausentismo; la última el ${fmtCorta(h.notificaciones.map((n) => n.fecha).sort().at(-1)!)}.` });
  } else if (h.conductor && h.conductor.estado !== "ACTIVO") {
    out.push({ codigo: "R1", titulo: "Sin procesos disciplinarios o laborales con la compañía", estado: "revisar", dato: `Trabajó antes como conductor${h.conductor.fechaRetiro ? ` (retiro ${fmtCorta(h.conductor.fechaRetiro)})` : ""}${h.causaRetiro ? `; causa de retiro: ${h.causaRetiro}` : "; sin causa de retiro registrada"}.` });
  } else {
    out.push({ codigo: "R1", titulo: "Sin procesos disciplinarios o laborales con la compañía", estado: "cumple", dato: "Sin notificaciones de ausentismo ni vinculación anterior como conductor." });
  }

  // R2 — sin hoja de vida en la base de selección en los 12 meses anteriores.
  const desde12 = sumarMeses(inicioProceso, -MESES_HOJA_VIDA);
  const previos = h.otrosProcesos.filter((p) => p.fechaCreacion >= desde12 && p.fechaCreacion <= inicioProceso).sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion));
  const candidatoAntes = h.candidatoCreado && h.candidatoCreado >= desde12 && h.candidatoCreado < sumarMeses(inicioProceso, -1);
  if (previos.length) {
    out.push({ codigo: "R2", titulo: "Sin hoja de vida en selección en los 12 meses anteriores", estado: "no_cumple", dato: `Otro proceso de contratación creado el ${fmtCorta(previos[0].fechaCreacion)}.` });
  } else if (candidatoAntes) {
    out.push({ codigo: "R2", titulo: "Sin hoja de vida en selección en los 12 meses anteriores", estado: "revisar", dato: `La hoja de vida entró a la base el ${fmtCorta(h.candidatoCreado!)}, más de un mes antes de este proceso: confirme si es la misma postulación.` });
  } else {
    out.push({ codigo: "R2", titulo: "Sin hoja de vida en selección en los 12 meses anteriores", estado: "cumple", dato: `Sin procesos ni hoja de vida anteriores desde ${fmtCorta(desde12)}.` });
  }

  // R3 — no estar en otro proceso de selección en curso.
  const abiertos = h.otrosProcesos.filter((p) => EN_CURSO.has(p.estado));
  out.push(
    abiertos.length
      ? { codigo: "R3", titulo: "Sin otro proceso de selección en curso", estado: "no_cumple", dato: `Tiene ${abiertos.length} proceso(s) en curso además de este (creado el ${fmtCorta(abiertos[0].fechaCreacion)}).` }
      : { codigo: "R3", titulo: "Sin otro proceso de selección en curso", estado: "cumple", dato: "Solo tiene este proceso abierto." }
  );

  // R4 — no haber sido contratado antes sin cumplir 1 mes de permanencia.
  const c = h.conductor;
  if (c?.fechaIngreso && c.fechaRetiro && c.fechaRetiro < sumarMeses(c.fechaIngreso, 1)) {
    out.push({ codigo: "R4", titulo: "No se retiró antes de cumplir 1 mes en una contratación anterior", estado: "no_cumple", dato: `Ingresó el ${fmtCorta(c.fechaIngreso)} y se retiró el ${fmtCorta(c.fechaRetiro)}.` });
  } else if (c?.estado === "ACTIVO" && c.fechaIngreso && c.fechaIngreso < inicioProceso) {
    out.push({ codigo: "R4", titulo: "No se retiró antes de cumplir 1 mes en una contratación anterior", estado: "revisar", dato: `Ya figura como conductor ACTIVO desde ${fmtCorta(c.fechaIngreso)}, antes de este proceso.` });
  } else {
    out.push({ codigo: "R4", titulo: "No se retiró antes de cumplir 1 mes en una contratación anterior", estado: "cumple", dato: c ? `Contratación anterior: ingreso ${c.fechaIngreso ? fmtCorta(c.fechaIngreso) : "sin fecha"}${c.fechaRetiro ? `, retiro ${fmtCorta(c.fechaRetiro)}` : ""}.` : "Sin contrataciones anteriores como conductor." });
  }

  // R5 — sin accidentes de tránsito en periodos anteriores.
  if (h.accidentes.length) {
    out.push({ codigo: "R5", titulo: "Sin accidentes de tránsito anteriores", estado: "no_cumple", dato: `${h.accidentes.length} accidente(s) con la empresa; el último el ${fmtCorta(h.accidentes.map((a) => a.fecha).sort().at(-1)!)}.` });
  } else if (h.proceso.simit === "deuda" || h.proceso.simit === "acuerdo_pago" || !h.proceso.simit || h.proceso.simit === "pendiente") {
    out.push({ codigo: "R5", titulo: "Sin accidentes de tránsito anteriores", estado: "revisar", dato: `Sin accidentes con la empresa. SIMIT del proceso: ${h.proceso.simit === "deuda" ? "con deuda" : h.proceso.simit === "acuerdo_pago" ? "acuerdo de pago" : "sin verificar"}; revise si hay accidentes con otras empresas.` });
  } else {
    out.push({ codigo: "R5", titulo: "Sin accidentes de tránsito anteriores", estado: "cumple", dato: "Sin accidentes con la empresa y SIMIT sin deuda. Solo cubre accidentes con La Carolina." });
  }
  return out;
}

// ── Elegibilidad ────────────────────────────────────────────────────────────

export function resumenValidacion(v: Validacion | null | undefined) {
  const todos = [...(v?.padrino ?? []), ...(v?.referido ?? [])];
  return {
    noCumple: todos.filter((r) => r.estado === "no_cumple").length,
    revisar: todos.filter((r) => r.estado === "revisar").length,
    cumple: todos.filter((r) => r.estado === "cumple").length,
  };
}

/** El padrino debe estar activo para registrar (RQ-01): P1 distinto de "no cumple". */
export function padrinoPuedeRegistrar(padrino: Requisito[]): string | null {
  const p1 = padrino.find((r) => r.codigo === "P1");
  return p1?.estado === "no_cumple" ? `El padrino no puede registrar referidos: ${p1.dato}` : null;
}

/**
 * Error de la decisión de elegibilidad, o null si procede. Un "no cumple"
 * bloquea la aprobación salvo excepción con observación; cualquier "no
 * cumple" o "revisar" exige observación al aprobar.
 */
export function validarDecision(
  decision: "elegible" | "no_elegible",
  v: Validacion | null | undefined,
  excepcion: boolean,
  observacion: string
): string | null {
  const obs = observacion.trim();
  if (obs.length > 2000) return "La observación no puede pasar de 2000 caracteres.";
  if (decision === "no_elegible") return obs ? null : "Escriba por qué el referido no es elegible.";
  const r = resumenValidacion(v);
  if (r.noCumple && !excepcion) return `Hay ${r.noCumple} requisito(s) que no se cumplen: solo se puede aprobar como excepción documentada.`;
  if ((r.noCumple || r.revisar) && !obs) return "Escriba la observación: hay requisitos que no se cumplen o que requieren revisión.";
  return null;
}

/** Estados en que todavía se decide la elegibilidad. */
export const ESTADOS_DECISION: string[] = ["registrado", "en_validacion"];
/** Estados en que el esquema todavía se puede cambiar (antes de crear hitos). */
export const ESTADOS_CAMBIO_ESQUEMA: string[] = ["registrado", "en_validacion", "elegible", "contratado"];
/** Estados en que el referido sigue vivo (se puede anular o cerrar). */
export const ESTADOS_ABIERTOS: string[] = ["registrado", "en_validacion", "elegible", "contratado", "en_seguimiento"];

/** Esquema según el certificado validado por la coordinadora. */
export const esquemaPara = (experienciaCertificada: boolean): "A" | "B" => (experienciaCertificada ? "A" : "B");

// ── Política ────────────────────────────────────────────────────────────────

export interface HitoPolitica {
  numero: number;
  meses: number;
  valor: number;
  descripcion: string;
  requiere_desempeno?: boolean;
}
export interface EsquemaPolitica {
  nombre: string;
  condicion: string;
  hitos: HitoPolitica[];
}
export type EsquemasPolitica = Record<"A" | "B", EsquemaPolitica>;

/** Hitos del esquema con su fecha de causación (ingreso + N meses calendario). */
export function hitosProyectados(esquemas: EsquemasPolitica, esquema: "A" | "B", fechaIngreso: string | null) {
  return (esquemas[esquema]?.hitos ?? []).map((h) => ({
    ...h,
    fechaCausacion: fechaIngreso ? sumarMeses(fechaIngreso, h.meses) : null,
  }));
}

export const totalEsquema = (e: EsquemaPolitica | undefined) => (e?.hitos ?? []).reduce((s, h) => s + h.valor, 0);

/** Versión vigente en una fecha (la de inicio más reciente que la cubra). */
export function politicaVigente<T extends { vigente_desde: string; vigente_hasta: string | null }>(politicas: T[], fecha: string): T | null {
  return (
    politicas
      .filter((p) => p.vigente_desde <= fecha && (!p.vigente_hasta || p.vigente_hasta >= fecha))
      .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0] ?? null
  );
}
