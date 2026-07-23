import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rendimiento diario por conductor, reproduciendo el reporte "Promedios de
 * Conductores" de GEMA: agrupa los viajes del día por ruta y flota, parte
 * cada grupo en SUPERIOR/INFERIOR por rendimiento y calcula la timbrada de
 * cuota única (TIMB. CU = viajes liquidados × promedio del segmento).
 *
 * Validado contra el PDF de GEMA del 21-jul-2026 (ver
 * docs/simulador-rendimiento.md). Solo expone el CÓDIGO del conductor —
 * nunca nombre ni cédula — porque la pantalla es para socialización.
 */

export interface RendimientoConductor {
  codigo: string;
  vehiculos: string[];
  vjsR: number;      // viajes realizados
  vjsL: number;      // viajes liquidados (novedad ≠ NORMAL cuenta 0.5)
  timbInd: number;   // timbradas individuales del día
  timbCu: number;    // vjsL × promedio del segmento
}

export interface RendimientoSegmento {
  segmento: "SUPERIOR" | "INFERIOR";
  promedio: number;
  vjsL: number;
  timbInd: number;
  conductores: RendimientoConductor[];
}

export interface RendimientoGrupo {
  grupo: string;         // CALLE 30 · CALLE 17 · MIRAMAR · EXPRESS
  flota: "NV" | "GN";
  promedio: number;
  vjsL: number;
  timbInd: number;
  segmentos: RendimientoSegmento[];
}

type ViajeRend = {
  codigo_vehiculo: string | null;
  codigo_conductor: string | null;
  ruta_programada: string | null;
  ruta_reprogramada: string | null;
  timbradas: number | null;
  novedad: string | null;
};

/** "A -- 16 MIRAMAR" (doble guion) es EXPRESS; el resto por nombre de calle. */
function grupoDeRuta(ruta: string): string {
  if (/-\s*-/.test(ruta)) return "EXPRESS";
  if (ruta.includes("CALLE 30")) return "CALLE 30";
  if (ruta.includes("CALLE 17")) return "CALLE 17";
  if (ruta.includes("MIRAMAR")) return "MIRAMAR";
  return ruta || "OTRAS";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getRendimientoDia(fecha: string): Promise<RendimientoGrupo[]> {
  const supabase = createAdminClient();
  const PAGE = 1000;
  const viajes: ViajeRend[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("viajes_recaudados")
      .select("codigo_vehiculo, codigo_conductor, ruta_programada, ruta_reprogramada, timbradas, novedad")
      .eq("fecha_viaje", fecha)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as ViajeRend[];
    viajes.push(...rows);
    if (rows.length < PAGE) break;
  }

  // grupo+flota → conductor → acumulado
  type Acc = { vehiculos: Set<string>; vjsR: number; vjsL: number; timbInd: number };
  const grupos = new Map<string, Map<string, Acc>>();
  for (const v of viajes) {
    const ruta = v.ruta_reprogramada || v.ruta_programada || "";
    const flota = Number(v.codigo_vehiculo) >= 1000 ? "NV" : "GN";
    const gKey = `${grupoDeRuta(ruta)}|${flota}`;
    const codigo = v.codigo_conductor || "—";
    let conds = grupos.get(gKey);
    if (!conds) grupos.set(gKey, (conds = new Map()));
    let acc = conds.get(codigo);
    if (!acc) conds.set(codigo, (acc = { vehiculos: new Set(), vjsR: 0, vjsL: 0, timbInd: 0 }));
    if (v.codigo_vehiculo) acc.vehiculos.add(v.codigo_vehiculo);
    acc.vjsR += 1;
    // Un viaje con novedad (varado, no finalizado…) liquida medio viaje,
    // como en el reporte de GEMA.
    acc.vjsL += v.novedad === "NORMAL" ? 1 : 0.5;
    acc.timbInd += Number(v.timbradas ?? 0);
  }

  const resultado: RendimientoGrupo[] = [];
  for (const [gKey, conds] of grupos) {
    const [grupo, flota] = gKey.split("|") as [string, "NV" | "GN"];
    const lista = [...conds.entries()]
      .map(([codigo, a]) => ({
        codigo,
        vehiculos: [...a.vehiculos].sort(),
        vjsR: a.vjsR,
        vjsL: a.vjsL,
        timbInd: a.timbInd,
        prom: a.vjsL > 0 ? a.timbInd / a.vjsL : 0,
      }))
      .sort((a, b) => b.prom - a.prom);

    const vjsLTotal = lista.reduce((s, c) => s + c.vjsL, 0);
    const timbTotal = lista.reduce((s, c) => s + c.timbInd, 0);

    // Partición SUPERIOR/INFERIOR: por ranking de timbradas/viaje, cortando
    // cuando el acumulado de viajes alcanza la mitad del grupo (el conductor
    // que cruza la mitad queda en SUPERIOR, como en GEMA).
    const superior: typeof lista = [];
    const inferior: typeof lista = [];
    let acum = 0;
    for (const c of lista) {
      if (acum < vjsLTotal / 2) {
        superior.push(c);
        acum += c.vjsL;
      } else {
        inferior.push(c);
      }
    }

    const armarSegmento = (
      segmento: "SUPERIOR" | "INFERIOR",
      seg: typeof lista
    ): RendimientoSegmento => {
      const vjsL = seg.reduce((s, c) => s + c.vjsL, 0);
      const timbInd = seg.reduce((s, c) => s + c.timbInd, 0);
      // GEMA redondea el promedio a 2 decimales ANTES de multiplicar por los
      // viajes: se replica para que la TIMB. CU cuadre dígito a dígito.
      const promedio = round2(vjsL > 0 ? timbInd / vjsL : 0);
      return {
        segmento,
        promedio,
        vjsL,
        timbInd,
        conductores: seg.map((c) => ({
          codigo: c.codigo,
          vehiculos: c.vehiculos,
          vjsR: c.vjsR,
          vjsL: c.vjsL,
          timbInd: c.timbInd,
          timbCu: round2(c.vjsL * promedio),
        })),
      };
    };

    resultado.push({
      grupo,
      flota,
      promedio: round2(vjsLTotal > 0 ? timbTotal / vjsLTotal : 0),
      vjsL: vjsLTotal,
      timbInd: timbTotal,
      segmentos: [
        armarSegmento("SUPERIOR", superior),
        ...(inferior.length ? [armarSegmento("INFERIOR", inferior)] : []),
      ],
    });
  }

  // Orden estable: por grupo y NV antes que GN, como el reporte.
  const ordenGrupo = ["CALLE 30", "CALLE 17", "MIRAMAR", "EXPRESS"];
  resultado.sort((a, b) => {
    const ga = ordenGrupo.indexOf(a.grupo);
    const gb = ordenGrupo.indexOf(b.grupo);
    if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
    return a.flota === b.flota ? 0 : a.flota === "NV" ? -1 : 1;
  });
  return resultado;
}
