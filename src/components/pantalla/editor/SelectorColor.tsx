"use client";

/**
 * Selector de color del editor: muestra el color, su código, los colores
 * usados hace poco y una paleta completa (12 tonos × 7 intensidades más una
 * escala de grises) que se despliega con «Más colores». El selector nativo del
 * navegador sigue disponible para cualquier color exacto.
 */

import { useState, useSyncExternalStore } from "react";
import { ChevronDown, Pipette } from "lucide-react";

// ── Paleta ──────────────────────────────────────────────────────────────────

function hslAHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Rojo, naranja, ámbar, amarillo, lima, verde, cian, azul cielo, azul, índigo, morado, rosa (12: caben en el panel). */
const TONOS = [0, 22, 38, 52, 80, 135, 185, 200, 215, 235, 270, 320];
const LUCES = [92, 82, 68, 54, 42, 32, 22];
const PALETA: string[][] = LUCES.map((l) => TONOS.map((h) => hslAHex(h, l > 85 ? 80 : 85, l)));
const GRISES = ["#ffffff", "#f8fafc", "#e2e8f0", "#cbd5e1", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b", "#0f172a", "#000000", "#d4a843"];

/** Los de la casa, siempre a mano. */
const RAPIDOS = ["#ffffff", "#000000", "#0f172a", "#2a78d6", "#eb6834", "#16a34a", "#dc2626", "#facc15", "#4f46e5", "#94a3b8"];

// ── Recientes (compartidos entre todos los selectores, guardados en el navegador) ──

const CLAVE = "gestivo.pantalla.colores-recientes";
const SIN_RECIENTES: string[] = [];
let recientes: string[] | null = null;
const oyentes = new Set<() => void>();

function leerRecientes(): string[] {
  if (recientes) return recientes;
  try {
    const v = JSON.parse(window.localStorage.getItem(CLAVE) ?? "[]");
    recientes = Array.isArray(v) ? v.filter((c) => typeof c === "string" && /^#[0-9a-f]{6}$/.test(c)).slice(0, 10) : [];
  } catch {
    recientes = [];
  }
  return recientes;
}

function anotarReciente(c: string) {
  const lista = [c, ...leerRecientes().filter((x) => x !== c)].slice(0, 10);
  recientes = lista;
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: solo en memoria */
  }
  oyentes.forEach((f) => f());
}

function useRecientes(): string[] {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    leerRecientes,
    () => SIN_RECIENTES
  );
}

// ── Componente ──────────────────────────────────────────────────────────────

function Muestra({ c, activo, onClick, chica }: { c: string; activo: boolean; onClick: () => void; chica?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={c}
      aria-label={`Color ${c}`}
      className={`${chica ? "h-4 w-4" : "h-[18px] w-[18px]"} shrink-0 rounded-[4px] border transition-transform hover:z-10 hover:scale-125 ${
        activo ? "ring-2 ring-[#4F46E5] ring-offset-1" : "border-black/10"
      }`}
      style={{ background: c }}
    />
  );
}

export function SelectorColor({
  valor,
  onCambio,
  etiqueta,
  abiertaAlInicio = false,
}: {
  valor: string;
  onCambio: (c: string) => void;
  etiqueta?: string;
  abiertaAlInicio?: boolean;
}) {
  // Lo que se escribe a mano; vuelve al valor real cuando este cambia desde fuera.
  const [borrador, setBorrador] = useState(valor);
  const [base, setBase] = useState(valor);
  if (base !== valor) {
    setBase(valor);
    setBorrador(valor);
  }
  const [abierta, setAbierta] = useState(abiertaAlInicio);
  const usados = useRecientes();
  const actual = valor.toLowerCase();

  const elegir = (c: string) => {
    const v = c.toLowerCase();
    onCambio(v);
    anotarReciente(v);
  };

  return (
    <div>
      {etiqueta && <div className="mb-1 text-xs font-medium text-gray-500">{etiqueta}</div>}
      <div className="flex items-center gap-2">
        <label
          className="relative flex h-8 w-10 shrink-0 cursor-pointer items-end justify-end overflow-hidden rounded-md border border-[#E2E8F0]"
          style={{ background: valor }}
          title="Cualquier color (selector del sistema)"
        >
          <Pipette className="m-0.5 h-3 w-3 rounded bg-white/80 p-px text-gray-600" />
          <input
            type="color"
            value={valor}
            onChange={(e) => onCambio(e.target.value)}
            onBlur={(e) => anotarReciente(e.target.value.toLowerCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={etiqueta ?? "Color"}
          />
        </label>
        <input
          value={borrador}
          onChange={(e) => {
            setBorrador(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) elegir(e.target.value);
          }}
          onBlur={() => setBorrador(valor)}
          className="w-[76px] min-w-0 shrink rounded-md border border-[#E2E8F0] px-2 py-1 font-mono text-xs"
          maxLength={7}
          aria-label="Código del color"
        />
        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[#E2E8F0] px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          aria-expanded={abierta}
        >
          Más colores <ChevronDown className={`h-3 w-3 transition-transform ${abierta ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {RAPIDOS.map((c) => (
          <Muestra key={c} c={c} activo={actual === c} onClick={() => elegir(c)} />
        ))}
      </div>

      {usados.length > 0 && (
        <div className="mt-1.5">
          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-gray-400">Usados</div>
          <div className="flex flex-wrap gap-1">
            {usados.map((c) => (
              <Muestra key={c} c={c} activo={actual === c} onClick={() => elegir(c)} />
            ))}
          </div>
        </div>
      )}

      {abierta && (
        <div className="mt-2 rounded-lg border border-[#E2E8F0] p-2">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${TONOS.length}, 16px)` }}>
            {PALETA.flat().map((c, i) => (
              <Muestra key={`${c}-${i}`} c={c} chica activo={actual === c} onClick={() => elegir(c)} />
            ))}
          </div>
          <div className="mt-2 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${GRISES.length}, 16px)` }}>
            {GRISES.map((c) => (
              <Muestra key={c} c={c} chica activo={actual === c} onClick={() => elegir(c)} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">¿Otro tono exacto? Toque el cuadro de color de arriba.</p>
        </div>
      )}
    </div>
  );
}
