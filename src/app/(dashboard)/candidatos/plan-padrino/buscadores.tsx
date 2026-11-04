"use client";

/**
 * Buscadores del Plan Padrino (proceso de contratación y padrino): los usan el
 * registro de referidos y el simulador de la política.
 */
import { useEffect, useState } from "react";

export const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-700 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";

/** Búsqueda con espera corta mientras se escribe. */
export function useBusqueda<T>(fn: (q: string) => Promise<T[]>, q: string) {
  const [res, setRes] = useState<{ q: string; items: T[] }>({ q: "", items: [] });
  useEffect(() => {
    if (q.trim().length < 3) return;
    let vivo = true;
    const t = setTimeout(() => {
      fn(q)
        .then((items) => vivo && setRes({ q, items }))
        .catch(() => vivo && setRes({ q, items: [] }));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [fn, q]);
  return q.trim().length < 3 ? [] : res.q === q ? res.items : null;
}


export function Elegido({ titulo, detalle, onCambiar }: { titulo: string; detalle: string; onCambiar: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{titulo}</p>
        <p className="truncate text-xs text-gray-500">{detalle}</p>
      </div>
      <button onClick={onCambiar} className="shrink-0 text-xs font-medium text-[#4F46E5] hover:underline">Cambiar</button>
    </div>
  );
}

export function Buscador<T>({
  valor, onValor, placeholder, items, vacio, render, onElegir,
}: {
  valor: string;
  onValor: (v: string) => void;
  placeholder: string;
  items: T[] | null;
  vacio: string;
  render: (t: T) => { key: string; titulo: string; detalle: string };
  onElegir: (t: T) => void;
}) {
  return (
    <div>
      <input value={valor} onChange={(e) => onValor(e.target.value)} placeholder={placeholder} className={`${inputCls} w-full`} />
      {valor.trim().length >= 3 && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-[#E2E8F0]">
          {items === null ? (
            <p className="px-3 py-2 text-xs text-gray-400">Buscando…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">{vacio}</p>
          ) : (
            items.map((t) => {
              const r = render(t);
              return (
                <button key={r.key} onClick={() => onElegir(t)} className="block w-full border-b border-[#F1F5F9] px-3 py-2 text-left last:border-0 hover:bg-[#F8FAFC]">
                  <span className="block text-sm text-gray-900">{r.titulo}</span>
                  <span className="block text-xs text-gray-500">{r.detalle}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
