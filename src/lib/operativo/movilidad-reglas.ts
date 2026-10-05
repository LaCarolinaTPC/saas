/**
 * Operativo · Movilidad — parte pura, usable en cliente.
 *
 * La base (get_movilidad_por_hora_json) entrega, por ruta, tipo de día y hora
 * de despacho, cuánto dura la vuelta (mediana y percentiles), cuántas salidas
 * hubo y los pasajeros por viaje. Aquí se clasifica cada hora en valle,
 * normal o pico, se arman las franjas de tiempo de vuelta sugerido y las
 * recomendaciones para el despacho.
 */

export type TipoDia = "LV" | "SAB" | "DOM";
export const TIPOS_DIA: TipoDia[] = ["LV", "SAB", "DOM"];
export const TIPO_DIA_LABEL: Record<TipoDia, string> = {
  LV: "Lunes a viernes",
  SAB: "Sábado",
  DOM: "Domingo y festivo",
};

export type Franja = "valle" | "normal" | "pico";
export const FRANJA_LABEL: Record<Franja, string> = { valle: "Valle", normal: "Normal", pico: "Pico" };
export const FRANJA_COLOR: Record<Franja, { fuerte: string; suave: string; texto: string }> = {
  valle: { fuerte: "#16a34a", suave: "#dcfce7", texto: "#166534" },
  normal: { fuerte: "#94a3b8", suave: "#f1f5f9", texto: "#475569" },
  pico: { fuerte: "#dc2626", suave: "#fee2e2", texto: "#991b1b" },
};

/** Una fila de la base: ruta × tipo de día × hora de despacho. */
export interface FilaMovilidad {
  ruta: string;
  tipoDia: TipoDia;
  /** Hora de despacho (0–23). */
  hora: number;
  /** Días distintos con operación de esa ruta en ese tipo de día. */
  dias: number;
  /** Viajes despachados con novedad NORMAL que salieron en esa hora. */
  salidas: number;
  /** De esas salidas, las que tienen una llegada válida (entran a la duración). */
  conDuracion: number;
  mediana: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  /** Mediana de timbradas por viaje. */
  pasajeros: number | null;
}

/** Hora ya analizada dentro del perfil de una ruta y un tipo de día. */
export interface HoraPerfil extends FilaMovilidad {
  /** Salidas promedio por día de ese tipo. */
  salidasDia: number;
  /** Tiene viajes suficientes para decidir con ella. */
  fiable: boolean;
  franja: Franja | null;
  /** Minutos de más frente a la mejor hora fiable. */
  extra: number | null;
  /** 0 = la mejor hora, 1 = la peor (escala del mapa de calor). */
  posicion: number | null;
}

export interface BloqueVuelta {
  desde: number;
  /** Hora inclusiva. */
  hasta: number;
  /** Tiempo de vuelta típico (mediana ponderada), redondeado a 5 min. */
  minutos: number;
  /** Tiempo con holgura (el mayor p75 del bloque), redondeado a 5 min. */
  conHolgura: number;
  franja: Franja;
}

export interface PerfilRuta {
  ruta: string;
  tipoDia: TipoDia;
  dias: number;
  horas: HoraPerfil[];
  mejor: HoraPerfil | null;
  peor: HoraPerfil | null;
  salidasDia: number;
  salidasDiaPico: number;
  salidasDiaValle: number;
  /** Mediana ponderada de la vuelta en el día. */
  vueltaPromedio: number | null;
  bloques: BloqueVuelta[];
}

export interface Recomendacion {
  tono: "accion" | "alerta" | "info";
  titulo: string;
  detalle: string;
}

/** Mínimo de viajes con duración para que una hora cuente en la decisión. */
export const MIN_VIAJES_FIABLE = 15;
/** Una hora es pico (o valle) si su vuelta se aleja del promedio del día más que esto: el mayor de los dos. */
export const TOLERANCIA_FRANJA_MIN = 10;
export const TOLERANCIA_FRANJA_PCT = 0.05;
/** Diferencia en minutos que abre un bloque nuevo de tiempo de vuelta. */
export const TOLERANCIA_BLOQUE = 12;

export const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_DIAS_RANGO = 800;
export const PERIODOS_RAPIDOS = [
  { dias: 30, label: "30 días" },
  { dias: 90, label: "90 días" },
  { dias: 180, label: "6 meses" },
  { dias: 365, label: "12 meses" },
] as const;

export const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
export const rangoHoras = (desde: number, hasta: number) =>
  desde === hasta ? `${hh(desde)}–${hh(desde + 1)}` : `${hh(desde)}–${hh(hasta + 1)}`;
export const minutosTexto = (m: number | null) => {
  if (m == null) return "—";
  const r = Math.round(m);
  const h = Math.floor(r / 60);
  const mm = r % 60;
  return h > 0 ? `${h} h ${String(mm).padStart(2, "0")} min` : `${mm} min`;
};
const redondear5 = (n: number) => Math.round(n / 5) * 5;
const uno = (n: number) => Math.round(n * 10) / 10;

export function rutasDe(filas: FilaMovilidad[]): string[] {
  return [...new Set(filas.map((f) => f.ruta))].sort((a, b) => a.localeCompare(b, "es"));
}

/** Analiza las horas de una ruta en un tipo de día. */
export function perfilRuta(filas: FilaMovilidad[], ruta: string, tipoDia: TipoDia): PerfilRuta {
  const propias = filas.filter((f) => f.ruta === ruta && f.tipoDia === tipoDia).sort((a, b) => a.hora - b.hora);
  const dias = propias[0]?.dias ?? 0;
  const fiables = propias.filter((f) => f.mediana != null && f.conDuracion >= MIN_VIAJES_FIABLE);
  const min = fiables.length ? Math.min(...fiables.map((f) => f.mediana!)) : null;
  const max = fiables.length ? Math.max(...fiables.map((f) => f.mediana!)) : null;
  const rango = min != null && max != null ? max - min : 0;

  // La franja se mide contra la vuelta promedio del día (ponderada por
  // viajes): pico si tarda más que el promedio por encima de la tolerancia,
  // valle si tarda menos. Medirla contra la mejor hora exageraba el pico en
  // las rutas cuya noche es mucho más rápida que todo el día.
  const pesoTotal = fiables.reduce((s, f) => s + f.conDuracion, 0);
  const promedio = pesoTotal > 0 ? fiables.reduce((s, f) => s + f.mediana! * f.conDuracion, 0) / pesoTotal : null;
  const tolerancia = promedio != null ? Math.max(TOLERANCIA_FRANJA_MIN, promedio * TOLERANCIA_FRANJA_PCT) : 0;

  const horas: HoraPerfil[] = propias.map((f) => {
    const fiable = f.mediana != null && f.conDuracion >= MIN_VIAJES_FIABLE;
    const posicion = fiable && min != null ? (rango > 0 ? (f.mediana! - min) / rango : 0) : null;
    const franja: Franja | null =
      !fiable || promedio == null
        ? null
        : f.mediana! >= promedio + tolerancia ? "pico" : f.mediana! <= promedio - tolerancia ? "valle" : "normal";
    return {
      ...f,
      salidasDia: dias > 0 ? uno(f.salidas / dias) : 0,
      fiable,
      franja,
      extra: fiable && min != null ? uno(f.mediana! - min) : null,
      posicion,
    };
  });

  const conDato = horas.filter((h) => h.fiable);
  const mejor = conDato.reduce<HoraPerfil | null>((a, h) => (!a || h.mediana! < a.mediana! ? h : a), null);
  const peor = conDato.reduce<HoraPerfil | null>((a, h) => (!a || h.mediana! > a.mediana! ? h : a), null);
  const suma = (xs: HoraPerfil[]) => uno(xs.reduce((s, h) => s + h.salidasDia, 0));

  return {
    ruta,
    tipoDia,
    dias,
    horas,
    mejor,
    peor,
    salidasDia: suma(horas),
    salidasDiaPico: suma(horas.filter((h) => h.franja === "pico")),
    salidasDiaValle: suma(horas.filter((h) => h.franja === "valle")),
    vueltaPromedio: promedio != null ? uno(promedio) : null,
    bloques: bloquesDeVuelta(conDato),
  };
}

/**
 * Agrupa horas seguidas con tiempos de vuelta parecidos (±TOLERANCIA_BLOQUE
 * frente al promedio del bloque) para programar un tiempo por franja en vez
 * de uno fijo todo el día.
 */
export function bloquesDeVuelta(horas: HoraPerfil[]): BloqueVuelta[] {
  const out: BloqueVuelta[] = [];
  let actual: HoraPerfil[] = [];
  const cerrar = () => {
    if (!actual.length) return;
    const peso = actual.reduce((s, h) => s + h.conDuracion, 0);
    const prom = actual.reduce((s, h) => s + h.mediana! * h.conDuracion, 0) / peso;
    // La franja del bloque es la que más horas tiene; empate → normal.
    const cuenta = { valle: 0, normal: 0, pico: 0 };
    for (const h of actual) cuenta[h.franja ?? "normal"]++;
    const franja: Franja =
      cuenta.pico > cuenta.normal && cuenta.pico > cuenta.valle ? "pico"
        : cuenta.valle > cuenta.normal && cuenta.valle > cuenta.pico ? "valle" : "normal";
    out.push({
      desde: actual[0].hora,
      hasta: actual[actual.length - 1].hora,
      minutos: redondear5(prom),
      conHolgura: redondear5(Math.max(...actual.map((h) => h.p75 ?? h.mediana!))),
      franja,
    });
    actual = [];
  };
  for (const h of horas) {
    if (actual.length) {
      const prev = actual[actual.length - 1];
      const peso = actual.reduce((s, x) => s + x.conDuracion, 0);
      const prom = actual.reduce((s, x) => s + x.mediana! * x.conDuracion, 0) / peso;
      if (h.hora !== prev.hora + 1 || Math.abs(h.mediana! - prom) > TOLERANCIA_BLOQUE) cerrar();
    }
    actual.push(h);
  }
  cerrar();
  return out;
}

/** Franjas seguidas de una misma clase, para nombrarlas en las recomendaciones. */
function tramos(horas: HoraPerfil[], franja: Franja): { desde: number; hasta: number; horas: HoraPerfil[] }[] {
  const out: { desde: number; hasta: number; horas: HoraPerfil[] }[] = [];
  for (const h of horas) {
    if (h.franja !== franja) continue;
    const ult = out[out.length - 1];
    if (ult && ult.hasta === h.hora - 1) {
      ult.hasta = h.hora;
      ult.horas.push(h);
    } else out.push({ desde: h.hora, hasta: h.hora, horas: [h] });
  }
  return out;
}

const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });

/** Lecturas del perfil que sirven para decidir cambios al despacho. */
export function recomendaciones(p: PerfilRuta): Recomendacion[] {
  const out: Recomendacion[] = [];
  if (!p.mejor || !p.peor) return out;
  const fiables = p.horas.filter((h) => h.fiable);
  const dif = p.peor.mediana! - p.mejor.mediana!;

  const picos = tramos(p.horas, "pico");
  const valles = tramos(p.horas, "valle");
  if (!picos.length) {
    out.push({
      tono: "info",
      titulo: "Sin horas pico marcadas",
      detalle: `Ninguna hora se aleja del promedio del día (${minutosTexto(p.vueltaPromedio)}) lo suficiente. Un tiempo de vuelta fijo funciona; mover salidas de hora casi no ahorra tiempo.`,
    });
  }

  const enValle = p.horas.filter((h) => h.franja === "valle");
  const pesoValle = enValle.reduce((s, h) => s + h.conDuracion, 0);
  const vueltaValle = pesoValle > 0 ? enValle.reduce((s, h) => s + h.mediana! * h.conDuracion, 0) / pesoValle : null;
  const valleDia = valles.length ? valles.map((t) => rangoHoras(t.desde, t.hasta)).join(" y ") : null;

  for (const t of picos) {
    const salidas = uno(t.horas.reduce((s, h) => s + h.salidasDia, 0));
    const peso = t.horas.reduce((s, h) => s + h.conDuracion, 0);
    const vueltaPico = t.horas.reduce((s, h) => s + h.mediana! * h.conDuracion, 0) / peso;
    const sobrePromedio = vueltaPico - (p.vueltaPromedio ?? vueltaPico);
    const ahorro = vueltaValle != null ? vueltaPico - vueltaValle : null;
    out.push({
      tono: "accion",
      titulo: `Pico de ${rangoHoras(t.desde, t.hasta)}: vuelta de ${minutosTexto(vueltaPico)}`,
      detalle:
        `Son ${fmt(sobrePromedio)} min más que el promedio del día y salen ${fmt(salidas)} buses por día en esa franja ` +
        `(${fmt(p.salidasDia > 0 ? (salidas / p.salidasDia) * 100 : 0)}% del día). ` +
        (ahorro != null && valleDia
          ? `Cada salida que se corra a ${valleDia} libera unos ${fmt(ahorro)} min de bus y de conductor. `
          : "") +
        `Si se mantienen, programe la vuelta en ${redondear5(Math.max(...t.horas.map((h) => h.p75 ?? h.mediana!)))} min para no represar el terminal.`,
    });
  }

  // Demanda frente a la vuelta: pasajeros por viaje respecto al promedio de la ruta.
  const conPax = fiables.filter((h) => h.pasajeros != null && h.salidas > 0);
  const totalSal = conPax.reduce((s, h) => s + h.salidas, 0);
  const paxProm = totalSal > 0 ? conPax.reduce((s, h) => s + h.pasajeros! * h.salidas, 0) / totalSal : 0;
  if (paxProm > 0) {
    const bajaEnPico = conPax.filter((h) => h.franja === "pico" && h.pasajeros! < paxProm * 0.85);
    if (bajaEnPico.length) {
      out.push({
        tono: "accion",
        titulo: "Pico lento con poca gente: candidatas a reducir",
        detalle:
          bajaEnPico.map((h) => `${hh(h.hora)} (${fmt(h.pasajeros!)} pasajeros/viaje)`).join(", ") +
          ` llevan menos pasajeros que el promedio de la ruta (${fmt(paxProm)}) y su vuelta es de las más lentas.`,
      });
    }
    const altaEnValle = conPax.filter((h) => h.franja === "valle" && h.pasajeros! > paxProm * 1.15);
    if (altaEnValle.length) {
      out.push({
        tono: "accion",
        titulo: "Vuelta rápida con buena demanda: candidatas a reforzar",
        detalle:
          altaEnValle.map((h) => `${hh(h.hora)} (${fmt(h.pasajeros!)} pasajeros/viaje, ${fmt(h.salidasDia)} salidas/día)`).join(", ") +
          ` superan el promedio de pasajeros (${fmt(paxProm)}) y la vuelta es de las más cortas.`,
      });
    }
  }

  // Horas impredecibles: mucha distancia entre el 10% más rápido y el 10% más lento.
  const variables = fiables
    .filter((h) => h.p10 != null && h.p90 != null && h.p90 - h.p10 > 60)
    .sort((a, b) => b.p90! - b.p10! - (a.p90! - a.p10!));
  if (variables.length) {
    out.push({
      tono: "alerta",
      titulo: "Horas con vuelta impredecible",
      detalle:
        variables.slice(0, 4).map((h) => `${hh(h.hora)} (de ${Math.round(h.p10!)} a ${Math.round(h.p90!)} min)`).join(", ") +
        ". Ahí conviene dejar holgura o ajustar la frecuencia en vivo: el mismo despacho puede tardar una hora más de un día a otro.",
    });
  }

  out.push({
    tono: "info",
    titulo: `Mejor hora para salir: ${hh(p.mejor.hora)} (${minutosTexto(p.mejor.mediana)})`,
    detalle: `La peor es ${hh(p.peor.hora)} con ${minutosTexto(p.peor.mediana)}: ${fmt(dif)} min más por vuelta.`,
  });
  return out;
}

/** CSV del perfil, separado por punto y coma para que Excel en español lo abra bien. */
export function perfilCsv(p: PerfilRuta, desde: string, hasta: string): string {
  const enc = [
    "Ruta", "Tipo de día", "Periodo", "Hora", "Franja", "Salidas", "Salidas por día", "Viajes con llegada",
    "Vuelta mediana (min)", "P10", "P25", "P75", "P90", "Min. más que la mejor hora", "Pasajeros por viaje",
  ];
  const num = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
  const filas = p.horas.map((h) => [
    p.ruta, TIPO_DIA_LABEL[p.tipoDia], `${desde} a ${hasta}`, hh(h.hora), h.franja ? FRANJA_LABEL[h.franja] : "Pocos datos",
    h.salidas, num(h.salidasDia), h.conDuracion, num(h.mediana), num(h.p10), num(h.p25), num(h.p75), num(h.p90),
    num(h.extra), num(h.pasajeros),
  ]);
  return [enc, ...filas].map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
}
