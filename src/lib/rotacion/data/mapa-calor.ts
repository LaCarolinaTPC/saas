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

export interface PuntoVirtual {
  codPv: string;
  nombre: string;
  lat: number;
  lng: number;
  isBase: boolean;
}

export interface MapaCalorData {
  desde: string;
  hasta: string;
  ruta: string | null;
  punto: string | null;
  horaDesde: number;
  horaHasta: number;
  celdas: CeldaMapa[];
  porHora: HoraTotal[];
  topPv: PvTop[];
  rutas: RutaTotal[];
  puntosVirtuales: PuntoVirtual[];
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
    let horaDesde = clampHora(params.hd, 0);
    let horaHasta = clampHora(params.hh, 23);
    if (horaDesde > horaHasta) [horaDesde, horaHasta] = [horaHasta, horaDesde];

    const [mapa, rutasRes, pvRes] = await Promise.all([
      supabase.rpc("get_mapa_calor", {
        p_desde: desde,
        p_hasta: hasta,
        p_ruta: ruta,
        p_hora_desde: horaDesde,
        p_hora_hasta: horaHasta,
        p_punto: punto,
      }),
      supabase.rpc("get_mapa_calor_rutas", { p_desde: desde, p_hasta: hasta }),
      supabase.rpc("get_mapa_calor_puntos", { p_desde: desde, p_hasta: hasta }),
    ]);
    for (const r of [mapa, rutasRes, pvRes]) {
      if (r.error) throw new Error(`rpc mapa-calor: ${r.error.message}`);
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
      ultimaFechaSync,
    };
  } catch (e) {
    console.error("getMapaCalorData:", e);
    return null;
  }
}
