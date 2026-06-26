// ============================================================================
// Política de Correctivos por Accidentalidad Vial — motor de evaluación
// Fuente única de verdad (cliente + servidor) para clasificación, matriz de
// ponderación, escala de correctivos y reglas de reincidencia.
//
// Basado en el documento "Política de Correctivos por Accidentalidad Vial".
// ============================================================================

// ── Clasificación / gravedad ────────────────────────────────────────────────

export type Gravedad = "leve" | "moderado" | "grave" | "fatal";

export const GRAVEDAD: Record<
  Gravedad,
  { label: string; puntaje: number; descripcion: string }
> = {
  leve: {
    label: "Leve",
    puntaje: 5,
    descripcion: "Daños menores. Sin lesionados. Bajo impacto operativo.",
  },
  moderado: {
    label: "Moderado",
    puntaje: 10,
    descripcion: "Daños significativos. Lesiones leves. Afectación parcial de la operación.",
  },
  grave: {
    label: "Grave",
    puntaje: 20,
    descripcion: "Lesiones incapacitantes. Altos costos. Riesgo jurídico o reputacional.",
  },
  fatal: {
    label: "Crítico / Fatal",
    puntaje: 40,
    descripcion: "Fallecimientos. Pérdida total del vehículo. Riesgo penal o administrativo.",
  },
};

export const GRAVEDAD_ORDEN: Gravedad[] = ["leve", "moderado", "grave", "fatal"];

// ── Responsabilidad / causalidad ────────────────────────────────────────────

export type Responsabilidad = "directo" | "compartido" | "tercero" | "en_estudio";

export const RESPONSABILIDAD: Record<Responsabilidad, { label: string }> = {
  directo: { label: "Responsable directo" },
  compartido: { label: "Responsabilidad compartida" },
  tercero: { label: "Responsable un tercero" },
  en_estudio: { label: "En estudio" },
};

/** ¿La responsabilidad recae (total o parcialmente) en nuestro conductor? */
export function conResponsabilidad(r: Responsabilidad): boolean {
  return r === "directo" || r === "compartido";
}

// ── Matriz de ponderación: factores agravantes y atenuantes ─────────────────

export type FactorKey =
  | "reincidencia"
  | "exceso_velocidad"
  | "uso_celular"
  | "no_guardar_distancia"
  | "fatiga_comprobada"
  | "antiguedad_3a_sin_eventos"
  | "conductor_destacado";

export type Factor = {
  key: FactorKey;
  label: string;
  puntaje: number;
  tipo: "agravante" | "atenuante";
  /** Se deriva automáticamente del histórico/antigüedad y no se marca a mano. */
  auto?: boolean;
};

export const FACTORES: Record<FactorKey, Factor> = {
  reincidencia: {
    key: "reincidencia",
    label: "Reincidencia",
    puntaje: 15,
    tipo: "agravante",
    auto: true,
  },
  exceso_velocidad: {
    key: "exceso_velocidad",
    label: "Exceso de velocidad",
    puntaje: 15,
    tipo: "agravante",
  },
  uso_celular: {
    key: "uso_celular",
    label: "Uso de celular",
    puntaje: 15,
    tipo: "agravante",
  },
  no_guardar_distancia: {
    key: "no_guardar_distancia",
    label: "No guardar distancia",
    puntaje: 10,
    tipo: "agravante",
  },
  // NOTA: el documento original asigna -5 a "fatiga comprobada", pero la fatiga
  // es un factor de negligencia que incrementa el riesgo; se modela como +5
  // (agravante). Ajustar aquí si la política se actualiza.
  fatiga_comprobada: {
    key: "fatiga_comprobada",
    label: "Fatiga comprobada",
    puntaje: 5,
    tipo: "agravante",
  },
  antiguedad_3a_sin_eventos: {
    key: "antiguedad_3a_sin_eventos",
    label: "Antigüedad mayor a 3 años sin eventos",
    puntaje: -10,
    tipo: "atenuante",
    auto: true,
  },
  conductor_destacado: {
    key: "conductor_destacado",
    label: "Conductor destacado en seguridad",
    puntaje: -15,
    tipo: "atenuante",
  },
};

/** Factores que el evaluador marca manualmente (no se derivan del sistema). */
export const FACTORES_MANUALES: Factor[] = Object.values(FACTORES).filter((f) => !f.auto);

// ── Eximentes / atenuantes (no puntúan, pero matizan el correctivo) ──────────

export type EximenteKey =
  | "falla_mecanica"
  | "caso_fortuito"
  | "tercero_responsable"
  | "antiguedad_sobresaliente"
  | "actuacion_preventiva";

export const EXIMENTES: Record<EximenteKey, { label: string }> = {
  falla_mecanica: { label: "Fallas mecánicas certificadas" },
  caso_fortuito: { label: "Caso fortuito o fuerza mayor" },
  tercero_responsable: { label: "Responsabilidad demostrada de terceros" },
  antiguedad_sobresaliente: { label: "Antigüedad sobresaliente sin historial negativo" },
  actuacion_preventiva: { label: "Actuación preventiva para evitar consecuencias mayores" },
};

// ── Escala de correctivos (Nivel I–IV) ──────────────────────────────────────

export type Nivel = "ninguno" | "I" | "II" | "III" | "IV";

export const NIVELES: Record<
  Exclude<Nivel, "ninguno">,
  { nombre: string; aplicaPara: string[]; medidas: string[] }
> = {
  I: {
    nombre: "Nivel I — Preventivo",
    aplicaPara: ["Primer evento leve", "Baja responsabilidad", "Sin reincidencia"],
    medidas: [
      "Retroalimentación formal",
      "Capacitación obligatoria",
      "Reinducción en seguridad vial",
      "Seguimiento durante 30 días",
    ],
  },
  II: {
    nombre: "Nivel II — Correctivo Moderado",
    aplicaPara: [
      "Reincidencia en accidentes leves",
      "Evento moderado con responsabilidad parcial o total",
    ],
    medidas: [
      "Memorando disciplinario",
      "Suspensión temporal de la operación",
      "Evaluación técnica de conducción",
      "Capacitación intensiva",
      "Restricción operativa temporal",
    ],
  },
  III: {
    nombre: "Nivel III — Correctivo Grave",
    aplicaPara: [
      "Accidente grave atribuible al conductor",
      "Negligencia comprobada",
      "Dos o más accidentes en 3 meses",
    ],
    medidas: [
      "Suspensión laboral temporal",
      "Pérdida de incentivos",
      "Comité disciplinario",
      "Seguimiento psicológico y médico",
    ],
  },
  IV: {
    nombre: "Nivel IV — Sanción Crítica",
    aplicaPara: [
      "Accidente fatal evitable",
      "Conducción bajo alcohol o sustancias",
      "Exceso de velocidad grave",
      "Omisión deliberada de protocolos",
      "Reincidencia sistemática",
    ],
    medidas: [
      "Terminación del vínculo contractual conforme a la ley",
      "Reporte a autoridades competentes",
      "Exclusión de operación",
      "Acciones legales o de repetición",
    ],
  },
};

// ── Cálculo de puntaje (matriz de ponderación) ──────────────────────────────

export type EvaluacionInput = {
  gravedad: Gravedad | null;
  responsabilidad: Responsabilidad;
  /** Factores agravantes/atenuantes activos (incluye los auto-derivados). */
  factores: FactorKey[];
  /** Eximentes marcados por el evaluador. */
  eximentes?: EximenteKey[];
  /** Reincidencia detectada en los últimos 3 meses (con responsabilidad). */
  reincidente3m?: boolean;
};

export type FactorAplicado = { key: FactorKey; label: string; puntaje: number };

/** Suma la gravedad + factores activos según la matriz de ponderación. */
export function computePuntaje(input: EvaluacionInput): {
  puntaje: number;
  detalle: FactorAplicado[];
} {
  const detalle: FactorAplicado[] = [];
  let puntaje = 0;

  if (input.gravedad) {
    const g = GRAVEDAD[input.gravedad];
    puntaje += g.puntaje;
    detalle.push({ key: ("gravedad_" + input.gravedad) as FactorKey, label: `Accidente ${g.label.toLowerCase()}`, puntaje: g.puntaje });
  }

  for (const key of input.factores) {
    const f = FACTORES[key];
    if (!f) continue;
    puntaje += f.puntaje;
    detalle.push({ key: f.key, label: f.label, puntaje: f.puntaje });
  }

  return { puntaje, detalle };
}

/** Umbral de la política: >20 puntos marca riesgo alto / reincidente. */
export const UMBRAL_RIESGO_ALTO = 20;

export function nivelRiesgo(puntaje: number): "bajo" | "medio" | "alto" {
  if (puntaje > UMBRAL_RIESGO_ALTO) return "alto";
  if (puntaje >= 10) return "medio";
  return "bajo";
}

// ── Sugerencia de Nivel de correctivo ───────────────────────────────────────

export function sugerirNivel(input: EvaluacionInput): {
  nivel: Nivel;
  motivos: string[];
} {
  const motivos: string[] = [];
  const resp = input.responsabilidad;
  const conResp = conResponsabilidad(resp);
  const grav = input.gravedad;
  const tieneEximente = (input.eximentes ?? []).length > 0;
  const negligenciaGrave =
    input.factores.includes("exceso_velocidad") || input.factores.includes("uso_celular");
  const reincidente = Boolean(input.reincidente3m) || input.factores.includes("reincidencia");

  if (!grav) return { nivel: "ninguno", motivos: ["Falta clasificar la gravedad."] };

  // Sin responsabilidad de nuestro conductor → no aplica correctivo disciplinario
  if (!conResp) {
    return {
      nivel: "ninguno",
      motivos: [
        resp === "tercero"
          ? "Responsabilidad atribuida a un tercero."
          : "Responsabilidad en estudio: se define tras el dictamen.",
      ],
    };
  }

  // Nivel IV — Sanción crítica
  if (grav === "fatal") {
    motivos.push("Accidente fatal con responsabilidad atribuible al conductor.");
    return { nivel: "IV", motivos };
  }
  if (grav === "grave" && negligenciaGrave) {
    motivos.push("Accidente grave con negligencia (exceso de velocidad / uso de celular).");
    return { nivel: "IV", motivos };
  }

  // Nivel III — Correctivo grave
  if (grav === "grave") {
    motivos.push("Accidente grave atribuible al conductor.");
    return { nivel: "III", motivos };
  }
  if (reincidente) {
    motivos.push("Dos o más accidentes con responsabilidad en los últimos 3 meses.");
    return { nivel: "III", motivos };
  }

  // Nivel II — Correctivo moderado
  if (grav === "moderado") {
    motivos.push("Evento moderado con responsabilidad parcial o total.");
    if (tieneEximente) motivos.push("Se registraron eximentes/atenuantes: valorar en comité.");
    return { nivel: "II", motivos };
  }

  // Nivel I — Preventivo (primer evento leve con responsabilidad)
  if (grav === "leve") {
    if (tieneEximente) {
      motivos.push("Evento leve con eximentes/atenuantes registrados.");
      return { nivel: "ninguno", motivos };
    }
    motivos.push("Primer evento leve con responsabilidad y sin reincidencia.");
    return { nivel: "I", motivos };
  }

  return { nivel: "ninguno", motivos };
}

/** El Comité de Accidentalidad evalúa todo accidente moderado, grave o fatal. */
export function requiereComite(gravedad: Gravedad | null): boolean {
  return gravedad === "moderado" || gravedad === "grave" || gravedad === "fatal";
}

export function medidasDeNivel(nivel: Nivel): string[] {
  if (nivel === "ninguno") return [];
  return NIVELES[nivel].medidas;
}

export function nombreNivel(nivel: Nivel): string {
  if (nivel === "ninguno") return "Sin correctivo disciplinario";
  return NIVELES[nivel].nombre;
}
