"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Download, Eye, FileText, ImageIcon, Loader2, Paperclip, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { VehiculoLiquidado } from "@/lib/tesoreria/liquidacion-afiliados";
import {
  ESTADO_RESPALDO_LABEL, ETIQUETA_TIPO, SOPORTE_ACCEPT, SOPORTE_LIMITE_BYTES, TIPOS_SOPORTE, cruzarObligaciones,
  tamanoLegible, type EstadoRespaldo, type SoporteVista, type TipoSoporte,
} from "@/lib/tesoreria/soportes-reglas";
import { pesos } from "@/lib/tesoreria/formato-liquidacion";

/** Acción de servidor para anular; solo la recibe Tesorería (el portal no la importa). */
export type AnularSoporte = (id: string, motivo: string) => Promise<{ ok: true } | { ok: false; error: string }>;

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const botonCls =
  "inline-flex h-8 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50";

const ESTILO_RESPALDO: Record<EstadoRespaldo, string> = {
  soportado: "bg-[#D1FAE5] text-[#047857]",
  parcial: "bg-[#FEF3C7] text-[#92400E]",
  sin_soporte: "bg-[#FEE2E2] text-[#B91C1C]",
  solo_soporte: "bg-[#F1F5F9] text-[#475569]",
};

/**
 * Soportes de los descuentos de una buseta: cruce del pago de obligaciones
 * contra los soportes, la lista de archivos y (solo Tesorería) la carga.
 */
export function SoportesVehiculo({ v, cedula, soportes, modo, puedeSubir, disponible, anular }: {
  v: VehiculoLiquidado;
  cedula: string;
  soportes: SoporteVista[];
  modo: "tesoreria" | "portal";
  puedeSubir: boolean;
  disponible: boolean;
  anular?: AnularSoporte;
}) {
  const portal = modo === "portal";
  const cruce = useMemo(() => cruzarObligaciones(v.filas, soportes), [v.filas, soportes]);
  const [abierto, setAbierto] = useState(false);
  const [fechaInicial, setFechaInicial] = useState<string | null>(null);
  const url = (s: SoporteVista, descargar: boolean) =>
    `${portal ? "/portal-afiliados/soporte" : "/api/tesoreria/liquidacion-afiliados/soportes"}/${s.id}${descargar ? "?descargar=1" : ""}`;

  if (!disponible && portal) return null;
  const subir = !portal && puedeSubir && disponible && !!anular;
  const abrirCarga = (fecha: string | null) => { setFechaInicial(fecha); setAbierto(true); };

  return (
    <div className="border-t border-[#F1F5F9] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Paperclip className="h-4 w-4 text-gray-500" /> Soportes de descuentos
          <span className="text-xs font-normal text-gray-500">({soportes.length})</span>
        </h3>
        {subir && !abierto && (
          <button type="button" onClick={() => abrirCarga(null)} className={botonCls}>
            <Upload className="h-3.5 w-3.5" /> Subir soporte
          </button>
        )}
      </div>
      {!disponible && (
        <p className="mt-2 text-xs text-[#92400E]">Falta aplicar la migración 20260925223057 para subir soportes.</p>
      )}

      {cruce.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1.5 pr-3">Fecha</th>
                <th className="py-1.5 pr-3 text-right">Pago obligaciones (GEMA)</th>
                <th className="py-1.5 pr-3 text-right">Soportado</th>
                <th className="py-1.5 pr-3">Respaldo</th>
                {subir && <th className="py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {cruce.map((c) => (
                <tr key={c.fecha} className="border-b border-[#F1F5F9]">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-gray-700">{c.fecha}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-900">{pesos(c.descuento)}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-700">
                    {c.soportes ? `${pesos(c.soportado)} · ${c.soportes} archivo${c.soportes === 1 ? "" : "s"}` : "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ESTILO_RESPALDO[c.estado]}`}>
                      {ESTADO_RESPALDO_LABEL[c.estado]}
                    </span>
                  </td>
                  {subir && (
                    <td className="py-1.5 text-right">
                      {c.estado !== "soportado" && c.descuento > 0 && (
                        <button type="button" onClick={() => abrirCarga(c.fecha)} className={botonCls}>
                          <Upload className="h-3.5 w-3.5" /> Soportar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subir && abierto && (
        <FormularioSoporte v={v} cedula={cedula} fechaInicial={fechaInicial} onCerrar={() => setAbierto(false)} />
      )}

      {soportes.length > 0 ? (
        <ul className="mt-3 divide-y divide-[#F1F5F9] rounded-lg border border-[#E2E8F0]">
          {soportes.map((s) => (
            <FilaSoporte key={s.id} s={s} verUrl={url(s, false)} bajarUrl={url(s, true)} anular={subir ? anular : undefined} />
          ))}
        </ul>
      ) : disponible && (
        <p className="mt-2 text-xs text-gray-500">
          {portal ? "Tesorería aún no ha cargado soportes para esta buseta en este periodo." : "Sin soportes en este periodo."}
        </p>
      )}
    </div>
  );
}

function FilaSoporte({ s, verUrl, bajarUrl, anular: anularAccion }: { s: SoporteVista; verUrl: string; bajarUrl: string; anular?: AnularSoporte }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  function anular() {
    const motivo = window.prompt(`Motivo para anular «${s.archivoNombre}» (el afiliado dejará de verlo):`);
    if (motivo === null || !anularAccion) return;
    start(async () => {
      const r = await anularAccion(s.id, motivo);
      if (r.ok) { toast.success("Soporte anulado"); router.refresh(); }
      else toast.error(r.error);
    });
  }
  const Icono = s.archivoMime === "application/pdf" ? FileText : ImageIcon;
  return (
    <li className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
      <Icono className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900">
          {s.concepto}
          {s.valor !== null && <span className="ml-2 text-gray-700">{pesos(s.valor)}</span>}
        </p>
        <p className="text-xs text-gray-500">
          {s.fecha} · {ETIQUETA_TIPO[s.tipo]} · <span className="break-all">{s.archivoNombre}</span> ({tamanoLegible(s.archivoTamano)})
        </p>
      </div>
      </div>
      <div className="flex gap-1.5">
        <a href={verUrl} target="_blank" rel="noopener noreferrer" className={botonCls}><Eye className="h-3.5 w-3.5" /> Ver</a>
        <a href={bajarUrl} className={botonCls}><Download className="h-3.5 w-3.5" /> Descargar</a>
        {anularAccion && (
          <button type="button" onClick={anular} disabled={pendiente} className={`${botonCls} text-[#B91C1C]`}>
            {pendiente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Anular
          </button>
        )}
      </div>
    </li>
  );
}

/** Carga de soportes: los archivos se envían de a uno (límite de Vercel por petición). */
function FormularioSoporte({ v, cedula, fechaInicial, onCerrar }: {
  v: VehiculoLiquidado;
  cedula: string;
  fechaInicial: string | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const fechas = useMemo(() => [...new Set(v.filas.map((f) => f.fecha))].sort().reverse(), [v.filas]);
  const conDescuento = useMemo(
    () => v.filas.filter((f) => Number(f.descuentos_otros ?? 0) > 0).map((f) => f.fecha).sort().reverse()[0] ?? null,
    [v.filas],
  );
  const [fecha, setFecha] = useState(fechaInicial ?? conDescuento ?? fechas[0] ?? "");
  const [tipo, setTipo] = useState<TipoSoporte>("obligaciones");
  const [concepto, setConcepto] = useState("");
  const [valor, setValor] = useState("");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const grandes = archivos.filter((a) => a.size > SOPORTE_LIMITE_BYTES);
  const listo = fecha && concepto.trim().length >= 3 && archivos.length > 0 && grandes.length === 0 && !enviando;

  async function enviar() {
    let ok = 0;
    for (const [i, a] of archivos.entries()) {
      setEnviando(`${i + 1} de ${archivos.length}: ${a.name}`);
      const f = new FormData();
      f.set("cedula", cedula);
      f.set("vehiculo", v.codigo);
      f.set("fecha", fecha);
      f.set("tipo", tipo);
      // Con varios archivos, cada uno lleva su nombre en el concepto para distinguirlos.
      f.set("concepto", archivos.length > 1 ? `${concepto.trim()} (${a.name})`.slice(0, 200) : concepto.trim());
      // El valor se asigna al primero para no sumarlo varias veces en el cruce.
      if (valor && i === 0) f.set("valor", valor);
      f.set("archivo", a);
      try {
        const r = await fetch("/api/tesoreria/liquidacion-afiliados/soportes", { method: "POST", body: f });
        const j = (await r.json().catch(() => ({ ok: false, error: `Error ${r.status}` }))) as { ok: boolean; error?: string };
        if (j.ok) ok++;
        else toast.error(j.error ?? `No se pudo subir ${a.name}`);
      } catch {
        toast.error(`No se pudo subir ${a.name}`);
      }
    }
    setEnviando(null);
    if (ok) {
      toast.success(`${ok} soporte${ok === 1 ? "" : "s"} cargado${ok === 1 ? "" : "s"}`);
      router.refresh();
      onCerrar();
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF]/40 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Fecha
          <select value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls}>
            {fechas.map((f) => <option key={f} value={f}>{f}{f === conDescuento ? " · con pago de obligaciones" : ""}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoSoporte)} className={inputCls}>
            {TIPOS_SOPORTE.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-gray-600">
          Concepto
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={180}
            placeholder="Ej.: PAG FACT FE3789 · parqueadero agosto" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Valor (opcional)
          <input inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0" className={`${inputCls} w-36 text-right`} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" multiple accept={SOPORTE_ACCEPT} className="hidden"
          onChange={(e) => setArchivos([...(e.target.files ?? [])])} />
        <button type="button" onClick={() => input.current?.click()} className={botonCls}>
          <Paperclip className="h-3.5 w-3.5" /> Escoger archivos
        </button>
        <span className="text-xs text-gray-600">
          {archivos.length
            ? archivos.map((a) => `${a.name} (${tamanoLegible(a.size)})`).join(", ")
            : "PDF o imagen (JPG, PNG, WebP), máximo 4 MB cada uno."}
        </span>
      </div>
      {grandes.length > 0 && (
        <p className="text-xs text-[#B91C1C]">Superan 4 MB: {grandes.map((a) => a.name).join(", ")}. Redúzcalos o escanéelos en menor resolución.</p>
      )}
      <p className="text-[11px] text-gray-500">
        El afiliado verá y podrá descargar estos archivos en su portal. Con valor y tipo «Pago de obligaciones», el soporte
        cuenta en el cruce contra el descuento de GEMA de ese día.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={enviar} disabled={!listo}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-3 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {enviando ? `Subiendo ${enviando}` : `Subir ${archivos.length || ""} soporte${archivos.length === 1 ? "" : "s"}`}
        </button>
        <button type="button" onClick={onCerrar} disabled={!!enviando} className={botonCls}><X className="h-3.5 w-3.5" /> Cancelar</button>
      </div>
    </div>
  );
}
