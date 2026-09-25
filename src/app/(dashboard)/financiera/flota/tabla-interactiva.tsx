"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Columns3, Maximize2, Minimize2, Rows3, Rows4 } from "lucide-react";

export interface ColumnaTabla {
  id: string;
  nombre: string;
  fija?: boolean;
}

type Preferencias = { ocultas: string[]; compacta: boolean };
const INICIALES: Preferencias = { ocultas: [], compacta: false };
const BOTON = "inline-flex h-8 items-center gap-1.5 rounded-md border border-[#E2E8F0] bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";

function leerPreferencias(id: string): string | null {
  try { return window.localStorage.getItem(`flota-tabla:${id}`); } catch { return null; }
}

function analizarPreferencias(guardado: string | null): Preferencias {
  if (!guardado) return INICIALES;
  try {
    const valor = JSON.parse(guardado) as Partial<Preferencias>;
    return {
      ocultas: Array.isArray(valor.ocultas) ? valor.ocultas.filter((v): v is string => typeof v === "string") : [],
      compacta: valor.compacta === true,
    };
  } catch { return INICIALES; }
}

/** Controles compartidos de las tablas de Gestión de flota. Conserva el DOM de la tabla al ampliar. */
export function TablaInteractiva({ id, columnas, children }: { id: string; columnas: readonly (ColumnaTabla | string)[]; children: ReactNode }) {
  const [respaldo, setRespaldo] = useState<Preferencias>(INICIALES);
  const [ampliada, setAmpliada] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const botonColumnas = useRef<HTMLButtonElement>(null);
  const botonAmpliar = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const clase = `tabla-flota-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const guardado = useSyncExternalStore(
    (aviso) => {
      const storage = (evento: StorageEvent) => { if (evento.key === `flota-tabla:${id}`) aviso(); };
      const local = (evento: Event) => { if ((evento as CustomEvent<string>).detail === id) aviso(); };
      window.addEventListener("storage", storage);
      window.addEventListener("flota-tabla-cambio", local);
      return () => { window.removeEventListener("storage", storage); window.removeEventListener("flota-tabla-cambio", local); };
    },
    () => leerPreferencias(id),
    () => null,
  );
  const preferencias = useMemo(() => guardado ? analizarPreferencias(guardado) : respaldo, [guardado, respaldo]);

  useEffect(() => {
    if (!ampliada && !menuAbierto) return;
    const teclado = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      if (menuAbierto) { setMenuAbierto(false); botonColumnas.current?.focus(); }
      else { setAmpliada(false); botonAmpliar.current?.focus(); }
    };
    const clic = (evento: MouseEvent) => {
      if (menuAbierto && !menu.current?.contains(evento.target as Node) && !botonColumnas.current?.contains(evento.target as Node)) setMenuAbierto(false);
    };
    document.addEventListener("keydown", teclado);
    document.addEventListener("mousedown", clic);
    return () => { document.removeEventListener("keydown", teclado); document.removeEventListener("mousedown", clic); };
  }, [ampliada, menuAbierto]);

  useEffect(() => {
    if (!ampliada) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = anterior; };
  }, [ampliada]);

  const guardar = (nuevas: Preferencias) => {
    setRespaldo(nuevas);
    try {
      window.localStorage.setItem(`flota-tabla:${id}`, JSON.stringify(nuevas));
      window.dispatchEvent(new CustomEvent("flota-tabla-cambio", { detail: id }));
    } catch { /* La tabla funciona sin almacenamiento. */ }
  };
  const definiciones = columnas.map((columna, indice): ColumnaTabla => typeof columna === "string"
    ? { id: String(indice), nombre: columna, fija: indice === 0 } : columna);
  const ocultas = new Set(preferencias.ocultas.filter((idColumna) => definiciones.some((c) => c.id === idColumna && !c.fija)));
  const reglas = definiciones.flatMap((columna, indice) => ocultas.has(columna.id)
    ? [`.${clase} table tr > :nth-child(${indice + 1}) { display: none; }`]
    : []).join("\n");

  return (
    <div role={ampliada ? "dialog" : undefined} aria-modal={ampliada ? true : undefined} aria-label={ampliada ? "Tabla de Gestión de flota ampliada" : undefined} className={`${clase} relative flex min-w-0 flex-col overflow-visible rounded-xl border border-[#E2E8F0] bg-white ${ampliada ? "fixed! inset-2 z-50 shadow-2xl sm:inset-4" : ""} ${preferencias.compacta ? "[&_table]:text-xs [&_th]:py-1! [&_td]:py-1! [&_th]:px-2! [&_td]:px-2!" : ""}`}>
      {reglas && <style>{reglas}</style>}
      <div className="flex flex-wrap items-center justify-end gap-1.5 border-b border-[#E2E8F0] px-3 py-2">
        <div className="relative">
          <button ref={botonColumnas} type="button" className={BOTON} aria-expanded={menuAbierto} aria-haspopup="true" onClick={() => setMenuAbierto((v) => !v)}>
            <Columns3 className="h-3.5 w-3.5" /><span>Columnas</span>
          </button>
          {menuAbierto && <div ref={menu} className="absolute right-0 z-30 mt-1 max-h-80 w-56 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white p-2 shadow-lg">
            <p className="px-2 pb-1 text-xs font-semibold text-gray-500">Columnas visibles</p>
            {definiciones.map((columna) => <label key={columna.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
              <input type="checkbox" checked={!ocultas.has(columna.id)} disabled={columna.fija} onChange={() => guardar({ ...preferencias, ocultas: ocultas.has(columna.id) ? [...ocultas].filter((v) => v !== columna.id) : [...ocultas, columna.id] })} />
              {columna.nombre}
            </label>)}
          </div>}
        </div>
        <button type="button" className={BOTON} title={preferencias.compacta ? "Vista normal" : "Vista compacta"} onClick={() => guardar({ ...preferencias, compacta: !preferencias.compacta })}>
          {preferencias.compacta ? <Rows3 className="h-3.5 w-3.5" /> : <Rows4 className="h-3.5 w-3.5" />}{preferencias.compacta ? "Normal" : "Compacto"}
        </button>
        <button ref={botonAmpliar} type="button" className={BOTON} title={ampliada ? "Cerrar vista ampliada" : "Ampliar a pantalla completa"} onClick={() => setAmpliada((v) => !v)}>
          {ampliada ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}{ampliada ? "Reducir" : "Ampliar"}
        </button>
      </div>
      <div className={`min-h-0 overflow-auto ${ampliada ? "flex-1" : "max-h-[70vh]"} [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10`}>
        {children}
      </div>
    </div>
  );
}
