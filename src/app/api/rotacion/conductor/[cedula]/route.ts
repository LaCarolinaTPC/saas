import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ cedula: string }> }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { cedula } = await params;

  // 1. Conductor info
  const { data: conductor, error: condError } = await supabase
    .from("conductores_con_grupo")
    .select("*")
    .eq("cedula", cedula)
    .single();

  if (condError || !conductor) {
    return NextResponse.json({ error: "Conductor no encontrado" }, { status: 404 });
  }

  // Apply date cutoff only when conductor was re-hired; otherwise fetch full history.
  const fechaCorte: string | null = conductor.fecha_reingreso ?? null;

  // 2. Cierres diarios (via codigo)
  let cierres: Record<string, unknown>[] = [];
  if (conductor.codigo) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("cierres_diarios")
      .select(
        "fecha, ruta, vehiculo, viajes, timbradas, diff_tim, prom_tim, pct_indiv, pct_grupo, pct_total"
      )
      .eq("cod_conductor", conductor.codigo);
    if (fechaCorte) q = q.gte("fecha", fechaCorte);
    const { data } = await q.order("fecha", { ascending: true });
    cierres = data || [];
  }

  // 3. Viajes perdidos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let vpQ: any = supabase
    .from("viajes_perdidos")
    .select("*")
    .eq("cedula_conductor", cedula);
  if (fechaCorte) vpQ = vpQ.gte("fecha", fechaCorte);
  const { data: viajes_perdidos } = await vpQ.order("fecha", { ascending: false });

  // 4. Ausentismo (all fields needed for display)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ausQ: any = supabase
    .from("ausentismo")
    .select(
      "consecutivo_incapacidad, dias_it_pagados, origen, fecha_inicio, fecha_fin, diagnostico, eps, indicador_prorroga, cie10, genero, edad, antiguedad, vinculacion, cargo"
    )
    .eq("cedula", cedula);
  if (fechaCorte) ausQ = ausQ.gte("fecha_inicio", fechaCorte);
  const { data: ausentismo } = await ausQ.order("fecha_inicio", { ascending: false });

  // 5. Familia
  const { data: familia } = await supabase
    .from("familia")
    .select("nombre_familiar, parentesco, edad")
    .eq("cedula_empleado", cedula);

  // 6. Compute KPIs
  const vp = viajes_perdidos || [];
  const vpConductor = vp.filter(
    (v: Record<string, unknown>) =>
      (v.tipologia as string)?.toUpperCase() === "CONDUCTOR"
  );

  const totalTimbradas = (cierres || []).reduce(
    (sum: number, c: Record<string, unknown>) => sum + Number(c.timbradas || 0) - Number(c.diff_tim || 0),
    0
  );
  const diasTrabajados = new Set(
    (cierres || []).map((c: Record<string, unknown>) => c.fecha)
  ).size;

  const kpis = {
    dias_trabajados: diasTrabajados,
    total_timbradas: Math.round(totalTimbradas),
    total_vp: vpConductor.length,
    accidentes: vp.filter((v: Record<string, unknown>) =>
      (v.novedad as string)?.toUpperCase().includes("ACCIDENTE")
    ).length,
    incapacidades: (ausentismo || []).length,
    dias_incapacidad: (ausentismo || []).reduce(
      (sum: number, a: Record<string, unknown>) =>
        sum + Number(a.dias_it_pagados || 0),
      0
    ),
    familiares: (familia || []).length,
  };

  // Exclude salary columns from cierres (already excluded in select)
  return NextResponse.json({
    conductor,
    cierres: cierres || [],
    viajes_perdidos: vp,
    ausentismo: ausentismo || [],
    familia: familia || [],
    kpis,
  });
}
