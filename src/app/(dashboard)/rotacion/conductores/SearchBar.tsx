"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Search, Loader2 } from "lucide-react";
import { getInitials } from "@/lib/rotacion/utils/format";
import { GrupoBadge, TipoBadge, AfiliacionBadge } from "@/components/rotacion/ui/Badge";

const ESTADO_STRIPE: Record<string, string> = {
  ACTIVO:     "border-l-4 border-emerald-500",
  RETIRADO:   "border-l-4 border-red-500",
  SUSPENDIDO: "border-l-4 border-amber-500",
};

const ESTADO_GUIDE = [
  { color: "bg-emerald-500", label: "Activo" },
  { color: "bg-red-500",     label: "Retirado" },
  { color: "bg-amber-500",   label: "Suspendido" },
];

interface SearchResult {
  cedula: string;
  nombre: string;
  codigo: string | null;
  tipo_conductor: string | null;
  estado: string;
  grupo_antiguedad: string | null;
}

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/rotacion/conductores/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setShowResults(true);
        setSelectedIdx(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Escape") { setShowResults(false); }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por nombre o cedula..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          onKeyDown={handleKeyDown}
          className="w-full h-14 px-5 pl-12 text-base bg-white rounded-2xl border-2 border-slate-200 shadow-sm focus:border-amber-400 focus:ring-4 focus:ring-amber-50 focus:outline-none placeholder:text-slate-400 transition-all duration-200"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-amber-500 animate-spin" />
        )}
      </div>

      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-xl max-h-[400px] overflow-y-auto z-20">
          {results.length === 0 && !loading && (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-slate-500">No se encontraron resultados</p>
              <p className="text-xs text-slate-400 mt-1">Intenta con otro nombre o cedula</p>
            </div>
          )}
          {loading && results.length === 0 && (
            <div className="p-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-slate-200 rounded-full w-3/5" />
                    <div className="h-3 bg-slate-100 rounded-full w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {results.map((r, i) => (
            <Link
              key={r.cedula}
              href={`/rotacion/conductores/${r.cedula}`}
              className={`flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors duration-100 ${
                ESTADO_STRIPE[(r.estado || "").toUpperCase()] || "border-l-4 border-slate-200"
              } ${i === selectedIdx ? "bg-amber-50" : "hover:bg-slate-50"
              } ${r.estado === "RETIRADO" ? "opacity-60" : r.estado === "SUSPENDIDO" ? "opacity-75" : ""}`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center text-sm font-bold shrink-0">
                {getInitials(r.nombre)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 break-words">{r.nombre}</div>
                <div className="text-xs text-slate-500 mt-0.5">CC {r.cedula}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <TipoBadge tipo={r.tipo_conductor} />
                  <AfiliacionBadge tipo={r.tipo_conductor} />
                  <GrupoBadge grupo={r.grupo_antiguedad} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!showResults && !loading && !query && (
        <div className="mt-16 text-center animate-fade-in">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-6">
            <Search className="w-7 h-7 text-amber-500" />
          </div>
          <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            Escribe el nombre o numero de cedula para ver toda la informacion
            del conductor: datos personales, rendimiento, accidentes y ausentismo.
          </p>
          <p className="mt-4 text-xs text-slate-400">Minimo 2 caracteres para buscar</p>

          <div className="mt-8 inline-flex items-center gap-1 rounded-2xl border border-slate-100 bg-white px-5 py-3 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-3">
              Estado
            </span>
            {ESTADO_GUIDE.map((g) => (
              <span key={g.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 text-xs text-slate-600 font-medium">
                <span className={`w-2 h-2 rounded-full shrink-0 ${g.color}`} />
                {g.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
