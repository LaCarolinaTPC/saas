"use client";

import { useState, useTransition } from "react";
import { Save, Plus, Trash2, Copy, Check } from "lucide-react";
import { updateWebhookConfig, deleteWebhookConfig } from "@/lib/actions";
import { useRouter } from "next/navigation";

interface WebhookConfig {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  field_mappings: Record<string, string>;
  auth_secret: string | null;
}

const FIELD_OPTIONS = [
  { key: "candidate_name", label: "Nombre del candidato", placeholder: "capturedData.nombre" },
  { key: "candidate_phone", label: "Teléfono", placeholder: "capturedData.numero" },
  { key: "candidate_email", label: "Email", placeholder: "capturedData.email" },
  { key: "candidate_document", label: "Número de documento", placeholder: "capturedData.cedula" },
  { key: "candidate_position", label: "Cargo al que aplica", placeholder: "capturedData.cargo" },
  { key: "documents_array", label: "Array de documentos", placeholder: "documents" },
  { key: "document_url", label: "Campo URL del documento", placeholder: "url" },
  { key: "document_name", label: "Campo nombre del documento", placeholder: "fileName" },
  { key: "document_mime", label: "Campo MIME type", placeholder: "mimeType" },
];

export function WebhookConfigForm({ config }: { config: WebhookConfig }) {
  const [mappings, setMappings] = useState<Record<string, string>>(config.field_mappings);
  const [isActive, setIsActive] = useState(config.is_active);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const webhookUrl = `https://gestivo.vercel.app/api/webhooks/${config.slug}`;

  function updateMapping(key: string, value: string) {
    setMappings((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      await updateWebhookConfig(config.id, { field_mappings: mappings, is_active: isActive });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar la integración "${config.name}"?`)) return;
    startTransition(async () => {
      await deleteWebhookConfig(config.id);
      router.push("/integraciones");
    });
  }

  function handleCopy() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* URL + Copy */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">URL del Webhook</label>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-sm text-gray-700">
            {webhookUrl}
          </code>
          <button onClick={handleCopy} className="rounded-lg border border-[#E2E8F0] px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Active toggle */}
      <div className="flex items-center justify-between rounded-lg border border-[#E2E8F0] p-4">
        <div>
          <p className="text-sm font-medium text-gray-900">Integración activa</p>
          <p className="text-xs text-gray-500">Desactiva para dejar de recibir webhooks</p>
        </div>
        <button
          onClick={() => setIsActive(!isActive)}
          className={`h-6 w-11 rounded-full relative transition-colors ${isActive ? "bg-[#4F46E5]" : "bg-gray-300"}`}
        >
          <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${isActive ? "right-0.5" : "left-0.5"}`} />
        </button>
      </div>

      {/* Field Mappings */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Mapeo de Campos</h3>
        <p className="mb-4 text-xs text-gray-500">
          Indica la ruta JSON del payload que corresponde a cada campo. Usa notación de punto para campos anidados (ej: <code className="bg-gray-100 px-1 rounded">contact.phone</code>).
        </p>

        <div className="space-y-3">
          {FIELD_OPTIONS.map((field) => (
            <div key={field.key} className="flex items-center gap-3">
              <label className="w-48 shrink-0 text-sm text-gray-700">{field.label}</label>
              <input
                type="text"
                value={mappings[field.key] ?? ""}
                onChange={(e) => updateMapping(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Example payload */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Payload esperado</h3>
        <pre className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-xs text-gray-600 overflow-x-auto">
{`{
  "event": "chatbot.data_captured",
  "conversationId": "clxxx...",
  "capturedData": {
    "nombre": "${mappings.candidate_name ? `→ ${mappings.candidate_name}` : "..."}",
    "numero": "${mappings.candidate_phone ? `→ ${mappings.candidate_phone}` : "..."}",
    "email": "${mappings.candidate_email ? `→ ${mappings.candidate_email}` : "..."}",
    "cedula": "${mappings.candidate_document ? `→ ${mappings.candidate_document}` : "..."}",
    "cargo": "${mappings.candidate_position ? `→ ${mappings.candidate_position}` : "..."}"
  },
  "documents": [
    { "url": "https://...", "fileName": "cv.pdf", "mimeType": "application/pdf" }
  ],
  "timestamp": "2026-03-25T14:30:00.000Z"
}`}
        </pre>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-6">
        <button
          onClick={handleDelete}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" /> Eliminar
        </button>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-5 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {isPending ? "Guardando..." : saved ? "Guardado" : "Guardar Cambios"}
        </button>
      </div>
    </div>
  );
}
