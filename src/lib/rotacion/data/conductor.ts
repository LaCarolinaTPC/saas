import { createClient } from "@supabase/supabase-js";

/** Datos básicos del conductor para el módulo de accidentabilidad. */
export async function getConductorBasic(cedula: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("conductores")
    .select("id, cedula, nombre, licencia, venc_licencia, celular, correo, estado")
    .eq("cedula", cedula.trim())
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function getConductorProfile(cedula: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: conductor, error: condError } = await supabase
    .from("conductores_con_grupo")
    .select("*")
    .eq("cedula", cedula)
    .single();

  if (condError || !conductor) return null;

  // Apply date cutoff only when conductor was re-hired; otherwise fetch full history.
  const fechaCorte: string | null = conductor.fecha_reingreso ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cierres: any[] = [];
  if (conductor.codigo) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("cierres_diarios")
      .select("fecha, ruta, vehiculo, viajes, timbradas, diff_tim, prom_tim, pct_indiv, pct_grupo, pct_total")
      .eq("cod_conductor", conductor.codigo);
    if (fechaCorte) q = q.gte("fecha", fechaCorte);
    const { data } = await q.order("fecha", { ascending: true });
    cierres = data || [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let vpQ: any = supabase
    .from("viajes_perdidos")
    .select("*")
    .eq("cedula_conductor", cedula);
  if (fechaCorte) vpQ = vpQ.gte("fecha", fechaCorte);
  const { data: viajes_perdidos } = await vpQ.order("fecha", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ausQ: any = supabase
    .from("ausentismo")
    .select("consecutivo_incapacidad, dias_it_pagados, origen, fecha_inicio, fecha_fin, diagnostico, eps, indicador_prorroga, cie10, genero, edad, antiguedad, vinculacion, cargo")
    .eq("cedula", cedula);
  if (fechaCorte) ausQ = ausQ.gte("fecha_inicio", fechaCorte);
  const { data: ausentismo } = await ausQ.order("fecha_inicio", { ascending: false });

  const { data: familia } = await supabase
    .from("familia")
    .select("nombre_familiar, parentesco, edad")
    .eq("cedula_empleado", cedula);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let incQ: any = supabase
    .from("incentivos")
    .select("mes_entrega, periodo, valor, concepto")
    .eq("cedula", cedula);
  if (fechaCorte) {
    const corte = fechaCorte.slice(0, 7) + "-01";
    incQ = incQ.or(`periodo.gte.${corte},periodo.is.null`);
  }
  const { data: incentivos } = await incQ.order("periodo", { ascending: false, nullsFirst: false });

  const vp = viajes_perdidos || [];
  const vpConductor = vp.filter((v: Record<string, unknown>) => (v.tipologia as string)?.toUpperCase() === "CONDUCTOR");

  const totalTimbradas = (cierres || []).reduce((sum: number, c: Record<string, unknown>) => sum + Number(c.timbradas || 0) - Number(c.diff_tim || 0), 0);
  const diasTrabajados = new Set((cierres || []).map((c: Record<string, unknown>) => c.fecha)).size;

  const inc = incentivos || [];
  const kpis = {
    dias_trabajados: diasTrabajados,
    total_timbradas: Math.round(totalTimbradas),
    total_vp: vpConductor.length,
    accidentes: vp.filter((v: Record<string, unknown>) => (v.novedad as string)?.toUpperCase().includes("ACCIDENTE")).length,
    incapacidades: (ausentismo || []).length,
    dias_incapacidad: (ausentismo || []).reduce((sum: number, a: Record<string, unknown>) => sum + Number(a.dias_it_pagados || 0), 0),
    familiares: (familia || []).length,
    num_incentivos: inc.length,
    total_incentivos: inc.reduce((sum: number, i: Record<string, unknown>) => sum + Number(i.valor || 0), 0),
  };

  return {
    conductor,
    cierres: cierres || [],
    viajes_perdidos: vp,
    ausentismo: ausentismo || [],
    familia: familia || [],
    incentivos: inc,
    kpis,
  };
}
