"use client";

// Secciones del formato de investigación de accidentes, compartidas por el
// asistente de reporte y la edición de un reporte con información faltante.

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { buscarVehiculos, type VehiculoSugerido } from "@/lib/accidentabilidad/actions";
import {
  CATEGORIAS_FACTOR,
  CLASE_VEHICULO,
  CONDICION_VICTIMA,
  terceroVacio,
  victimaVacia,
  type Agente,
  type CatalogoItem,
  type SiNo,
  type Tercero,
  type VehiculoPropio,
  type Victima,
} from "@/lib/accidentabilidad/formato";

export const inputCls =
  "w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";
export const labelCls = "mb-1 block text-sm font-medium text-gray-900";

function Campo({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function Texto({
  label, value, onChange, placeholder, className, inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel";
}) {
  return (
    <Campo label={label} className={className}>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} />
    </Campo>
  );
}

/** Pregunta de Sí / No que puede quedar sin responder. */
export function SiNoToggle({ label, value, onChange }: { label: string; value: SiNo; onChange: (v: SiNo) => void }) {
  const btn = (v: boolean, text: string) => (
    <button
      type="button"
      onClick={() => onChange(value === v ? null : v)}
      className={`flex-1 px-3 py-1.5 text-sm font-medium transition ${
        value === v ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"
      }`}
    >
      {text}
    </button>
  );
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-gray-900">{label}</p>
      <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0] divide-x divide-[#E2E8F0]">
        {btn(true, "Sí")}
        {btn(false, "No")}
      </div>
    </div>
  );
}

/** Ciudad del catálogo; conserva un valor antiguo que ya no esté en la lista. */
export function CiudadSelect({
  ciudades, value, onChange, invalid,
}: { ciudades: CatalogoItem[]; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const enLista = ciudades.some((c) => c.label === value);
  return (
    <select className={`${inputCls} ${invalid ? "border-[#EF4444]" : ""}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecciona…</option>
      {ciudades.map((c) => (
        <option key={c.id} value={c.label}>{c.label}</option>
      ))}
      {value && !enLista && <option value={value}>{value}</option>}
    </select>
  );
}

// ── 1. Datos del vehículo propio ────────────────────────────────────────────

export function VehiculoPropioSection({
  value, onChange,
}: { value: VehiculoPropio; onChange: (v: VehiculoPropio) => void }) {
  const set = <K extends keyof VehiculoPropio>(k: K, v: VehiculoPropio[K]) => onChange({ ...value, [k]: v });
  const [q, setQ] = useState("");
  const [sug, setSug] = useState<VehiculoSugerido[]>([]);
  const [buscando, setBuscando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setSug([]);
      return;
    }
    setBuscando(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        setSug(await buscarVehiculos(term));
      } catch {
        setSug([]);
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <label className={labelCls}>Buscar vehículo (N.º interno o placa)</label>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: 125 o TSK123" autoComplete="off" />
          {buscando && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-400" />}
        </div>
        {sug.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg">
            {sug.map((s) => (
              <li key={s.codigo}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...value, codigo: s.codigo, placa: s.placa ?? "", ruta: s.ruta ?? value.ruta });
                    setQ("");
                    setSug([]);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[#F8FAFC]"
                >
                  <span className="font-medium text-gray-900">N.º {s.codigo}</span>
                  <span className="text-gray-500">{[s.placa, s.ruta].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Texto label="N.º interno" value={value.codigo} onChange={(v) => set("codigo", v)} />
        <Texto label="Placa" value={value.placa} onChange={(v) => set("placa", v.toUpperCase())} />
        <Texto label="Ruta" value={value.ruta} onChange={(v) => set("ruta", v)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SiNoToggle label="Vehículo empresa" value={value.empresa} onChange={(v) => set("empresa", v)} />
        <SiNoToggle label="Vehículo afiliado" value={value.afiliado} onChange={(v) => set("afiliado", v)} />
        <SiNoToggle label="Inmovilización" value={value.inmovilizacion} onChange={(v) => set("inmovilizacion", v)} />
        <SiNoToggle label="Transacción" value={value.transaccion} onChange={(v) => set("transaccion", v)} />
        <SiNoToggle label="Fotos" value={value.tiene_fotos} onChange={(v) => set("tiene_fotos", v)} />
        <SiNoToggle label="IPAT" value={value.tiene_ipat} onChange={(v) => set("tiene_ipat", v)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {value.tiene_ipat && <Texto label="N.º de IPAT" value={value.ipat_numero} onChange={(v) => set("ipat_numero", v)} />}
        <Texto
          label="Velocidad (km/h)"
          value={value.velocidad}
          inputMode="decimal"
          onChange={(v) => set("velocidad", v.replace(/[^\d.,]/g, ""))}
        />
        <Texto label="Huella de frenado" value={value.huella_frenado} onChange={(v) => set("huella_frenado", v)} placeholder="Ej: 4 m" />
        <Texto label="Huella de arrastre" value={value.huella_arrastre} onChange={(v) => set("huella_arrastre", v)} placeholder="Ej: 2 m" />
      </div>
    </div>
  );
}

// ── Factores e hipótesis (códigos de tránsito) ──────────────────────────────

export function HipotesisSection({
  factores, value, onChange, usoCelular, onUsoCelular,
}: {
  factores: CatalogoItem[];
  value: string[];
  onChange: (v: string[]) => void;
  usoCelular: boolean;
  onUsoCelular: (v: boolean) => void;
}) {
  const [filtro, setFiltro] = useState("");
  const porCodigo = useMemo(() => new Map(factores.map((f) => [f.codigo, f])), [factores]);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const f = norm(filtro.trim());
  const visibles = f ? factores.filter((x) => x.codigo.includes(f) || norm(x.label).includes(f)) : factores;
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);

  const grupos = [
    ...CATEGORIAS_FACTOR,
    { value: "__otros", label: "Otros" },
  ].map((g) => ({
    ...g,
    items: visibles.filter((x) =>
      g.value === "__otros" ? !CATEGORIAS_FACTOR.some((c) => c.value === x.categoria) : x.categoria === g.value
    ),
  }));

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Marca los códigos de tránsito que apliquen. Algunos (exceso de velocidad, distancia, fatiga) alimentan el
        puntaje de la Política de Correctivos.
      </p>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] py-1 pl-2.5 pr-1.5 text-xs text-[#4F46E5]">
              <span className="font-mono">{c}</span> {porCodigo.get(c)?.label ?? ""}
              <button type="button" onClick={() => toggle(c)} aria-label={`Quitar ${c}`} className="rounded-full p-0.5 hover:bg-white">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${usoCelular ? "border-[#4F46E5] bg-[#EEF2FF]" : "border-[#E2E8F0]"}`}>
        <input type="checkbox" checked={usoCelular} onChange={(e) => onUsoCelular(e.target.checked)} className="h-4 w-4" />
        Uso de celular <span className="text-xs text-gray-400">(no tiene código de tránsito)</span>
      </label>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input className={`${inputCls} pl-9`} value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por código o descripción…" />
      </div>

      <div className="max-h-[28rem] space-y-4 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white p-3">
        {grupos.filter((g) => g.items.length > 0).map((g) => (
          <div key={g.value}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{g.label}</p>
            <div className="space-y-1">
              {g.items.map((x) => {
                const on = value.includes(x.codigo);
                return (
                  <label key={x.codigo} className={`flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm ${on ? "bg-[#EEF2FF]" : "hover:bg-[#F8FAFC]"}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(x.codigo)} className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="w-9 shrink-0 font-mono text-gray-500">{x.codigo}</span>
                    <span className="text-gray-800">{x.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {visibles.length === 0 && <p className="text-sm text-gray-400">Sin códigos que coincidan.</p>}
      </div>
    </div>
  );
}

// ── 3. Datos del tercero ────────────────────────────────────────────────────

export function TercerosSection({
  value, onChange, tiposVehiculo, aseguradoras,
}: {
  value: Tercero[];
  onChange: (v: Tercero[]) => void;
  tiposVehiculo: CatalogoItem[];
  aseguradoras: CatalogoItem[];
}) {
  const upd = (i: number, patch: Partial<Tercero>) => onChange(value.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-4">
      {value.length === 0 && <p className="text-sm text-gray-500">Sin vehículos de terceros. Agrega uno si hubo otro vehículo implicado.</p>}
      {value.map((t, i) => (
        <div key={i} className="space-y-4 rounded-lg border border-[#E2E8F0] bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Tercero {i + 1}</p>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-gray-400 hover:text-[#EF4444]" aria-label="Quitar tercero">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Vehículo</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Texto label="Placa" value={t.placa} onChange={(v) => upd(i, { placa: v.toUpperCase() })} />
              <Campo label="Clase de vehículo">
                <select className={inputCls} value={t.clase_vehiculo} onChange={(e) => upd(i, { clase_vehiculo: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {CLASE_VEHICULO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Campo>
              <Campo label="Tipo de vehículo">
                <select className={inputCls} value={t.tipo_vehiculo} onChange={(e) => upd(i, { tipo_vehiculo: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {tiposVehiculo.map((c) => <option key={c.id} value={c.codigo}>{c.label}</option>)}
                  {t.tipo_vehiculo && !tiposVehiculo.some((c) => c.codigo === t.tipo_vehiculo) && (
                    <option value={t.tipo_vehiculo}>{t.tipo_vehiculo}</option>
                  )}
                </select>
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Texto label="Color" value={t.color} onChange={(v) => upd(i, { color: v })} />
                <Texto label="Modelo" value={t.modelo} onChange={(v) => upd(i, { modelo: v })} placeholder="Ej: 2019" />
              </div>
              <Texto className="sm:col-span-2" label="Descripción" value={t.descripcion} onChange={(v) => upd(i, { descripcion: v })} placeholder="Ej: el que nos chocó por detrás" />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Conductor del tercero</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Texto label="Nombre" value={t.conductor_nombre} onChange={(v) => upd(i, { conductor_nombre: v })} />
              <Texto label="Cédula" value={t.conductor_cedula} inputMode="numeric" onChange={(v) => upd(i, { conductor_cedula: v })} />
              <Texto label="Celular" value={t.conductor_celular} inputMode="tel" onChange={(v) => upd(i, { conductor_celular: v })} />
              <Texto label="Dirección" value={t.conductor_direccion} onChange={(v) => upd(i, { conductor_direccion: v })} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Propietario</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Texto label="Nombre" value={t.propietario_nombre} onChange={(v) => upd(i, { propietario_nombre: v })} />
              <Texto label="Teléfono" value={t.propietario_telefono} inputMode="tel" onChange={(v) => upd(i, { propietario_telefono: v })} />
              <Texto label="Dirección" value={t.propietario_direccion} onChange={(v) => upd(i, { propietario_direccion: v })} />
              <Campo label="Aseguradora">
                <input className={inputCls} list={`aseg-terceros-${i}`} value={t.aseguradora} onChange={(e) => upd(i, { aseguradora: e.target.value })} />
                <datalist id={`aseg-terceros-${i}`}>
                  {aseguradoras.map((a) => <option key={a.id} value={a.label} />)}
                </datalist>
              </Campo>
              <Texto label="Afiliado a" value={t.afiliado_a} onChange={(v) => upd(i, { afiliado_a: v })} placeholder="Empresa a la que está afiliado" />
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, terceroVacio()])} className="inline-flex items-center gap-1 text-sm text-[#4F46E5]">
        <Plus className="h-4 w-4" /> Agregar vehículo de tercero
      </button>
    </div>
  );
}

// ── 4. Lesionados o víctimas fatales ────────────────────────────────────────

export function VictimasSection({
  value, onChange, missingNombre,
}: { value: Victima[]; onChange: (v: Victima[]) => void; missingNombre?: boolean }) {
  const upd = (i: number, patch: Partial<Victima>) => onChange(value.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-4">
      {value.map((v, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-[#E2E8F0] bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Persona {i + 1}</p>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-gray-400 hover:text-[#EF4444]" aria-label="Quitar persona">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nombres y apellidos" className="sm:col-span-2">
              <input
                className={`${inputCls} ${missingNombre && !v.nombre.trim() ? "border-[#EF4444]" : ""}`}
                value={v.nombre}
                onChange={(e) => upd(i, { nombre: e.target.value })}
              />
            </Campo>
            <Texto label="N.º de cédula" value={v.cedula} inputMode="numeric" onChange={(x) => upd(i, { cedula: x })} />
            <Texto label="Teléfono" value={v.telefono} inputMode="tel" onChange={(x) => upd(i, { telefono: x })} />
            <Texto label="Dirección" value={v.direccion} onChange={(x) => upd(i, { direccion: x })} />
            <Texto label="Municipio" value={v.municipio} onChange={(x) => upd(i, { municipio: x })} />
            <Campo label="Condición">
              <select className={inputCls} value={v.condicion} onChange={(e) => upd(i, { condicion: e.target.value })}>
                <option value="">Selecciona…</option>
                {CONDICION_VICTIMA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Campo>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-900">
              <input type="checkbox" checked={v.fallecido} onChange={(e) => upd(i, { fallecido: e.target.checked })} className="h-4 w-4" />
              Víctima fatal
            </label>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, victimaVacia()])} className="inline-flex items-center gap-1 text-sm text-[#4F46E5]">
        <Plus className="h-4 w-4" /> Agregar lesionado o víctima
      </button>
    </div>
  );
}

// ── 5. Agente de tránsito ───────────────────────────────────────────────────

export function AgenteSection({ value, onChange }: { value: Agente; onChange: (v: Agente) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Texto label="Agente que atendió" value={value.nombre} onChange={(v) => onChange({ ...value, nombre: v })} />
      <Texto label="Placa del agente" value={value.placa} onChange={(v) => onChange({ ...value, placa: v })} />
      <Texto label="Celular" value={value.celular} inputMode="tel" onChange={(v) => onChange({ ...value, celular: v })} />
    </div>
  );
}
