import { createAdminClient } from "@/lib/supabase/admin";

/** Reportes hechos en Gestivo o histórico importado de la matriz GO-R-22. */
export type OrigenAccidente = "gestivo" | "historico";

export async function getAccidentes(estado?: string, origen: OrigenAccidente = "gestivo") {
  const admin = createAdminClient();
  const out: Record<string, unknown>[] = [];
  // PostgREST devuelve máximo 1.000 filas por consulta y el histórico tiene más.
  for (let desde = 0; ; desde += 1000) {
    let query = admin
      .from("accidentes")
      .select(
        "id, consecutivo, origen, conductor_nombre, conductor_cedula, fecha_accidente, direccion_accidente, estado, vehiculo_codigo, vehiculo_placa, responsabilidad_reportada, caso_estado, created_at"
      )
      .eq("origen", origen)
      .order(origen === "historico" ? "fecha_accidente" : "created_at", { ascending: false })
      .range(desde, desde + 999);
    if (origen === "gestivo" && estado && estado !== "todos") query = query.eq("estado", estado);
    const { data, error } = await query;
    if (error) return [];
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out as {
    id: string;
    consecutivo: number;
    origen: OrigenAccidente;
    conductor_nombre: string;
    conductor_cedula: string | null;
    fecha_accidente: string;
    direccion_accidente: string;
    estado: string;
    vehiculo_codigo: string | null;
    vehiculo_placa: string | null;
    responsabilidad_reportada: string | null;
    caso_estado: string | null;
    created_at: string;
  }[];
}

/** Conteos por estado de los reportes de Gestivo, más el total del histórico. */
export async function getAccidenteStats() {
  const admin = createAdminClient();
  const estados = ["pendiente_revision", "falta_informacion", "completada", "aprobado"];
  const counts: Record<string, number> = {};
  await Promise.all([
    ...estados.map(async (e) => {
      const { count } = await admin
        .from("accidentes")
        .select("*", { count: "exact", head: true })
        .eq("origen", "gestivo")
        .eq("estado", e);
      counts[e] = count ?? 0;
    }),
    (async () => {
      const { count } = await admin
        .from("accidentes")
        .select("*", { count: "exact", head: true })
        .eq("origen", "historico");
      counts.historico = count ?? 0;
    })(),
  ]);
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

  const [{ data: vehiculos }, { data: eventos }, { data: evaluacion }, { data: victimas }] = await Promise.all([
    admin.from("accidente_vehiculos").select("*").eq("accidente_id", id).order("created_at"),
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
    admin.from("accidente_victimas").select("*").eq("accidente_id", id).order("created_at"),
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
    victimas: victimas ?? [],
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
  cedula: string | null,
  fechaAccidente: string,
  accidenteId: string
): Promise<ContextoEvaluacion> {
  // Históricos cuyo conductor no se encontró en el maestro: sin cédula no hay
  // con qué cruzar antigüedad ni reincidencia.
  if (!cedula) {
    return {
      mesesAntiguedad: null,
      antiguedad3aSinEventos: false,
      reincidencia3m: 0,
      reincidencia6m: 0,
      reincidencia12m: 0,
      reincidente3m: false,
    };
  }
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
    .select("id, fecha_accidente, origen, responsabilidad_reportada, accidente_evaluaciones(responsabilidad)")
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
    // Los históricos de la matriz GO-R-22 no tienen dictamen: vale la
    // responsabilidad que registró la matriz.
    const resp =
      (Array.isArray(evalRel) ? evalRel[0]?.responsabilidad : evalRel?.responsabilidad) ??
      (p.origen === "historico" ? p.responsabilidad_reportada : undefined);
    // Cuenta como reincidencia salvo que el dictamen exonere al conductor
    // (responsabilidad de un tercero). En estudio / directo / compartido / sin
    // dictamen sí cuentan; el revisor puede ajustar después.
    const atribuible = resp !== "tercero";
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
