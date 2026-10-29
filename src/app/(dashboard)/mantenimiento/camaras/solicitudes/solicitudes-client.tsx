"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, ExternalLink, Hand } from "lucide-react";
import type { FiltroSolicitudes, SolicitudBandeja } from "@/lib/mantenimiento/camaras-data";
import {
  diasHabilesEntre, estadoRecobro, RESULTADO_REVISION_LABEL, semaforo, valorDeDiferencia,
  type ResultadoRevision, type Semaforo, type Tarifas,
} from "@/lib/tesoreria/recobros";
import { ActualizarGemaRecobros } from "@/components/tesoreria/actualizar-gema-recobros";
import { usePermisos } from "@/components/permisos/permisos-provider";
import {
  activarSolicitudesDesdeAbonos, actualizarSolicitudesDesdeGema, resolverSolicitudCamaras, tomarSolicitudCamaras,
} from "../actions";

const FILTROS: { key: FiltroSolicitudes; label: string }[] = [
  { key: "pendiente", label: "Pendientes" },
  { key: "resuelto", label: "Resueltas" },
  { key: "anulada", label: "Anuladas" },
  { key: "todas", label: "Todas" },
];

const ORIGEN_LABEL: Record<SolicitudBandeja["origen"], string> = {
  abono_gema: "Abono GEMA",
  cartulina: "Revisión cartulina",
  mantenimiento: "Mantenimiento",
  migracion: "Migración",
};

const COLOR_SEMAFORO: Record<Semaforo, string> = {
  verde: "bg-emerald-500",
  ambar: "bg-amber-500",
  rojo: "bg-red-500",
  gris: "bg-slate-300",
};

const ESTILO_RESULTADO: Record<ResultadoRevision, string> = {
  recobro: "border-amber-200 bg-amber-50 text-amber-900",
  normalidad_timbradas: "border-emerald-200 bg-emerald-50 text-emerald-900",
  sin_conteo: "border-violet-200 bg-violet-50 text-violet-900",
};

const pesos = (n: number) => `$${n.toLocaleString("es-CO")}`;
const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "—";

/** Estado y semáforo de la solicitud con las mismas reglas del módulo de Recobros. */
function estadoDe(s: SolicitudBandeja, hoy: string) {
  const e = estadoRecobro(
    {
      tipo: s.tipo, origen: s.origen, fechaViaje: s.fecha_viaje, solicitadoAt: s.solicitado_at, abonoFecha: s.abono_fecha,
      anuladaAt: s.anulada_at, tomadoAt: s.tomado_at, estado: s.estado, resultado: s.resultado, resueltoAt: s.resuelto_at,
      subgerenciaDecision: null, subgerenciaAt: null, valorRecobro: s.valor_recobro, cobroEstado: null, cobroAt: null,
      incobrableSolicitadoAt: null, liquidacionMarcadaAt: null,
    },
    [],
    hoy,
  );
  // Para Mantenimiento, lo resuelto ya no corre: el cobro lo sigue Tesorería.
  const pendiente = s.estado === "pendiente" && !s.anulada_at;
  return { e, dias: diasHabilesEntre(e.desde, hoy), color: pendiente ? semaforo(e, hoy) : ("gris" as Semaforo) };
}

export function SolicitudesClient({
  solicitudes,
  estado,
  hoy,
  tarifas,
  puedeEditar,
  esAdmin,
  arranqueAbonos,
  actualizadoAt,
  errorGema,
  error,
}: {
  solicitudes: SolicitudBandeja[];
  estado: FiltroSolicitudes;
  hoy: string;
  tarifas: Tarifas;
  puedeEditar: boolean;
  esAdmin: boolean;
  arranqueAbonos: string | null;
  actualizadoAt: string | null;
  errorGema: string | null;
  error: string | null;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {/column .* does not exist|tesoreria_camaras_solicitudes/.test(error)
            ? "Falta aplicar la migración del módulo de Recobros (20261029184904)."
            : error}
        </p>
      )}

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <ActualizarGemaRecobros accion={actualizarSolicitudesDesdeGema} actualizadoAt={actualizadoAt} error={errorGema} />
        <ArranqueAbonos arranque={arranqueAbonos} esAdmin={esAdmin} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.key}
            href={`/mantenimiento/camaras/solicitudes?estado=${f.key}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              estado === f.key ? "bg-[#4F46E5] text-white" : "border border-[#E2E8F0] bg-white text-gray-600"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {solicitudes.length === 0 ? (
        <p className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-10 text-center text-sm text-gray-400">
          No hay solicitudes {FILTROS.find((f) => f.key === estado)?.label.toLowerCase()}.
        </p>
      ) : (
        <ul className="space-y-3">
          {solicitudes.map((s) => (
            <SolicitudCard key={s.id} s={s} hoy={hoy} tarifas={tarifas} puedeEditar={puedeEditar} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Interruptor de las solicitudes desde abonos (D2: solo los abonos desde el día en que se enciende). */
function ArranqueAbonos({ arranque, esAdmin }: { arranque: string | null; esAdmin: boolean }) {
  const [guardando, start] = useTransition();
  const cambiar = (activar: boolean) =>
    start(async () => {
      const r = await activarSolicitudesDesdeAbonos(activar);
      if (r.ok) toast.success(activar ? `Solicitudes desde abonos activas desde ${r.desde}.` : "Solicitudes desde abonos apagadas.");
      else toast.error(r.error ?? "No se pudo cambiar.");
    });
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {arranque ? (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
          Abonos «REVISIÓN CÁMARA» → solicitud, desde {arranque}
        </span>
      ) : (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
          Solicitudes desde abonos de GEMA: apagadas
        </span>
      )}
      {esAdmin && (
        <button
          type="button"
          disabled={guardando}
          onClick={() => {
            if (!arranque && !confirm("Desde hoy, cada abono «REVISIÓN CÁMARA» de GEMA abrirá una solicitud de revisión. Los abonos anteriores no se cargan. ¿Activar?")) return;
            cambiar(!arranque);
          }}
          className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-0.5 font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50"
        >
          {arranque ? "Apagar" : "Activar desde hoy"}
        </button>
      )}
    </div>
  );
}

function SolicitudCard({
  s, hoy, tarifas, puedeEditar,
}: { s: SolicitudBandeja; hoy: string; tarifas: Tarifas; puedeEditar: boolean }) {
  // El enlace a Revisión cartulina solo para quien puede abrirla: el
  // personal de cámaras (rol Mantenimiento) no tiene Tesorería.
  const veCartulina = usePermisos()("tesoreria.cartulina.ver");
  const [nota, setNota] = useState("");
  const [conteo, setConteo] = useState("");
  const [guardando, start] = useTransition();
  const pendiente = s.estado === "pendiente" && !s.anulada_at;
  const { e, dias, color } = estadoDe(s, hoy);

  const conteoNum = conteo.trim() === "" ? null : Number(conteo);
  const dif = conteoNum != null && Number.isInteger(conteoNum) && s.timbradasGema != null ? conteoNum - s.timbradasGema : null;
  const valor = dif != null && dif > 0 ? valorDeDiferencia(dif, s.pasajeGema, s.fecha_viaje, tarifas) : null;

  function tomar() {
    start(async () => {
      const r = await tomarSolicitudCamaras(s.id);
      if (r.success) toast.success("Revisión tomada.");
      else toast.error(r.error ?? "No se pudo tomar.");
    });
  }

  function resolver(resultado: ResultadoRevision) {
    start(async () => {
      const r = await resolverSolicitudCamaras({ id: s.id, resultado, conteo: resultado === "sin_conteo" ? null : conteoNum, nota });
      if (r.success) {
        (r.avisos ?? []).forEach((a) => toast.warning(a));
        toast.success(`Solicitud resuelta: ${RESULTADO_REVISION_LABEL[resultado]}.`);
      } else {
        toast.error(r.error ?? "No se pudo resolver.");
      }
    });
  }

  return (
    <li className="relative overflow-hidden rounded-xl border border-[#E2E8F0] bg-white p-4 pl-5">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${COLOR_SEMAFORO[color]}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">
            Bus {s.vehiculo_codigo ?? "—"} · placa {s.placa ?? "—"} · viaje {s.viaje ?? "—"}
          </p>
          <p className="text-xs text-gray-500">
            {s.fecha_viaje} · despacho n.º {s.numero} · {s.ruta ?? "Sin ruta"}
          </p>
          <p className="text-xs text-gray-500">
            {s.conductor_nombre ?? "Sin conductor"}
            {s.conductor_cedula ? ` (${s.conductor_cedula})` : ""}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{ORIGEN_LABEL[s.origen]}</span>
            {pendiente && (
              <span className="font-medium text-gray-600">
                {s.tomado_at ? `En revisión (${s.tomado_por_email ?? "—"})` : "Sin tomar"} · {dias}{" "}
                {dias === 1 ? "día hábil" : "días hábiles"} en espera
              </span>
            )}
            <span>Solicitada {fmt(s.solicitado_at)}{s.solicitado_por_email ? ` por ${s.solicitado_por_email}` : ""}</span>
          </p>
          {s.nota_solicitud && <p className="mt-1 text-sm text-gray-700">“{s.nota_solicitud}”</p>}
          {s.alertas.includes("abono_anulado_en_gema") && (
            <p className="mt-1 text-xs font-medium text-red-700">GEMA anuló el abono de esta solicitud después de tomarla.</p>
          )}
        </div>
        {veCartulina && (
          <Link
            href={`/tesoreria/revision-cartulina?fecha=${s.fecha_viaje}`}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#4F46E5] hover:underline"
            title="Ver en Revisión cartulina"
          >
            Cartulina <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {s.anulada_at ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Anulada · {s.anulada_motivo ?? "GEMA anuló el abono."} <span className="text-xs">({fmt(s.anulada_at)})</span>
        </p>
      ) : !pendiente ? (
        <Resultado s={s} />
      ) : puedeEditar ? (
        <div className="mt-3 space-y-2 border-t border-[#F1F5F9] pt-3">
          {s.revisiones.length > 0 && (
            <div className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs text-gray-600">
              <p className="font-medium text-gray-700">Ya registrado por el formulario:</p>
              <ul className="mt-1 space-y-0.5">
                {s.revisiones.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2">
                    <span>
                      {r.elemento === "camara" ? "Cámara" : "Sensor"} · {r.tipo_novedad}
                      {r.aforo != null ? ` · conteo ${r.aforo}` : ""} · {r.tecnico_email ?? "—"} · {fmt(r.created_at)}
                    </span>
                    {r.aforo != null && (
                      <button type="button" onClick={() => setConteo(String(r.aforo))} className="font-medium text-[#4F46E5] hover:underline">
                        Usar este conteo
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              Pasajeros contados en el video
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={500}
                value={conteo}
                onChange={(ev) => setConteo(ev.target.value)}
                className="w-32 rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm"
              />
            </label>
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              <div>
                <dt className="inline text-gray-400">Registradora (GEMA): </dt>
                <dd className="inline font-semibold">{s.timbradasGema ?? "sin dato"}</dd>
              </div>
              {dif != null && (
                <div>
                  <dt className="inline text-gray-400">Diferencia: </dt>
                  <dd className={`inline font-semibold ${dif > 0 ? "text-red-700" : "text-emerald-700"}`}>{dif}</dd>
                </div>
              )}
              {valor && (
                <div>
                  <dt className="inline text-gray-400">Valor: </dt>
                  <dd className="inline font-semibold text-red-700">
                    {pesos(valor.valor)} <span className="font-normal text-gray-400">({pesos(valor.pasaje)} c/u)</span>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <textarea
            value={nota}
            onChange={(ev) => setNota(ev.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Nota de la revisión (obligatoria si no hay conteo)"
            className="w-full rounded-lg border border-[#E2E8F0] px-2.5 py-1.5 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {!s.tomado_at && (
              <button
                type="button"
                onClick={tomar}
                disabled={guardando}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                <Hand className="h-4 w-4" /> Tomar revisión
              </button>
            )}
            <button
              type="button"
              onClick={() => resolver("recobro")}
              disabled={guardando || dif == null || dif <= 0}
              title={dif == null ? "Escriba el conteo del video" : dif <= 0 ? "El conteo no supera la registradora" : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Recobro
            </button>
            <button
              type="button"
              onClick={() => resolver("normalidad_timbradas")}
              disabled={guardando || (dif != null && dif > 0)}
              title={dif != null && dif > 0 ? "El conteo da diferencia: es un recobro" : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Sin recobro
            </button>
            <button
              type="button"
              onClick={() => resolver("sin_conteo")}
              disabled={guardando || conteo.trim() !== "" || !nota.trim()}
              title={conteo.trim() !== "" ? "Con conteo elija Recobro o Sin recobro" : !nota.trim() ? "Explique por qué no hay conteo" : undefined}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Sin conteo (decide subgerencia)
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">
          {e.estado === "en_revision" ? "En revisión" : "Pendiente"} · tu usuario es de solo consulta.
        </p>
      )}
    </li>
  );
}

function Resultado({ s }: { s: SolicitudBandeja }) {
  const res = s.resultado ?? "normalidad_timbradas";
  return (
    <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${ESTILO_RESULTADO[res]}`}>
      <span className="font-semibold">{RESULTADO_REVISION_LABEL[res]}</span>
      {s.conteo_camara != null && (
        <span>
          {" "}· conteo {s.conteo_camara}, registradora {s.timbradas_registradora ?? "—"}
          {s.diferencia != null ? `, diferencia ${s.diferencia}` : ""}
          {s.valor_recobro ? ` · ${pesos(s.valor_recobro)}` : ""}
        </span>
      )}
      {s.nota_camaras ? ` · ${s.nota_camaras}` : ""}
      <span className="block text-xs opacity-80">
        Por {s.resuelto_por_email ?? "—"} · {fmt(s.resuelto_at)}
      </span>
    </div>
  );
}
