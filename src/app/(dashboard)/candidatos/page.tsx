import { getCandidatesPipeline, getAllCandidates, getActiveVacancies } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { ESTADOS_EN_CURSO, ESTADOS_REVISION_REINGRESO, FILTRO_ANTECEDENTES, FILTRO_APADRINADOS, FILTRO_PSICO_INSCRIBIR, FILTRO_REINGRESOS, campoFecha, type ProcesoContratacion } from "@/lib/contratacion/constants";
import { idsApadrinadosSinPadrino } from "@/lib/padrino/datos";
import { examenesPorRevisar } from "@/lib/seleccion/examenes-servidor";
import { procesosConCedulaDistinta } from "@/lib/seleccion/lectura/revision-servidor";
import { CandidatosClient } from "./client";
import { AvisoServicios } from "@/components/estado-servicios/aviso-servicios";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface Filters {
  q?: string;
  estado?: string;
  medio?: string;
  /** Campo de fecha que segmenta el rango: creacion (por defecto) | citacion. */
  campo?: string;
  desde?: string;
  hasta?: string;
  page?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Instante de hace `dias` días, en ISO (para el filtro del tablero). */
function haceDias(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString();
}

/** Vista estructural mínima del query builder de Supabase (evita instanciación
 *  de tipos excesivamente profunda al pasar el builder entre funciones). */
interface Filterable {
  or(filter: string): Filterable;
  eq(column: string, value: string): Filterable;
  in(column: string, values: readonly string[]): Filterable;
  gte(column: string, value: string): Filterable;
  lte(column: string, value: string): Filterable;
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): Filterable;
  range(from: number, to: number): Filterable;
  then<R>(
    onfulfilled: (value: { data: unknown; count: number | null; error: { message: string } | null }) => R
  ): PromiseLike<R>;
}

/** Id que no existe: para que un filtro sin coincidencias devuelva vacío. */
const ID_NINGUNO = "00000000-0000-0000-0000-000000000000";

function applyFilters(query: Filterable, f: Filters, apadrinados: string[] = []): Filterable {
  let q = query;
  if (f.q) {
    const term = f.q.replace(/[%,()]/g, " ").trim();
    if (term) q = q.or(`nombre.ilike.%${term}%,cedula.ilike.%${term}%,celular.ilike.%${term}%`);
  }
  // «Reingresos por revisar»: trabajaron antes en la empresa y siguen en la preselección.
  if (f.estado === FILTRO_REINGRESOS) q = q.eq("reingreso", "true").in("estado", ESTADOS_REVISION_REINGRESO);
  // «Antecedentes por revisar» (entrega 3): las reglas lo mandaron a una persona y nadie ha decidido.
  else if (f.estado === FILTRO_ANTECEDENTES) q = q.in("antecedentes_resultado", ["revision", "descarta"]).or("antecedentes_decision.is.null").in("estado", ESTADOS_EN_CURSO);
  // «Apadrinados sin padrino»: dijeron venir recomendados y Gestión Humana no les ha asignado padrino.
  else if (f.estado === FILTRO_APADRINADOS) q = q.in("id", apadrinados.length ? apadrinados : [ID_NINGUNO]);
  // «Psicosensotécnica: por inscribir»: confirmaron el correo y falta inscribirlos en la plataforma.
  else if (f.estado === FILTRO_PSICO_INSCRIBIR) q = q.eq("correo_estado", "validado").in("estado", ESTADOS_EN_CURSO);
  else if (f.estado && f.estado !== "todos") q = q.eq("estado", f.estado);
  if (f.medio && f.medio !== "todos") q = q.eq("medio_postulacion", f.medio);
  const col = campoFecha(f.campo).columna;
  if (f.desde && DATE_RE.test(f.desde)) q = q.gte(col, f.desde);
  if (f.hasta && DATE_RE.test(f.hasta)) q = q.lte(col, f.hasta);
  return q;
}

export default async function CandidatosPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const filters = await searchParams;
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const campo = campoFecha(filters.campo);
  const admin = createAdminClient();
  // Candidatos en curso que vienen recomendados y aún no tienen padrino (para el filtro y la etiqueta).
  const sinPadrino = await idsApadrinadosSinPadrino(admin);

  const base = () =>
    applyFilters(
      admin.from("procesos_contratacion").select("id", { count: "exact", head: true }) as unknown as Filterable,
      filters,
      sinPadrino
    );

  const [
    pipeline,
    allCandidates,
    vacancies,
    perms,
    rowsRes,
    totalRes,
    contratadosRes,
    cierreRes,
    enCursoRes,
  ] = await Promise.all([
    getCandidatesPipeline(),
    getAllCandidates(),
    getActiveVacancies(),
    getCurrentPermissions(),
    applyFilters(admin.from("procesos_contratacion").select("*, vacancies(title)") as unknown as Filterable, filters, sinPadrino)
      .order(campo.columna, { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    base(),
    base().eq("estado", "contratado"),
    base().eq("estado", "cierre"),
    base().in("estado", ESTADOS_EN_CURSO),
  ]);

  // Tablero: procesos en curso y los cerrados o contratados de los últimos 30 días.
  const hace30 = haceDias(30);
  const { data: tablero } = await admin
    .from("procesos_contratacion")
    .select("*, vacancies(title)")
    .or(`estado.not.in.(contratado,cierre),updated_at.gte.${hace30}`)
    .order("updated_at", { ascending: false })
    .limit(1000);
  // 24-nov-2026: el no apto de los exámenes queda marcado en la tarjeta para revisarlo a mano (y el aplazado).
  const enExamenes = (tablero ?? []).filter((p) => ["en_examenes", "en_examenes_fase2", "reconocimiento_ruta"].includes(p.estado as string)).map((p) => p.id as string);
  const porRevisar = await examenesPorRevisar(enExamenes).catch(() => new Map());
  // 25-nov-2026 (R2): un documento leído trae una cédula que no es la del proceso y nadie lo ha revisado.
  const abiertos = (tablero ?? []).filter((p) => p.estado !== "cierre" && p.estado !== "contratado").map((p) => ({ id: p.id as string, cedula: (p.cedula as string | null) ?? null }));
  const cedulaDistinta = await procesosConCedulaDistinta(abiertos).catch(() => new Set<string>());
  const tableroMarcado = (tablero ?? []).map((p) => ({
    ...p,
    ...(porRevisar.has(p.id as string) ? { revision_examen: porRevisar.get(p.id as string) } : {}),
    ...(cedulaDistinta.has(p.id as string) ? { cedula_no_coincide: true } : {}),
  }));

  return (
    <>
    {/* Un servicio externo fallando (Croma, IA, WhatsApp, correo) o Croma en pausa (24-nov-2026). */}
    <AvisoServicios className="px-4 pt-4 sm:px-6 lg:px-8" />
    <CandidatosClient
      pipeline={pipeline}
      allCandidates={allCandidates}
      vacancies={vacancies}
      tablero={tableroMarcado as ProcesoContratacion[]}
      procesos={{
        vacancies: (vacancies as { id: string; title: string }[]).map((v) => ({ id: v.id, title: v.title })),
        rows: (rowsRes.data ?? []) as ProcesoContratacion[],
        total: totalRes.count ?? 0,
        stats: {
          total: totalRes.count ?? 0,
          contratados: contratadosRes.count ?? 0,
          cierres: cierreRes.count ?? 0,
          enCurso: enCursoRes.count ?? 0,
        },
        page,
        pageSize: PAGE_SIZE,
        filters: {
          q: filters.q ?? "",
          estado: filters.estado ?? "todos",
          medio: filters.medio ?? "todos",
          campo: campo.value,
          desde: filters.desde ?? "",
          hasta: filters.hasta ?? "",
        },
        canEdit: puedeEditarEn(perms, "candidatos"),
        puedePadrino: puedeEditarEn(perms, "candidatos.padrino_registro"),
        apadrinadosSinPadrino: sinPadrino,
      }}
    />
    </>
  );
}
