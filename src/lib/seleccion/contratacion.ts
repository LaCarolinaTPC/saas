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
import type { AvanceRutas } from "./rutas";
import { permiteSeguir, type VeredictoAntecedentes } from "./antecedentes";

/** Lo que se sabe de los antecedentes del proceso para decidir si se puede contratar. */
export interface AntecedentesContratar {
  /** Veredicto con las reglas vigentes (o el guardado); null si no se ha consultado. */
  veredicto: VeredictoAntecedentes | null;
  /** Decisión de una persona sobre un hallazgo: «aprobado» o «rechazado». */
  decision: string | null;
  /** Columna «Antecedentes» de siempre (`ok`, `con_antecedentes`…): vale para los procesos de antes de la entrega 3. */
  legado: string | null;
}

/**
 * ¿Los antecedentes dejan contratar? Igual que para citar (`permiteSeguir`):
 * limpio o tolerable; revisión o descarte, solo aprobados por una persona.
 * Un proceso sin consultas en Croma vale con «Sin antecedentes» puesto a mano.
 */
export function antecedentesPermitenContratar(a: AntecedentesContratar): { cumple: boolean; detalle: string } {
  if (a.decision === "rechazado") return { cumple: false, detalle: "Rechazados por una persona" };
  if (permiteSeguir(a.veredicto, a.decision)) {
    const detalle = a.decision === "aprobado" && a.veredicto !== "limpio" && a.veredicto !== "tolerable"
      ? "Hallazgos aprobados por una persona"
      : a.veredicto === "tolerable"
        ? "Hallazgos que las reglas toleran"
        : "Sin hallazgos";
    return { cumple: true, detalle };
  }
  if (a.veredicto === "revision" || a.veredicto === "descarta") return { cumple: false, detalle: "Tienen hallazgos que esperan la decisión de una persona" };
  if (!a.veredicto && a.legado === "ok") return { cumple: true, detalle: "Sin antecedentes (registrado a mano)" };
  if (!a.veredicto && a.legado === "con_antecedentes") return { cumple: false, detalle: "Con antecedentes (registrado a mano), sin revisar en Gestivo" };
  return { cumple: false, detalle: "Sin resolver: faltan fuentes por consultar o revisar a mano" };
}

export type EstadoCarpeta = "pendiente" | "recibido" | "validado";

export interface DatosContratar {
  examenes: readonly ExamenGuardado[];
  rutasAprendidas: number;
  rutasMinimas: number;
  /** Desde el 21-nov-2026: el avance con los nombres y las obligatorias (manda sobre los dos números). */
  rutas?: AvanceRutas;
  /** Trabajó antes en la empresa: ya conoce las rutas. */
  reingreso: boolean;
  /** El encargado dio por terminado el reconocimiento de ruta (24-nov-2026). */
  reconocimientoFinalizado?: boolean;
  /** Documentos que debe tener la carpeta (ajuste `carpeta_items`). */
  itemsCarpeta: readonly string[];
  carpeta: readonly { item: string; estado: EstadoCarpeta }[];
  /** Visto bueno de la directora. */
  aprobada: boolean;
  /** Con `contratar_exige_psicotecnica`: el último concepto de la prueba psicotécnica. */
  exigePsicotecnica: boolean;
  psicotecnica: "apto" | "no_apto" | null;
  /** De dónde salió (entrega 4): «Apto (IPS …, 2026-11-20)». */
  psicotecnicaDetalle?: string;
  /**
   * Antecedentes resueltos (23-nov-2026): sin esto, un hallazgo en revisión o
   * que descarta, sin decidir, no frenaba la contratación. Sin el dato no se exige.
   */
  antecedentes?: AntecedentesContratar;
}

export interface Condicion {
  id: "antecedentes" | "examenes" | "rutas" | "carpeta" | "psicotecnica" | "aprobacion";
  nombre: string;
  cumple: boolean;
  /** Lo que falta o el estado, en una frase. */
  detalle: string;
}

export function condicionesContratar(d: DatosContratar): { ok: boolean; condiciones: Condicion[]; faltan: string[] } {
  const fase = (f: 1 | 2) => d.examenes.find((e) => e.fase === f)?.resultado ?? "pendiente";
  const textoFase = (r: string) => (r === "apto" ? "apto" : r === "no_apto" ? "no apto" : "sin resultado");
  const pendientesCarpeta = d.itemsCarpeta.filter((i) => d.carpeta.find((c) => c.item === i)?.estado !== "validado");

  const antecedentes = d.antecedentes ? antecedentesPermitenContratar(d.antecedentes) : null;

  const condiciones: Condicion[] = [
    ...(antecedentes ? [{ id: "antecedentes" as const, nombre: "Antecedentes resueltos", ...antecedentes }] : []),
    {
      id: "examenes",
      nombre: "Exámenes médicos aptos",
      cumple: examenesAptos(d.examenes),
      detalle: `Fase 1: ${textoFase(fase(1))} · fase 2: ${textoFase(fase(2))}`,
    },
    {
      id: "rutas",
      nombre: "Reconocimiento de ruta terminado",
      cumple: d.reingreso || d.reconocimientoFinalizado === true || (d.rutas ? d.rutas.completas : d.rutasAprendidas >= d.rutasMinimas),
      detalle: d.reingreso
        ? "Reingreso: ya conoce las rutas"
        : d.reconocimientoFinalizado
          ? // 25-nov-2026: si lo terminó sin completar las rutas, quien revisa para contratar lo ve aquí.
            d.rutas && !d.rutas.completas
            ? `Lo dio por terminado el encargado sin completar las rutas (${d.rutas.detalle})`
            : "Lo dio por terminado el encargado del reconocimiento"
          : d.rutas
            ? d.rutas.detalle
            : `${Math.min(d.rutasAprendidas, d.rutasMinimas)} de ${d.rutasMinimas}`,
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
          nombre: "Prueba psicotécnica apta",
          cumple: d.psicotecnica === "apto",
          detalle: d.psicotecnicaDetalle ?? (d.psicotecnica === "apto" ? "Apto" : d.psicotecnica === "no_apto" ? "No apto" : "Sin resultado registrado"),
        }]
      : []),
    { id: "aprobacion", nombre: "Visto bueno de la directora", cumple: d.aprobada, detalle: d.aprobada ? "Aprobada" : "Pendiente" },
  ];
  const faltan = condiciones.filter((c) => !c.cumple).map((c) => `${c.nombre.toLowerCase()} (${c.detalle})`);
  return { ok: faltan.length === 0, condiciones, faltan };
}

/**
 * Etapas desde las que un proceso puede quedar «Listo para contratar»: las dos
 * últimas. Antes no puede cumplir (le falta la fase 2 de exámenes), así que ni se revisa.
 */
export const ETAPAS_ANTES_DE_LISTO = ["en_examenes_fase2", "reconocimiento_ruta"] as const;
export const ESTADO_LISTO = "listo_contratar";

/**
 * ¿Está listo para contratar? (25-nov-2026): cumple todas las condiciones menos
 * el visto bueno de la directora, que es justo lo que Gestión Humana hace al
 * revisarlo en esa etapa. `faltan`: lo que le falta, sin contar el visto bueno.
 */
export function listoParaContratar(condiciones: readonly Condicion[]): { listo: boolean; faltan: string[] } {
  const sinVistoBueno = condiciones.filter((c) => c.id !== "aprobacion");
  const faltan = sinVistoBueno.filter((c) => !c.cumple).map((c) => `${c.nombre.toLowerCase()} (${c.detalle})`);
  // Sin ninguna condición que revisar no hay nada que lo sostenga.
  return { listo: sinVistoBueno.length > 0 && faltan.length === 0, faltan };
}

/**
 * Qué hacer con la etapa según las condiciones: «sube» a listo, «baja» a la
 * etapa de la que venía, o nada. Con las condiciones apagadas nadie se mueve solo.
 */
export function movimientoListo(estado: string | null | undefined, exigir: boolean, listo: boolean): "sube" | "baja" | null {
  if (!exigir || !estado) return null;
  if (estado === ESTADO_LISTO) return listo ? null : "baja";
  return listo && (ETAPAS_ANTES_DE_LISTO as readonly string[]).includes(estado) ? "sube" : null;
}

/** Mensaje para quien intenta contratar sin cumplir. */
export const mensajeFaltan = (faltan: readonly string[]): string =>
  `Para contratar falta: ${faltan.join("; ")}. Quien tiene el permiso «contratar con excepción» puede hacerlo con una justificación.`;
