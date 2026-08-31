import { createClient } from "@supabase/supabase-js";

export interface CeldaMapa {
  lat: number;
  lng: number;
  suben: number;
  bajan: number;
  puntoVirtual: string | null;
}

export interface HoraTotal {
  hora: number;
  suben: number;
  bajan: number;
}

export interface PvTop {
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
  horaDesde: number;
  horaHasta: number;
  celdas: CeldaMapa[];
  porHora: HoraTotal[];
  topPv: PvTop[];
  rutas: RutaTotal[];
  puntosVirtuales: PuntoVirtual[];
  ultimaFechaSync: string | null;
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
      }),
      supabase.rpc("get_mapa_calor_rutas", { p_desde: desde, p_hasta: hasta }),
      supabase.rpc("get_mapa_calor_puntos", { p_desde: desde, p_hasta: hasta }),
    ]);
    for (const r of [mapa, rutasRes, pvRes]) {
      if (r.error) throw new Error(`rpc mapa-calor: ${r.error.message}`);
    }

    // celdas viaja compacto: [lat, lng, suben, bajan, punto_virtual|null]
    type CeldaRaw = [number, number, number, number, string | null];
    const blob = (mapa.data ?? {}) as {
      celdas?: CeldaRaw[];
      por_hora?: { hora: number; suben: number; bajan: number }[];
      top_pv?: { nombre: string; suben: number; bajan: number }[];
    };

    return {
      desde,
      hasta,
      ruta,
      horaDesde,
      horaHasta,
      celdas: (blob.celdas ?? []).map(([lat, lng, suben, bajan, pv]) => ({
        lat: Number(lat),
        lng: Number(lng),
        suben: Number(suben),
        bajan: Number(bajan),
        puntoVirtual: pv ?? null,
      })),
      porHora: (blob.por_hora ?? []).map((h) => ({
        hora: Number(h.hora),
        suben: Number(h.suben),
        bajan: Number(h.bajan),
      })),
      topPv: (blob.top_pv ?? []).map((t) => ({
        nombre: t.nombre,
        suben: Number(t.suben),
        bajan: Number(t.bajan),
      })),
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
