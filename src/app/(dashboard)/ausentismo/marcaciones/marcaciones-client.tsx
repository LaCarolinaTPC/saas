"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Bus, CalendarDays, CheckCircle2, Clock, Fingerprint,
  HelpCircle, Plus, UserX,
} from "lucide-react";
import type { Concepto, VehiculoOpcion } from "@/lib/ausentismo/constants";
import { CONCEPTO_NO_JUSTIFICADA } from "@/lib/ausentismo/constants";
import type { DatosMarcaciones } from "@/lib/biometrico/data";
import type { Esperado, FilaSinMarcacion } from "@/lib/biometrico/dia";
import { RegistroForm, type RegistroInicial } from "../registro-form";

/** Hora local legible de un momento ISO con offset. */
function hora(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : "—";
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

  const { resumen, ultimaConocida, agente, esperados } = datos;
  const marcaron = resumen.marcaron.length;
  const sinCedula = resumen.sinMaestro.sinCedula;
  const noEsperados = resumen.sinMaestro.noEsperados;

  // Color del estado del agente: sin noticias la pantalla del día no sirve, y
  // eso hay que decirlo antes de que alguien registre una falta que no es.
  const atraso = agente.atrasoMin;
  const agenteTono =
    agente.ultimoError || atraso === null || atraso > 120
      ? "alerta"
      : atraso > 30
        ? "ojo"
        : "bien";

  function filaPendiente(f: FilaSinMarcacion) {
    const ultima = ultimaConocida[f.cedula];
    return (
      <tr key={f.cedula} className="border-b border-[#F1F5F9] last:border-0">
        <td className="px-3 py-2">
          <p className="font-medium text-gray-900">{f.nombre || "(sin nombre)"}</p>
          <p className="text-xs text-gray-500">
            CC {f.cedula}
            {f.codigo ? ` · cód. ${f.codigo}` : ""}
          </p>
        </td>
        <td className="px-3 py-2 text-sm text-gray-600">
          {f.bus ? (
            <span className="inline-flex items-center gap-1">
              <Bus className="h-3.5 w-3.5 text-gray-400" />
              {f.bus}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="px-3 py-2">
          <ChipOrigen fila={f} />
        </td>
        <td className="px-3 py-2 text-sm">
          {f.despachado ? (
            <span className="font-medium text-[#B45309]">Sí</span>
          ) : (
            <span className="text-gray-400">No</span>
          )}
        </td>
        <td className="px-3 py-2 text-sm tabular-nums text-gray-600">
          {ultima ? (
            <span title={ultima.momento}>
              {fechaCorta(ultima.momento)}
              <span className="ml-1 text-xs text-gray-400">
                ({ultima.dias} {ultima.dias === 1 ? "día" : "días"})
              </span>
            </span>
          ) : (
            <span className="text-gray-400" title="Nunca marcó, o su pin no tiene cédula en el equipo">
              nunca
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
      <th className="px-3 py-2 font-medium">Bus</th>
      <th className="px-3 py-2 font-medium">Se esperaba por</th>
      <th className="px-3 py-2 font-medium">Despachado</th>
      <th className="px-3 py-2 font-medium">Última marcación</th>
      <th />
    </tr>
  );

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
              Mientras el agente no reporte, alguien que sí marcó puede salir como «sin marcación».
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
              ? "según la programación de GEMA del día"
              : "sin programación: conductores activos"
          }
        />
        <Ficha icono={CheckCircle2} titulo="Marcaron" valor={marcaron} tono="bien" />
        <Ficha
          icono={UserX}
          titulo="Sin marcación"
          valor={resumen.sinMarcacion.length}
          detalle="no marcó, no despachó y no tiene novedad"
          tono={resumen.sinMarcacion.length > 0 ? "alerta" : "normal"}
        />
        <Ficha
          icono={AlertTriangle}
          titulo="Trabajó sin marcar"
          valor={resumen.trabajoSinMarcar.length}
          detalle="GEMA lo despachó pero no pasó la huella"
        />
        <Ficha
          icono={HelpCircle}
          titulo="Sin maestro"
          valor={sinCedula.length + noEsperados.length}
          detalle={`${sinCedula.length} pin sin cédula · ${noEsperados.length} no esperados`}
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

      {/* ── Sin marcación ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#F1F5F9] px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <UserX className="h-5 w-5 text-[#DC2626]" />
            Sin marcación ({resumen.sinMarcacion.length})
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Se esperaban, no marcaron, GEMA no los despachó y no tienen novedad registrada.
            Nada se registra solo: decide y usa «Registrar novedad».
          </p>
        </div>
        {resumen.sinMarcacion.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            Todos los esperados marcaron, fueron despachados o ya tienen su novedad.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">{cabeceraPendiente}</thead>
              <tbody>{resumen.sinMarcacion.map(filaPendiente)}</tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Trabajó sin marcar ──────────────────────────────────────────── */}
      {resumen.trabajoSinMarcar.length > 0 && (
        <section className="rounded-xl border border-[#FCD34D] bg-white">
          <div className="border-b border-[#F1F5F9] px-4 py-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <AlertTriangle className="h-5 w-5 text-[#B45309]" />
              Trabajó sin marcar ({resumen.trabajoSinMarcar.length})
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              GEMA registró que despacharon, pero no hay huella. No es una ausencia: es el uso del
              biométrico.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#FFFBEB]">{cabeceraPendiente}</thead>
              <tbody>{resumen.trabajoSinMarcar.map(filaPendiente)}</tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Con novedad ─────────────────────────────────────────────────── */}
      {resumen.conNovedad.length > 0 && (
        <section className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Con novedad registrada ({resumen.conNovedad.length})
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            No marcaron, pero su ausencia ya está explicada en el Registro del día.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            {resumen.conNovedad.map((e) => e.nombre || e.cedula).join(" · ")}
          </p>
        </section>
      )}

      {/* ── Marcaron ────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#F1F5F9] px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Fingerprint className="h-5 w-5 text-[#059669]" />
            Marcaron ({marcaron})
          </h2>
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
