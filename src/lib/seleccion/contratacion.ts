/**
 * Condiciones para contratar a un aspirante (entrega 3, H2). PURO.
 *
 * Se exigen al pasar el proceso a «Contratado», dentro de
 * `cambiarEstadoProceso`: es el único punto por donde pasan la ficha, el
 * tablero y el formulario. Con el ajuste `contratar_exige_condiciones` en «no»
 * no se exige nada (como antes de la entrega 3). Quien tiene el permiso
 * «contratar con excepción» puede contratar aunque falte algo, con justificación.
 */
import { examenesAptos, type ExamenGuardado } from "./examenes";

export type EstadoCarpeta = "pendiente" | "recibido" | "validado";

export interface DatosContratar {
  examenes: readonly ExamenGuardado[];
  rutasAprendidas: number;
  rutasMinimas: number;
  /** Trabajó antes en la empresa: ya conoce las rutas. */
  reingreso: boolean;
  /** Documentos que debe tener la carpeta (ajuste `carpeta_items`). */
  itemsCarpeta: readonly string[];
  carpeta: readonly { item: string; estado: EstadoCarpeta }[];
  /** Visto bueno de la directora. */
  aprobada: boolean;
  /** Con `contratar_exige_psicotecnica`: el último concepto de la prueba psicosensotécnica. */
  exigePsicotecnica: boolean;
  psicotecnica: "apto" | "no_apto" | null;
  /** De dónde salió (entrega 4): «Apto (IPS …, 2026-11-20)». */
  psicotecnicaDetalle?: string;
}

export interface Condicion {
  id: "examenes" | "rutas" | "carpeta" | "psicotecnica" | "aprobacion";
  nombre: string;
  cumple: boolean;
  /** Lo que falta o el estado, en una frase. */
  detalle: string;
}

export function condicionesContratar(d: DatosContratar): { ok: boolean; condiciones: Condicion[]; faltan: string[] } {
  const fase = (f: 1 | 2) => d.examenes.find((e) => e.fase === f)?.resultado ?? "pendiente";
  const textoFase = (r: string) => (r === "apto" ? "apto" : r === "no_apto" ? "no apto" : "sin resultado");
  const pendientesCarpeta = d.itemsCarpeta.filter((i) => d.carpeta.find((c) => c.item === i)?.estado !== "validado");

  const condiciones: Condicion[] = [
    {
      id: "examenes",
      nombre: "Exámenes médicos aptos",
      cumple: examenesAptos(d.examenes),
      detalle: `Fase 1: ${textoFase(fase(1))} · fase 2: ${textoFase(fase(2))}`,
    },
    {
      id: "rutas",
      nombre: "Rutas aprendidas",
      cumple: d.reingreso || d.rutasAprendidas >= d.rutasMinimas,
      detalle: d.reingreso ? "Reingreso: ya conoce las rutas" : `${Math.min(d.rutasAprendidas, d.rutasMinimas)} de ${d.rutasMinimas}`,
    },
    {
      id: "carpeta",
      nombre: "Carpeta completa y validada",
      cumple: pendientesCarpeta.length === 0,
      detalle: pendientesCarpeta.length ? `Falta validar: ${pendientesCarpeta.join(", ")}` : "Todos los documentos validados",
    },
    ...(d.exigePsicotecnica
      ? [{
          id: "psicotecnica" as const,
          nombre: "Prueba psicosensotécnica apta",
          cumple: d.psicotecnica === "apto",
          detalle: d.psicotecnicaDetalle ?? (d.psicotecnica === "apto" ? "Apto" : d.psicotecnica === "no_apto" ? "No apto" : "Sin concepto de psicología"),
        }]
      : []),
    { id: "aprobacion", nombre: "Visto bueno de la directora", cumple: d.aprobada, detalle: d.aprobada ? "Aprobada" : "Pendiente" },
  ];
  const faltan = condiciones.filter((c) => !c.cumple).map((c) => `${c.nombre.toLowerCase()} (${c.detalle})`);
  return { ok: faltan.length === 0, condiciones, faltan };
}

/** Mensaje para quien intenta contratar sin cumplir. */
export const mensajeFaltan = (faltan: readonly string[]): string =>
  `Para contratar falta: ${faltan.join("; ")}. Quien tiene el permiso «contratar con excepción» puede hacerlo con una justificación.`;
