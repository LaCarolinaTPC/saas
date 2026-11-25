"use server";

/**
 * Agenda de citas desde Candidatos y la bandeja (entrega 2): citar,
 * reprogramar, llegada, inasistencia y los días en que el profesor no puede.
 * Leer exige entrar a Candidatos; cambiar, `candidatos.editar`.
 */
import { revalidatePath } from "next/cache";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { actorUsuario } from "@/lib/contratacion/servidor";
import { horaDelDia, type AjustesAgenda, type Cita, type ExcepcionProfesor } from "@/lib/seleccion/agenda";
import {
  citaPropuesta,
  citarProceso,
  citasDeProceso,
  citasDelDia,
  citasEntre,
  claveReprogramacion,
  confirmarCita,
  deshacerNoAsistio,
  guardarDisponibilidad,
  leerAjustesAgenda,
  leerDisponibilidad,
  marcarLlegada,
  marcarNoAsistio,
  quitarDisponibilidad,
  reprogramarCita,
  reprogramarCitasDelDia,
  vistaCitacion,
  type CitaDelDia,
  type ResultadoAgenda,
  type ResultadoDisponibilidad,
  type ResultadoReprogramarDia,
  type VistaCitacion,
} from "@/lib/seleccion/agenda-servidor";
import { historialProfesor, type HistorialProfesor } from "@/lib/seleccion/profesor-servidor";

async function exigirLectura() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) throw new Error("No tienes permiso para ver los candidatos.");
  return perms;
}

async function exigirEdicion() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos") || !puedeEditarEn(perms, "candidatos")) throw new Error("No tienes permiso para gestionar las citas.");
  return actorUsuario(perms);
}

const refrescar = () => {
  revalidatePath("/candidatos");
  revalidatePath("/comunicaciones");
};

const sinPermiso = (e: unknown): ResultadoAgenda => ({ ok: false, error: e instanceof Error ? e.message : "No se pudo completar." });

export interface DatosParaCitar {
  propuesta: { fecha: string; hora: string };
  vista: VistaCitacion | null;
  /** Cita de prueba de manejo que sigue en pie (citar la reprograma). */
  vigente: Cita | null;
  excepciones: ExcepcionProfesor[];
  ajustes: AjustesAgenda;
}

/** Lo que muestra el diálogo de Citar: fecha propuesta, mensaje y cita en pie. */
export async function datosParaCitar(procesoId: string): Promise<DatosParaCitar> {
  await exigirLectura();
  const citas = await citasDeProceso(procesoId);
  const vigente = citas.find((c) => c.tipo === "prueba_manejo" && ["programada", "confirmada", "pide_otra_fecha"].includes(c.estado)) ?? null;
  const propuesta = await citaPropuesta(new Date(), Boolean(vigente));
  const hoy = new Date().toISOString().slice(0, 10);
  const [vista, excepciones, ajustes] = await Promise.all([
    vistaCitacion(procesoId, propuesta, vigente ? "cita_reprogramada" : "citacion"),
    leerDisponibilidad(hoy, "2999-12-31"),
    leerAjustesAgenda(),
  ]);
  return { propuesta, vista, vigente, excepciones, ajustes };
}

/** El mensaje que saldría con otra fecha u hora (al reprogramar, según quién pidió el cambio). */
export async function vistaDeCitacion(
  procesoId: string,
  cuando: { fecha: string; hora: string },
  reprogramar: boolean,
  por: "aspirante" | "empresa" = "aspirante"
): Promise<VistaCitacion | null> {
  await exigirLectura();
  return vistaCitacion(procesoId, cuando, reprogramar ? claveReprogramacion(por) : "citacion");
}

export async function citar(procesoId: string, cuando: { fecha: string; hora: string }, textoPropio?: string | null): Promise<ResultadoAgenda> {
  try {
    const actor = await exigirEdicion();
    const r = await citarProceso(procesoId, cuando, actor, { textoPropio: typeof textoPropio === "string" ? textoPropio : null });
    refrescar();
    return r;
  } catch (e) {
    return sinPermiso(e);
  }
}

export async function reprogramar(citaId: string, cuando: { fecha: string; hora: string }, por: "aspirante" | "empresa", textoPropio?: string | null): Promise<ResultadoAgenda> {
  try {
    const actor = await exigirEdicion();
    const r = await reprogramarCita(citaId, cuando, por === "empresa" ? "empresa" : "aspirante", actor, { textoPropio: typeof textoPropio === "string" ? textoPropio : null });
    refrescar();
    return r;
  } catch (e) {
    return sinPermiso(e);
  }
}

type AccionCita = "llego" | "no_asistio" | "deshacer" | "confirmo";

/** Llegó, no asistió, deshacer «no asistió» o confirmó (por teléfono). */
export async function cambiarCita(citaId: string, accion: AccionCita): Promise<ResultadoAgenda> {
  try {
    const actor = await exigirEdicion();
    const r =
      accion === "llego"
        ? await marcarLlegada(citaId, actor)
        : accion === "no_asistio"
          ? await marcarNoAsistio(citaId, actor)
          : accion === "deshacer"
            ? await deshacerNoAsistio(citaId, actor)
            : await confirmarCita(citaId, actor);
    refrescar();
    return r;
  } catch (e) {
    return sinPermiso(e);
  }
}

export interface AgendaDelDia {
  fecha: string;
  citas: CitaDelDia[];
  /** Hora de la prueba ese día; null si no hay. */
  horaPrueba: string | null;
  excepcion: ExcepcionProfesor | null;
  reprogramacionesMax: number;
  /** Desde esta hora, quien no ha confirmado sale para «Llamar» (ajuste «Alerta para llamar si no confirmó»). */
  alertaHora: string;
}

export async function agendaDelDia(fecha: string): Promise<AgendaDelDia> {
  await exigirLectura();
  // Las salidas de reconocimiento de ruta también (21-nov-2026): se confirman y se marcan igual.
  const [citas, a, excepciones] = await Promise.all([citasDelDia(fecha, { tipos: ["prueba_manejo", "reconocimiento"] }), leerAjustesAgenda(), leerDisponibilidad(fecha, fecha)]);
  return { fecha, citas, horaPrueba: horaDelDia(fecha, a, excepciones), excepcion: excepciones[0] ?? null, reprogramacionesMax: a.reprogramacionesMax, alertaHora: a.alertaNoConfirmoHora };
}

export interface DiaDeAgenda {
  fecha: string;
  /** Hora de la prueba ese día; null si no hay (domingo, festivo o el profesor no puede). */
  horaPrueba: string | null;
  excepcion: ExcepcionProfesor | null;
  citas: CitaDelDia[];
}

export interface AgendaDeSemana {
  dias: DiaDeAgenda[];
  reprogramacionesMax: number;
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const sumarDias = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** La semana de lunes a sábado que empieza en `lunes`, para mover citas arrastrándolas. */
export async function agendaDeSemana(lunes: string): Promise<AgendaDeSemana> {
  await exigirLectura();
  if (!FECHA_RE.test(lunes)) throw new Error("Fecha no válida.");
  const sabado = sumarDias(lunes, 5);
  const [citas, a, excepciones] = await Promise.all([citasEntre(lunes, sabado), leerAjustesAgenda(), leerDisponibilidad(lunes, sabado)]);
  const dias = Array.from({ length: 6 }, (_, i) => {
    const fecha = sumarDias(lunes, i);
    return {
      fecha,
      horaPrueba: horaDelDia(fecha, a, excepciones),
      excepcion: excepciones.find((e) => e.fecha === fecha) ?? null,
      citas: citas.filter((c) => c.fecha === fecha),
    };
  });
  return { dias, reprogramacionesMax: a.reprogramacionesMax };
}

export interface CitasYProfesor {
  citas: Cita[];
  historial: HistorialProfesor;
  reprogramacionesMax: number;
}

/** Sección «Citas» y «Profesor» de la ficha. */
export async function citasYProfesorDeProceso(procesoId: string): Promise<CitasYProfesor> {
  await exigirLectura();
  const [citas, historial, a] = await Promise.all([citasDeProceso(procesoId), historialProfesor(procesoId), leerAjustesAgenda()]);
  return { citas, historial, reprogramacionesMax: a.reprogramacionesMax };
}

export async function disponibilidadProfesor(desde: string, hasta: string): Promise<ExcepcionProfesor[]> {
  await exigirLectura();
  return leerDisponibilidad(desde, hasta);
}

export async function guardarDisponibilidadProfesor(ex: {
  fecha: string;
  disponible: boolean;
  hora?: string | null;
  motivo?: string | null;
  nota?: string | null;
}): Promise<ResultadoDisponibilidad> {
  try {
    const actor = await exigirEdicion();
    const r = await guardarDisponibilidad(ex, actor);
    refrescar();
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar.", afectadas: [] };
  }
}

export async function quitarDisponibilidadProfesor(fecha: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirEdicion();
    const r = await quitarDisponibilidad(fecha);
    refrescar();
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo quitar." };
  }
}

/** El profesor no puede ese día: mueve sus citas al siguiente cupo y avisa a cada aspirante. */
export async function reprogramarDiaProfesor(fecha: string): Promise<ResultadoReprogramarDia> {
  try {
    const actor = await exigirEdicion();
    const r = await reprogramarCitasDelDia(fecha, actor);
    refrescar();
    return r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo reprogramar.", movidas: [] };
  }
}
