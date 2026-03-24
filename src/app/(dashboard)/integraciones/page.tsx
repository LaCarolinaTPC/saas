import {
  Settings,
  Zap,
  MessageSquare,
  UserPlus,
  FolderOpen,
  AlertCircle,
  Phone,
  Image,
  FileText,
  Mic,
  MapPin,
  Video,
  Inbox,
} from "lucide-react";
import { getWebhookLogs, getWebhookStats } from "@/lib/actions";

// ── Helpers ──────────────────────────────────────────────────────────────────

type MessageTypeIcon = {
  icon: typeof MessageSquare;
  bg: string;
  color: string;
  label: string;
};

const MESSAGE_TYPE_MAP: Record<string, MessageTypeIcon> = {
  text: { icon: MessageSquare, bg: "bg-green-100", color: "text-green-600", label: "Mensaje de texto" },
  document: { icon: FileText, bg: "bg-[#4F46E5]/10", color: "text-[#4F46E5]", label: "Documento" },
  image: { icon: Image, bg: "bg-purple-100", color: "text-purple-600", label: "Imagen" },
  audio: { icon: Mic, bg: "bg-yellow-100", color: "text-yellow-600", label: "Nota de voz" },
  location: { icon: MapPin, bg: "bg-blue-100", color: "text-blue-600", label: "Ubicacion" },
  video: { icon: Video, bg: "bg-pink-100", color: "text-pink-600", label: "Video" },
};

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  recibido: { label: "Procesado", bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" },
  procesado: { label: "Procesado", bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" },
  error: { label: "Error", bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
  procesando: { label: "Revisar", bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500" },
};

function getMessageTypeInfo(type: string): MessageTypeIcon {
  return MESSAGE_TYPE_MAP[type] ?? { icon: MessageSquare, bg: "bg-gray-100", color: "text-gray-600", label: type };
}

function getStatusInfo(status: string) {
  return STATUS_MAP[status] ?? { label: status, bg: "bg-gray-100", text: "text-gray-700", dot: "bg-gray-500" };
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Hace un momento";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} hora${hours > 1 ? "s" : ""}`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} dia${days > 1 ? "s" : ""}`;
}

// ── Server Component ─────────────────────────────────────────────────────────

export default async function IntegracionesPage() {
  const [logs, stats] = await Promise.all([
    getWebhookLogs(),
    getWebhookStats(),
  ]);

  const statCards = [
    {
      label: "Mensajes Recibidos",
      value: stats.messages.toLocaleString(),
      sub: null as string | null,
      subColor: "",
      icon: MessageSquare,
      iconBg: "bg-[#4F46E5]/10",
      iconColor: "text-[#4F46E5]",
    },
    {
      label: "Candidatos Creados",
      value: stats.candidatesCreated.toLocaleString(),
      sub: null as string | null,
      subColor: "",
      icon: UserPlus,
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
    },
    {
      label: "Archivos Clasificados",
      value: stats.classifiedDocs.toLocaleString(),
      sub: null as string | null,
      subColor: "",
      icon: FolderOpen,
      iconBg: "bg-[#4F46E5]/10",
      iconColor: "text-[#4F46E5]",
    },
    {
      label: "Pendientes Revision",
      value: stats.pendingReview.toLocaleString(),
      sub: null as string | null,
      subColor: "text-yellow-600",
      icon: AlertCircle,
      iconBg: "bg-yellow-100",
      iconColor: "text-yellow-600",
    },
  ];

  const lastLog = logs.length > 0 ? logs[0] : null;
  const isConnected = lastLog
    ? (Date.now() - new Date(lastLog.created_at as string).getTime()) < 24 * 60 * 60 * 1000
    : false;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* TopBar */}
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Integraciones</h1>
      </div>

      <div className="px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Integraciones y Webhooks
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Gestiona conexiones con servicios externos y automatizaciones
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Zap className="h-4 w-4" />
              Probar Webhook
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]">
              <Settings className="h-4 w-4" />
              Configurar
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
                    {card.sub && (
                      <p className={`text-xs font-medium ${card.subColor}`}>
                        {card.sub}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Connection Card */}
        <div className="mb-6 rounded-xl border border-[#E2E8F0] bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isConnected ? "bg-green-100" : "bg-gray-100"}`}>
                <Phone className={`h-6 w-6 ${isConnected ? "text-green-600" : "text-gray-400"}`} />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Varylo — WhatsApp Webhook
                  </h3>
                  {isConnected ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                      Conectado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400" />
                      Desconectado
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {process.env.NEXT_PUBLIC_APP_URL ?? "https://gestivo.co"}/api/webhooks/varylo
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              {lastLog
                ? `Ultimo mensaje: ${timeAgo(lastLog.created_at as string)}`
                : "Sin actividad"}
            </p>
          </div>
        </div>

        {/* Actividad Reciente del Webhook */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#F1F5F9] px-6 py-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Actividad Reciente del Webhook
            </h3>
          </div>

          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Inbox className="mb-3 h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-500">
                Sin actividad reciente
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Los mensajes del webhook aparecerán aqui
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F1F5F9]">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Candidato
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Tipo de Mensaje
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Resultado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Fecha
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {logs.map((log: Record<string, unknown>) => {
                  const candidates = log.candidates as { full_name?: string } | null;
                  const candidateName = candidates?.full_name ?? "Desconocido";
                  const payload = log.payload as Record<string, unknown> | null;
                  const messageType = (payload?.message_type as string) ?? "text";
                  const typeInfo = getMessageTypeInfo(messageType);
                  const statusInfo = getStatusInfo(log.status as string);
                  const processingResult = (log.processing_result as string) ?? "—";
                  const Icon = typeInfo.icon;

                  return (
                    <tr
                      key={log.id as string}
                      className="transition-colors hover:bg-[#F8FAFC]"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {candidateName}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-lg ${typeInfo.bg}`}
                          >
                            <Icon className={`h-3.5 w-3.5 ${typeInfo.color}`} />
                          </div>
                          <span className="text-sm text-gray-600">
                            {typeInfo.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {processingResult}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}
                        >
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${statusInfo.dot}`}
                          />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {timeAgo(log.created_at as string)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
