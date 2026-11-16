/**
 * Simulación del flujo de selección sin WhatsApp ni base de datos: lo que
 * haría Gestivo con una conversación (semáforo, proceso, «Listo para citar»,
 * reactivación) y la revisión de un caso de prueba contra lo esperado.
 * Funciones puras: las usan el chat de prueba y el evaluador automático.
 */
import type { ResultadoPreseleccionGuardado } from "@/lib/contratacion/constants";
import { normalizarTexto, evaluarPreseleccion, type ReglasPreseleccion } from "./preseleccion";
import { prefiltroCompleto, type DatosPrefiltro } from "./extraccion";
import { accionReactivacion, type AccionReactivacion, type TiemposReactivacion } from "./reactivacion";
import { PATRON_AUTORIZACION, PROHIBIDO_GENERAL, type CasoPrueba } from "./evaluacion/casos";

export interface MensajeSimulado {
  direccion: "entrante" | "saliente";
  contenido: string;
  mediaTipo: string | null;
}

export interface TransferenciaSimulada {
  /** Número del turno del aspirante (desde 1) en que pasaría a una persona. */
  turno: number;
  motivo: "frase" | "marca" | "rechazo" | "vacio";
}

export interface ResultadoConversacion {
  mensajes: MensajeSimulado[];
  transferencia: TransferenciaSimulada | null;
  extraido: DatosPrefiltro | null;
  preseleccion: ResultadoPreseleccionGuardado | null;
  tokensEntrada: number;
  tokensSalida: number;
  /** Milisegundos de cada respuesta del asistente. */
  latencias: number[];
  modelos: string[];
  error?: string;
}

/** Semáforo con lo extraído y un SIMIT simulado (null = sin consultar). */
export function simularPreseleccion(
  d: DatosPrefiltro | null,
  simit: number | null,
  reglas: ReglasPreseleccion,
  ahora: Date = new Date()
): ResultadoPreseleccionGuardado {
  return evaluarPreseleccion(
    {
      edad: d?.edad ?? null,
      ciudad: d?.ciudad ?? null,
      dispuestoTraslado: d?.dispuesto_traslado ?? null,
      licencia: d?.licencia ?? null,
      licenciaVerificada: false,
      simitEstado: simit == null ? null : simit > 0 ? "deuda" : "ok",
      simitValor: simit,
      simitVerificado: simit != null,
      experienciaMeses: d?.experiencia_meses ?? null,
    },
    reglas,
    ahora
  );
}

export interface ProcesoExistente {
  id: string;
  estado: string;
  causa_no_contrato: string | null;
  fecha_creacion: string;
}

export interface QueHariaGestivo {
  proceso: "crear" | "completar" | "esperar_cedula" | "ninguno";
  explicacion: string;
  /** Estado en que quedaría el proceso. */
  estado: "pendiente" | "antecedentes" | null;
  listoParaCitar: boolean;
  /** Cierre que se propondría a GH. */
  cierrePropuesto: string | null;
  consultariaSimit: boolean;
  eventos: string[];
}

/** Lo que haría Gestivo con lo que se sabe de la conversación. */
export function queHariaGestivo(p: {
  datos: DatosPrefiltro | null;
  preseleccion: ResultadoPreseleccionGuardado | null;
  abierto: ProcesoExistente | null;
  transferencia: TransferenciaSimulada | null;
}): QueHariaGestivo {
  const d = p.datos;
  const eventos: string[] = [];
  if (!d) {
    return { proceso: "ninguno", explicacion: "Todavía no hay datos del aspirante.", estado: null, listoParaCitar: false, cierrePropuesto: null, consultariaSimit: false, eventos };
  }
  if (!d.busca_trabajo) {
    return {
      proceso: "ninguno",
      explicacion: "Quien escribe no busca trabajo: no se crea proceso.",
      estado: null,
      listoParaCitar: false,
      cierrePropuesto: null,
      consultariaSimit: false,
      eventos,
    };
  }
  let proceso: QueHariaGestivo["proceso"];
  let explicacion: string;
  if (p.abierto) {
    proceso = "completar";
    explicacion = `Ya hay un proceso abierto con esa cédula o celular (en «${p.abierto.estado}»): se completa, no se duplica.`;
  } else if (d.cedula && d.nombre) {
    proceso = "crear";
    explicacion = "Se crearía un proceso nuevo en Preselección, enlazado a la conversación.";
    eventos.push("Creó el proceso (asistente)");
  } else {
    proceso = "esperar_cedula";
    explicacion = "Los datos se guardan en la conversación; el proceso se crea cuando haya nombre y cédula.";
  }
  if (d.autorizacion) eventos.push(d.autorizacion === "si" ? "Autorizó el tratamiento de datos" : "No autorizó el tratamiento de datos");

  const pre = p.preseleccion;
  const pasa = pre?.global === "pasa" && d.autorizacion === "si";
  if (pre) eventos.push(pre.global === "pasa" ? "Preselección: cumple los 4" : pre.global === "no_cumple" ? "Preselección: no cumple" : "Preselección: faltan datos");
  if (pasa) eventos.push("Preselección → Antecedentes (sistema)");
  const listo = prefiltroCompleto(d) && d.autorizacion === "si" && pre?.global !== "no_cumple" && !p.transferencia;
  if (listo) eventos.push("Chat marcado «Listo para citar»");

  return {
    proceso,
    explicacion,
    estado: proceso === "esperar_cedula" ? null : pasa ? "antecedentes" : "pendiente",
    listoParaCitar: listo,
    cierrePropuesto: pre?.global === "no_cumple" ? pre.incumplido : null,
    consultariaSimit:
      d.autorizacion === "si" && !!d.cedula && !!pre && pre.edad.color !== "rojo" && pre.residencia.color !== "rojo" && pre.licencia.color !== "rojo",
    eventos,
  };
}

/** Reactivación tras un silencio simulado de `horas` desde el último mensaje del asistente. */
export function simularSilencio(p: {
  horas: number;
  ahora: Date;
  tiempos: TiemposReactivacion;
  hojaVida: boolean;
  buscaTrabajo: boolean;
  procesoEstado: string | null;
}): { pasos: { horas: number; accion: Exclude<AccionReactivacion, null | "reiniciar"> }[] } {
  // Se recorre el tiempo hora por hora aplicando las reglas, como lo haría el cron.
  const pasos: { horas: number; accion: Exclude<AccionReactivacion, null | "reiniciar"> }[] = [];
  const inicio = p.ahora.getTime() - p.horas * 3_600_000;
  const ultimoMensaje = new Date(inicio).toISOString();
  const ultimoEntrante = new Date(inicio - 60_000).toISOString();
  let paso = 0;
  let ultimoPasoAt: string | null = null;
  for (let h = 0; h <= p.horas; h += 0.25) {
    const ahora = new Date(inicio + h * 3_600_000);
    const accion = accionReactivacion(
      {
        ultimoMensajeAt: ultimoPasoAt ?? ultimoMensaje,
        ultimoEntranteAt: ultimoEntrante,
        ultimoEsNuestro: true,
        cerrada: false,
        paso,
        ultimoPasoAt,
        hojaVidaRecibida: p.hojaVida,
        procesoEstado: p.procesoEstado,
        buscaTrabajo: p.buscaTrabajo,
        esAspirante: true,
      },
      ahora,
      p.tiempos
    );
    if (accion && accion !== "reiniciar") {
      pasos.push({ horas: Math.round(h * 4) / 4, accion });
      paso = accion === "aviso1" ? 1 : accion === "aviso2" ? 2 : accion === "llamar" ? 3 : 4;
      ultimoPasoAt = ahora.toISOString();
      if (paso === 4) break;
    }
  }
  return { pasos };
}

// ── Revisión de un caso de prueba ────────────────────────────────────────────

export interface ChequeoCaso {
  ok: boolean;
  detalle: string;
}

const textoIgual = (a: string, b: string) => normalizarTexto(a).includes(normalizarTexto(b));

/** Compara lo que pasó en la conversación con lo esperado del caso. */
export function revisarCaso(caso: CasoPrueba, r: ResultadoConversacion): { ok: boolean; chequeos: ChequeoCaso[] } {
  const e = caso.esperado;
  const chequeos: ChequeoCaso[] = [];
  const respuestas = r.mensajes.filter((m) => m.direccion === "saliente").map((m) => m.contenido);
  const todo = respuestas.join("\n");

  if (r.error) chequeos.push({ ok: false, detalle: `Error: ${r.error}` });

  const transfiere = !!e.transfiere;
  const permitida = !!r.transferencia && !!e.transfierePermitidaDesde && r.transferencia.turno >= e.transfierePermitidaDesde;
  chequeos.push({
    ok: transfiere === !!r.transferencia || permitida,
    detalle: transfiere
      ? r.transferencia ? "Pasó a una persona, como se esperaba" : "Debía pasar a una persona y no lo hizo"
      : r.transferencia ? `Pasó a una persona sin motivo (turno ${r.transferencia.turno}, ${r.transferencia.motivo})` : "No pasó a una persona",
  });

  for (const p of [...PROHIBIDO_GENERAL, ...(e.prohibido ?? [])]) {
    const hallado = respuestas.find((t) => p.patron.test(t));
    chequeos.push({ ok: !hallado, detalle: hallado ? `Prohibido: ${p.detalle} — «${hallado.slice(0, 90)}»` : `Sin «${p.detalle}»` });
  }
  for (const p of e.requerido ?? []) {
    chequeos.push({ ok: p.patron.test(todo), detalle: p.patron.test(todo) ? `Cumplió: ${p.detalle}` : `Faltó: ${p.detalle}` });
  }
  if (e.pideAutorizacion) {
    const ok = PATRON_AUTORIZACION.patron.test(todo);
    chequeos.push({ ok, detalle: ok ? "Pidió la autorización de datos" : "No pidió la autorización de datos" });
  }
  if (e.noPideAutorizacion) {
    const ok = !PATRON_AUTORIZACION.patron.test(todo);
    chequeos.push({ ok, detalle: ok ? "No pidió la autorización (correcto)" : "Pidió la autorización cuando no debía" });
  }

  const d = r.extraido;
  if (e.datos) {
    if (!d) chequeos.push({ ok: false, detalle: "La extracción no devolvió datos" });
    else {
      for (const [k, esperado] of Object.entries(e.datos)) {
        const real = (d as unknown as Record<string, unknown>)[k];
        const ok =
          typeof esperado === "string" && typeof real === "string" ? textoIgual(real, esperado) : real === esperado;
        chequeos.push({ ok, detalle: `${k}: ${ok ? "bien" : `esperado ${String(esperado)}, extraído ${String(real ?? "—")}`}` });
      }
    }
  }
  if (e.autorizacion !== undefined) {
    const real = d?.autorizacion ?? null;
    chequeos.push({ ok: real === e.autorizacion, detalle: `autorización: ${real === e.autorizacion ? "bien" : `esperado ${e.autorizacion}, extraído ${real}`}` });
  }
  if (e.buscaTrabajo !== undefined) {
    const real = d?.busca_trabajo ?? true;
    chequeos.push({ ok: real === e.buscaTrabajo, detalle: `busca trabajo: ${real === e.buscaTrabajo ? "bien" : `esperado ${e.buscaTrabajo}`}` });
  }
  if (e.global) {
    const real = r.preseleccion?.global ?? null;
    chequeos.push({ ok: real === e.global, detalle: `semáforo: ${real === e.global ? "bien" : `esperado ${e.global}, resultó ${real ?? "—"}`}` });
  }
  if (e.incumplido !== undefined) {
    const real = r.preseleccion?.incumplido ?? null;
    chequeos.push({ ok: real === e.incumplido, detalle: `requisito incumplido: ${real === e.incumplido ? "bien" : `esperado ${e.incumplido}, resultó ${real ?? "—"}`}` });
  }
  return { ok: chequeos.every((c) => c.ok), chequeos };
}
