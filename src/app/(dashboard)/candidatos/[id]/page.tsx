import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, IdCard, Mail, Phone } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { getCandidate } from "@/lib/actions";
import { formatDateBogota, timeAgoBogota } from "@/lib/utils";
import { EditarCandidato } from "./editar-candidato";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { etapaDePostulacion as etapaDe, type ProcesoContratacion } from "@/lib/contratacion/constants";
import { ProcesoDelCandidato } from "@/components/seleccion/proceso-del-candidato";

export const dynamic = "force-dynamic";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface Postulacion {
  id: string;
  current_stage: string;
  applied_at: string | null;
  vacancies?: { title: string } | null;
}

export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await getCandidate(id);
  if (!data) notFound();

  const { candidate } = data;
  const applications = data.applications as Postulacion[];
  const initials = getInitials(candidate.full_name ?? "??");

  // Proceso de selección de este candidato (el más reciente): estado, lo que
  // respondió Croma, citas, lo que registró el profesor, documentos e historial.
  const [{ data: procesos }, perms] = await Promise.all([
    createAdminClient().from("procesos_contratacion").select("*, vacancies(title)").eq("candidate_id", id).order("created_at", { ascending: false }).limit(10),
    getCurrentPermissions(),
  ]);
  const proceso = ((procesos ?? [])[0] as ProcesoContratacion | undefined) ?? null;

  const currentApplication = applications[0];
  const etapa = proceso ? etapaDe(proceso.estado) : currentApplication ? etapaDe(currentApplication.current_stage) : null;
  const vacante = proceso?.vacancies?.title ?? currentApplication?.vacancies?.title ?? null;

  const contacto = [
    candidate.document_number && { icono: IdCard, texto: `C.C. ${candidate.document_number}` },
    candidate.phone && { icono: Phone, texto: candidate.phone },
    candidate.email && { icono: Mail, texto: candidate.email },
  ].filter(Boolean) as { icono: typeof Phone; texto: string }[];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
        <Link
          href="/candidatos"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a candidatos
        </Link>

        <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white sm:h-20 sm:w-20 sm:text-2xl">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{candidate.full_name}</h1>
                {etapa && (
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: etapa.bg, color: etapa.color }}
                  >
                    {etapa.label}
                  </span>
                )}
              </div>
              {vacante && <p className="mt-1 text-base text-gray-500">{vacante}</p>}
              {contacto.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                  {contacto.map(({ icono: Icono, texto }) => (
                    <span key={texto} className="inline-flex items-center gap-1">
                      <Icono className="h-3.5 w-3.5" />
                      {texto}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <EditarCandidato candidate={candidate} />
          </div>
        </div>

        <Separator className="mb-6" />

        {proceso ? (
          <ProcesoDelCandidato proceso={proceso} otros={(procesos ?? []).length - 1} puedeEditar={puedeEditarEn(perms, "candidatos")} />
        ) : (
          <p className="rounded-lg border border-[#F1F5F9] bg-white p-5 text-sm text-gray-500">
            Este candidato no tiene proceso de contratación.
          </p>
        )}

        {applications.length > 0 && (
          <section className="mt-6 rounded-lg border border-[#F1F5F9] bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Postulaciones</h2>
            <ul className="divide-y divide-[#F1F5F9]">
              {applications.map((app) => {
                const e = etapaDe(app.current_stage);
                return (
                  <li key={app.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <span className="text-sm text-gray-700">{app.vacancies?.title ?? "Sin vacante"}</span>
                    <span className="flex items-center gap-3">
                      {app.applied_at && (
                        <span className="text-xs text-gray-400" title={formatDateBogota(app.applied_at)}>
                          {timeAgoBogota(app.applied_at)}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ backgroundColor: e.bg, color: e.color }}
                      >
                        {e.label}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
