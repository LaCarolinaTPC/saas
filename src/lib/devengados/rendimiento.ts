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
  /** RANGO = agregado de varios días; CIERRE = tomado del cierre de GEMA
   *  (en ambos no hay partición superior/inferior). */
  segmento: "SUPERIOR" | "INFERIOR" | "RANGO" | "CIERRE";
  promedio: number;
  vjsL: number;
  timbInd: number;
  conductores: RendimientoConductor[];
}

export interface RendimientoGrupo {
  grupo: string;         // CALLE 30 · CALLE 17 · MIRAMAR · EXPRESS
  flota: "NV" | "GN";
  /** Día (YYYY-MM-DD) al que pertenece el bloque; ausente solo en el
   *  agregado RANGO estimado (pedido de Nestor, 29-jul-2026: cada detalle
   *  por ruta debe decir de qué fecha es). */
  fecha?: string;
  promedio: number;
  vjsL: number;
  timbInd: number;
  segmentos: RendimientoSegmento[];
}

/**
 * Consolidado desde la tabla de cierre de GEMA (cierres_diarios): los
 * valores NO se calculan, se consultan tal cual los liquidó GEMA para que el
 * simulador muestre exactamente lo mismo que el análisis quincenal
 * (solicitud de Nestor, 24-jul-2026). Las columnas replican su Excel:
 * BRUTO = salario bruto día ÷ %pago y, en tipos de cierre "CU", la
 * TIMBRADA CU = ese bruto ÷ tarifa acumulando TODOS los decimales — solo se
 * redondea a 2 al final. Así BRUTO = TIMB. CU × tarifa y ambos cuadran
 * dígito a dígito con su Excel (validado con el cód. 2783 del 22-jul:
 * 244,82 / $807.894). OJO: la columna `bruto` de la base de GEMA es un
 * valor GRUPAL (monto fijo por viaje compartido entre conductores) y NO se
 * usa: infla la CU ~10 % (cód. 2149: 273,80 en vez de 244,20) y no cuadra
 * con CU × tarifa (cód. 2566 del 24-jul: $932.839 en vez de $841.950 —
 * reclamos de Nestor, 27-jul-2026). AHORRO = ahorro + ahorro obligatorio.
 * Admite rango de fechas (segmentación por corte): la base se descuenta por
 * cada día con cierre (campo `dias`).
 */
export interface CierreConductorDia {
  codigo: string;
  vehiculos: string[];
  rutas: string[];
  dias: number;        // días con cierre en el rango (para descontar la base)
  viajes: number;
  timbrada: number;
  tarifa: number;      // 0 = el rango mezcla tarifas ($3.300 y $3.400)
  bruto: number;
  salarioBrutoDia: number;
  ahorro: number;
  salarioNetoDia: number;
}

type CierreDiaRow = {
  cod_conductor: string;
  fecha: string;
  ruta: string | null;
  vehiculo: string | null;
  grupo_liquidacion: string | null;
  tipo_cierre: string | null;
  viajes: number | null;
  timbradas: number | null;
  pct_total: number | null;
  salario_bruto_dia: number | null;
  salario_neto_dia: number | null;
  ahorro: number | null;
  ahorro_obli: number | null;
};

// Tarifa del día como en GEMA: domingo paga $3.400, el resto $3.300.
function tarifaDe(fecha: string): number {
  return new Date(`${fecha}T12:00:00-05:00`).getUTCDay() === 0 ? 3400 : 3300;
}

export async function getCierreDia(fecha: string): Promise<CierreConductorDia[]> {
  return getCierreRango(fecha, fecha);
}

export async function getCierreRango(
  ini: string,
  fin: string
): Promise<CierreConductorDia[]> {
  return (await getCierreConDetalle(ini, fin)).conductores;
}

/** TIMB. CU de una fila del cierre: derivada del salario liquidado en los
 *  tipos CU (ver nota de arriba sobre el `bruto` grupal). Exportada porque
 *  la liquidación consolidada (liquidacion.ts) usa la misma derivación. */
export function timbCuDeFila(
  r: Pick<CierreDiaRow, "fecha" | "tipo_cierre" | "timbradas" | "pct_total" | "salario_bruto_dia">
): number {
  const tarifa = tarifaDe(r.fecha);
  const esCu = (r.tipo_cierre ?? "").trim().toUpperCase().startsWith("CU");
  if (!esCu) return Number(r.timbradas ?? 0);
  const pct = Number(r.pct_total ?? 0) || 16;
  return Number(r.salario_bruto_dia ?? 0) / (pct / 100) / tarifa;
}

/**
 * Consulta del cierre + detalle por ruta tomado del MISMO cierre: cada fila
 * de cierres_diarios trae la ruta, así que el detalle son los valores
 * liquidados reagrupados — coincide dígito a dígito con la tabla principal.
 * (Antes el detalle se reconstruía desde viajes_recaudados con la partición
 * superior/inferior, pero GEMA tiene varios modos de liquidar — p. ej.
 * "CU (RUTAS,GRUPOS)" paga al promedio de la RUTA, no al del segmento del
 * conductor — y la reconstrucción no cuadraba; reclamo de Nestor,
 * 27-jul-2026, cód. 2584 del 23/07: 170,32 vs 126,26.)
 */
export async function getCierreConDetalle(
  ini: string,
  fin: string
): Promise<{ conductores: CierreConductorDia[]; detalle: RendimientoGrupo[] }> {
  const supabase = createAdminClient();
  const PAGE = 1000;
  const rows: CierreDiaRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("cierres_diarios")
      .select(
        "cod_conductor, fecha, ruta, vehiculo, grupo_liquidacion, tipo_cierre, viajes, timbradas, pct_total, salario_bruto_dia, salario_neto_dia, ahorro, ahorro_obli"
      )
      .gte("fecha", ini)
      .lte("fecha", fin)
      // Orden total (fecha + id único): sin él, la paginación con range()
      // puede repetir/perder filas entre páginas y descuadrar el cierre.
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as CierreDiaRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  return { conductores: consolidarCierre(rows), detalle: detalleCierrePorRuta(rows) };
}

/** Detalle por ruta/flota reagrupando las filas del cierre (mismos valores
 *  liquidados: Vjs, Timb IND de GEMA y TIMB. CU derivada del salario). En
 *  rango, cada día del cierre es su propio bloque con su fecha. */
function detalleCierrePorRuta(rows: CierreDiaRow[]): RendimientoGrupo[] {
  type Acc = { vehiculos: Set<string>; viajes: number; timbInd: number; timbCu: number };
  const grupos = new Map<string, Map<string, Acc>>();
  for (const r of rows) {
    const flota =
      (r.grupo_liquidacion ?? "").trim().toUpperCase() === "NV" ||
      Number(r.vehiculo) >= 1000
        ? "NV"
        : "GN";
    const gKey = `${r.fecha}|${grupoDeRuta(r.ruta ?? "")}|${flota}`;
    let conds = grupos.get(gKey);
    if (!conds) grupos.set(gKey, (conds = new Map()));
    let acc = conds.get(r.cod_conductor);
    if (!acc)
      conds.set(
        r.cod_conductor,
        (acc = { vehiculos: new Set(), viajes: 0, timbInd: 0, timbCu: 0 })
      );
    if (r.vehiculo) acc.vehiculos.add(r.vehiculo);
    acc.viajes += Number(r.viajes ?? 0);
    acc.timbInd += Number(r.timbradas ?? 0);
    acc.timbCu += timbCuDeFila(r);
  }

  const resultado: RendimientoGrupo[] = [];
  for (const [gKey, conds] of grupos) {
    const [fecha, grupo, flota] = gKey.split("|") as [string, string, "NV" | "GN"];
    const conductores: RendimientoConductor[] = [...conds.entries()]
      .map(([codigo, a]) => ({
        codigo,
        vehiculos: [...a.vehiculos].sort(),
        vjsR: a.viajes,
        vjsL: a.viajes,
        timbInd: a.timbInd,
        timbCu: round2(a.timbCu),
      }))
      .sort((a, b) =>
        (b.vjsL > 0 ? b.timbCu / b.vjsL : 0) - (a.vjsL > 0 ? a.timbCu / a.vjsL : 0)
      );
    const viajes = conductores.reduce((s, c) => s + c.vjsL, 0);
    const timbInd = conductores.reduce((s, c) => s + c.timbInd, 0);
    const timbCu = conductores.reduce((s, c) => s + c.timbCu, 0);
    // El promedio del encabezado es la tasa LIQUIDADA por viaje (CU/viajes).
    const promedio = round2(viajes > 0 ? timbCu / viajes : 0);
    resultado.push({
      grupo,
      flota,
      fecha,
      promedio,
      vjsL: viajes,
      timbInd,
      segmentos: [{ segmento: "CIERRE", promedio, vjsL: viajes, timbInd, conductores }],
    });
  }
  return ordenarGrupos(resultado);
}

function consolidarCierre(rows: CierreDiaRow[]): CierreConductorDia[] {
  type Acc = CierreConductorDia & { fechas: Set<string>; tarifas: Set<number> };
  const porConductor = new Map<string, Acc>();
  for (const r of rows) {
    const codigo = r.cod_conductor;
    let acc = porConductor.get(codigo);
    if (!acc) {
      porConductor.set(
        codigo,
        (acc = {
          codigo,
          vehiculos: [],
          rutas: [],
          dias: 0,
          viajes: 0,
          timbrada: 0,
          tarifa: 0,
          bruto: 0,
          salarioBrutoDia: 0,
          ahorro: 0,
          salarioNetoDia: 0,
          fechas: new Set(),
          tarifas: new Set(),
        })
      );
    }
    if (r.vehiculo && !acc.vehiculos.includes(r.vehiculo)) acc.vehiculos.push(r.vehiculo);
    if (r.ruta && !acc.rutas.includes(r.ruta)) acc.rutas.push(r.ruta);
    acc.fechas.add(r.fecha);
    acc.viajes += Number(r.viajes ?? 0);
    const tarifa = tarifaDe(r.fecha);
    acc.tarifas.add(tarifa);
    const salarioBruto = Number(r.salario_bruto_dia ?? 0);
    const pct = Number(r.pct_total ?? 0) || 16;
    // Bruto derivado del salario (el de la base de GEMA es grupal y no
    // cuadra con CU × tarifa): así BRUTO = TIMB. CU × tarifa, como el Excel.
    const bruto = salarioBruto / (pct / 100);
    acc.timbrada += timbCuDeFila(r);
    acc.bruto += bruto;
    acc.salarioBrutoDia += salarioBruto;
    acc.ahorro += Number(r.ahorro ?? 0) + Number(r.ahorro_obli ?? 0);
    acc.salarioNetoDia += Number(r.salario_neto_dia ?? 0);
  }

  return [...porConductor.values()]
    .map(({ fechas, tarifas, ...c }) => ({
      ...c,
      vehiculos: c.vehiculos.sort(),
      dias: fechas.size,
      tarifa: tarifas.size === 1 ? [...tarifas][0] : 0,
      timbrada: round2(c.timbrada),
      bruto: Math.round(c.bruto),
      salarioBrutoDia: round2(c.salarioBrutoDia),
      ahorro: round2(c.ahorro),
      salarioNetoDia: round2(c.salarioNetoDia),
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
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
      // numero es UNIQUE: orden estable para paginar sin repetir/perder filas.
      .order("numero", { ascending: true })
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
      fecha,
      promedio: round2(vjsLTotal > 0 ? timbTotal / vjsLTotal : 0),
      vjsL: vjsLTotal,
      timbInd: timbTotal,
      segmentos: [
        armarSegmento("SUPERIOR", superior),
        ...(inferior.length ? [armarSegmento("INFERIOR", inferior)] : []),
      ],
    });
  }

  return ordenarGrupos(resultado);
}

// Orden estable: por fecha, luego por grupo y NV antes que GN, como el reporte.
function ordenarGrupos(grupos: RendimientoGrupo[]): RendimientoGrupo[] {
  const orden = ["CALLE 30", "CALLE 17", "MIRAMAR", "EXPRESS"];
  return grupos.sort((a, b) => {
    if ((a.fecha ?? "") !== (b.fecha ?? "")) return (a.fecha ?? "") < (b.fecha ?? "") ? -1 : 1;
    const ga = orden.indexOf(a.grupo);
    const gb = orden.indexOf(b.grupo);
    if (ga !== gb) return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb);
    return a.flota === b.flota ? 0 : a.flota === "NV" ? -1 : 1;
  });
}

/**
 * Detalle por ruta para un rango de fechas: como la partición
 * SUPERIOR/INFERIOR de GEMA es DIARIA, se calcula cada día por separado (la
 * TIMB. CU de cada día con su propio promedio de segmento, igual que
 * liquida GEMA) y se suman los resultados por ruta/flota y conductor. El
 * agregado va en un único segmento "RANGO" (pedido de Nestor, 27-jul-2026).
 */
export async function getRendimientoRango(
  ini: string,
  fin: string
): Promise<RendimientoGrupo[]> {
  if (ini === fin) return getRendimientoDia(ini);

  const fechas: string[] = [];
  const d = new Date(`${ini}T12:00:00Z`);
  for (let i = 0; i < 62; i++) {
    const f = d.toISOString().slice(0, 10);
    if (f > fin) break;
    fechas.push(f);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const dias = await Promise.all(fechas.map(getRendimientoDia));

  type Acc = {
    vehiculos: Set<string>;
    vjsR: number;
    vjsL: number;
    timbInd: number;
    timbCu: number;
  };
  const grupos = new Map<string, Map<string, Acc>>();
  for (const dia of dias)
    for (const g of dia) {
      const gKey = `${g.grupo}|${g.flota}`;
      let conds = grupos.get(gKey);
      if (!conds) grupos.set(gKey, (conds = new Map()));
      for (const s of g.segmentos)
        for (const c of s.conductores) {
          let acc = conds.get(c.codigo);
          if (!acc)
            conds.set(
              c.codigo,
              (acc = { vehiculos: new Set(), vjsR: 0, vjsL: 0, timbInd: 0, timbCu: 0 })
            );
          c.vehiculos.forEach((v) => acc.vehiculos.add(v));
          acc.vjsR += c.vjsR;
          acc.vjsL += c.vjsL;
          acc.timbInd += c.timbInd;
          acc.timbCu += c.timbCu;
        }
    }

  const resultado: RendimientoGrupo[] = [];
  for (const [gKey, conds] of grupos) {
    const [grupo, flota] = gKey.split("|") as [string, "NV" | "GN"];
    const conductores = [...conds.entries()]
      .map(([codigo, a]) => ({
        codigo,
        vehiculos: [...a.vehiculos].sort(),
        vjsR: a.vjsR,
        vjsL: a.vjsL,
        timbInd: a.timbInd,
        timbCu: round2(a.timbCu),
      }))
      .sort((a, b) =>
        (b.vjsL > 0 ? b.timbInd / b.vjsL : 0) - (a.vjsL > 0 ? a.timbInd / a.vjsL : 0)
      );
    const vjsL = conductores.reduce((s, c) => s + c.vjsL, 0);
    const timbInd = conductores.reduce((s, c) => s + c.timbInd, 0);
    const promedio = round2(vjsL > 0 ? timbInd / vjsL : 0);
    resultado.push({
      grupo,
      flota,
      promedio,
      vjsL,
      timbInd,
      segmentos: [{ segmento: "RANGO", promedio, vjsL, timbInd, conductores }],
    });
  }
  return ordenarGrupos(resultado);
}
