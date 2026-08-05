import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseDiaria } from "./data";
import { timbCuDeFila } from "./rendimiento";

/**
 * Liquidación consolidada del conductor (reunión Nestor/Helmut, 29-jul-2026):
 * el reporte detallado confunde a los conductores, así que esta vista muestra
 * UNA línea por día (todas las rutas/vehículos del día sumados, porque el
 * porcentaje de pago es el mismo) y, entre los días, la transacción explícita
 * de RETIRO de cada pago — hoy el pago se "netea" sin mostrarse y genera las
 * preguntas de "ayer mi saldo era 60 y hoy 20, ¿por qué?".
 *
 * Aritmética del mockup de Excel de Nestor (vstLiquidaciones):
 *   saldo del día   = neto día − base diaria (la base se exige una vez por
 *                     día con producción, como en el motor de devengados)
 *   saldo corriente = Σ saldos de día − Σ retiros hasta esa fecha
 *   saldo final     = puede ser NEGATIVO (deuda) o positivo (disponible)
 * A diferencia del disponible de caja (engine.ts, piso 0 y regla de oro),
 * aquí el saldo es aritmética simple con signo: es una vista explicativa.
 */

export interface DetalleRutaLiq {
  ruta: string | null;
  vehiculo: string | null;
  tipoCierre: string;
  viajes: number;
  timbCu: number;
  brutoDia: number;
  ahorro: number;
  netoDia: number;
}

export interface MovDia {
  tipo: "dia";
  fecha: string;
  tiposCierre: string[]; // normalizados, únicos, en orden de aparición
  viajes: number;        // Viajes C: campo `viajes` del cierre (admite .5)
  timbCu: number;
  brutoDia: number;      // salario bruto día
  ahorro: number;        // ahorro + ahorro obligatorio
  netoDia: number;       // salario neto día
  base: number;          // base exigida del día (0 si no hubo producción)
  saldoDia: number;      // netoDia − base
  saldoCorriente: number;
  detalle: DetalleRutaLiq[];
}

export interface MovRetiro {
  tipo: "retiro";
  fecha: string;
  valor: number; // positivo; en pantalla se muestra restando
  saldoCorriente: number;
}

export type MovimientoLiq = MovDia | MovRetiro;

export interface LiquidacionConductor {
  codigo: string;
  ini: string;
  fin: string;
  baseDiaria: number;
  movimientos: MovimientoLiq[];
  totales: {
    dias: number;      // días con cierre en el rango
    viajes: number;
    brutoDia: number;
    ahorro: number;
    netoDia: number;
    baseAcum: number;
    retiros: number;
    saldoFinal: number; // Σ(neto − base) − retiros; con signo
  };
}

/**
 * Homologación de tipos de cierre (pedido de Nestor: "cuando encuentre este
 * término, que mejor lo mencionen de esta manera" — la leyenda de su Excel).
 * Los términos crudos de GEMA ("CU (RUTAS,GRUPOS)", "SEGURRUTAS, GRUPO (…)")
 * no los entiende el conductor; se traducen SOLO en presentación.
 */
export function normalizarTipoCierre(raw: string | null): string {
  const t = (raw ?? "").trim().toUpperCase();
  if (!t) return "—";
  if (t.startsWith("CU")) return t.includes("PROM") ? "CU promedios" : "CU Rutas";
  if (t.includes("SEGURRUTA")) return "Caja Única";
  if (t.includes("INDIVIDUAL")) return "Individual";
  return (raw ?? "").trim();
}

type CierreLiqRow = {
  cod_conductor: string;
  cedula_conductor: string | null;
  fecha: string;
  tipo_cierre: string | null;
  ruta: string | null;
  vehiculo: string | null;
  viajes: number | null;
  timbradas: number | null;
  pct_total: number | null;
  salario_bruto_dia: number | null;
  salario_neto_dia: number | null;
  ahorro: number | null;
  ahorro_obli: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const PAGE = 1000;

/**
 * Liquidación de un conductor por CÓDIGO (exacto) y rango de fechas.
 * Devuelve null si el rango no tiene ni cierres ni retiros para ese código.
 */
export async function getLiquidacionConductor(
  codigo: string,
  ini: string,
  fin: string
): Promise<LiquidacionConductor | null> {
  const supabase = createAdminClient();
  const baseDiaria = await getBaseDiaria();

  const rows: CierreLiqRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("cierres_diarios")
      .select(
        "cod_conductor, cedula_conductor, fecha, tipo_cierre, ruta, vehiculo, viajes, " +
          "timbradas, pct_total, salario_bruto_dia, salario_neto_dia, ahorro, ahorro_obli"
      )
      .eq("cod_conductor", codigo)
      .gte("fecha", ini)
      .lte("fecha", fin)
      // Orden total (fecha + id único): sin él la paginación puede repetir o
      // perder filas entre páginas (mismo caso que fetchCierres en data.ts).
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as CierreLiqRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  // Los retiros están registrados por CÉDULA: sale de los cierres del rango
  // o, si el rango no trae cierres (p. ej. solo hubo un pago), de la maestra.
  let cedula = rows.find((r) => r.cedula_conductor)?.cedula_conductor ?? null;
  if (!cedula) {
    const { data: cond } = await supabase
      .from("conductores")
      .select("cedula")
      .eq("codigo", codigo)
      .maybeSingle();
    cedula = (cond?.cedula as string | undefined) ?? null;
  }

  type EntregaLiq = { fecha: string; valor_entregado: number; created_at: string };
  let retiros: EntregaLiq[] = [];
  if (cedula) {
    const { data: entRows, error: entErr } = await supabase
      .from("devengados_entregas")
      .select("fecha, valor_entregado, created_at")
      .eq("cedula_conductor", cedula)
      .gte("fecha", ini)
      .lte("fecha", fin)
      .eq("movimiento", "DEBITO")
      .eq("estado", "activa")
      .order("fecha", { ascending: true })
      .order("created_at", { ascending: true });
    if (entErr) throw entErr;
    retiros = (entRows ?? []) as EntregaLiq[];
  }

  if (rows.length === 0 && retiros.length === 0) return null;

  // Un día = todas sus filas de cierre sumadas (varias rutas/vehículos).
  const porDia = new Map<string, { detalle: DetalleRutaLiq[] }>();
  for (const r of rows) {
    let dia = porDia.get(r.fecha);
    if (!dia) porDia.set(r.fecha, (dia = { detalle: [] }));
    dia.detalle.push({
      ruta: r.ruta,
      vehiculo: r.vehiculo,
      tipoCierre: normalizarTipoCierre(r.tipo_cierre),
      viajes: Number(r.viajes ?? 0),
      timbCu: round2(timbCuDeFila(r)),
      brutoDia: Number(r.salario_bruto_dia ?? 0),
      ahorro: Number(r.ahorro ?? 0) + Number(r.ahorro_obli ?? 0),
      netoDia: Number(r.salario_neto_dia ?? 0),
    });
  }

  // Un evento por día y uno por retiro; a igual fecha primero va el día (el
  // retiro se muestra después de la producción de su fecha, como en el mockup).
  type Evento =
    | { orden: 0; fecha: string; detalle: DetalleRutaLiq[] }
    | { orden: 1; fecha: string; valor: number };
  const eventos: Evento[] = [
    ...[...porDia.entries()].map(([fecha, d]): Evento => ({ orden: 0, fecha, detalle: d.detalle })),
    ...retiros.map((e): Evento => ({ orden: 1, fecha: e.fecha, valor: Number(e.valor_entregado ?? 0) })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);

  const movimientos: MovimientoLiq[] = [];
  const tot = { dias: 0, viajes: 0, brutoDia: 0, ahorro: 0, netoDia: 0, baseAcum: 0, retiros: 0 };
  let saldo = 0;
  for (const ev of eventos) {
    if (ev.orden === 1) {
      saldo = round2(saldo - ev.valor);
      tot.retiros = round2(tot.retiros + ev.valor);
      movimientos.push({ tipo: "retiro", fecha: ev.fecha, valor: ev.valor, saldoCorriente: saldo });
      continue;
    }
    const d = ev.detalle;
    const viajes = round2(d.reduce((s, x) => s + x.viajes, 0));
    const timbCu = round2(d.reduce((s, x) => s + x.timbCu, 0));
    const brutoDia = round2(d.reduce((s, x) => s + x.brutoDia, 0));
    const ahorro = round2(d.reduce((s, x) => s + x.ahorro, 0));
    const netoDia = round2(d.reduce((s, x) => s + x.netoDia, 0));
    // Como en el motor de devengados: la base solo se exige en días con
    // producción; un día en cero no genera déficit.
    const base = netoDia > 0 ? baseDiaria : 0;
    const saldoDia = round2(netoDia - base);
    saldo = round2(saldo + saldoDia);
    tot.dias += 1;
    tot.viajes = round2(tot.viajes + viajes);
    tot.brutoDia = round2(tot.brutoDia + brutoDia);
    tot.ahorro = round2(tot.ahorro + ahorro);
    tot.netoDia = round2(tot.netoDia + netoDia);
    tot.baseAcum = round2(tot.baseAcum + base);
    movimientos.push({
      tipo: "dia",
      fecha: ev.fecha,
      tiposCierre: [...new Set(d.map((x) => x.tipoCierre))],
      viajes,
      timbCu,
      brutoDia,
      ahorro,
      netoDia,
      base,
      saldoDia,
      saldoCorriente: saldo,
      detalle: d,
    });
  }

  return {
    codigo,
    ini,
    fin,
    baseDiaria,
    movimientos,
    totales: { ...tot, saldoFinal: saldo },
  };
}
