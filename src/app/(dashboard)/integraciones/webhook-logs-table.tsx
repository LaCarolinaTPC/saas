"use client";

import { useState } from "react";
import {
  MessageSquare,
  FileText,
  ImageIcon,
  Mic,
  MapPin,
  Video,
  Inbox,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";
import { timeAgoBogota } from "@/lib/utils";

interface WebhookLog {
  id: string;
  source: string;
  payload: Record<string, unknown> | null;
  status: string;
  processing_result: unknown;
  created_at: string;
  candidates: { full_name?: string } | null;
}

type MessageTypeIcon = {
  icon: typeof MessageSquare;
  bg: string;
  color: string;
  label: string;
};

const MESSAGE_TYPE_MAP: Record<string, MessageTypeIcon> = {
  text: { icon: MessageSquare, bg: "bg-green-100", color: "text-green-600", label: "Mensaje de texto" },
  document: { icon: FileText, bg: "bg-[#4F46E5]/10", color: "text-[#4F46E5]", label: "Documento" },
  image: { icon: ImageIcon, bg: "bg-purple-100", color: "text-purple-600", label: "Imagen" },
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

export function WebhookLogsTable({ logs }: { logs: WebhookLog[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleCopy(id: string, payload: unknown) {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Inbox className="mb-3 h-10 w-10 text-gray-300" />
        <p className="text-sm font-medium text-gray-500">Sin actividad reciente</p>
        <p className="mt-1 text-xs text-gray-400">Los mensajes del webhook aparecerán aqui</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#F1F5F9]">
      {/* Header */}
      <div className="grid grid-cols-[1fr_140px_1fr_100px_140px_40px] gap-2 px-6 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Candidato</span>
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Tipo</span>
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Resultado</span>
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Estado</span>
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Fecha</span>
        <span />
      </div>

      {logs.map((log) => {
        const candidateName = log.candidates?.full_name ?? "Desconocido";
        const payload = log.payload;
        const messageType = (payload?.message_type as string) ?? "text";
        const typeInfo = getMessageTypeInfo(messageType);
        const statusInfo = getStatusInfo(log.status);
        const rawResult = log.processing_result;
        const processingResult =
          typeof rawResult === "object" && rawResult !== null
            ? ((rawResult as Record<string, unknown>).message as string) ?? "—"
            : typeof rawResult === "string"
              ? rawResult
              : "—";
        const Icon = typeInfo.icon;
        const isExpanded = expandedId === log.id;

        return (
          <div key={log.id}>
            {/* Row */}
            <button
              onClick={() => toggleExpand(log.id)}
              className="grid w-full grid-cols-[1fr_140px_1fr_100px_140px_40px] gap-2 px-6 py-4 text-left transition-colors hover:bg-[#F8FAFC]"
            >
              <span className="text-sm font-medium text-gray-900 truncate">{candidateName}</span>
              <div className="flex items-center gap-2">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${typeInfo.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${typeInfo.color}`} />
                </div>
                <span className="text-sm text-gray-600 truncate">{typeInfo.label}</span>
              </div>
              <span className="text-sm text-gray-600 truncate">{processingResult}</span>
              <span
                className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
                {statusInfo.label}
              </span>
              <span className="text-sm text-gray-500">{timeAgoBogota(log.created_at)}</span>
              <div className="flex items-center justify-center">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </button>

            {/* Expanded payload */}
            {isExpanded && payload && (
              <div className="border-t border-[#F1F5F9] bg-[#F8FAFC] px-6 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Payload recibido
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(log.id, payload);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50"
                  >
                    {copiedId === log.id ? (
                      <>
                        <Check className="h-3 w-3 text-green-600" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copiar
                      </>
                    )}
                  </button>
                </div>

                {/* Captured Data Summary */}
                {payload.capturedData && typeof payload.capturedData === "object" && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {Object.entries(payload.capturedData as Record<string, unknown>).map(([key, value]) => (
                      <div key={key} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5">
                        <span className="text-[11px] font-medium text-gray-400">{key}:</span>
                        <span className="text-xs font-medium text-gray-900">{String(value ?? "—")}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Full JSON */}
                <pre className="max-h-64 overflow-auto rounded-lg border border-[#E2E8F0] bg-white p-3 font-mono text-[11px] text-gray-600">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
