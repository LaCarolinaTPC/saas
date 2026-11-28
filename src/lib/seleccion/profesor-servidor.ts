/**
 * Lo que registra el profesor de manejo (entrega 2, E1 y E2): la prueba de
 * manejo, las clases de escuela (las que hagan falta), las salidas de
 * reconocimiento de ruta, observaciones sueltas y su concepto final.
 *
 * Los cierres de aquí son decisiones del profesor (una persona), nunca
 * automáticos. Con candidatos del chat de prueba no sale nada por WhatsApp:
 * el texto del mensaje se devuelve para mostrarlo en el chat de prueba.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { cambiarEstadoProceso, registrarEvento, type ActorProceso } from "@/lib/contratacion/servidor";
import { fechaBogota } from "@/lib/tesoreria/recobros";
import { horaBogota } from "@/lib/comunicaciones/seguimiento";
import { fechaEnTexto, horaDelDia, rutasAprendidas, siguienteDiaHabil, validarFechaElegida, type ExcepcionProfesor } from "./agenda";
import { motivoNoAtiende } from "./laboratorios";
import {
  avisarProceso,
  cancelarReconocimientos,
  reconocimientoDeHoy,
  citaVigenteDeProceso,
  citasDelDia,
  crearCitaSimple,
  leerAjustesAgenda,
  leerDisponibilidad,
  marcarLlegada,
  type CitaDelDia,
  type EnvioAgenda,
} from "./agenda-servidor";
import {
  asegurarLaboratorio,
  asignarLaboratorio,
  enviarOrdenAlCitar,
  laboratorioFechaProfesor,
  laboratorioPorId,
  laboratorioQueLeToca,
  leerLaboratorios,
  planFase1,
} from "./laboratorios-servidor";
import { avanceRutas, obligatoriasDe } from "./rutas";
import { leerRutasReconocimiento, rutasObligatorias } from "./rutas-servidor";
import { marcarBancoPreguntado, mensajeFase1PreguntaBanco } from "./respuestas-examenes-servidor";
import { revisarListoContratar } from "./listo-contratar-revisar";

export type ResultadoPrueba = "aprobo" | "escuela" | "no_continua";
export type ResultadoClase = "sigue" | "listo" | "no_continua";
export type ResultadoRuta = "aprendida" | "repetir" | "no_continua";
export type SiNoSinTomar = "si" | "no" | "sin_tomar";

export interface ResultadoProfesor {
  ok: boolean;
  error?: string;
  /** Mensaje que salió (o saldría, en el chat de prueba) para el aspirante. */
  texto?: string;
  envio?: EnvioAgenda;
  claveMensaje?: string;
  /** Con esta salida completó las rutas mínimas. */
  rutasCompletas?: boolean;
  /** Documentos que se le enviaron (o se le enviarían, en el chat de prueba) al aspirante: orden y carta del banco. */
  documentos?: string[];
  /** Quedó guardado «pasa a exámenes» y falta pulsar «Listo para exámenes» (23-nov-2026). */
  porEnviarExamenes?: boolean;
}

const CAUSA_PRUEBA = "No pasó prueba de manejo";
const CAUSA_RUTA = "No pasó reconocimiento de ruta";
const CAUSA_CONCEPTO = "No aceptado por el profesor";

const texto = (v: unknown, max = 1000) => String(v ?? "").trim().slice(0, max) || null;
const hoy = () => fechaBogota(new Date().toISOString());

async function procesoAbierto(procesoId: string): Promise<{ id: string; estado: string; origen: string | null; reingreso: boolean | null } | string> {
  const { data } = await createAdminClient().from("procesos_contratacion").select("id, estado, origen, reingreso").eq("id", procesoId).maybeSingle();
  if (!data) return "El proceso no existe.";
  if (data.estado === "contratado" || data.estado === "cierre") return "El proceso ya está cerrado o contratado.";
  return data as { id: string; estado: string; origen: string | null; reingreso: boolean | null };
}

const firma = (actor: ActorProceso) => ({ profesor_id: actor.userId, profesor_email: actor.userEmail });

const ESTADOS_PRUEBA = ["citado", "prueba_manejo", "antecedentes", "pendiente"];

/**
 * ¿Quedó guardado «pasa a exámenes» sin enviar todavía? (23-nov-2026: el
 * profesor guarda la prueba o la clase y, en otro paso, pulsa «Listo para
 * exámenes», que es lo que cita y envía.) «prueba»: la última prueba es
 * «aprobó» y después no cambió de etapa; «escuela»: sigue en escuela y la
 * última clase es «listo».
 */
async function pendienteDeExamenes(procesoId: string, estado: string): Promise<"prueba" | "escuela" | null> {
  const db = createAdminClient();
  if (estado === "en_escuela") {
    const { data } = await db.from("seleccion_clases_escuela").select("resultado").eq("proceso_id", procesoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data?.resultado === "listo" ? "escuela" : null;
  }
  if (!ESTADOS_PRUEBA.includes(estado)) return null;
  const { data: pr } = await db.from("seleccion_pruebas_manejo").select("resultado, created_at").eq("proceso_id", procesoId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (pr?.resultado !== "aprobo") return null;
  // Una prueba de un ciclo anterior (el proceso pasó a exámenes, se cerró y se reabrió) no cuenta.
  const { count } = await db
    .from("procesos_contratacion_eventos")
    .select("id", { count: "exact", head: true })
    .eq("proceso_id", procesoId)
    .in("estado_nuevo", ["en_examenes", "en_escuela", "cierre"])
    .gt("created_at", pr.created_at as string);
  return count ? null : "prueba";
}

/**
 * Primer día para la fase 1 de exámenes: el siguiente día hábil después de hoy
 * o, si la prueba de manejo estaba citada para un día posterior (se registró
 * antes de tiempo), el siguiente después de ese día. Nunca el mismo día de la
 * prueba ni antes: el 27-nov-2026 quedó un examen a las 6:30 del mismo sábado
 * de la prueba de las 8:00.
 */
async function primerDiaExamenes(procesoId: string, ahora?: Date): Promise<string> {
  const h = ahora ? fechaBogota(ahora.toISOString()) : hoy();
  const { data } = await createAdminClient()
    .from("seleccion_citas")
    .select("fecha")
    .eq("proceso_id", procesoId)
    .eq("tipo", "prueba_manejo")
    .not("estado", "in", "(reprogramada,cancelada)")
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prueba = (data?.fecha as string | undefined) ?? h;
  return siguienteDiaHabil(prueba > h ? prueba : h);
}

/** Fecha, hora y laboratorio de la fase 1 que eligió el profesor (27-nov-2026). */
export interface ExamenesElegidos {
  fecha: string;
  hora: string;
  laboratorioId: string;
}

/** Revisa lo que eligió el profesor: no antes de ahora y un laboratorio activo que atienda ese día. */
async function validarElegidos(e: ExamenesElegidos, ahora: Date = new Date()): Promise<string | { fecha: string; hora: string; laboratorioId: string; laboratorio: string }> {
  const fecha = String(e?.fecha ?? "");
  const hora = String(e?.hora ?? "").slice(0, 5);
  const mal = validarFechaElegida({ fecha, hora }, ahora);
  if (mal) return mal;
  const lab = await laboratorioPorId(typeof e?.laboratorioId === "string" ? e.laboratorioId : null);
  if (!lab || !lab.activo) return "Elige el laboratorio.";
  const noAtiende = motivoNoAtiende(lab, fecha);
  if (noAtiende) return `El ${fechaEnTexto(fecha)} ${noAtiende}: elige otro día u otro laboratorio.`;
  return { fecha, hora, laboratorioId: lab.id, laboratorio: lab.nombre };
}

/**
 * Pasa a exámenes (fase 1): estado, cita en el laboratorio y el mensaje. Sin
 * `elegidos`, el siguiente día hábil a la hora del laboratorio y el laboratorio
 * del reparto; con ellos, la fecha, la hora y el laboratorio que eligió el profesor.
 */
async function pasarAExamenes(
  procesoId: string,
  actor: ActorProceso,
  motivo: string,
  elegidos?: { fecha: string; hora: string; laboratorioId: string; laboratorio: string }
): Promise<Pick<ResultadoProfesor, "texto" | "envio" | "claveMensaje" | "documentos">> {
  const a = await leerAjustesAgenda();
  let cuando: { fecha: string; hora: string };
  if (elegidos) {
    cuando = { fecha: elegidos.fecha, hora: elegidos.hora };
  } else {
    // El día y el laboratorio: un día que atienda alguno, y el que diga el reparto (Rescate los sábados…).
    const desde = await primerDiaExamenes(procesoId);
    const plan = await planFase1(desde).catch(() => ({ fecha: desde, laboratorio: null, motivo: "" }));
    cuando = { fecha: plan.fecha, hora: a.laboratorioHora };
  }
  await cambiarEstadoProceso(procesoId, "en_examenes", { actor, detalle: { motivo, ...(elegidos ? { fecha_elegida: true, fecha: cuando.fecha, hora: cuando.hora, laboratorio: elegidos.laboratorio } : {}) } });
  await createAdminClient().from("procesos_contratacion").update({ fecha_examenes: cuando.fecha }).eq("id", procesoId);
  // El laboratorio del aspirante: sale en el mensaje y la fase 2 va al mismo.
  if (elegidos) {
    const r = await asignarLaboratorio(procesoId, elegidos.laboratorioId, actor);
    if (!r.ok) console.error("[seleccion] laboratorio elegido por el profesor:", r.error);
  } else {
    await asegurarLaboratorio(procesoId, actor, cuando.fecha).catch((e) => console.error("[seleccion] laboratorio del aspirante:", e));
  }
  const citaId = await crearCitaSimple(procesoId, "examen_f1", cuando, actor);
  const { envio, texto: t } = await avisarProceso(procesoId, "examenes_fase1", cuando);
  // El mensaje pregunta si ya tiene cuenta en el Banco de Bogotá (24-nov-2026): la carta
  // del banco sale solo si responde que no (respuestas-examenes-servidor).
  // Solo si el mensaje que salió traía la pregunta (la plantilla vieja de Meta no la trae).
  if (await mensajeFase1PreguntaBanco(procesoId, envio, t).catch(() => true)) await marcarBancoPreguntado(procesoId).catch(() => undefined);
  // Y la orden al laboratorio, si el envío es automático (23-nov-2026). Con la fecha del
  // profesor sale enseguida: puede ser para hoy y el correo del día no la llevaría.
  await enviarOrdenAlCitar(citaId, actor, { enseguida: !!elegidos });
  // El correo para la prueba psicotécnica se pide después de la respuesta del banco
  // (o, si no responde, a las 24 horas, en la revisión periódica): una pregunta a la vez.
  return { envio, texto: t, claveMensaje: "examenes_fase1", documentos: [] };
}

/** Resultado de la prueba de manejo. Si no se había marcado la llegada, la marca. */
export async function registrarPrueba(
  procesoId: string,
  d: { resultado: ResultadoPrueba; rutaEscrita?: SiNoSinTomar | null; partesMotor?: SiNoSinTomar | null; clasesSugeridas?: number | null; observacion?: string | null },
  actor: ActorProceso
): Promise<ResultadoProfesor> {
  if (!["aprobo", "escuela", "no_continua"].includes(d.resultado)) return { ok: false, error: "Elige el resultado de la prueba." };
  const p = await procesoAbierto(procesoId);
  if (typeof p === "string") return { ok: false, error: p };
  if (!ESTADOS_PRUEBA.includes(p.estado)) return { ok: false, error: "Este aspirante ya tiene registrada la prueba de manejo." };
  if (await pendienteDeExamenes(procesoId, p.estado)) return { ok: false, error: "La prueba ya está guardada: falta pulsar «Listo para exámenes» (o deshacerla en «Lo registrado»)." };
  const observacion = texto(d.observacion);
  if (d.resultado === "no_continua" && !observacion) return { ok: false, error: "Escribe por qué no continúa." };

  const db = createAdminClient();
  const vigente = await citaVigenteDeProceso(procesoId);
  if (vigente) await marcarLlegada(vigente.id, actor);
  const opcion = (v: unknown) => (["si", "no", "sin_tomar"].includes(String(v)) ? String(v) : null);
  const clases = Number(d.clasesSugeridas);
  const { error } = await db.from("seleccion_pruebas_manejo").insert({
    proceso_id: procesoId,
    cita_id: vigente?.id ?? null,
    fecha: hoy(),
    resultado: d.resultado,
    prueba_ruta_escrita: opcion(d.rutaEscrita),
    prueba_partes_motor: opcion(d.partesMotor),
    clases_sugeridas: d.resultado === "escuela" && Number.isFinite(clases) && clases > 0 ? Math.min(Math.round(clases), 99) : null,
    observacion,
    ...firma(actor),
  });
  if (error) return { ok: false, error: `No se pudo guardar la prueba (${error.message}).` };
  await db.from("procesos_contratacion").update({ fecha_prueba_manejo: hoy() }).eq("id", procesoId);
  await registrarEvento(procesoId, { tipo: "prueba", detalle: { accion: "prueba_manejo", resultado: d.resultado, observacion } }, actor);

  // Solo se guarda: citar y enviar es el segundo paso, «Listo para exámenes» (enviarAExamenes).
  if (d.resultado === "aprobo") return { ok: true, porEnviarExamenes: true };
  if (d.resultado === "escuela") {
    await cambiarEstadoProceso(procesoId, "en_escuela", { actor, detalle: { motivo: "Prueba de manejo: pasa a escuela." } });
    return { ok: true };
  }
  await cambiarEstadoProceso(procesoId, "cierre", { actor, causa: CAUSA_PRUEBA, detalle: { motivo: observacion } });
  return { ok: true };
}

/**
 * Una clase de escuela más (cada llamada agrega una; nunca pisa las anteriores).
 * `asistio: false` = no llegó a la clase: queda como falta, no cuenta como
 * clase dictada y sigue en escuela. `clasesFaltantes` = cuántas clases más
 * calcula el profesor que necesita (lo puede ir ajustando clase a clase).
 */
export async function registrarClase(
  procesoId: string,
  d: { resultado: ResultadoClase; observacion?: string | null; asistio?: boolean; clasesFaltantes?: number | null },
  actor: ActorProceso
): Promise<ResultadoProfesor> {
  const falto = d.asistio === false;
  // No llegó y el profesor no decide más: sigue en escuela. Si no llegó, sí puede decidir que no continúa.
  if (falto && d.resultado !== "no_continua") d = { ...d, resultado: "sigue" };
  if (!["sigue", "listo", "no_continua"].includes(d.resultado)) return { ok: false, error: "Elige cómo le fue en la clase." };
  const p = await procesoAbierto(procesoId);
  if (typeof p === "string") return { ok: false, error: p };
  if (p.estado !== "en_escuela") return { ok: false, error: "Este aspirante no está en escuela." };
  if (await pendienteDeExamenes(procesoId, p.estado)) return { ok: false, error: "Ya quedó listo: falta pulsar «Listo para exámenes» (o deshacer la última clase)." };
  const observacion = texto(d.observacion);
  if (d.resultado === "no_continua" && !observacion) return { ok: false, error: "Escribe por qué no continúa." };
  const n = Number(d.clasesFaltantes);
  const faltantes = d.resultado === "sigue" && d.clasesFaltantes != null && Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 99) : null;
  const fila = { proceso_id: procesoId, fecha: hoy(), resultado: d.resultado, observacion, ...firma(actor) };
  let { error } = await createAdminClient().from("seleccion_clases_escuela").insert({ ...fila, asistio: !falto, clases_faltantes: faltantes });
  // Sin la migración 20261118222930 no existen esas columnas: una clase normal se guarda igual.
  if (error && /asistio|clases_faltantes/.test(error.message)) {
    if (falto) return { ok: false, error: "Para marcar que no llegó a la clase falta aplicar la migración 20261118222930." };
    ({ error } = await createAdminClient().from("seleccion_clases_escuela").insert(fila));
  }
  if (error) return { ok: false, error: `No se pudo guardar la clase (${error.message}).` };
  await registrarEvento(
    procesoId,
    { tipo: "prueba", detalle: { accion: "clase_escuela", resultado: d.resultado, observacion, ...(falto ? { falto: true } : {}), ...(faltantes != null ? { clases_faltantes: faltantes } : {}) } },
    actor
  );
  // Solo se guarda: citar y enviar es el segundo paso, «Listo para exámenes».
  if (d.resultado === "listo") return { ok: true, porEnviarExamenes: true };
  if (d.resultado === "no_continua") await cambiarEstadoProceso(procesoId, "cierre", { actor, causa: CAUSA_PRUEBA, detalle: { motivo: observacion, etapa: "escuela" } });
  return { ok: true };
}

/**
 * «Listo para exámenes» (23-nov-2026): el segundo paso después de guardar la
 * prueba «aprobó» o la clase «listo». Aquí sí se cita al laboratorio, se le
 * envía el mensaje con la carta del banco y, con el envío automático, la orden.
 */
/**
 * `ahora`: el chat de prueba manda la hora de su reloj de prueba (27-nov-2026), para que la fecha
 * propuesta y la validación cuenten desde el día que se está simulando.
 */
export async function enviarAExamenes(procesoId: string, actor: ActorProceso, elegidos?: ExamenesElegidos | null, ahora?: Date): Promise<ResultadoProfesor> {
  const p = await procesoAbierto(procesoId);
  if (typeof p === "string") return { ok: false, error: p };
  const pendiente = await pendienteDeExamenes(procesoId, p.estado);
  if (!pendiente) return { ok: false, error: "Este aspirante no tiene pendiente el paso a exámenes." };
  const v = elegidos ? await validarElegidos(elegidos, ahora) : undefined;
  if (typeof v === "string") return { ok: false, error: v };
  return { ok: true, ...(await pasarAExamenes(procesoId, actor, pendiente === "escuela" ? "Terminó la escuela." : "Aprobó la prueba de manejo.", v)) };
}

/** Un laboratorio que el profesor puede elegir. */
export interface LaboratorioElegible {
  id: string;
  nombre: string;
  direccion: string | null;
  /** Días en que atiende (0 = domingo … 6 = sábado). */
  dias: number[];
  /** Fechas en que avisó que no atiende. */
  cerrado: string[];
}

export interface PlanExamenes {
  fecha: string;
  hora: string;
  laboratorio: string | null;
  direccion: string | null;
  /** El laboratorio del plan (null si no hay laboratorios). */
  laboratorioId: string | null;
  /** Para «Elegir fecha y hora» (27-nov-2026): los laboratorios activos… */
  laboratorios: LaboratorioElegible[];
  /** …el que se propone en ese caso (el del ajuste o, si no hay, el del plan)… */
  laboratorioFechaElegida: string | null;
  /** …y ahora, en Bogotá, para no dejar elegir antes. */
  ahora: { fecha: string; hora: string };
}

/** Lo que haría «Listo para exámenes», sin hacerlo: día, hora y laboratorio de la fase 1. */
export async function planExamenes(procesoId: string, ahoraSimulado?: Date): Promise<PlanExamenes> {
  const a = await leerAjustesAgenda();
  const desde = await primerDiaExamenes(procesoId, ahoraSimulado);
  const [plan, labs, delAjuste] = await Promise.all([
    planFase1(desde).catch(() => ({ fecha: desde, laboratorio: null, motivo: "" })),
    leerLaboratorios().catch(() => []),
    laboratorioFechaProfesor().catch(() => null),
  ]);
  const lab = await laboratorioQueLeToca(procesoId, plan.fecha).catch(() => null);
  const elegido = lab?.laboratorio ?? plan.laboratorio ?? null;
  const ahora = ahoraSimulado ?? new Date();
  return {
    fecha: plan.fecha,
    hora: a.laboratorioHora,
    laboratorio: elegido?.nombre ?? null,
    direccion: lab?.laboratorio.direccion ?? null,
    laboratorioId: elegido?.id ?? null,
    laboratorios: labs
      .filter((l) => l.activo)
      .map((l) => ({ id: l.id, nombre: l.nombre, direccion: l.direccion, dias: l.dias_atencion?.length ? l.dias_atencion : [1, 2, 3, 4, 5, 6], cerrado: l.fechas_sin_atencion ?? [] })),
    laboratorioFechaElegida: delAjuste?.id ?? elegido?.id ?? null,
    ahora: { fecha: fechaBogota(ahora.toISOString()), hora: horaBogota(ahora) },
  };
}

/** Una salida de reconocimiento de ruta. No cambia el estado (las condiciones para contratar son de la entrega 3). */
export async function registrarReconocimiento(
  procesoId: string,
  d: { ruta: string; resultado: ResultadoRuta; observacion?: string | null },
  actor: ActorProceso
): Promise<ResultadoProfesor> {
  const ruta = texto(d.ruta, 80);
  if (!ruta) return { ok: false, error: "Elige la ruta." };
  if (!["aprendida", "repetir", "no_continua"].includes(d.resultado)) return { ok: false, error: "Elige el resultado de la salida." };
  if (d.resultado !== "no_continua") return registrarReconocimientos(procesoId, { salidas: [{ ruta, resultado: d.resultado }], observacion: d.observacion }, actor);
  const p = await procesoAbierto(procesoId);
  if (typeof p === "string") return { ok: false, error: p };
  const observacion = texto(d.observacion);
  if (!observacion) return { ok: false, error: "Escribe por qué no continúa." };
  const db = createAdminClient();
  const { error } = await db.from("seleccion_reconocimientos_ruta").insert({ proceso_id: procesoId, fecha: hoy(), ruta, resultado: d.resultado, observacion, ...firma(actor) });
  if (error) return { ok: false, error: `No se pudo guardar la salida (${error.message}).` };
  await registrarEvento(procesoId, { tipo: "prueba", detalle: { accion: "reconocimiento_ruta", ruta, resultado: d.resultado, observacion } }, actor);
  const citaHoy = await reconocimientoDeHoy(procesoId);
  if (citaHoy) await marcarLlegada(citaHoy.id, actor);
  await cancelarReconocimientos(procesoId, actor, "No continúa");
  await cambiarEstadoProceso(procesoId, "cierre", { actor, causa: CAUSA_RUTA, detalle: { motivo: observacion, ruta } });
  return { ok: true };
}

/**
 * Las salidas de reconocimiento de ruta de un día, en un solo guardado
 * (23-nov-2026): antes cada salida guardada citaba y avisaba a la siguiente, y
 * dos rutas el mismo día eran dos mensajes. Ahora se evalúa una vez al final:
 * si completó las rutas, no se envía nada; si le faltan, un solo mensaje con la
 * siguiente salida. «No continúa» va aparte (registrarReconocimiento).
 */
export async function registrarReconocimientos(
  procesoId: string,
  d: { salidas: { ruta: string; resultado: "aprendida" | "repetir" }[]; observacion?: string | null },
  actor: ActorProceso
): Promise<ResultadoProfesor> {
  const salidas = (Array.isArray(d.salidas) ? d.salidas : []).map((s) => ({ ruta: texto(s?.ruta, 80), resultado: s?.resultado }));
  if (!salidas.length) return { ok: false, error: "Agrega al menos una ruta." };
  if (salidas.length > 10) return { ok: false, error: "Son demasiadas rutas para un día." };
  if (salidas.some((s) => !s.ruta)) return { ok: false, error: "Elige la ruta de cada salida." };
  if (salidas.some((s) => s.resultado !== "aprendida" && s.resultado !== "repetir")) return { ok: false, error: "Elige cómo le fue en cada ruta." };
  const p = await procesoAbierto(procesoId);
  if (typeof p === "string") return { ok: false, error: p };
  const observacion = texto(d.observacion);
  const db = createAdminClient();
  const antes = await salidasDeRuta(procesoId);
  const filas = salidas.map((s, i) => ({ proceso_id: procesoId, fecha: hoy(), ruta: s.ruta as string, resultado: s.resultado, observacion: i === salidas.length - 1 ? observacion : null, ...firma(actor) }));
  const { error } = await db.from("seleccion_reconocimientos_ruta").insert(filas);
  if (error) return { ok: false, error: `No se pudo guardar las salidas (${error.message}).` };
  await registrarEvento(procesoId, { tipo: "prueba", detalle: { accion: "reconocimiento_ruta", salidas: salidas.map((s) => ({ ruta: s.ruta, resultado: s.resultado })), observacion } }, actor);
  // Si tenía cita de reconocimiento hoy, registrar las salidas es que llegó.
  const citaHoy = await reconocimientoDeHoy(procesoId);
  if (citaHoy) await marcarLlegada(citaHoy.id, actor);
  // Completa cuando llega al número de rutas con todas las obligatorias (lista de Tiempos y reglas).
  const [{ rutasMinimas }, obligatorias] = await Promise.all([leerAjustesAgenda(), rutasObligatorias()]);
  const ya = avanceRutas(rutasAprendidas(antes), rutasMinimas, obligatorias);
  const ahora = avanceRutas(rutasAprendidas([...antes, ...salidas.map((s) => ({ ruta: s.ruta as string, resultado: s.resultado }))]), rutasMinimas, obligatorias);
  const rutasCompletas = !ya.completas && ahora.completas;
  // 25-nov-2026: con las rutas completas puede quedar «Listo para contratar».
  if (ahora.completas) await revisarListoContratar(procesoId, actor);
  if (rutasCompletas) {
    await registrarEvento(procesoId, { tipo: "prueba", detalle: { accion: "rutas_completas", rutas: ahora.aprendidas.length, minimas: ahora.necesarias, aprendidas: ahora.aprendidas } }, actor);
    await cancelarReconocimientos(procesoId, actor, "Completó las rutas");
    return { ok: true, rutasCompletas };
  }
  // Desde el 24-nov-2026 la siguiente salida no se cita sola: la cita el encargado del reconocimiento.
  await createAdminClient().from("procesos_contratacion").update({ reconocimiento_estado: "en_curso" }).eq("id", procesoId).or("reconocimiento_estado.is.null,reconocimiento_estado.in.(pendiente,por_verificar)");
  return { ok: true, rutasCompletas };
}

/** Nota libre del profesor sobre el candidato. */
export async function registrarObservacion(procesoId: string, nota: string, actor: ActorProceso): Promise<ResultadoProfesor> {
  const t = texto(nota, 2000);
  if (!t) return { ok: false, error: "Escribe la observación." };
  const { data: p } = await createAdminClient().from("procesos_contratacion").select("id").eq("id", procesoId).maybeSingle();
  if (!p) return { ok: false, error: "El proceso no existe." };
  const { error } = await createAdminClient().from("seleccion_observaciones_profesor").insert({ proceso_id: procesoId, texto: t, ...firma(actor) });
  if (error) return { ok: false, error: `No se pudo guardar la observación (${error.message}).` };
  await registrarEvento(procesoId, { tipo: "prueba", detalle: { accion: "observacion", observacion: t } }, actor);
  return { ok: true };
}

/** Concepto final del profesor. «Rechaza» exige la nota y cierra el proceso (Gestión Humana lo puede reabrir). */
export async function registrarConcepto(procesoId: string, d: { concepto: "acepta" | "rechaza"; nota?: string | null }, actor: ActorProceso): Promise<ResultadoProfesor> {
  if (d.concepto !== "acepta" && d.concepto !== "rechaza") return { ok: false, error: "Elige si lo aceptas o no." };
  const nota = texto(d.nota);
  if (d.concepto === "rechaza" && !nota) return { ok: false, error: "Escribe por qué no lo aceptas." };
  const p = await procesoAbierto(procesoId);
  if (typeof p === "string") return { ok: false, error: p };
  const { error } = await createAdminClient()
    .from("procesos_contratacion")
    .update({ profesor_concepto: d.concepto, profesor_concepto_nota: nota, profesor_concepto_por: actor.userEmail, profesor_concepto_at: new Date().toISOString() })
    .eq("id", procesoId);
  if (error) return { ok: false, error: `No se pudo guardar el concepto (${error.message}).` };
  await registrarEvento(procesoId, { tipo: "prueba", detalle: { accion: "concepto", concepto: d.concepto, observacion: nota } }, actor);
  if (d.concepto === "rechaza") await cambiarEstadoProceso(procesoId, "cierre", { actor, causa: CAUSA_CONCEPTO, detalle: { motivo: nota } });
  return { ok: true };
}

const TABLA_REGISTRO: Record<"prueba" | "clase" | "ruta" | "observacion", string> = {
  prueba: "seleccion_pruebas_manejo",
  clase: "seleccion_clases_escuela",
  ruta: "seleccion_reconocimientos_ruta",
  observacion: "seleccion_observaciones_profesor",
};

/**
 * Deshace un registro del profesor de hoy (23-nov-2026), solo si por él no
 * salió ningún mensaje ni cambió la etapa (ver `deshacible` en el historial).
 * Deshacer «va a escuela» lo devuelve a la prueba de manejo. Queda en el historial.
 */
export async function deshacerRegistro(procesoId: string, tipo: RegistroProfesor["tipo"], id: string, actor: ActorProceso): Promise<ResultadoProfesor> {
  if (!(tipo in TABLA_REGISTRO)) return { ok: false, error: "Registro no válido." };
  const h = await historialProfesor(procesoId);
  const r = h.registros.find((x) => x.tipo === tipo && x.id === id);
  if (!r) return { ok: false, error: "Ese registro ya no existe." };
  if (!r.deshacible) return { ok: false, error: "Ya no se puede deshacer: es de otro día o por él ya se le envió un mensaje. Pídele el cambio a Gestión Humana." };
  const { error } = await createAdminClient().from(TABLA_REGISTRO[tipo]).delete().eq("id", id).eq("proceso_id", procesoId);
  if (error) return { ok: false, error: `No se pudo deshacer (${error.message}).` };
  if (tipo === "prueba" && r.resultado === "escuela") {
    await cambiarEstadoProceso(procesoId, "prueba_manejo", { actor, detalle: { motivo: "El profesor deshizo «va a escuela»." } });
  }
  await registrarEvento(procesoId, { tipo: "prueba", detalle: { accion: "deshecho", registro: tipo, resultado: r.resultado, ruta: r.ruta, observacion: r.observacion } }, actor);
  return { ok: true };
}

// ── Lecturas ───────────────────────────────────────────────────────────────

async function salidasDeRuta(procesoId: string): Promise<{ ruta: string; resultado: string }[]> {
  const { data, error } = await createAdminClient().from("seleccion_reconocimientos_ruta").select("ruta, resultado").eq("proceso_id", procesoId);
  return error ? [] : ((data ?? []) as { ruta: string; resultado: string }[]);
}

export interface RegistroProfesor {
  id: string;
  tipo: "prueba" | "clase" | "ruta" | "observacion";
  fecha: string;
  created_at: string;
  resultado: string | null;
  ruta: string | null;
  observacion: string | null;
  rutaEscrita: string | null;
  partesMotor: string | null;
  clasesSugeridas: number | null;
  /** Número de la clase (1, 2, 3…), solo en las clases a las que asistió. */
  numero: number | null;
  /** Clase a la que no llegó. */
  falto: boolean;
  /** Clases que el profesor calculó que le faltaban después de esa clase. */
  clasesFaltantes: number | null;
  por: string | null;
  /** Se puede deshacer: es de hoy y por él no salió ningún mensaje ni cambió la etapa (23-nov-2026). */
  deshacible: boolean;
}

export interface HistorialProfesor {
  /** Del más reciente al más viejo. */
  registros: RegistroProfesor[];
  /** Clases dictadas (a las que asistió). */
  clases: number;
  /** Clases a las que no llegó. */
  faltas: number;
  /** Clases que le faltan según el último cálculo del profesor; null si no lo ha dicho. */
  clasesPendientes: number | null;
  rutasAprendidas: string[];
  /** Cuántas debe aprender (el ajuste o, si son más, el número de obligatorias). */
  rutasMinimas: number;
  /** Obligatorias que todavía no aprendió. */
  rutasFaltantes: string[];
  concepto: { concepto: "acepta" | "rechaza"; nota: string | null; por: string | null; at: string | null } | null;
  /** Guardó «pasa a exámenes» (prueba o escuela) y falta «Listo para exámenes». */
  porEnviarExamenes: "prueba" | "escuela" | null;
}

/** Todo lo que el profesor ha registrado del aspirante (vacío si falta la migración). */
export async function historialProfesor(procesoId: string): Promise<HistorialProfesor> {
  const db = createAdminClient();
  const de = (tabla: string) => db.from(tabla).select("*").eq("proceso_id", procesoId).order("created_at");
  const [pruebas, clases, rutas, obs, proc, a, obligatorias, estadoR, citasRuta, completas] = await Promise.all([
    de("seleccion_pruebas_manejo"),
    de("seleccion_clases_escuela"),
    de("seleccion_reconocimientos_ruta"),
    de("seleccion_observaciones_profesor"),
    db.from("procesos_contratacion").select("profesor_concepto, profesor_concepto_nota, profesor_concepto_por, profesor_concepto_at").eq("id", procesoId).maybeSingle(),
    leerAjustesAgenda(),
    rutasObligatorias(),
    db.from("procesos_contratacion").select("estado").eq("id", procesoId).maybeSingle(),
    // Para saber si una salida ya causó un mensaje (la cita de la siguiente) o cerró las rutas.
    db.from("seleccion_citas").select("created_at").eq("proceso_id", procesoId).eq("tipo", "reconocimiento"),
    db.from("procesos_contratacion_eventos").select("created_at").eq("proceso_id", procesoId).eq("detalle->>accion", "rutas_completas"),
  ]);
  type Fila = Record<string, string | number | null>;
  const base = (f: Fila, tipo: RegistroProfesor["tipo"]): RegistroProfesor => ({
    id: String(f.id),
    tipo,
    fecha: String(f.fecha ?? String(f.created_at).slice(0, 10)),
    created_at: String(f.created_at),
    resultado: (f.resultado as string | null) ?? null,
    ruta: (f.ruta as string | null) ?? null,
    observacion: ((tipo === "observacion" ? f.texto : f.observacion) as string | null) ?? null,
    rutaEscrita: (f.prueba_ruta_escrita as string | null) ?? null,
    partesMotor: (f.prueba_partes_motor as string | null) ?? null,
    clasesSugeridas: (f.clases_sugeridas as number | null) ?? null,
    numero: null,
    falto: tipo === "clase" && f.asistio === (false as never),
    clasesFaltantes: tipo === "clase" ? ((f.clases_faltantes as number | null) ?? null) : null,
    por: (f.profesor_email as string | null) ?? null,
    deshacible: false,
  });
  const filas = (r: { data: unknown; error: unknown }) => (r.error ? [] : ((r.data ?? []) as Fila[]));
  // Solo se numeran las clases a las que asistió; las faltas van aparte.
  let numero = 0;
  const clasesNumeradas = filas(clases).map((f) => {
    const r = base(f, "clase");
    return r.falto ? r : { ...r, numero: ++numero };
  });
  const sugeridas = filas(pruebas).map((f) => f.clases_sugeridas as number | null).filter((x): x is number => x != null).pop() ?? null;
  const registros = [
    ...filas(pruebas).map((f) => base(f, "prueba")),
    ...clasesNumeradas,
    ...filas(rutas).map((f) => base(f, "ruta")),
    ...filas(obs).map((f) => ({ ...base(f, "observacion"), fecha: fechaBogota(String(f.created_at)) })),
  ].sort((x, y) => y.created_at.localeCompare(x.created_at));
  const c = proc.error ? null : (proc.data as Record<string, string | null> | null);

  // Qué se puede deshacer (solo lo de hoy, y solo si por ese registro no salió nada ni cambió la etapa).
  const estado = String((estadoR.data as { estado?: string } | null)?.estado ?? "");
  const abierto = !!estado && estado !== "cierre" && estado !== "contratado";
  const hoyTexto = hoy();
  const ultimaPrueba = filas(pruebas).at(-1);
  const ultimaClase = filas(clases).at(-1);
  const porEnviarExamenes = abierto ? await pendienteDeExamenes(procesoId, estado) : null;
  const despues = (lista: { data: unknown; error: unknown }, desde: string) => filas(lista).some((x) => String(x.created_at) > desde);
  for (const r of registros) {
    if (r.fecha !== hoyTexto || !abierto) continue;
    if (r.tipo === "observacion") r.deshacible = true;
    else if (r.tipo === "prueba" && ultimaPrueba && String(ultimaPrueba.id) === r.id) {
      r.deshacible = (r.resultado === "aprobo" && porEnviarExamenes === "prueba") || (r.resultado === "escuela" && estado === "en_escuela" && filas(clases).length === 0);
    } else if (r.tipo === "clase" && ultimaClase && String(ultimaClase.id) === r.id) {
      r.deshacible = estado === "en_escuela" && (r.resultado === "sigue" || r.resultado === "listo");
    } else if (r.tipo === "ruta") {
      r.deshacible = r.resultado !== "no_continua" && !despues(citasRuta, r.created_at) && !despues(completas, r.created_at);
    }
  }

  return {
    porEnviarExamenes,
    registros,
    clases: numero,
    faltas: clasesNumeradas.filter((c) => c.falto).length,
    // Ya terminó la escuela («listo»): no le falta ninguna.
    clasesPendientes: filas(clases).some((f) => f.resultado === "listo") ? null : clasesPendientes(clasesNumeradas, sugeridas),
    ...(() => {
      const av = avanceRutas(rutasAprendidas(filas(rutas).map((f) => ({ ruta: String(f.ruta), resultado: String(f.resultado) }))), a.rutasMinimas, obligatorias);
      return { rutasAprendidas: av.aprendidas, rutasMinimas: av.necesarias, rutasFaltantes: av.faltanObligatorias };
    })(),
    concepto:
      c?.profesor_concepto === "acepta" || c?.profesor_concepto === "rechaza"
        ? { concepto: c.profesor_concepto, nota: c.profesor_concepto_nota, por: c.profesor_concepto_por, at: c.profesor_concepto_at }
        : null,
  };
}

/**
 * Clases que le faltan: el último cálculo del profesor en una clase; si nunca
 * lo dijo en una clase, lo que calculó en la prueba de manejo menos las ya dictadas.
 */
export function clasesPendientes(clases: { falto: boolean; clasesFaltantes: number | null }[], sugeridasEnPrueba: number | null): number | null {
  const ultimo = [...clases].reverse().find((c) => c.clasesFaltantes != null);
  if (ultimo) {
    // Las clases dictadas después de ese cálculo se descuentan.
    const despues = clases.slice(clases.lastIndexOf(ultimo) + 1).filter((c) => !c.falto).length;
    return Math.max(0, (ultimo.clasesFaltantes as number) - despues);
  }
  if (sugeridasEnPrueba == null) return null;
  return Math.max(0, sugeridasEnPrueba - clases.filter((c) => !c.falto).length);
}

/** Aspirante en una etapa que atiende el profesor. */
export interface AspiranteProfesor {
  procesoId: string;
  nombre: string;
  cedula: string;
  celular: string | null;
  estado: string;
  clases: number;
  faltas: number;
  clasesPendientes: number | null;
  rutasAprendidas: string[];
  /** Obligatorias que todavía no aprendió. */
  rutasFaltantes: string[];
  concepto: "acepta" | "rechaza" | null;
}

export interface PendientesProfesor {
  fecha: string;
  /** Hora de la prueba ese día; null si no hay (domingo, festivo o el profesor no puede). */
  horaPrueba: string | null;
  excepcion: ExcepcionProfesor | null;
  citas: CitaDelDia[];
  /** Salidas de reconocimiento de ruta citadas ese día (21-nov-2026). */
  reconocimientos: CitaDelDia[];
  /** Llegaron a la prueba (hoy u otro día) y falta el resultado. */
  porCalificar: AspiranteProfesor[];
  escuela: AspiranteProfesor[];
  rutas: AspiranteProfesor[];
  /** Guardaron «pasa a exámenes» y falta «Listo para exámenes» (23-nov-2026). */
  porEnviarExamenes: AspiranteProfesor[];
  /** Cuántas debe aprender (el ajuste o, si son más, el número de obligatorias). */
  rutasMinimas: number;
  /** Las obligatorias de la lista de Tiempos y reglas. */
  rutasObligatorias: string[];
}

const ESTADOS_RUTA = ["en_examenes", "en_examenes_fase2", "reconocimiento_ruta"];
const ESTADOS_PROFESOR = ["prueba_manejo", "en_escuela", ...ESTADOS_RUTA];

/**
 * Lo que el profesor tiene para ese día. `soloPrueba`: solo candidatos del chat
 * de prueba (para probar en Selección); si no, se excluyen.
 */
export async function pendientesDelProfesor(fecha: string, opciones: { soloPrueba?: boolean } = {}): Promise<PendientesProfesor> {
  const db = createAdminClient();
  const [citas, a, excepciones, procesos, obligatorias] = await Promise.all([
    citasDelDia(fecha, opciones),
    leerAjustesAgenda(),
    leerDisponibilidad(fecha, fecha),
    db
      .from("procesos_contratacion")
      .select("id, nombre, cedula, celular, estado, origen, profesor_concepto")
      .in("estado", ESTADOS_PROFESOR)
      .order("nombre"),
    rutasObligatorias(),
  ]);
  type FilaP = { id: string; nombre: string; cedula: string; celular: string | null; estado: string; origen: string | null; profesor_concepto?: string | null };
  let filas = (procesos.error ? [] : (procesos.data ?? [])) as FilaP[];
  // Sin la migración no existe profesor_concepto: se lee sin ella.
  if (procesos.error) {
    const r = await db
      .from("procesos_contratacion")
      .select("id, nombre, cedula, celular, estado, origen")
      .in("estado", ESTADOS_PROFESOR)
      .order("nombre");
    filas = (r.data ?? []) as FilaP[];
  }
  filas = filas.filter((f) => (opciones.soloPrueba ? f.origen === "chat_prueba" : f.origen !== "chat_prueba"));
  const ids = filas.map((f) => f.id);
  type FilaClase = { proceso_id: string; asistio?: boolean | null; clases_faltantes?: number | null; resultado?: string | null };
  let clases: { data: FilaClase[] | null; error: unknown } = { data: [], error: null };
  let salidas: { data: unknown[] | null; error: unknown } = { data: [], error: null };
  let sugeridas: { proceso_id: string; clases_sugeridas: number | null; resultado?: string | null }[] = [];
  if (ids.length) {
    const [c, s, pr] = await Promise.all([
      db.from("seleccion_clases_escuela").select("proceso_id, asistio, clases_faltantes, resultado").in("proceso_id", ids).order("created_at"),
      db.from("seleccion_reconocimientos_ruta").select("proceso_id, ruta, resultado").in("proceso_id", ids),
      db.from("seleccion_pruebas_manejo").select("proceso_id, clases_sugeridas, resultado").in("proceso_id", ids).order("created_at"),
    ]);
    // Sin la migración 20261118222930: sin asistencia ni cálculo de clases.
    clases = c.error ? await db.from("seleccion_clases_escuela").select("proceso_id").in("proceso_id", ids).order("created_at") : c;
    salidas = s;
    sugeridas = (pr.data ?? []) as typeof sugeridas;
  }
  const clasesDe = (id: string) => ((clases.data ?? []) as FilaClase[]).filter((c) => c.proceso_id === id).map((c) => ({ falto: c.asistio === false, clasesFaltantes: c.clases_faltantes ?? null }));
  const aspirante = (f: FilaP): AspiranteProfesor => ({
    procesoId: f.id,
    nombre: f.nombre,
    cedula: f.cedula,
    celular: f.celular,
    estado: f.estado,
    clases: clasesDe(f.id).filter((c) => !c.falto).length,
    faltas: clasesDe(f.id).filter((c) => c.falto).length,
    clasesPendientes: clasesPendientes(clasesDe(f.id), sugeridas.filter((x) => x.proceso_id === f.id).map((x) => x.clases_sugeridas).filter((x): x is number => x != null).pop() ?? null),
    ...(() => {
      const av = avanceRutas(rutasAprendidas(((salidas.data ?? []) as { proceso_id: string; ruta: string; resultado: string }[]).filter((s) => s.proceso_id === f.id)), a.rutasMinimas, obligatorias);
      return { rutasAprendidas: av.aprendidas, rutasFaltantes: av.faltanObligatorias };
    })(),
    concepto: f.profesor_concepto === "acepta" || f.profesor_concepto === "rechaza" ? f.profesor_concepto : null,
  });
  // Guardaron «pasa a exámenes» (la última prueba «aprobó» o la última clase «listo») y falta enviarlos.
  const ultimo = <T extends { proceso_id: string }>(lista: T[], id: string) => lista.filter((x) => x.proceso_id === id).at(-1);
  const porEnviar = (f: FilaP) =>
    f.estado === "prueba_manejo" ? ultimo(sugeridas, f.id)?.resultado === "aprobo" : f.estado === "en_escuela" ? ultimo((clases.data ?? []) as FilaClase[], f.id)?.resultado === "listo" : false;
  return {
    fecha,
    horaPrueba: horaDelDia(fecha, a, excepciones),
    excepcion: excepciones.find((e) => e.fecha === fecha) ?? null,
    citas,
    reconocimientos: [],
    porCalificar: filas.filter((f) => f.estado === "prueba_manejo" && !porEnviar(f)).map(aspirante),
    escuela: filas.filter((f) => f.estado === "en_escuela" && !porEnviar(f)).map(aspirante),
    porEnviarExamenes: filas.filter(porEnviar).map(aspirante),
    // Desde el 24-nov-2026 el reconocimiento de ruta no es del profesor: tiene su propia pantalla.
    rutas: [],
    rutasMinimas: avanceRutas([], a.rutasMinimas, obligatorias).necesarias,
    rutasObligatorias: obligatorias,
  };
}

/**
 * Nombres de las rutas para el reconocimiento: la lista de Selección › Tiempos
 * y reglas (las obligatorias primero). Sin la migración, las que usa GEMA.
 */
export async function rutasParaReconocimiento(): Promise<string[]> {
  try {
    const { rutas } = await leerRutasReconocimiento();
    return [...obligatoriasDe(rutas), ...rutas.filter((r) => !r.obligatoria).map((r) => r.nombre)];
  } catch {
    return [];
  }
}
