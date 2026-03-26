"use client";

import { useState, useTransition } from "react";
import { Save, Trash2, Copy, Check, Zap, X, ChevronDown, ArrowRight } from "lucide-react";
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

const MAPPING_FIELDS = [
  { key: "candidate_name", label: "Nombre del candidato", icon: "👤" },
  { key: "candidate_phone", label: "Teléfono", icon: "📱" },
  { key: "candidate_email", label: "Email", icon: "✉️" },
  { key: "candidate_document", label: "Número de documento", icon: "🪪" },
  { key: "candidate_position", label: "Cargo al que aplica", icon: "💼" },
  { key: "documents_array", label: "Array de documentos", icon: "📁" },
  { key: "document_url", label: "Campo URL del documento", icon: "🔗" },
  { key: "document_name", label: "Campo nombre del documento", icon: "📄" },
  { key: "document_mime", label: "Campo MIME type", icon: "🏷️" },
];

// Flatten a JSON object into dot-notation paths with their values
function flattenPaths(obj: unknown, prefix = ""): { path: string; value: unknown; display: string }[] {
  const results: { path: string; value: unknown; display: string }[] = [];
  if (Array.isArray(obj)) {
    // For arrays, show the array itself and also flatten the first element
    results.push({
      path: prefix,
      value: `[${obj.length} elemento${obj.length !== 1 ? "s" : ""}]`,
      display: `[${obj.length} elemento${obj.length !== 1 ? "s" : ""}]`,
    });
    if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
      // Show keys inside array items (for document fields like url, fileName)
      for (const [key, val] of Object.entries(obj[0] as Record<string, unknown>)) {
        const display = typeof val === "string" ? (val.length > 50 ? val.slice(0, 50) + "..." : val) : String(val ?? "null");
        results.push({ path: key, value: val, display });
      }
    }
  } else if (obj && typeof obj === "object") {
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (Array.isArray(val)) {
        results.push(...flattenPaths(val, fullPath));
      } else if (val && typeof val === "object") {
        results.push(...flattenPaths(val, fullPath));
      } else {
        const display = typeof val === "string" ? (val.length > 60 ? val.slice(0, 60) + "..." : val) : String(val ?? "null");
        results.push({ path: fullPath, value: val, display });
      }
    }
  }
  return results;
}

export function WebhookConfigForm({ config }: { config: WebhookConfig }) {
  const [mappings, setMappings] = useState<Record<string, string>>(config.field_mappings);
  const [isActive, setIsActive] = useState(config.is_active);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  // Payload detector state
  const [rawPayload, setRawPayload] = useState("");
  const [parsedPaths, setParsedPaths] = useState<{ path: string; value: unknown; display: string }[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [showDetector, setShowDetector] = useState(false);
  const [assigningField, setAssigningField] = useState<string | null>(null);

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

  function handleParsePayload(text: string) {
    setRawPayload(text);
    if (!text.trim()) {
      setParsedPaths([]);
      setParseError(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      const paths = flattenPaths(parsed);
      setParsedPaths(paths);
      setParseError(null);
    } catch {
      setParsedPaths([]);
      setParseError("JSON inválido. Verifica el formato del payload.");
    }
  }

  function assignPath(mappingKey: string, path: string) {
    updateMapping(mappingKey, path);
    setAssigningField(null);
  }

  // Get which mapping a path is assigned to
  function getAssignedTo(path: string): string | null {
    for (const [key, value] of Object.entries(mappings)) {
      if (value === path) {
        return MAPPING_FIELDS.find((f) => f.key === key)?.label ?? key;
      }
    }
    return null;
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

      {/* Payload Detector */}
      <div className="rounded-xl border-2 border-dashed border-[#4F46E5]/30 bg-[#4F46E5]/[0.02]">
        <button
          onClick={() => setShowDetector(!showDetector)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4F46E5]/10">
              <Zap className="h-4.5 w-4.5 text-[#4F46E5]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Detector de Payload</p>
              <p className="text-xs text-gray-500">Pega un payload de ejemplo y mapea los campos con un clic</p>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showDetector ? "rotate-180" : ""}`} />
        </button>

        {showDetector && (
          <div className="border-t border-[#4F46E5]/10 px-5 pb-5 pt-4 space-y-4">
            {/* Textarea for payload */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-600">
                Pega aquí el JSON del payload que recibes
              </label>
              <textarea
                value={rawPayload}
                onChange={(e) => handleParsePayload(e.target.value)}
                placeholder={'{\n  "capturedData": {\n    "nombre": "Juan",\n    "numero": "300123456"\n  },\n  "documents": [...]\n}'}
                className="h-40 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2.5 font-mono text-xs text-gray-700 placeholder:text-gray-300 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20 resize-none"
              />
              {parseError && (
                <p className="mt-1.5 text-xs text-red-500">{parseError}</p>
              )}
            </div>

            {/* Detected fields */}
            {parsedPaths.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Campos detectados — haz clic para asignar
                </p>
                <div className="space-y-1.5">
                  {parsedPaths.map((item) => {
                    const assignedTo = getAssignedTo(item.path);
                    return (
                      <div
                        key={item.path}
                        className={`group relative flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                          assignedTo
                            ? "border-[#4F46E5]/30 bg-[#4F46E5]/5"
                            : "border-[#E2E8F0] bg-white hover:border-[#4F46E5]/40 hover:bg-[#F8FAFC]"
                        }`}
                      >
                        {/* Path */}
                        <code className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-[#4F46E5]">
                          {item.path}
                        </code>

                        {/* Value preview */}
                        <span className="flex-1 truncate text-xs text-gray-500">
                          {item.display}
                        </span>

                        {/* Assigned badge or assign button */}
                        {assignedTo ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-[10px] font-medium text-white">
                            <Check className="h-3 w-3" /> {assignedTo}
                            <button
                              onClick={() => {
                                const key = Object.entries(mappings).find(([, v]) => v === item.path)?.[0];
                                if (key) updateMapping(key, "");
                              }}
                              className="ml-1 hover:text-red-200"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ) : assigningField && (
                          <button
                            onClick={() => assignPath(assigningField, item.path)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#4338CA] transition-colors"
                          >
                            <ArrowRight className="h-3 w-3" /> Asignar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quick assign panel */}
                <div className="mt-4 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  <p className="mb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    {assigningField
                      ? `Selecciona el campo para: ${MAPPING_FIELDS.find((f) => f.key === assigningField)?.label}`
                      : "Selecciona qué quieres mapear"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {MAPPING_FIELDS.map((field) => {
                      const isAssigned = !!mappings[field.key];
                      const isActive = assigningField === field.key;
                      return (
                        <button
                          key={field.key}
                          onClick={() => setAssigningField(isActive ? null : field.key)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                            isActive
                              ? "bg-[#4F46E5] text-white ring-2 ring-[#4F46E5]/30"
                              : isAssigned
                                ? "bg-white border border-green-200 text-green-700"
                                : "bg-white border border-[#E2E8F0] text-gray-600 hover:border-[#4F46E5]/40 hover:text-[#4F46E5]"
                          }`}
                        >
                          <span>{field.icon}</span>
                          {field.label}
                          {isAssigned && !isActive && <Check className="h-3 w-3 text-green-500" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Current Mappings Summary */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Mapeo de Campos</h3>
        <div className="space-y-2">
          {MAPPING_FIELDS.map((field) => {
            const value = mappings[field.key] ?? "";
            return (
              <div key={field.key} className="flex items-center gap-3">
                <label className="w-48 shrink-0 flex items-center gap-2 text-sm text-gray-700">
                  <span>{field.icon}</span> {field.label}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => updateMapping(field.key, e.target.value)}
                  placeholder="Sin asignar"
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20 ${
                    value
                      ? "border-[#4F46E5]/30 bg-[#4F46E5]/5 text-[#4F46E5] font-medium"
                      : "border-[#E2E8F0] text-gray-400 placeholder:text-gray-300"
                  }`}
                />
                {value && (
                  <button
                    onClick={() => updateMapping(field.key, "")}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
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
