"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bus, CalendarDays, CheckCircle2, Clock, Fingerprint, Plus, UserX,
} from "lucide-react";
import type { Concepto, VehiculoOpcion } from "@/lib/ausentismo/constants";
import { CONCEPTO_NO_JUSTIFICADA } from "@/lib/ausentismo/constants";
import type { DatosMarcaciones } from "@/lib/biometrico/data";
import type { Esperado, FilaPendiente, FilaTrabajo } from "@/lib/biometrico/dia";
import { RegistroForm, type RegistroInicial } from "../registro-form";

/** Hora local legible de un momento ISO con offset. */
function hora(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : "—";
}

/** `HH:MM:SS` de GEMA a `HH:MM`. */
function horaCorta(h: string | null): string {
  return h && h.length >= 5 ? h.slice(0, 5) : "—";
}

/**
 * Estado de la huella del día. Es **solo información**: no entra en la
 * decisión de presencia, que la toma el despacho de GEMA. Hoy la mitad de los
 * conductores despachados no pasa la huella, así que un «no» no dice que
 * faltó.
 */
function ChipHuella({ marco }: { marco: boolean }) {
  return marco ? (
    <span
      title="Pasó la huella por el biométrico ese día"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-medium text-green-800"
    >
      <Fingerprint className="h-3 w-3" />
      Sí
    </span>
  ) : (
    <span
      title="No hay huella suya ese día. Informativo: hoy solo la mitad de los conductores despachados pasa por el biométrico, así que esto no prueba una ausencia."
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-gray-500"
    >
      <Fingerprint className="h-3 w-3" />
      No
    </span>
  );
}

function fechaCorta(iso: string): string {
  return iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso;
}

const ORIGEN_TEXTO: Record<Esperado["origen"], string> = {
  despacho: "GEMA registró que sacó ese bus ese día",
  historico: "conductor habitual del bus en los últimos 45 días",
  vehiculo: "conductor fijo del bus en el maestro",
  maestro: "no había programación del día: todo conductor activo",
};

const ORIGEN_CHIP: Record<Esperado["origen"], string> = {
  despacho: "Despacho",
  historico: "Habitual",
  vehiculo: "Maestro bus",
  maestro: "Plantilla",
};

function ChipOrigen({ fila }: { fila: Esperado }) {
  const debil = fila.origen === "historico" && (fila.confianza ?? 1) < 0.5;
  const color =
    fila.origen === "despacho"
      ? "bg-[#DCFCE7] text-green-800"
      : debil
        ? "bg-[#FEF3C7] text-[#B45309]"
        : "bg-[#EEF2FF] text-[#4338CA]";
  const detalle =
    fila.origen === "historico" && fila.confianza !== undefined
      ? ` (${Math.round(fila.confianza * 100)} % de los días)`
      : "";
  return (
    <span
      title={`De dónde se deduce que debía venir: ${ORIGEN_TEXTO[fila.origen]}${detalle}`}
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}
    >
      {ORIGEN_CHIP[fila.origen]}
      {debil ? " ?" : ""}
    </span>
  );
}

function Ficha({
  icono: Icono,
  titulo,
  valor,
  detalle,
  tono = "normal",
}: {
  icono: typeof UserX;
  titulo: string;
  valor: number | string;
  detalle?: string;
  tono?: "normal" | "alerta" | "bien";
}) {
  const color =
    tono === "alerta"
      ? "border-[#FCD34D] bg-[#FFFBEB]"
      : tono === "bien"
        ? "border-[#A7F3D0] bg-[#F0FDF4]"
        : "border-[#E2E8F0] bg-white";
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <Icono className="h-4 w-4" />
        {titulo}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-[11px] leading-tight text-gray-500">{detalle}</p>}
    </div>
  );
}

export function MarcacionesClient({
  fecha,
  hoy,
  datos,
  conceptos,
  vehiculos,
  puedeEditar,
  error,
}: {
  fecha: string;
  hoy: string;
  datos: DatosMarcaciones | null;
  conceptos: Concepto[];
  vehiculos: VehiculoOpcion[];
  puedeEditar: boolean;
  error: string | null;
}) {
  const router = useRouter();
  // Conductor para el que se está registrando la novedad; null = panel cerrado.
  const [registrando, setRegistrando] = useState<RegistroInicial | null>(null);
  const [extras, setExtras] = useState<Concepto[]>([]);
  // Filtro de huella sobre los que trabajaron: para ver de un golpe quién rodó
  // sin pasar por el biométrico. No cambia la conclusión de presencia.
  const [huella, setHuella] = useState<"todos" | "con" | "sin">("todos");
  const catalogo = useMemo(() => {
    const yaEstan = new Set(conceptos.map((c) => c.key));
    return [...conceptos, ...extras.filter((e) => !yaEstan.has(e.key))];
  }, [conceptos, extras]);

  function irA(f: string) {
    router.push(`/ausentismo/marcaciones?fecha=${f}`);
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm text-[#991B1B]">
          <p className="font-semibold">No se pudieron leer las marcaciones</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs">
            Si las tablas del biométrico no existen todavía, falta aplicar la migración
            <code className="mx-1 rounded bg-white px-1">20261019162914_marcaciones_del_biometrico_zkaccess.sql</code>
            en el SQL Editor. Ver <strong>docs/biometrico-marcaciones.md</strong>.
          </p>
        </div>
      </div>
    );
  }
  if (!datos) return null;

  const { resumen, ultimoRodado, agente, esperados } = datos;
  const marcaron = resumen.marcaron.length;
  const sinCedula = resumen.sinMaestro.sinCedula;
  const noEsperados = resumen.sinMaestro.noEsperados;

  const trabajaronSinHuella = resumen.trabajaron.filter((f) => !f.marco).length;
  const trabajaronFiltrados =
    huella === "todos"
      ? resumen.trabajaron
      : resumen.trabajaron.filter((f) => (huella === "con" ? f.marco : !f.marco));

  // Color del estado del agente. Ya no bloquea la lectura del día —la presencia
  // sale del despacho— pero la columna de huella sí depende de él.
  const atraso = agente.atrasoMin;
  const agenteTono =
    agente.ultimoError || atraso === null || atraso > 120
      ? "alerta"
      : atraso > 30
        ? "ojo"
        : "bien";

  function celdaConductor(f: Esperado) {
    return (
      <td className="px-3 py-2">
        <p className="font-medium text-gray-900">{f.nombre || "(sin nombre)"}</p>
        <p className="text-xs text-gray-500">
          CC {f.cedula}
          {f.codigo ? ` · cód. ${f.codigo}` : ""}
        </p>
      </td>
    );
  }

  function celdaBus(bus: string | null) {
    return (
      <td className="px-3 py-2 text-sm text-gray-600">
        {bus ? (
          <span className="inline-flex items-center gap-1">
            <Bus className="h-3.5 w-3.5 text-gray-400" />
            {bus}
          </span>
        ) : (
          "—"
        )}
      </td>
    );
  }

  function filaPendiente(f: FilaPendiente) {
    const ultimo = ultimoRodado[f.cedula];
    return (
      <tr key={f.cedula} className="border-b border-[#F1F5F9] last:border-0">
        {celdaConductor(f)}
        {celdaBus(f.bus)}
        <td className="px-3 py-2">
          <ChipOrigen fila={f} />
        </td>
        <td className="px-3 py-2">
          <ChipHuella marco={f.marco} />
        </td>
        <td className="px-3 py-2 text-sm tabular-nums text-gray-600">
          {ultimo ? (
            <span title={`Último viaje que rodó: ${ultimo.fecha}`}>
              {fechaCorta(ultimo.fecha)}
              <span
                className={`ml-1 text-xs ${ultimo.dias >= 5 ? "font-medium text-[#B45309]" : "text-gray-400"}`}
              >
                (hace {ultimo.dias} {ultimo.dias === 1 ? "día" : "días"})
              </span>
            </span>
          ) : (
            <span
              className="text-[#B45309]"
              title={`No rodó ningún día en los ${esperados.diasVentana} anteriores`}
            >
              sin rodar en {esperados.diasVentana} días
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          {puedeEditar && (
            <button
              onClick={() =>
                setRegistrando({
                  cedula: f.cedula,
                  codigo: f.codigo,
                  nombre: f.nombre,
                  tipo: CONCEPTO_NO_JUSTIFICADA,
                })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-[#4F46E5] px-2.5 py-1 text-xs font-medium text-[#4F46E5] hover:bg-[#EEF2FF]"
            >
              <Plus className="h-3.5 w-3.5" />
              Registrar novedad
            </button>
          )}
        </td>
      </tr>
    );
  }

  const cabeceraPendiente = (
    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
      <th className="px-3 py-2 font-medium">Conductor</th>
      <th className="px-3 py-2 font-medium">Bus esperado</th>
      <th className="px-3 py-2 font-medium">Se esperaba por</th>
      <th className="px-3 py-2 font-medium">Huella</th>
      <th className="px-3 py-2 font-medium">Último día que rodó</th>
      <th />
    </tr>
  );

  function filaTrabajo(f: FilaTrabajo) {
    const v = f.primerViaje;
    return (
      <tr key={f.cedula} className="border-b border-[#F1F5F9] last:border-0">
        {celdaConductor(f)}
        <td className="px-3 py-2 text-sm font-medium tabular-nums text-gray-900">
          {horaCorta(v.hora)}
        </td>
        {celdaBus(v.bus)}
        <td className="px-3 py-2 text-xs text-gray-500">
          {v.turno !== null ? `turno ${v.turno}` : "—"}
          {v.viaje !== null ? ` · viaje ${v.viaje}` : ""}
        </td>
        <td className="px-3 py-2 text-xs text-gray-500">{v.ruta ?? "—"}</td>
        <td className="px-3 py-2 text-sm tabular-nums text-gray-600">{v.viajes}</td>
        <td className="px-3 py-2">
          <ChipHuella marco={f.marco} />
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ── Fecha y estado del agente ───────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Día</label>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={fecha}
              max={hoy}
              onChange={(e) => e.target.value && irA(e.target.value)}
              className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
            />
            {fecha !== hoy && (
              <button
                onClick={() => irA(hoy)}
                className="text-xs font-medium text-[#4F46E5] hover:underline"
              >
                Hoy
              </button>
            )}
          </div>
        </div>

        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            agenteTono === "alerta"
              ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]"
              : agenteTono === "ojo"
                ? "border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]"
                : "border-[#A7F3D0] bg-[#F0FDF4] text-[#065F46]"
          }`}
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <Clock className="h-3.5 w-3.5" />
            Agente del biométrico
          </p>
          <p className="mt-0.5">
            {agente.ultimoEnvioAt
              ? `Último envío: ${fechaCorta(agente.ultimoEnvioAt)} ${hora(agente.ultimoEnvioAt)}` +
                (atraso !== null ? ` · hace ${atraso} min` : "")
              : "Nunca ha reportado"}
          </p>
          <p className="mt-0.5 opacity-80">
            {agente.total.toLocaleString("es-CO")} marcaciones guardadas
            {agente.ultimaMarcacionAt
              ? ` · la última del ${fechaCorta(agente.ultimaMarcacionAt)} ${hora(agente.ultimaMarcacionAt)}`
              : ""}
          </p>
          {agente.ultimoError && (
            <p className="mt-1 max-w-sm font-medium">Último error: {agente.ultimoError}</p>
          )}
          {agenteTono !== "bien" && (
            <p className="mt-1 max-w-sm font-medium">
              Mientras el agente no reporte, la columna «Huella» queda incompleta. La presencia no
              depende de él: sale del despacho de GEMA.
            </p>
          )}
        </div>
      </div>

      {/* ── Fichas ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Ficha
          icono={Bus}
          titulo="Se esperaban"
          valor={esperados.total}
          detalle={
            esperados.conProgramacion
              ? "conductores activos y programación del día"
              : "sin programación: conductores activos"
          }
        />
        <Ficha
          icono={CheckCircle2}
          titulo="Trabajaron"
          valor={resumen.trabajaron.length}
          detalle="tienen un viaje que salió a rodar"
          tono="bien"
        />
        <Ficha
          icono={Clock}
          titulo="Turno sin empezar"
          valor={resumen.porSalir.length}
          detalle="tienen viajes de hoy que aún no salen"
        />
        <Ficha
          icono={UserX}
          titulo="Sin despacho"
          valor={resumen.sinDespacho.length}
          detalle="ni viaje, ni turno pendiente, ni novedad"
          tono={resumen.sinDespacho.length > 0 ? "alerta" : "normal"}
        />
        <Ficha
          icono={Fingerprint}
          titulo="Trabajaron sin huella"
          valor={trabajaronSinHuella}
          detalle={`de ${resumen.trabajaron.length} que rodaron · solo informativo`}
        />
      </div>

      {/* Avisos de calidad del dato: el despacho de hoy puede estar a medias. */}
      {(esperados.despachoSincronizadoHasta !== null || esperados.busesSinConductor.length > 0) && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs text-gray-600">
          {esperados.despachoSincronizadoHasta && (
            <p>
              Despacho de GEMA sincronizado hasta el{" "}
              <strong>{fechaCorta(esperados.despachoSincronizadoHasta)}</strong>
              {esperados.despachoSincronizadoHasta < fecha && (
                <span className="text-[#B45309]">
                  {" "}
                  — para este día aún no hay viajes, así que los esperados salen del histórico de
                  cada bus.
                </span>
              )}
            </p>
          )}
          {esperados.busesSinConductor.length > 0 && (
            <p className="mt-1">
              {esperados.busesSinConductor.length} bus(es) programados sin conductor deducible:{" "}
              <span className="font-medium">{esperados.busesSinConductor.join(", ")}</span>
            </p>
          )}
        </div>
      )}

      {/* ── Formulario (el mismo de Ausentismo) ─────────────────────────── */}
      {registrando && (
        <RegistroForm
          fecha={fecha}
          hoy={hoy}
          registro={null}
          vehiculos={vehiculos}
          conceptos={catalogo}
          puedeEditar={puedeEditar}
          inicial={registrando}
          onConceptoCreado={(c) => setExtras((p) => [...p, c])}
          onDone={() => {
            setRegistrando(null);
            router.refresh();
          }}
        />
      )}

      {/* ── Sin despacho ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#F1F5F9] px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <UserX className="h-5 w-5 text-[#DC2626]" />
            Sin despacho ({resumen.sinDespacho.length})
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Se esperaban y GEMA no les registró ningún viaje que haya salido, no tienen turno
            pendiente para hoy y no tienen novedad. <strong>Incluye los descansos</strong>: Gestivo
            no tiene calendario de turnos, así que nada se registra solo — decide y usa «Registrar
            novedad».
          </p>
        </div>
        {resumen.sinDespacho.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            Todos los esperados rodaron, tienen turno pendiente o ya tienen su novedad.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">{cabeceraPendiente}</thead>
              <tbody>{resumen.sinDespacho.map(filaPendiente)}</tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Turno sin empezar ───────────────────────────────────────────── */}
      {resumen.porSalir.length > 0 && (
        <section className="rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#F1F5F9] px-4 py-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Clock className="h-5 w-5 text-[#4F46E5]" />
              Turno sin empezar ({resumen.porSalir.length})
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              GEMA les asignó viajes hoy que todavía no salen. <strong>No son ausencias</strong>: el
              primer viaje del día va de las 03:55 a las 16:40, así que a media mañana aún faltan
              turnos por arrancar.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">{cabeceraPendiente}</thead>
              <tbody>{resumen.porSalir.map(filaPendiente)}</tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Trabajaron ──────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#E2E8F0] bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#F1F5F9] px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <CheckCircle2 className="h-5 w-5 text-[#059669]" />
              Trabajaron ({resumen.trabajaron.length})
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Su cédula aparece en el despacho de GEMA con un viaje que salió a rodar. Ese primer
              viaje es la prueba de que vinieron.
            </p>
          </div>
          {/* El filtro que pidió el usuario: quiénes rodaron sin pasar la huella. */}
          <div className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] p-0.5">
            {(
              [
                ["todos", `Todos (${resumen.trabajaron.length})`],
                ["con", `Con huella (${resumen.trabajaron.length - trabajaronSinHuella})`],
                ["sin", `Sin huella (${trabajaronSinHuella})`],
              ] as const
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                onClick={() => setHuella(valor)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  huella === valor
                    ? "bg-[#EEF2FF] text-[#4338CA]"
                    : "text-gray-500 hover:bg-[#F8FAFC]"
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
        {trabajaronFiltrados.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            {resumen.trabajaron.length === 0
              ? "GEMA no registra ningún viaje que haya salido en este día."
              : "Ninguno en este filtro."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Conductor</th>
                  <th className="px-3 py-2 font-medium">Primer viaje</th>
                  <th className="px-3 py-2 font-medium">Bus</th>
                  <th className="px-3 py-2 font-medium">Turno</th>
                  <th className="px-3 py-2 font-medium">Ruta</th>
                  <th className="px-3 py-2 font-medium">Viajes</th>
                  <th className="px-3 py-2 font-medium">Huella</th>
                </tr>
              </thead>
              <tbody>{trabajaronFiltrados.map(filaTrabajo)}</tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Con novedad ─────────────────────────────────────────────────── */}
      {resumen.conNovedad.length > 0 && (
        <section className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Con novedad registrada ({resumen.conNovedad.length})
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            No tienen viaje, pero su ausencia ya está explicada en el Registro del día.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            {resumen.conNovedad.map((e) => e.nombre || e.cedula).join(" · ")}
          </p>
        </section>
      )}

      {/* ── Marcaron (informativo) ──────────────────────────────────────── */}
      <section className="rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#F1F5F9] px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Fingerprint className="h-5 w-5 text-gray-400" />
            Marcaron ({marcaron})
            <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-gray-500">
              informativo
            </span>
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Las huellas del día. <strong>No entran en la decisión de presencia</strong>: hoy solo la
            mitad de los conductores despachados pasa por el biométrico, así que como medida de
            asistencia todavía no sirve.
          </p>
        </div>
        {marcaron === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            Ninguna marcación de los esperados en este día.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Conductor</th>
                  <th className="px-3 py-2 font-medium">Primera</th>
                  <th className="px-3 py-2 font-medium">Última</th>
                  <th className="px-3 py-2 font-medium">Marcaciones</th>
                  <th className="px-3 py-2 font-medium">Pin</th>
                </tr>
              </thead>
              <tbody>
                {resumen.marcaron.map((f) => (
                  <tr key={f.cedula} className="border-b border-[#F1F5F9] last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{f.nombre || "(sin nombre)"}</p>
                      <p className="text-xs text-gray-500">
                        CC {f.cedula}
                        {f.codigo ? ` · cód. ${f.codigo}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-700">{hora(f.primera)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-700">{hora(f.ultima)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{f.cantidad}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {f.pines.join(", ")}
                      {f.pines.length > 1 && (
                        <span
                          className="ml-1 text-[#B45309]"
                          title="La persona está enrolada dos veces en el equipo: su asistencia viene partida en dos badges."
                        >
                          (2 badges)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Sin maestro ─────────────────────────────────────────────────── */}
      {(sinCedula.length > 0 || noEsperados.length > 0) && (
        <section className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Marcaron sin estar en la lista ({sinCedula.length + noEsperados.length})
          </h2>
          {noEsperados.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-gray-600">
                No se esperaban ({noEsperados.length}) — relevos, ruleta o personal administrativo
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {noEsperados
                  .map((f) => `${f.cedula} (${f.cantidad}×, ${hora(f.primera)})`)
                  .join(" · ")}
              </p>
            </div>
          )}
          {sinCedula.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-600">
                Pin sin cédula en el equipo ({sinCedula.length})
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {sinCedula.map((s) => `pin ${s.pin} (${s.cantidad}×)`).join(" · ")}
              </p>
              <p className="mt-1 text-[11px] leading-tight text-gray-500">
                Su «N.º de identificación» está en 0 en ZKAccess, o el pin ya se borró del equipo.
                Al llenarlo, Gestivo reatribuye las marcaciones viejas solo.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
