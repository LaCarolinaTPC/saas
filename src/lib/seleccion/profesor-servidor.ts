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
import { horaDelDia, rutasAprendidas, siguienteDiaHabil, type ExcepcionProfesor } from "./agenda";
import {
  avisarProceso,
  cancelarReconocimientos,
  citarReconocimiento,
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
import { asegurarLaboratorio, enviarDocumentosAspirante, planFase1 } from "./laboratorios-servidor";
import { avanceRutas, obligatoriasDe } from "./rutas";
import { leerRutasReconocimiento, rutasObligatorias } from "./rutas-servidor";

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

/** Pasa a exámenes (fase 1): estado, cita en el laboratorio el siguiente día hábil y el mensaje. */
async function pasarAExamenes(procesoId: string, actor: ActorProceso, motivo: string): Promise<Pick<ResultadoProfesor, "texto" | "envio" | "claveMensaje" | "documentos">> {
  const a = await leerAjustesAgenda();
  // El día y el laboratorio: un día que atienda alguno, y el que diga el reparto (Rescate los sábados…).
  const plan = await planFase1(siguienteDiaHabil(hoy())).catch(() => ({ fecha: siguienteDiaHabil(hoy()), laboratorio: null, motivo: "" }));
  const cuando = { fecha: plan.fecha, hora: a.laboratorioHora };
  await cambiarEstadoProceso(procesoId, "en_examenes", { actor, detalle: { motivo } });
  await createAdminClient().from("procesos_contratacion").update({ fecha_examenes: cuando.fecha }).eq("id", procesoId);
  // El laboratorio del aspirante: sale en el mensaje y la fase 2 va al mismo.
  await asegurarLaboratorio(procesoId, actor, cuando.fecha).catch((e) => console.error("[seleccion] laboratorio del aspirante:", e));
  const citaId = await crearCitaSimple(procesoId, "examen_f1", cuando, actor);
  const { envio, texto: t } = await avisarProceso(procesoId, "examenes_fase1", cuando);
  // Después del mensaje, la orden de exámenes y la carta del banco (Salud Ocupacional, 21-nov-2026).
  const docs = citaId ? await enviarDocumentosAspirante(citaId).catch((e) => (console.error("[seleccion] documentos del aspirante:", e), null)) : null;
  return { envio, texto: t, claveMensaje: "examenes_fase1", documentos: docs?.documentos.map((d) => d.nombre) ?? [] };
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
  if (!["citado", "prueba_manejo", "antecedentes", "pendiente"].includes(p.estado)) return { ok: false, error: "Este aspirante ya tiene registrada la prueba de manejo." };
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

  if (d.resultado === "aprobo") return { ok: true, ...(await pasarAExamenes(procesoId, actor, "Aprobó la prueba de manejo.")) };
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
  if (d.resultado === "listo") return { ok: true, ...(await pasarAExamenes(procesoId, actor, "Terminó la escuela.")) };
  if (d.resultado === "no_continua") await cambiarEstadoProceso(procesoId, "cierre", { actor, causa: CAUSA_PRUEBA, detalle: { motivo: observacion, etapa: "escuela" } });
  return { ok: true };
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
  const p = await procesoAbierto(procesoId);
  if (typeof p === "string") return { ok: false, error: p };
  const observacion = texto(d.observacion);
  if (d.resultado === "no_continua" && !observacion) return { ok: false, error: "Escribe por qué no continúa." };
  const db = createAdminClient();
  const antes = await salidasDeRuta(procesoId);
  const { error } = await db.from("seleccion_reconocimientos_ruta").insert({ proceso_id: procesoId, fecha: hoy(), ruta, resultado: d.resultado, observacion, ...firma(actor) });
  if (error) return { ok: false, error: `No se pudo guardar la salida (${error.message}).` };
  await registrarEvento(procesoId, { tipo: "prueba", detalle: { accion: "reconocimiento_ruta", ruta, resultado: d.resultado, observacion } }, actor);
  // Si tenía cita de reconocimiento hoy, registrar la salida es que llegó.
  const citaHoy = await reconocimientoDeHoy(procesoId);
  if (citaHoy) await marcarLlegada(citaHoy.id, actor);
  if (d.resultado === "no_continua") {
    await cancelarReconocimientos(procesoId, actor, "No continúa");
    await cambiarEstadoProceso(procesoId, "cierre", { actor, causa: CAUSA_RUTA, detalle: { motivo: observacion, ruta } });
    return { ok: true };
  }
  // Completa cuando llega al número de rutas con todas las obligatorias (lista de Tiempos y reglas).
  const [{ rutasMinimas }, obligatorias] = await Promise.all([leerAjustesAgenda(), rutasObligatorias()]);
  const ya = avanceRutas(rutasAprendidas(antes), rutasMinimas, obligatorias);
  const ahora = avanceRutas(rutasAprendidas([...antes, { ruta, resultado: d.resultado }]), rutasMinimas, obligatorias);
  const rutasCompletas = !ya.completas && ahora.completas;
  if (rutasCompletas) {
    await registrarEvento(procesoId, { tipo: "prueba", detalle: { accion: "rutas_completas", rutas: ahora.aprendidas.length, minimas: ahora.necesarias, aprendidas: ahora.aprendidas } }, actor);
    await cancelarReconocimientos(procesoId, actor, "Completó las rutas");
    return { ok: true, rutasCompletas };
  }
  // Le faltan rutas y ya pasó los exámenes: se cita a la siguiente salida (hasta que las aprenda).
  if (!ahora.completas && p.estado === "reconocimiento_ruta" && !p.reingreso) {
    const r = await citarReconocimiento(procesoId, "reconocimiento_siguiente", actor, { rutas: String(ahora.necesarias), aprendidas: String(ahora.aprendidas.length) });
    return { ok: true, rutasCompletas, texto: r.texto || undefined, envio: r.envio, claveMensaje: r.texto ? "reconocimiento_siguiente" : undefined };
  }
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
}

/** Todo lo que el profesor ha registrado del aspirante (vacío si falta la migración). */
export async function historialProfesor(procesoId: string): Promise<HistorialProfesor> {
  const db = createAdminClient();
  const de = (tabla: string) => db.from(tabla).select("*").eq("proceso_id", procesoId).order("created_at");
  const [pruebas, clases, rutas, obs, proc, a, obligatorias] = await Promise.all([
    de("seleccion_pruebas_manejo"),
    de("seleccion_clases_escuela"),
    de("seleccion_reconocimientos_ruta"),
    de("seleccion_observaciones_profesor"),
    db.from("procesos_contratacion").select("profesor_concepto, profesor_concepto_nota, profesor_concepto_por, profesor_concepto_at").eq("id", procesoId).maybeSingle(),
    leerAjustesAgenda(),
    rutasObligatorias(),
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
  return {
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
  const [citas, reconocimientos, a, excepciones, procesos, obligatorias] = await Promise.all([
    citasDelDia(fecha, opciones),
    citasDelDia(fecha, { ...opciones, tipos: ["reconocimiento"] }),
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
  type FilaClase = { proceso_id: string; asistio?: boolean | null; clases_faltantes?: number | null };
  let clases: { data: FilaClase[] | null; error: unknown } = { data: [], error: null };
  let salidas: { data: unknown[] | null; error: unknown } = { data: [], error: null };
  let sugeridas: { proceso_id: string; clases_sugeridas: number | null }[] = [];
  if (ids.length) {
    const [c, s, pr] = await Promise.all([
      db.from("seleccion_clases_escuela").select("proceso_id, asistio, clases_faltantes").in("proceso_id", ids).order("created_at"),
      db.from("seleccion_reconocimientos_ruta").select("proceso_id, ruta, resultado").in("proceso_id", ids),
      db.from("seleccion_pruebas_manejo").select("proceso_id, clases_sugeridas").in("proceso_id", ids).order("created_at"),
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
  return {
    fecha,
    horaPrueba: horaDelDia(fecha, a, excepciones),
    excepcion: excepciones.find((e) => e.fecha === fecha) ?? null,
    citas,
    reconocimientos,
    porCalificar: filas.filter((f) => f.estado === "prueba_manejo").map(aspirante),
    escuela: filas.filter((f) => f.estado === "en_escuela").map(aspirante),
    // El reconocimiento de ruta puede empezar mientras salen los exámenes (entrega 3).
    rutas: filas.filter((f) => ESTADOS_RUTA.includes(f.estado)).map(aspirante),
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
