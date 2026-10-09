"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import CroquisEditor, { croquisAPng, subirCroquisPng, type EncabezadoCroquis } from "@/components/accidentabilidad/CroquisEditor";
import { guardarCroquisAccidente } from "@/lib/accidentabilidad/actions";
import { tieneDibujo, type Croquis, type VehiculoCroquis } from "@/lib/accidentabilidad/croquis";

export default function CroquisEdicion({
  accidenteId,
  inicial,
  vehiculos,
  encabezado,
}: {
  accidenteId: string;
  inicial: Croquis;
  vehiculos: VehiculoCroquis[];
  encabezado: EncabezadoCroquis;
}) {
  const router = useRouter();
  const [croquis, setCroquis] = useState(inicial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    startTransition(async () => {
      try {
        const png = await croquisAPng(croquis, vehiculos, { ...encabezado, vehiculo: vehiculos[0]?.descripcion ?? "" });
        const path = await subirCroquisPng(png);
        await guardarCroquisAccidente(accidenteId, croquis, path);
        toast.success("Croquis guardado.");
        router.push(`/accidentabilidad/consultar/${accidenteId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar el croquis.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-[#FEE2E2] px-3 py-2 text-sm text-[#EF4444]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <CroquisEditor value={croquis} onChange={setCroquis} vehiculos={vehiculos} />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={guardar}
          disabled={pending || !tieneDibujo(croquis)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar croquis
        </button>
      </div>
    </div>
  );
}
