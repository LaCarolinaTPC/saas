"use client";

/**
 * Buscador de la pantalla de Selección (25-nov-2026): se escribe lo que se
 * quiere cambiar («recordatorio», «citación», «tope SIMIT», «firma»…) y lleva a
 * la opción: abre su pestaña, baja hasta ella y la resalta un momento. El
 * índice y la búsqueda están en src/lib/seleccion/buscador-seleccion.ts.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { AjusteSeleccion } from "@/lib/seleccion/ajustes";
import type { MensajeSeleccion } from "@/lib/seleccion/mensajes";
import { NOMBRE_PESTANA, buscarEnSeleccion, indiceSeleccion, type EntradaBuscador, type PestanaBuscable } from "@/lib/seleccion/buscador-seleccion";

const RESALTE = ["ring-2", "ring-primary", "ring-offset-2", "rounded-xl", "transition-shadow"];

/** Baja hasta la opción y la resalta. La pestaña puede tardar en pintarse: se reintenta un rato. */
function irA(e: EntradaBuscador, intento = 0) {
  let el: HTMLElement | null = e.ancla ? document.getElementById(e.ancla) : null;
  if (!el && e.encabezado) {
    const t = e.encabezado.toLowerCase();
    el = [...document.querySelectorAll<HTMLElement>("main h2, main h3, h2, h3")].find((h) => h.textContent?.trim().toLowerCase().startsWith(t)) ?? null;
    // El resalte va en la tarjeta de la sección, no solo en el título.
    el = el?.closest<HTMLElement>("section") ?? el;
  }
  if (!el) {
    if (intento < 25) window.setTimeout(() => irA(e, intento + 1), 120);
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add(...RESALTE);
  window.setTimeout(() => el?.classList.remove(...RESALTE), 2600);
}

export default function BuscadorSeleccion({
  mensajes,
  ajustes,
  disponibles,
  onIr,
}: {
  mensajes: MensajeSeleccion[];
  ajustes: AjusteSeleccion[];
  /** Pestañas que ve esta persona. */
  disponibles: PestanaBuscable[];
  /** Abre la pestaña del resultado. */
  onIr: (p: PestanaBuscable) => void;
}) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const indice = useMemo(() => indiceSeleccion(mensajes, ajustes, disponibles), [mensajes, ajustes, disponibles]);
  const resultados = useMemo(() => buscarEnSeleccion(indice, q), [indice, q]);

  // Se cierra al hacer clic fuera.
  useEffect(() => {
    const fuera = (ev: MouseEvent) => {
      if (caja.current && !caja.current.contains(ev.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const elegir = (e: EntradaBuscador) => {
    setAbierto(false);
    setQ("");
    onIr(e.pestana);
    // Tras el cambio de pestaña.
    window.setTimeout(() => irA(e), 60);
  };

  const hayTexto = q.trim().length >= 2;

  return (
    <div ref={caja} className="relative w-full sm:w-80">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
      <input
        type="search"
        role="combobox"
        aria-expanded={abierto && hayTexto}
        aria-controls="resultados-buscador-seleccion"
        aria-label="Buscar una opción de la selección"
        value={q}
        placeholder="Buscar una opción: recordatorio, citación, SIMIT…"
        onChange={(ev) => {
          setQ(ev.target.value);
          setAbierto(true);
          setActivo(0);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(ev) => {
          if (ev.key === "Escape") {
            setAbierto(false);
            setQ("");
          } else if (ev.key === "ArrowDown") {
            ev.preventDefault();
            setActivo((i) => Math.min(i + 1, Math.max(resultados.length - 1, 0)));
          } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            setActivo((i) => Math.max(i - 1, 0));
          } else if (ev.key === "Enter" && resultados[activo]) {
            ev.preventDefault();
            elegir(resultados[activo]);
          }
        }}
        className="w-full rounded-xl border border-border bg-white py-2 pl-9 pr-8 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary [&::-webkit-search-cancel-button]:hidden"
      />
      {q && (
        <button type="button" aria-label="Borrar la búsqueda" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-tertiary hover:text-text-primary">
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {abierto && hayTexto && (
        <ul
          id="resultados-buscador-seleccion"
          role="listbox"
          className="absolute right-0 z-30 mt-1 max-h-[70vh] w-full min-w-[20rem] overflow-y-auto rounded-xl border border-border bg-white p-1 shadow-lg sm:w-[30rem]"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-3 text-xs text-text-tertiary">Nada con «{q.trim()}». Pruebe con otra palabra (por ejemplo, «cita», «licencia», «correo»).</li>
          ) : (
            resultados.map((e, i) => (
              <li key={`${e.pestana}:${e.ancla ?? e.encabezado ?? e.titulo}:${i}`} role="option" aria-selected={i === activo}>
                <button
                  type="button"
                  onMouseEnter={() => setActivo(i)}
                  onClick={() => elegir(e)}
                  className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left ${i === activo ? "bg-primary/10" : "hover:bg-slate-50"}`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-text-primary">{e.titulo}</span>
                    <span className="block truncate text-[11px] text-text-tertiary">{e.donde}</span>
                  </span>
                  <span className="mt-0.5 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-text-secondary">{NOMBRE_PESTANA[e.pestana]}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
