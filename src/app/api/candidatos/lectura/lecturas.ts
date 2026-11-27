/**
 * Lecturas de la ficha del proceso que van por la ruta /api/candidatos/lectura
 * (27-nov-2026). Son las mismas funciones del servidor (cada una revisa sus
 * permisos); solo cambia el camino: las server actions de una página corren de
 * a una y al abrir la ficha eran ~9 lecturas en fila (más de 10 s); por la ruta
 * van en paralelo. Solo lecturas: nada aquí cambia datos.
 */
import { antecedentesDelProceso, datosFichaProceso, procesoCompleto } from "@/lib/contratacion/actions";
import { datosEntrega3 } from "@/app/(dashboard)/candidatos/entrega3-actions";
import { datosDiaContratacion, datosExperiencia, documentosLeidos } from "@/app/(dashboard)/candidatos/entrega4-actions";
import { citasYProfesorDeProceso } from "@/app/(dashboard)/candidatos/agenda-actions";
import { botonesPlantillasPrueba, fichaPrueba } from "@/lib/seleccion/prueba-actions";
import { candidatosDePrueba } from "@/lib/seleccion/prueba-profesor-actions";

export const LECTURAS_FICHA = {
  antecedentesDelProceso,
  datosFichaProceso,
  procesoCompleto,
  datosEntrega3,
  datosDiaContratacion,
  datosExperiencia,
  documentosLeidos,
  citasYProfesorDeProceso,
  // Chat de prueba de Selección: la ficha del candidato de prueba y lo que el chat lee al abrirse.
  fichaPrueba,
  candidatosDePrueba,
  botonesPlantillasPrueba,
};

export type LecturasFicha = typeof LECTURAS_FICHA;
