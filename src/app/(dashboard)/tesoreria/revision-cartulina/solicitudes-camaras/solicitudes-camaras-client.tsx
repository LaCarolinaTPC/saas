"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, History, Loader2, Search } from "lucide-react";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { sinTildes } from "@/lib/tabla/filtros";
import {
  diasAtencion, ETAPA_LABEL, esGestionVencida, etapaSolicitud, FILTRO_LABEL, indicadoresRecobros,
  motivoNoPermitido, nivelDias, pasaFiltro, PROXIMA_GESTION_MAX_DIAS, sumarDiasIso, TRAMOS_DIAS, VALOR_MAXIMO_RECOBRO,
  type Etapa, type FiltroEtapa, type IndicadoresRecobros, type NivelDias,
} from "@/lib/tesoreria/recobros-camaras";
import type { EventoSolicitud, GestionRecobro, SolicitudRecobro } from "@/lib/tesoreria/recobros-camaras-data";
import {
  decidirIncobrable, listarEventosSolicitud, reabrirIncobrable, registrarCobroRecobro,
  registrarGestionRecobro, solicitarIncobrable,
} from "./actions";

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const areaCls = "rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-gray-900";
const btnPrimario =
  "inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50";
const btnSecundario =
  "rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50";
const pesos = (n: number | null) => (n == null ? "—" : `$ ${n.toLocaleString("es-CO")}`);
const cuando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "—";
const dias = (n: number | null, dec = 0) =>
  n == null ? "—" : `${n.toLocaleString("es-CO", { maximumFractionDigits: dec })} ${n === 1 ? "día" : "días"}`;

const ESTILO_ETAPA: Record<Etapa, string> = {
  en_camaras: "bg-slate-100 text-slate-700",
  cerrada: "bg-emerald-100 text-emerald-800",
  decide_subgerencia: "bg-violet-100 text-violet-800",
  anulada: "bg-slate-100 text-slate-500",
  pendiente_caja: "bg-amber-100 text-amber-800",
  en_seguimiento: "bg-orange-100 text-orange-800",
  por_autorizar: "bg-rose-100 text-rose-800",
  cobrado: "bg-emerald-100 text-emerald-800",
  incobrable: "bg-slate-200 text-slate-800",
};
const ESTILO_DIAS: Record<NivelDias, string> = {
  normal: "bg-slate-100 text-slate-700",
  alerta: "bg-amber-100 text-amber-800",
  critico: "bg-red-100 text-red-800",
};
const FILTROS_TODO: FiltroEtapa[] = [
  "abiertos", "pendiente_caja", "en_seguimiento", "vencida", "por_autorizar",
  "en_camaras", "decide_subgerencia", "cobrado", "incobrable", "cerrada", "anulada",
];
const FILTROS_RECOBROS: FiltroEtapa[] = ["abiertos", "pendiente_caja", "en_seguimiento", "vencida", "por_autorizar", "cobrado", "incobrable"];
/** Filtros cuyo contador va en rojo: algo que alguien tiene que atender. */
const URGENTES = new Set<FiltroEtapa>(["abiertos", "vencida", "por_autorizar"]);

/**
 * Pestaña Solicitudes a cámaras. Filtra en el navegador sobre todas las
 * solicitudes ya cargadas. La respuesta de cámaras no necesita visto: caja
 * registra gestiones, el cobro (al conductor del viaje) o pide el incobrable;
 * la directora lo autoriza, rechaza o reabre. Tras cada acción se refresca el
 * servidor para que el contador de la pestaña cuadre.
 */
export function SolicitudesCamarasClient({
  solicitudes: iniciales, gestiones: gestionesIniciales, disponible, filtroInicial, hoy,
  puedeCobrar, puedeAutorizar, verIndicadores, deCartulina, soloRecobros = false,
}: {
  solicitudes: SolicitudRecobro[];
  gestiones: GestionRecobro[];
  disponible: boolean;
  filtroInicial: FiltroEtapa | null;
  hoy: string;
  /** Caja con edición: gestiones, cobro y solicitud de incobrable. */
  puedeCobrar: boolean;
  /** Directora de tesorería con edición: autoriza, rechaza o reabre el incobrable. */
  puedeAutorizar: boolean;
  /** Cartulina, directora o admin: panel de indicadores. */
  verIndicadores: boolean;
  /** Tiene la revisión del día: se le ofrece abrir el viaje. */
  deCartulina: boolean;
  /** Sin cartulina: solo recobros (ya filtrados en el servidor). */
  soloRecobros?: boolean;
}) {
  const [solicitudes, setSolicitudes] = useState(iniciales);
  const [gestiones, setGestiones] = useState(gestionesIniciales);
  const [filtro, setFiltro] = useState<FiltroEtapa | "">(filtroInicial ?? "");
  const [resultado, setResultado] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [buscar, setBuscar] = useState("");
  const router = useRouter();

  const gestionesPor = useMemo(() => {
    const m = new Map<string, GestionRecobro[]>();
    for (const g of gestiones) m.set(g.solicitudId, [...(m.get(g.solicitudId) ?? []), g]);
    return m;
  }, [gestiones]);

  // Los filtros de fecha, resultado y búsqueda recortan también los
  // indicadores; el de etapa solo la lista.
  const base = useMemo(() => {
    const q = sinTildes(buscar.trim());
    return solicitudes.filter((s) => {
      if (resultado && s.resultado !== resultado) return false;
      if (desde && s.fechaViaje < desde) return false;
      if (hasta && s.fechaViaje > hasta) return false;
      if (q) {
        const texto = sinTildes([s.conductorNombre, s.conductorCedula, s.vehiculoCodigo, s.placa, String(s.numero), s.ruta].filter(Boolean).join(" "));
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [solicitudes, resultado, desde, hasta, buscar]);
  const conteo = useMemo(() => {
    const c = new Map<FiltroEtapa, number>();
    for (const f of FILTROS_TODO) c.set(f, base.filter((s) => pasaFiltro(s, f, hoy)).length);
    return c;
  }, [base, hoy]);
  const filtradas = useMemo(() => base.filter((s) => !filtro || pasaFiltro(s, filtro, hoy)), [base, filtro, hoy]);
  const indicadores = useMemo(() => (verIndicadores ? indicadoresRecobros(base, hoy) : null), [verIndicadores, base, hoy]);
  const p = usePaginacion(filtradas, { reiniciar: `${filtro}|${resultado}|${desde}|${hasta}|${buscar}` });

  function actualizar(s: SolicitudRecobro, g?: GestionRecobro) {
    setSolicitudes((prev) => prev.map((x) => (x.id === s.id ? s : x)));
    if (g) setGestiones((prev) => [g, ...prev]);
    router.refresh();
  }

  if (!disponible) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Falta aplicar en el SQL Editor las migraciones <code>20261026213310_seguimiento_de_recobros_de_camaras_en_cartulina_y_caja.sql</code> y{" "}
          <code>20261027155032_seguimiento_de_recobros_no_cobrados_e_incobrable_autorizado.sql</code>.
          Hasta entonces esta pestaña no puede mostrar las solicitudes ni el seguimiento del cobro.
        </p>
      </div>
    );
  }

  const chip = (key: FiltroEtapa | "", label: string, n: number) => (
    <button
      key={key || "todas"}
      type="button"
      onClick={() => setFiltro(key)}
      aria-pressed={filtro === key}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
        filtro === key ? "bg-[#4F46E5] text-white" : "border border-[#E2E8F0] bg-white text-gray-600 hover:bg-[#F8FAFC]"
      }`}
    >
      {label}
      <span className={`text-xs ${filtro === key ? "text-indigo-100" : key && URGENTES.has(key) && n > 0 ? "font-semibold text-[#DC2626]" : "text-gray-400"}`}>{n}</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      {indicadores && <PanelIndicadores ind={indicadores} />}

      <div className="flex flex-wrap gap-2">
        {chip("", "Todas", base.length)}
        {(soloRecobros ? FILTROS_RECOBROS : FILTROS_TODO).map((f) => chip(f, FILTRO_LABEL[f], conteo.get(f) ?? 0))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3">
        <label className="flex w-full flex-col gap-1 text-xs font-medium text-gray-500 sm:w-auto">
          Buscar
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Conductor, cédula, bus, placa o despacho" className={`${inputCls} w-full pl-8 sm:w-72`} />
          </span>
        </label>
        {!soloRecobros && (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
            Resultado
            <select value={resultado} onChange={(e) => setResultado(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              <option value="recobro">Recobro</option>
              <option value="normalidad_timbradas">Normalidad de timbradas</option>
              <option value="sin_conteo">Sin conteo</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Viaje desde
          <input type="date" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Viaje hasta
          <input type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
        </label>
        <p className="ml-auto self-center text-sm text-gray-500">{filtradas.length} de {solicitudes.length}</p>
      </div>

      {filtradas.length === 0 ? (
        <p className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-10 text-center text-sm text-gray-400">
          No hay solicitudes con estos filtros.
        </p>
      ) : (
        <ul className="space-y-3">
          {p.filas.map((s) => (
            <Tarjeta
              key={s.id}
              s={s}
              gestiones={gestionesPor.get(s.id) ?? []}
              hoy={hoy}
              puedeCobrar={puedeCobrar}
              puedeAutorizar={puedeAutorizar}
              deCartulina={deCartulina}
              soloRecobros={soloRecobros}
              onCambio={actualizar}
            />
          ))}
        </ul>
      )}
      <Paginador p={p} unidad="solicitudes" />
    </div>
  );
}

// ── Indicadores ──────────────────────────────────────────────────────────────

function Dato({ titulo, valor, detalle, tono = "normal" }: { titulo: string; valor: string; detalle?: string; tono?: "normal" | "alerta" | "bien" }) {
  const color = tono === "alerta" ? "text-[#DC2626]" : tono === "bien" ? "text-emerald-700" : "text-gray-900";
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2">
      <p className="text-xs font-medium text-gray-500">{titulo}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{valor}</p>
      {detalle && <p className="text-xs text-gray-500">{detalle}</p>}
    </div>
  );
}

function PanelIndicadores({ ind }: { ind: IndicadoresRecobros }) {
  const n = (x: number) => x.toLocaleString("es-CO");
  const maxTramo = Math.max(1, ...ind.tramosAbiertos);
  const COLOR_TRAMO = ["bg-slate-400", "bg-amber-400", "bg-orange-500", "bg-red-600"];
  return (
    <section aria-labelledby="ind-titulo" className="space-y-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ind-titulo" className="text-sm font-semibold text-gray-900">Gestión del recobro</h2>
        <p className="text-xs text-gray-500">
          {n(ind.recobros)} recobros · días de atención desde que cámaras confirma hasta el cobro (o hasta hoy si sigue abierto)
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Dato
          titulo="Abiertos en caja"
          valor={n(ind.abiertos)}
          detalle={`${n(ind.sinGestion)} sin gestión · ${n(ind.enSeguimiento)} en seguimiento`}
          tono={ind.abiertos > 0 ? "alerta" : "normal"}
        />
        <Dato titulo="Gestión vencida" valor={n(ind.vencidas)} detalle="La próxima fecha ya pasó" tono={ind.vencidas > 0 ? "alerta" : "normal"} />
        <Dato
          titulo="Incobrables por autorizar"
          valor={n(ind.porAutorizar)}
          detalle={ind.diasEsperandoAutorizacion == null ? "Nada esperando" : `Esperan ${dias(ind.diasEsperandoAutorizacion, 1)} en promedio`}
          tono={ind.porAutorizar > 0 ? "alerta" : "normal"}
        />
        <Dato titulo="Cobrados" valor={n(ind.cobrados)} detalle={pesos(ind.montoCobrado)} tono="bien" />
        <Dato titulo="Incobrables" valor={n(ind.incobrables)} detalle="Autorizados por la directora" />
        <Dato
          titulo="Tasa de cobro"
          valor={ind.tasaCobro == null ? "—" : `${Math.round(ind.tasaCobro * 100)} %`}
          detalle="Cobrados sobre cerrados"
        />
        <Dato
          titulo="Días de atención · cerrados"
          valor={dias(ind.diasCerradosPromedio, 1)}
          detalle={`Mediana ${dias(ind.diasCerradosMediana, 1)}`}
        />
        <Dato
          titulo="Días de atención · abiertos"
          valor={dias(ind.diasAbiertosPromedio, 1)}
          detalle={`El más antiguo: ${dias(ind.diasAbiertosMaximo)}`}
          tono={ind.diasAbiertosMaximo != null && ind.diasAbiertosMaximo >= 16 ? "alerta" : "normal"}
        />
        <Dato
          titulo="Gestiones por recobro"
          valor={ind.gestionesPorRecobro == null ? "—" : ind.gestionesPorRecobro.toLocaleString("es-CO", { maximumFractionDigits: 1 })}
        />
        <div className="col-span-2 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 sm:col-span-3">
          <p className="text-xs font-medium text-gray-500">Antigüedad de los abiertos</p>
          <ul className="mt-1 space-y-1">
            {TRAMOS_DIAS.map((t, i) => (
              <li key={t.label} className="flex items-center gap-2 text-xs text-gray-700">
                <span className="w-20 shrink-0">{t.label}</span>
                <span className="h-3 flex-1 rounded bg-slate-100">
                  <span className={`block h-3 rounded ${COLOR_TRAMO[i]}`} style={{ width: `${(ind.tramosAbiertos[i] / maxTramo) * 100}%` }} />
                </span>
                <span className="w-8 shrink-0 text-right font-semibold tabular-nums">{ind.tramosAbiertos[i]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── Tarjeta ──────────────────────────────────────────────────────────────────

type Formulario = "gestion" | "cobro" | "incobrable" | "rechazar" | "reabrir" | null;

function Tarjeta({ s, gestiones, hoy, puedeCobrar, puedeAutorizar, deCartulina, soloRecobros, onCambio }: {
  s: SolicitudRecobro;
  gestiones: GestionRecobro[];
  hoy: string;
  puedeCobrar: boolean;
  puedeAutorizar: boolean;
  deCartulina: boolean;
  soloRecobros: boolean;
  onCambio: (s: SolicitudRecobro, g?: GestionRecobro) => void;
}) {
  const [autorizando, startAutorizar] = useTransition();
  const [form, setForm] = useState<Formulario>(null);
  const [historial, setHistorial] = useState<EventoSolicitud[] | null>(null);
  const [cargandoHist, startHist] = useTransition();
  const etapa = etapaSolicitud(s);
  const esRecobro = s.estado === "resuelto" && s.resultado === "recobro";
  const d = diasAtencion(s, hoy);
  const vencida = esGestionVencida(s, hoy);
  const rolCaja = { caja: puedeCobrar, autoriza: false };
  const rolDir = { caja: false, autoriza: puedeAutorizar };
  const puede = (a: Parameters<typeof motivoNoPermitido>[0], rol: { caja: boolean; autoriza: boolean }) =>
    motivoNoPermitido(a, s, rol) == null;

  function autorizar() {
    if (!window.confirm("¿Autoriza dar este recobro por incobrable? Queda cerrado y solo usted (o el admin) puede reabrirlo.")) return;
    startAutorizar(async () => {
      const r = await decidirIncobrable(s.id, "autorizar", null);
      if (r.success && r.solicitud) {
        onCambio(r.solicitud);
        setHistorial(null);
        toast.success("Incobrable autorizado.");
      } else toast.error(r.error ?? "No se pudo autorizar.");
    });
  }

  function verHistorial() {
    if (historial) return setHistorial(null);
    startHist(async () => {
      const r = await listarEventosSolicitud(s.id);
      if (r.success) setHistorial((r.eventos ?? []).filter((ev) => !soloRecobros || ev.accion !== "visto"));
      else toast.error(r.error ?? "No se pudo leer el historial.");
    });
  }

  function guardado(n: SolicitudRecobro, g?: GestionRecobro) {
    setForm(null);
    setHistorial(null);
    onCambio(n, g);
  }

  return (
    <li className={`rounded-xl border bg-white p-4 ${etapa === "por_autorizar" ? "border-rose-300" : "border-[#E2E8F0]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900">
              Bus {s.vehiculoCodigo ?? "—"} · placa {s.placa ?? "—"} · viaje {s.viaje ?? "—"}
            </p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_ETAPA[etapa]}`}>{ETAPA_LABEL[etapa]}</span>
            {d != null && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_DIAS[s.cobroEstado ? "normal" : nivelDias(d)]}`}
                title="Días de atención: desde que cámaras confirmó el recobro hasta el cobro, o hasta hoy si sigue abierto"
              >
                {dias(d)} de atención
              </span>
            )}
            {vencida && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Gestión vencida</span>}
          </div>
          <p className="text-xs text-gray-500">
            {s.fechaViaje} · despacho n.º {s.numero} · {s.ruta ?? "Sin ruta"}
          </p>
          <p className="text-xs text-gray-500">
            Conductor: {s.conductorNombre ?? "Sin conductor"}{s.conductorCedula ? ` · CC ${s.conductorCedula}` : ""}
          </p>
          {!soloRecobros && (
            <>
              <p className="mt-1 text-xs text-gray-400">Enviada por {s.solicitadoPorEmail ?? "—"} · {cuando(s.solicitadoAt)}</p>
              {s.notaSolicitud && <p className="mt-1 text-sm text-gray-700">“{s.notaSolicitud}”</p>}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" onClick={verHistorial} className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900">
            {cargandoHist ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />} Historial
          </button>
          {deCartulina && (
            <Link
              href={`/tesoreria/revision-cartulina?fecha=${s.fechaViaje}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#4F46E5] hover:underline"
              title="Abrir la revisión del día del viaje"
            >
              Abrir viaje <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {s.estado === "resuelto" ? (
        <div className={`mt-3 flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${s.resultado === "recobro" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          <div>
            <span className="font-semibold">{s.tipo === "cartulina"
              ? `Recobro por cartulina${s.diferencia != null ? ` · ${s.diferencia} timbradas` : ""}${s.valorRecobro != null ? ` · $${s.valorRecobro.toLocaleString("es-CO")}` : ""}`
              : `Cámaras: ${s.resultado === "recobro" ? "Recobro" : s.resultado === "sin_conteo" ? "Sin conteo · decide subgerencia" : "Normalidad de timbradas"}`}</span>
            {s.notaCamaras ? ` · ${s.notaCamaras}` : ""}
            <span className="block text-xs opacity-80">Por {s.resueltoPorEmail ?? "—"} · {cuando(s.resueltoAt)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">Esperando la revisión de cámaras.</p>
      )}

      {esRecobro && (
        <div className="mt-3 space-y-3 border-t border-[#F1F5F9] pt-3">
          <ResumenCobro s={s} />

          {s.incobrableRechazoNota && etapa !== "incobrable" && !s.incobrableSolicitadoAt && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              <span className="font-semibold">Incobrable rechazado:</span> {s.incobrableRechazoNota}
              <span className="block opacity-80">{s.incobrableRechazadoPorEmail ?? "—"} · {cuando(s.incobrableRechazadoAt)}</span>
            </p>
          )}

          {gestiones.length > 0 && <HistoricoGestiones gestiones={gestiones} hoy={hoy} abierto={s.cobroEstado == null} />}

          {form === "gestion" && <FormGestion s={s} hoy={hoy} onCancelar={() => setForm(null)} onGuardado={guardado} />}
          {form === "cobro" && <FormCobro s={s} hoy={hoy} onCancelar={() => setForm(null)} onGuardado={guardado} />}
          {form === "incobrable" && (
            <FormTexto
              titulo="Motivo por el que no se puede cobrar"
              ayuda="La directora de tesorería decide. Mientras tanto el recobro sigue abierto: puede seguir gestionándolo o cobrarlo."
              boton="Solicitar incobrable"
              onCancelar={() => setForm(null)}
              enviar={(t) => solicitarIncobrable(s.id, t)}
              exito="Incobrable enviado a autorización."
              onGuardado={guardado}
            />
          )}
          {form === "rechazar" && (
            <FormTexto
              titulo="Por qué rechaza el incobrable"
              ayuda="El recobro vuelve a seguimiento de caja y su nota queda a la vista."
              boton="Rechazar"
              onCancelar={() => setForm(null)}
              enviar={(t) => decidirIncobrable(s.id, "rechazar", t)}
              exito="Incobrable rechazado: el recobro vuelve a seguimiento."
              onGuardado={guardado}
            />
          )}
          {form === "reabrir" && (
            <FormTexto
              titulo="Por qué reabre el recobro"
              ayuda="Vuelve a seguimiento de caja."
              boton="Reabrir"
              onCancelar={() => setForm(null)}
              enviar={(t) => reabrirIncobrable(s.id, t)}
              exito="Recobro reabierto."
              onGuardado={guardado}
            />
          )}

          {form == null && (
            <div className="flex flex-wrap gap-2">
              {puede("gestion", rolCaja) && (
                <button type="button" onClick={() => setForm("gestion")} className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700">
                  Registrar gestión
                </button>
              )}
              {puede("cobrar", rolCaja) && (
                <button
                  type="button"
                  onClick={() => setForm("cobro")}
                  className={s.cobroEstado ? btnSecundario : "rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"}
                >
                  {s.cobroEstado ? "Corregir cobro" : "Registrar cobro"}
                </button>
              )}
              {puede("solicitar_incobrable", rolCaja) && (
                <button type="button" onClick={() => setForm("incobrable")} className={btnSecundario}>
                  Solicitar incobrable
                </button>
              )}
              {puede("autorizar", rolDir) && (
                <>
                  <button type="button" onClick={autorizar} disabled={autorizando} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50">
                    {autorizando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Autorizar incobrable
                  </button>
                  <button type="button" onClick={() => setForm("rechazar")} className={btnSecundario}>
                    Rechazar
                  </button>
                </>
              )}
              {puede("reabrir", rolDir) && (
                <button type="button" onClick={() => setForm("reabrir")} className={btnSecundario}>
                  Reabrir
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {historial && (
        <div className="mt-3 rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs text-gray-600">
          {historial.length === 0 ? (
            <p>Sin movimientos todavía.</p>
          ) : (
            <ul className="space-y-1">
              {historial.map((ev) => (
                <li key={ev.id}>
                  <span className="font-medium text-gray-800">{cuando(ev.createdAt)}</span> · {ev.usuarioEmail ?? "—"} · {describirEvento(ev)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function ResumenCobro({ s }: { s: SolicitudRecobro }) {
  if (s.cobroEstado === "cobrado") {
    return (
      <p className="text-sm text-emerald-800">
        <span className="font-semibold">Cobrado {pesos(s.cobroValor)}</span> el {s.cobroFecha} · recibo {s.cobroSoporte}
        {s.cobroNota ? ` · ${s.cobroNota}` : ""}
        <span className="block text-xs text-gray-500">Caja: {s.cobroPorEmail ?? "—"} · {cuando(s.cobroAt)}</span>
      </p>
    );
  }
  if (s.cobroEstado === "incobrable") {
    return (
      <p className="text-sm text-slate-800">
        <span className="font-semibold">Incobrable</span> · {s.incobrableMotivo}
        <span className="block text-xs text-gray-500">
          Pedido por {s.incobrableSolicitadoPorEmail ?? "—"} · autorizado por {s.incobrableAutorizadoPorEmail ?? "—"} · {cuando(s.incobrableAutorizadoAt)}
        </span>
      </p>
    );
  }
  if (s.incobrableSolicitadoAt) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
        <span className="font-semibold">Incobrable por autorizar:</span> {s.incobrableMotivo}
        <span className="block text-xs opacity-80">
          Pedido por {s.incobrableSolicitadoPorEmail ?? "—"} · {cuando(s.incobrableSolicitadoAt)} · espera la decisión de la directora de tesorería
        </span>
      </p>
    );
  }
  if (s.gestionesN > 0) {
    return (
      <p className="text-sm font-medium text-orange-800">
        En seguimiento: no se ha cobrado al conductor
        {s.gestionProximaFecha ? ` · próxima gestión ${s.gestionProximaFecha}` : " · sin próxima fecha"}
      </p>
    );
  }
  return <p className="text-sm font-medium text-amber-800">Pendiente de caja: ¿se le cobró al conductor?</p>;
}

function HistoricoGestiones({ gestiones, hoy, abierto }: { gestiones: GestionRecobro[]; hoy: string; abierto: boolean }) {
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/50 px-3 py-2">
      <p className="text-xs font-semibold text-orange-900">Histórico de gestiones ({gestiones.length})</p>
      <ol className="mt-1 space-y-1.5">
        {gestiones.map((g, i) => {
          // Solo la próxima fecha de la gestión más reciente sigue vigente.
          const vence = abierto && i === 0 && g.proximaFecha != null && g.proximaFecha < hoy;
          return (
            <li key={g.id} className="text-xs text-gray-700">
              <span className="font-semibold text-gray-900">{g.fecha}</span> · {g.gestion}
              <span className="block text-gray-500">
                {g.origen === "migracion" ? "Registrado antes como «no cobrado»" : (g.usuarioEmail ?? "—")}
                {g.proximaFecha && (
                  <>
                    {" · próxima "}
                    <span className={vence ? "font-semibold text-[#DC2626]" : ""}>{g.proximaFecha}{vence ? " (vencida)" : ""}</span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Formularios ──────────────────────────────────────────────────────────────

function Botones({ guardando, onCancelar, texto = "Guardar" }: { guardando: boolean; onCancelar: () => void; texto?: string }) {
  return (
    <div className="flex gap-2">
      <button type="submit" disabled={guardando} className={btnPrimario}>
        {guardando && <Loader2 className="h-4 w-4 animate-spin" />} {texto}
      </button>
      <button type="button" onClick={onCancelar} disabled={guardando} className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC]">
        Cancelar
      </button>
    </div>
  );
}

function FormGestion({ s, hoy, onCancelar, onGuardado }: {
  s: SolicitudRecobro;
  hoy: string;
  onCancelar: () => void;
  onGuardado: (s: SolicitudRecobro, g?: GestionRecobro) => void;
}) {
  const [fecha, setFecha] = useState(hoy);
  const [gestion, setGestion] = useState("");
  const [proxima, setProxima] = useState("");
  const [guardando, start] = useTransition();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await registrarGestionRecobro(s.id, { fecha, gestion, proximaFecha: proxima || null });
      if (r.success && r.solicitud) {
        toast.success("Gestión registrada.");
        onGuardado(r.solicitud, r.gestion);
      } else toast.error(r.error ?? "No se pudo guardar.");
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-lg border border-orange-200 p-3">
      <p className="text-sm text-gray-700">
        Gestión del recobro al conductor <span className="font-semibold">{s.conductorNombre ?? "sin conductor"}</span>
        {s.conductorCedula ? ` · CC ${s.conductorCedula}` : ""}
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Fecha de la gestión
          <input type="date" required value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Próxima gestión (opcional)
          <input type="date" value={proxima} min={hoy} max={sumarDiasIso(hoy, PROXIMA_GESTION_MAX_DIAS)} onChange={(e) => setProxima(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
        Qué se hizo
        <textarea required value={gestion} maxLength={500} rows={2} onChange={(e) => setGestion(e.target.value)} placeholder="Ej.: Se llamó al conductor, se compromete a pagar el viernes" className={areaCls} />
      </label>
      <Botones guardando={guardando} onCancelar={onCancelar} />
    </form>
  );
}

function FormCobro({ s, hoy, onCancelar, onGuardado }: {
  s: SolicitudRecobro;
  hoy: string;
  onCancelar: () => void;
  onGuardado: (s: SolicitudRecobro) => void;
}) {
  const [valor, setValor] = useState(s.cobroValor != null ? String(s.cobroValor) : "");
  const [fecha, setFecha] = useState(s.cobroFecha ?? hoy);
  const [soporte, setSoporte] = useState(s.cobroSoporte ?? "");
  const [nota, setNota] = useState(s.cobroNota ?? "");
  const [guardando, start] = useTransition();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const limpio = valor.replace(/[.\s$]/g, "");
      const r = await registrarCobroRecobro(s.id, { valor: limpio === "" ? null : Number(limpio), fecha, soporte, nota });
      if (r.success && r.solicitud) {
        toast.success(s.cobroEstado ? "Cobro corregido." : "Cobro registrado.");
        onGuardado(r.solicitud);
      } else toast.error(r.error ?? "No se pudo guardar.");
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-lg border border-emerald-200 p-3">
      <p className="text-sm text-gray-700">
        Cobro al conductor <span className="font-semibold">{s.conductorNombre ?? "sin conductor"}</span>
        {s.conductorCedula ? ` · CC ${s.conductorCedula}` : ""}
      </p>
      {s.incobrableSolicitadoAt && (
        <p className="text-xs text-rose-800">Hay un incobrable esperando autorización: al registrar el cobro queda sin efecto.</p>
      )}
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Valor cobrado
          <input inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="25000" className={`${inputCls} w-36`} aria-describedby={`max-${s.id}`} />
          <span id={`max-${s.id}`} className="font-normal text-gray-400">Pesos, sin decimales (máx. {VALOR_MAXIMO_RECOBRO.toLocaleString("es-CO")})</span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Fecha del cobro
          <input type="date" value={fecha} min={s.fechaViaje} max={hoy} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Recibo o soporte
          <input value={soporte} maxLength={100} onChange={(e) => setSoporte(e.target.value)} placeholder="N.º de recibo" className={`${inputCls} w-44`} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
        Nota (opcional)
        <textarea value={nota} maxLength={500} rows={2} onChange={(e) => setNota(e.target.value)} className={areaCls} />
      </label>
      <Botones guardando={guardando} onCancelar={onCancelar} />
    </form>
  );
}

/** Formulario de un solo texto obligatorio (solicitar, rechazar o reabrir el incobrable). */
function FormTexto({ titulo, ayuda, boton, exito, enviar, onCancelar, onGuardado }: {
  titulo: string;
  ayuda: string;
  boton: string;
  exito: string;
  enviar: (texto: string) => Promise<{ success: boolean; error?: string; solicitud?: SolicitudRecobro }>;
  onCancelar: () => void;
  onGuardado: (s: SolicitudRecobro) => void;
}) {
  const [texto, setTexto] = useState("");
  const [guardando, start] = useTransition();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await enviar(texto);
      if (r.success && r.solicitud) {
        toast.success(exito);
        onGuardado(r.solicitud);
      } else toast.error(r.error ?? "No se pudo guardar.");
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-3 rounded-lg border border-rose-200 p-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
        {titulo}
        <textarea required value={texto} maxLength={500} rows={2} onChange={(e) => setTexto(e.target.value)} className={areaCls} />
        <span className="font-normal text-gray-400">{ayuda}</span>
      </label>
      <Botones guardando={guardando} onCancelar={onCancelar} texto={boton} />
    </form>
  );
}

// ── Historial ────────────────────────────────────────────────────────────────

function describirCobro(c: Record<string, unknown> | null): string {
  if (!c) return "—";
  if (c.estado === "cobrado") return `cobrado ${pesos(c.valor == null ? null : Number(c.valor))} el ${c.fecha ?? "—"}, recibo ${c.soporte ?? "—"}`;
  // Antes de 2026-10-27 caja cerraba con "no cobrado"; el historial lo conserva.
  if (c.estado === "no_cobrado") return `no cobrado (${c.motivo ?? "—"})`;
  return "sin gestión";
}

function describirEvento(ev: EventoSolicitud): string {
  const nota = (o: Record<string, unknown> | null) => (o?.nota ? ` · ${String(o.nota)}` : "");
  switch (ev.accion) {
    case "visto": return "marcó vista la respuesta";
    case "cobro_registrado": return `registró: ${describirCobro(ev.despues)}`;
    case "cobro_corregido": return `corrigió: ${describirCobro(ev.antes)} → ${describirCobro(ev.despues)}`;
    case "migrado_a_seguimiento": return `el «no cobrado» pasó a seguimiento (${String(ev.antes?.motivo ?? "—")})`;
    case "incobrable_solicitado": return `solicitó incobrable: ${String(ev.despues?.motivo ?? "—")}`;
    case "incobrable_autorizado": return `autorizó el incobrable${nota(ev.despues)}`;
    case "incobrable_rechazado": return `rechazó el incobrable${nota(ev.despues)}`;
    case "incobrable_reabierto": return `reabrió el recobro${nota(ev.despues)}`;
  }
}
