"use client";

import { useState, useTransition } from "react";
import { Edit, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermisos } from "@/components/permisos/permisos-provider";
import { updateCandidate } from "@/lib/actions";

interface CandidatoEditable {
  id: string;
  full_name: string | null;
  document_number: string | null;
  email: string | null;
  phone: string | null;
}

function EditarCandidatoSinGuardia({ candidate }: { candidate: CandidatoEditable }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    full_name: candidate.full_name ?? "",
    document_number: candidate.document_number ?? "",
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
  });

  function handleSave() {
    startTransition(async () => {
      await updateCandidate(candidate.id, {
        full_name: form.full_name || null,
        document_number: form.document_number || null,
        email: form.email || null,
        phone: form.phone || null,
      });
      setOpen(false);
    });
  }

  const inputClass = "w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";
  const labelClass = "mb-1 block text-xs font-medium text-gray-600";

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Edit className="h-4 w-4" /> Editar
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Editar candidato</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Nombre completo</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Cédula</label>
                <input type="text" value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} placeholder="1234567890" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Teléfono</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+573001234567" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Correo</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@email.com" className={inputClass} />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={isPending} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50">
                {isPending ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Solo se muestra a quien tiene `candidatos.editar`; la acción de servidor exige lo mismo. */
export function EditarCandidato(props: React.ComponentProps<typeof EditarCandidatoSinGuardia>) {
  const puede = usePermisos();
  if (!puede("candidatos.editar")) return null;
  return <EditarCandidatoSinGuardia {...props} />;
}
