"use client";

import { useState } from "react";
import {
  MapPin,
  Calendar,
  Clock,
  Briefcase,
  Building2,
  DollarSign,
  FileText,
  UserCheck,
  Edit,
  Upload,
  Shield,
  Heart,
  AlertTriangle,
  Umbrella,
  ChevronLeft,
  CalendarOff,
  Sun,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

interface EmployeeDisplay {
  id: string;
  full_name: string;
  email: string | null;
  position: string | null;
  location: string | null;
  hire_date: string | null;
  salary: number | null;
  contract_type: string | null;
  supervisor: string | null;
  eps: string | null;
  afp: string | null;
  arl: string | null;
  caja_compensacion: string | null;
  hireDateFormatted: string;
  hireYears: string;
  salaryFormatted: string;
  contractTypeLabel: string;
  departmentName: string;
  statusLabel: string;
  statusBg: string;
  statusColor: string;
}

interface EmployeeEvent {
  id: string;
  type: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
}

interface DisciplinaryRecord {
  id: string;
  type: string | null;
  description: string | null;
  date: string | null;
  status: string | null;
  resolution: string | null;
  profiles: { full_name: string } | null;
}

interface Note {
  id: string;
  content: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
}

const tabsProfile = [
  "Información",
  "Documentos",
  "Novedades",
  "Descargos",
  "Historial",
];

const eventConfig: Record<string, { icon: React.ElementType; bg: string; iconColor: string }> = {
  permiso: { icon: Clock, bg: "bg-yellow-100", iconColor: "text-yellow-600" },
  vacaciones: { icon: Umbrella, bg: "bg-blue-100", iconColor: "text-blue-600" },
  incapacidad: { icon: AlertTriangle, bg: "bg-red-100", iconColor: "text-red-600" },
  licencia: { icon: CalendarOff, bg: "bg-purple-100", iconColor: "text-purple-600" },
  suspension: { icon: AlertTriangle, bg: "bg-orange-100", iconColor: "text-orange-600" },
  dia_libre: { icon: Sun, bg: "bg-green-100", iconColor: "text-green-600" },
};

const defaultEventConfig = { icon: Calendar, bg: "bg-gray-100", iconColor: "text-gray-600" };

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "Sin fechas";
  const s = format(new Date(start), "dd MMM yyyy", { locale: es });
  if (!end) return s;
  const e = format(new Date(end), "dd MMM yyyy", { locale: es });
  return `${s} — ${e}`;
}

function getStatusBadge(status: string | null) {
  if (!status) return null;
  const map: Record<string, { bg: string; text: string }> = {
    aprobado: { bg: "bg-green-100", text: "text-green-700" },
    completado: { bg: "bg-green-100", text: "text-green-700" },
    pendiente: { bg: "bg-yellow-100", text: "text-yellow-700" },
    rechazado: { bg: "bg-red-100", text: "text-red-700" },
    resuelto: { bg: "bg-green-100", text: "text-green-700" },
    activo: { bg: "bg-blue-100", text: "text-blue-700" },
  };
  const config = map[status.toLowerCase()] || { bg: "bg-gray-100", text: "text-gray-700" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function EmpleadoDetailClient({
  employee,
  events,
  disciplinaryRecords,
  notes,
}: {
  employee: EmployeeDisplay;
  events: EmployeeEvent[];
  disciplinaryRecords: DisciplinaryRecord[];
  notes: Note[];
}) {
  const [activeTab, setActiveTab] = useState("Información");

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Back link */}
      <div className="border-b border-[#E2E8F0] bg-white px-6 py-3">
        <Link
          href="/empleados"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#4F46E5]"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a Empleados
        </Link>
      </div>

      {/* Header */}
      <div className="border-b border-[#E2E8F0] bg-white px-6 py-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#4F46E5] text-2xl font-semibold text-white">
              {getInitials(employee.full_name)}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-gray-900">
                  {employee.full_name}
                </h1>
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: employee.statusBg,
                    color: employee.statusColor,
                  }}
                >
                  {employee.statusLabel}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                {employee.position ?? "Sin cargo"} &middot;{" "}
                {employee.departmentName}
              </p>
              <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                {employee.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {employee.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {employee.hireDateFormatted}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {employee.hireYears}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Edit className="h-4 w-4" />
              Editar
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]">
              <Upload className="h-4 w-4" />
              Subir Documento
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#E2E8F0] bg-white px-6">
        <div className="flex items-center gap-1">
          {tabsProfile.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-[#4F46E5]"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4F46E5]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        <div className="flex gap-6">
          {/* Left Column */}
          <div className="w-[340px] shrink-0 space-y-6">
            {/* Información Laboral */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">
                Información Laboral
              </h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Briefcase className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Cargo</p>
                    <p className="text-sm font-medium text-gray-900">
                      {employee.position ?? "No especificado"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Departamento</p>
                    <p className="text-sm font-medium text-gray-900">
                      {employee.departmentName}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Salario</p>
                    <p className="text-sm font-medium text-gray-900">
                      {employee.salaryFormatted}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Tipo de Contrato</p>
                    <p className="text-sm font-medium text-gray-900">
                      {employee.contractTypeLabel}
                    </p>
                  </div>
                </div>
                {employee.supervisor && (
                  <div className="flex items-center gap-3">
                    <UserCheck className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Jefe Inmediato</p>
                      <p className="text-sm font-medium text-gray-900">
                        {employee.supervisor}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Afiliaciones */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">
                Afiliaciones
              </h3>
              <div className="space-y-3">
                {[
                  { label: "EPS", value: employee.eps, icon: Heart },
                  { label: "AFP", value: employee.afp, icon: Shield },
                  { label: "ARL", value: employee.arl, icon: Shield },
                  {
                    label: "Caja de Compensación",
                    value: employee.caja_compensacion,
                    icon: Building2,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <item.icon className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {item.label}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {item.value ?? "No registrado"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="flex-1 space-y-6">
            {/* Novedades Recientes */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Novedades Recientes
                </h3>
                <button className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4338CA]">
                  + Nueva
                </button>
              </div>
              {events.length === 0 ? (
                <p className="text-sm text-[#94A3B8]">
                  No hay novedades registradas
                </p>
              ) : (
                <div className="space-y-3">
                  {events.map((evt) => {
                    const config =
                      eventConfig[evt.type] || defaultEventConfig;
                    const Icon = config.icon;
                    return (
                      <div
                        key={evt.id}
                        className="flex items-center gap-3 rounded-lg border border-[#F1F5F9] p-3"
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.bg}`}
                        >
                          <Icon
                            className={`h-4 w-4 ${config.iconColor}`}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {evt.description || evt.type}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDateRange(evt.start_date, evt.end_date)}
                          </p>
                        </div>
                        {getStatusBadge(evt.status)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Descargos y Sanciones */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Descargos y Sanciones
                </h3>
                {disciplinaryRecords.length === 0 && (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    Sin descargos activos
                  </span>
                )}
              </div>
              {disciplinaryRecords.length === 0 ? (
                <p className="text-sm text-[#94A3B8]">
                  No hay descargos registrados
                </p>
              ) : (
                <div className="space-y-3">
                  {disciplinaryRecords.map((desc) => (
                    <div
                      key={desc.id}
                      className="rounded-lg border border-[#F1F5F9] p-4"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">
                          {desc.type || "Descargo"}
                        </p>
                        {getStatusBadge(desc.status)}
                      </div>
                      {desc.description && (
                        <p className="mb-3 text-sm text-gray-600">
                          {desc.description}
                        </p>
                      )}
                      {desc.resolution && (
                        <p className="mb-3 text-sm text-gray-500 italic">
                          Resolución: {desc.resolution}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
                        {desc.date
                          ? format(new Date(desc.date), "dd MMM yyyy", {
                              locale: es,
                            })
                          : "Sin fecha"}
                        {desc.profiles?.full_name &&
                          ` \u00B7 ${desc.profiles.full_name}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Observaciones Internas */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">
                Observaciones Internas
              </h3>
              {notes.length === 0 ? (
                <p className="text-sm text-[#94A3B8]">
                  No hay observaciones registradas
                </p>
              ) : (
                <div className="space-y-4">
                  {notes.map((note) => (
                    <div key={note.id}>
                      <p className="text-sm leading-relaxed text-gray-600">
                        {note.content}
                      </p>
                      <p className="mt-2 text-xs text-gray-400">
                        {note.profiles?.full_name
                          ? `— ${note.profiles.full_name}`
                          : ""}
                        {note.created_at &&
                          `, ${format(new Date(note.created_at), "dd MMM yyyy", { locale: es })}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
