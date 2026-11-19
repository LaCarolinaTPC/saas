"use client";

/**
 * La pantalla del profesor dentro de un marco de celular, al lado del chat de
 * prueba (Candidatos › Selección). Es la misma vista de /profesor, pero solo
 * con candidatos guardados desde el chat de prueba y sin enviar WhatsApp.
 */
import { GraduationCap } from "lucide-react";
import { PROFESOR_PRUEBA } from "./acciones-prueba";
import { ProfesorVista } from "./profesor-vista";

export function MarcoProfesorPrueba({ puedeEditar }: { puedeEditar: boolean }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-text-tertiary" />
        <h2 className="text-sm font-semibold text-text-primary">Profesor (celular de prueba)</h2>
      </div>
      <p className="text-[11px] text-text-muted">
        Lo que ve el profesor en su celular, solo con los candidatos del chat de prueba. Cita al candidato desde «Citas» (debajo del chat) y aparece aquí el día de la cita.
        {puedeEditar ? "" : " Para registrar necesitas poder editar la configuración de Selección."}
      </p>
      <div className="mx-auto w-full max-w-[390px] rounded-[2.2rem] border-[10px] border-slate-800 bg-slate-800 shadow-xl">
        <div className="mx-auto mb-1 h-1.5 w-20 rounded-full bg-slate-600" />
        <div className="h-[740px] overflow-y-auto overscroll-contain rounded-[1.6rem] bg-[#F8FAFC]">
          <ProfesorVista acciones={PROFESOR_PRUEBA} puedeEditar={puedeEditar} modoPrueba />
        </div>
      </div>
    </section>
  );
}
