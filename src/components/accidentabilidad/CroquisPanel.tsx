"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, PenLine } from "lucide-react";
import { VisorFoto } from "./FotosAccidente";
import FotosGaleria from "./FotosGaleria";

/**
 * Croquis del reporte (formato GO-R-16, página 2) y fotos del croquis oficial
 * del IPAT. Quien puede editar corrige el croquis en su propia pantalla.
 */
export default function CroquisPanel({
  accidenteId,
  croquisUrl,
  motivoSinCroquis,
  ipatCroquis,
  tieneIpat,
  puedeEditar,
}: {
  accidenteId: string;
  croquisUrl: string | null;
  motivoSinCroquis: string | null;
  ipatCroquis: { path: string; url: string }[];
  tieneIpat: boolean;
  puedeEditar: boolean;
}) {
  const [ampliado, setAmpliado] = useState(false);
  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-[#4F46E5] hover:bg-[#EEF2FF]";

  return (
    <div className="space-y-5">
      <div>
        {croquisUrl ? (
          <button type="button" onClick={() => setAmpliado(true)} className="block w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={croquisUrl} alt="Croquis del accidente" className="w-full rounded-lg border border-[#E2E8F0] bg-white" />
          </button>
        ) : (
          <p className="text-sm text-gray-500">
            {motivoSinCroquis ? <>Sin croquis: <span className="text-gray-700">{motivoSinCroquis}</span></> : "Sin croquis."}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {croquisUrl && (
            <a href={croquisUrl} target="_blank" rel="noopener noreferrer" className={btn}>
              <ExternalLink className="h-4 w-4" /> Abrir imagen
            </a>
          )}
          {puedeEditar && (
            <Link href={`/accidentabilidad/consultar/${accidenteId}/croquis`} className={btn}>
              <PenLine className="h-4 w-4" /> {croquisUrl ? "Editar croquis" : "Dibujar croquis"}
            </Link>
          )}
        </div>
      </div>

      {(tieneIpat || ipatCroquis.length > 0) && (
        <div className="border-t border-[#F1F5F9] pt-4">
          <p className="mb-2 text-sm font-semibold text-gray-900">Croquis del IPAT</p>
          <FotosGaleria
            accidenteId={accidenteId}
            fotos={ipatCroquis}
            puedeEditar={puedeEditar}
            campo="ipat_croquis"
            vacio="Sin foto del croquis del IPAT."
          />
        </div>
      )}

      {ampliado && croquisUrl && <VisorFoto url={croquisUrl} onClose={() => setAmpliado(false)} />}
    </div>
  );
}
