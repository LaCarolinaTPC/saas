"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteWebhookConfig } from "@/lib/actions";

export function DeleteWebhookButton({ id, name }: { id: string; name: string }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`¿Eliminar la integración "${name}"?`)) return;
    startTransition(async () => {
      await deleteWebhookConfig(id);
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {isPending ? "Eliminando..." : "Eliminar"}
    </button>
  );
}
