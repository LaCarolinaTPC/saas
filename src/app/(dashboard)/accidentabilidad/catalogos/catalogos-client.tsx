"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { actualizarItemCatalogo, crearItemCatalogo } from "@/lib/accidentabilidad/actions";
import {
  CATEGORIAS_FACTOR,
  FACTORES_POLITICA,
  TIPOS_CATALOGO,
  labelDe,
  type CatalogoItem,
  type Catalogos,
  type FactorPolitica,
  type TipoCatalogo,
} from "@/lib/accidentabilidad/formato";
import { inputCls } from "@/components/accidentabilidad/FormatoSecciones";

export default function CatalogosClient({ catalogos }: { catalogos: Catalogos }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoCatalogo>("ciudad");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ label: "", codigo: "", categoria: "conductor", factor_politica: "" });

  const info = TIPOS_CATALOGO.find((t) => t.value === tipo)!;
  const esFactor = tipo === "factor";
  const f = filtro.trim().toLowerCase();
  const items = catalogos[tipo].filter((i) => !f || i.label.toLowerCase().includes(f) || i.codigo.includes(f));

  function run(fn: () => Promise<void>, despues?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        despues?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  function crear() {
    run(
      () =>
        crearItemCatalogo({
          tipo,
          label: nuevo.label,
          codigo: nuevo.codigo,
          categoria: nuevo.categoria,
          factor_politica: (nuevo.factor_politica || null) as FactorPolitica | null,
        }),
      () => setNuevo({ ...nuevo, label: "", codigo: "" })
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TIPOS_CATALOGO.map((t) => (
          <button
            key={t.value}
            onClick={() => { setTipo(t.value); setFiltro(""); setEditando(null); setError(null); }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tipo === t.value ? "bg-[#4F46E5] text-white" : "border border-[#E2E8F0] bg-white text-gray-600"
            }`}
          >
            {t.label} <span className="opacity-70">({catalogos[t.value].filter((i) => i.activo).length})</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-500">{info.ayuda} Desactivar una opción la quita del formulario sin borrar los reportes que ya la usan.</p>

      {error && <div className="rounded-lg bg-[#FEE2E2] px-3 py-2 text-sm text-[#EF4444]">{error}</div>}

      {/* Alta */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-gray-900">Agregar</p>
        <div className="flex flex-wrap items-end gap-2">
          {esFactor && (
            <input className={`${inputCls} w-24`} value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value.replace(/\s/g, "") })} placeholder="Código" />
          )}
          <input className={`${inputCls} min-w-48 flex-1`} value={nuevo.label} onChange={(e) => setNuevo({ ...nuevo, label: e.target.value })} placeholder="Nombre" />
          {esFactor && (
            <>
              <select className={`${inputCls} w-auto`} value={nuevo.categoria} onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value })}>
                {CATEGORIAS_FACTOR.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select className={`${inputCls} w-auto`} value={nuevo.factor_politica} onChange={(e) => setNuevo({ ...nuevo, factor_politica: e.target.value })}>
                <option value="">Sin efecto en el puntaje</option>
                {FACTORES_POLITICA.map((c) => <option key={c.value} value={c.value}>Puntaje: {c.label}</option>)}
              </select>
            </>
          )}
          <button
            onClick={crear}
            disabled={pending || !nuevo.label.trim() || (esFactor && !nuevo.codigo.trim())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white">
        {catalogos[tipo].length > 10 && (
          <div className="relative border-b border-[#F1F5F9] p-3">
            <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input className={`${inputCls} pl-9`} value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar…" />
          </div>
        )}
        <ul className="divide-y divide-[#F1F5F9]">
          {items.map((i) =>
            editando === i.id ? (
              <FilaEdicion key={i.id} item={i} pending={pending} onCancel={() => setEditando(null)}
                onSave={(patch) => run(() => actualizarItemCatalogo(i.id, patch), () => setEditando(null))} />
            ) : (
              <li key={i.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i.activo ? "" : "opacity-50"}`}>
                {esFactor && <span className="w-9 shrink-0 font-mono text-gray-500">{i.codigo}</span>}
                <span className="min-w-0 flex-1 text-gray-900">
                  {i.label}
                  {esFactor && (
                    <span className="ml-2 text-xs text-gray-400">
                      {labelDe(CATEGORIAS_FACTOR, i.categoria) ?? "Sin grupo"}
                      {i.factor_politica && ` · Puntaje: ${labelDe(FACTORES_POLITICA, i.factor_politica)}`}
                    </span>
                  )}
                </span>
                <button onClick={() => setEditando(i.id)} className="shrink-0 text-gray-400 hover:text-[#4F46E5]" aria-label="Editar">
                  <Pencil className="h-4 w-4" />
                </button>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={i.activo}
                    disabled={pending}
                    onChange={(e) => run(() => actualizarItemCatalogo(i.id, { activo: e.target.checked }))}
                  />
                  Activo
                </label>
              </li>
            )
          )}
          {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">Sin opciones.</li>}
        </ul>
      </div>
    </div>
  );
}

function FilaEdicion({
  item, pending, onSave, onCancel,
}: {
  item: CatalogoItem;
  pending: boolean;
  onSave: (patch: { label: string; categoria?: string | null; factor_politica?: FactorPolitica | null }) => void;
  onCancel: () => void;
}) {
  const esFactor = item.tipo === "factor";
  const [label, setLabel] = useState(item.label);
  const [categoria, setCategoria] = useState(item.categoria ?? "");
  const [fp, setFp] = useState<string>(item.factor_politica ?? "");
  return (
    <li className="flex flex-wrap items-center gap-2 bg-[#F8FAFC] px-4 py-2.5">
      {esFactor && <span className="w-9 shrink-0 font-mono text-sm text-gray-500">{item.codigo}</span>}
      <input className={`${inputCls} min-w-48 flex-1`} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      {esFactor && (
        <>
          <select className={`${inputCls} w-auto`} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Sin grupo</option>
            {CATEGORIAS_FACTOR.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select className={`${inputCls} w-auto`} value={fp} onChange={(e) => setFp(e.target.value)}>
            <option value="">Sin efecto en el puntaje</option>
            {FACTORES_POLITICA.map((c) => <option key={c.value} value={c.value}>Puntaje: {c.label}</option>)}
          </select>
        </>
      )}
      <button
        onClick={() => onSave(esFactor ? { label, categoria: categoria || null, factor_politica: (fp || null) as FactorPolitica | null } : { label })}
        disabled={pending || !label.trim()}
        className="rounded-lg bg-[#4F46E5] p-2 text-white disabled:opacity-50"
        aria-label="Guardar"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button onClick={onCancel} className="rounded-lg border border-[#E2E8F0] p-2 text-gray-500" aria-label="Cancelar">
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}
