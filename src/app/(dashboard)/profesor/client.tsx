"use client";

import { ProfesorVista } from "@/components/seleccion/profesor-vista";
import { PROFESOR_REAL } from "@/components/seleccion/acciones-reales";

export function ProfesorClient({ puedeEditar }: { puedeEditar: boolean }) {
  return (
    <div className="min-h-dvh bg-[#F8FAFC]">
      {/* Una columna de ancho de celular, centrada en pantallas grandes. */}
      <div className="mx-auto min-h-dvh w-full max-w-md">
        <ProfesorVista acciones={PROFESOR_REAL} puedeEditar={puedeEditar} />
      </div>
    </div>
  );
}
