/**
 * Tesorería · Conciliación de abonos — parte pura, usable en cliente.
 *
 * Un abono (GEMA, tabla `abonos`) es dinero que el conductor entrega por un
 * viaje ANTES de que el viaje se recaude: verificado el 2026-10-05 en los
 * 23.683 abonos vigentes desde 2025-01-01, ninguno quedó registrado después
 * del recaudo. Con concepto INGRESAR el recaudo llega el mismo minuto y por el
 * mismo valor; con REVISIÓN CÁMARA, AUTORIZADO y los demás llega horas o días
 * después y por otro valor (el neto final del viaje).
 *
 * La conciliación junta, por viaje, los abonos vigentes con el recaudo de
 * `viajes_recaudados`:
 *  - pendiente: hay abono y el viaje todavía no tiene recaudo;
 *  - cuadrado: recaudo neto = abonos (± TOLERANCIA_PESOS);
 *  - recaudo_mayor: el recaudo final fue mayor que lo abonado;
 *  - recaudo_menor: se abonó más de lo que se recaudó;
 *  - anulado: el viaje solo tiene abonos anulados.
 *
 * Aparte del cruce con el recaudo, cada abono trae su estado en GEMA
 * (estado / estado_texto): 1 GESTIONADO, 0 POR GESTIONAR, 2 ANULADO. Los POR
 * GESTIONAR (6 el 2026-10-05, dos de ellos con meses) son los abonos que GEMA
 * misma tiene pendientes; cuentan como vigentes y se marcan en la pantalla.
 */

/** Estado del abono en GEMA (columna estado). */
export const ESTADO_GEMA = { POR_GESTIONAR: 0, GESTIONADO: 1, ANULADO: 2 } as const;
export const ESTADO_GEMA_COLOR: Record<string, { suave: string; texto: string }> = {
  GESTIONADO: { suave: "#f1f5f9", texto: "#334155" },
  "POR GESTIONAR": { suave: "#fef3c7", texto: "#92400e" },
  ANULADO: { suave: "#f1f5f9", texto: "#94a3b8" },
};

export type EstadoConciliacion = "pendiente" | "recaudo_mayor" | "recaudo_menor" | "cuadrado" | "anulado";
export const ESTADOS_CONCILIACION: EstadoConciliacion[] = ["pendiente", "recaudo_mayor", "recaudo_menor", "cuadrado", "anulado"];

export const ESTADO_LABEL: Record<EstadoConciliacion, string> = {
  pendiente: "Abono sin recaudo",
  recaudo_mayor: "Recaudo mayor que lo abonado",
  recaudo_menor: "Recaudo menor que lo abonado",
  cuadrado: "Cuadrado",
  anulado: "Solo abonos anulados",
};
export const ESTADO_AYUDA: Record<EstadoConciliacion, string> = {
  pendiente: "El conductor entregó dinero y el viaje todavía no se ha recaudado en GEMA.",
  recaudo_mayor: "El neto recaudado del viaje superó lo abonado: la diferencia se cobró o se debe cobrar al recaudar.",
  recaudo_menor: "Se abonó más de lo que finalmente se recaudó: hay un sobrante por aclarar.",
  cuadrado: "El neto recaudado es igual a lo abonado.",
  anulado: "Todos los abonos del viaje se anularon en GEMA.",
};
export const ESTADO_COLOR: Record<EstadoConciliacion, { fuerte: string; suave: string; texto: string }> = {
  pendiente: { fuerte: "#d97706", suave: "#fef3c7", texto: "#92400e" },
  recaudo_mayor: { fuerte: "#2563eb", suave: "#dbeafe", texto: "#1e40af" },
  recaudo_menor: { fuerte: "#dc2626", suave: "#fee2e2", texto: "#991b1b" },
  cuadrado: { fuerte: "#16a34a", suave: "#dcfce7", texto: "#166534" },
  anulado: { fuerte: "#94a3b8", suave: "#f1f5f9", texto: "#475569" },
};

/** Diferencias menores a esto se consideran cuadradas (redondeos de caja). */
export const TOLERANCIA_PESOS = 1000;
/** Un abono sin recaudo pasadas estas horas se marca como atrasado. */
export const HORAS_PENDIENTE_ATRASADO = 24;
export const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_DIAS_RANGO = 366;
/** Ventana en la que se buscan abonos sin recaudo, sea cual sea el periodo elegido. */
export const DIAS_BUSQUEDA_PENDIENTES = 90;

export interface AbonoRaw {
  id_abono: number;
  id_viaje: number | null;
  valor_abono: number | string | null;
  fecha_abono: string;
  concepto_abono: string | null;
  estado: number | null;
  estado_texto: string | null;
  fecha_viaje: string | null;
  num_viaje: number | null;
  codigo_vehiculo: string | null;
  placa_vehiculo: string | null;
  usuario_generacion: string | null;
}

export interface RecaudoRaw {
  numero: number;
  neto: number | string | null;
  bruto: number | string | null;
  fecha_recaudo: string | null;
  cajero: string | null;
  conductor_nombre: string | null;
  cedula_conductor: string | null;
  ruta_reprogramada: string | null;
}

export interface DespachoRaw {
  numero: number;
  conductor: string | null;
  conductor_ced: string | null;
  ruta_reprogramada: string | null;
  estado: string | null;
  novedad: string | null;
}

export interface Abono {
  id: number;
  valor: number;
  fecha: string;
  concepto: string;
  /** Estado tal como lo escribe GEMA (GESTIONADO, POR GESTIONAR, ANULADO…). */
  estadoTexto: string;
  anulado: boolean;
  porGestionar: boolean;
  usuario: string | null;
}

export interface FilaConciliacion {
  idViaje: number;
  fechaViaje: string | null;
  numViaje: number | null;
  codigoVehiculo: string | null;
  placa: string | null;
  conductor: string | null;
  cedula: string | null;
  ruta: string | null;
  /** Estado del viaje en el despacho, útil cuando no hay recaudo. */
  estadoDespacho: string | null;
  abonos: Abono[];
  /** Suma de los abonos vigentes. */
  abonado: number;
  /** Concepto del primer abono vigente (o del primero, si todos están anulados). */
  concepto: string;
  /** Todos los conceptos distintos del viaje, en orden de registro. */
  conceptos: string[];
  /** Estados de GEMA distintos de los abonos del viaje, en orden de registro. */
  estadosGema: string[];
  /** Abonos vigentes que GEMA tiene POR GESTIONAR. */
  porGestionar: number;
  primerAbono: string;
  recaudoNeto: number | null;
  recaudoBruto: number | null;
  fechaRecaudo: string | null;
  cajero: string | null;
  /** Recaudo neto − abonado; null si no hay recaudo. */
  diferencia: number | null;
  /** Horas entre el primer abono y el recaudo (o hasta ahora, si está pendiente). */
  horas: number | null;
  estado: EstadoConciliacion;
}

const num = (v: number | string | null | undefined) => (v == null || v === "" ? null : Number(v));

/** "2026-10-03T11:48:44" o "2026-10-03 11:48:44" → milisegundos tratando la hora como local. */
function ms(fecha: string): number {
  return Date.parse(`${fecha.replace(" ", "T").slice(0, 19)}Z`);
}

/**
 * Arma la conciliación por viaje. `ahora` es el corte del recaudo (hora local
 * de Colombia, "AAAA-MM-DDTHH:MM:SS", el mismo reloj de GEMA), para medir la
 * antigüedad de los pendientes.
 */
export function conciliar(
  abonos: AbonoRaw[],
  recaudos: RecaudoRaw[],
  despachos: DespachoRaw[],
  ahora: string
): FilaConciliacion[] {
  const rec = new Map(recaudos.map((r) => [Number(r.numero), r]));
  const desp = new Map(despachos.map((d) => [Number(d.numero), d]));
  const porViaje = new Map<number, AbonoRaw[]>();
  for (const a of abonos) {
    if (a.id_viaje == null) continue;
    const id = Number(a.id_viaje);
    porViaje.set(id, [...(porViaje.get(id) ?? []), a]);
  }

  const filas: FilaConciliacion[] = [];
  for (const [idViaje, lista] of porViaje) {
    const ordenados = [...lista].sort((a, b) => a.fecha_abono.localeCompare(b.fecha_abono));
    const items: Abono[] = ordenados.map((a) => {
      const texto = a.estado_texto?.trim().toUpperCase() || (a.estado == null ? "SIN ESTADO" : `ESTADO ${a.estado}`);
      return {
        id: Number(a.id_abono),
        valor: num(a.valor_abono) ?? 0,
        fecha: a.fecha_abono.replace(" ", "T").slice(0, 19),
        concepto: a.concepto_abono?.trim() || "SIN CONCEPTO",
        estadoTexto: texto,
        anulado: a.estado === ESTADO_GEMA.ANULADO || texto === "ANULADO",
        porGestionar: a.estado === ESTADO_GEMA.POR_GESTIONAR || texto === "POR GESTIONAR",
        usuario: a.usuario_generacion,
      };
    });
    const vigentes = items.filter((a) => !a.anulado);
    const base = vigentes[0] ?? items[0];
    const abonado = vigentes.reduce((s, a) => s + a.valor, 0);
    const r = rec.get(idViaje);
    const d = desp.get(idViaje);
    const conRecaudo = r && r.fecha_recaudo ? r : null;
    const recaudoNeto = conRecaudo ? (num(conRecaudo.neto) ?? 0) : null;
    const diferencia = recaudoNeto == null || vigentes.length === 0 ? null : recaudoNeto - abonado;
    const fechaRecaudo = conRecaudo?.fecha_recaudo ? conRecaudo.fecha_recaudo.replace(" ", "T").slice(0, 19) : null;
    // Sin recaudo, la espera se mide hasta `ahora` (el corte del recaudo); un
    // abono posterior al corte todavía no podía tener recaudo: espera 0.
    const horas = vigentes.length
      ? Math.max(0, Math.round(((fechaRecaudo ? ms(fechaRecaudo) : ms(ahora)) - ms(base.fecha)) / 36e5 * 10) / 10)
      : null;

    let estado: EstadoConciliacion;
    if (vigentes.length === 0) estado = "anulado";
    else if (diferencia == null) estado = "pendiente";
    else if (Math.abs(diferencia) < TOLERANCIA_PESOS) estado = "cuadrado";
    else estado = diferencia > 0 ? "recaudo_mayor" : "recaudo_menor";

    const a0 = ordenados[0];
    filas.push({
      idViaje,
      fechaViaje: a0.fecha_viaje,
      numViaje: a0.num_viaje,
      codigoVehiculo: a0.codigo_vehiculo,
      placa: a0.placa_vehiculo,
      conductor: conRecaudo?.conductor_nombre ?? r?.conductor_nombre ?? d?.conductor ?? null,
      cedula: conRecaudo?.cedula_conductor ?? r?.cedula_conductor ?? d?.conductor_ced ?? null,
      ruta: r?.ruta_reprogramada ?? d?.ruta_reprogramada ?? null,
      estadoDespacho: d?.estado ?? null,
      abonos: items,
      abonado,
      concepto: base.concepto,
      conceptos: [...new Set(items.map((a) => a.concepto))],
      estadosGema: [...new Set(items.map((a) => a.estadoTexto))],
      porGestionar: vigentes.filter((a) => a.porGestionar).length,
      primerAbono: base.fecha,
      recaudoNeto,
      recaudoBruto: conRecaudo ? num(conRecaudo.bruto) : null,
      fechaRecaudo,
      cajero: conRecaudo?.cajero ?? null,
      diferencia,
      horas,
      estado,
    });
  }
  return filas.sort((a, b) => b.primerAbono.localeCompare(a.primerAbono));
}

export interface Totales {
  viajes: number;
  /** Viajes con algún abono POR GESTIONAR en GEMA, y cuánto suman esos abonos. */
  porGestionar: { viajes: number; abonado: number };
  abonos: number;
  abonado: number;
  recaudado: number;
  /** Suma de (recaudo − abonado) en los viajes con recaudo. */
  diferenciaNeta: number;
  porEstado: Record<EstadoConciliacion, { viajes: number; abonado: number; diferencia: number }>;
}

export function totales(filas: FilaConciliacion[]): Totales {
  const porEstado = Object.fromEntries(
    ESTADOS_CONCILIACION.map((e) => [e, { viajes: 0, abonado: 0, diferencia: 0 }])
  ) as Totales["porEstado"];
  const t: Totales = { viajes: 0, porGestionar: { viajes: 0, abonado: 0 }, abonos: 0, abonado: 0, recaudado: 0, diferenciaNeta: 0, porEstado };
  for (const f of filas) {
    t.viajes++;
    t.abonos += f.abonos.filter((a) => !a.anulado).length;
    t.abonado += f.abonado;
    if (f.porGestionar > 0) {
      t.porGestionar.viajes++;
      t.porGestionar.abonado += f.abonos.filter((a) => a.porGestionar && !a.anulado).reduce((s, a) => s + a.valor, 0);
    }
    if (f.recaudoNeto != null && f.estado !== "anulado") t.recaudado += f.recaudoNeto;
    if (f.diferencia != null) t.diferenciaNeta += f.diferencia;
    porEstado[f.estado].viajes++;
    porEstado[f.estado].abonado += f.abonado;
    porEstado[f.estado].diferencia += f.diferencia ?? 0;
  }
  return t;
}

export interface ResumenConcepto {
  concepto: string;
  viajes: number;
  abonado: number;
  recaudado: number;
  diferencia: number;
  cuadrados: number;
  pendientes: number;
  /** Mediana de horas entre el abono y el recaudo. */
  horasMediana: number | null;
}

const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Agrupa por una clave (concepto, usuario que registró, cajero…). */
export function resumirPor(filas: FilaConciliacion[], clave: (f: FilaConciliacion) => string | null): ResumenConcepto[] {
  const grupos = new Map<string, FilaConciliacion[]>();
  for (const f of filas) {
    if (f.estado === "anulado") continue;
    const k = clave(f) ?? "Sin dato";
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return [...grupos.entries()]
    .map(([concepto, fs]) => ({
      concepto,
      viajes: fs.length,
      abonado: fs.reduce((s, f) => s + f.abonado, 0),
      recaudado: fs.reduce((s, f) => s + (f.recaudoNeto ?? 0), 0),
      diferencia: fs.reduce((s, f) => s + (f.diferencia ?? 0), 0),
      cuadrados: fs.filter((f) => f.estado === "cuadrado").length,
      pendientes: fs.filter((f) => f.estado === "pendiente").length,
      horasMediana: mediana(fs.filter((f) => f.estado !== "pendiente" && f.horas != null).map((f) => f.horas!)),
    }))
    .sort((a, b) => b.abonado - a.abonado);
}

export function coincide(f: FilaConciliacion, q: string): boolean {
  if (!q) return true;
  const t = q.toLowerCase();
  return (
    String(f.idViaje).includes(t) ||
    (f.codigoVehiculo ?? "").toLowerCase().includes(t) ||
    (f.placa ?? "").toLowerCase().includes(t) ||
    (f.conductor ?? "").toLowerCase().includes(t) ||
    (f.cedula ?? "").includes(t) ||
    (f.cajero ?? "").toLowerCase().includes(t) ||
    f.abonos.some((a) => (a.usuario ?? "").toLowerCase().includes(t) || a.concepto.toLowerCase().includes(t) || a.estadoTexto.toLowerCase().includes(t))
  );
}

/** CSV separado por punto y coma para Excel en español. */
export function conciliacionCsv(filas: FilaConciliacion[]): string {
  const enc = [
    "Viaje", "Fecha viaje", "Vuelta", "Vehículo", "Placa", "Conductor", "Cédula", "Ruta", "Concepto", "Estado en GEMA", "Primer abono",
    "Abonos vigentes", "Abonado", "Recaudo neto", "Fecha recaudo", "Cajero", "Diferencia (recaudo − abonado)",
    "Horas abono→recaudo", "Estado", "Registró el abono",
  ];
  const n = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
  const filasCsv = filas.map((f) => [
    f.idViaje, f.fechaViaje ?? "", f.numViaje ?? "", f.codigoVehiculo ?? "", f.placa ?? "", f.conductor ?? "", f.cedula ?? "",
    f.ruta ?? "", f.conceptos.join(" / "), f.estadosGema.join(" / "), f.primerAbono.replace("T", " "), f.abonos.filter((a) => !a.anulado).length, n(f.abonado),
    n(f.recaudoNeto), f.fechaRecaudo?.replace("T", " ") ?? "", f.cajero ?? "", n(f.diferencia), n(f.horas),
    ESTADO_LABEL[f.estado], [...new Set(f.abonos.map((a) => a.usuario).filter(Boolean))].join(", "),
  ]);
  return [enc, ...filasCsv].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
}
