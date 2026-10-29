"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { guardarCostoReparacion } from "@/lib/accidentabilidad/actions";
import { pesosCosto, validarCosto } from "@/lib/accidentabilidad/costo";
import { inputCls, labelCls } from "./FormatoSecciones";

/**
 * Costo de reparación del reporte. Lo registra solo quien tiene el permiso
 * `accidentabilidad.costo_reparacion` (el director de mantenimiento); los
 * demás lo ven. Arranca en 0 y tiene que ser un número de pesos enteros: se
 * valida aquí mientras se escribe y otra vez en el servidor.
 */
export default function CostoReparacion({
  accidenteId, costo, puedeEditar,
}: { accidenteId: string; costo: number | null; puedeEditar: boolean }) {
  const inicial = costo ?? 0;
  const [texto, setTexto] = useState(String(inicial));
  const [guardado, setGuardado] = useState(inicial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!puedeEditar) {
    return (
      <div className="flex justify-between py-1.5">
        <span className="text-sm text-gray-500">Costo de reparación</span>
        <span className="text-sm font-medium text-gray-900">{pesosCosto(inicial)}</span>
      </div>
    );
  }

  const validacion = validarCosto(texto);
  const cambio = validacion.ok && validacion.valor !== guardado;

  function guardar() {
    if (!validacion.ok) return;
    startTransition(async () => {
      const r = await guardarCostoReparacion(accidenteId, validacion.valor);
      if (r.success) {
        setGuardado(r.valor ?? validacion.valor);
        setTexto(String(r.valor ?? validacion.valor));
        setMsg({ ok: true, text: "Guardado." });
      } else {
        setMsg({ ok: false, text: r.error ?? "No se pudo guardar." });
      }
    });
  }

  return (
    <div>
      <label className={labelCls} htmlFor="costo-reparacion">Costo de reparación (pesos)</label>
      <div className="flex gap-2">
        <input
          id="costo-reparacion"
          className={`${inputCls} ${!validacion.ok ? "border-[#EF4444] focus:border-[#EF4444]" : ""}`}
          inputMode="numeric"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setMsg(null); }}
          onKeyDown={(e) => e.key === "Enter" && cambio && guardar()}
          placeholder="0"
          aria-invalid={!validacion.ok}
        />
        <button
          type="button"
          disabled={pending || !cambio}
          onClick={guardar}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
        </button>
      </div>
      {!validacion.ok ? (
        <p className="mt-1.5 text-xs text-[#EF4444]">{validacion.error}</p>
      ) : msg ? (
        <p className={`mt-1.5 text-xs ${msg.ok ? "text-[#059669]" : "text-[#EF4444]"}`}>{msg.text}</p>
      ) : (
        <p className="mt-1.5 text-xs text-gray-500">
          {pesosCosto(validacion.valor)}{validacion.valor !== guardado ? " · sin guardar" : ""}
        </p>
      )}
    </div>
  );
}
