import {
  FileText,
  FileCheck,
  AlertCircle,
  HardDrive,
  File,
  MoreHorizontal,
  Upload,
  FolderPlus,
} from "lucide-react";
import { getDocuments, getDocumentStats } from "@/lib/actions";
import { DOCUMENT_STATUSES, DOCUMENT_CATEGORIES } from "@/lib/constants";
import { DocumentTabs } from "./document-tabs";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getStatusStyle(status: string) {
  const found = DOCUMENT_STATUSES.find((s) => s.value === status);
  if (!found) return { bg: "#F1F5F9", dotColor: "#64748B", textColor: "#334155", label: status };
  return found;
}

function getCategoryStyle(slug: string | null | undefined) {
  const found = DOCUMENT_CATEGORIES.find((c) => c.slug === slug);
  if (!found) return { bg: "#F1F5F9", color: "#64748B", label: "Otro" };
  return { ...found };
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Server Component ─────────────────────────────────────────────────────────

export default async function DocumentosPage() {
  const [documents, stats] = await Promise.all([
    getDocuments(),
    getDocumentStats(),
  ]);

  const statCards = [
    {
      label: "Total Documentos",
      value: stats.total.toLocaleString(),
      icon: FileText,
      iconBg: "bg-[#4F46E5]/10",
      iconColor: "text-[#4F46E5]",
    },
    {
      label: "Firmas Pendientes",
      value: stats.pending.toLocaleString(),
      icon: FileCheck,
      iconBg: "bg-yellow-100",
      iconColor: "text-yellow-600",
    },
    {
      label: "Por Vencer",
      value: stats.expiring.toLocaleString(),
      icon: AlertCircle,
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
    },
    {
      label: "Almacenamiento",
      value: "—",
      icon: HardDrive,
      iconBg: "bg-gray-100",
      iconColor: "text-gray-600",
    },
  ];

  // Build serializable document rows
  const rows = documents.map((doc: Record<string, unknown>) => {
    const catData = doc.document_categories as { name?: string; slug?: string; color?: string } | null;
    const profileData = doc.profiles as { full_name?: string } | null;
    const candidateData = doc.candidates as { full_name?: string } | null;
    const employeeData = doc.employees as { full_name?: string } | null;
    const catStyle = getCategoryStyle(catData?.slug);
    const statusStyle = getStatusStyle(doc.status as string);
    const assignedName = profileData?.full_name ?? null;

    return {
      id: doc.id as string,
      name: (doc.name as string) ?? (doc.file_name as string) ?? "Sin nombre",
      filePath: (doc.file_path as string) ?? null,
      fileSize: formatFileSize(doc.file_size as number | null),
      mimeType: (doc.mime_type as string) ?? null,
      categoryLabel: catData?.name ?? catStyle.label,
      categoryBg: catStyle.bg,
      categoryCo: catStyle.color,
      statusLabel: statusStyle.label,
      statusBg: statusStyle.bg,
      statusDot: statusStyle.dotColor,
      statusText: statusStyle.textColor,
      assignedName,
      assignedInitials: getInitials(assignedName),
      updatedAt: formatDate(doc.updated_at as string | null ?? doc.created_at as string | null),
      categorySlug: catData?.slug ?? "otro",
      candidateName: candidateData?.full_name ?? null,
      employeeName: employeeData?.full_name ?? null,
    };
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* TopBar */}
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Documentos</h1>
      </div>

      <div className="px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Gestion de Documentos
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Administra contratos, politicas y documentos del personal
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <FolderPlus className="h-4 w-4" />
              Nueva Carpeta
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]">
              <Upload className="h-4 w-4" />
              Subir Documento
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="mb-6 grid grid-cols-4 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-xl border border-[#E2E8F0] bg-white p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.iconBg}`}
                  >
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900">
                      {card.value}
                    </p>
                    <p className="text-xs text-gray-500">{card.label}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tabs + Table (client component for interactivity) */}
        <DocumentTabs rows={rows} />
      </div>
    </div>
  );
}
