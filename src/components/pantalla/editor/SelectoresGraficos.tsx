"use client";

/** Rejillas para elegir una forma o un emoticono (barra de herramientas y panel de propiedades). */

import { useState } from "react";
import { CATEGORIAS_EMOJI, FUENTE_EMOJI, esEmoji } from "@/lib/pantalla/emojis";
import { CLAVES_FORMA, FORMAS, GRUPOS_FORMA, defForma, type ClaveForma } from "@/lib/pantalla/formas";
import { CLAVES_ICONO, GRUPOS_ICONO, buscarIconos, grupoIcono, nombreIcono, type ClaveIcono } from "@/lib/pantalla/iconos";
import { Search } from "lucide-react";
import { COMPONENTE_ICONO } from "../iconos-lucide";

/** Dibujo pequeño de una forma, con el mismo trazado que el lienzo. */
export function IconoForma({ forma, tam = 28, color = "#475569" }: { forma: ClaveForma; tam?: number; color?: string }) {
  const def = defForma(forma);
  return (
    <svg viewBox="-4 -4 108 108" width={tam} height={tam} aria-hidden>
      {forma === "rect" && <rect x="0" y="18" width="100" height="64" rx="6" fill={color} />}
      {forma === "elipse" && <ellipse cx="50" cy="50" rx="50" ry="34" fill={color} />}
      {forma === "linea" && <rect x="0" y="45" width="100" height="10" rx="5" fill={color} />}
      {def.d && <path d={def.d} fill={color} fillRule={def.evenodd ? "evenodd" : "nonzero"} />}
    </svg>
  );
}

export function RejillaFormas({ actual, onElegir }: { actual?: ClaveForma; onElegir: (f: ClaveForma) => void }) {
  return (
    <div className="space-y-2">
      {GRUPOS_FORMA.map((g) => (
        <div key={g.clave}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{g.nombre}</div>
          <div className="grid grid-cols-6 gap-1">
            {CLAVES_FORMA.filter((k) => FORMAS[k].grupo === g.clave).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onElegir(k)}
                title={FORMAS[k].nombre}
                aria-label={FORMAS[k].nombre}
                className={`flex h-9 w-9 items-center justify-center rounded-md border ${
                  actual === k ? "border-[#4F46E5] bg-[#EEF2FF]" : "border-transparent hover:border-[#E2E8F0] hover:bg-gray-50"
                }`}
              >
                <IconoForma forma={k} color={actual === k ? "#4F46E5" : "#475569"} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Íconos de transporte por grupos, con buscador (sin tildes, por nombre o palabras clave). */
export function RejillaIconos({ actual, onElegir, columnas = 7 }: { actual?: ClaveIcono; onElegir: (k: ClaveIcono) => void; columnas?: number }) {
  const [busqueda, setBusqueda] = useState("");
  const encontrados = new Set(buscarIconos(busqueda));
  const grupos = GRUPOS_ICONO.map((g) => ({ ...g, claves: CLAVES_ICONO.filter((k) => grupoIcono(k) === g.clave && encontrados.has(k)) })).filter(
    (g) => g.claves.length > 0
  );
  return (
    <div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar: bus, parada, tiquete…"
          className="w-full rounded-md border border-[#E2E8F0] py-1 pr-2 pl-7 text-sm outline-none focus:border-[#4F46E5]"
          aria-label="Buscar ícono"
        />
      </div>
      <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
        {grupos.length === 0 && <p className="py-4 text-center text-xs text-gray-400">No hay íconos con «{busqueda}».</p>}
        {grupos.map((g) => (
          <div key={g.clave}>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{g.nombre}</div>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
              {g.claves.map((k) => {
                const Icono = COMPONENTE_ICONO[k];
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onElegir(k)}
                    title={nombreIcono(k)}
                    aria-label={nombreIcono(k)}
                    className={`flex aspect-square items-center justify-center rounded-md border ${
                      actual === k ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4F46E5]" : "border-transparent text-gray-600 hover:border-[#E2E8F0] hover:bg-gray-50"
                    }`}
                  >
                    <Icono className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RejillaEmojis({ actual, onElegir, columnas = 8 }: { actual?: string; onElegir: (e: string) => void; columnas?: number }) {
  const [categoria, setCategoria] = useState(CATEGORIAS_EMOJI[0].clave);
  const [pegado, setPegado] = useState("");
  const lista = CATEGORIAS_EMOJI.find((c) => c.clave === categoria)?.emojis ?? [];
  const pegadoValido = esEmoji(pegado);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {CATEGORIAS_EMOJI.map((c) => (
          <button
            key={c.clave}
            type="button"
            onClick={() => setCategoria(c.clave)}
            title={c.nombre}
            className={`rounded-md px-1.5 py-1 text-lg leading-none ${categoria === c.clave ? "bg-[#EEF2FF] ring-1 ring-[#4F46E5]" : "hover:bg-gray-100"}`}
            style={{ fontFamily: FUENTE_EMOJI }}
          >
            {c.emojis[0]}
          </button>
        ))}
      </div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {CATEGORIAS_EMOJI.find((c) => c.clave === categoria)?.nombre}
      </div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
        {lista.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onElegir(e)}
            className={`flex aspect-square items-center justify-center rounded-md text-2xl leading-none hover:bg-gray-100 ${actual === e ? "bg-[#EEF2FF] ring-1 ring-[#4F46E5]" : ""}`}
            style={{ fontFamily: FUENTE_EMOJI }}
            aria-label={`Emoticono ${e}`}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          value={pegado}
          onChange={(ev) => setPegado(ev.target.value)}
          placeholder="Pegue otro emoticono"
          className="min-w-0 flex-1 rounded-md border border-[#E2E8F0] px-2 py-1 text-sm"
          // Inter primero: la fuente de emoticonos tiene métricas enormes para las letras.
          style={{ fontFamily: `var(--font-inter), ${FUENTE_EMOJI}` }}
          aria-label="Pegar un emoticono"
        />
        <button
          type="button"
          disabled={!pegadoValido}
          onClick={() => {
            onElegir(pegado.trim());
            setPegado("");
          }}
          className="rounded-md bg-[#4F46E5] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          Usar
        </button>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">En Windows: tecla Windows + punto (.) abre todos los emoticonos.</p>
    </div>
  );
}
