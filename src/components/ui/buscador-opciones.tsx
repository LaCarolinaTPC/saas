"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export type OpcionBuscable = {
  valor: string;
  etiqueta: string;
  /** Texto de apoyo que se muestra a la derecha (placa, ruta, descripción…). */
  secundario?: string;
  /** Textos por los que se puede buscar. El primero se trata como el código. */
  claves: string[];
};

const MAX_SUGERENCIAS = 8;

// Sin acentos ni mayúsculas, para que «carroceria» encuentre «Carrocería».
export function normalizarTexto(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * Campo de texto con sugerencias, en la misma línea del buscador de conductor:
 * se digita directo y aparecen hasta ocho coincidencias. Con la selección
 * hecha muestra la etiqueta y una X para cambiarla.
 *
 * Los resultados se ordenan para que un código numérico funcione bien: la
 * coincidencia exacta primero, luego lo que empieza por lo digitado y al final
 * lo que solo lo contiene. Así «12» trae 12, 120, 121 antes que 312.
 */
export function BuscadorOpciones({ opciones, value, onChange, placeholder, ayuda, vacio, id, disabled, className, grande = false }: {
  opciones: OpcionBuscable[];
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  /** Texto pequeño bajo el campo mientras no hay selección. */
  ayuda?: string;
  /** Mensaje cuando nada coincide; recibe lo digitado. */
  vacio?: (busqueda: string) => string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Campos altos y texto grande, para el celular del conductor. */
  grande?: boolean;
}) {
  const idGenerado = useId();
  const inputId = id ?? idGenerado;
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltada, setResaltada] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  // Al pulsar la X el input recién se monta, así que el foco se da al montarlo.
  const enfocarAlMontar = useRef(false);

  const seleccionada = value ? opciones.find((o) => o.valor === value) ?? null : null;

  const sugerencias = useMemo(() => {
    const q = normalizarTexto(busqueda);
    if (!q) return [];
    const puntuadas: { opcion: OpcionBuscable; rango: number }[] = [];
    for (const opcion of opciones) {
      const claves = opcion.claves.map(normalizarTexto);
      let rango = Infinity;
      claves.forEach((clave, i) => {
        // Las primeras claves (el código) pesan más que las de apoyo.
        if (clave === q) rango = Math.min(rango, i * 3);
        else if (clave.startsWith(q)) rango = Math.min(rango, i * 3 + 1);
        else if (clave.includes(q)) rango = Math.min(rango, i * 3 + 2);
      });
      if (rango !== Infinity) puntuadas.push({ opcion, rango });
    }
    return puntuadas
      .sort((a, b) => a.rango - b.rango || a.opcion.etiqueta.localeCompare(b.opcion.etiqueta, "es", { numeric: true }))
      .slice(0, MAX_SUGERENCIAS)
      .map((p) => p.opcion);
  }, [busqueda, opciones]);

  useEffect(() => {
    if (!abierto) return;
    function cerrarFuera(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", cerrarFuera);
    return () => document.removeEventListener("mousedown", cerrarFuera);
  }, [abierto]);

  function elegir(opcion: OpcionBuscable) {
    onChange(opcion.valor);
    setBusqueda("");
    setAbierto(false);
  }

  function limpiar() {
    onChange("");
    setBusqueda("");
    enfocarAlMontar.current = true;
  }

  function montarInput(el: HTMLInputElement | null) {
    if (el && enfocarAlMontar.current) {
      el.focus();
      enfocarAlMontar.current = false;
    }
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAbierto(true);
      setResaltada((r) => Math.max(0, Math.min(r + 1, sugerencias.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltada((r) => Math.max(r - 1, 0));
    } else if (e.key === "Enter") {
      if (abierto && sugerencias[resaltada]) {
        e.preventDefault();
        elegir(sugerencias[resaltada]);
      }
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  const mostrarLista = abierto && sugerencias.length > 0;
  const sinCoincidencias = abierto && busqueda.trim() !== "" && sugerencias.length === 0;
  const listaId = `${inputId}-lista`;

  const caja = grande
    ? "mt-2 rounded-xl border border-[#CBD5E1] bg-white p-4 text-lg text-gray-900"
    : "mt-1 rounded-lg border border-[#E2E8F0] bg-white p-2 text-gray-900";
  const campo = grande
    ? "w-full rounded-xl border border-[#CBD5E1] bg-white p-4 pl-12 text-lg text-gray-900 outline-none focus:border-[#4F46E5] disabled:opacity-50"
    : "w-full rounded-lg border border-[#E2E8F0] bg-white py-2 pl-9 pr-3 text-gray-900 outline-none focus:border-[#4F46E5] disabled:opacity-50";
  const fila = grande ? "px-4 py-3 text-lg" : "px-3 py-2 text-sm";
  const apoyo = grande ? "text-sm text-gray-500" : "text-xs text-gray-500";
  const icono = grande ? "h-5 w-5" : "h-4 w-4";

  if (seleccionada) {
    return (
      <div className={`flex items-center justify-between gap-2 ${caja} ${className ?? ""}`}>
        <span className="min-w-0 truncate">
          <span className="font-medium">{seleccionada.etiqueta}</span>
          {seleccionada.secundario && <span className={`ml-2 ${apoyo}`}>{seleccionada.secundario}</span>}
        </span>
        <button
          type="button"
          onClick={limpiar}
          disabled={disabled}
          aria-label="Cambiar selección"
          className="shrink-0 rounded p-1 text-gray-500 hover:bg-[#F1F5F9] hover:text-gray-900 disabled:opacity-50"
        >
          <X className={icono} />
        </button>
      </div>
    );
  }

  return (
    <div ref={raiz} className={`relative ${grande ? "mt-2" : "mt-1"} ${className ?? ""}`}>
      <Search className={`pointer-events-none absolute ${grande ? "left-4 top-[1.9rem] h-5 w-5" : "left-3 top-[1.125rem] h-4 w-4"} -translate-y-1/2 text-gray-400`} />
      <input
        ref={montarInput}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={mostrarLista}
        aria-controls={listaId}
        aria-autocomplete="list"
        value={busqueda}
        onChange={(e) => { setBusqueda(e.target.value); setResaltada(0); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={teclado}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        className={campo}
      />
      {mostrarLista && (
        <ul id={listaId} role="listbox" className={`absolute z-40 mt-1 w-full overflow-hidden border border-[#E2E8F0] bg-white shadow-lg ${grande ? "rounded-xl" : "rounded-lg"}`}>
          {sugerencias.map((o, i) => (
            <li key={o.valor} role="option" aria-selected={i === resaltada}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(o)}
                onMouseEnter={() => setResaltada(i)}
                className={`flex w-full items-center justify-between gap-3 text-left ${fila} ${i === resaltada ? "bg-[#F1F5F9]" : "hover:bg-[#F8FAFC]"}`}
              >
                <span className="font-medium text-gray-900">{o.etiqueta}</span>
                {o.secundario && <span className={`whitespace-nowrap ${apoyo}`}>{o.secundario}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {sinCoincidencias ? (
        <p className={`mt-1 ${apoyo}`}>{vacio ? vacio(busqueda.trim()) : `Nada coincide con «${busqueda.trim()}».`}</p>
      ) : ayuda ? (
        <p className={`mt-1 ${apoyo}`}>{ayuda}</p>
      ) : null}
    </div>
  );
}
