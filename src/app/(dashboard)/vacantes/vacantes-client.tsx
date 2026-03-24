"use client";

import { useState } from "react";
import { Plus, SlidersHorizontal, MapPin, Clock, Banknote, Users, Briefcase } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { Button } from "@/components/ui/button";
import { VACANCY_STATUSES } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

interface Vacancy {
  id: string;
  title: string;
  department_id: string;
  description: string | null;
  location: string | null;
  modality: string | null;
  contract_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  status: string;
  published_at: string | null;
  created_at: string;
  departments: { name: string } | null;
  candidate_vacancy: { count: number }[];
}

const tabs = [
  { label: "Todas las Vacantes", value: "todas" },
  { label: "Activas", value: "activa" },
  { label: "Borrador", value: "borrador" },
  { label: "Cerradas", value: "cerrada" },
  { label: "Archivadas", value: "archivada" },
];

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return "No especificado";
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    return `$${n.toLocaleString("es-CO")}`;
  };
  if (min && max) return `${fmt(min)} - ${fmt(max)} COP / mes`;
  if (min) return `Desde ${fmt(min)} COP / mes`;
  return `Hasta ${fmt(max!)} COP / mes`;
}

function formatModality(modality: string | null, contract_type: string | null): string {
  const parts: string[] = [];
  if (contract_type) {
    const map: Record<string, string> = {
      indefinido: "Tiempo completo",
      fijo: "Término fijo",
      obra_labor: "Obra o labor",
      prestacion_servicios: "Prestación de servicios",
    };
    parts.push(map[contract_type] || contract_type);
  }
  if (modality) {
    const map: Record<string, string> = {
      presencial: "Presencial",
      remoto: "Remoto",
      hibrido: "Híbrido",
    };
    parts.push(map[modality] || modality);
  }
  return parts.join(" \u00B7 ") || "No especificado";
}

function getPostedText(vacancy: Vacancy): string {
  if (vacancy.status === "borrador") {
    return `Creada ${formatDistanceToNow(new Date(vacancy.created_at), { addSuffix: true, locale: es })}`;
  }
  if (vacancy.published_at) {
    return `Publicada ${formatDistanceToNow(new Date(vacancy.published_at), { addSuffix: true, locale: es })}`;
  }
  return `Creada ${formatDistanceToNow(new Date(vacancy.created_at), { addSuffix: true, locale: es })}`;
}

export function VacantesClient({ vacancies }: { vacancies: Vacancy[] }) {
  const [activeTab, setActiveTab] = useState("todas");

  const filtered = activeTab === "todas"
    ? vacancies
    : vacancies.filter((v) => v.status === activeTab);

  return (
    <>
      <TopBar title="Vacantes" />
      <div className="flex flex-1 flex-col gap-6 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-3 text-xl font-semibold text-[#0F172A]">
              Vacantes
              <span className="rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-xs font-semibold text-[#4F46E5]">
                {vacancies.length}
              </span>
            </h2>
            <p className="mt-1 text-sm text-[#64748B]">
              Gestiona las posiciones abiertas y el progreso de aplicaciones
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="gap-2 border-[#E2E8F0] text-[#334155]">
              <SlidersHorizontal className="h-4 w-4" /> Filtros
            </Button>
            <Link href="/vacantes/nueva">
              <Button className="gap-2 bg-[#4F46E5] hover:bg-[#4338CA]">
                <Plus className="h-4 w-4" /> Nueva Vacante
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex items-center border-b border-[#E2E8F0]">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                tab.value === activeTab
                  ? "border-b-2 border-[#4F46E5] text-[#4F46E5] font-semibold"
                  : "text-[#64748B] hover:text-[#334155]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E2E8F0] bg-white py-16">
            <Briefcase className="h-12 w-12 text-[#CBD5E1]" />
            <h3 className="mt-4 text-base font-semibold text-[#334155]">No hay vacantes</h3>
            <p className="mt-1 text-sm text-[#64748B]">
              {activeTab === "todas"
                ? "Crea tu primera vacante para comenzar"
                : `No hay vacantes con estado "${tabs.find((t) => t.value === activeTab)?.label}"`}
            </p>
            {activeTab === "todas" && (
              <Link href="/vacantes/nueva" className="mt-4">
                <Button className="gap-2 bg-[#4F46E5] hover:bg-[#4338CA]">
                  <Plus className="h-4 w-4" /> Nueva Vacante
                </Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5">
            {filtered.map((v) => {
              const statusConfig = VACANCY_STATUSES.find((s) => s.value === v.status);
              const candidateCount = v.candidate_vacancy?.[0]?.count ?? 0;

              return (
                <Link key={v.id} href={`/vacantes/${v.id}`}>
                  <div className="rounded-xl border border-[#F1F5F9] bg-white p-5 transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-[15px] font-semibold text-[#0F172A]">{v.title}</h3>
                        <p className="mt-1 text-[13px] text-[#64748B]">
                          {v.departments?.name ?? "Sin departamento"}
                        </p>
                      </div>
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: statusConfig?.bg ?? "#F1F5F9",
                          color: statusConfig?.color ?? "#64748B",
                        }}
                      >
                        {statusConfig?.label ?? v.status}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2.5">
                      <div className="flex items-center gap-2 text-[13px] text-[#64748B]">
                        <MapPin className="h-3.5 w-3.5 text-[#94A3B8]" /> {v.location ?? "Sin ubicación"}
                      </div>
                      <div className="flex items-center gap-2 text-[13px] text-[#64748B]">
                        <Clock className="h-3.5 w-3.5 text-[#94A3B8]" /> {formatModality(v.modality, v.contract_type)}
                      </div>
                      <div className="flex items-center gap-2 text-[13px] text-[#64748B]">
                        <Banknote className="h-3.5 w-3.5 text-[#94A3B8]" /> {formatSalary(v.salary_min, v.salary_max)}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-[#F1F5F9] pt-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-[#4F46E5]">
                        <Users className="h-3.5 w-3.5" /> {candidateCount} candidatos
                      </div>
                      <span className="text-xs text-[#94A3B8]">{getPostedText(v)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
