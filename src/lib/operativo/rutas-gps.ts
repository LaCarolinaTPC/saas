/**
 * Operativo › Rutas en vivo: cruza la posición GPS de cada bus con el trazado
 * KML de la ruta que está haciendo. Solo servidor.
 *
 *  - Posiciones: GEMA en vivo (o la copia del espejo), igual que la pestaña GPS.
 *  - Ruta de cada bus: el viaje en curso de `historico_despacho` (manda la
 *    ruta REPROGRAMADA: casi la mitad de los viajes cambian de ruta). Si el
 *    bus todavía no ha salido, la de `programacion`, solo como referencia.
 *    Antes de leer se refresca el despacho del día si tiene más de 15 min
 *    (`refrescarDespachoDelDia`, que nunca lanza).
 *  - El desvío solo se juzga con el bus EN VIAJE; la confirmación con dos
 *    lecturas seguidas la lleva la pantalla (`actualizarRachas`).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { refrescarDespachoDelDia } from "@/lib/gema/despacho-al-dia";
import { minutosSinReportar } from "@/lib/gema/gps-reglas";
import { hoyBogota } from "./constants";
import { getPosicionesFlota } from "./gps-flota";
import { getGeometriasVigentes } from "./rutas-kml";
import {
  estadoBus, indexarLinea, viajeActual, type EstadoBusRuta, type LineaIndexada, type ViajeDespacho,
} from "./rutas-gps-reglas";

const PAGINA = 1000;

export interface BusEnRuta {
  codigo: string;
  placa: string | null;
  lat: number | null;
  lon: number | null;
  velocidadKph: number | null;
  rumbo: number | null;
  /** Hora local del GPS («AAAA-MM-DD HH:MM:SS»). */
  fechaHora: string | null;
  edadMin: number | null;
  ruta: string | null;
  /** De dónde salió la ruta. */
  origenRuta: "despacho" | "programacion" | null;
  viaje: number | null;
  horaDespacho: string | null;
  estado: EstadoBusRuta;
  /** Metros a la línea (redondeado). */
  distanciaM: number | null;
  avanceKm: number | null;
  toleranciaM: number | null;
}

export interface FlotaEnRutas {
  buses: BusEnRuta[];
  /** «AAAA-MM-DD HH:MM:SS» de Bogotá con que se calculó. */
  ahora: string;
  gps: { fuente: "vivo" | "copia" | "ninguna"; leidoAt: string | null; error: string | null };
  despacho: { actualizadoAt: string | null; edadMin: number | null; error: string | null };
}

function ahoraBogota(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${v("year")}-${v("month")}-${v("day")} ${v("hour")}:${v("minute")}:${v("second")}`;
}

type FilaDespacho = ViajeDespacho & { codigo: string };

async function despachoDelDia(fecha: string): Promise<Map<string, ViajeDespacho[]>> {
  const db = createAdminClient();
  const porBus = new Map<string, ViajeDespacho[]>();
  for (let i = 0; i < 20 * PAGINA; i += PAGINA) {
    const { data, error } = await db
      .from("historico_despacho")
      .select("codigo, viaje, hora_despacho, hora_llegada, estado, ruta_programada, ruta_reprogramada")
      .eq("fecha_viaje", fecha)
      .order("codigo")
      .order("viaje")
      .range(i, i + PAGINA - 1);
    if (error) throw new Error(`historico_despacho: ${error.message}`);
    for (const f of (data ?? []) as FilaDespacho[]) {
      const lista = porBus.get(f.codigo) ?? [];
      lista.push(f);
      porBus.set(f.codigo, lista);
    }
    if ((data?.length ?? 0) < PAGINA) break;
  }
  return porBus;
}

async function programacionDelDia(fecha: string): Promise<Map<string, string>> {
  const { data, error } = await createAdminClient()
    .from("programacion")
    .select("codigo_vehiculo, ruta")
    .eq("fecha", fecha)
    .limit(PAGINA * 2);
  if (error) throw new Error(`programacion: ${error.message}`);
  const out = new Map<string, string>();
  for (const r of data ?? []) if (r.codigo_vehiculo && r.ruta) out.set(r.codigo_vehiculo, r.ruta.trim());
  return out;
}

export async function getFlotaEnRutas(): Promise<FlotaEnRutas> {
  const hoy = hoyBogota();
  const refresco = await refrescarDespachoDelDia(hoy, hoy);
  const [posiciones, geometrias, despacho, programacion] = await Promise.all([
    getPosicionesFlota(),
    getGeometriasVigentes(),
    despachoDelDia(hoy),
    programacionDelDia(hoy),
  ]);
  const ahora = ahoraBogota();
  const hora = ahora.slice(11);

  const lineas = new Map<string, { linea: LineaIndexada; tolerancia: number }>();
  for (const g of geometrias) lineas.set(g.ruta, { linea: indexarLinea(g.linea), tolerancia: g.tolerancia_m });

  const vistos = new Set<string>();
  const buses: BusEnRuta[] = [];
  const cruzar = (codigo: string, p: (typeof posiciones.posiciones)[number] | null) => {
    vistos.add(codigo);
    const viaje = viajeActual(despacho.get(codigo) ?? [], hora);
    const rutaProgramada = programacion.get(codigo) ?? null;
    const ruta = viaje?.ruta ?? rutaProgramada;
    const kml = ruta ? lineas.get(ruta) ?? null : null;
    const edadMin = minutosSinReportar(p?.fecha_hora, ahora);
    const { estado, proyeccion } = estadoBus({
      programado: ruta != null,
      enViaje: viaje?.enViaje ?? false,
      linea: kml?.linea ?? null,
      toleranciaM: kml?.tolerancia ?? 0,
      lat: p?.latitud ?? null,
      lon: p?.longitud ?? null,
      rumbo: p?.rumbo_grados ?? null,
      velocidadKph: p?.velocidad_kph ?? null,
      edadMin,
    });
    buses.push({
      codigo,
      placa: p?.placa ?? null,
      lat: p?.latitud ?? null,
      lon: p?.longitud ?? null,
      velocidadKph: p?.velocidad_kph ?? null,
      rumbo: p?.rumbo_grados ?? null,
      fechaHora: p?.fecha_hora ?? null,
      edadMin,
      ruta,
      origenRuta: viaje ? "despacho" : rutaProgramada ? "programacion" : null,
      viaje: viaje?.viaje ?? null,
      horaDespacho: viaje?.horaDespacho ?? null,
      estado,
      distanciaM: proyeccion ? Math.round(proyeccion.distanciaM) : null,
      avanceKm: proyeccion ? Math.round(proyeccion.avanceM / 100) / 10 : null,
      toleranciaM: kml?.tolerancia ?? null,
    });
  };

  for (const p of posiciones.posiciones) cruzar(p.codigo_vehiculo, p);
  // Buses con ruta hoy que el GPS no lista: también hay que verlos.
  for (const codigo of new Set([...despacho.keys(), ...programacion.keys()])) {
    if (!vistos.has(codigo)) cruzar(codigo, null);
  }

  return {
    buses,
    ahora,
    gps: { fuente: posiciones.fuente, leidoAt: posiciones.leidoAt, error: posiciones.error },
    despacho: { actualizadoAt: refresco.actualizadoAt, edadMin: refresco.edadMin, error: refresco.error ?? null },
  };
}
