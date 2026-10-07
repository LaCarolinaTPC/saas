// Indicadores del tablero de cámaras y sensores, calculados sobre las
// revisiones vigentes del periodo. Puro: lo usan la página y las pruebas.
import type { RevisionCamaras } from "./camaras-data";
import { compararConAforo, type Elemento, type TipoNovedad } from "./camaras-reglas";

/** Viajes mínimos comparados para que un conductor entre al ranking de caja. */
export const MIN_VIAJES_CONDUCTOR = 3;

export interface FilaMes {
  mes: string;
  revisiones: number;
  fallas: number;
  /** % de revisiones con DFS y aforo en que el DFS cuadra; null sin comparables. */
  pctCuadra: number | null;
}

export interface FilaVehiculo {
  codigo: string;
  revisiones: number;
  fallasCamara: number;
  fallasSensor: number;
  comparables: number;
  pctCuadra: number | null;
  /** Suma de (DFS − aforo) sobre las comparables: negativo, el sensor cuenta de menos. */
  diferenciaDfs: number;
}

export interface FilaConductor {
  cedula: string;
  nombre: string;
  viajes: number;
  aforo: number;
  caja: number;
  /** caja − aforo: negativo son pasajeros vistos en el video que no timbraron. */
  diferencia: number;
  pct: number | null;
}

export interface Tablero {
  revisiones: number;
  viajesRevisados: number;
  fallas: number;
  comparables: number;
  pctCuadra: number | null;
  porTipo: { clave: string; nombre: string; elemento: Elemento; cantidad: number }[];
  porMes: FilaMes[];
  vehiculos: FilaVehiculo[];
  conductores: FilaConductor[];
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function resumirTablero(
  revisiones: RevisionCamaras[],
  tipos: TipoNovedad[],
  recaudo: Record<number, number | null>,
): Tablero {
  const nombre = new Map(tipos.map((t) => [t.clave, t]));
  const viajes = new Set<string>();
  const porTipo = new Map<string, number>();
  const meses = new Map<string, { revisiones: number; fallas: number; comparables: number; cuadra: number }>();
  const buses = new Map<string, FilaVehiculo & { cuadra: number }>();
  const conductores = new Map<string, Omit<FilaConductor, "diferencia" | "pct">>();
  let fallas = 0, comparables = 0, cuadra = 0;

  for (const r of revisiones) {
    viajes.add(`${r.fecha_viaje}|${r.vehiculo_codigo}|${r.viaje}`);
    const mes = r.fecha_viaje.slice(0, 7);
    const m = meses.get(mes) ?? { revisiones: 0, fallas: 0, comparables: 0, cuadra: 0 };
    const b = buses.get(r.vehiculo_codigo) ?? {
      codigo: r.vehiculo_codigo, revisiones: 0, fallasCamara: 0, fallasSensor: 0, comparables: 0, pctCuadra: null,
      diferenciaDfs: 0, cuadra: 0,
    };
    m.revisiones++;
    b.revisiones++;
    if (r.con_falla) {
      fallas++;
      m.fallas++;
      if (r.elemento === "camara") b.fallasCamara++; else b.fallasSensor++;
      porTipo.set(r.tipo_novedad, (porTipo.get(r.tipo_novedad) ?? 0) + 1);
    }
    const d = compararConAforo(r.dfs_optocontrol, r.aforo);
    if (d.nivel !== "sin_dato") {
      comparables++;
      m.comparables++;
      b.comparables++;
      b.diferenciaDfs += d.diferencia ?? 0;
      if (d.nivel === "ok") { cuadra++; m.cuadra++; b.cuadra++; }
    }
    meses.set(mes, m);
    buses.set(r.vehiculo_codigo, b);

    // Caja frente al aforo, por conductor: una vez por viaje (la fila de cámara).
    const caja = r.despacho_numero != null ? recaudo[r.despacho_numero] : null;
    if (r.elemento === "camara" && r.aforo != null && caja != null && r.conductor_cedula && !r.revision_repetida) {
      const c = conductores.get(r.conductor_cedula) ?? {
        cedula: r.conductor_cedula, nombre: r.conductor_nombre ?? r.conductor_cedula, viajes: 0, aforo: 0, caja: 0,
      };
      c.viajes++;
      c.aforo += r.aforo;
      c.caja += caja;
      conductores.set(r.conductor_cedula, c);
    }
  }

  return {
    revisiones: revisiones.length,
    viajesRevisados: viajes.size,
    fallas,
    comparables,
    pctCuadra: pct(cuadra, comparables),
    porTipo: [...porTipo]
      .map(([clave, cantidad]) => ({
        clave, cantidad, nombre: nombre.get(clave)?.nombre ?? clave, elemento: nombre.get(clave)?.elemento ?? "camara",
      }))
      .sort((a, b) => b.cantidad - a.cantidad),
    porMes: [...meses]
      .map(([mes, m]) => ({ mes, revisiones: m.revisiones, fallas: m.fallas, pctCuadra: pct(m.cuadra, m.comparables) }))
      .sort((a, b) => b.mes.localeCompare(a.mes)),
    vehiculos: [...buses.values()]
      .map(({ cuadra: c, ...b }) => ({ ...b, pctCuadra: pct(c, b.comparables) }))
      .sort((a, b) => b.fallasCamara + b.fallasSensor - (a.fallasCamara + a.fallasSensor) || b.revisiones - a.revisiones),
    conductores: [...conductores.values()]
      .filter((c) => c.viajes >= MIN_VIAJES_CONDUCTOR)
      .map((c) => ({ ...c, diferencia: c.caja - c.aforo, pct: c.aforo > 0 ? Math.round(((c.caja - c.aforo) / c.aforo) * 1000) / 10 : null }))
      .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0)),
  };
}
