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

/** El mensaje que saldría con otra fecha u hora. */
export async function vistaDeCitacion(procesoId: string, cuando: { fecha: string; hora: string }, reprogramar: boolean): Promise<VistaCitacion | null> {
  await exigirLectura();
  return vistaCitacion(procesoId, cuando, reprogramar ? "cita_reprogramada" : "citacion");
}

export async function citar(procesoId: string, cuando: { fecha: string; hora: string }): Promise<ResultadoAgenda> {
  try {
    const actor = await exigirEdicion();
    const r = await citarProceso(procesoId, cuando, actor);
    refrescar();
    return r;
  } catch (e) {
    return sinPermiso(e);
  }
}

export async function reprogramar(citaId: string, cuando: { fecha: string; hora: string }, por: "aspirante" | "empresa"): Promise<ResultadoAgenda> {
  try {
    const actor = await exigirEdicion();
    const r = await reprogramarCita(citaId, cuando, por === "empresa" ? "empresa" : "aspirante", actor);
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
}

export async function agendaDelDia(fecha: string): Promise<AgendaDelDia> {
  await exigirLectura();
  const [citas, a, excepciones] = await Promise.all([citasDelDia(fecha), leerAjustesAgenda(), leerDisponibilidad(fecha, fecha)]);
  return { fecha, citas, horaPrueba: horaDelDia(fecha, a, excepciones), excepcion: excepciones[0] ?? null, reprogramacionesMax: a.reprogramacionesMax };
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
