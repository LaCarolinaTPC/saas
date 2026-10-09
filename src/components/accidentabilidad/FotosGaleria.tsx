"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import FotosAccidente, { VisorFoto, type FotoSubida } from "./FotosAccidente";
import { agregarFotosAccidente, quitarFotoAccidente } from "@/lib/accidentabilidad/actions";

/**
 * Fotos del reporte en el detalle: miniaturas que se amplían y, para quien
 * puede editar, carga de fotos nuevas y opción de quitar. Los enlaces firmados
 * valen una hora.
 */
export default function FotosGaleria({
  accidenteId,
  fotos,
  puedeEditar,
}: {
  accidenteId: string;
  fotos: { path: string; url: string }[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [nuevas, setNuevas] = useState<FotoSubida[]>([]);

  function guardarNuevas() {
    startTransition(async () => {
      try {
        await agregarFotosAccidente(accidenteId, nuevas.map((f) => f.path));
        setNuevas([]);
        toast.success("Fotos agregadas al reporte.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudieron agregar las fotos.");
      }
    });
  }

  function quitar(path: string) {
    if (!confirm("¿Quitar esta foto del reporte?")) return;
    startTransition(async () => {
      try {
        await quitarFotoAccidente(accidenteId, path);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo quitar la foto.");
      }
    });
  }

  return (
    <div>
      {fotos.length === 0 ? (
        <p className="text-sm text-gray-400">Sin fotos cargadas.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {fotos.map((f, i) => (
            <li key={f.path} className="relative">
              <button type="button" onClick={() => setAmpliada(f.url)} className="block w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={`Foto ${i + 1} del accidente`}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg border border-[#E2E8F0] object-cover hover:opacity-90"
                />
              </button>
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => quitar(f.path)}
                  disabled={pending}
                  aria-label="Quitar foto"
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeEditar && (
        <div className="mt-4 border-t border-[#F1F5F9] pt-4">
          <FotosAccidente value={nuevas} onChange={setNuevas} />
          {nuevas.length > 0 && (
            <button
              type="button"
              onClick={guardarNuevas}
              disabled={pending}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Agregar {nuevas.length} foto{nuevas.length > 1 ? "s" : ""} al reporte
            </button>
          )}
        </div>
      )}

      {ampliada && <VisorFoto url={ampliada} onClose={() => setAmpliada(null)} />}
    </div>
  );
}
