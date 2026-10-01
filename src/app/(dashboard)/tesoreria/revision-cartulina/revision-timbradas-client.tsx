"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, Info, Loader2, Printer, Search, X,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { MarcaRevision, RevisionDia } from "@/lib/tesoreria/revision-timbradas-data";
import {
  ACCION_REQUERIDA, ESTADOS, ETIQUETAS, FECHA_CAMBIO_TABLA, RESULTADOS_REVISION, TIPO_ACTUALIZACION_CONTEO,
  TIPO_BONO_NOCTURNO, UMBRAL_SB, conteoPorEstado, esAlerta, etiquetasDe, ordenarAlertas, ordenarFilas,
  requiereRevision, resumenPorPlaca, sbAlta, tablasDelDia, textoTramo, totalesSubidasBajadas,
  type ClaveEtiqueta, type EstadoTimbrada, type FilaRevision, type ResultadoRevision,
} from "@/lib/tesoreria/revision-timbradas-reglas";
import { sumarDias } from "@/lib/tesoreria/calendario-pago";
import { marcarViajeRevisado, quitarRevisionViaje } from "./actions";

const nf = new Intl.NumberFormat("es-CO");
const fmt = (n: number | null | undefined) => (n == null ? "" : nf.format(n));
const conSigno = (n: number) => (n > 0 ? `+${nf.format(n)}` : nf.format(n));

/** Colores por estado (mismos tonos del informe de Tesorería). */
const ESTILO: Record<EstadoTimbrada, { fila: string; chip: string; corto: string }> = {
  "Diferencia Por Revisar": { fila: "bg-red-50", chip: "bg-red-100 text-red-800 border-red-200", corto: "Diferencia" },
  "Sin Recaudo - Con Timbradas": { fila: "bg-sky-50", chip: "bg-sky-100 text-sky-800 border-sky-200", corto: "Sin recaudo" },
  "Revisar - Cartulina Con PV": { fila: "bg-amber-50", chip: "bg-amber-100 text-amber-800 border-amber-200", corto: "Cartulina vs PV" },
  "Revisar - Sin Datos PV": { fila: "bg-slate-50", chip: "bg-slate-100 text-slate-700 border-slate-200", corto: "Sin datos PV" },
  "Revisar - Datos Incompletos": { fila: "bg-orange-50", chip: "bg-orange-100 text-orange-800 border-orange-200", corto: "Datos incompletos" },
  OK: { fila: "", chip: "bg-emerald-100 text-emerald-800 border-emerald-200", corto: "OK" },
  "N/A - No Despachado": { fila: "bg-slate-50/60 text-text-tertiary", chip: "bg-slate-200 text-slate-600 border-slate-300", corto: "No despachado" },
};

type Pestana = "revisar" | "alertas" | "todos" | "placa";
type FiltroRevision = "" | "pendientes" | "revisados";

function fechaLarga(f: string) {
  const s = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${f}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const escHtml = (s: unknown) =>
  s == null ? "" : String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function RevisionTimbradasClient({
  fecha, hoy, revision, error, marcasIniciales, evidenciaDisponible, puedeRevisar, revisor,
}: {
  fecha: string;
  hoy: string;
  revision: RevisionDia | null;
  error: string | null;
  marcasIniciales: MarcaRevision[];
  evidenciaDisponible: boolean;
  puedeRevisar: boolean;
  revisor: string | null;
}) {
  const router = useRouter();
  const [navegando, startNav] = useTransition();
  const [marcas, setMarcas] = useState(() => new Map(marcasIniciales.map((m) => [m.numero, m])));
  const [pestana, setPestana] = useState<Pestana>("revisar");
  const [estado, setEstado] = useState<EstadoTimbrada | "">("");
  const [etiquetas, setEtiquetas] = useState<Set<ClaveEtiqueta>>(new Set());
  const [filtroRev, setFiltroRev] = useState<FiltroRevision>("");
  const [q, setQ] = useState("");
  const [placa, setPlaca] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<FilaRevision | null>(null);

  const ir = (f: string) => startNav(() => router.push(`/tesoreria/revision-cartulina?fecha=${f}`, { scroll: false }));

  const filas = useMemo(() => (revision ? ordenarFilas(revision.filas) : []), [revision]);
  const conteo = useMemo(() => conteoPorEstado(filas), [filas]);
  const porRevisar = useMemo(() => filas.filter(requiereRevision), [filas]);
  const alertas = useMemo(() => ordenarAlertas(filas.filter(esAlerta)), [filas]);
  const sb = useMemo(() => totalesSubidasBajadas(filas), [filas]);
  const placas = useMemo(() => resumenPorPlaca(filas), [filas]);
  const revisadosPendientes = porRevisar.filter((f) => marcas.has(f.numero)).length;

  const base = pestana === "alertas" ? alertas : pestana === "revisar" ? porRevisar : filas;
  const visibles = useMemo(() => {
    const t = q.trim().toUpperCase();
    return base.filter((f) => {
      if (estado && f.estado !== estado) return false;
      if (placa && f.placa !== placa) return false;
      if (filtroRev === "pendientes" && marcas.has(f.numero)) return false;
      if (filtroRev === "revisados" && !marcas.has(f.numero)) return false;
      if (etiquetas.size) {
        const de = etiquetasDe(f);
        for (const e of etiquetas) if (!de.includes(e)) return false;
      }
      if (t && !`${f.placa} ${f.vehiculo ?? ""} ${f.conductor ?? ""} ${f.codConductor ?? ""} ${f.numero}`.toUpperCase().includes(t)) return false;
      return true;
    });
  }, [base, estado, placa, filtroRev, marcas, etiquetas, q]);

  const conteoEtiquetas = useMemo(() => {
    const c = {} as Record<ClaveEtiqueta, number>;
    for (const e of ETIQUETAS) c[e.clave] = 0;
    for (const f of base) for (const e of etiquetasDe(f)) c[e]++;
    return c;
  }, [base]);

  function elegirEstado(e: EstadoTimbrada) {
    setEstado((a) => (a === e ? "" : e));
    if (e === "OK" || e === "N/A - No Despachado") setPestana("todos");
    else if (pestana === "placa") setPestana("revisar");
  }
  function alternarEtiqueta(k: ClaveEtiqueta) {
    setEtiquetas((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }
  const hayFiltros = !!(estado || placa || filtroRev || etiquetas.size || q);
  const limpiar = () => { setEstado(""); setPlaca(null); setFiltroRev(""); setEtiquetas(new Set()); setQ(""); };

  function imprimirActa() {
    if (!revision) return;
    const revisadas = filas.filter((f) => marcas.has(f.numero));
    const filasHtml = revisadas.map((f) => {
      const m = marcas.get(f.numero)!;
      return `<tr><td>${escHtml(f.placa)}</td><td>${escHtml(f.vehiculo)}</td><td>${f.viaje}</td><td>${escHtml(f.horaSalida)}</td>` +
        `<td>${escHtml(f.conductor)}</td><td>${escHtml(f.estado)}</td><td>${escHtml(m.resultado)}</td><td>${escHtml(m.nota)}</td>` +
        `<td>${escHtml(m.revisadoPorEmail)}</td><td>${escHtml(new Date(m.revisadoAt).toLocaleString("es-CO"))}</td></tr>`;
    }).join("");
    const resumen = ESTADOS.map((e) => `<tr><td>${escHtml(e)}</td><td style="text-align:right">${conteo[e]}</td></tr>`).join("");
    const w = window.open("", "_blank");
    if (!w) { toast.error("El navegador bloqueó la ventana del acta."); return; }
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Acta revisión de timbradas ${fecha}</title>
<style>body{font:12px system-ui,sans-serif;margin:24px;color:#0f172a}h1{font-size:18px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f1f5f9}.firma{margin-top:48px;display:flex;gap:48px}
.firma div{border-top:1px solid #0f172a;padding-top:4px;min-width:240px}</style></head><body>
<h1>Acta de revisión de timbradas — ${escHtml(fechaLarga(fecha))}</h1>
<p>Generada en Gestivo el ${escHtml(new Date().toLocaleString("es-CO"))}. Viajes por revisar: ${porRevisar.length} · revisados: ${revisadosPendientes} · alertas: ${alertas.length}.</p>
<table><thead><tr><th>Estado</th><th>Viajes</th></tr></thead><tbody>${resumen}</tbody></table>
<h2 style="font-size:14px">Viajes revisados (${revisadas.length})</h2>
<table><thead><tr><th>Placa</th><th>Veh.</th><th>Viaje</th><th>Salida</th><th>Conductor</th><th>Estado</th><th>Resultado</th><th>Nota</th><th>Revisó</th><th>Fecha</th></tr></thead>
<tbody>${filasHtml || '<tr><td colspan="10">Sin viajes revisados.</td></tr>'}</tbody></table>
<div class="firma"><div>Revisó: ${escHtml(revisor ?? "")}</div><div>Aprobó</div></div>
<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      {/* Fecha y acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => ir(sumarDias(fecha, -1))} className="rounded-lg border border-border bg-white p-2 hover:bg-slate-50" aria-label="Día anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => e.target.value && ir(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm"
            aria-label="Fecha del viaje"
          />
          <button
            type="button" onClick={() => ir(sumarDias(fecha, 1))} disabled={fecha >= hoy}
            className="rounded-lg border border-border bg-white p-2 hover:bg-slate-50 disabled:opacity-40" aria-label="Día siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="text-sm text-text-secondary">{fechaLarga(fecha)}</span>
          {navegando && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>
        {revision && (
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/tesoreria/revision-timbradas/export?fecha=${fecha}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
            </a>
            <button
              type="button" onClick={imprimirActa}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            >
              <Printer className="h-4 w-4 text-slate-600" /> Acta
            </button>
          </div>
        )}
      </div>

      {error && (
        <Aviso tono="rojo">No se pudo calcular la revisión: {error}</Aviso>
      )}
      {!evidenciaDisponible && (
        <Aviso tono="ambar">
          La evidencia de revisión aún no está disponible (falta aplicar la migración). La revisión se calcula y se exporta igual,
          pero no se pueden marcar viajes.
        </Aviso>
      )}
      {revision?.cobertura.avisos.map((a) => <Aviso key={a} tono="ambar">{a}</Aviso>)}

      {revision && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {ESTADOS.map((e) => (
              <button
                key={e} type="button" onClick={() => elegirEstado(e)}
                className={`rounded-xl border p-3 text-left transition ${ESTILO[e].chip} ${estado === e ? "ring-2 ring-primary" : "hover:brightness-95"}`}
                title={ACCION_REQUERIDA[e]}
              >
                <div className="text-2xl font-bold tabular-nums">{nf.format(conteo[e])}</div>
                <div className="text-xs font-medium leading-tight">{ESTILO[e].corto}</div>
                <div className="text-[11px] opacity-70">{filas.length ? ((100 * conteo[e]) / filas.length).toFixed(1) : "0"} %</div>
              </button>
            ))}
            <button
              type="button" onClick={() => { setEtiquetas(new Set(["sb"])); setPestana("todos"); setEstado(""); }}
              className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-left text-violet-800 hover:brightness-95"
              title={`Subidas − bajadas del contador de puertas en los viajes con PV. Clic: viajes con |dif| > ${UMBRAL_SB}`}
            >
              <div className="text-2xl font-bold tabular-nums">{conSigno(sb.dif)}</div>
              <div className="text-xs font-medium leading-tight">Subidas − bajadas</div>
              <div className="text-[11px] opacity-70">{sb.viajesAltos} viajes &gt; {UMBRAL_SB}</div>
            </button>
          </div>

          <ResumenDia revision={revision} porRevisar={porRevisar.length} revisados={revisadosPendientes} alertas={alertas.length} />

          {/* Pestañas */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-border bg-white">
              {([
                ["revisar", `Por revisar (${porRevisar.length})`],
                ["alertas", `Alertas (${alertas.length})`],
                ["todos", `Todos (${filas.length})`],
                ["placa", `Por placa (${placas.length})`],
              ] as const).map(([k, l]) => (
                <button
                  key={k} type="button" onClick={() => setPestana(k)}
                  className={`px-3 py-1.5 text-sm font-medium ${pestana === k ? "bg-primary text-white" : "text-text-secondary hover:bg-slate-50"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {pestana !== "placa" && (
              <>
                <label className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-text-tertiary" />
                  <input
                    value={q} onChange={(e) => setQ(e.target.value)} placeholder="Placa, bus, conductor…"
                    className="w-52 rounded-lg border border-border bg-white py-1.5 pl-8 pr-2 text-sm"
                  />
                </label>
                <select
                  value={filtroRev} onChange={(e) => setFiltroRev(e.target.value as FiltroRevision)}
                  className="rounded-lg border border-border bg-white px-2 py-1.5 text-sm" aria-label="Filtrar por revisión"
                >
                  <option value="">Revisados y pendientes</option>
                  <option value="pendientes">Solo pendientes</option>
                  <option value="revisados">Solo revisados</option>
                </select>
              </>
            )}
            {hayFiltros && pestana !== "placa" && (
              <button type="button" onClick={limpiar} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <X className="h-3.5 w-3.5" /> Quitar filtros
              </button>
            )}
          </div>

          {pestana !== "placa" && (
            <div className="flex flex-wrap gap-1.5">
              {estado && <Chip activo onClick={() => setEstado("")}>{ESTILO[estado].corto} ×</Chip>}
              {placa && <Chip activo onClick={() => setPlaca(null)}>Placa {placa} ×</Chip>}
              {ETIQUETAS.map((e) => (
                <Chip key={e.clave} activo={etiquetas.has(e.clave)} onClick={() => alternarEtiqueta(e.clave)} disabled={!conteoEtiquetas[e.clave] && !etiquetas.has(e.clave)}>
                  {e.etiqueta} · {conteoEtiquetas[e.clave]}
                </Chip>
              ))}
            </div>
          )}

          {pestana === "placa" ? (
            <TablaPlacas placas={placas} onElegir={(p) => { setPlaca(p); setPestana("todos"); setEstado(""); }} />
          ) : (
            <TablaViajes filas={visibles} politicaNueva={revision.politicaNueva} marcas={marcas} onAbrir={setAbierto} />
          )}
        </>
      )}

      <Sheet open={!!abierto} onOpenChange={(o) => { if (!o) setAbierto(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {abierto && revision && (
            <DetalleViaje
              fila={abierto}
              fecha={fecha}
              marca={marcas.get(abierto.numero)}
              puedeRevisar={puedeRevisar && evidenciaDisponible}
              politicaNueva={revision.politicaNueva}
              onGuardado={(m) => setMarcas((prev) => new Map(prev).set(m.numero, m))}
              onQuitado={(n) => setMarcas((prev) => { const x = new Map(prev); x.delete(n); return x; })}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Aviso({ tono, children }: { tono: "ambar" | "rojo"; children: React.ReactNode }) {
  const cls = tono === "rojo" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Chip({ activo, disabled, onClick, children }: { activo?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${activo ? "border-primary bg-primary text-white" : "border-border bg-white text-text-secondary hover:bg-slate-50"} disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function ResumenDia({ revision, porRevisar, revisados, alertas }: { revision: RevisionDia; porRevisar: number; revisados: number; alertas: number }) {
  const tablas = tablasDelDia(revision.fecha);
  return (
    <details className="rounded-xl border border-border bg-white">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
        <span className="font-semibold text-text-primary">
          {revision.politicaNueva ? (revision.festivo ? "Plan domingo / festivo" : "Plan lunes a sábado") : "Política anterior al 13/08/2026"}
        </span>
        <span className="text-text-secondary">
          Revisados {revisados} de {porRevisar} · {alertas} alertas
        </span>
        <span className="text-text-tertiary">Tabla de descuentos y fuentes</span>
      </summary>
      <div className="grid gap-4 border-t border-border px-4 py-3 text-sm md:grid-cols-[auto_1fr]">
        <div className="flex flex-wrap gap-4">
          {tablas.map(({ titulo, tabla }) => (
            <table key={titulo} className="text-xs">
              <caption className="mb-1 text-left font-semibold text-text-primary">{titulo}</caption>
              <thead><tr className="text-text-tertiary"><th className="pr-4 text-left font-medium">Timbradas</th><th className="text-right font-medium">Desc.</th></tr></thead>
              <tbody>
                {tabla.map((t) => (
                  <tr key={t[0]}><td className="pr-4">{textoTramo(t)}</td><td className="text-right tabular-nums">{t[2]}</td></tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
        <ul className="space-y-1 text-xs text-text-secondary">
          <li>
            Se acepta como válido un descuento de 0, el de <b>{TIPO_ACTUALIZACION_CONTEO}</b>, el autorizado por la tabla, o ambos sumados.
            {revision.politicaNueva && <> Despacho desde las 18:00 con viaje DESPACHADO: además la timbrada de cortesía ({TIPO_BONO_NOCTURNO}).</>}
          </li>
          {!revision.politicaNueva && revision.placasSensorViejo.length > 0 && (
            <li>Placas con sensor viejo detectado: {revision.placasSensorViejo.join(", ")}.</li>
          )}
          <li>
            Fuentes del día: {nf.format(revision.cobertura.conteos.despacho)} viajes de despacho, {nf.format(revision.cobertura.conteos.eventos)} eventos
            de geocerca del terminal, {nf.format(revision.cobertura.conteos.recaudo)} viajes recaudados y {nf.format(revision.cobertura.conteos.descuentos)} timbradas descontadas.
          </li>
          {revision.cobertura.marcadorPv && <li>Puntos virtuales sincronizados hasta el {revision.cobertura.marcadorPv}.</li>}
          {revision.politicaNueva && <li>Política de descuentos vigente desde el {FECHA_CAMBIO_TABLA}.</li>}
        </ul>
      </div>
    </details>
  );
}

function TablaViajes({
  filas, politicaNueva, marcas, onAbrir,
}: {
  filas: FilaRevision[];
  politicaNueva: boolean;
  marcas: Map<number, MarcaRevision>;
  onAbrir: (f: FilaRevision) => void;
}) {
  const [limite, setLimite] = useState(300);
  if (!filas.length) {
    return <div className="rounded-xl border border-border bg-white p-8 text-center text-sm text-text-tertiary">No hay viajes con estos filtros.</div>;
  }
  const th = "whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-tertiary";
  const thPv = `${th} bg-slate-100`;
  const td = "whitespace-nowrap px-2 py-1.5 tabular-nums";
  const tdPv = `${td} bg-slate-100/70 text-text-secondary`;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="border-b border-border bg-slate-50">
            <tr>
              <th className={th}>Placa</th><th className={th}>Veh.</th><th className={th}>Conductor</th><th className={th}>Vj</th>
              <th className={th}>Salida</th><th className={th}>Llegada</th>
              <th className={thPv} title="Registradora llegada − salida">Ac.Reg</th>
              <th className={thPv} title="Subidas llegada − salida">Ac.Sub</th>
              <th className={thPv} title="Bajadas llegada − salida">Ac.Baj</th>
              <th className={thPv}>Dif S-R</th><th className={thPv}>Dif S-B</th>
              <th className={th}>Tim R</th><th className={th}>Dcto VR</th><th className={th}>TD Dcto</th><th className={th}>Tim Neto</th>
              {!politicaNueva && <th className={th}>Sensor</th>}
              <th className={th}>Estado</th><th className={th}>Observación</th><th className={th}>Revisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.slice(0, limite).map((f) => {
              const m = marcas.get(f.numero);
              return (
                <tr
                  key={f.numero}
                  onClick={() => onAbrir(f)}
                  className={`cursor-pointer hover:bg-primary/5 ${f.sensor === "VIEJO" ? "bg-orange-100" : ESTILO[f.estado].fila}`}
                >
                  <td className={`${td} font-semibold`}>{f.placa}</td>
                  <td className={td}>{f.vehiculo}</td>
                  <td className="max-w-[180px] truncate px-2 py-1.5" title={f.conductor ?? ""}>{f.conductor}</td>
                  <td className={td}>{f.viaje}</td>
                  <td className={td}>{f.horaSalida.slice(0, 5)}</td>
                  <td className={td}>{f.horaLlegada === "00:00:00" ? "—" : f.horaLlegada.slice(0, 5)}</td>
                  <td className={tdPv}>{fmt(f.acReg)}</td>
                  <td className={tdPv}>{fmt(f.acSub)}</td>
                  <td className={tdPv}>{fmt(f.acBaj)}</td>
                  <td className={`${tdPv} ${f.difSR != null && Math.abs(f.difSR) > 10 ? "font-bold text-red-700" : ""}`}>{fmt(f.difSR)}</td>
                  <td className={`${tdPv} ${sbAlta(f) ? "font-bold text-violet-700" : ""}`}>{fmt(f.difSB)}</td>
                  <td className={`${td} font-semibold`}>{fmt(f.timR)}</td>
                  <td className={td}>{fmt(f.dctoVr)}</td>
                  <td className={td}>{fmt(f.tdDcto)}</td>
                  <td className={td}>{fmt(f.timNeto)}</td>
                  {!politicaNueva && <td className={td}>{f.sensor}</td>}
                  <td className="px-2 py-1.5">
                    <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${ESTILO[f.estado].chip}`}>{ESTILO[f.estado].corto}</span>
                  </td>
                  <td className="min-w-[220px] max-w-[360px] px-2 py-1.5 text-text-secondary">
                    <span className="line-clamp-2" title={f.observacion ?? ""}>{f.observacion}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {m ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700" title={`${m.resultado}${m.nota ? ` · ${m.nota}` : ""}`}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> {m.resultado.split(" ")[0]}
                      </span>
                    ) : requiereRevision(f) ? (
                      <span className="text-text-tertiary">Pendiente</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filas.length > limite && (
        <div className="border-t border-border p-2 text-center">
          <button type="button" onClick={() => setLimite((l) => l + 300)} className="text-sm font-medium text-primary hover:underline">
            Mostrar más ({filas.length - limite} restantes)
          </button>
        </div>
      )}
    </div>
  );
}

function TablaPlacas({ placas, onElegir }: { placas: ReturnType<typeof resumenPorPlaca>; onElegir: (p: string) => void }) {
  const th = "whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-tertiary";
  const td = "whitespace-nowrap px-3 py-1.5 tabular-nums";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="border-b border-border bg-slate-50">
            <tr>
              <th className={th}>Placa</th><th className={th}>Veh.</th><th className={th}>Viajes</th><th className={th}>Por revisar</th>
              <th className={th}>Alertas</th><th className={th}>Subidas</th><th className={th}>Bajadas</th><th className={th}>Dif. S-B</th>
              <th className={th}>Viajes S-B &gt; {UMBRAL_SB}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {placas.map((p) => (
              <tr key={p.placa} onClick={() => onElegir(p.placa)} className="cursor-pointer hover:bg-primary/5">
                <td className={`${td} font-semibold`}>{p.placa}</td>
                <td className={td}>{p.vehiculo}</td>
                <td className={td}>{p.viajes}</td>
                <td className={td}>{p.porRevisar || ""}</td>
                <td className={`${td} ${p.alertas ? "font-bold text-red-700" : ""}`}>{p.alertas || ""}</td>
                <td className={td}>{fmt(p.subidas)}</td>
                <td className={td}>{fmt(p.bajadas)}</td>
                <td className={`${td} ${p.viajesSbAlta ? "font-bold text-violet-700" : ""}`}>{conSigno(p.difSB)}</td>
                <td className={td}>{p.viajesSbAlta || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, gris }: { etiqueta: string; valor: React.ReactNode; gris?: boolean }) {
  return (
    <div className={`rounded-lg px-2.5 py-1.5 ${gris ? "bg-slate-100" : "bg-slate-50"}`}>
      <div className="text-[11px] text-text-tertiary">{etiqueta}</div>
      <div className="font-semibold tabular-nums text-text-primary">{valor ?? "—"}</div>
    </div>
  );
}

function DetalleViaje({
  fila: f, fecha, marca, puedeRevisar, politicaNueva, onGuardado, onQuitado,
}: {
  fila: FilaRevision;
  fecha: string;
  marca: MarcaRevision | undefined;
  puedeRevisar: boolean;
  politicaNueva: boolean;
  onGuardado: (m: MarcaRevision) => void;
  onQuitado: (numero: number) => void;
}) {
  const [resultado, setResultado] = useState<ResultadoRevision | "">(marca?.resultado ?? "");
  const [nota, setNota] = useState(marca?.nota ?? "");
  const [guardando, startGuardar] = useTransition();
  const td = Object.entries(f.tdPorTipo).sort((a, b) => b[1] - a[1]);
  const dctoReal = f.timR != null && f.timNeto != null ? f.timR - f.timNeto : null;

  function guardar() {
    if (!resultado) { toast.error("Elige el resultado de la revisión."); return; }
    startGuardar(async () => {
      const r = await marcarViajeRevisado({
        fecha, numero: f.numero, placa: f.placa, viaje: f.viaje, resultado, nota, estadoCalculado: f.estado,
      });
      if (r.success && r.marca) { onGuardado(r.marca); toast.success("Revisión guardada."); }
      else toast.error(r.error ?? "No se pudo guardar.");
    });
  }
  function quitar() {
    startGuardar(async () => {
      const r = await quitarRevisionViaje(fecha, f.numero);
      if (r.success) { onQuitado(f.numero); setResultado(""); setNota(""); toast.success("Revisión quitada."); }
      else toast.error(r.error ?? "No se pudo quitar.");
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{f.placa} · bus {f.vehiculo ?? "—"} · viaje {f.viaje}</SheetTitle>
        <SheetDescription>
          {f.conductor ?? "Sin conductor"}{f.codConductor ? ` (${f.codConductor})` : ""} · {f.ruta ?? "Sin ruta"} · despacho n.º {f.numero}
        </SheetDescription>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6 text-sm">
        <div className={`rounded-lg border px-3 py-2 ${ESTILO[f.estado].chip}`}>
          <div className="font-semibold">{f.estado}</div>
          <div className="text-xs">{ACCION_REQUERIDA[f.estado]} · despacho en estado {f.estadoDespacho}</div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Dato etiqueta="Salida" valor={f.horaSalida} />
          <Dato etiqueta="Llegada" valor={f.horaLlegada === "00:00:00" ? "Sin llegada" : f.horaLlegada} />
          {!politicaNueva && <Dato etiqueta="Sensor" valor={f.sensor} />}
        </div>

        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Puntos virtuales (terminal)</h3>
          <div className="grid grid-cols-3 gap-2">
            <Dato gris etiqueta="Reg. salida" valor={fmt(f.regSalida)} />
            <Dato gris etiqueta="Reg. llegada" valor={fmt(f.regLlegada)} />
            <Dato gris etiqueta="Ac. registradora" valor={fmt(f.acReg)} />
            <Dato gris etiqueta="Ac. subidas" valor={fmt(f.acSub)} />
            <Dato gris etiqueta="Ac. bajadas" valor={fmt(f.acBaj)} />
            <Dato gris etiqueta="Dif. subidas − bajadas" valor={f.difSB == null ? null : conSigno(f.difSB)} />
          </div>
          {sbAlta(f) && (
            <p className="mt-2 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs text-violet-800">
              Subidas y bajadas no cuadran por más de {UMBRAL_SB}: posible falla del sensor de puertas.
            </p>
          )}
          {f.acSub == null && f.estado !== "N/A - No Despachado" && f.estado !== "Revisar - Datos Incompletos" && (
            <p className="mt-2 text-xs text-text-tertiary">No se encontró el evento de salida o de llegada del terminal para esta placa.</p>
          )}
        </div>

        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {f.estado === "Sin Recaudo - Con Timbradas" ? "Timbradas del despacho (sin recaudo)" : "Recaudo"}
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <Dato etiqueta="Tim R" valor={fmt(f.timR)} />
            <Dato etiqueta="Dcto VR" valor={fmt(f.dctoVr)} />
            <Dato etiqueta="TD Dcto" valor={fmt(f.tdDcto)} />
            <Dato etiqueta="Tim Neto" valor={fmt(f.timNeto)} />
          </div>
          {politicaNueva && f.autorizado != null && (
            <p className="mt-2 text-xs text-text-secondary">
              Descuento real {dctoReal ?? "—"} · autorizado por la tabla {f.autorizado} · actualización de conteo {f.tdDcto ?? 0}.
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Timbradas descontadas del viaje</h3>
          {td.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {td.map(([tipo, n]) => (
                <li key={tipo} className="flex justify-between px-2.5 py-1.5 text-xs">
                  <span>{tipo}</span><span className="font-semibold tabular-nums">{fmt(n)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-text-tertiary">Sin descuentos registrados.</p>}
        </div>

        {f.observacion && (
          <div className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-text-secondary">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <ul className="space-y-1">{f.observacion.split("; ").map((o) => <li key={o}>{o}</li>)}</ul>
          </div>
        )}

        <div className="space-y-2 border-t border-border pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Revisión</h3>
          {marca && (
            <p className="text-xs text-text-secondary">
              {marca.resultado} — {marca.revisadoPorEmail ?? "—"}, {new Date(marca.revisadoAt).toLocaleString("es-CO")}
              {marca.estadoCalculado && marca.estadoCalculado !== f.estado && (
                <span className="mt-1 block text-amber-700">
                  Al revisarlo el viaje estaba en «{marca.estadoCalculado}»; hoy el cálculo da «{f.estado}» (GEMA cambió los datos).
                </span>
              )}
            </p>
          )}
          {puedeRevisar ? (
            <>
              <select
                value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoRevision)}
                className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm" aria-label="Resultado de la revisión"
              >
                <option value="">Resultado…</option>
                {RESULTADOS_REVISION.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <textarea
                value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} rows={3} placeholder="Nota (soporte, a quién se escaló…)"
                className="w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button" onClick={guardar} disabled={guardando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {guardando && <Loader2 className="h-4 w-4 animate-spin" />} {marca ? "Actualizar" : "Marcar revisado"}
                </button>
                {marca && (
                  <button type="button" onClick={quitar} disabled={guardando} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50">
                    Quitar revisión
                  </button>
                )}
              </div>
            </>
          ) : (
            !marca && <p className="text-xs text-text-tertiary">Tu usuario no puede registrar revisiones o la evidencia aún no está disponible.</p>
          )}
        </div>
      </div>
    </>
  );
}
