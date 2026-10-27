"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, History, Loader2, Search } from "lucide-react";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { sinTildes } from "@/lib/tabla/filtros";
import { ETAPA_LABEL, ETAPAS_CAJA, etapaSolicitud, esSinVer, VALOR_MAXIMO_RECOBRO, type CobroEstado, type Etapa } from "@/lib/tesoreria/recobros-camaras";
import type { EventoSolicitud, SolicitudRecobro } from "@/lib/tesoreria/recobros-camaras-data";
import { listarEventosSolicitud, marcarRespuestaVista, registrarCobroRecobro } from "./actions";

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const pesos = (n: number | null) => (n == null ? "—" : `$ ${n.toLocaleString("es-CO")}`);
const cuando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "—";

const ESTILO_ETAPA: Record<Etapa, string> = {
  en_camaras: "bg-slate-100 text-slate-700",
  sin_revisar: "bg-red-100 text-red-800",
  cerrada: "bg-emerald-100 text-emerald-800",
  pendiente_caja: "bg-amber-100 text-amber-800",
  cobrado: "bg-emerald-100 text-emerald-800",
  no_cobrado: "bg-slate-200 text-slate-800",
};
const ORDEN_ETAPAS: Etapa[] = ["sin_revisar", "pendiente_caja", "en_camaras", "cobrado", "no_cobrado", "cerrada"];

/**
 * Pestaña Solicitudes a cámaras. Filtra en el navegador sobre todas las
 * solicitudes ya cargadas. Cartulina marca vistas las respuestas; caja registra
 * el cobro del recobro (al conductor del viaje). Tras cada acción se refresca
 * el servidor para que el contador de la pestaña cuadre.
 */
export function SolicitudesCamarasClient({ solicitudes: iniciales, disponible, etapaInicial, hoy, puedeVer, puedeCobrar, deCartulina, soloCaja = false }: {
  solicitudes: SolicitudRecobro[];
  disponible: boolean;
  etapaInicial: Etapa | null;
  hoy: string;
  /** Cartulina con edición: puede marcar vistas. */
  puedeVer: boolean;
  /** Caja con edición: puede registrar el cobro. */
  puedeCobrar: boolean;
  /** Tiene la revisión del día: se le ofrece abrir el viaje. */
  deCartulina: boolean;
  /** Cajero sin cartulina: solo recobros (ya filtrados en el servidor) y su cobro. */
  soloCaja?: boolean;
}) {
  const [solicitudes, setSolicitudes] = useState(iniciales);
  const [etapa, setEtapa] = useState<Etapa | "">(etapaInicial ?? "");
  const [resultado, setResultado] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [buscar, setBuscar] = useState("");
  const router = useRouter();

  const conEtapa = useMemo(() => solicitudes.map((s) => ({ s, etapa: etapaSolicitud(s) })), [solicitudes]);
  const conteo = useMemo(() => {
    const c = new Map<Etapa, number>();
    for (const x of conEtapa) c.set(x.etapa, (c.get(x.etapa) ?? 0) + 1);
    return c;
  }, [conEtapa]);
  const sinVer = useMemo(() => solicitudes.filter(esSinVer).length, [solicitudes]);

  const filtradas = useMemo(() => {
    const q = sinTildes(buscar.trim());
    return conEtapa.filter(({ s, etapa: e }) => {
      // "Sin revisar" incluye los recobros sin visto aunque ya estén en caja.
      if (etapa === "sin_revisar" ? !esSinVer(s) : etapa && e !== etapa) return false;
      if (resultado && s.resultado !== resultado) return false;
      if (desde && s.fechaViaje < desde) return false;
      if (hasta && s.fechaViaje > hasta) return false;
      if (q) {
        const texto = sinTildes([s.conductorNombre, s.conductorCedula, s.vehiculoCodigo, s.placa, String(s.numero), s.ruta].filter(Boolean).join(" "));
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [conEtapa, etapa, resultado, desde, hasta, buscar]);
  const p = usePaginacion(filtradas, { reiniciar: `${etapa}|${resultado}|${desde}|${hasta}|${buscar}` });

  function actualizar(s: SolicitudRecobro) {
    setSolicitudes((prev) => prev.map((x) => (x.id === s.id ? s : x)));
    router.refresh();
  }

  if (!disponible) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Falta aplicar la migración <code>20261026213310_seguimiento_de_recobros_de_camaras_en_cartulina_y_caja.sql</code> en el SQL Editor.
          Hasta entonces esta pestaña no puede mostrar las solicitudes ni el cobro.
        </p>
      </div>
    );
  }

  const chip = (key: Etapa | "", label: string, n: number) => (
    <button
      key={key || "todas"}
      type="button"
      onClick={() => setEtapa(key)}
      aria-pressed={etapa === key}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
        etapa === key ? "bg-[#4F46E5] text-white" : "border border-[#E2E8F0] bg-white text-gray-600 hover:bg-[#F8FAFC]"
      }`}
    >
      {label}
      <span className={`text-xs ${etapa === key ? "text-indigo-100" : key === "sin_revisar" || key === "pendiente_caja" ? "font-semibold text-[#DC2626]" : "text-gray-400"}`}>{n}</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap gap-2">
        {chip("", "Todas", solicitudes.length)}
        {(soloCaja ? ETAPAS_CAJA : ORDEN_ETAPAS).map((e) => chip(e, ETAPA_LABEL[e], e === "sin_revisar" ? sinVer : conteo.get(e) ?? 0))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-3">
        <label className="flex w-full flex-col gap-1 text-xs font-medium text-gray-500 sm:w-auto">
          Buscar
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Conductor, cédula, bus, placa o despacho" className={`${inputCls} w-full pl-8 sm:w-72`} />
          </span>
        </label>
        {!soloCaja && (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
            Resultado
            <select value={resultado} onChange={(e) => setResultado(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              <option value="recobro">Recobro</option>
              <option value="normalidad_timbradas">Normalidad de timbradas</option>
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
          {p.filas.map(({ s, etapa: e }) => (
            <Tarjeta key={s.id} s={s} etapa={e} hoy={hoy} puedeVer={puedeVer} puedeCobrar={puedeCobrar} deCartulina={deCartulina} soloCaja={soloCaja} onCambio={actualizar} />
          ))}
        </ul>
      )}
      <Paginador p={p} unidad="solicitudes" />
    </div>
  );
}

function Tarjeta({ s, etapa, hoy, puedeVer, puedeCobrar, deCartulina, soloCaja, onCambio }: {
  s: SolicitudRecobro;
  etapa: Etapa;
  hoy: string;
  puedeVer: boolean;
  puedeCobrar: boolean;
  deCartulina: boolean;
  soloCaja: boolean;
  onCambio: (s: SolicitudRecobro) => void;
}) {
  const [marcando, startVisto] = useTransition();
  const [editando, setEditando] = useState(false);
  const [historial, setHistorial] = useState<EventoSolicitud[] | null>(null);
  const [cargandoHist, startHist] = useTransition();
  // El visto es asunto de cartulina: al cajero no se le muestra.
  const sinVer = !soloCaja && esSinVer(s);

  function visto() {
    startVisto(async () => {
      const r = await marcarRespuestaVista(s.id);
      if (r.success && r.solicitud) {
        onCambio(r.solicitud);
        toast.success("Respuesta marcada como vista.");
      } else toast.error(r.error ?? "No se pudo marcar.");
    });
  }

  function verHistorial() {
    if (historial) return setHistorial(null);
    startHist(async () => {
      const r = await listarEventosSolicitud(s.id);
      if (r.success) setHistorial((r.eventos ?? []).filter((ev) => !soloCaja || ev.accion !== "visto"));
      else toast.error(r.error ?? "No se pudo leer el historial.");
    });
  }

  return (
    <li className={`rounded-xl border bg-white p-4 ${sinVer ? "border-red-300" : "border-[#E2E8F0]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900">
              Bus {s.vehiculoCodigo ?? "—"} · placa {s.placa ?? "—"} · viaje {s.viaje ?? "—"}
            </p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_ETAPA[etapa]}`}>{ETAPA_LABEL[etapa]}</span>
            {sinVer && etapa !== "sin_revisar" && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Sin revisar en cartulina</span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {s.fechaViaje} · despacho n.º {s.numero} · {s.ruta ?? "Sin ruta"}
          </p>
          <p className="text-xs text-gray-500">
            Conductor: {s.conductorNombre ?? "Sin conductor"}{s.conductorCedula ? ` · CC ${s.conductorCedula}` : ""}
          </p>
          {!soloCaja && (
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
            <span className="font-semibold">Cámaras: {s.resultado === "recobro" ? "Recobro" : "Normalidad de timbradas"}</span>
            {s.notaCamaras ? ` · ${s.notaCamaras}` : ""}
            <span className="block text-xs opacity-80">Por {s.resueltoPorEmail ?? "—"} · {cuando(s.resueltoAt)}</span>
            {s.vistoAt && !soloCaja && <span className="block text-xs opacity-80">Vista en cartulina por {s.vistoPorEmail ?? "—"} · {cuando(s.vistoAt)}</span>}
          </div>
          {sinVer && puedeVer && (
            <button
              type="button"
              onClick={visto}
              disabled={marcando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50"
            >
              {marcando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Marcar visto
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">Esperando la revisión de cámaras.</p>
      )}

      {s.estado === "resuelto" && s.resultado === "recobro" && (
        <div className="mt-3 border-t border-[#F1F5F9] pt-3">
          {editando ? (
            <FormCobro s={s} hoy={hoy} onCancelar={() => setEditando(false)} onGuardado={(n) => { setEditando(false); setHistorial(null); onCambio(n); }} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <ResumenCobro s={s} />
              {puedeCobrar && (
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${s.cobroEstado ? "border border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC]" : "bg-amber-600 text-white hover:bg-amber-700"}`}
                >
                  {s.cobroEstado ? "Corregir cobro" : "Registrar cobro"}
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
      <p className="text-emerald-800">
        <span className="font-semibold">Cobrado {pesos(s.cobroValor)}</span> el {s.cobroFecha} · recibo {s.cobroSoporte}
        {s.cobroNota ? ` · ${s.cobroNota}` : ""}
        <span className="block text-xs text-gray-500">Caja: {s.cobroPorEmail ?? "—"} · {cuando(s.cobroAt)}</span>
      </p>
    );
  }
  if (s.cobroEstado === "no_cobrado") {
    return (
      <p className="text-slate-800">
        <span className="font-semibold">No cobrado</span> · {s.cobroMotivo}
        {s.cobroNota ? ` · ${s.cobroNota}` : ""}
        <span className="block text-xs text-gray-500">Caja: {s.cobroPorEmail ?? "—"} · {cuando(s.cobroAt)}</span>
      </p>
    );
  }
  return <p className="font-medium text-amber-800">Pendiente de caja: ¿se le cobró al conductor?</p>;
}

function FormCobro({ s, hoy, onCancelar, onGuardado }: {
  s: SolicitudRecobro;
  hoy: string;
  onCancelar: () => void;
  onGuardado: (s: SolicitudRecobro) => void;
}) {
  const [estado, setEstado] = useState<CobroEstado>(s.cobroEstado ?? "cobrado");
  const [valor, setValor] = useState(s.cobroValor != null ? String(s.cobroValor) : "");
  const [fecha, setFecha] = useState(s.cobroFecha ?? hoy);
  const [soporte, setSoporte] = useState(s.cobroSoporte ?? "");
  const [motivo, setMotivo] = useState(s.cobroMotivo ?? "");
  const [nota, setNota] = useState(s.cobroNota ?? "");
  const [guardando, start] = useTransition();

  function guardar() {
    start(async () => {
      const limpio = valor.replace(/[.\s$]/g, "");
      const r = await registrarCobroRecobro(s.id, {
        estado,
        valor: limpio === "" ? null : Number(limpio),
        fecha, soporte, motivo, nota,
      });
      if (r.success && r.solicitud) {
        toast.success(s.cobroEstado ? "Cobro corregido." : "Cobro registrado.");
        onGuardado(r.solicitud);
      } else toast.error(r.error ?? "No se pudo guardar.");
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700">
        Recobro al conductor <span className="font-semibold">{s.conductorNombre ?? "sin conductor"}</span>
        {s.conductorCedula ? ` · CC ${s.conductorCedula}` : ""}
      </p>
      <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="¿Se cobró?">
        {(["cobrado", "no_cobrado"] as CobroEstado[]).map((e) => (
          <label key={e} className="inline-flex items-center gap-1.5">
            <input type="radio" name={`cobro-${s.id}`} checked={estado === e} onChange={() => setEstado(e)} />
            {e === "cobrado" ? "Sí se cobró" : "No se cobró"}
          </label>
        ))}
      </div>
      {estado === "cobrado" ? (
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
      ) : (
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Motivo por el que no se cobró
          <textarea value={motivo} maxLength={500} rows={2} onChange={(e) => setMotivo(e.target.value)} className="rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-gray-900" />
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
        Nota (opcional)
        <textarea value={nota} maxLength={500} rows={2} onChange={(e) => setNota(e.target.value)} className="rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm text-gray-900" />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={guardar} disabled={guardando} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4338CA] disabled:opacity-50">
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
        </button>
        <button type="button" onClick={onCancelar} disabled={guardando} className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC]">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function describirCobro(c: Record<string, unknown> | null): string {
  if (!c) return "—";
  if (c.estado === "cobrado") return `cobrado ${pesos(c.valor == null ? null : Number(c.valor))} el ${c.fecha ?? "—"}, recibo ${c.soporte ?? "—"}`;
  if (c.estado === "no_cobrado") return `no cobrado (${c.motivo ?? "—"})`;
  return "sin gestión";
}

function describirEvento(ev: EventoSolicitud): string {
  if (ev.accion === "visto") return "marcó vista la respuesta";
  if (ev.accion === "cobro_registrado") return `registró: ${describirCobro(ev.despues)}`;
  return `corrigió: ${describirCobro(ev.antes)} → ${describirCobro(ev.despues)}`;
}
