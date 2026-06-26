import { createAdminClient } from "@/lib/supabase/admin";

export async function getAccidentes(estado?: string) {
  const admin = createAdminClient();
  let query = admin
    .from("accidentes")
    .select(
      "id, consecutivo, conductor_nombre, conductor_cedula, fecha_accidente, direccion_accidente, estado, hubo_arreglo, solicito_aseguradora, created_at"
    )
    .order("created_at", { ascending: false });

  if (estado && estado !== "todos") query = query.eq("estado", estado);

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

export async function getAccidenteStats() {
  const admin = createAdminClient();
  const estados = ["pendiente_revision", "falta_informacion", "completada", "aprobado"];
  const counts: Record<string, number> = {};
  await Promise.all(
    estados.map(async (e) => {
      const { count } = await admin
        .from("accidentes")
        .select("*", { count: "exact", head: true })
        .eq("estado", e);
      counts[e] = count ?? 0;
    })
  );
  return counts;
}

async function sign(admin: ReturnType<typeof createAdminClient>, path: string | null) {
  if (!path) return null;
  const { data } = await admin.storage.from("accidentes").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function getAccidente(id: string) {
  const admin = createAdminClient();

  const { data: accidente, error } = await admin
    .from("accidentes")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !accidente) return null;

  const [{ data: vehiculos }, { data: eventos }, { data: evaluacion }] = await Promise.all([
    admin.from("accidente_vehiculos").select("*").eq("accidente_id", id),
    admin
      .from("accidente_eventos")
      .select("*, profiles:user_id(full_name)")
      .eq("accidente_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("accidente_evaluaciones")
      .select("*, profiles:evaluado_por(full_name)")
      .eq("accidente_id", id)
      .maybeSingle(),
  ]);

  const [firmaConductor, firmaTercero, arregloFirma, notaVoz] = await Promise.all([
    sign(admin, accidente.firma_conductor_url),
    sign(admin, accidente.firma_tercero_url),
    sign(admin, accidente.arreglo_firma_url),
    sign(admin, accidente.nota_voz_url),
  ]);

  const contexto = await getContextoEvaluacion(
    accidente.conductor_cedula,
    accidente.fecha_accidente,
    accidente.id
  );

  return {
    accidente,
    vehiculos: vehiculos ?? [],
    eventos: eventos ?? [],
    evaluacion: evaluacion ?? null,
    contexto,
    signed: {
      firmaConductor,
      firmaTercero,
      arregloFirma,
      notaVoz,
    },
  };
}

/** Meses entre dos fechas (aprox.) — para ventanas de reincidencia. */
function mesesDesde(desde: string, hasta: string): number {
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  return (b - a) / (1000 * 60 * 60 * 24 * 30.44);
}

export type ContextoEvaluacion = {
  mesesAntiguedad: number | null;
  /** Antigüedad > 3 años y sin accidentes atribuibles previos (atenuante auto). */
  antiguedad3aSinEventos: boolean;
  reincidencia3m: number;
  reincidencia6m: number;
  reincidencia12m: number;
  /** Reincidente según política: ≥1 accidente atribuible previo en 3 meses. */
  reincidente3m: boolean;
};

/**
 * Deriva automáticamente el contexto que alimenta la evaluación:
 * antigüedad del conductor y reincidencia (accidentes atribuibles previos en
 * los últimos 3/6/12 meses), leyendo de la tabla `accidentes` del módulo.
 */
export async function getContextoEvaluacion(
  cedula: string,
  fechaAccidente: string,
  accidenteId: string
): Promise<ContextoEvaluacion> {
  const admin = createAdminClient();

  // Antigüedad (meses) desde la vista de conductores con grupo
  const { data: cond } = await admin
    .from("conductores_con_grupo")
    .select("meses_antiguedad")
    .eq("cedula", cedula)
    .maybeSingle();
  const mesesAntiguedad =
    cond?.meses_antiguedad != null ? Number(cond.meses_antiguedad) : null;

  // Accidentes previos del mismo conductor (con su dictamen si existe)
  const { data: previos } = await admin
    .from("accidentes")
    .select("id, fecha_accidente, accidente_evaluaciones(responsabilidad)")
    .eq("conductor_cedula", cedula)
    .neq("id", accidenteId)
    .lt("fecha_accidente", fechaAccidente);

  let c3 = 0,
    c6 = 0,
    c12 = 0,
    atribuiblesTotal = 0;
  for (const p of previos ?? []) {
    const evalRel = (p as { accidente_evaluaciones?: { responsabilidad?: string } | { responsabilidad?: string }[] })
      .accidente_evaluaciones;
    const resp = Array.isArray(evalRel) ? evalRel[0]?.responsabilidad : evalRel?.responsabilidad;
    // Atribuible si tiene dictamen directo/compartido, o si aún no se evaluó
    const atribuible = resp == null || resp === "directo" || resp === "compartido";
    if (!atribuible) continue;
    atribuiblesTotal++;
    const m = mesesDesde(p.fecha_accidente, fechaAccidente);
    if (m <= 3) c3++;
    if (m <= 6) c6++;
    if (m <= 12) c12++;
  }

  return {
    mesesAntiguedad,
    antiguedad3aSinEventos: (mesesAntiguedad ?? 0) >= 36 && atribuiblesTotal === 0,
    reincidencia3m: c3,
    reincidencia6m: c6,
    reincidencia12m: c12,
    reincidente3m: c3 >= 1,
  };
}
