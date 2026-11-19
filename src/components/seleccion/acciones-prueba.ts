"use client";

/** Acciones del modo de prueba (Candidatos › Selección): solo candidatos del chat de prueba, sin WhatsApp. */
import {
  citaProfesorPrueba,
  citarPrueba,
  claseProfesorPrueba,
  conceptoProfesorPrueba,
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
  observacion: observacionProfesorPrueba,
  concepto: conceptoProfesorPrueba,
  disponibilidad: { listar: disponibilidadPrueba, guardar: guardarDisponibilidadPrueba, quitar: quitarDisponibilidadPrueba, reprogramarDia: reprogramarDiaPrueba },
};
