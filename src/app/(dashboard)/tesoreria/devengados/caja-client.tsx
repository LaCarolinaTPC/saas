"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Search,
  Banknote,
  TriangleAlert,
  CircleCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
  Lock,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  registrarEntrega,
  registrarEntregaExtemporanea,
} from "@/lib/devengados/actions";
import type { CajeroOpcion, EstadoConductor } from "@/lib/devengados/data";
import type { DiaCalculado } from "@/lib/devengados/engine";

interface Conductor {
  cedula: string;
  nombre: string;
  codigo: string | null;
  estado: string | null;
}

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
  hint?: string;
}) {
  const colors = {
    neutral: "text-gray-900",
    ok: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-red-600",
  } as const;
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${colors[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

/** Estado por día con las etiquetas de la hoja Simulacion_Diaria. */
function estadoDia(d: DiaCalculado): { label: string; bg: string; color: string } {
  if (d.estado === "sin_produccion")
    return { label: "Sin producción", bg: "#F1F5F9", color: "#64748B" };
  if (d.entregarHoy > 0)
    return { label: "Entrega autorizada", bg: "#D1FAE5", color: "#059669" };
  return { label: "Retenido – déficit acumulado", bg: "#FEE2E2", color: "#EF4444" };
}

export function CajaClient({
  conductores,
  baseDiaria,
  hoy,
  fechaCorte: fechaCorteInicial,
  esSimulada,
  isAdmin = false,
  cajeros = [],
}: {
  conductores: Conductor[];
  baseDiaria: number;
  hoy: string;
  fechaCorte: string;
  esSimulada: boolean;
  /**
   * El bloqueo de conductores se gestiona en Parámetros; aquí habilita el
   * registro extemporáneo de entregas de días ya cerrados.
   */
  isAdmin?: boolean;
  /** Cajeros acreditables en un registro extemporáneo (solo se cargan para admin). */
  cajeros?: CajeroOpcion[];
}) {
  const [fechaCorte, setFechaCorte] = useState(fechaCorteInicial);
  const [query, setQuery] = useState("");
  const [seleccionado, setSeleccionado] = useState<Conductor | null>(null);
  const [estado, setEstado] = useState<EstadoConductor | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [valorEntrega, setValorEntrega] = useState("");
  const [observacion, setObservacion] = useState("");
  const [verViajes, setVerViajes] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // Confirmación previa al pago (y autorización del segundo pago del día).
  const [confirmando, setConfirmando] = useState(false);
  const [autMotivo, setAutMotivo] = useState("");
  const [autEmail, setAutEmail] = useState("");
  const [autPassword, setAutPassword] = useState("");
  // Registro extemporáneo (admin, día cerrado): cajero acreditado y motivo.
  const [extValor, setExtValor] = useState("");
  const [extCajero, setExtCajero] = useState("");
  const [extMotivo, setExtMotivo] = useState("");
  /**
   * El administrador registra la entrega del DÍA EN CURSO a nombre del cajero
   * que entregó el efectivo y no alcanzó a digitarla. En un día ya cerrado
   * este es el único camino posible, así que no hace falta activarlo.
   */
  const [aNombreDeOtro, setANombreDeOtro] = useState(false);
  const [extObservacion, setExtObservacion] = useState("");
  const [confirmandoExt, setConfirmandoExt] = useState(false);

  const sugerencias = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q || seleccionado) return [];
    return conductores
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          c.cedula.includes(q) ||
          c.codigo?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, conductores, seleccionado]);

  async function cargarEstado(cedula: string, fecha: string = fechaCorte) {
    setCargando(true);
    setErrorCarga(null);
    setEstado(null);
    setResultado(null);
    setVerViajes(false);
    try {
      const res = await fetch(`/api/devengados/estado?cedula=${cedula}&fecha=${fecha}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error consultando el estado");
      setEstado(json as EstadoConductor);
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  function elegir(c: Conductor) {
    setSeleccionado(c);
    setQuery(c.nombre);
    void cargarEstado(c.cedula);
  }

  function cambiarFecha(fecha: string) {
    if (!fecha || fecha > hoy) return;
    setFechaCorte(fecha);
    if (seleccionado) void cargarEstado(seleccionado.cedula, fecha);
  }

  const esCorteHoy = fechaCorte === hoy;
  const r = estado?.resumen;
  const diaHoy = r?.dias.find((d) => d.fecha === fechaCorte) ?? null;
  // Lo pendiente por entregar es el acumulado liberado menos lo ya entregado
  // en la quincena (incluye lo represado de días anteriores sin pagar).
  const disponible = r?.disponible ?? 0;

  useEffect(() => {
    setValorEntrega(disponible > 0 ? String(Math.floor(disponible)) : "");
    setExtValor(disponible > 0 ? String(Math.floor(disponible)) : "");
  }, [disponible]);

  const esSegundoPago = (estado?.pagosHoy ?? 0) >= 1;

  function abrirConfirmacion() {
    if (!seleccionado || !estado) return;
    setResultado(null);
    setAutMotivo("");
    setAutEmail("");
    setAutPassword("");
    setConfirmando(true);
  }

  function aprobar() {
    if (!seleccionado || !estado) return;
    setResultado(null);
    startTransition(async () => {
      // Identidad, viajes de soporte y tope se resuelven en el servidor;
      // del cliente solo viajan cédula, valor y observación.
      const res = await registrarEntrega({
        cedula: seleccionado.cedula,
        valor: Number(valorEntrega),
        observacion: observacion.trim() || null,
        autorizacion: esSegundoPago
          ? { adminEmail: autEmail, adminPassword: autPassword, motivo: autMotivo }
          : null,
      });
      setConfirmando(false);
      if (res.success) {
        setResultado({
          ok: true,
          msg: esSegundoPago
            ? "Segundo pago registrado con autorización del administrador (cuenta 281505010, débito)."
            : "Entrega registrada (cuenta 281505010, débito).",
        });
        setObservacion("");
        void cargarEstado(seleccionado.cedula);
      } else {
        setResultado({
          ok: false,
          msg:
            res.error === "segundo_pago_requiere_autorizacion"
              ? "El conductor ya recibió un pago hoy: el segundo pago requiere autorización de un administrador (correo, contraseña y motivo)."
              : res.error ?? "No se pudo registrar la entrega.",
        });
      }
    });
  }

  /**
   * Registro extemporáneo: la entrega queda con la fecha contable del día
   * cerrado y a nombre del cajero que entregó el dinero, para que su cuadre
   * de ese día cierre y el disponible deje de arrastrarse en los reportes.
   */
  function aprobarExtemporanea() {
    if (!seleccionado || !estado) return;
    setResultado(null);
    startTransition(async () => {
      const res = await registrarEntregaExtemporanea({
        cedula: seleccionado.cedula,
        fecha: fechaCorte,
        valor: Number(extValor),
        cajeroId: extCajero,
        motivo: extMotivo,
        observacion: extObservacion.trim() || null,
      });
      setConfirmandoExt(false);
      if (res.success) {
        const cajero = cajeros.find((c) => c.id === extCajero)?.nombre ?? "el cajero";
        setResultado({
          ok: true,
          msg:
            `Entrega registrada con fecha contable del ${fechaCorte} a nombre de ${cajero} ` +
            `(cuenta 281505010, débito).` +
            (res.sobreEntrega
              ? ` Atención: un día posterior de la quincena entró en déficit, así que queda ` +
                `sobre-entregada en ${cop.format(res.sobreEntrega)}. Quedó registrado en auditoría.`
              : ""),
        });
        setExtMotivo("");
        setExtObservacion("");
        setANombreDeOtro(false);
        void cargarEstado(seleccionado.cedula, fechaCorte);
      } else {
        setResultado({ ok: false, msg: res.error ?? "No se pudo registrar la entrega." });
      }
    });
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* TopBar */}
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">Tesorería · Caja de devengados</h1>
            <input
              type="date"
              value={fechaCorte}
              max={hoy}
              onChange={(e) => cambiarFecha(e.target.value)}
              title="Fecha de corte (para consultar quincenas anteriores)"
              className="rounded-lg border border-[#E2E8F0] px-2 py-1 text-xs outline-none focus:border-[#4F46E5]"
            />
            {esSimulada && (
              <span className="inline-flex items-center rounded-full bg-[#4F46E5] px-2.5 py-0.5 text-xs font-medium text-white">
                Fecha operativa de cierre: {hoy}
              </span>
            )}
            {!esCorteHoy && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                {isAdmin
                  ? "Día cerrado · registro extemporáneo habilitado"
                  : "Consulta histórica · solo lectura"}
              </span>
            )}
          </div>
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar conductor por nombre, cédula o código..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSeleccionado(null);
                setEstado(null);
              }}
              className="w-full rounded-lg border border-[#E2E8F0] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#4F46E5]"
            />
            {sugerencias.length > 0 && (
              <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-[#E2E8F0] bg-white shadow-lg">
                {sugerencias.map((c) => (
                  <button
                    key={c.cedula}
                    onClick={() => elegir(c)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#F8FAFC]"
                  >
                    <span className="font-medium text-gray-900">{c.nombre}</span>
                    <span className="text-xs text-gray-500">
                      CC {c.cedula} {c.codigo ? `· Cód. ${c.codigo}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 p-6">
        {!seleccionado && (
          <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-white p-12 text-center text-sm text-gray-500">
            <Banknote className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            Busca un conductor para ver su registro diario acumulado y el excedente a entregar.
            <p className="mt-2 text-xs text-gray-400">
              Base diaria vigente: {cop.format(baseDiaria)} (parametrizada)
            </p>
          </div>
        )}

        {cargando && (
          <div className="flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando el acumulado de la quincena...
          </div>
        )}

        {errorCarga && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorCarga}
          </div>
        )}

        {estado && r && seleccionado && (
          <>
            {/* Bloqueo manual del conductor (motivo visible al cajero; se
                gestiona desde Parámetros y solo por administradores) */}
            {estado.bloqueo && (
              <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Conductor bloqueado para pagos</p>
                  <p>
                    Motivo: <strong>{estado.bloqueo.motivo}</strong>
                  </p>
                  <p className="mt-1 text-xs text-red-600">
                    Bloqueado por {estado.bloqueo.bloqueado_por_email ?? "administración"} ·{" "}
                    {new Date(estado.bloqueo.created_at).toLocaleString("es-CO", {
                      timeZone: "America/Bogota",
                    })}
                    . Solo un administrador puede retirarlo (Parámetros → Bloqueo de conductores).
                  </p>
                </div>
              </div>
            )}

            {/* Alerta de acumulado en déficit */}
            {r.saldoAcumulado < 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Retenido – déficit acumulado</p>
                  <p>
                    Al corte del {fechaCorte} la producción acumulada ({cop.format(r.produccionAcum)}) no
                    cubre la base acumulada exigida ({cop.format(r.baseAcum)}). Diferencia:{" "}
                    {cop.format(r.saldoAcumulado)}. La entrega queda bloqueada hasta que el
                    acumulado se recupere.
                  </p>
                </div>
              </div>
            )}

            {/* Registro del día acumulado (no por viajes) */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                label="Salario neto del día (producción)"
                value={cop.format(diaHoy?.produccion ?? estado.produccionDia)}
                tone={(diaHoy?.produccion ?? 0) >= estado.baseDiaria ? "ok" : "warn"}
                hint={`Del cierre GEMA · Base del día: ${cop.format(estado.baseDiaria)}${
                  (diaHoy?.produccion ?? 0) < estado.baseDiaria
                    ? ` · faltan ${cop.format(estado.baseDiaria - (diaHoy?.produccion ?? 0))}`
                    : " · cubierta"
                }`}
              />
              <StatCard
                label={`Diferencia acumulada (corte al ${fechaCorte})`}
                value={cop.format(r.saldoAcumulado)}
                tone={r.saldoAcumulado >= 0 ? "ok" : "bad"}
                hint={`Producción ${cop.format(r.produccionAcum)} vs base ${cop.format(r.baseAcum)} · Q${estado.quincena.quincena} desde ${estado.quincena.ini}`}
              />
              <StatCard
                label="Excedente del día (a entregar hoy)"
                value={cop.format(diaHoy?.entregarHoy ?? 0)}
                tone={(diaHoy?.entregarHoy ?? 0) > 0 ? "ok" : "neutral"}
                hint="Incremento liberado por el día, corte a corte"
              />
              <StatCard
                label="Pendiente por entregar (acumulado)"
                value={cop.format(disponible)}
                tone={disponible > 0 ? "ok" : "neutral"}
                hint={
                  r.entregado > 0
                    ? `Liberado ${cop.format(r.excedenteAcum)} − entregado ${cop.format(r.entregado)}`
                    : `Liberado acumulado al ${fechaCorte} sin entregas registradas`
                }
              />
            </div>

            {/* Simulación diaria de la quincena (como la hoja del Excel) */}
            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
              <div className="border-b border-[#F1F5F9] px-4 py-3">
                <h2 className="text-sm font-semibold text-gray-900">
                  Registro diario · {estado.quincena.periodo} Q{estado.quincena.quincena} (corte al {fechaCorte})
                </h2>
                <p className="text-xs text-gray-500">
                  El acumulado se protege corte a corte: solo se libera excedente cuando la
                  producción acumulada supera la base acumulada exigida.
                </p>
              </div>
              {r.dias.length === 0 ? (
                <p className="p-6 text-sm text-gray-500">
                  Sin producción registrada en la quincena. GEMA puede reportar con atraso.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-2">Fecha</th>
                        <th className="px-4 py-2 text-right">Salario neto día</th>
                        <th className="px-4 py-2 text-right">Base diaria</th>
                        <th className="px-4 py-2 text-right">Excedente día</th>
                        <th className="px-4 py-2 text-right">Prod. acumulada</th>
                        <th className="px-4 py-2 text-right">Base acumulada</th>
                        <th className="px-4 py-2 text-right">Dif. acumulada</th>
                        <th className="px-4 py-2 text-right">Liberado acum.</th>
                        <th className="px-4 py-2 text-right">Entregar hoy</th>
                        <th className="px-4 py-2">Estado / Alerta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.dias.map((d) => {
                        const est = estadoDia(d);
                        const esHoy = d.fecha === fechaCorte;
                        return (
                          <tr
                            key={d.fecha}
                            className={`border-b border-[#F1F5F9] ${
                              esHoy ? "bg-[#EEF2FF]" : ""
                            }`}
                          >
                            <td className="px-4 py-2 font-medium">
                              {d.fecha}
                              {esHoy && (
                                <span className="ml-1 text-xs text-[#4F46E5]">
                                  {esCorteHoy ? "(hoy)" : "(corte)"}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right">{cop.format(d.produccion)}</td>
                            <td className="px-4 py-2 text-right">{cop.format(d.baseExigida)}</td>
                            <td className="px-4 py-2 text-right">{cop.format(d.excedenteDia)}</td>
                            <td className="px-4 py-2 text-right">{cop.format(d.acumProduccion)}</td>
                            <td className="px-4 py-2 text-right">{cop.format(d.acumBase)}</td>
                            <td
                              className={`px-4 py-2 text-right font-medium ${
                                d.saldoAcumulado < 0 ? "text-red-600" : "text-emerald-600"
                              }`}
                            >
                              {cop.format(d.saldoAcumulado)}
                            </td>
                            <td className="px-4 py-2 text-right">{cop.format(d.liberadoAcum)}</td>
                            <td className="px-4 py-2 text-right font-semibold">
                              {cop.format(d.entregarHoy)}
                            </td>
                            <td className="px-4 py-2">
                              <span
                                className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: est.bg, color: est.color }}
                              >
                                {est.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Viajes del día: solo referencia/soporte, la entrega es por día acumulado */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white">
              <button
                onClick={() => setVerViajes((v) => !v)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-gray-700"
              >
                {verViajes ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Detalle de viajes del día ({estado.viajesDia.length}) — solo soporte (la producción es el salario neto del cierre)
              </button>
              {verViajes && (
                <div className="overflow-x-auto border-t border-[#F1F5F9]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-2">Viaje</th>
                        <th className="px-4 py-2">Ruta</th>
                        <th className="px-4 py-2">Vehículo</th>
                        <th className="px-4 py-2">Despacho</th>
                        <th className="px-4 py-2 text-right">Neto</th>
                        <th className="px-4 py-2">Novedad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estado.viajesDia.map((v) => (
                        <tr key={v.numero} className="border-b border-[#F1F5F9]">
                          <td className="px-4 py-2">{v.viaje ?? v.numero}</td>
                          <td className="px-4 py-2">{v.ruta ?? "—"}</td>
                          <td className="px-4 py-2">{v.placa ?? v.codigo_vehiculo ?? "—"}</td>
                          <td className="px-4 py-2">{v.hora_despacho ?? "—"}</td>
                          <td className="px-4 py-2 text-right font-medium">{cop.format(v.neto ?? 0)}</td>
                          <td className="px-4 py-2 text-xs">{v.novedad ?? v.estado ?? "—"}</td>
                        </tr>
                      ))}
                      {estado.viajesDia.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                            Sin viajes recaudados hoy (GEMA puede reportar con atraso).
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Aprobación de la entrega del día (solo con corte en el día actual) */}
            {!esCorteHoy && !isAdmin ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Estás consultando el corte del {fechaCorte} (histórico). Las entregas solo se
                registran con la fecha de hoy ({hoy}); vuelve al día actual para aprobar una
                entrega. Si un pago de ese día quedó sin bajar, un administrador puede
                registrarlo de forma extemporánea.
              </div>
            ) : !esCorteHoy || aNombreDeOtro ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <ShieldAlert className="h-4 w-4" />
                    {esCorteHoy
                      ? "Registrar entrega a nombre de un cajero"
                      : `Registrar entrega de un día cerrado (${fechaCorte})`}
                  </h2>
                  {esCorteHoy && (
                    <button
                      onClick={() => setANombreDeOtro(false)}
                      className="shrink-0 text-xs font-medium text-amber-800 underline hover:text-amber-900"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-amber-800">
                  Solo para pagos que el cajero entregó en efectivo{" "}
                  {esCorteHoy ? "hoy" : "ese día"} y no alcanzó a bajar en Gestivo. La entrega
                  queda con la <strong>fecha contable del {fechaCorte}</strong> y a nombre del
                  cajero que entregó el dinero, para que su cuadre de ese día cierre. Queda
                  marcada como novedad en auditoría y en los reportes
                  {!esCorteHoy && ", y como extemporánea por ser de un día cerrado"}.
                </p>
                <p className="mt-2 text-xs text-amber-800">
                  Pendiente por entregar al corte del {fechaCorte}:{" "}
                  <strong>{cop.format(disponible)}</strong>
                  {estado.entregadoDia > 0 && (
                    <> · ya registrado ese día: {cop.format(estado.entregadoDia)}</>
                  )}
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Es el excedente que estaba liberado ese día: el mismo tope que habría aplicado
                  si el cajero baja el pago a tiempo. Los pagos posteriores de la quincena no se
                  tocan.
                </p>
                {estado.bloqueo && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    El conductor tiene un bloqueo activo ({estado.bloqueo.motivo}). Retíralo en
                    Parámetros para poder registrar la entrega.
                  </p>
                )}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-amber-900">
                      Valor entregado
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={Math.floor(disponible)}
                      value={extValor}
                      onChange={(e) => setExtValor(e.target.value)}
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-amber-900">
                      Cajero que entregó el dinero
                    </label>
                    <select
                      value={extCajero}
                      onChange={(e) => setExtCajero(e.target.value)}
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                    >
                      <option value="">Selecciona el cajero…</option>
                      {cajeros.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                          {c.email ? ` · ${c.email}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-amber-900">
                      Motivo del registro
                    </label>
                    <input
                      type="text"
                      value={extMotivo}
                      onChange={(e) => setExtMotivo(e.target.value)}
                      placeholder={
                        esCorteHoy
                          ? "Ej.: el cajero entregó el efectivo y no alcanzó a bajar el pago"
                          : "Ej.: el cajero no bajó el pago del cierre del 16 de julio"
                      }
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-amber-900">
                      Observación (opcional)
                    </label>
                    <input
                      type="text"
                      value={extObservacion}
                      onChange={(e) => setExtObservacion(e.target.value)}
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    setResultado(null);
                    setConfirmandoExt(true);
                  }}
                  disabled={
                    pending ||
                    disponible <= 0 ||
                    Number(extValor) <= 0 ||
                    !extCajero ||
                    !extMotivo.trim() ||
                    !!estado.bloqueo ||
                    estado.pagosHoy >= 2
                  }
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Registrar entrega del {fechaCorte}…
                </button>
              </div>
            ) : (
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-900">Entrega del día</h2>
                {/* El admin puede acreditar el pago al cajero que entregó el
                    efectivo pero no alcanzó a digitarlo, sin mover la fecha
                    operativa global. */}
                {isAdmin && (
                  <button
                    onClick={() => {
                      setResultado(null);
                      setANombreDeOtro(true);
                    }}
                    className="shrink-0 text-xs font-medium text-[#4F46E5] underline hover:text-[#4338CA]"
                  >
                    Registrar a nombre de otro cajero
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Pendiente por entregar al corte del {hoy}: <strong>{cop.format(disponible)}</strong>
                {estado.entregadoDia > 0 && <> · ya entregado hoy: {cop.format(estado.entregadoDia)}</>}
              </p>
              {esSegundoPago && !estado.bloqueo && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    El conductor ya recibió {estado.pagosHoy === 1 ? "un pago" : `${estado.pagosHoy} pagos`} hoy.
                    La política es un pago por conductor por día: un segundo pago requiere la
                    autorización de un administrador (se registra quién autoriza, el motivo,
                    la fecha/hora y el cajero).
                  </span>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Valor a entregar
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={Math.floor(disponible)}
                    value={valorEntrega}
                    onChange={(e) => setValorEntrega(e.target.value)}
                    className="w-40 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Observación (opcional)
                  </label>
                  <input
                    type="text"
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <button
                  onClick={abrirConfirmacion}
                  disabled={
                    pending ||
                    disponible <= 0 ||
                    Number(valorEntrega) <= 0 ||
                    !!estado.bloqueo ||
                    estado.pagosHoy >= 2
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  {esSegundoPago ? "Registrar segundo pago…" : "Aprobar entrega…"}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                La entrega queda en el cierre contable de hoy ({hoy}) — cuenta 281505010, movimiento débito.
              </p>
            </div>
            )}

            {resultado && (
              <div
                className={`flex items-center gap-2 rounded-xl border p-4 text-sm ${
                  resultado.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {resultado.ok ? <CircleCheck className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
                {resultado.msg}
              </div>
            )}

            {/* Confirmación antes de registrar el pago (+ autorización 2.º pago) */}
            {confirmando && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                  <div className="mb-4 flex items-start justify-between">
                    <h3 className="text-base font-semibold text-gray-900">
                      {esSegundoPago ? "Autorizar segundo pago del día" : "Confirmar entrega"}
                    </h3>
                    <button onClick={() => setConfirmando(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1 rounded-lg bg-[#F8FAFC] p-3 text-sm text-gray-700">
                    <p>
                      Conductor: <strong>{seleccionado.nombre}</strong> (CC {seleccionado.cedula})
                    </p>
                    <p>
                      Valor a entregar: <strong>{cop.format(Number(valorEntrega) || 0)}</strong>
                    </p>
                    <p className="text-xs text-gray-500">
                      Fecha contable: {hoy} · cuenta 281505010, movimiento débito.
                      {estado.entregadoDia > 0 && <> Ya entregado hoy: {cop.format(estado.entregadoDia)}.</>}
                    </p>
                  </div>

                  {esSegundoPago && (
                    <div className="mt-4 space-y-3">
                      <p className="text-xs text-amber-700">
                        Un administrador debe autorizar este segundo pago con sus credenciales.
                        Quedará registrado el administrador, el motivo, la fecha/hora y el cajero.
                      </p>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Correo del administrador
                        </label>
                        <input
                          type="email"
                          value={autEmail}
                          onChange={(e) => setAutEmail(e.target.value)}
                          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Contraseña del administrador
                        </label>
                        <input
                          type="password"
                          value={autPassword}
                          onChange={(e) => setAutPassword(e.target.value)}
                          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">
                          Motivo del segundo pago (obligatorio)
                        </label>
                        <input
                          type="text"
                          value={autMotivo}
                          onChange={(e) => setAutMotivo(e.target.value)}
                          className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5]"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmando(false)}
                      className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-gray-600 hover:bg-[#F8FAFC]"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={aprobar}
                      disabled={
                        pending ||
                        (esSegundoPago && (!autEmail.trim() || !autPassword || !autMotivo.trim()))
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {esSegundoPago ? "Autorizar y pagar" : "Confirmar pago"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Confirmación de la entrega registrada a nombre de un cajero */}
            {confirmandoExt && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                  <div className="mb-4 flex items-start justify-between">
                    <h3 className="text-base font-semibold text-gray-900">
                      {esCorteHoy
                        ? "Confirmar entrega a nombre de un cajero"
                        : "Confirmar entrega de un día cerrado"}
                    </h3>
                    <button
                      onClick={() => setConfirmandoExt(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1 rounded-lg bg-[#F8FAFC] p-3 text-sm text-gray-700">
                    <p>
                      Conductor: <strong>{seleccionado.nombre}</strong> (CC {seleccionado.cedula})
                    </p>
                    <p>
                      Valor entregado: <strong>{cop.format(Number(extValor) || 0)}</strong>
                    </p>
                    <p>
                      Fecha contable: <strong>{fechaCorte}</strong> · cajero acreditado:{" "}
                      <strong>{cajeros.find((c) => c.id === extCajero)?.nombre ?? "—"}</strong>
                    </p>
                    <p className="text-xs text-gray-500">
                      Motivo: {extMotivo.trim()} · cuenta 281505010, movimiento débito.
                    </p>
                  </div>
                  <p className="mt-3 text-xs text-amber-700">
                    Esta entrega modifica el cuadre del {fechaCorte} de ese cajero y baja el
                    disponible de la quincena del conductor. Queda registrado en auditoría con tu
                    usuario, el cajero acreditado y el motivo.
                  </p>
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmandoExt(false)}
                      className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-gray-600 hover:bg-[#F8FAFC]"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={aprobarExtemporanea}
                      disabled={pending}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Registrar entrega
                    </button>
                  </div>
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
