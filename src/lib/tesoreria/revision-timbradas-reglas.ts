/**
 * Revisión de timbradas (Tesorería → Revisión cartulina): reglas puras.
 *
 * Traducción 1:1 de `procesar_dia()` del script de Tesorería
 * `generar_informe_timbradas.py` (spec `/validate-data` v5 + política de
 * descuentos del 13/08/2026 + cortesía nocturna corregida el 24/09/2026).
 * Cruza, por viaje del histórico de despacho, los eventos de geocerca del
 * terminal (puntos virtuales), el recaudo y las timbradas descontadas, y
 * clasifica el viaje en uno de siete estados.
 *
 * Un cambio de política futuro entra como tabla nueva con su fecha de corte:
 * las tablas anteriores no se tocan porque sirven para reprocesar fechas viejas.
 */
import { esFestivo, diaIso, sumarDias } from "./calendario-pago";

// ── Tablas de descuentos autorizados ────────────────────────────────────────

/** Tramo [desde, hasta] de timbradas → descuentos autorizados. */
export type TablaDescuentos = ReadonlyArray<readonly [number, number, number]>;

const SIN_TOPE = Number.MAX_SAFE_INTEGER;

/** Hasta el 2026-08-12 convivían sensores nuevos y viejos. */
export const TABLA_NUEVOS: TablaDescuentos = [[80, 119, 1], [120, SIN_TOPE, 2]];
export const TABLA_VIEJOS: TablaDescuentos = [[50, 70, 1], [71, 100, 2], [101, SIN_TOPE, 3]];

/** Desde el 2026-08-13 toda la flota tiene sensor nuevo y hay plan por día. */
export const FECHA_CAMBIO_TABLA = "2026-08-13";
export const TABLA_LUNSAB_NUEVA: TablaDescuentos = [[60, 89, 1], [90, 119, 2], [120, 149, 3], [150, SIN_TOPE, 4]];
export const TABLA_DOMFEST_EXPRESS: TablaDescuentos = [[30, 49, 1], [50, 69, 2], [70, SIN_TOPE, 3]];
export const TABLA_DOMFEST_OTRAS: TablaDescuentos = [[40, 69, 1], [70, 99, 2], [100, SIN_TOPE, 3]];

/**
 * Despacho a las 18:00 o después con viaje completo: se regala una timbrada.
 * GEMA la registra como descuento "VENTA ADICIONAL" (observación "DESCUENTO
 * MARGEN NOCTURNO AUTOMATICO"), ya incluido en el descuento del recaudo.
 */
export const HORA_BONO_SEG = 18 * 3600;
export const TIPO_BONO_NOCTURNO = "VENTA ADICIONAL";
export const TIPO_ACTUALIZACION_CONTEO = "ACTUALIZACIÓN CONTEO";
/**
 * Tipos que ya forman parte de la conciliación automática. El resto (SENSOR,
 * POR ACCIDENTE, POR ABORTADOS, ...) son descuentos manuales: no cambian el
 * estado, pero se desglosan en la observación. "POR VENTA" no suma al TD
 * Dcto: sigue pendiente de decisión (§8.3 de las instrucciones del informe).
 */
export const TIPOS_TD_CONCILIADOS = new Set([TIPO_ACTUALIZACION_CONTEO, "POR VENTA", TIPO_BONO_NOCTURNO]);

/** Diferencia subidas − bajadas a partir de la cual se sospecha del sensor de puertas. */
export const UMBRAL_SB = 10;
/** |Ac.Sub − Ac.Reg| a partir del cual el viaje va a Alertas. */
export const UMBRAL_SR = 10;

export const EVENTO_SALIDA = "Salida de Geo-Fence";
export const EVENTO_ENTRADA = "Entrada a Geo-Fence";

// ── Estados ─────────────────────────────────────────────────────────────────

export const ESTADOS = [
  "Diferencia Por Revisar",
  "Sin Recaudo - Con Timbradas",
  "Revisar - Cartulina Con PV",
  "Revisar - Sin Datos PV",
  "Revisar - Datos Incompletos",
  "OK",
  "N/A - No Despachado",
] as const;
export type EstadoTimbrada = (typeof ESTADOS)[number];

/** Orden de criticidad (1 = más crítico). */
export const PRIORIDAD: Record<EstadoTimbrada, number> = Object.fromEntries(
  ESTADOS.map((e, i) => [e, i + 1]),
) as Record<EstadoTimbrada, number>;

export const ACCION_REQUERIDA: Record<EstadoTimbrada, string> = {
  "Diferencia Por Revisar": "Revisar descuentos contra los autorizados",
  "Sin Recaudo - Con Timbradas": "Verificar por qué no se recaudó",
  "Revisar - Cartulina Con PV": "Cruzar la cartulina física con los puntos virtuales",
  "Revisar - Sin Datos PV": "Revisar manualmente con el recaudo",
  "Revisar - Datos Incompletos": "Faltan datos en el despacho",
  OK: "Ninguna",
  "N/A - No Despachado": "No aplica",
};

/** Resultado que registra quien revisa (lista del informe HTML de Tesorería). */
export const RESULTADOS_REVISION = [
  "Justificado (con soporte)",
  "No justificado — cobrar/descontar",
  "Error de datos / sistema",
  "Escalado a otra área",
  "Otro (ver nota)",
] as const;
export type ResultadoRevision = (typeof RESULTADOS_REVISION)[number];

// ── Entradas (filas de las tablas espejo de GEMA) ───────────────────────────

export interface ViajeDespacho {
  numero: number;
  /** Vuelta del vehículo en el día. */
  viaje: number;
  placa: string;
  codigo: string | null;
  conductor: string | null;
  conductorCod: string | null;
  horaDespacho: string;
  horaLlegada: string;
  estado: string;
  timbradas: number | null;
  rutaProgramada: string | null;
  rutaReprogramada: string | null;
}

export interface EventoGeocerca {
  fecha: string;
  hora: string;
  placa: string;
  descripcion: string;
  subidas: number;
  bajadas: number;
  registradora: number;
}

export interface ViajeRecaudado {
  numero: number;
  timbradasReal: number;
  descuento: number;
  inicial: number | null;
  final: number | null;
  codigoVehiculo: string | null;
  /** Número de vuelta según el recaudo (Nvj). */
  viaje: string | null;
  codigoConductor: string | null;
  conductorNombre: string | null;
}

export interface TimbradaDescontada {
  numViaje: number;
  placa: string;
  descuento: number;
  motivo: string;
}

// ── Salida ──────────────────────────────────────────────────────────────────

export interface FilaRevision {
  numero: number;
  viaje: number;
  placa: string;
  vehiculo: string | null;
  conductor: string | null;
  codConductor: string | null;
  ruta: string | null;
  horaSalida: string;
  horaLlegada: string;
  regSalida: number | null;
  regLlegada: number | null;
  acReg: number | null;
  acSub: number | null;
  acBaj: number | null;
  difSR: number | null;
  difSB: number | null;
  timR: number | null;
  dctoVr: number | null;
  tdDcto: number | null;
  timNeto: number | null;
  /** Solo política vieja (antes del 2026-08-13). */
  sensor: "NUEVO" | "VIEJO" | null;
  estadoDespacho: string;
  estado: EstadoTimbrada;
  observacion: string | null;
  /** Descuentos de timbradas descontadas del viaje por motivo. */
  tdPorTipo: Record<string, number>;
  /** Suma de descuentos manuales (fuera de la conciliación automática). */
  manual: number;
  /** Descuento autorizado por la tabla vigente (política nueva, cuando aplica). */
  autorizado: number | null;
}

export interface ResultadoDia {
  fecha: string;
  politicaNueva: boolean;
  /** Domingo o festivo (plan especial de descuentos). */
  festivo: boolean;
  filas: FilaRevision[];
  placasSensorViejo: string[];
}

// ── Utilidades ──────────────────────────────────────────────────────────────

/** "HH:MM:SS" → segundos; null si no se puede leer. */
export function segundos(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const m = /^(\d{1,2}):(\d{2}):(\d{2})/.exec(hora.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function descuentoAutorizado(timR: number, tabla: TablaDescuentos): number {
  for (const [lo, hi, d] of tabla) if (timR >= lo && timR <= hi) return d;
  return 0;
}

export function esRutaExpress(rutaPro: string | null, rutaRepro: string | null): boolean {
  return `${rutaPro ?? ""} ${rutaRepro ?? ""}`.toUpperCase().includes("EXPRESS");
}

/** Domingo o festivo de Colombia (Ley Emiliani). */
export function esDomingoOFestivo(fecha: string): boolean {
  return diaIso(fecha) === 7 || esFestivo(fecha);
}

export function esPoliticaNueva(fecha: string): boolean {
  return fecha >= FECHA_CAMBIO_TABLA;
}

/** Tabla de descuentos que aplica a un viaje de la política nueva. */
export function tablaVigente(festivo: boolean, express: boolean): TablaDescuentos {
  if (!festivo) return TABLA_LUNSAB_NUEVA;
  return express ? TABLA_DOMFEST_EXPRESS : TABLA_DOMFEST_OTRAS;
}

/** Código de conductor comparable: sin ".0" de Excel ni ceros a la izquierda. */
export function codNorm(cod: string | number | null | undefined): string {
  if (cod == null) return "";
  const s = String(cod).trim().replace(/\.0$/, "");
  return s.replace(/^0+/, "") || s;
}

const normTipo = (t: string) => t.trim().toUpperCase();

/**
 * Evento de geocerca más cercano en el tiempo a `hora`, de la placa, el día y
 * el tipo indicados. En empate gana el más temprano.
 */
export function eventoMasCercano(
  eventos: readonly EventoGeocerca[],
  placa: string,
  fecha: string,
  hora: string,
  tipo: string,
): EventoGeocerca | null {
  const objetivo = segundos(hora);
  if (objetivo == null) return null;
  let mejor: EventoGeocerca | null = null;
  let mejorDif = Infinity;
  for (const e of eventos) {
    if (e.placa !== placa || e.fecha !== fecha || e.descripcion !== tipo) continue;
    const s = segundos(e.hora);
    if (s == null) continue;
    const dif = Math.abs(s - objetivo);
    if (dif < mejorDif || (dif === mejorDif && mejor && e.hora < mejor.hora)) {
      mejor = e;
      mejorDif = dif;
    }
  }
  return mejor;
}

const fmtHora = (h: string) => h.slice(0, 5);
const conSigno = (n: number) => (n >= 0 ? `+${n}` : String(n));

// ── Proceso del día ─────────────────────────────────────────────────────────

/**
 * Clasifica todos los viajes de un día.
 *
 * @param despacho viajes del histórico de despacho con `fecha_viaje` = fecha
 * @param eventos eventos de geocerca del terminal (base) de la fecha y del día siguiente
 * @param recaudo viajes recaudados con `fecha_viaje` = fecha
 * @param descuentos timbradas descontadas con `fecha_viaje` = fecha
 */
export function procesarDia(
  fecha: string,
  despacho: readonly ViajeDespacho[],
  eventos: readonly EventoGeocerca[],
  recaudo: readonly ViajeRecaudado[],
  descuentos: readonly TimbradaDescontada[],
): ResultadoDia {
  const politicaNueva = esPoliticaNueva(fecha);
  const festivo = esDomingoOFestivo(fecha);
  const diaSiguiente = sumarDias(fecha, 1);

  const recaudoPorNumero = new Map<number, ViajeRecaudado>();
  for (const r of recaudo) if (!recaudoPorNumero.has(r.numero)) recaudoPorNumero.set(r.numero, r);

  const tdPorViaje = new Map<string, Record<string, number>>();
  for (const t of descuentos) {
    const k = `${t.placa.trim()}|${t.numViaje}`;
    const porTipo = tdPorViaje.get(k) ?? {};
    const tipo = normTipo(t.motivo);
    porTipo[tipo] = (porTipo[tipo] ?? 0) + t.descuento;
    tdPorViaje.set(k, porTipo);
  }

  // Llegadas repetidas: misma placa con la misma hora de llegada en dos
  // viajes distintos (error del despacho; el cruce toma el mismo evento).
  const llegadas = new Map<string, number[]>();
  for (const v of despacho) {
    if (v.estado === "NO_DESPACHADO" || v.horaLlegada === "00:00:00") continue;
    const k = `${v.placa}|${v.horaLlegada}`;
    llegadas.set(k, [...(llegadas.get(k) ?? []), v.viaje]);
  }
  const lleRep = new Map<string, number[]>();
  for (const [k, vs] of llegadas) {
    if (vs.length < 2) continue;
    const placa = k.split("|")[0];
    for (const v of vs) lleRep.set(`${placa}|${v}`, vs.filter((o) => o !== v));
  }

  // Liquidación conjunta: dos viajes del mismo vehículo con el mismo
  // inicial/final en el recaudo (caja liquidó ambos en un solo conteo).
  const grupos = new Map<string, ViajeRecaudado[]>();
  for (const r of recaudo) {
    if (r.inicial == null || r.final == null || r.codigoVehiculo == null) continue;
    const k = `${r.codigoVehiculo}|${r.inicial}|${r.final}`;
    grupos.set(k, [...(grupos.get(k) ?? []), r]);
  }
  const liqConj = new Map<number, string[]>();
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    for (const r of g) {
      const propio = Number(r.viaje);
      liqConj.set(
        r.numero,
        g.filter((o) => o.viaje != null && Number(o.viaje) !== propio).map((o) => String(Number(o.viaje))),
      );
    }
  }

  const filas: FilaRevision[] = [];
  const placasSensorViejo = new Set<string>();

  for (const v of despacho) {
    const obs: string[] = [];
    const fila: FilaRevision = {
      numero: v.numero, viaje: v.viaje, placa: v.placa, vehiculo: v.codigo, conductor: v.conductor,
      codConductor: v.conductorCod, ruta: v.rutaReprogramada ?? v.rutaProgramada,
      horaSalida: v.horaDespacho, horaLlegada: v.horaLlegada,
      regSalida: null, regLlegada: null, acReg: null, acSub: null, acBaj: null, difSR: null, difSB: null,
      timR: null, dctoVr: null, tdDcto: null, timNeto: null, sensor: null,
      estadoDespacho: v.estado, estado: "OK", observacion: null, tdPorTipo: {}, manual: 0, autorizado: null,
    };

    if (v.estado === "NO_DESPACHADO") {
      filas.push({ ...fila, estado: "N/A - No Despachado" });
      continue;
    }
    if (v.horaLlegada === "00:00:00") {
      filas.push({ ...fila, estado: "Revisar - Datos Incompletos" });
      continue;
    }

    // ── Cruce con puntos virtuales ──
    const sSal = segundos(v.horaDespacho);
    const sLle = segundos(v.horaLlegada);
    const salida = eventoMasCercano(eventos, v.placa, fecha, v.horaDespacho, EVENTO_SALIDA);
    const nocturno = sSal != null && sLle != null && sLle < sSal;
    const llegada = eventoMasCercano(eventos, v.placa, nocturno ? diaSiguiente : fecha, v.horaLlegada, EVENTO_ENTRADA);
    const hayPv = salida != null && llegada != null;
    if (nocturno && sSal! < HORA_BONO_SEG) {
      obs.push(`Llegada ${fmtHora(v.horaLlegada)} anterior a la salida en HD (posible error de digitación)`);
    }
    const rep = lleRep.get(`${v.placa}|${v.viaje}`);
    if (rep) obs.push(`Llegada repetida con ${rep.map((o) => `v${o}`).join(", ")} en HD (PV toma el mismo evento)`);
    const conj = liqConj.get(v.numero);
    if (conj) obs.push(`Liquidado junto con ${conj.map((o) => `v${o}`).join(", ")} en recaudo (mismo Inicial/Final)`);

    let acSub: number | null = null;
    if (hayPv) {
      const acReg = llegada.registradora - salida.registradora;
      acSub = llegada.subidas - salida.subidas;
      const acBaj = llegada.bajadas - salida.bajadas;
      Object.assign(fila, {
        regSalida: salida.registradora, regLlegada: llegada.registradora, acReg, acSub, acBaj,
        difSR: acSub - acReg, difSB: acSub - acBaj,
      });
    }

    // ── Cruce con recaudo (numero) y timbradas descontadas (vuelta + placa) ──
    const vr = recaudoPorNumero.get(v.numero);
    const tdPorTipo = tdPorViaje.get(`${v.placa}|${v.viaje}`) ?? {};
    const tdDcto = tdPorTipo[TIPO_ACTUALIZACION_CONTEO] ?? 0;
    const otrosTd = Object.entries(tdPorTipo).filter(([t, n]) => !TIPOS_TD_CONCILIADOS.has(t) && n);
    const manual = otrosTd.reduce((a, [, n]) => a + n, 0);
    const bonoElegible = politicaNueva && v.estado === "DESPACHADO" && sSal != null && sSal >= HORA_BONO_SEG;
    const vaDcto = bonoElegible ? (tdPorTipo[TIPO_BONO_NOCTURNO] ?? 0) : 0;
    fila.tdPorTipo = tdPorTipo;
    fila.manual = manual;

    let timR = 0;
    let timNeto = 0;
    if (vr) {
      timR = vr.timbradasReal;
      timNeto = timR - vr.descuento;
      const codVr = codNorm(vr.codigoConductor);
      if (codVr && codVr !== codNorm(v.conductorCod)) {
        obs.push(`Conductor en recaudo distinto al del despacho: ${codVr} ${(vr.conductorNombre ?? "").trim()}`.trimEnd());
      }
      Object.assign(fila, { timR, dctoVr: vr.descuento, tdDcto, timNeto });
    }

    // ── Estado ──
    if (hayPv && vr) {
      const bono6pm = bonoElegible && timR === acSub! + 1;
      if (bono6pm) {
        fila.estado = "OK";
        obs.push("Tim R = Ac.Sub + 1 (timbrada de cortesía 18:00)");
      } else if (acSub === timR) {
        const dctoReal = timR - timNeto;
        if (politicaNueva) {
          const tabla = tablaVigente(festivo, esRutaExpress(v.rutaProgramada, v.rutaReprogramada));
          const aut = descuentoAutorizado(timR, tabla);
          fila.autorizado = aut;
          const comboBase = new Set([0, tdDcto, ...(aut ? [aut, tdDcto + aut] : [])]);
          const combo = new Set([...comboBase, ...[...comboBase].map((c) => c + vaDcto)]);
          if (combo.has(dctoReal)) {
            fila.estado = "OK";
            if (!comboBase.has(dctoReal)) obs.push("Incluye timbrada de cortesía 18:00 (VENTA ADICIONAL)");
          } else {
            fila.estado = "Diferencia Por Revisar";
            const esperado = aut + tdDcto + vaDcto;
            // Mayor descuento primero; en empate, por nombre del motivo (como el script).
            const desglose = [...otrosTd]
              .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
              .map(([t, n]) => `${t} ${n}`)
              .join(", ");
            if (otrosTd.length && combo.has(dctoReal - manual)) {
              obs.push(`Cuadra con descuentos manuales registrados en TD: ${desglose} — verificar soporte`);
            } else {
              const sinSoporte = dctoReal - esperado - manual;
              let txt = `Dcto real ${dctoReal} vs autorizado ${esperado}`;
              if (desglose) txt += ` + manuales (${desglose})`;
              obs.push(`${txt}: ${conSigno(sinSoporte)} sin soporte en TD`);
            }
          }
        } else {
          const autN = descuentoAutorizado(timR, TABLA_NUEVOS);
          const autV = descuentoAutorizado(timR, TABLA_VIEJOS);
          const base = new Set([0, tdDcto]);
          const nuevos = new Set(autN ? [autN, tdDcto + autN] : []);
          const viejos = new Set(autV ? [autV, tdDcto + autV] : []);
          if (base.has(dctoReal)) {
            fila.estado = "OK";
          } else if (nuevos.has(dctoReal)) {
            fila.estado = "OK";
            fila.sensor = "NUEVO";
          } else if (viejos.has(dctoReal)) {
            fila.estado = "OK";
            fila.sensor = "VIEJO";
            placasSensorViejo.add(v.placa);
          } else {
            fila.estado = "Diferencia Por Revisar";
          }
        }
      } else {
        fila.estado = "Revisar - Cartulina Con PV";
      }
    } else if (hayPv) {
      fila.estado = "Sin Recaudo - Con Timbradas";
      // Sin recaudo: las timbradas del despacho (cartulina) como referencia.
      if (v.timbradas != null) {
        Object.assign(fila, { timR: v.timbradas, dctoVr: 0, tdDcto, timNeto: v.timbradas - tdDcto });
      }
      obs.push(`Recaudo no registrado (despacho en estado ${v.estado})`);
    } else {
      fila.estado = "Revisar - Sin Datos PV";
    }

    fila.observacion = obs.length ? obs.join("; ") : null;
    filas.push(fila);
  }

  return { fecha, politicaNueva, festivo, filas, placasSensorViejo: [...placasSensorViejo].sort() };
}

// ── Vistas derivadas ────────────────────────────────────────────────────────

/** Prioridad, luego placa y luego hora de salida (orden del informe). */
export function ordenarFilas(filas: readonly FilaRevision[]): FilaRevision[] {
  return [...filas].sort(
    (a, b) =>
      PRIORIDAD[a.estado] - PRIORIDAD[b.estado] ||
      a.placa.localeCompare(b.placa) ||
      a.horaSalida.localeCompare(b.horaSalida),
  );
}

export const requiereRevision = (f: FilaRevision) => f.estado !== "OK" && f.estado !== "N/A - No Despachado";

export const sbAlta = (f: FilaRevision) => f.difSB != null && Math.abs(f.difSB) > UMBRAL_SB;

/** Alertas del Excel: sin recaudo, diferencias y |Dif.(S-R)| > 10. */
export const esAlertaExcel = (f: FilaRevision) =>
  f.estado === "Sin Recaudo - Con Timbradas" ||
  f.estado === "Diferencia Por Revisar" ||
  (f.difSR != null && Math.abs(f.difSR) > UMBRAL_SR);

/** Alertas de pantalla: las del Excel más subidas ≠ bajadas por más de 10. */
export const esAlerta = (f: FilaRevision) => esAlertaExcel(f) || sbAlta(f);

const ALERTA_PRIORIDAD: Partial<Record<EstadoTimbrada, number>> = {
  "Sin Recaudo - Con Timbradas": 1,
  "Diferencia Por Revisar": 2,
};

export function ordenarAlertas(filas: readonly FilaRevision[]): FilaRevision[] {
  return [...filas].sort(
    (a, b) =>
      (ALERTA_PRIORIDAD[a.estado] ?? 3) - (ALERTA_PRIORIDAD[b.estado] ?? 3) ||
      a.placa.localeCompare(b.placa) ||
      a.horaSalida.localeCompare(b.horaSalida),
  );
}

/** Etiquetas de la observación (filtros de la pantalla). */
export const ETIQUETAS = [
  { clave: "sinsop", etiqueta: "Dcto sin soporte", prueba: (f: FilaRevision) => /sin soporte en TD/.test(f.observacion ?? "") },
  { clave: "manual", etiqueta: "Dcto manual en TD", prueba: (f: FilaRevision) => /descuentos manuales/.test(f.observacion ?? "") },
  { clave: "llrep", etiqueta: "Llegada repetida", prueba: (f: FilaRevision) => /Llegada repetida/.test(f.observacion ?? "") },
  { clave: "liq", etiqueta: "Liquidación conjunta", prueba: (f: FilaRevision) => /Liquidado junto/.test(f.observacion ?? "") },
  { clave: "llant", etiqueta: "Llegada < salida", prueba: (f: FilaRevision) => /anterior a la salida/.test(f.observacion ?? "") },
  { clave: "cort", etiqueta: "Cortesía 18:00", prueba: (f: FilaRevision) => /cortesía/.test(f.observacion ?? "") },
  { clave: "conductor", etiqueta: "Conductor distinto", prueba: (f: FilaRevision) => /Conductor en recaudo distinto/.test(f.observacion ?? "") },
  { clave: "sb", etiqueta: `Subidas ≠ Bajadas (>${UMBRAL_SB})`, prueba: sbAlta },
] as const;
export type ClaveEtiqueta = (typeof ETIQUETAS)[number]["clave"];

export function etiquetasDe(f: FilaRevision): ClaveEtiqueta[] {
  return ETIQUETAS.filter((e) => e.prueba(f)).map((e) => e.clave);
}

export function conteoPorEstado(filas: readonly FilaRevision[]): Record<EstadoTimbrada, number> {
  const c = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoTimbrada, number>;
  for (const f of filas) c[f.estado]++;
  return c;
}

export interface ResumenPlaca {
  placa: string;
  vehiculo: string | null;
  viajes: number;
  porRevisar: number;
  alertas: number;
  subidas: number;
  bajadas: number;
  difSB: number;
  viajesSbAlta: number;
}

export function resumenPorPlaca(filas: readonly FilaRevision[]): ResumenPlaca[] {
  const m = new Map<string, ResumenPlaca>();
  for (const f of filas) {
    if (f.estado === "N/A - No Despachado") continue;
    const p = m.get(f.placa) ?? {
      placa: f.placa, vehiculo: f.vehiculo, viajes: 0, porRevisar: 0, alertas: 0,
      subidas: 0, bajadas: 0, difSB: 0, viajesSbAlta: 0,
    };
    p.viajes++;
    if (requiereRevision(f)) p.porRevisar++;
    if (esAlerta(f)) p.alertas++;
    if (f.difSB != null) {
      p.subidas += f.acSub ?? 0;
      p.bajadas += f.acBaj ?? 0;
      p.difSB += f.difSB;
      if (sbAlta(f)) p.viajesSbAlta++;
    }
    m.set(f.placa, p);
  }
  return [...m.values()].sort((a, b) => b.alertas - a.alertas || b.porRevisar - a.porRevisar || a.placa.localeCompare(b.placa));
}

/** Totales de subidas y bajadas de los viajes con dato de PV en salida y llegada. */
export function totalesSubidasBajadas(filas: readonly FilaRevision[]) {
  const c = filas.filter((f) => f.difSB != null);
  const subidas = c.reduce((a, f) => a + (f.acSub ?? 0), 0);
  const bajadas = c.reduce((a, f) => a + (f.acBaj ?? 0), 0);
  return { viajes: c.length, subidas, bajadas, dif: subidas - bajadas, viajesAltos: filas.filter(sbAlta).length };
}

/** Tablas que aplican ese día, para mostrarlas en el resumen. */
export function tablasDelDia(fecha: string): { titulo: string; tabla: TablaDescuentos }[] {
  if (!esPoliticaNueva(fecha)) {
    return [
      { titulo: "Sensores nuevos", tabla: TABLA_NUEVOS },
      { titulo: "Sensores viejos", tabla: TABLA_VIEJOS },
    ];
  }
  if (esDomingoOFestivo(fecha)) {
    return [
      { titulo: "Domingo/festivo · rutas EXPRESS", tabla: TABLA_DOMFEST_EXPRESS },
      { titulo: "Domingo/festivo · otras rutas", tabla: TABLA_DOMFEST_OTRAS },
    ];
  }
  return [{ titulo: "Lunes a sábado", tabla: TABLA_LUNSAB_NUEVA }];
}

export const textoTramo = ([lo, hi]: readonly [number, number, number]) =>
  hi === SIN_TOPE ? `${lo} en adelante` : `${lo}–${hi}`;
