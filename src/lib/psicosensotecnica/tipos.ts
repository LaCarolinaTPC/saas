/**
 * Prueba psicosensotécnica — lo que comparten el servidor y las pantallas (PURO).
 */

import type { ClavePrueba } from "./bateria";
import type { InformePrueba, Metrica, Sugerencia } from "./calificacion";

export type EstadoIntento = "asignado" | "en_curso" | "terminado" | "abandonado" | "anulado";
export type Concepto = "apto" | "no_apto";

export interface Intento {
  id: string;
  cedula: string;
  nombre: string | null;
  celular: string | null;
  candidateId: string | null;
  procesoId: string | null;
  origen: "candidato" | "libre";
  estado: EstadoIntento;
  asignadoPorEmail: string | null;
  asignadoEn: string | null;
  equipo: string | null;
  tipoEntrada: "tactil" | "raton" | null;
  agenteUsuario: string | null;
  versionBateria: string | null;
  iniciadoEn: string | null;
  terminadoEn: string | null;
  puntajeGlobal: number | null;
  sugerencia: Sugerencia | null;
  alertas: string[];
  concepto: Concepto | null;
  conceptoObservacion: string | null;
  conceptoPorEmail: string | null;
  conceptoEn: string | null;
  anuladoEn: string | null;
  anuladoPorEmail: string | null;
  motivoAnulacion: string | null;
  createdAt: string;
}

export interface PruebaIntento {
  prueba: ClavePrueba;
  metricas: Metrica[];
  alertas: string[];
  puntaje: number | null;
  /** Perfil del cargo e integridad: ajuste, banda, riesgos y preguntas para la entrevista. */
  informe: InformePrueba | null;
}

export interface IntentoDetalle extends Intento {
  pruebas: PruebaIntento[];
}

/** Lo que ve en la ficha quien no tiene el módulo: estado y concepto, sin puntajes. */
export interface ResumenIntento {
  id: string;
  estado: EstadoIntento;
  asignadoEn: string | null;
  terminadoEn: string | null;
  concepto: Concepto | null;
  conceptoObservacion: string | null;
  conceptoPorEmail: string | null;
  conceptoEn: string | null;
  /** Solo con permiso del módulo. */
  puntajeGlobal: number | null;
  sugerencia: Sugerencia | null;
  alertas: string[];
}

export interface Equipo {
  id: string;
  nombre: string;
  vinculado: boolean;
  /** Código vigente para vincularlo, si lo hay. */
  codigo: string | null;
  codigoExpira: string | null;
  ultimoUso: string | null;
  activo: boolean;
}

export const ETIQUETA_ESTADO: Record<EstadoIntento, string> = {
  asignado: "Por presentar",
  en_curso: "A medias",
  terminado: "Presentada",
  abandonado: "Abandonada",
  anulado: "Anulada",
};

/** Estado en una frase, igual en la bandeja y en la ficha del candidato. */
export function estadoLegible(i: { estado: EstadoIntento; concepto: Concepto | null }): string {
  if (i.estado === "terminado") return i.concepto === "apto" ? "Apto" : i.concepto === "no_apto" ? "No apto" : "Por revisar";
  return ETIQUETA_ESTADO[i.estado];
}

/** Pestañas de la bandeja (aquí y no en el componente: también las lee la página, en el servidor). */
export const PESTANAS = ["por_revisar", "pendientes", "revisadas", "todas"] as const;
export type Pestana = (typeof PESTANAS)[number];

export const RUTA_PUBLICA = "/prueba-psicosensotecnica";
export const RUTA_MODULO = "/psicosensotecnica";
