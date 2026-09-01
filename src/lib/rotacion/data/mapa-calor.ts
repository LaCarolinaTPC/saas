import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface CeldaMapa {
  lat: number;
  lng: number;
  suben: number;
  bajan: number;
  puntoVirtual: string | null;
  /** Velocidad promedio (km/h) del bus en los eventos con pasajeros de la celda. */
  velocidad: number | null;
}

export interface HoraTotal {
  hora: number;
  suben: number;
  bajan: number;
}

export interface PvTop {
  /** cod_pv de la geocerca; null cuando la ubicación no tiene geocerca en GEMA. */
  cod: string | null;
  nombre: string;
  suben: number;
  bajan: number;
}

export interface RutaTotal {
  ruta: string;
  viajes: number;
  timbradas: number;
}

export interface AlarmaMapa {
  lat: number;
  lng: number;
  tipo: string; // BLOQUEO | PUERTA | FALLA
  codigoVehiculo: string | null;
  placa: string | null;
  conductor: string | null;
  fecha: string;
  hora: string;
  lugar: string | null;
}

export interface PuntoVirtual {
  codPv: string;
  nombre: string;
  lat: number;
  lng: number;
  isBase: boolean;
}

export interface VehiculoOpcion {
  codigo: string;
  placa: string | null;
}

export interface ViajeOpcion {
  numero: number;
  viaje: string | null;
  ruta: string | null;
  horaDespacho: string | null;
  horaLlegada: string | null;
  /** Despacho visto solo en la telemetría, sin registro de recaudo. */
  sinRecaudo: boolean;
  /** Alarmas de registradora emitidas durante el viaje. */
  alarmas: number;
  /** Reinicios del contador de la registradora a mitad del viaje:
   *  las timbradas liquidadas quedan cortas → verificación manual. */
  reinicios: number;
}

export interface MapaCalorData {
  desde: string;
  hasta: string;
  ruta: string | null;
  punto: string | null;
  vehiculo: string | null;
  vehiculos: VehiculoOpcion[];
  /** Viaje (despacho) filtrado; solo aplica con vehículo y un único día. */
  despacho: number | null;
  /** Viajes del vehículo en el día elegido, para el selector. */
  viajes: ViajeOpcion[];
  /** Timbradas del periodo: `timbradas` ya es la NETA (GEMA la entrega con
   *  el descuento restado); `bruto` es timbradas_real. */
  timbradas: { timbradas: number; bruto: number; descuento: number; viajes: number };
  /** Rastro GPS del viaje elegido (o de un viaje representativo de la ruta). */
  trazado: [number, number][];
  horaDesde: number;
  horaHasta: number;
  celdas: CeldaMapa[];
  porHora: HoraTotal[];
  topPv: PvTop[];
  rutas: RutaTotal[];
  puntosVirtuales: PuntoVirtual[];
  /** Últimas 500 alarmas de registradora del rango, para la capa del mapa. */
  alarmas: AlarmaMapa[];
  ultimaFechaSync: string | null;
}

// Dirección legible para una celda de ~110 m, con caché en geo_direcciones
// para consultar Nominatim una sola vez por celda. Devuelve null si el
// servicio no responde (el llamador usa las coordenadas como último recurso).
async function direccionInversa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  lat: number,
  lng: number
): Promise<string | null> {
  const celda = { lat: Number(lat.toFixed(3)), lng: Number(lng.toFixed(3)) };
  try {
    const { data: hit } = await supabase
      .from("geo_direcciones")
      .select("direccion")
      .eq("lat", celda.lat)
      .eq("lng", celda.lng)
      .maybeSingle();
    if (hit?.direccion) return hit.direccion as string;

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&accept-language=es`,
      {
        headers: { "User-Agent": "gestivo-mapa-calor/1.0" },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      address?: Record<string, string>;
      display_name?: string;
    };
    const a = j.address ?? {};
    const direccion =
      [a.road, a.neighbourhood ?? a.suburb ?? a.city_district]
        .filter(Boolean)
        .join(" · ") ||
      j.display_name?.split(",").slice(0, 2).join(",").trim() ||
      null;
    if (direccion) {
      await supabase
        .from("geo_direcciones")
        .upsert({ ...celda, direccion, fuente: "nominatim" });
    }
    return direccion;
  } catch {
    return null;
  }
}

// Ajusta un rastro GPS a la malla vial (map matching con OSRM) para que el
// trazado siga las calles en vez de unir reportes en línea recta. Se calcula
// una vez por despacho y se cachea en geo_trazados; si OSRM no responde, el
// llamador se queda con el rastro crudo.
async function trazadoPorCalles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  despacho: number,
  crudo: [number, number][]
): Promise<[number, number][] | null> {
  try {
    const { data: hit } = await supabase
      .from("geo_trazados")
      .select("puntos")
      .eq("despacho", despacho)
      .maybeSingle();
    if (hit?.puntos) return hit.puntos as [number, number][];

    // El servicio match del OSRM público está capado (TooBig incluso con 25
    // puntos), así que se usa route: ~25 puntos del rastro como paradas y
    // OSRM devuelve el camino entre ellas siguiendo las calles.
    const paso = Math.max(1, Math.ceil(crudo.length / 25));
    const muestra = crudo.filter((_, i) => i % paso === 0 || i === crudo.length - 1);
    const coords = muestra.map(([la, ln]) => `${ln},${la}`).join(";");
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      code?: string;
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };
    if (j.code !== "Ok" || !j.routes?.length) return null;
    const puntos: [number, number][] = (j.routes[0].geometry?.coordinates ?? []).map(
      ([ln, la]) => [la, ln]
    );
    if (puntos.length < 2) return null;
    await supabase
      .from("geo_trazados")
      .upsert({ despacho, puntos, fuente: "osrm" });
    return puntos;
  } catch {
    return null;
  }
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function clampHora(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : def;
}

export async function getMapaCalorData(params: {
  desde?: string;
  hasta?: string;
  ruta?: string;
  punto?: string; // cod_pv de la geocerca (los nombres no son únicos en GEMA)
  vehiculo?: string; // código del vehículo
  despacho?: string; // numero de viajes_recaudados (un viaje del día)
  hd?: string;
  hh?: string;
}): Promise<MapaCalorData | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Rango por defecto: últimos 7 días con eventos sincronizados.
    const { data: st } = await supabase
      .from("gema_sync_state")
      .select("last_synced_date")
      .eq("dataset", "puntos_virtuales")
      .maybeSingle();
    const ultimaFechaSync: string | null = st?.last_synced_date ?? null;
    const hasta = params.hasta || ultimaFechaSync || new Date().toISOString().slice(0, 10);
    const desde = params.desde || addDays(hasta, -6);
    const ruta = params.ruta || null;
    const punto = params.punto || null;
    const vehiculo = params.vehiculo || null;
    // El viaje solo tiene sentido con vehículo y un día concreto.
    const despachoNum = Number(params.despacho);
    const despacho =
      vehiculo && desde === hasta && Number.isInteger(despachoNum) && despachoNum > 0
        ? despachoNum
        : null;
    let horaDesde = clampHora(params.hd, 0);
    let horaHasta = clampHora(params.hh, 23);
    if (horaDesde > horaHasta) [horaDesde, horaHasta] = [horaHasta, horaDesde];

    const [mapa, rutasRes, pvRes, alarmasRes, vehRes, timbRes] = await Promise.all([
      supabase.rpc("get_mapa_calor", {
        p_desde: desde,
        p_hasta: hasta,
        p_ruta: ruta,
        p_hora_desde: horaDesde,
        p_hora_hasta: horaHasta,
        p_punto: punto,
        p_vehiculo: vehiculo,
        p_despacho: despacho,
      }),
      supabase.rpc("get_mapa_calor_rutas", { p_desde: desde, p_hasta: hasta }),
      supabase.rpc("get_mapa_calor_puntos", { p_desde: desde, p_hasta: hasta, p_ruta: ruta }),
      supabase.rpc("get_alarmas", {
        p_desde: desde, p_hasta: hasta, p_tipo: null, p_ruta: ruta,
        p_vehiculo: vehiculo, p_despacho: despacho,
      }),
      supabase.from("vehiculos").select("codigo, placa").order("codigo"),
      supabase.rpc("get_timbradas_periodo", {
        p_desde: desde, p_hasta: hasta, p_ruta: ruta,
        p_hora_desde: horaDesde, p_hora_hasta: horaHasta,
        p_vehiculo: vehiculo, p_despacho: despacho,
      }),
    ]);
    for (const r of [mapa, rutasRes, pvRes, alarmasRes, vehRes, timbRes]) {
      if (r.error) throw new Error(`rpc mapa-calor: ${r.error.message}`);
    }

    // Trazado de la ruta: rastro GPS del viaje elegido, o de un viaje
    // representativo reciente cuando solo hay ruta seleccionada.
    let trazado: [number, number][] = [];
    if (despacho || ruta) {
      const { data: tz } = await supabase.rpc("get_trazado_ruta", {
        p_desde: desde, p_hasta: hasta, p_ruta: ruta, p_despacho: despacho,
      });
      const blob = tz as { despacho?: number; puntos?: [number, number][] } | null;
      const crudo: [number, number][] = (blob?.puntos ?? []).map(
        ([la, ln]) => [Number(la), Number(ln)]
      );
      trazado = crudo;
      // Ajustar a las calles (cacheado por despacho); si falla, queda el crudo.
      if (blob?.despacho && crudo.length >= 2) {
        trazado = (await trazadoPorCalles(supabase, Number(blob.despacho), crudo)) ?? crudo;
      }
    }

    // Viajes (despachos) del vehículo en el día, para el selector de viaje.
    let viajes: ViajeOpcion[] = [];
    if (vehiculo && desde === hasta) {
      // Recaudados + despachos vistos solo en telemetría (sin recaudo),
      // cada uno con su conteo de alarmas.
      const { data: vjs, error: eVjs } = await supabase.rpc("get_viajes_vehiculo", {
        p_fecha: desde, p_vehiculo: vehiculo,
      });
      if (eVjs) throw new Error(`viajes del vehículo: ${eVjs.message}`);
      viajes = ((vjs ?? []) as {
        numero: number; viaje: string | null; ruta: string | null;
        hora_despacho: string | null; hora_llegada: string | null;
        sin_recaudo: boolean; alarmas: number; reinicios: number;
      }[]).map((v) => ({
        numero: Number(v.numero),
        viaje: v.viaje,
        ruta: v.ruta,
        horaDespacho: v.hora_despacho,
        horaLlegada: v.hora_llegada,
        sinRecaudo: !!v.sin_recaudo,
        alarmas: Number(v.alarmas ?? 0),
        reinicios: Number(v.reinicios ?? 0),
      }));
    }

    // celdas viaja compacto: [lat, lng, suben, bajan, punto_virtual|null, vel|null]
    type CeldaRaw = [number, number, number, number, string | null, number | null];
    const blob = (mapa.data ?? {}) as {
      celdas?: CeldaRaw[];
      por_hora?: { hora: number; suben: number; bajan: number }[];
      top_pv?: {
        cod: string | null; nombre: string | null;
        lat: number; lng: number; suben: number; bajan: number;
      }[];
    };

    // Zonas sin nombre ni dirección de GEMA: se resuelven por
    // geocodificación inversa con caché en geo_direcciones. Secuencial:
    // Nominatim admite máximo una petición por segundo.
    const topPv: PvTop[] = [];
    for (const t of blob.top_pv ?? []) {
      topPv.push({
        cod: t.cod ?? null,
        nombre:
          t.nombre ??
          (await direccionInversa(supabase, Number(t.lat), Number(t.lng))) ??
          `Zona ${t.lat}, ${t.lng}`,
        suben: Number(t.suben),
        bajan: Number(t.bajan),
      });
    }

    return {
      desde,
      hasta,
      ruta,
      punto,
      vehiculo,
      vehiculos: ((vehRes.data ?? []) as { codigo: string; placa: string | null }[]).map(
        (v) => ({ codigo: v.codigo, placa: v.placa })
      ),
      despacho,
      viajes,
      trazado,
      timbradas: (() => {
        const t = (timbRes.data ?? {}) as {
          timbradas?: number; bruto?: number; descuento?: number; viajes?: number;
        };
        return {
          timbradas: Number(t.timbradas ?? 0),
          bruto: Number(t.bruto ?? 0),
          descuento: Number(t.descuento ?? 0),
          viajes: Number(t.viajes ?? 0),
        };
      })(),
      horaDesde,
      horaHasta,
      celdas: (blob.celdas ?? []).map(([lat, lng, suben, bajan, pv, vel]) => ({
        lat: Number(lat),
        lng: Number(lng),
        suben: Number(suben),
        bajan: Number(bajan),
        puntoVirtual: pv ?? null,
        velocidad: vel == null ? null : Number(vel),
      })),
      porHora: (blob.por_hora ?? []).map((h) => ({
        hora: Number(h.hora),
        suben: Number(h.suben),
        bajan: Number(h.bajan),
      })),
      topPv,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rutas: ((rutasRes.data ?? []) as any[]).map((r) => ({
        ruta: r.ruta,
        viajes: Number(r.viajes),
        timbradas: Number(r.timbradas),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      puntosVirtuales: ((pvRes.data ?? []) as any[]).map((p) => ({
        codPv: p.cod_pv,
        nombre: p.nombre,
        lat: Number(p.lat),
        lng: Number(p.lng),
        isBase: !!p.is_base,
      })),
      alarmas: (
        ((alarmasRes.data ?? {}) as {
          eventos?: {
            fecha: string; hora: string; tipo: string;
            codigo_vehiculo: string | null; placa: string | null;
            conductor: string | null; direccion: string | null;
            punto_virtual: string | null;
            latitud: number | null; longitud: number | null;
          }[];
        }).eventos ?? []
      )
        .filter((e) => e.latitud != null && e.longitud != null)
        .map((e) => ({
          lat: Number(e.latitud),
          lng: Number(e.longitud),
          tipo: e.tipo,
          codigoVehiculo: e.codigo_vehiculo,
          placa: e.placa,
          conductor: e.conductor,
          fecha: e.fecha,
          hora: e.hora,
          lugar: e.punto_virtual ?? e.direccion ?? null,
        })),
      ultimaFechaSync,
    };
  } catch (e) {
    console.error("getMapaCalorData:", e);
    return null;
  }
}
