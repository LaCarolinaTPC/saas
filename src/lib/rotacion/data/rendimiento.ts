import { createClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(supabase: any, table: string, select: string, opts?: {
  filter?: { col: string; val: string };
  dateRange?: { col: string; desde?: string; hasta?: string };
}): Promise<any[]> {
  const PAGE = 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let all: any[] = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (opts?.filter) q = q.eq(opts.filter.col, opts.filter.val);
    if (opts?.dateRange?.desde) q = q.gte(opts.dateRange.col, opts.dateRange.desde);
    if (opts?.dateRange?.hasta) q = q.lte(opts.dateRange.col, opts.dateRange.hasta);
    const { data } = await q;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

interface ConductorAgg {
  cedula: string;
  nombre: string;
  codigo: string | null;
  grupo: string;
  meses: number;
  tipo: string | null;
  totalTimbradas: number;
  totalViajes: number;
  diasTrabajados: number;
  promTimDia: number;
  vpTotal: number;
  vpAusencia: number;
  vpAccidente: number;
  accHistorico: boolean;
  quincenas: Record<string, { timbradas: number; viajes: number; dias: number; vp: number; vpAusencia: number; vpAccidente: number }>;
}

export async function getRendimientoData(fechaDesde?: string, fechaHasta?: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const dateRange = (fechaDesde || fechaHasta)
    ? { desde: fechaDesde, hasta: fechaHasta }
    : undefined;

  const [conductores, cierres, vp, aus] = await Promise.all([
    fetchAll(supabase, "conductores_con_grupo", "cedula, nombre, codigo, tipo_conductor, fecha_ingreso, estado, grupo_antiguedad, meses_antiguedad", {
      filter: { col: "estado", val: "ACTIVO" },
    }),
    fetchAll(supabase, "cierres_diarios", "cod_conductor, fecha, viajes, timbradas, diff_tim, prom_tim, ruta", {
      dateRange: dateRange ? { col: "fecha", ...dateRange } : undefined,
    }),
    fetchAll(supabase, "viajes_perdidos", "cedula_conductor, tipologia, novedad, fecha, periodo, quincena, conductor_nombre", {
      dateRange: dateRange ? { col: "fecha", ...dateRange } : undefined,
    }),
    fetchAll(supabase, "ausentismo", "cedula, dias_it_pagados"),
  ]);

  const codigoToCedula = new Map<string, string>();
  const cedulaToInfo = new Map<string, { nombre: string; codigo: string | null; grupo: string; meses: number; tipo: string | null }>();

  for (const c of conductores) {
    cedulaToInfo.set(c.cedula, { nombre: c.nombre, codigo: c.codigo, grupo: c.grupo_antiguedad || "1+a", meses: c.meses_antiguedad || 0, tipo: c.tipo_conductor });
    if (c.codigo) codigoToCedula.set(c.codigo, c.cedula);
  }

  const agg = new Map<string, ConductorAgg>();

  function getOrCreate(cedula: string): ConductorAgg | null {
    const info = cedulaToInfo.get(cedula);
    if (!info) return null;
    if (!agg.has(cedula)) {
      agg.set(cedula, {
        cedula, nombre: info.nombre, codigo: info.codigo, grupo: info.grupo, meses: info.meses, tipo: info.tipo,
        totalTimbradas: 0, totalViajes: 0, diasTrabajados: 0, promTimDia: 0,
        vpTotal: 0, vpAusencia: 0, vpAccidente: 0, accHistorico: false, quincenas: {},
      });
    }
    return agg.get(cedula)!;
  }

  const diasSet = new Map<string, Set<string>>();
  for (const c of cierres) {
    const cedula = codigoToCedula.get(c.cod_conductor);
    if (!cedula) continue;
    const a = getOrCreate(cedula);
    if (!a) continue;
    a.totalTimbradas += Number(c.timbradas || 0) - Number(c.diff_tim || 0);
    a.totalViajes += Number(c.viajes || 0);
    if (!diasSet.has(cedula)) diasSet.set(cedula, new Set());
    diasSet.get(cedula)!.add(c.fecha);
    const day = parseInt(c.fecha.split("-")[2], 10);
    const periodo = c.fecha.slice(0, 7);
    const qKey = `${periodo}-Q${day <= 15 ? 1 : 2}`;
    if (!a.quincenas[qKey]) a.quincenas[qKey] = { timbradas: 0, viajes: 0, dias: 0, vp: 0, vpAusencia: 0, vpAccidente: 0 };
    a.quincenas[qKey].timbradas += Number(c.timbradas || 0) - Number(c.diff_tim || 0);
    a.quincenas[qKey].viajes += Number(c.viajes || 0);
  }

  for (const [ced, dias] of diasSet) {
    const a = agg.get(ced);
    if (a) { a.diasTrabajados = dias.size; a.promTimDia = dias.size > 0 ? Math.round(a.totalTimbradas / dias.size) : 0; }
  }

  const vpConductor = vp.filter((v: { tipologia: string }) => (v.tipologia || "").toUpperCase() === "CONDUCTOR");
  for (const v of vpConductor) {
    const a = getOrCreate(v.cedula_conductor);
    if (!a) continue;
    a.vpTotal++;
    const nov = (v.novedad || "").toUpperCase();
    if (nov.includes("ACCIDENTE")) { a.vpAccidente++; a.accHistorico = true; } else { a.vpAusencia++; }
    const qKey = `${v.periodo}-Q${v.quincena}`;
    if (!a.quincenas[qKey]) a.quincenas[qKey] = { timbradas: 0, viajes: 0, dias: 0, vp: 0, vpAusencia: 0, vpAccidente: 0 };
    a.quincenas[qKey].vp++;
    if (nov.includes("ACCIDENTE")) a.quincenas[qKey].vpAccidente++; else a.quincenas[qKey].vpAusencia++;
  }

  for (const [ced, dias] of diasSet) {
    const a = agg.get(ced);
    if (!a) continue;
    for (const fecha of dias) {
      const day = parseInt(fecha.split("-")[2], 10);
      const periodo = fecha.slice(0, 7);
      const qKey = `${periodo}-Q${day <= 15 ? 1 : 2}`;
      if (a.quincenas[qKey]) a.quincenas[qKey].dias++;
    }
  }

  const conductorList = Array.from(agg.values());
  const grupos = ["0-3m", "3-6m", "6-12m", "1+a"];

  const resumen = {
    conductoresActivos: conductores.length,
    vpTotales: conductorList.reduce((s, c) => s + c.vpTotal, 0),
    vpAusencia: conductorList.reduce((s, c) => s + c.vpAusencia, 0),
    vpAccidente: conductorList.reduce((s, c) => s + c.vpAccidente, 0),
    sinVP: conductorList.filter((c) => c.vpTotal === 0).length,
    conAccidente: conductorList.filter((c) => c.accHistorico).length,
    promTimbradas: conductorList.filter(c => c.diasTrabajados > 0).length > 0
      ? Math.round(conductorList.reduce((s, c) => s + c.totalTimbradas, 0) / conductorList.filter(c => c.diasTrabajados > 0).length)
      : 0,
  };

  const gruposSummary = grupos.map((g) => {
    const gc = conductorList.filter((c) => c.grupo === g);
    const worked = gc.filter(c => c.diasTrabajados > 0);
    return {
      grupo: g, conductores: gc.length,
      timPromedio: worked.length > 0 ? Math.round(gc.reduce((s, c) => s + c.totalTimbradas, 0) / worked.length) : 0,
      vpTotal: gc.reduce((s, c) => s + c.vpTotal, 0),
      vpPromedio: gc.length > 0 ? +(gc.reduce((s, c) => s + c.vpTotal, 0) / gc.length).toFixed(1) : 0,
      conAccidente: gc.filter((c) => c.accHistorico).length,
      sinVP: gc.filter((c) => c.vpTotal === 0).length,
    };
  });

  const rangos = [
    { label: "0-1000", min: 0, max: 1000 }, { label: "1001-2500", min: 1001, max: 2500 },
    { label: "2501-4000", min: 2501, max: 4000 }, { label: "4001-5500", min: 4001, max: 5500 },
    { label: "5501-7000", min: 5501, max: 7000 }, { label: "7000+", min: 7001, max: Infinity },
  ];
  const distribucionTim = rangos.map((r) => ({ label: r.label, count: conductorList.filter((c) => c.totalTimbradas >= r.min && c.totalTimbradas <= r.max).length }));

  const allQKeys = new Set<string>();
  for (const c of conductorList) for (const k of Object.keys(c.quincenas)) allQKeys.add(k);
  const sortedQKeys = Array.from(allQKeys).sort();

  const quincenaStats = sortedQKeys.map((qk) => {
    let totalTim = 0, totalVP = 0, totalDias = 0, conductoresEnQ = 0;
    for (const c of conductorList) {
      const q = c.quincenas[qk];
      if (q && (q.dias > 0 || q.vp > 0)) { conductoresEnQ++; totalTim += q.timbradas; totalVP += q.vp; totalDias += q.dias; }
    }
    return { key: qk, timbradas: Math.round(totalTim), vp: totalVP, dias: totalDias, conductores: conductoresEnQ };
  });

  const quincenaTabla = conductorList.filter((c) => Object.keys(c.quincenas).length > 0).map((c) => {
    const qData: Record<string, { timbradas: number; vp: number; dias: number }> = {};
    for (const qk of sortedQKeys) { const q = c.quincenas[qk]; qData[qk] = q ? { timbradas: Math.round(q.timbradas), vp: q.vp, dias: q.dias } : { timbradas: 0, vp: 0, dias: 0 }; }
    return { cedula: c.cedula, nombre: c.nombre, grupo: c.grupo, quincenas: qData };
  });

  let evolucion = null;
  if (sortedQKeys.length >= 2) {
    const q1Key = sortedQKeys[sortedQKeys.length - 2], q2Key = sortedQKeys[sortedQKeys.length - 1];
    const evoList = conductorList.filter((c) => c.quincenas[q1Key]?.dias > 0 || c.quincenas[q2Key]?.dias > 0).map((c) => {
      const q1 = c.quincenas[q1Key], q2 = c.quincenas[q2Key];
      const promQ1 = q1 && q1.dias > 0 ? Math.round(q1.timbradas / q1.dias) : 0;
      const promQ2 = q2 && q2.dias > 0 ? Math.round(q2.timbradas / q2.dias) : 0;
      const delta = promQ1 > 0 ? Math.round(((promQ2 - promQ1) / promQ1) * 100) : 0;
      return { cedula: c.cedula, nombre: c.nombre, grupo: c.grupo, promQ1, promQ2, vpQ1: q1?.vp || 0, vpQ2: q2?.vp || 0, delta };
    });
    evolucion = {
      q1Key, q2Key,
      mejoraron: evoList.filter((e) => e.delta > 0).length,
      retrocedieron: evoList.filter((e) => e.delta < 0).length,
      sinCambio: evoList.filter((e) => e.delta === 0).length,
      deltaPromedio: evoList.length > 0 ? +(evoList.reduce((s, e) => s + e.delta, 0) / evoList.length).toFixed(1) : 0,
      top20: evoList.sort((a, b) => b.delta - a.delta).slice(0, 20).map((e) => ({ nombre: e.nombre, delta: e.delta })),
      tabla: evoList.sort((a, b) => b.delta - a.delta),
    };
  }

  const conAcc = conductorList.filter((c) => c.accHistorico);
  const accidentalidad = {
    conAccidente: conAcc.length,
    vpAccidenteTotal: conductorList.reduce((s, c) => s + c.vpAccidente, 0),
    porGrupo: grupos.map((g) => ({ grupo: g, count: conAcc.filter((c) => c.grupo === g).length })),
    topConductores: conAcc.sort((a, b) => b.vpAccidente - a.vpAccidente).slice(0, 15).map((c) => ({ nombre: c.nombre, grupo: c.grupo, accidentes: c.vpAccidente, timbradas: Math.round(c.totalTimbradas) })),
  };

  const tablaCompleta = conductorList.map((c) => ({
    cedula: c.cedula, nombre: c.nombre, grupo: c.grupo, meses: Math.round(c.meses), tipo: c.tipo,
    timbradas: Math.round(c.totalTimbradas), diasTrabajados: c.diasTrabajados, promTimDia: c.promTimDia,
    vpTotal: c.vpTotal, vpAusencia: c.vpAusencia, vpAccidente: c.vpAccidente, accHistorico: c.accHistorico,
  }));

  const ausPorConductor: Record<string, number> = {};
  for (const a of aus) ausPorConductor[a.cedula] = (ausPorConductor[a.cedula] || 0) + (a.dias_it_pagados || 0);

  // Compute date range label from actual data
  const allFechas = cierres.map((c: { fecha: string }) => c.fecha).filter(Boolean).sort();
  let periodoLabel = "";
  if (allFechas.length > 0) {
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const first = allFechas[0];
    const last = allFechas[allFechas.length - 1];
    const m1 = meses[parseInt(first.slice(5, 7), 10) - 1];
    const m2 = meses[parseInt(last.slice(5, 7), 10) - 1];
    const y1 = first.slice(0, 4);
    const y2 = last.slice(0, 4);
    periodoLabel = m1 === m2 && y1 === y2
      ? `${m1} ${y1}`
      : `${m1} — ${m2} ${y2}`;
  }

  return { resumen, grupos: gruposSummary, distribucionTim, quincenaStats, quincenaKeys: sortedQKeys, quincenaTabla, evolucion, accidentalidad, tablaCompleta, ausPorConductor, periodoLabel };
}
