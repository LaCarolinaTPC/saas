/**
 * Cálculo del reporte de rechazos por fase (funciones puras: la pantalla y
 * el Excel salen de aquí).
 */

export const SIN_FASE = "Sin dato";
export const SIN_CAUSA = "Sin causa registrada";
const CLAVE_SIN_FASE = "__sin_fase__";

export interface FilaRechazo {
  id: string;
  registrado_at: string;
  nombre: string | null;
  cedula: string | null;
  vacante: string | null;
  fase_origen: string | null;
  fase_origen_label: string | null;
  causa: string | null;
  nota: string | null;
  origen: string;
  registrado_por_email: string | null;
  revertido_at: string | null;
  revertido_por_email: string | null;
  revertido_a_fase: string | null;
}

export interface EtapaReporte {
  key: string;
  label: string;
  orden: number;
}

export interface Conteo {
  clave: string;
  etiqueta: string;
  total: number;
  /** Participación sobre el total de rechazos vigentes, 0-100 con un decimal. */
  pct: number;
}

export interface ResumenRechazos {
  total: number;
  revertidos: number;
  sinFase: number;
  sinCausa: number;
  porFase: Conteo[];
  porCausa: Conteo[];
  porVacante: Conteo[];
  mensual: { mes: string; total: number }[];
  /** Matriz fase × causa: celdas[i][j] = rechazos de la fase i por la causa j. */
  matriz: { fases: Conteo[]; causas: Conteo[]; celdas: number[][] };
  analisis: string[];
}

const fmtMes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" });

/** AAAA-MM del instante en hora de Bogotá. */
export function mesBogota(iso: string): string {
  return fmtMes.format(new Date(iso)).slice(0, 7);
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

function contar(claves: { clave: string; etiqueta: string }[], total: number): Conteo[] {
  const m = new Map<string, Conteo>();
  for (const { clave, etiqueta } of claves) {
    const c = m.get(clave) ?? { clave, etiqueta, total: 0, pct: 0 };
    c.total += 1;
    m.set(clave, c);
  }
  return [...m.values()].map((c) => ({ ...c, pct: pct(c.total, total) }));
}

export function resumirRechazos(filas: FilaRechazo[], etapas: EtapaReporte[]): ResumenRechazos {
  const vigentes = filas.filter((f) => !f.revertido_at);
  const total = vigentes.length;
  const etapa = new Map(etapas.map((e) => [e.key, e]));

  const faseDe = (f: FilaRechazo) =>
    f.fase_origen
      ? { clave: f.fase_origen, etiqueta: etapa.get(f.fase_origen)?.label ?? f.fase_origen_label ?? f.fase_origen }
      : { clave: CLAVE_SIN_FASE, etiqueta: SIN_FASE };
  const causaDe = (f: FilaRechazo) => {
    const c = f.causa?.trim() || SIN_CAUSA;
    return { clave: c, etiqueta: c };
  };

  // Fases en el orden del pipeline; las que ya no existen después y "Sin dato" al final.
  const ordenFase = (clave: string) =>
    clave === CLAVE_SIN_FASE ? Number.MAX_SAFE_INTEGER : etapa.get(clave)?.orden ?? Number.MAX_SAFE_INTEGER - 1;
  const porFase = contar(vigentes.map(faseDe), total).sort(
    (a, b) => ordenFase(a.clave) - ordenFase(b.clave) || a.etiqueta.localeCompare(b.etiqueta, "es")
  );
  const porCausa = contar(vigentes.map(causaDe), total).sort(
    (a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, "es")
  );
  const porVacante = contar(
    vigentes.map((f) => ({ clave: f.vacante ?? "", etiqueta: f.vacante ?? "Sin vacante" })),
    total
  ).sort((a, b) => b.total - a.total || a.etiqueta.localeCompare(b.etiqueta, "es"));

  const meses = new Map<string, number>();
  for (const f of vigentes) {
    const m = mesBogota(f.registrado_at);
    meses.set(m, (meses.get(m) ?? 0) + 1);
  }
  const mensual = [...meses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, n]) => ({ mes, total: n }));

  const iFase = new Map(porFase.map((c, i) => [c.clave, i]));
  const iCausa = new Map(porCausa.map((c, i) => [c.clave, i]));
  const celdas = porFase.map(() => porCausa.map(() => 0));
  for (const f of vigentes) celdas[iFase.get(faseDe(f).clave)!][iCausa.get(causaDe(f).clave)!] += 1;

  const sinFase = vigentes.filter((f) => !f.fase_origen).length;
  const sinCausa = vigentes.filter((f) => !f.causa?.trim()).length;

  const analisis: string[] = [];
  const conFase = porFase.filter((c) => c.clave !== CLAVE_SIN_FASE);
  if (conFase.length) {
    const top = conFase.reduce((a, b) => (b.total > a.total ? b : a));
    const i = iFase.get(top.clave)!;
    const causaTop = porCausa[celdas[i].indexOf(Math.max(...celdas[i]))];
    analisis.push(
      `La fase con más rechazos es ${top.etiqueta}: ${top.total} de ${total} (${top.pct}%)` +
        (causaTop ? `, sobre todo por "${causaTop.etiqueta}".` : ".")
    );
  }
  const causaTop = porCausa.find((c) => c.etiqueta !== SIN_CAUSA);
  if (causaTop) analisis.push(`La causa más frecuente es "${causaTop.etiqueta}": ${causaTop.total} rechazos (${causaTop.pct}%).`);
  if (sinFase) analisis.push(`${sinFase} rechazos (${pct(sinFase, total)}%) no tienen fase: son anteriores al registro y no dejaron rastro en el historial.`);
  if (sinCausa) analisis.push(`${sinCausa} rechazos (${pct(sinCausa, total)}%) son históricos sin causa registrada.`);

  return {
    total,
    revertidos: filas.length - total,
    sinFase,
    sinCausa,
    porFase,
    porCausa,
    porVacante,
    mensual,
    matriz: { fases: porFase, causas: porCausa, celdas },
    analisis,
  };
}

export const ORIGEN_LABEL: Record<string, string> = {
  pipeline: "Pipeline (Kanban)",
  tabla: "Tabla",
  procesos: "Procesos de contratación",
  historico: "Histórico",
};
