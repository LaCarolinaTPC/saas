"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createWebhookConfig } from "@/lib/actions";

export function NewIntegrationButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleNameChange(value: string) {
    setName(value);
    setSlug(value.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-"));
  }

  function handleSubmit() {
    if (!name.trim() || !slug.trim()) return;
    startTransition(async () => {
      await createWebhookConfig(name.trim(), slug.trim());
      setOpen(false);
      setName("");
      setSlug("");
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
      >
        <Plus className="h-4 w-4" /> Nueva Integración
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Nueva Integración</h3>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ej: Varylo, Typeform, Chatbot..."
              className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Slug (URL)</label>
            <div className="flex items-center gap-0">
              <span className="rounded-l-lg border border-r-0 border-[#E2E8F0] bg-gray-50 px-3 py-2 text-xs text-gray-500">
                /api/webhooks/
              </span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="mi-webhook"
                className="flex-1 rounded-r-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending || !name.trim() || !slug.trim()}
            className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
          >
            {isPending ? "Creando..." : "Crear Integración"}
          </button>
        </div>
      </div>
    </div>
  );
}
