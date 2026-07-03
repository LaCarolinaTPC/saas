import { getCandidatesPipeline, getAllCandidates, getActiveVacancies } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { ESTADOS_EN_CURSO, type ProcesoContratacion } from "@/lib/contratacion/constants";
import { CandidatosClient } from "./client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface Filters {
  q?: string;
  estado?: string;
  medio?: string;
  desde?: string;
  hasta?: string;
  page?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Vista estructural mínima del query builder de Supabase (evita instanciación
 *  de tipos excesivamente profunda al pasar el builder entre funciones). */
interface Filterable {
  or(filter: string): Filterable;
  eq(column: string, value: string): Filterable;
  in(column: string, values: readonly string[]): Filterable;
  gte(column: string, value: string): Filterable;
  lte(column: string, value: string): Filterable;
  order(column: string, opts?: { ascending?: boolean }): Filterable;
  range(from: number, to: number): Filterable;
  then<R>(
    onfulfilled: (value: { data: unknown; count: number | null; error: { message: string } | null }) => R
  ): PromiseLike<R>;
}

function applyFilters(query: Filterable, f: Filters): Filterable {
  let q = query;
  if (f.q) {
    const term = f.q.replace(/[%,()]/g, " ").trim();
    if (term) q = q.or(`nombre.ilike.%${term}%,cedula.ilike.%${term}%,celular.ilike.%${term}%`);
  }
  if (f.estado && f.estado !== "todos") q = q.eq("estado", f.estado);
  if (f.medio && f.medio !== "todos") q = q.eq("medio_postulacion", f.medio);
  if (f.desde && DATE_RE.test(f.desde)) q = q.gte("fecha_creacion", f.desde);
  if (f.hasta && DATE_RE.test(f.hasta)) q = q.lte("fecha_creacion", f.hasta);
  return q;
}

export default async function CandidatosPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const filters = await searchParams;
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const admin = createAdminClient();

  const base = () =>
    applyFilters(
      admin.from("procesos_contratacion").select("id", { count: "exact", head: true }) as unknown as Filterable,
      filters
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
    applyFilters(admin.from("procesos_contratacion").select("*, vacancies(title)") as unknown as Filterable, filters)
      .order("fecha_creacion", { ascending: false })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    base(),
    base().eq("estado", "contratado"),
    base().eq("estado", "cierre"),
    base().in("estado", ESTADOS_EN_CURSO),
  ]);

  // Etapas configurables del pipeline (activas, en orden).
  const { data: stages } = await admin
    .from("pipeline_stages")
    .select("id, key, label, color, text_color, orden, tipo, activo")
    .eq("activo", true)
    .order("orden", { ascending: true });

  return (
    <CandidatosClient
      pipeline={pipeline}
      allCandidates={allCandidates}
      vacancies={vacancies}
      stages={stages ?? []}
      canManageStages={perms.isAdmin}
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
          desde: filters.desde ?? "",
          hasta: filters.hasta ?? "",
        },
        canEdit: canAccess(perms, "candidatos") && perms.puedeEditar,
      }}
    />
  );
}
