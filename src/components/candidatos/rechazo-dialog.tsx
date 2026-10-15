"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { listarCausasRechazo } from "@/lib/rechazos/actions";
import {
  CAUSA_MAX, CAUSA_OTRA, NOTA_MAX, buscarCausa, causaElegida, validarRechazo, type CausaRechazo,
} from "@/lib/rechazos/causas";

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-700 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";

/** Catálogo de causas, cargado una vez por componente. */
function useCausas() {
  const [causas, setCausas] = useState<CausaRechazo[] | null>(null);
  useEffect(() => {
    let vivo = true;
    listarCausasRechazo()
      .then((c) => vivo && setCausas(c))
      .catch(() => vivo && setCausas([]));
    return () => {
      vivo = false;
    };
  }, []);
  return causas;
}

/**
 * Selector de causa de rechazo: las causas del catálogo y "Otra", que pide
 * escribir la causa nueva. La causa escrita entra al catálogo al guardar y
 * queda disponible para los rechazos siguientes. `onChange` recibe el texto
 * final de la causa ("" mientras no haya una válida).
 */
export function CausaRechazoSelect({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (causa: string) => void;
  autoFocus?: boolean;
}) {
  const causas = useCausas();
  const [tocado, setTocado] = useState(false);
  const [seleccionPropia, setSeleccion] = useState("");
  const [otraPropia, setOtra] = useState("");

  // Hasta que la persona elija algo, se muestra el valor inicial (p. ej. un
  // proceso ya cerrado): la causa del catálogo si está, si no "Otra" con el texto.
  const inicial = !tocado && causas && value ? buscarCausa(causas, value) : null;
  const seleccion = tocado || !causas || !value ? seleccionPropia : inicial ? inicial.nombre : CAUSA_OTRA;
  const otra = tocado || !value || inicial ? otraPropia : value;

  function elegir(sel: string, texto: string) {
    setTocado(true);
    setSeleccion(sel);
    setOtra(texto);
    onChange(causaElegida(sel, texto));
  }

  const existente = seleccion === CAUSA_OTRA && causas ? buscarCausa(causas, otra) : null;
  const base = causas?.filter((c) => c.base) ?? [];
  const creadas = causas?.filter((c) => !c.base) ?? [];

  return (
    <div className="space-y-2">
      <select
        value={seleccion}
        onChange={(e) => elegir(e.target.value, otra)}
        className={inputCls}
        disabled={!causas}
        autoFocus={autoFocus}
      >
        <option value="">{causas ? "Selecciona la causa…" : "Cargando causas…"}</option>
        {base.map((c) => (
          <option key={c.id} value={c.nombre}>{c.nombre}</option>
        ))}
        {creadas.length > 0 && (
          <optgroup label="Creadas por el equipo">
            {creadas.map((c) => (
              <option key={c.id} value={c.nombre}>{c.nombre}</option>
            ))}
          </optgroup>
        )}
        <option value={CAUSA_OTRA}>Otra (escribir una causa nueva)…</option>
      </select>
      {seleccion === CAUSA_OTRA && (
        <div>
          <input
            value={otra}
            onChange={(e) => elegir(CAUSA_OTRA, e.target.value)}
            maxLength={CAUSA_MAX}
            placeholder="Escribe la causa"
            className={inputCls}
            autoFocus
          />
          <p className="mt-1 text-[11px] text-gray-500">
            {existente
              ? `Ya existe "${existente.nombre}": se usará esa.`
              : "Obligatoria. Quedará en la lista para los próximos rechazos."}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Cuadro que pide la causa antes de rechazar a un candidato en el pipeline.
 * `onConfirm` devuelve el mensaje de error del servidor, o null si guardó.
 */
export function RechazoDialog({
  nombre,
  faseLabel,
  destinoLabel,
  onCancel,
  onConfirm,
}: {
  nombre: string;
  faseLabel: string;
  destinoLabel: string;
  onCancel: () => void;
  onConfirm: (causa: string, nota: string) => Promise<string | null>;
}) {
  const [causa, setCausa] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !guardando && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, guardando]);

  async function confirmar() {
    const err = validarRechazo(causa, nota);
    if (err) {
      setError(err);
      return;
    }
    setGuardando(true);
    setError(null);
    const res = await onConfirm(causa, nota);
    setGuardando(false);
    if (res) setError(res);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !guardando && onCancel()}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Rechazar candidato</h3>
          <button onClick={onCancel} disabled={guardando} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          <strong className="text-gray-700">{nombre}</strong> pasa de{" "}
          <strong className="text-gray-700">{faseLabel}</strong> a{" "}
          <strong className="text-gray-700">{destinoLabel}</strong>. La fase queda registrada para el reporte.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Causa del rechazo *</label>
            <CausaRechazoSelect value={causa} onChange={setCausa} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Detalle (opcional)</label>
            <textarea
              rows={3}
              value={nota}
              maxLength={NOTA_MAX}
              onChange={(e) => setNota(e.target.value)}
              className={`${inputCls} h-auto py-2`}
              placeholder="Lo que conviene saber si el candidato vuelve a postularse"
            />
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={guardando}
            className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={guardando || !causa.trim()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Rechazar"}
          </button>
        </div>
      </div>
    </div>
  );
}
