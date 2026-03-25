"use client";

import { useState, useTransition } from "react";
import { EPS_COLOMBIA, AFP_COLOMBIA, ARL_COLOMBIA, CAJAS_COMPENSACION_COLOMBIA } from "@/lib/colombia-entities";
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
  X,
  Trash2,
  MoreHorizontal,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import {
  addEmployeeEvent,
  deleteEmployeeEvent,
  addDisciplinaryRecord,
  updateDisciplinaryStatus,
  deleteDisciplinaryRecord,
  updateEmployee,
  addNote,
} from "@/lib/actions";

interface EmployeeDisplay {
  id: string;
  full_name: string;
  document_number: string | null;
  email: string | null;
  phone: string | null;
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

interface Document {
  id: string;
  name: string | null;
  file_path: string | null;
  mime_type: string | null;
  status: string | null;
  document_categories: { name: string } | null;
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

const eventTypes = [
  { value: "incapacidad", label: "Incapacidad" },
  { value: "permiso", label: "Permiso" },
  { value: "vacaciones", label: "Vacaciones" },
  { value: "llamado_atencion", label: "Llamado de atención" },
  { value: "sancion", label: "Sanción" },
  { value: "cambio_cargo", label: "Cambio de cargo" },
  { value: "cambio_salario", label: "Cambio de salario" },
  { value: "retiro", label: "Retiro" },
  { value: "otro", label: "Otro" },
];

const disciplinaryStatusFlow = ["abierto", "en_proceso", "resuelto", "cerrado"];

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
    abierto: { bg: "bg-orange-100", text: "text-orange-700" },
    en_proceso: { bg: "bg-blue-100", text: "text-blue-700" },
    cerrado: { bg: "bg-gray-100", text: "text-gray-700" },
  };
  const config = map[status.toLowerCase()] || { bg: "bg-gray-100", text: "text-gray-700" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}>
      {status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ")}
    </span>
  );
}

/* ── Modal Overlay ─────────────────────────────────────────────────────────── */

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl border border-[#E2E8F0] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────────────────────── */

interface AuditEntry {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles: { full_name: string } | null;
}

export function EmpleadoDetailClient({
  employee,
  events,
  disciplinaryRecords,
  documents,
  notes,
  auditLog,
}: {
  employee: EmployeeDisplay;
  events: EmployeeEvent[];
  disciplinaryRecords: DisciplinaryRecord[];
  documents: Document[];
  notes: Note[];
  auditLog: AuditEntry[];
}) {
  const [activeTab, setActiveTab] = useState("Información");
  const [isPending, startTransition] = useTransition();

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showDescargoModal, setShowDescargoModal] = useState(false);

  // Edit employee form state
  const [editForm, setEditForm] = useState({
    full_name: employee.full_name ?? "",
    document_number: employee.document_number ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    position: employee.position ?? "",
    salary: employee.salary ? String(employee.salary) : "",
    contract_type: employee.contract_type ?? "",
    location: employee.location ?? "",
    eps: employee.eps ?? "",
    afp: employee.afp ?? "",
    arl: employee.arl ?? "",
    caja_compensacion: employee.caja_compensacion ?? "",
  });

  // Event form state
  const [eventForm, setEventForm] = useState({
    type: "incapacidad",
    description: "",
    start_date: "",
    end_date: "",
    status: "aprobado",
  });

  // Descargo form state
  const [descargoForm, setDescargoForm] = useState({
    type: "",
    description: "",
    date: "",
  });

  // Note form state
  const [noteContent, setNoteContent] = useState("");

  // Status dropdown state for disciplinary records
  const [openStatusMenu, setOpenStatusMenu] = useState<string | null>(null);

  /* ── Handlers ──────────────────────────────────────────────────────────── */

  function handleUpdateEmployee() {
    startTransition(async () => {
      try {
        await updateEmployee(employee.id, {
          full_name: editForm.full_name || null,
          document_number: editForm.document_number || null,
          email: editForm.email || null,
          phone: editForm.phone || null,
          position: editForm.position || null,
          salary: editForm.salary ? Number(editForm.salary) : null,
          contract_type: editForm.contract_type || null,
          location: editForm.location || null,
          eps: editForm.eps || null,
          afp: editForm.afp || null,
          arl: editForm.arl || null,
          caja_compensacion: editForm.caja_compensacion || null,
        });
        setShowEditModal(false);
      } catch (err) {
        alert("Error al actualizar: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function handleChangeStatus(newStatus: string, label: string) {
    if (!confirm(`¿${label} a ${employee.full_name}?`)) return;
    startTransition(async () => {
      try {
        const updates: Record<string, unknown> = { status: newStatus };
        if (newStatus === "retirado") {
          updates.end_date = new Date().toISOString().split("T")[0];
        }
        await updateEmployee(employee.id, updates);
      } catch (err) {
        alert("Error: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function handleAddEvent() {
    if (!eventForm.type || !eventForm.description || !eventForm.start_date) {
      alert("Tipo, descripción y fecha inicio son requeridos");
      return;
    }
    startTransition(async () => {
      try {
        await addEmployeeEvent(employee.id, {
          type: eventForm.type,
          description: eventForm.description,
          start_date: eventForm.start_date,
          end_date: eventForm.end_date || undefined,
          status: eventForm.status,
        });
        setShowEventModal(false);
        setEventForm({ type: "incapacidad", description: "", start_date: "", end_date: "", status: "aprobado" });
      } catch (err) {
        alert("Error al crear novedad: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function handleDeleteEvent(id: string) {
    if (!confirm("¿Eliminar esta novedad?")) return;
    startTransition(async () => {
      try {
        await deleteEmployeeEvent(id);
      } catch (err) {
        alert("Error al eliminar: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function handleAddDescargo() {
    if (!descargoForm.type || !descargoForm.description || !descargoForm.date) {
      alert("Todos los campos son requeridos");
      return;
    }
    startTransition(async () => {
      try {
        await addDisciplinaryRecord(employee.id, {
          type: descargoForm.type,
          description: descargoForm.description,
          date: descargoForm.date,
        });
        setShowDescargoModal(false);
        setDescargoForm({ type: "", description: "", date: "" });
      } catch (err) {
        alert("Error al crear descargo: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function handleUpdateDescargoStatus(id: string, newStatus: string) {
    startTransition(async () => {
      try {
        let resolution: string | undefined;
        if (newStatus === "resuelto" || newStatus === "cerrado") {
          resolution = prompt("Resolución (opcional):") || undefined;
        }
        await updateDisciplinaryStatus(id, newStatus, resolution);
        setOpenStatusMenu(null);
      } catch (err) {
        alert("Error al actualizar estado: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function handleDeleteDescargo(id: string) {
    if (!confirm("¿Eliminar este descargo?")) return;
    startTransition(async () => {
      try {
        await deleteDisciplinaryRecord(id);
      } catch (err) {
        alert("Error al eliminar: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function handleAddNote() {
    if (!noteContent.trim()) return;
    startTransition(async () => {
      try {
        await addNote("employee", employee.id, noteContent.trim());
        setNoteContent("");
      } catch (err) {
        alert("Error al agregar nota: " + (err instanceof Error ? err.message : String(err)));
      }
    });
  }

  /* ── Tab Content Renderers ──────────────────────────────────────────────── */

  function renderInformacion() {
    return (
      <div className="flex gap-6">
        {/* Left Column */}
        <div className="w-[340px] shrink-0 space-y-6">
          {/* Datos Personales */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Datos Personales</h3>
            <div className="space-y-3.5">
              {employee.document_number && (
                <div className="flex items-center gap-3 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Cedula</p>
                    <p className="text-sm font-medium text-gray-900">{employee.document_number}</p>
                  </div>
                </div>
              )}
              {employee.email && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="text-sm font-medium text-gray-900">{employee.email}</p>
                  </div>
                </div>
              )}
              {employee.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Telefono</p>
                    <p className="text-sm font-medium text-gray-900">{employee.phone}</p>
                  </div>
                </div>
              )}
              {!employee.document_number && !employee.email && !employee.phone && (
                <p className="text-sm text-gray-400">Sin datos personales registrados</p>
              )}
            </div>
          </div>

          {/* Información Laboral */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Información Laboral</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Briefcase className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Cargo</p>
                  <p className="text-sm font-medium text-gray-900">{employee.position ?? "No especificado"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Departamento</p>
                  <p className="text-sm font-medium text-gray-900">{employee.departmentName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <DollarSign className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Salario</p>
                  <p className="text-sm font-medium text-gray-900">{employee.salaryFormatted}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Tipo de Contrato</p>
                  <p className="text-sm font-medium text-gray-900">{employee.contractTypeLabel}</p>
                </div>
              </div>
              {employee.supervisor && (
                <div className="flex items-center gap-3">
                  <UserCheck className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Jefe Inmediato</p>
                    <p className="text-sm font-medium text-gray-900">{employee.supervisor}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Afiliaciones */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <h3 className="mb-4 text-sm font-semibold text-gray-900">Afiliaciones</h3>
            <div className="space-y-3">
              {[
                { label: "EPS", value: employee.eps, icon: Heart },
                { label: "AFP", value: employee.afp, icon: Shield },
                { label: "ARL", value: employee.arl, icon: Shield },
                { label: "Caja de Compensación", value: employee.caja_compensacion, icon: Building2 },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <item.icon className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500">{item.label}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{item.value ?? "No registrado"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column – Quick overview */}
        <div className="flex-1 space-y-6">
          {/* Novedades Recientes (preview) */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Novedades Recientes</h3>
              <button onClick={() => setActiveTab("Novedades")} className="text-xs font-medium text-[#4F46E5] hover:underline">
                Ver todas
              </button>
            </div>
            {events.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">No hay novedades registradas</p>
            ) : (
              <div className="space-y-3">
                {events.slice(0, 3).map((evt) => {
                  const config = eventConfig[evt.type] || defaultEventConfig;
                  const Icon = config.icon;
                  return (
                    <div key={evt.id} className="flex items-center gap-3 rounded-lg border border-[#F1F5F9] p-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.bg}`}>
                        <Icon className={`h-4 w-4 ${config.iconColor}`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{evt.description || evt.type}</p>
                        <p className="text-xs text-gray-500">{formatDateRange(evt.start_date, evt.end_date)}</p>
                      </div>
                      {getStatusBadge(evt.status)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Descargos Preview */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Descargos y Sanciones</h3>
              {disciplinaryRecords.length === 0 ? (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  Sin descargos activos
                </span>
              ) : (
                <button onClick={() => setActiveTab("Descargos")} className="text-xs font-medium text-[#4F46E5] hover:underline">
                  Ver todos
                </button>
              )}
            </div>
            {disciplinaryRecords.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">No hay descargos registrados</p>
            ) : (
              <div className="space-y-3">
                {disciplinaryRecords.slice(0, 2).map((desc) => (
                  <div key={desc.id} className="rounded-lg border border-[#F1F5F9] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{desc.type || "Descargo"}</p>
                      {getStatusBadge(desc.status)}
                    </div>
                    {desc.description && <p className="text-sm text-gray-600 line-clamp-2">{desc.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observaciones Preview */}
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Observaciones Internas</h3>
              <button onClick={() => setActiveTab("Historial")} className="text-xs font-medium text-[#4F46E5] hover:underline">
                Ver todas
              </button>
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-[#94A3B8]">No hay observaciones registradas</p>
            ) : (
              <div className="space-y-4">
                {notes.slice(0, 2).map((note) => (
                  <div key={note.id}>
                    <p className="text-sm leading-relaxed text-gray-600 line-clamp-2">{note.content}</p>
                    <p className="mt-2 text-xs text-gray-400">
                      {note.profiles?.full_name ? `— ${note.profiles.full_name}` : ""}
                      {note.created_at && `, ${format(new Date(note.created_at), "dd MMM yyyy", { locale: es })}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderDocumentos() {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Documentos del Empleado</h3>
        </div>
        {documents.length === 0 ? (
          <p className="text-sm text-[#94A3B8]">No hay documentos registrados</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[#E2E8F0]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Categoría</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Enlace</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-[#F1F5F9] last:border-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{doc.name || "Sin nombre"}</td>
                    <td className="px-4 py-3 text-gray-600">{doc.document_categories?.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{doc.mime_type || "—"}</td>
                    <td className="px-4 py-3">{getStatusBadge(doc.status)}</td>
                    <td className="px-4 py-3">
                      {doc.file_path ? (
                        <a
                          href={doc.file_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#4F46E5] hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Ver
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderNovedades() {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Novedades</h3>
          <button
            onClick={() => setShowEventModal(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4338CA]"
          >
            + Nueva
          </button>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-[#94A3B8]">No hay novedades registradas</p>
        ) : (
          <div className="space-y-3">
            {events.map((evt) => {
              const config = eventConfig[evt.type] || defaultEventConfig;
              const Icon = config.icon;
              return (
                <div key={evt.id} className="flex items-center gap-3 rounded-lg border border-[#F1F5F9] p-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.bg}`}>
                    <Icon className={`h-4 w-4 ${config.iconColor}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{evt.description || evt.type}</p>
                    <p className="text-xs text-gray-500">{formatDateRange(evt.start_date, evt.end_date)}</p>
                  </div>
                  {getStatusBadge(evt.status)}
                  <button
                    onClick={() => handleDeleteEvent(evt.id)}
                    disabled={isPending}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    title="Eliminar novedad"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderDescargos() {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Descargos y Sanciones</h3>
          <button
            onClick={() => setShowDescargoModal(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4338CA]"
          >
            + Nuevo Descargo
          </button>
        </div>
        {disciplinaryRecords.length === 0 ? (
          <div>
            <span className="mb-3 inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
              Sin descargos activos
            </span>
            <p className="text-sm text-[#94A3B8]">No hay descargos registrados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {disciplinaryRecords.map((desc) => {
              const currentIdx = disciplinaryStatusFlow.indexOf(desc.status || "abierto");
              const nextStatuses = disciplinaryStatusFlow.slice(currentIdx + 1);
              return (
                <div key={desc.id} className="rounded-lg border border-[#F1F5F9] p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">{desc.type || "Descargo"}</p>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(desc.status)}
                      <div className="relative">
                        <button
                          onClick={() => setOpenStatusMenu(openStatusMenu === desc.id ? null : desc.id)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="Cambiar estado"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {openStatusMenu === desc.id && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg">
                            {nextStatuses.map((s) => (
                              <button
                                key={s}
                                onClick={() => handleUpdateDescargoStatus(desc.id, s)}
                                disabled={isPending}
                                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                Mover a: {s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ")}
                              </button>
                            ))}
                            <div className="my-1 border-t border-[#E2E8F0]" />
                            <button
                              onClick={() => {
                                setOpenStatusMenu(null);
                                handleDeleteDescargo(desc.id);
                              }}
                              disabled={isPending}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {desc.description && <p className="mb-3 text-sm text-gray-600">{desc.description}</p>}
                  {desc.resolution && <p className="mb-3 text-sm italic text-gray-500">Resolución: {desc.resolution}</p>}
                  <p className="text-xs text-gray-400">
                    {desc.date ? format(new Date(desc.date), "dd MMM yyyy", { locale: es }) : "Sin fecha"}
                    {desc.profiles?.full_name && ` \u00B7 ${desc.profiles.full_name}`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderHistorial() {
    return (
      <div className="space-y-6">
        {/* Observaciones - con formulario */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Observaciones Internas</h3>
          <div className="mb-4 rounded-lg border border-[#E2E8F0] p-4">
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Escribe una observación..."
              className="w-full resize-none rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
              rows={2}
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={handleAddNote}
                disabled={isPending || !noteContent.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
              >
                {isPending ? "Guardando..." : "Agregar"}
              </button>
            </div>
          </div>
          {notes.length > 0 && (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="border-b border-[#F1F5F9] pb-3 last:border-0">
                  <p className="text-sm text-gray-600">{note.content}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {note.profiles?.full_name ?? "Sistema"}
                    {note.created_at && ` — ${format(new Date(note.created_at), "dd MMM yyyy HH:mm", { locale: es })}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit Log - inmutable, no editable */}
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Historial de Cambios</h3>
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Solo lectura</span>
          </div>
          {auditLog.length === 0 ? (
            <p className="text-sm text-[#94A3B8]">No hay cambios registrados</p>
          ) : (
            <div className="space-y-0">
              {auditLog.map((entry, i) => (
                <div key={entry.id} className="relative flex gap-4 pb-5 last:pb-0">
                  {/* Timeline */}
                  <div className="flex flex-col items-center">
                    <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? "bg-[#4F46E5]" : "bg-gray-300"}`} />
                    {i < auditLog.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                  </div>
                  {/* Content */}
                  <div className="-mt-0.5 flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{entry.action}</p>
                    {entry.details && typeof entry.details === "object" && "resumen" in entry.details && (
                      <p className="mt-0.5 text-xs text-gray-600">{String(entry.details.resumen)}</p>
                    )}
                    {entry.details && typeof entry.details === "object" && !("resumen" in entry.details) && (
                      <div className="mt-0.5 text-xs text-gray-500">
                        {Object.entries(entry.details).filter(([k]) => k !== "cambios").map(([key, val]) => (
                          <span key={key} className="mr-3">{key}: <strong>{String(val)}</strong></span>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-gray-400">
                      {entry.profiles?.full_name ?? "Sistema"}
                      {entry.created_at && ` — ${format(new Date(entry.created_at), "dd MMM yyyy HH:mm", { locale: es })}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const tabContent: Record<string, () => React.ReactNode> = {
    Información: renderInformacion,
    Documentos: renderDocumentos,
    Novedades: renderNovedades,
    Descargos: renderDescargos,
    Historial: renderHistorial,
  };

  const inputClass = "w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]";
  const labelClass = "mb-1 block text-xs font-medium text-gray-700";

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Back link */}
      <div className="border-b border-[#E2E8F0] bg-white px-6 py-3">
        <Link href="/empleados" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#4F46E5]">
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
                <h1 className="text-2xl font-semibold text-gray-900">{employee.full_name}</h1>
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: employee.statusBg, color: employee.statusColor }}
                >
                  {employee.statusLabel}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                {employee.position ?? "Sin cargo"} &middot; {employee.departmentName}
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
            <button
              onClick={() => setShowEditModal(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Edit className="h-4 w-4" />
              Editar
            </button>
            <button
              onClick={() => alert("Funcionalidad de subida proximamente")}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
            >
              <Upload className="h-4 w-4" />
              Subir Documento
            </button>
            {employee.statusLabel !== "Retirado" ? (
              <button
                onClick={() => handleChangeStatus("retirado", "Retirar")}
                disabled={isPending}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {isPending ? "Procesando..." : "Retirar"}
              </button>
            ) : (
              <button
                onClick={() => handleChangeStatus("activo", "Reactivar")}
                disabled={isPending}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-green-200 px-4 text-sm font-medium text-green-600 hover:bg-green-50 disabled:opacity-50"
              >
                {isPending ? "Procesando..." : "Reactivar"}
              </button>
            )}
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
                activeTab === tab ? "text-[#4F46E5]" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
              {activeTab === tab && <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4F46E5]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">{tabContent[activeTab]?.()}</div>

      {/* ── Edit Employee Modal ─────────────────────────────────────────────── */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="Editar Empleado">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Nombre Completo</label>
            <input type="text" value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Cedula</label>
            <input type="text" value={editForm.document_number} onChange={(e) => setEditForm({ ...editForm, document_number: e.target.value })} placeholder="1234567890" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="correo@empresa.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Telefono</label>
            <input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+573001234567" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Cargo</label>
            <input type="text" value={editForm.position} onChange={(e) => setEditForm({ ...editForm, position: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Salario (COP)</label>
            <input type="number" value={editForm.salary} onChange={(e) => setEditForm({ ...editForm, salary: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Tipo de Contrato</label>
            <select value={editForm.contract_type} onChange={(e) => setEditForm({ ...editForm, contract_type: e.target.value })} className={inputClass}>
              <option value="">Seleccionar</option>
              <option value="indefinido">Término indefinido</option>
              <option value="fijo">Término fijo</option>
              <option value="obra_labor">Obra o labor</option>
              <option value="prestacion_servicios">Prestación de servicios</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Ubicación</label>
            <input type="text" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>EPS</label>
            <select value={editForm.eps} onChange={(e) => setEditForm({ ...editForm, eps: e.target.value })} className={inputClass}>
              <option value="">Seleccionar EPS</option>
              {EPS_COLOMBIA.map((eps) => <option key={eps} value={eps}>{eps}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>AFP</label>
            <select value={editForm.afp} onChange={(e) => setEditForm({ ...editForm, afp: e.target.value })} className={inputClass}>
              <option value="">Seleccionar AFP</option>
              {AFP_COLOMBIA.map((afp) => <option key={afp} value={afp}>{afp}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>ARL</label>
            <select value={editForm.arl} onChange={(e) => setEditForm({ ...editForm, arl: e.target.value })} className={inputClass}>
              <option value="">Seleccionar ARL</option>
              {ARL_COLOMBIA.map((arl) => <option key={arl} value={arl}>{arl}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Caja de Compensación</label>
            <select value={editForm.caja_compensacion} onChange={(e) => setEditForm({ ...editForm, caja_compensacion: e.target.value })} className={inputClass}>
              <option value="">Seleccionar Caja</option>
              {CAJAS_COMPENSACION_COLOMBIA.map((caja) => <option key={caja} value={caja}>{caja}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setShowEditModal(false)} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleUpdateEmployee} disabled={isPending} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50">
            {isPending ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </Modal>

      {/* ── Add Event Modal ─────────────────────────────────────────────────── */}
      <Modal open={showEventModal} onClose={() => setShowEventModal(false)} title="Nueva Novedad">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Tipo</label>
            <select value={eventForm.type} onChange={(e) => setEventForm({ ...eventForm, type: e.target.value })} className={inputClass}>
              {eventTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Descripción</label>
            <textarea
              value={eventForm.description}
              onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
              className={inputClass}
              rows={3}
              placeholder="Detalle de la novedad..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fecha Inicio</label>
              <input type="date" value={eventForm.start_date} onChange={(e) => setEventForm({ ...eventForm, start_date: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Fecha Fin (opcional)</label>
              <input type="date" value={eventForm.end_date} onChange={(e) => setEventForm({ ...eventForm, end_date: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Estado</label>
            <select value={eventForm.status} onChange={(e) => setEventForm({ ...eventForm, status: e.target.value })} className={inputClass}>
              <option value="aprobado">Aprobado</option>
              <option value="pendiente">Pendiente</option>
              <option value="completado">Completado</option>
              <option value="rechazado">Rechazado</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setShowEventModal(false)} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleAddEvent} disabled={isPending} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50">
            {isPending ? "Guardando..." : "Crear Novedad"}
          </button>
        </div>
      </Modal>

      {/* ── Add Descargo Modal ──────────────────────────────────────────────── */}
      <Modal open={showDescargoModal} onClose={() => setShowDescargoModal(false)} title="Nuevo Descargo">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Tipo</label>
            <input
              type="text"
              value={descargoForm.type}
              onChange={(e) => setDescargoForm({ ...descargoForm, type: e.target.value })}
              className={inputClass}
              placeholder='Ej. "Llamado de atención", "Sanción"'
            />
          </div>
          <div>
            <label className={labelClass}>Descripción</label>
            <textarea
              value={descargoForm.description}
              onChange={(e) => setDescargoForm({ ...descargoForm, description: e.target.value })}
              className={inputClass}
              rows={3}
              placeholder="Detalle del descargo..."
            />
          </div>
          <div>
            <label className={labelClass}>Fecha</label>
            <input type="date" value={descargoForm.date} onChange={(e) => setDescargoForm({ ...descargoForm, date: e.target.value })} className={inputClass} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setShowDescargoModal(false)} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={handleAddDescargo} disabled={isPending} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50">
            {isPending ? "Guardando..." : "Crear Descargo"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
