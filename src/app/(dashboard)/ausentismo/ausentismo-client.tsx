"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarOff, CalendarDays, Search, Plus, X, Check, Loader2, Pencil,
  Trash2, TriangleAlert, Phone, Bus,
} from "lucide-react";
import { toast } from "sonner";
import {
  TIPOS_AUSENCIA, CONTACTOS, SOPORTES,
  TIPO_LABEL, CONTACTO_LABEL, SOPORTE_LABEL,
  REINCIDENCIA_DIAS, REINCIDENCIA_MINIMO,
  etiquetaVehiculo,
  type AusentismoRegistro, type VehiculoOpcion,
} from "@/lib/ausentismo/constants";
import type { Reincidente } from "@/lib/ausentismo/data";
import { crearRegistro, actualizarRegistro, eliminarRegistro, type RegistroInput } from "./actions";

type ConductorBusqueda = {
  cedula: string;
  nombre: string;
  codigo: string | null;
  estado: string | null;
};

const TIPO_COLOR: Record<string, { bg: string; color: string }> = {
  incapacidad: { bg: "#FEE2E2", color: "#DC2626" },
  no_justificada: { bg: "#FEF3C7", color: "#B45309" },
  suspension: { bg: "#FEE2E2", color: "#DC2626" },
  renuncia: { bg: "#F1F5F9", color: "#64748B" },
  vacaciones: { bg: "#D1FAE5", color: "#059669" },
  descanso: { bg: "#D1FAE5", color: "#059669" },
};

function tipoBadge(tipo: string) {
  const c = TIPO_COLOR[tipo] ?? { bg: "#E0E7FF", color: "#4338CA" };
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.color }}
    >
      {TIPO_LABEL[tipo] ?? tipo}
    </span>
  );
}

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]";

export function AusentismoClient({
  tab, hoy, fecha, desde, hasta, tipoFiltro, query,
  registrosDia, historial, reincidentes, vehiculos,
}: {
  tab: "dia" | "historial" | "reincidentes";
  hoy: string;
  fecha: string;
  desde: string;
  hasta: string;
  tipoFiltro: string;
  query: string;
  registrosDia: AusentismoRegistro[];
  historial: AusentismoRegistro[];
  reincidentes: Reincidente[];
  vehiculos: VehiculoOpcion[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<AusentismoRegistro | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  function irA(params: Record<string, string>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    router.push(`/ausentismo?${sp.toString()}`);
  }

  const totalesDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of registrosDia) m.set(r.tipo, (m.get(r.tipo) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [registrosDia]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CalendarOff className="h-5 w-5 text-[#4F46E5]" />
            <h1 className="text-xl font-semibold text-gray-900">
              Recursos Humanos · Ausentismo
            </h1>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
            {(
              [
                { v: "dia", l: "Registro del día" },
                { v: "historial", l: "Historial" },
                { v: "reincidentes", l: "Reincidentes" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => irA({ tab: o.v })}
                className={`px-3 py-2 text-sm font-medium ${
                  tab === o.v
                    ? "bg-[#4F46E5] text-white"
                    : "bg-white text-gray-600 hover:bg-[#F8FAFC]"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        {tab === "dia" && (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-600">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Fecha
                </span>
                <span className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="date"
                    value={fecha}
                    max={hoy}
                    onChange={(e) =>
                      e.target.value && irA({ tab: "dia", fecha: e.target.value })
                    }
                    className="border-0 bg-transparent text-sm outline-none"
                  />
                </span>
              </label>
              <button
                onClick={() => {
                  setEditando(null);
                  setMostrarForm((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-2 text-sm font-medium text-white hover:bg-[#4338CA]"
              >
                {mostrarForm && !editando ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {mostrarForm && !editando ? "Cancelar" : "Registrar ausente"}
              </button>
            </div>

            {(mostrarForm || editando) && (
              <RegistroForm
                key={editando?.id ?? "nuevo"}
                fecha={fecha}
                hoy={hoy}
                registro={editando}
                vehiculos={vehiculos}
                onDone={() => {
                  setMostrarForm(false);
                  setEditando(null);
                  router.refresh();
                }}
              />
            )}

            {totalesDia.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {totalesDia.map(([tipo, n]) => (
                  <span
                    key={tipo}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs text-gray-600"
                  >
                    {tipoBadge(tipo)} <strong>{n}</strong>
                  </span>
                ))}
                <span className="inline-flex items-center rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
                  Total: {registrosDia.length}
                </span>
              </div>
            )}

            <TablaRegistros
              registros={registrosDia}
              conFecha={false}
              onEditar={(r) => {
                setEditando(r);
                setMostrarForm(false);
              }}
              vacio={`Sin ausentes registrados el ${fecha}.`}
            />
          </>
        )}

        {tab === "historial" && (
          <>
            <HistorialFiltros
              desde={desde}
              hasta={hasta}
              hoy={hoy}
              tipoFiltro={tipoFiltro}
              query={query}
              onAplicar={(f) => irA({ tab: "historial", ...f })}
            />
            <TablaRegistros
              registros={historial}
              conFecha
              onEditar={(r) => setEditando(r)}
              vacio="Sin registros en el rango elegido."
            />
            {editando && tab === "historial" && (
              <RegistroForm
                key={editando.id}
                fecha={editando.fecha}
                hoy={hoy}
                registro={editando}
                vehiculos={vehiculos}
                onDone={() => {
                  setEditando(null);
                  router.refresh();
                }}
              />
            )}
          </>
        )}

        {tab === "reincidentes" && (
          <>
            <p className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2 text-xs text-[#92400E]">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Conductores con {REINCIDENCIA_MINIMO}+ ausencias en los últimos{" "}
              {REINCIDENCIA_DIAS} días (sin contar vacaciones ni descansos) o con
              soportes pendientes por entregar. Se calcula del propio registro.
            </p>
            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2">Conductor</th>
                      <th className="px-4 py-2">Teléfono</th>
                      <th className="px-4 py-2 text-right">Ausencias (30 d)</th>
                      <th className="px-4 py-2 text-right">No justificadas</th>
                      <th className="px-4 py-2 text-right">Soportes pendientes</th>
                      <th className="px-4 py-2">Detalle</th>
                      <th className="px-4 py-2">Última</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reincidentes.map((r) => (
                      <tr key={r.cedula} className="border-b border-[#F1F5F9]">
                        <td className="px-4 py-2">
                          <p className="font-medium text-gray-900">
                            {r.codigo ? `${r.codigo} · ` : ""}
                            {r.nombre}
                          </p>
                          <p className="text-xs text-gray-500">CC {r.cedula}</p>
                        </td>
                        <td className="px-4 py-2 text-gray-600">
                          {r.telefono ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3 text-gray-400" /> {r.telefono}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">{r.total}</td>
                        <td
                          className={`px-4 py-2 text-right ${
                            r.noJustificadas > 0 ? "font-semibold text-amber-600" : ""
                          }`}
                        >
                          {r.noJustificadas}
                        </td>
                        <td
                          className={`px-4 py-2 text-right ${
                            r.soportesPendientes > 0 ? "font-semibold text-red-600" : ""
                          }`}
                        >
                          {r.soportesPendientes}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          {Object.entries(r.tipos)
                            .map(([t, n]) => `${TIPO_LABEL[t] ?? t}: ${n}`)
                            .join(" · ")}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">{r.ultimaFecha}</td>
                      </tr>
                    ))}
                    {reincidentes.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                          Sin reincidentes ni soportes pendientes en los últimos{" "}
                          {REINCIDENCIA_DIAS} días.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HistorialFiltros({
  desde, hasta, hoy, tipoFiltro, query, onAplicar,
}: {
  desde: string;
  hasta: string;
  hoy: string;
  tipoFiltro: string;
  query: string;
  onAplicar: (f: Record<string, string>) => void;
}) {
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);
  const [t, setT] = useState(tipoFiltro);
  const [q, setQ] = useState(query);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Desde</span>
        <input type="date" value={d} max={hoy} onChange={(e) => setD(e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Hasta</span>
        <input type="date" value={h} min={d} max={hoy} onChange={(e) => setH(e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Tipo</span>
        <select value={t} onChange={(e) => setT(e.target.value)} className={inputCls}>
          <option value="">Todos</option>
          {TIPOS_AUSENCIA.map((x) => (
            <option key={x.key} value={x.key}>{x.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Conductor
        </span>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, cédula o código"
            className={`${inputCls} w-52 pl-8`}
          />
        </div>
      </label>
      <button
        onClick={() => onAplicar({ desde: d, hasta: h, tipo: t, q })}
        className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
      >
        <Search className="h-4 w-4" /> Buscar
      </button>
    </div>
  );
}

function TablaRegistros({
  registros, conFecha, onEditar, vacio,
}: {
  registros: AusentismoRegistro[];
  conFecha: boolean;
  onEditar: (r: AusentismoRegistro) => void;
  vacio: string;
}) {
  const [pending, start] = useTransition();

  function eliminar(r: AusentismoRegistro) {
    const ok = window.confirm(
      `¿Eliminar el registro de ${r.nombre} del ${r.fecha}?\n\n` +
        "La eliminación queda registrada en la bitácora del módulo."
    );
    if (!ok) return;
    start(async () => {
      const res = await eliminarRegistro(r.id);
      if (res.success) toast.success("Registro eliminado (quedó en la bitácora)");
      else toast.error(res.error ?? "No se pudo eliminar");
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
              {conFecha && <th className="px-4 py-2">Fecha</th>}
              <th className="px-4 py-2">Conductor</th>
              <th className="px-4 py-2">Vehículo</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Periodo</th>
              <th className="px-4 py-2">Justificación</th>
              <th className="px-4 py-2">Incapacidad</th>
              <th className="px-4 py-2">Reintegro</th>
              <th className="px-4 py-2">Soporte</th>
              <th className="px-4 py-2">Teléfono</th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id} className="border-b border-[#F1F5F9]">
                {conFecha && <td className="px-4 py-2 font-medium">{r.fecha}</td>}
                <td className="px-4 py-2">
                  <p className="font-medium text-gray-900">
                    {r.codigo ? `${r.codigo} · ` : ""}
                    {r.nombre}
                  </p>
                  <p className="text-xs text-gray-500">CC {r.cedula}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600">
                  {r.codigo_vehiculo ? (
                    <span className="inline-flex items-center gap-1">
                      <Bus className="h-3 w-3 text-gray-400" />
                      {etiquetaVehiculo({
                        codigo: r.codigo_vehiculo,
                        placa: r.vehiculos?.placa ?? null,
                      })}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2">
                  {tipoBadge(r.tipo)}
                  {r.contacto && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      {CONTACTO_LABEL[r.contacto] ?? r.contacto}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600">
                  {r.fecha_inicio
                    ? `${r.fecha_inicio} → ${r.fecha_fin ?? "…"}`
                    : "—"}
                </td>
                <td className="max-w-56 px-4 py-2 text-xs text-gray-600">
                  {r.justificacion || "—"}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">
                  {r.incapacidad_inicio
                    ? `${r.incapacidad_inicio} → ${r.incapacidad_fin ?? "…"}`
                    : "—"}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">{r.reintegro ?? "—"}</td>
                <td className="px-4 py-2">
                  {r.soporte === "pendiente" ? (
                    <span className="inline-flex whitespace-nowrap rounded-full bg-[#FEE2E2] px-2 py-0.5 text-xs font-medium text-[#DC2626]">
                      {SOPORTE_LABEL.pendiente}
                    </span>
                  ) : r.soporte === "presentado" ? (
                    <span className="inline-flex whitespace-nowrap rounded-full bg-[#D1FAE5] px-2 py-0.5 text-xs font-medium text-[#059669]">
                      {SOPORTE_LABEL.presentado}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                  {r.soporte_observaciones && (
                    <p
                      className="mt-0.5 max-w-48 truncate text-xs text-gray-500"
                      title={r.soporte_observaciones}
                    >
                      {r.soporte_observaciones}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">{r.telefono ?? "—"}</td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => onEditar(r)}
                      disabled={pending}
                      title="Editar (queda en la bitácora)"
                      className="rounded-lg border border-[#E2E8F0] p-1.5 text-gray-500 hover:bg-[#F8FAFC] disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => eliminar(r)}
                      disabled={pending}
                      title="Eliminar (queda en la bitácora)"
                      className="rounded-lg border border-[#FECACA] p-1.5 text-red-500 hover:bg-[#FEF2F2] disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {registros.length === 0 && (
              <tr>
                <td
                  colSpan={conFecha ? 11 : 10}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  {vacio}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Alta y edición de un registro. Con `registro` es edición. */
function RegistroForm({
  fecha, hoy, registro, vehiculos, onDone,
}: {
  fecha: string;
  hoy: string;
  registro: AusentismoRegistro | null;
  vehiculos: VehiculoOpcion[];
  onDone: () => void;
}) {
  const [f, setF] = useState(registro?.fecha ?? fecha);
  // Rango del reporte: por defecto empieza el día que se registra.
  const [fechaInicio, setFechaInicio] = useState(
    registro?.fecha_inicio ?? registro?.fecha ?? fecha
  );
  const [fechaFin, setFechaFin] = useState(registro?.fecha_fin ?? "");
  const [codigoVehiculo, setCodigoVehiculo] = useState(registro?.codigo_vehiculo ?? "");
  const [soporteObs, setSoporteObs] = useState(registro?.soporte_observaciones ?? "");
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<ConductorBusqueda[]>([]);
  const [conductor, setConductor] = useState<{
    cedula: string;
    codigo: string | null;
    nombre: string;
  } | null>(
    registro
      ? { cedula: registro.cedula, codigo: registro.codigo, nombre: registro.nombre }
      : null
  );
  const [tipo, setTipo] = useState(registro?.tipo ?? "permiso");
  const [contacto, setContacto] = useState(registro?.contacto ?? "");
  const [justificacion, setJustificacion] = useState(registro?.justificacion ?? "");
  const [incIni, setIncIni] = useState(registro?.incapacidad_inicio ?? "");
  const [incFin, setIncFin] = useState(registro?.incapacidad_fin ?? "");
  const [reintegro, setReintegro] = useState(registro?.reintegro ?? "");
  const [soporte, setSoporte] = useState(registro?.soporte ?? "no_aplica");
  const [telefono, setTelefono] = useState(registro?.telefono ?? "");
  const [pending, start] = useTransition();

  const esIncapacidad = tipo === "incapacidad";
  const esNoJustificada = tipo === "no_justificada";
  // El campo de observaciones se despliega al elegir un soporte.
  const conSoporte = soporte !== "no_aplica";

  // Si el vehículo del registro ya no está activo en el maestro, se mantiene
  // como opción para que la edición no lo pierda.
  const opcionesVehiculo = useMemo(() => {
    const actual = registro?.codigo_vehiculo;
    if (!actual || vehiculos.some((v) => v.codigo === actual)) return vehiculos;
    return [
      { codigo: actual, placa: registro?.vehiculos?.placa ?? null, cedula_conductor: null },
      ...vehiculos,
    ];
  }, [vehiculos, registro]);

  function elegirConductor(c: ConductorBusqueda) {
    setConductor({ cedula: c.cedula, codigo: c.codigo, nombre: c.nombre });
    setSugerencias([]);
    // El maestro trae el vehículo asignado al conductor: se preselecciona y
    // queda editable por si ese día iba en otro.
    if (!codigoVehiculo) {
      const suyo = vehiculos.find((v) => v.cedula_conductor === c.cedula);
      if (suyo) setCodigoVehiculo(suyo.codigo);
    }
  }

  // Búsqueda de conductores con debounce contra el maestro.
  useEffect(() => {
    const q = busqueda.trim();
    const timer = setTimeout(async () => {
      if (q.length < 2 || conductor) {
        setSugerencias([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/rotacion/conductores/search?q=${encodeURIComponent(q)}`
        );
        if (res.ok) setSugerencias(((await res.json()) as ConductorBusqueda[]) ?? []);
      } catch {
        setSugerencias([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [busqueda, conductor]);

  function submit() {
    if (!conductor) {
      toast.error("Busca y selecciona el conductor.");
      return;
    }
    if (!fechaInicio) {
      toast.error("Indica la fecha de inicio del reporte.");
      return;
    }
    if (fechaFin && fechaFin < fechaInicio) {
      toast.error("La fecha final no puede ser antes de la inicial.");
      return;
    }
    const input: RegistroInput = {
      fecha: f,
      cedula: conductor.cedula,
      codigo: conductor.codigo,
      nombre: conductor.nombre,
      telefono: telefono.trim() || null,
      tipo,
      contacto: esNoJustificada && contacto ? contacto : null,
      justificacion: justificacion.trim() || null,
      incapacidadInicio: esIncapacidad && incIni ? incIni : null,
      incapacidadFin: esIncapacidad && incFin ? incFin : null,
      reintegro: reintegro || null,
      soporte,
      soporteObservaciones: conSoporte ? soporteObs.trim() || null : null,
      codigoVehiculo: codigoVehiculo || null,
      fechaInicio,
      fechaFin: fechaFin || null,
    };
    start(async () => {
      const res = registro
        ? await actualizarRegistro(registro.id, input)
        : await crearRegistro(input);
      if (res.success) {
        toast.success(
          registro
            ? "Registro actualizado (quedó en la bitácora)"
            : `Ausente registrado: ${conductor.nombre}`
        );
        onDone();
      } else {
        toast.error(res.error ?? "No se pudo guardar");
      }
    });
  }

  return (
    <div className="rounded-xl border border-[#C7D2FE] bg-[#EEF2FF]/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          {registro ? `Editar registro · ${registro.nombre}` : "Registrar ausente"}
        </h2>
        <button onClick={onDone} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Fecha</label>
          <input
            type="date"
            value={f}
            max={hoy}
            onChange={(e) => setF(e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="relative md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Conductor</label>
          {conductor ? (
            <div className="flex h-9 items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm">
              <span className="truncate">
                <strong>{conductor.codigo ? `${conductor.codigo} · ` : ""}{conductor.nombre}</strong>{" "}
                <span className="text-xs text-gray-500">CC {conductor.cedula}</span>
              </span>
              {!registro && (
                <button
                  onClick={() => {
                    setConductor(null);
                    setBusqueda("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Código, cédula o nombre…"
                  className={`${inputCls} pl-8`}
                />
              </div>
              {sugerencias.length > 0 && (
                <div className="absolute z-40 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white shadow-lg">
                  {sugerencias.map((c) => (
                    <button
                      key={c.cedula}
                      onClick={() => elegirConductor(c)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#F8FAFC]"
                    >
                      <span className="font-medium text-gray-900">
                        {c.codigo ? `${c.codigo} · ` : ""}
                        {c.nombre}
                      </span>
                      <span className="text-xs text-gray-500">
                        CC {c.cedula}
                        {c.estado && c.estado !== "ACTIVO" ? ` · ${c.estado}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Número de vehículo
          </label>
          <select
            value={codigoVehiculo}
            onChange={(e) => setCodigoVehiculo(e.target.value)}
            className={inputCls}
          >
            <option value="">— Sin vehículo —</option>
            {opcionesVehiculo.map((v) => (
              <option key={v.codigo} value={v.codigo}>{etiquetaVehiculo(v)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Inicio del reporte
          </label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Fin del reporte (opcional)
          </label>
          <input
            type="date"
            value={fechaFin}
            min={fechaInicio || undefined}
            onChange={(e) => setFechaFin(e.target.value)}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Tipo de ausencia</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
            {TIPOS_AUSENCIA.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>

        {esNoJustificada && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Resultado del contacto
            </label>
            <select
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              className={inputCls}
            >
              <option value="">—</option>
              {CONTACTOS.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className={esNoJustificada ? "" : "md:col-span-2"}>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Justificación / observación
          </label>
          <input
            type="text"
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            placeholder="Lo que hoy escribes en el Excel"
            className={inputCls}
          />
        </div>

        {esIncapacidad && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Inicio de incapacidad
              </label>
              <input type="date" value={incIni} onChange={(e) => setIncIni(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Fin de incapacidad
              </label>
              <input type="date" value={incFin} min={incIni || undefined} onChange={(e) => setIncFin(e.target.value)} className={inputCls} />
            </div>
          </>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Reintegro laboral
          </label>
          <input type="date" value={reintegro} onChange={(e) => setReintegro(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Soporte</label>
          <select value={soporte} onChange={(e) => setSoporte(e.target.value)} className={inputCls}>
            {SOPORTES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        {conSoporte && (
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Observaciones del soporte
            </label>
            <input
              type="text"
              value={soporteObs}
              onChange={(e) => setSoporteObs(e.target.value)}
              placeholder={
                soporte === "pendiente"
                  ? "Qué debe traer y para cuándo"
                  : "Qué presentó (incapacidad, cita, certificado…)"
              }
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Teléfono (se completa del maestro si se deja vacío)
          </label>
          <input
            type="text"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={submit}
          disabled={pending || !conductor}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {registro ? "Guardar cambios" : "Registrar"}
        </button>
      </div>
    </div>
  );
}
