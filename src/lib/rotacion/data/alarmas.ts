import { createClient } from "@supabase/supabase-js";

export interface AlarmaEvento {
  fecha: string;
  hora: string;
  tipo: string;
  codigoVehiculo: string | null;
  placa: string | null;
  conductor: string | null;
  ruta: string | null;
  direccion: string | null;
  puntoVirtual: string | null;
  lat: number | null;
  lng: number | null;
}

export interface AlarmaTipo {
  tipo: string;
  total: number;
}

export interface AlarmaHora {
  hora: number;
  total: number;
}

export interface AlarmaAgregado {
  nombre: string; // vehículo (código) o conductor
  placa?: string | null;
  total: number;
  bloqueos: number;
  puertas: number;
  fallas: number;
}

export interface RutaAlarma {
  ruta: string;
}

export interface AlarmasData {
  desde: string;
  hasta: string;
  tipo: string | null; // 'BLOQUEO' | 'PUERTA' | 'FALLA'
  ruta: string | null;
  total: number;
  eventos: AlarmaEvento[];
  porTipo: AlarmaTipo[];
  porHora: AlarmaHora[];
  porVehiculo: AlarmaAgregado[];
  porConductor: AlarmaAgregado[];
  rutas: string[];
  ultimaFechaSync: string | null;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const TIPOS_VALIDOS = new Set(["BLOQUEO", "PUERTA", "FALLA"]);

export async function getAlarmasData(params: {
  desde?: string;
  hasta?: string;
  tipo?: string;
  ruta?: string;
}): Promise<AlarmasData | null> {
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
    const tipo = params.tipo && TIPOS_VALIDOS.has(params.tipo) ? params.tipo : null;
    const ruta = params.ruta || null;

    const [alarmas, rutasRes] = await Promise.all([
      supabase.rpc("get_alarmas", {
        p_desde: desde,
        p_hasta: hasta,
        p_tipo: tipo,
        p_ruta: ruta,
      }),
      supabase.rpc("get_mapa_calor_rutas", { p_desde: desde, p_hasta: hasta }),
    ]);
    for (const r of [alarmas, rutasRes]) {
      if (r.error) throw new Error(`rpc alarmas: ${r.error.message}`);
    }

    const blob = (alarmas.data ?? {}) as {
      total?: number;
      eventos?: {
        fecha: string; hora: string; tipo: string; codigo_vehiculo: string | null;
        placa: string | null; conductor: string | null; ruta: string | null;
        direccion: string | null; punto_virtual: string | null;
        latitud: number | null; longitud: number | null;
      }[];
      por_tipo?: { tipo: string; total: number }[];
      por_hora?: { hora: number; total: number }[];
      por_vehiculo?: {
        codigo: string; placa: string | null; total: number;
        bloqueos: number; puertas: number; fallas: number;
      }[];
      por_conductor?: {
        conductor: string; total: number; bloqueos: number; puertas: number; fallas: number;
      }[];
    };

    return {
      desde,
      hasta,
      tipo,
      ruta,
      total: Number(blob.total ?? 0),
      eventos: (blob.eventos ?? []).map((e) => ({
        fecha: e.fecha,
        hora: e.hora,
        tipo: e.tipo,
        codigoVehiculo: e.codigo_vehiculo,
        placa: e.placa,
        conductor: e.conductor,
        ruta: e.ruta,
        direccion: e.direccion,
        puntoVirtual: e.punto_virtual,
        lat: e.latitud == null ? null : Number(e.latitud),
        lng: e.longitud == null ? null : Number(e.longitud),
      })),
      porTipo: (blob.por_tipo ?? []).map((t) => ({ tipo: t.tipo, total: Number(t.total) })),
      porHora: (blob.por_hora ?? []).map((h) => ({ hora: Number(h.hora), total: Number(h.total) })),
      porVehiculo: (blob.por_vehiculo ?? []).map((v) => ({
        nombre: v.codigo,
        placa: v.placa,
        total: Number(v.total),
        bloqueos: Number(v.bloqueos),
        puertas: Number(v.puertas),
        fallas: Number(v.fallas),
      })),
      porConductor: (blob.por_conductor ?? []).map((c) => ({
        nombre: c.conductor,
        total: Number(c.total),
        bloqueos: Number(c.bloqueos),
        puertas: Number(c.puertas),
        fallas: Number(c.fallas),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rutas: ((rutasRes.data ?? []) as any[]).map((r) => r.ruta),
      ultimaFechaSync,
    };
  } catch (e) {
    console.error("getAlarmasData:", e);
    return null;
  }
}
