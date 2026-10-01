"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, FileSpreadsheet, Loader2, Printer } from "lucide-react";
import {
  ETIQUETA_ESTADO_DIA, type AvanceDia, type Consolidado, type EstadoDia, type FilaPorEstado, type FilaPorRevisor,
} from "@/lib/tesoreria/revision-timbradas-consolidado";
import { sumarDias } from "@/lib/tesoreria/calendario-pago";
import { TablaFiltrable, type ColumnaTabla } from "../tabla-filtrable";

const nf = new Intl.NumberFormat("es-CO");
const fechaHora = (s: string | null) => (s ? new Date(s).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "");
const diaSemana = (f: string) =>
  new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${f}T00:00:00Z`));

const CHIP_DIA: Record<EstadoDia, string> = {
  cerrado: "bg-emerald-100 text-emerald-800 border-emerald-200",
  completo: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sin_pendientes: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reabierto: "bg-amber-100 text-amber-900 border-amber-300",
  en_curso: "bg-amber-50 text-amber-800 border-amber-200",
  sin_revisar: "bg-red-100 text-red-800 border-red-200",
  sin_calculo: "bg-slate-100 text-slate-600 border-slate-200",
};
const FILA_DIA: Partial<Record<EstadoDia, string>> = { sin_revisar: "bg-red-50/60", reabierto: "bg-amber-50/60", en_curso: "bg-amber-50/30" };

const esc = (s: unknown) =>
  s == null ? "" : String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function ConsolidadoClient({
  desde, hasta, ayer, inicio, consolidado: c, disponible, error, aviso, usuario,
}: {
  desde: string;
  hasta: string;
  ayer: string;
  inicio: string;
  consolidado: Consolidado;
  disponible: boolean;
  error: string | null;
  aviso: string | null;
  usuario: string | null;
}) {
  const router = useRouter();
  const [navegando, startNav] = useTransition();
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);
  const ir = (a: string, b: string) => startNav(() => router.push(`/tesoreria/revision-cartulina/consolidado?desde=${a}&hasta=${b}`, { scroll: false }));
  const abrirDia = (f: string, pendientes: boolean) => router.push(`/tesoreria/revision-cartulina?fecha=${f}${pendientes ? "&pendientes=1" : ""}`);

  const mesDe = (f: string) => f.slice(0, 7);
  const finDeMes = (m: string) => { const [y, mm] = m.split("-").map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
  const mesAnterior = (() => { const [y, m] = mesDe(ayer).split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; })();
  const presets: [string, string, string][] = [
    ["Últimos 7 días", sumarDias(ayer, -6), ayer],
    ["Este mes", `${mesDe(ayer)}-01`, ayer],
    ["Mes anterior", `${mesAnterior}-01`, finDeMes(mesAnterior)],
  ];

  const presetActivo = presets.findIndex(([, a, b]) => desde === (a < inicio ? inicio : a) && hasta === b);
  const t = c.totales;

  function imprimirActa() {
    const filas = c.dias.map((x) =>
      `<tr><td>${esc(x.fecha)}</td><td>${esc(ETIQUETA_ESTADO_DIA[x.estadoDia])}</td><td class="n">${x.porRevisar}</td><td class="n">${x.revisados}</td>` +
      `<td class="n">${x.pendientes}</td><td class="n">${x.avance} %</td><td>${esc(x.cierre?.cerradoPorEmail ?? "")}</td><td>${esc(fechaHora(x.cierre?.cerradoAt ?? null))}</td></tr>`).join("");
    const revs = c.porRevisor.map((r) => `<tr><td>${esc(r.email)}</td><td class="n">${r.checks}</td><td class="n">${r.dias}</td><td class="n">${r.diasCerrados}</td></tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) { toast.error("El navegador bloqueó la ventana del acta."); return; }
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acta consolidada ${c.desde} a ${c.hasta}</title>
<style>body{font:12px system-ui,sans-serif;margin:24px;color:#0f172a}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 4px}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}th{background:#f1f5f9}.n{text-align:right}
.firma{margin-top:48px;display:flex;gap:48px}.firma div{border-top:1px solid #0f172a;padding-top:4px;min-width:240px}</style></head><body>
<h1>Acta consolidada de revisión de timbradas — ${esc(c.desde)} a ${esc(c.hasta)}</h1>
<p>Generada en Gestivo el ${esc(new Date().toLocaleString("es-CO"))}. Viajes por revisar: ${t.porRevisar} · revisados: ${t.revisados} (${t.avance} %) · pendientes: ${t.pendientes} · días cerrados: ${t.diasCerrados} de ${t.dias}.</p>
<h2>Avance por día</h2><table><thead><tr><th>Fecha</th><th>Estado</th><th>Por revisar</th><th>Revisados</th><th>Pendientes</th><th>Avance</th><th>Cerró</th><th>Cierre</th></tr></thead><tbody>${filas}</tbody></table>
<h2>Por revisor</h2><table><thead><tr><th>Revisor</th><th>Checks</th><th>Días</th><th>Días cerrados</th></tr></thead><tbody>${revs || '<tr><td colspan="4">Sin checks en el periodo.</td></tr>'}</tbody></table>
<div class="firma"><div>Revisó: ${esc(usuario ?? "")}</div><div>Aprobó</div></div>
<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  const colDias: ColumnaTabla<AvanceDia>[] = [
    { clave: "fecha", titulo: "Fecha", tipo: "texto", valor: (x) => x.fecha, claseCelda: "whitespace-nowrap px-2 py-1.5 font-semibold",
      render: (x) => <span>{x.fecha} <span className="font-normal text-text-tertiary">{diaSemana(x.fecha)}</span></span> },
    { clave: "estado", titulo: "Estado del día", tipo: "lista", valor: (x) => ETIQUETA_ESTADO_DIA[x.estadoDia], claseCelda: "px-2 py-1.5",
      render: (x) => <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${CHIP_DIA[x.estadoDia]}`}>{ETIQUETA_ESTADO_DIA[x.estadoDia]}</span> },
    { clave: "viajes", titulo: "Viajes", tipo: "numero", valor: (x) => x.totalViajes },
    { clave: "porrevisar", titulo: "Por revisar", tipo: "numero", valor: (x) => x.porRevisar },
    { clave: "revisados", titulo: "Revisados ✓", tipo: "numero", valor: (x) => x.revisados },
    { clave: "pendientes", titulo: "Pendientes", tipo: "numero", valor: (x) => x.pendientes,
      claseCelda: (x) => `whitespace-nowrap px-2 py-1.5 tabular-nums ${x.pendientes ? "font-bold text-red-700" : ""}` },
    { clave: "nuevos", titulo: "Nuevos tras cierre", tipo: "numero", valor: (x) => x.nuevosTrasCierre, ayuda: "Viajes que entraron a revisión después del cierre (GEMA cambió datos)",
      render: (x) => (x.nuevosTrasCierre ? x.nuevosTrasCierre : "") },
    { clave: "avance", titulo: "Avance %", tipo: "numero", valor: (x) => x.avance, claseCelda: "px-2 py-1.5",
      render: (x) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500" style={{ width: `${x.avance}%` }} /></div>
          <span className="whitespace-nowrap tabular-nums">{x.avance} %</span>
        </div>
      ) },
    { clave: "dif", titulo: "Diferencias pend.", tipo: "numero", valor: (x) => x.pendientesPorEstado["Diferencia Por Revisar"] ?? 0,
      render: (x) => x.pendientesPorEstado["Diferencia Por Revisar"] || "" },
    { clave: "alertas", titulo: "Alertas", tipo: "numero", valor: (x) => x.alertas },
    { clave: "revisores", titulo: "Revisó", tipo: "texto", valor: (x) => x.revisores.join(", "), claseCelda: "max-w-[220px] truncate px-2 py-1.5" },
    { clave: "ultimo", titulo: "Último check", tipo: "texto", valor: (x) => x.ultimoCheck, render: (x) => fechaHora(x.ultimoCheck) },
    { clave: "cierre", titulo: "Cerrado por", tipo: "texto", valor: (x) => x.cierre?.cerradoPorEmail ?? null,
      render: (x) => (x.cierre ? <span title={fechaHora(x.cierre.cerradoAt)}>{x.cierre.cerradoPorEmail}</span> : "") },
    { clave: "ir", titulo: "", tipo: "texto", fija: true, valor: () => null, claseCelda: "whitespace-nowrap px-2 py-1.5",
      render: (x) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); abrirDia(x.fecha, x.pendientes > 0); }} className="text-primary hover:underline">
          {x.pendientes > 0 ? "Ver pendientes" : "Abrir día"}
        </button>
      ) },
  ];

  const colEstados: ColumnaTabla<FilaPorEstado>[] = [
    { clave: "estado", titulo: "Estado", tipo: "texto", valor: (x) => x.estado, claseCelda: "whitespace-nowrap px-2 py-1.5 font-medium" },
    { clave: "porrevisar", titulo: "Por revisar", tipo: "numero", valor: (x) => x.porRevisar },
    { clave: "revisados", titulo: "Revisados ✓", tipo: "numero", valor: (x) => x.revisados },
    { clave: "pendientes", titulo: "Pendientes", tipo: "numero", valor: (x) => x.pendientes,
      claseCelda: (x) => `whitespace-nowrap px-2 py-1.5 tabular-nums ${x.pendientes ? "font-bold text-red-700" : ""}` },
    { clave: "avance", titulo: "Avance %", tipo: "numero", valor: (x) => x.avance, render: (x) => `${x.avance} %` },
  ];

  const colRevisores: ColumnaTabla<FilaPorRevisor>[] = [
    { clave: "email", titulo: "Revisor", tipo: "texto", valor: (x) => x.email, claseCelda: "whitespace-nowrap px-2 py-1.5 font-medium" },
    { clave: "checks", titulo: "Checks", tipo: "numero", valor: (x) => x.checks },
    { clave: "dias", titulo: "Días con checks", tipo: "numero", valor: (x) => x.dias },
    { clave: "cerrados", titulo: "Días cerrados", tipo: "numero", valor: (x) => x.diasCerrados },
    { clave: "primero", titulo: "Primer check", tipo: "texto", valor: (x) => x.primerCheck, render: (x) => (x.checks ? fechaHora(x.primerCheck) : "") },
    { clave: "ultimo", titulo: "Último check", tipo: "texto", valor: (x) => x.ultimoCheck, render: (x) => (x.checks ? fechaHora(x.ultimoCheck) : "") },
  ];

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map(([l, a, b], i) => (
            <button
              key={l} type="button" onClick={() => ir(a < inicio ? inicio : a, b)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${i === presetActivo ? "border-primary bg-primary text-white" : "border-border bg-white hover:bg-slate-50"}`}
            >
              {l}
            </button>
          ))}
          <input type="date" value={d} min={inicio} max={ayer} onChange={(e) => setD(e.target.value)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm" aria-label="Desde" />
          <span className="text-text-tertiary">a</span>
          <input type="date" value={h} min={inicio} max={ayer} onChange={(e) => setH(e.target.value)} className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm" aria-label="Hasta" />
          <button type="button" onClick={() => d && h && ir(d, h)} className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Ver</button>
          {navegando && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/tesoreria/revision-timbradas/consolidado/export?desde=${desde}&hasta=${hasta}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
          </a>
          <button type="button" onClick={imprimirActa} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
            <Printer className="h-4 w-4 text-slate-600" /> Acta del periodo
          </button>
        </div>
      </div>

      {!disponible && (
        <Aviso>El consolidado aún no está disponible: falta aplicar la migración de fotos y cierres{error ? ` (${error})` : ""}.</Aviso>
      )}
      {aviso && <Aviso>{aviso}</Aviso>}
      {t.diasSinCalcular > 0 && disponible && (
        <Aviso>
          {t.diasSinCalcular} día(s) del periodo aún no tienen cálculo guardado: se llenan solos con la tarea diaria o al abrir ese día en la Revisión del día.
        </Aviso>
      )}
      <p className="text-xs text-text-tertiary">
        La revisión en Gestivo empezó el {inicio}; los días anteriores se revisaron con el informe de Tesorería. Un viaje cuenta como revisado si tiene check y
        sigue por revisar en el último cálculo.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi valor={`${t.avance} %`} etiqueta="Avance del periodo" detalle={`${nf.format(t.revisados)} de ${nf.format(t.porRevisar)} viajes`} tono="border-emerald-200 bg-emerald-50 text-emerald-900" />
        <Kpi valor={nf.format(t.pendientes)} etiqueta="Viajes pendientes" detalle={t.nuevosTrasCierre ? `${t.nuevosTrasCierre} nuevos tras cierre` : undefined}
          tono={t.pendientes ? "border-red-200 bg-red-50 text-red-900" : "border-slate-200 bg-white text-text-primary"} />
        <Kpi valor={`${t.diasCerrados}`} etiqueta="Días cerrados" detalle={`de ${t.dias} días`} tono="border-emerald-200 bg-white text-emerald-900" />
        <Kpi valor={`${t.diasCompletos}`} etiqueta="Completos sin cerrar" detalle="100 % con check" tono="border-emerald-100 bg-white text-emerald-800" />
        <Kpi valor={`${t.diasConPendientes}`} etiqueta="Días con pendientes" tono={t.diasConPendientes ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-text-primary"} />
        <Kpi valor={`${c.porRevisor.length}`} etiqueta="Revisores" detalle={c.porRevisor.map((r) => r.email.split("@")[0]).slice(0, 3).join(", ")} tono="border-slate-200 bg-white text-text-primary" />
      </div>

      <section className="min-w-0 space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Avance por día</h2>
        <TablaFiltrable
          id="timbradas-consolidado-dias"
          filas={c.dias} columnas={colDias} claveFila={(x) => x.fecha} onFila={(x) => abrirDia(x.fecha, x.pendientes > 0)}
          claseFila={(x) => FILA_DIA[x.estadoDia] ?? ""} vacio="No hay días en el periodo."
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="min-w-0 space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">Por estado</h2>
          <TablaFiltrable id="timbradas-consolidado-estados" filas={c.porEstado} columnas={colEstados} claveFila={(x) => x.estado} />
        </section>
        <section className="min-w-0 space-y-2">
          <h2 className="text-sm font-semibold text-text-primary">Por revisor</h2>
          <TablaFiltrable id="timbradas-consolidado-revisores" filas={c.porRevisor} columnas={colRevisores} claveFila={(x) => x.email} vacio="Sin checks en el periodo." />
        </section>
      </div>
    </div>
  );
}

function Kpi({ valor, etiqueta, detalle, tono }: { valor: string; etiqueta: string; detalle?: string; tono: string }) {
  return (
    <div className={`rounded-xl border p-3 ${tono}`}>
      <div className="text-2xl font-bold tabular-nums">{valor}</div>
      <div className="text-xs font-medium leading-tight">{etiqueta}</div>
      {detalle && <div className="text-[11px] opacity-70">{detalle}</div>}
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
