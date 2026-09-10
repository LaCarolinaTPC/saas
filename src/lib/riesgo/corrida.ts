/**
 * Una corrida completa del análisis de riesgo: lee las fuentes, arma el panel,
 * entrena, puntúa a los conductores del corte y devuelve todo listo para
 * guardar o para pintar.
 *
 * Se entrenan cuatro modelos, no dos. Los de corte temporal (`mR`, `mN`)
 * entrenan con los meses viejos y se miden contra los dos más recientes: son
 * los únicos cuyas métricas se pueden publicar. Los finales (`fR`, `fN`)
 * entrenan con todo lo evaluable y son los que puntúan hoy — sus métricas
 * saldrían optimistas porque la prueba está dentro de su propio entrenamiento,
 * así que no se reportan. La tasa base coincide en ambos: los dos se evalúan
 * contra el mismo conjunto de prueba.
 */
import { dig } from "./fechas";
import { leerFuentes, type Db, type Fuentes } from "./datos";
import {
  construirPanel,
  dividir,
  evaluables,
  filasDelCorte,
  retirosPorMes,
  MESES_PANEL,
  type Division,
} from "./panel";
import { entrenar, nivel, puntuar, tasaPorTramo, type Modelo, type Nivel, type Tramo } from "./modelo";
import { ETIQUETA, KEYS, type Fila, type Objetivo } from "./variables";

// ── Lo que una corrida deja ──────────────────────────────────────────────────

export interface Coeficiente {
  key: string;
  etiqueta: string;
  /** Peso estandarizado: positivo suma riesgo, negativo lo resta. */
  peso: number;
}

export interface MetricasModelo {
  auc: number;
  /** Tasa observada del resultado en el conjunto de prueba: el umbral de los niveles. */
  base: number;
  n: number;
  nTest: number;
  positivos: number;
  liftTop10: number;
  capturaTop20: number;
  precisionTop10: number;
  mesesTest: string[];
  coeficientes: Coeficiente[];
}

export interface FactorConductor {
  key: string;
  etiqueta: string;
  z: number;
}

export interface ConductorPuntuado {
  cedula: string;
  codigo: string | null;
  nombre: string;
  tipoConductor: string | null;
  probRetiro: number;
  nivelRetiro: Nivel;
  factoresRetiro: FactorConductor[];
  probNovedad: number;
  nivelNovedad: Nivel;
  factoresNovedad: FactorConductor[];
  variables: Record<string, number>;
}

export interface TablaTramos {
  titulo: string;
  datos: { etiqueta: string; n: number; tasa: number }[];
}

export interface ResumenRiesgo {
  /** Conductores en plantilla al corte según el maestro (incluye relevos y afiliados). */
  plantilla: number;
  retiroAlto: number;
  retiroMedio: number;
  novedadAlto: number;
  novedadMedio: number;
}

export interface ResultadoCorrida {
  corte: string;
  cortes: string[];
  /** Filas conductor-mes del panel. */
  observaciones: number;
  resumen: ResumenRiesgo;
  modelos: { retiro: MetricasModelo; novedad: MetricasModelo };
  puntuados: ConductorPuntuado[];
  descriptivos: TablaTramos[];
  retirosMes: { mes: string; plantilla: number; retiros: number; tasa: number }[];
  conteos: Fuentes["conteos"];
  cierresSinCedula: number;
  duracionMs: number;
}

// ── Tramos de las tablas descriptivas ────────────────────────────────────────

const tramosCount = (max: number): Tramo[] => [
  { etiqueta: "0", test: (v) => v === 0 },
  { etiqueta: "1", test: (v) => v === 1 },
  { etiqueta: "2", test: (v) => v === 2 },
  { etiqueta: "3 o más", test: (v) => v >= 3 && v <= max },
];

const tramosAntig: Tramo[] = [
  { etiqueta: "Menos de 3 meses", test: (v) => v < 3 },
  { etiqueta: "3 a 6 meses", test: (v) => v >= 3 && v < 6 },
  { etiqueta: "6 a 12 meses", test: (v) => v >= 6 && v < 12 },
  { etiqueta: "1 a 3 años", test: (v) => v >= 12 && v < 36 },
  { etiqueta: "Más de 3 años", test: (v) => v >= 36 },
];

function construirDescriptivos(evR: Fila[], evN: Fila[]): TablaTramos[] {
  return [
    {
      titulo: "Retiro en 60 días según antigüedad",
      datos: tasaPorTramo(evR, "antig_meses", "retiro60", tramosAntig),
    },
    {
      titulo: "Retiro en 60 días según no justificadas en 90 días",
      datos: tasaPorTramo(evR, "nj90", "retiro60", tramosCount(999)),
    },
    {
      titulo: "Retiro en 60 días según ausencias en 90 días",
      datos: tasaPorTramo(evR, "aus90", "retiro60", [
        { etiqueta: "0", test: (v) => v === 0 },
        { etiqueta: "1 a 2", test: (v) => v >= 1 && v <= 2 },
        { etiqueta: "3 a 5", test: (v) => v >= 3 && v <= 5 },
        { etiqueta: "6 o más", test: (v) => v >= 6 },
      ]),
    },
    {
      titulo: "Retiro en 60 días según viajes perdidos por el conductor en 90 días",
      datos: tasaPorTramo(evR, "vp_cond90", "retiro60", [
        { etiqueta: "0", test: (v) => v === 0 },
        { etiqueta: "1 a 3", test: (v) => v >= 1 && v <= 3 },
        { etiqueta: "4 a 10", test: (v) => v >= 4 && v <= 10 },
        { etiqueta: "Más de 10", test: (v) => v > 10 },
      ]),
    },
    {
      titulo: "Retiro en 60 días según tipo de conductor",
      datos: [
        ...tasaPorTramo(evR, "es_relevo", "retiro60", [
          { etiqueta: "Fijo", test: (v) => v === 0 },
          { etiqueta: "Relevo", test: (v) => v === 1 },
        ]),
        ...tasaPorTramo(evR, "es_afiliado", "retiro60", [
          { etiqueta: "Empresa", test: (v) => v === 0 },
          { etiqueta: "Afiliado", test: (v) => v === 1 },
        ]),
      ],
    },
    {
      titulo: "Falta no justificada en 30 días según no justificadas en los 30 días previos",
      datos: tasaPorTramo(evN, "nj30", "novedad30", tramosCount(999)),
    },
    {
      titulo: "Falta no justificada en 30 días según reincidencia (3+ ausencias en 30 días)",
      datos: tasaPorTramo(evN, "reincidente30", "novedad30", [
        { etiqueta: "No", test: (v) => v === 0 },
        { etiqueta: "Sí", test: (v) => v === 1 },
      ]),
    },
    {
      titulo: "Falta no justificada en 30 días según soportes pendientes en 90 días",
      datos: tasaPorTramo(evN, "sop_pend90", "novedad30", tramosCount(999)),
    },
    {
      titulo: "Falta no justificada en 30 días según antigüedad",
      datos: tasaPorTramo(evN, "antig_meses", "novedad30", tramosAntig),
    },
  ];
}

// ── Corrida ──────────────────────────────────────────────────────────────────

function metricas(m: Modelo, d: Division): MetricasModelo {
  return {
    auc: m.auc,
    base: m.base,
    n: m.n,
    nTest: m.nTest,
    positivos: m.positivos,
    liftTop10: m.liftTop10,
    capturaTop20: m.capturaTop20,
    precisionTop10: m.precisionTop10,
    mesesTest: d.mesesTest.map((x) => x.slice(0, 7)),
    coeficientes: m.keys
      .map((k, j) => ({ key: k, etiqueta: ETIQUETA[k] ?? k, peso: m.w[j] }))
      .sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso)),
  };
}

/** Los cuatro modelos y las divisiones, expuestos para el informe de consola. */
export interface Modelos {
  mR: Modelo;
  mN: Modelo;
  fR: Modelo;
  fN: Modelo;
  dR: Division;
  dN: Division;
}

export interface Corrida {
  resultado: ResultadoCorrida;
  /** Modelos crudos: los necesita el informe HTML del script, no la pantalla. */
  modelos: Modelos;
  panelFilas: Fila[];
  filasDelCorte: Fila[];
}

export interface OpcionesCorrida {
  corte: string;
  meses?: number;
  /** Fuentes ya leídas, para no bajarlas dos veces. */
  fuentes?: Fuentes;
  onProgreso?: (mensaje: string) => void;
}

export async function ejecutarCorrida(db: Db, opts: OpcionesCorrida): Promise<Corrida> {
  const inicio = Date.now();
  const corte = opts.corte;
  const meses = opts.meses ?? MESES_PANEL;
  const log = opts.onProgreso ?? (() => {});

  const fuentes = opts.fuentes ?? (await leerFuentes(db));
  const { conductores, series, conteos, cierresSinCedula } = fuentes;
  log(
    `conductores ${conteos.conductores} · registros ${conteos.registros} · viajes perdidos ` +
      `${conteos.viajesPerdidos} · cierres ${conteos.cierres} · incapacidades ${conteos.incapacidades}`
  );
  log(`cierres sin cédula resoluble: ${cierresSinCedula}`);
  const depurado =
    conteos.comodinesOmitidos + conteos.sinOperacionOmitidas + conteos.duplicadasPorCodigo;
  if (depurado > 0) {
    log(
      `maestro depurado: ${conteos.comodinesOmitidos} comodín(es) · ` +
        `${conteos.sinOperacionOmitidas} ficha(s) sin código de conductor · ` +
        `${conteos.duplicadasPorCodigo} duplicada(s) por código`
    );
  }

  const panel = construirPanel(conductores, series, corte, meses);
  log(`panel: ${panel.filas.length} filas conductor-mes en ${panel.cortes.length} cortes`);

  const evR = evaluables(panel.filas, "retiro60");
  const evN = evaluables(panel.filas, "novedad30");
  const dR = dividir(evR);
  const dN = dividir(evN);
  const mR = entrenar(dR.train, dR.test, "retiro60");
  const mN = entrenar(dN.train, dN.test, "novedad30");
  // Modelos finales: entrenan con todo lo evaluable y son los que puntúan hoy.
  const fR = entrenar(evR, dR.test, "retiro60");
  const fN = entrenar(evN, dN.test, "novedad30");

  const porCedula = new Map(conductores.map((c) => [dig(c.cedula), c]));
  const filasCorte = filasDelCorte(conductores, series, corte);
  const factores = (fs: { key: string; z: number }[]): FactorConductor[] =>
    fs.map((f) => ({ key: f.key, etiqueta: ETIQUETA[f.key] ?? f.key, z: f.z }));

  const puntuados: ConductorPuntuado[] = filasCorte
    .map((f) => {
      const r = puntuar(fR, f.x);
      const n = puntuar(fN, f.x);
      const c = porCedula.get(f.cedula);
      return {
        cedula: f.cedula,
        codigo: c?.codigo ?? null,
        nombre: f.nombre,
        tipoConductor: c?.tipo_conductor ?? null,
        probRetiro: r.p,
        nivelRetiro: nivel(r.p, fR.base),
        factoresRetiro: factores(r.factores),
        probNovedad: n.p,
        nivelNovedad: nivel(n.p, fN.base),
        factoresNovedad: factores(n.factores),
        variables: f.x,
      };
    })
    .sort((a, b) => b.probRetiro - a.probRetiro);

  const cuenta = (nv: Nivel, campo: "nivelRetiro" | "nivelNovedad") =>
    puntuados.filter((p) => p[campo] === nv).length;

  const resultado: ResultadoCorrida = {
    corte,
    cortes: panel.cortes,
    observaciones: panel.filas.length,
    resumen: {
      plantilla: puntuados.length,
      retiroAlto: cuenta("Alto", "nivelRetiro"),
      retiroMedio: cuenta("Medio", "nivelRetiro"),
      novedadAlto: cuenta("Alto", "nivelNovedad"),
      novedadMedio: cuenta("Medio", "nivelNovedad"),
    },
    modelos: { retiro: metricas(mR, dR), novedad: metricas(mN, dN) },
    puntuados,
    descriptivos: construirDescriptivos(evR, evN),
    retirosMes: retirosPorMes(conductores, panel, corte),
    conteos,
    cierresSinCedula,
    duracionMs: Date.now() - inicio,
  };

  return { resultado, modelos: { mR, mN, fR, fN, dR, dN }, panelFilas: panel.filas, filasDelCorte: filasCorte };
}

/** Resumen de una línea de un modelo, para la consola del script. */
export function resumenModelo(m: MetricasModelo): string {
  const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
  return (
    `AUC ${m.auc.toFixed(3)} · base ${pct(m.base)} · top 10% precisión ${pct(m.precisionTop10)} ` +
    `(lift ${m.liftTop10.toFixed(1)}x) · top 20% captura ${pct(m.capturaTop20, 0)} · ` +
    `entrena ${m.n} / prueba ${m.nTest} (${m.mesesTest.join(", ")})`
  );
}

export { KEYS, ETIQUETA };
export type { Objetivo };
