"use server";

/**
 * Pantalla del profesor de manejo (entrega 2): lo que tiene para el día y lo
 * que registra de cada aspirante. Ver exige `profesor.ver`; registrar,
 * `profesor.editar`. Nunca toca candidatos del chat de prueba (esos se prueban
 * en Candidatos › Selección).
 */
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/permissions";
import { actorUsuario } from "@/lib/contratacion/servidor";
import type { ExcepcionProfesor } from "@/lib/seleccion/agenda";
import {
  deshacerNoAsistio,
  guardarDisponibilidad,
  leerDisponibilidad,
  marcarLlegada,
  marcarNoAsistio,
  quitarDisponibilidad,
  reprogramarCitasDelDia,
  type ResultadoAgenda,
  type ResultadoDisponibilidad,
  type ResultadoReprogramarDia,
} from "@/lib/seleccion/agenda-servidor";
import {
  deshacerRegistro,
  enviarAExamenes,
  historialProfesor,
  pendientesDelProfesor,
  planExamenes,
  registrarClase,
  registrarConcepto,
  registrarObservacion,
  registrarPrueba,
  registrarReconocimiento,
  registrarReconocimientos,
  rutasParaReconocimiento,
  type ExamenesElegidos,
  type HistorialProfesor,
  type PendientesProfesor,
  type PlanExamenes,
  type RegistroProfesor,
  type ResultadoProfesor,
} from "@/lib/seleccion/profesor-servidor";
import type { DatosClase, DatosConcepto, DatosDisponibilidad, DatosPrueba, DatosRuta, DatosRutasDia } from "@/components/seleccion/profesor-tipos";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const mal = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "No se pudo completar." });
const refrescar = () => {
  revalidatePath("/profesor");
  revalidatePath("/candidatos");
};

async function exigirProfesor() {
  return actorUsuario(await exigirPermiso("profesor.editar"));
}

export async function pendientesProfesor(fecha: string): Promise<PendientesProfesor> {
  await exigirPermiso("profesor.ver");
  if (!FECHA_RE.test(fecha)) throw new Error("Fecha no válida.");
  return pendientesDelProfesor(fecha);
}

export async function historialDeAspirante(procesoId: string): Promise<HistorialProfesor> {
  await exigirPermiso("profesor.ver");
  return historialProfesor(procesoId);
}

export async function rutasDelProfesor(): Promise<string[]> {
  await exigirPermiso("profesor.ver");
  return rutasParaReconocimiento();
}

export async function citaDelProfesor(citaId: string, accion: "llego" | "no_asistio" | "deshacer"): Promise<ResultadoAgenda> {
  try {
    const actor = await exigirProfesor();
    const r = accion === "llego" ? await marcarLlegada(citaId, actor) : accion === "no_asistio" ? await marcarNoAsistio(citaId, actor) : await deshacerNoAsistio(citaId, actor);
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function pruebaDelProfesor(procesoId: string, d: DatosPrueba): Promise<ResultadoProfesor> {
  try {
    const r = await registrarPrueba(procesoId, d, await exigirProfesor());
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function claseDelProfesor(procesoId: string, d: DatosClase): Promise<ResultadoProfesor> {
  try {
    const r = await registrarClase(procesoId, d, await exigirProfesor());
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function rutaDelProfesor(procesoId: string, d: DatosRuta): Promise<ResultadoProfesor> {
  try {
    const r = await registrarReconocimiento(procesoId, d, await exigirProfesor());
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function rutasDiaDelProfesor(procesoId: string, d: DatosRutasDia): Promise<ResultadoProfesor> {
  try {
    const r = await registrarReconocimientos(procesoId, d, await exigirProfesor());
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function planExamenesDelProfesor(procesoId: string): Promise<PlanExamenes> {
  await exigirPermiso("profesor.ver");
  return planExamenes(procesoId);
}

export async function examenesDelProfesor(procesoId: string, elegidos?: ExamenesElegidos | null): Promise<ResultadoProfesor> {
  try {
    const r = await enviarAExamenes(procesoId, await exigirProfesor(), elegidos ?? null);
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function deshacerDelProfesor(procesoId: string, tipo: RegistroProfesor["tipo"], id: string): Promise<ResultadoProfesor> {
  try {
    const r = await deshacerRegistro(procesoId, tipo, id, await exigirProfesor());
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function observacionDelProfesor(procesoId: string, texto: string): Promise<ResultadoProfesor> {
  try {
    const r = await registrarObservacion(procesoId, texto, await exigirProfesor());
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function conceptoDelProfesor(procesoId: string, d: DatosConcepto): Promise<ResultadoProfesor> {
  try {
    const r = await registrarConcepto(procesoId, d, await exigirProfesor());
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function disponibilidadDelProfesor(desde: string, hasta: string): Promise<ExcepcionProfesor[]> {
  await exigirPermiso("profesor.ver");
  return leerDisponibilidad(desde, hasta);
}

export async function guardarMiDisponibilidad(ex: DatosDisponibilidad): Promise<ResultadoDisponibilidad> {
  try {
    // El profesor: las citas de hoy solo por un imprevisto y con tiempo para avisar (24-nov-2026).
    const r = await guardarDisponibilidad(ex, await exigirProfesor(), { reglaMismoDia: true });
    refrescar();
    return r;
  } catch (e) {
    return { ...mal(e), afectadas: [] };
  }
}

export async function quitarMiDisponibilidad(fecha: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await exigirProfesor();
    const r = await quitarDisponibilidad(fecha);
    refrescar();
    return r;
  } catch (e) {
    return mal(e);
  }
}

export async function reprogramarMiDia(fecha: string): Promise<ResultadoReprogramarDia> {
  try {
    const r = await reprogramarCitasDelDia(fecha, await exigirProfesor(), { reglaMismoDia: true });
    refrescar();
    return r;
  } catch (e) {
    return { ...mal(e), movidas: [] };
  }
}
