"use client";

/** Acciones del modo de prueba (Candidatos › Selección): solo candidatos del chat de prueba, sin WhatsApp. */
import type { ExamenesElegidos } from "@/lib/seleccion/profesor-servidor";
import { ahoraPruebaIso } from "./reloj-prueba";
import {
  citaProfesorPrueba,
  citarPrueba,
  claseProfesorPrueba,
  conceptoProfesorPrueba,
  deshacerProfesorPrueba,
  examenesProfesorPrueba,
  planExamenesProfesorPrueba,
  rutasDiaProfesorPrueba,
  datosParaCitarPrueba,
  disponibilidadPrueba,
  guardarDisponibilidadPrueba,
  historialProfesorPrueba,
  observacionProfesorPrueba,
  pendientesProfesorPrueba,
  pruebaProfesorPrueba,
  quitarDisponibilidadPrueba,
  reprogramarDiaPrueba,
  reprogramarPrueba,
  rutaProfesorPrueba,
  rutasProfesorPrueba,
  vistaCitacionPrueba,
} from "@/lib/seleccion/prueba-profesor-actions";
import type { AccionesCitar, AccionesProfesor } from "./profesor-tipos";

export const CITAR_PRUEBA: AccionesCitar = {
  datos: (id) => datosParaCitarPrueba(id),
  vista: vistaCitacionPrueba,
  citar: citarPrueba,
  reprogramar: reprogramarPrueba,
};

export const PROFESOR_PRUEBA: AccionesProfesor = {
  pendientes: pendientesProfesorPrueba,
  historial: historialProfesorPrueba,
  rutas: rutasProfesorPrueba,
  cita: citaProfesorPrueba,
  prueba: pruebaProfesorPrueba,
  clase: claseProfesorPrueba,
  ruta: rutaProfesorPrueba,
  rutasDia: rutasDiaProfesorPrueba,
  // Con el reloj de prueba adelantado, la fecha del examen cuenta desde ese día (27-nov-2026). Se manda
  // siempre la fecha del plan: el servidor no conoce el reloj de prueba si no se la dicen.
  planExamenes: (procesoId: string) => planExamenesProfesorPrueba(procesoId, ahoraPruebaIso()),
  examenes: (procesoId: string, elegidos?: ExamenesElegidos | null) => examenesProfesorPrueba(procesoId, elegidos ?? null, ahoraPruebaIso()),
  deshacer: deshacerProfesorPrueba,
  observacion: observacionProfesorPrueba,
  concepto: conceptoProfesorPrueba,
  disponibilidad: { listar: disponibilidadPrueba, guardar: guardarDisponibilidadPrueba, quitar: quitarDisponibilidadPrueba, reprogramarDia: reprogramarDiaPrueba },
};
