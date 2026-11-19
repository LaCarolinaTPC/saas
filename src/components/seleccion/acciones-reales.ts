"use client";

/** Acciones reales (Candidatos y /profesor) con la forma que esperan las pantallas compartidas. */
import {
  citar,
  datosParaCitar,
  disponibilidadProfesor,
  guardarDisponibilidadProfesor,
  quitarDisponibilidadProfesor,
  reprogramar,
  reprogramarDiaProfesor,
  vistaDeCitacion,
} from "@/app/(dashboard)/candidatos/agenda-actions";
import {
  citaDelProfesor,
  claseDelProfesor,
  conceptoDelProfesor,
  disponibilidadDelProfesor,
  guardarMiDisponibilidad,
  historialDeAspirante,
  observacionDelProfesor,
  pendientesProfesor,
  pruebaDelProfesor,
  quitarMiDisponibilidad,
  reprogramarMiDia,
  rutaDelProfesor,
  rutasDelProfesor,
} from "@/app/(dashboard)/profesor/actions";
import type { AccionesCitar, AccionesDisponibilidad, AccionesProfesor } from "./profesor-tipos";

export const CITAR_REAL: AccionesCitar = { datos: datosParaCitar, vista: vistaDeCitacion, citar, reprogramar };

/** Disponibilidad del profesor marcada por Gestión Humana (permiso de Candidatos). */
export const DISPONIBILIDAD_GH: AccionesDisponibilidad = {
  listar: disponibilidadProfesor,
  guardar: guardarDisponibilidadProfesor,
  quitar: quitarDisponibilidadProfesor,
  reprogramarDia: reprogramarDiaProfesor,
};

export const PROFESOR_REAL: AccionesProfesor = {
  pendientes: pendientesProfesor,
  historial: historialDeAspirante,
  rutas: rutasDelProfesor,
  cita: citaDelProfesor,
  prueba: pruebaDelProfesor,
  clase: claseDelProfesor,
  ruta: rutaDelProfesor,
  observacion: observacionDelProfesor,
  concepto: conceptoDelProfesor,
  disponibilidad: { listar: disponibilidadDelProfesor, guardar: guardarMiDisponibilidad, quitar: quitarMiDisponibilidad, reprogramarDia: reprogramarMiDia },
};
