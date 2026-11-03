/**
 * Reglas del Plan Padrino (funciones puras, compartidas cliente/servidor).
 *
 * Fuente: Política de Bonificación Plan Padrino (v2, y la actualizada v3 del
 * 2026-11-03) y la spec work/Plan Padrino/Spec_Gestivo_Plan_Padrino.md. Las
 * consultas viven en datos.ts; aquí solo se decide con los hechos ya leídos,
 * para poder probarlo.
 *
 * Desde la v3 las reglas leen los PARÁMETROS de la versión de la política
 * (`politica.ts`): ventanas, listas, qué requisitos aplican y si bloquean.
 * Sin parámetros se usan los de la v2, que reproducen el comportamiento de
 * siempre.
 *
 * Decisiones tomadas el 2026-10-15 sobre las preguntas abiertas:
 *  - Q1: el mes de permanencia es mes calendario desde la fecha de ingreso.
 *  - Q2: en el esquema B el hito 1 se paga al cumplir el mes 1 aunque no
 *    llegue a 3; el hito 2 se causa a los 3 meses desde el ingreso.
 *  - Q3: no hay registro disciplinario general; P3 revisa descargos de
 *    ausentismo y correctivos de accidentes, y si no encuentra nada queda en
 *    "revisar" para que la coordinadora lo confirme.
 */
import { causaRetiro, causaLabel } from "@/lib/conductores/retiro";
import {
  CATALOGO_REQUISITOS,
  PARAMETROS_V2,
  requisito,
  type LetraEsquema,
  type Momento,
  type ParametrosPolitica,
} from "./politica";

export type Semaforo = "cumple" | "no_cumple" | "revisar";

export interface Requisito {
  codigo: string;
  titulo: string;
  estado: Semaforo;
  /** El dato que sustenta el resultado, en palabras. */
  dato: string;
  /** Un «no cumple» bloquea la aprobación (salvo excepción). Sin dato = sí (validaciones viejas). */
  bloquea?: boolean;
  /** `contratacion`: se verifica al contratar; no cuenta al decidir la elegibilidad. */
  momento?: Momento;
}

export interface Validacion {
  padrino: Requisito[];
  referido: Requisito[];
  /** Fecha (AAAA-MM-DD, Bogotá) en que se evaluó. */
  evaluadoEl: string;
  /** Versión de la política con que se evaluó (desde v3). */
  politica?: string;
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

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Meses calendario completos entre dos fechas (0 si `hasta` es anterior). */
export function mesesEntre(desde: string, hasta: string): number {
  let n = 0;
  while (n < 1200 && sumarMeses(desde, n + 1) <= hasta) n++;
  return n;
}

const fmtCorta = (f: string) => f.split("-").reverse().join("/");

/** Para comparar nombres de áreas y cargos: sin tildes, mayúsculas ni espacios de más. */
const normalizar = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

// ── Hechos que lee datos.ts ─────────────────────────────────────────────────

export interface HechosPadrino {
  cedula: string;
  conductor: { nombre: string; estado: string; tipo: string | null; fechaIngreso: string | null; fechaReingreso?: string | null } | null;
  empleado: { nombre: string; status: string; cargo: string | null; area: string | null; fechaIngreso?: string | null } | null;
  /**
   * El empleado está en padrino_empleados_autorizados. En v2 es la lista
   * blanca de empleados que pueden ser padrinos (decisión de Gestión Humana
   * del 2026-10-15: uno solo); en v3, la de excepciones a la exclusión de
   * áreas y cargos (el instructor de conducción).
   */
  empleadoAutorizado: boolean;
  /** Descargos o terminación no anulados (datos.ts los trae de la ventana más larga). */
  notificaciones: { nivel: string; fecha: string }[];
  /** Accidentes con correctivo (nivel I a IV), con la responsabilidad si se evaluó. */
  correctivos: { fecha: string; nivel: string; responsabilidad?: string | null }[];
}

export interface HechosReferido {
  cedula: string;
  /** Proceso de contratación del que sale el referido. */
  proceso: {
    id: string;
    fechaCreacion: string;
    simit: string | null;
    estado?: string | null;
    licencia?: string | null;
    antecedentes?: string | null;
    fechaExamenes?: string | null;
    fechaExamenesFase2?: string | null;
  };
  candidatoCreado: string | null;
  otrosProcesos: { id: string; estado: string; fechaCreacion: string }[];
  conductor: { estado: string; fechaIngreso: string | null; fechaRetiro: string | null; fechaReingreso?: string | null } | null;
  /** Etiqueta de la causa de retiro (para mostrar). */
  causaRetiro: string | null;
  /** Clave de la causa de retiro (`JUSTA_CAUSA`…), para la regla de reintegro. */
  causaRetiroClave?: string | null;
  notificaciones: { nivel: string; fecha: string }[];
  accidentes: { fecha: string }[];
  /** Bonificaciones del plan ya pagadas por esta cédula (en Gestivo o antes de él). */
  pagosPrevios?: { fuente: "gestivo" | "historico"; detalle: string }[];
  /** Certificado laboral validado por la coordinadora (null: sin validar). */
  experienciaCertificada?: boolean | null;
  /** Fecha de ingreso, si ya se contrató (para contar los meses fuera del reintegro). */
  fechaIngreso?: string | null;
}

/** Estados del proceso que cuentan como "en curso" (ver contratacion/constants). */
const EN_CURSO = new Set(["pendiente", "citado", "en_examenes", "en_examenes_fase2", "prueba_manejo", "en_escuela", "reconocimiento_ruta"]);

const TITULOS = Object.fromEntries(CATALOGO_REQUISITOS.map((r) => [r.codigo, r.titulo])) as Record<string, string>;

/** Arma el requisito con su configuración, o nada si la versión lo tiene apagado. */
function armador(p: ParametrosPolitica, out: Requisito[]) {
  return (codigo: string, estado: Semaforo, dato: string, titulo?: string) => {
    const cfg = requisito(p, codigo);
    if (!cfg.activo) return;
    out.push({ codigo, titulo: titulo ?? TITULOS[codigo] ?? codigo, estado, dato, bloquea: cfg.bloquea, momento: cfg.momento });
  };
}

const activo = (p: ParametrosPolitica, codigo: string) => requisito(p, codigo).activo;

// ── Padrino: P1 a P6 ────────────────────────────────────────────────────────

export function evaluarPadrino(h: HechosPadrino, hoy: string, p: ParametrosPolitica = PARAMETROS_V2): Requisito[] {
  const out: Requisito[] = [];
  const add = armador(p, out);
  const listaBlanca = p.padrino.modo_empleados === "lista_blanca";
  const conductorActivo = h.conductor?.estado === "ACTIVO";
  const empleadoActivo = h.empleado?.status === "activo" || h.empleado?.status === "periodo_prueba";
  const vinculo = h.empleado ? `${h.empleado.cargo ?? "sin cargo"} · área ${h.empleado.area ?? "sin área"}` : "";

  // P1 — contrato vigente (v2: «en el área operativa», con lista blanca de empleados).
  const tituloP1 = listaBlanca ? "Contrato vigente en el área operativa" : undefined;
  if (conductorActivo) {
    add("P1", "cumple", `Conductor ACTIVO${h.conductor!.tipo ? ` (${h.conductor!.tipo})` : ""}${h.conductor!.fechaIngreso ? ` desde ${fmtCorta(h.conductor!.fechaIngreso)}` : ""}.`, tituloP1);
  } else if (empleadoActivo) {
    if (listaBlanca) {
      add("P1", h.empleadoAutorizado ? "cumple" : "no_cumple", `Empleado activo: ${vinculo}. ${h.empleadoAutorizado ? "Autorizado como padrino." : "Solo los conductores y los empleados autorizados por Gestión Humana pueden ser padrinos."}`, tituloP1);
    } else {
      add("P1", "cumple", `Empleado ${h.empleado!.status === "periodo_prueba" ? "en periodo de prueba" : "activo"}: ${vinculo}.`);
    }
  } else {
    const donde = h.conductor ? `Conductor ${h.conductor.estado}` : h.empleado ? `Empleado ${h.empleado.status}` : "No aparece en conductores ni en empleados";
    add("P1", "no_cumple", `${donde}.`, tituloP1);
  }

  // P2 — no participa en la selección ni en la aprobación del ingreso.
  if (listaBlanca) {
    const tituloP2 = "No es administrativo ni interviene en selección, nómina, tesorería o auditoría";
    if (conductorActivo) add("P2", "cumple", "Es conductor.", tituloP2);
    else if (!h.empleado) add("P2", "revisar", "Sin datos de cargo.", tituloP2);
    else if (!h.empleadoAutorizado) add("P2", "no_cumple", `${vinculo}: empleado no autorizado como padrino.`, tituloP2);
    else add("P2", "cumple", `${vinculo}: autorizado por Gestión Humana.`, tituloP2);
  } else if (h.empleado && (empleadoActivo || !conductorActivo)) {
    const areas = new Set(p.padrino.excluidos.areas.map(normalizar));
    const cargos = new Set(p.padrino.excluidos.cargos.map(normalizar));
    const porArea = areas.has(normalizar(h.empleado.area));
    const porCargo = cargos.has(normalizar(h.empleado.cargo));
    if (!porArea && !porCargo) add("P2", "cumple", `${vinculo}: no está en las áreas ni cargos excluidos.`);
    else if (h.empleadoAutorizado) add("P2", "cumple", `${vinculo}: ${porArea ? "área" : "cargo"} excluido, pero autorizado como excepción por la gerencia.`);
    else add("P2", "no_cumple", `${vinculo}: ${porArea ? "el área" : "el cargo"} participa en la selección o en la aprobación del ingreso.`);
  } else if (conductorActivo) {
    add("P2", "cumple", "Es conductor.");
  } else {
    add("P2", "revisar", "Sin datos de cargo.");
  }

  // P3 (v2) — sin sanciones ni procesos disciplinarios en la ventana.
  if (activo(p, "P3")) {
    const meses = p.padrino.ventana_sanciones_meses;
    const titulo = `Sin sanciones ni procesos disciplinarios en los últimos ${meses} meses`;
    const desde = sumarMeses(hoy, -meses);
    const notif = h.notificaciones.filter((n) => n.fecha >= desde);
    const corr = h.correctivos.filter((c) => c.fecha >= desde);
    if (notif.length || corr.length) {
      const partes = [
        ...notif.map((n) => `${n.nivel === "terminacion" ? "Notificación de terminación" : "Descargos"} por ausentismo el ${fmtCorta(n.fecha)}`),
        ...corr.map((c) => `Correctivo nivel ${c.nivel} por accidente del ${fmtCorta(c.fecha)}`),
      ];
      add("P3", "no_cumple", `${partes.join("; ")}.`, titulo);
    } else {
      add("P3", "revisar", "Sin descargos de ausentismo ni correctivos por accidentes desde " + fmtCorta(desde) + ". Gestivo no tiene un registro disciplinario general: confírmelo con Gestión Humana.", titulo);
    }
  }

  // P4 — antigüedad mínima.
  if (activo(p, "P4")) {
    const minimo = p.padrino.antiguedad_minima_meses;
    const titulo = `Al menos ${minimo} meses de antigüedad en la empresa`;
    const inicio = conductorActivo
      ? (h.conductor!.fechaReingreso ?? h.conductor!.fechaIngreso)
      : empleadoActivo
        ? (h.empleado!.fechaIngreso ?? null)
        : null;
    if (!conductorActivo && !empleadoActivo) add("P4", "no_cumple", "Sin contrato vigente.", titulo);
    else if (!inicio) add("P4", "revisar", "Sin fecha de ingreso registrada: confírmela con Gestión Humana.", titulo);
    else {
      const cumple = sumarMeses(inicio, minimo);
      add("P4", cumple <= hoy ? "cumple" : "no_cumple", `Ingresó el ${fmtCorta(inicio)}${cumple <= hoy ? "" : `; cumple ${minimo} meses el ${fmtCorta(cumple)}`}.`, titulo);
    }
  }

  // P5 y P6 — proceso disciplinario abierto y faltas graves en la ventana.
  const meses = p.padrino.ventana_faltas_graves_meses;
  const desde = sumarMeses(hoy, -meses);
  if (activo(p, "P5")) {
    const notif = h.notificaciones.filter((n) => n.fecha >= desde).sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (notif.length) {
      add("P5", "revisar", `${notif.length} notificación(es) de ${notif[0].nivel === "terminacion" ? "terminación" : "descargos"} por ausentismo; la última el ${fmtCorta(notif[0].fecha)}. Gestivo no registra el cierre del proceso: confirme con Gestión Humana si sigue abierto.`);
    } else {
      add("P5", "cumple", `Sin descargos de ausentismo desde ${fmtCorta(desde)}.`);
    }
  }
  if (activo(p, "P6")) {
    const titulo = `Sin faltas graves en los últimos ${meses} meses`;
    const resp = new Set(p.padrino.accidente_grave.responsabilidad);
    const niveles = new Set(p.padrino.accidente_grave.niveles);
    const graves = h.correctivos.filter((c) => c.fecha >= desde && niveles.has(c.nivel) && resp.has(c.responsabilidad ?? ""));
    if (graves.length) {
      add("P6", "no_cumple", graves.map((c) => `Accidente grave con responsabilidad ${c.responsabilidad} (correctivo nivel ${c.nivel}) del ${fmtCorta(c.fecha)}`).join("; ") + ".", titulo);
    } else if (p.padrino.revisar_faltas_sin_fuente) {
      add("P6", "revisar", `Sin accidentes graves con responsabilidad desde ${fmtCorta(desde)}. Gestivo no registra conducir bajo efectos del alcohol o sustancias ni fraude en el recaudo: confírmelo con Gestión Humana.`, titulo);
    } else {
      add("P6", "cumple", `Sin accidentes graves con responsabilidad desde ${fmtCorta(desde)}.`, titulo);
    }
  }
  return out;
}

// ── Esquema según el tipo de referido ───────────────────────────────────────

export interface DecisionEsquema {
  esquema: LetraEsquema;
  tipoIngreso: "nuevo" | "reintegro";
  /** Meses completos fuera de la empresa (solo reintegros). */
  mesesFuera: number | null;
  /** Si no da derecho a bonificación, por qué (no se crean hitos). */
  sinBonificacion: string | null;
  /** Si hay que confirmar algo para sostener el esquema. */
  revisar: string | null;
  /** Explicación para mostrar. */
  dato: string;
}

/**
 * Esquema que le corresponde al referido según la versión de la política.
 * `fechaReferencia` es la del ingreso si ya se contrató; si no, la del
 * proceso. Con la v2 (sin reglas de reintegro) es A o B por el certificado,
 * igual que siempre.
 */
export function decidirEsquema(
  h: Pick<HechosReferido, "conductor" | "causaRetiro" | "causaRetiroClave" | "experienciaCertificada">,
  fechaReferencia: string,
  p: ParametrosPolitica = PARAMETROS_V2
): DecisionEsquema {
  const certificado = h.experienciaCertificada === true;
  const nuevo = (): LetraEsquema => (certificado && p.esquemas.A ? "A" : p.esquemas.B ? "B" : "A");
  const c = h.conductor;
  const esReintegro = Boolean(c && c.estado !== "ACTIVO" && c.fechaRetiro && c.fechaRetiro < fechaReferencia);
  const mesesFuera = esReintegro ? mesesEntre(c!.fechaRetiro!, fechaReferencia) : null;
  const reglas = p.referido.reintegro;

  if (!esReintegro || !reglas.activo) {
    const e = nuevo();
    return {
      esquema: e,
      tipoIngreso: esReintegro ? "reintegro" : "nuevo",
      mesesFuera,
      sinBonificacion: null,
      revisar: null,
      dato: `${esReintegro ? `Reintegro (${mesesFuera} meses fuera)` : "Ingreso nuevo"}: esquema ${e}${e === "A" ? " por certificado validado" : ""}.`,
    };
  }

  const fuera = `Reintegro: se retiró el ${fmtCorta(c!.fechaRetiro!)} (${mesesFuera} meses fuera)`;
  if (!p.esquemas.C) {
    return { esquema: "C", tipoIngreso: "reintegro", mesesFuera, sinBonificacion: "Esta versión de la política no tiene esquema de reintegro.", revisar: null, dato: `${fuera}. Esta versión no paga reintegros.` };
  }
  if (mesesFuera! < reglas.meses_minimos_fuera) {
    const motivo = `Reintegro con menos de ${reglas.meses_minimos_fuera} meses por fuera: no da derecho a bonificación.`;
    return { esquema: "C", tipoIngreso: "reintegro", mesesFuera, sinBonificacion: motivo, revisar: null, dato: `${fuera}. ${motivo}` };
  }
  const clave = h.causaRetiroClave ?? null;
  const causa = causaRetiro(clave);
  if (!clave) {
    return { esquema: "C", tipoIngreso: "reintegro", mesesFuera, sinBonificacion: null, revisar: "Sin causa de retiro registrada: confirme con Gestión Humana que el retiro fue voluntario.", dato: `${fuera}, sin causa de retiro registrada. Esquema C si el retiro fue voluntario.` };
  }
  const excluida = reglas.causas_que_excluyen.includes(clave) || (causa !== null && !reglas.tipos_causa_permitidos.includes(causa.tipo));
  if (excluida) {
    const motivo = `El retiro anterior fue por «${causaLabel(clave)}»: un reintegro solo se bonifica si el retiro fue voluntario.`;
    return { esquema: "C", tipoIngreso: "reintegro", mesesFuera, sinBonificacion: motivo, revisar: null, dato: `${fuera}. ${motivo}` };
  }
  return {
    esquema: "C",
    tipoIngreso: "reintegro",
    mesesFuera,
    sinBonificacion: null,
    revisar: causa ? null : `Causa de retiro «${clave}» fuera del catálogo: confirme que fue voluntario.`,
    dato: `${fuera}, retiro «${causaLabel(clave)}»: esquema C${reglas.nunca_esquema.includes("A") ? " (un reintegro nunca va por el A)" : ""}.`,
  };
}

// ── Referido: R1 a R12 ──────────────────────────────────────────────────────

export function evaluarReferido(h: HechosReferido, p: ParametrosPolitica = PARAMETROS_V2): Requisito[] {
  const out: Requisito[] = [];
  const add = armador(p, out);
  const inicioProceso = h.proceso.fechaCreacion;

  // R1 — sin procesos disciplinarios o laborales con la compañía.
  if (h.notificaciones.length) {
    add("R1", "no_cumple", `${h.notificaciones.length} notificación(es) de ausentismo; la última el ${fmtCorta(h.notificaciones.map((n) => n.fecha).sort().at(-1)!)}.`);
  } else if (h.conductor && h.conductor.estado !== "ACTIVO") {
    add("R1", "revisar", `Trabajó antes como conductor${h.conductor.fechaRetiro ? ` (retiro ${fmtCorta(h.conductor.fechaRetiro)})` : ""}${h.causaRetiro ? `; causa de retiro: ${h.causaRetiro}` : "; sin causa de retiro registrada"}.`);
  } else {
    add("R1", "cumple", "Sin notificaciones de ausentismo ni vinculación anterior como conductor.");
  }

  // R2 — sin hoja de vida en la base de selección en la ventana.
  const mesesHv = p.referido.ventana_hoja_vida_meses;
  const tituloR2 = `Sin hoja de vida en selección en los ${mesesHv} meses anteriores`;
  const desdeHv = sumarMeses(inicioProceso, -mesesHv);
  const previos = h.otrosProcesos.filter((o) => o.fechaCreacion >= desdeHv && o.fechaCreacion <= inicioProceso).sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion));
  const candidatoAntes = h.candidatoCreado && h.candidatoCreado >= desdeHv && h.candidatoCreado < sumarMeses(inicioProceso, -1);
  if (previos.length) {
    add("R2", "no_cumple", `Otro proceso de contratación creado el ${fmtCorta(previos[0].fechaCreacion)}.`, tituloR2);
  } else if (candidatoAntes) {
    add("R2", "revisar", `La hoja de vida entró a la base el ${fmtCorta(h.candidatoCreado!)}, más de un mes antes de este proceso: confirme si es la misma postulación.`, tituloR2);
  } else {
    add("R2", "cumple", `Sin procesos ni hoja de vida anteriores desde ${fmtCorta(desdeHv)}.`, tituloR2);
  }

  // R3 — no estar en otro proceso de selección en curso.
  const abiertos = h.otrosProcesos.filter((o) => EN_CURSO.has(o.estado));
  if (abiertos.length) add("R3", "no_cumple", `Tiene ${abiertos.length} proceso(s) en curso además de este (creado el ${fmtCorta(abiertos[0].fechaCreacion)}).`);
  else add("R3", "cumple", "Solo tiene este proceso abierto.");

  // R4 (v2) — no haber sido contratado antes sin cumplir 1 mes de permanencia.
  const c = h.conductor;
  if (c?.fechaIngreso && c.fechaRetiro && c.fechaRetiro < sumarMeses(c.fechaIngreso, 1)) {
    add("R4", "no_cumple", `Ingresó el ${fmtCorta(c.fechaIngreso)} y se retiró el ${fmtCorta(c.fechaRetiro)}.`);
  } else if (c?.fechaReingreso) {
    add("R4", "revisar", `GEMA registra un reingreso el ${fmtCorta(c.fechaReingreso)}: hubo más de una vinculación y Gestivo solo ve la última; confirme con Gestión Humana que ninguna anterior terminó antes del mes.`);
  } else if (c?.estado === "ACTIVO" && c.fechaIngreso && c.fechaIngreso < inicioProceso) {
    add("R4", "revisar", `Ya figura como conductor ACTIVO desde ${fmtCorta(c.fechaIngreso)}, antes de este proceso.`);
  } else {
    add("R4", "cumple", c ? `Contratación anterior: ingreso ${c.fechaIngreso ? fmtCorta(c.fechaIngreso) : "sin fecha"}${c.fechaRetiro ? `, retiro ${fmtCorta(c.fechaRetiro)}` : ""}.` : "Sin contrataciones anteriores como conductor.");
  }

  // R5 (v2) — sin accidentes de tránsito en periodos anteriores.
  if (h.accidentes.length) {
    add("R5", "no_cumple", `${h.accidentes.length} accidente(s) con la empresa; el último el ${fmtCorta(h.accidentes.map((a) => a.fecha).sort().at(-1)!)}.`);
  } else if (h.proceso.simit === "deuda" || h.proceso.simit === "acuerdo_pago" || !h.proceso.simit || h.proceso.simit === "pendiente") {
    add("R5", "revisar", `Sin accidentes con la empresa. SIMIT del proceso: ${h.proceso.simit === "deuda" ? "con deuda" : h.proceso.simit === "acuerdo_pago" ? "acuerdo de pago" : "sin verificar"}; revise si hay accidentes con otras empresas.`);
  } else {
    add("R5", "cumple", "Sin accidentes con la empresa y SIMIT sin deuda. Solo cubre accidentes con La Carolina.");
  }

  // R6 — licencia en la categoría del vehículo.
  if (activo(p, "R6")) {
    const cats = p.referido.categorias_licencia;
    const titulo = `Licencia de conducción ${cats.join(" o ")}`;
    const lic = normalizar(h.proceso.licencia);
    if (!lic) add("R6", "revisar", "El proceso no tiene registrada la categoría de la licencia.", titulo);
    else if (cats.map(normalizar).includes(lic)) add("R6", "cumple", `Categoría ${h.proceso.licencia} registrada en el proceso. La vigencia se verifica en el RUNT.`, titulo);
    else add("R6", "no_cumple", `Categoría ${h.proceso.licencia}: se requiere ${cats.join(" o ")}.`, titulo);
  }

  // R7 — antecedentes judiciales, disciplinarios y fiscales.
  if (activo(p, "R7")) {
    const a = h.proceso.antecedentes;
    if (a === "ok") add("R7", "cumple", "Antecedentes verificados sin anotaciones en el proceso.");
    else if (a === "con_antecedentes") add("R7", "no_cumple", "El proceso registra antecedentes con anotaciones.");
    else add("R7", "revisar", "Antecedentes pendientes de verificar en el proceso.");
  }

  // R8 — examen médico ocupacional y psicosensométrica.
  if (activo(p, "R8")) {
    const f1 = h.proceso.fechaExamenes;
    const f2 = h.proceso.fechaExamenesFase2;
    if (f1 && f2) add("R8", "cumple", `Exámenes del ${fmtCorta(f1)} y del ${fmtCorta(f2)} registrados en el proceso.`);
    else add("R8", "revisar", `Falta${!f1 && !f2 ? "n las dos fases de exámenes" : !f1 ? " la primera fase de exámenes" : " la segunda fase de exámenes"} en el proceso.`);
  }

  // R9 — inducción y capacitación PESV: el proceso ya pasó la escuela.
  if (activo(p, "R9")) {
    const e = h.proceso.estado ?? "";
    if (e === "reconocimiento_ruta" || e === "contratado") add("R9", "cumple", "El proceso ya pasó la escuela (inducción y PESV).");
    else add("R9", "revisar", e === "en_escuela" ? "El candidato está en la escuela: inducción y PESV en curso." : "El candidato todavía no llega a la escuela (inducción y PESV).");
  }

  // R10 — certificados laborales (solo esquema A).
  const esquema = decidirEsquema(h, h.fechaIngreso ?? inicioProceso, p);
  if (activo(p, "R10")) {
    if (esquema.tipoIngreso === "reintegro" && p.referido.reintegro.activo) add("R10", "cumple", "Reintegro: no aplica (un reintegro nunca va por el esquema A).");
    else if (h.experienciaCertificada === true) add("R10", "cumple", "Certificado validado por la coordinadora: esquema A.");
    else if (h.experienciaCertificada === false) add("R10", "no_cumple", "Certificado no válido: se paga por el esquema B.");
    else add("R10", "revisar", "Sin certificado validado: se paga por el esquema B salvo que se valide uno.");
  }

  // R11 — una sola bonificación por cédula en la historia.
  if (activo(p, "R11")) {
    const previos = h.pagosPrevios ?? [];
    if (previos.length) add("R11", "no_cumple", `Ya se pagó bonificación por esta cédula: ${previos.map((x) => x.detalle).join("; ")}.`);
    else add("R11", "cumple", "Sin bonificaciones del plan pagadas antes por esta cédula (Gestivo e histórico cargado).");
  }

  // R12 — tipo de ingreso y reglas de reintegro.
  if (activo(p, "R12")) {
    add("R12", esquema.sinBonificacion ? "no_cumple" : esquema.revisar ? "revisar" : "cumple", esquema.dato);
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

/**
 * Lo que pesa al decidir la elegibilidad: los requisitos que se verifican al
 * contratar no cuentan todavía; un «no cumple» que no bloquea solo pide
 * observación, igual que un «revisar».
 */
export function resumenDecision(v: Validacion | null | undefined) {
  const cuentan = [...(v?.padrino ?? []), ...(v?.referido ?? [])].filter((r) => (r.momento ?? "registro") === "registro");
  return {
    bloqueantes: cuentan.filter((r) => r.estado === "no_cumple" && r.bloquea !== false).length,
    observar: cuentan.filter((r) => r.estado === "revisar" || (r.estado === "no_cumple" && r.bloquea === false)).length,
  };
}

/** Requisitos que bloquean y no se cumplen (para la verificación al contratar). */
export const bloqueantesNoCumplidos = (rs: Requisito[]) => rs.filter((r) => r.estado === "no_cumple" && r.bloquea !== false);

/** El padrino debe estar activo para registrar (RQ-01): P1, y en v3 también P2, distintos de "no cumple". */
export function padrinoPuedeRegistrar(padrino: Requisito[]): string | null {
  for (const codigo of ["P1", "P2"]) {
    const r = padrino.find((x) => x.codigo === codigo);
    if (r?.estado === "no_cumple" && r.bloquea !== false) return `El padrino no puede registrar referidos: ${r.dato}`;
  }
  return null;
}

/**
 * Error de la decisión de elegibilidad, o null si procede. Un "no cumple"
 * que bloquea impide aprobar salvo excepción con observación; cualquier otro
 * "no cumple" o "revisar" exige observación al aprobar.
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
  const r = resumenDecision(v);
  if (r.bloqueantes && !excepcion) return `Hay ${r.bloqueantes} requisito(s) que no se cumplen: solo se puede aprobar como excepción documentada.`;
  if ((r.bloqueantes || r.observar) && !obs) return "Escriba la observación: hay requisitos que no se cumplen o que requieren revisión.";
  return null;
}

/** Estados en que todavía se decide la elegibilidad. */
export const ESTADOS_DECISION: string[] = ["registrado", "en_validacion"];
/** Estados en que el esquema todavía se puede cambiar (antes de crear hitos). */
export const ESTADOS_CAMBIO_ESQUEMA: string[] = ["registrado", "en_validacion", "elegible", "contratado"];
/** Estados en que el referido sigue vivo (se puede anular o cerrar). */
export const ESTADOS_ABIERTOS: string[] = ["registrado", "en_validacion", "elegible", "contratado", "en_seguimiento"];

/** Esquema según el certificado validado por la coordinadora (v2; desde v3 use `decidirEsquema`). */
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
/** Forma de la columna `padrino_politicas.esquemas` (v2). Desde v3 manda `parametros`. */
export type EsquemasPolitica = Partial<Record<LetraEsquema, EsquemaPolitica>> & Record<"A" | "B", EsquemaPolitica>;

/** Hitos del esquema con su fecha de causación (ingreso + N meses calendario). */
export function hitosProyectados(esquemas: EsquemasPolitica, esquema: LetraEsquema, fechaIngreso: string | null) {
  return (esquemas[esquema]?.hitos ?? []).map((h) => ({
    ...h,
    fechaCausacion: fechaIngreso ? sumarMeses(fechaIngreso, h.meses) : null,
  }));
}

export const totalEsquema = (e: EsquemaPolitica | undefined) => (e?.hitos ?? []).reduce((s, h) => s + h.valor, 0);

/** Una fila de hito por beneficiario con pago mayor que cero (desde los parámetros). */
export interface HitoBeneficiario {
  numero: number;
  meses: number;
  descripcion: string;
  beneficiario: "padrino" | "referido";
  valor: number;
  requiere_desempeno: boolean;
  fechaCausacion: string | null;
}

export function hitosPorBeneficiario(p: ParametrosPolitica, esquema: LetraEsquema, fechaIngreso: string | null): HitoBeneficiario[] {
  const out: HitoBeneficiario[] = [];
  for (const h of p.esquemas[esquema]?.hitos ?? []) {
    for (const beneficiario of ["padrino", "referido"] as const) {
      const valor = h.pagos[beneficiario];
      if (valor <= 0) continue;
      out.push({
        numero: h.numero,
        meses: h.meses,
        descripcion: h.descripcion,
        beneficiario,
        valor,
        requiere_desempeno: h.requiere_desempeno,
        fechaCausacion: fechaIngreso ? sumarMeses(fechaIngreso, h.meses) : null,
      });
    }
  }
  return out;
}

/** Versión vigente en una fecha (la de inicio más reciente que la cubra). Recibe solo versiones publicadas. */
export function politicaVigente<T extends { vigente_desde: string | null; vigente_hasta: string | null }>(politicas: T[], fecha: string): T | null {
  return (
    politicas
      .filter((p): p is T & { vigente_desde: string } => Boolean(p.vigente_desde) && p.vigente_desde! <= fecha && (!p.vigente_hasta || p.vigente_hasta >= fecha))
      .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0] ?? null
  );
}
