"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Info, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { BotonesExportar } from "@/components/ui/botones-exportar";
import type { FormatoExport } from "@/lib/exportar/formatos";
import type { ConductorPuntuado, MetricasModelo } from "@/lib/riesgo/corrida";
import { exportarRiesgo, type Objetivo } from "@/lib/riesgo/exportar";
import type { CorridaGuardada, CorridaResumen, NivelesCorrida } from "@/lib/riesgo/persistir";
import { recalcularRiesgo, registrarExportacion } from "./actions";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const num = (x: number) => x.toLocaleString("es-CO");

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Etiqueta de una corrida en el selector. Lleva los segundos y si fue
 * automática o a mano: dos recálculos del mismo corte pueden caer en el mismo
 * minuto y, sin eso, las opciones salen idénticas y no hay cómo elegir.
 */
function etiquetaCorrida(c: CorridaResumen): string {
  const cuando = new Date(c.ejecutadaAt).toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "medium",
  });
  const como = c.origen === "cron" ? "automático" : "a mano";
  return `Corte ${c.corte} · ${cuando} · ${como}${c.estado === "error" ? " · falló" : ""}`;
}

function Kpi({
  label,
  valor,
  nota,
  color,
}: {
  label: string;
  valor: string;
  nota?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: color ?? "#111827" }}>
        {valor}
      </p>
      {nota && <p className="mt-0.5 text-xs text-gray-500">{nota}</p>}
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#F1F5F9] py-1.5 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium tabular-nums text-gray-900">{valor}</span>
    </div>
  );
}

/**
 * Calidad de un modelo. Va con su lectura en palabras: para quien tiene que
 * decidir a qué conductor llamar, "de cada 10 del grupo de mayor riesgo, 6 se
 * retiraron" dice mucho más que "AUC 0,82".
 */
function CalidadModelo({
  titulo,
  horizonte,
  m,
  sujeto,
}: {
  titulo: string;
  horizonte: string;
  m: MetricasModelo;
  /** Lo que se predice, en plural: "se retiraron", "faltaron sin justificación". */
  sujeto: { pasado: string; nombre: string };
}) {
  const deCada10 = Math.round(m.precisionTop10 * 10);
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      <p className="mt-0.5 text-xs text-gray-500">{horizonte}</p>

      <div className="mt-3">
        <Dato label="Ordena bien el riesgo (AUC)" valor={m.auc.toFixed(3).replace(".", ",")} />
        <Dato label={`Tasa general de ${sujeto.nombre}`} valor={pct(m.base)} />
        <Dato label="Acierto en el 10 % de mayor puntaje" valor={pct(m.precisionTop10)} />
        <Dato label="Cuántas veces la tasa general" valor={`${m.liftTop10.toFixed(1).replace(".", ",")}×`} />
        <Dato label={`Del total, cuánto captura el 20 % superior`} valor={pct(m.capturaTop20, 0)} />
        <Dato label="Meses de prueba" valor={m.mesesTest.join(", ") || "—"} />
        <Dato
          label="Observaciones"
          valor={`${num(m.n)} entrena · ${num(m.nTest)} prueba · ${num(m.positivos)} casos`}
        />
      </div>

      <p className="mt-3 rounded-lg bg-[#F8FAFC] p-3 text-xs leading-relaxed text-gray-600">
        En los meses que el modelo no había visto, de cada 10 conductores del grupo de mayor
        riesgo <strong>{deCada10} {sujeto.pasado}</strong> de verdad, frente a{" "}
        {Math.round(m.base * 10)} de cada 10 en el resto de la plantilla. El 20 % con más
        puntaje concentró {pct(m.capturaTop20, 0)} de los casos que ocurrieron.
      </p>
    </div>
  );
}

const NIVEL_COLOR: Record<string, string> = {
  Alto: "#DC2626",
  Medio: "#D97706",
  Bajo: "#059669",
};

function ChipNivel({ nivel }: { nivel: string }) {
  const c = NIVEL_COLOR[nivel] ?? "#64748B";
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: `${c}1a`, color: c }}
    >
      {nivel}
    </span>
  );
}

/**
 * Detalle por conductor, el mismo que traía el informe HTML: quién está arriba,
 * con qué probabilidad y qué le pesa.
 *
 * Por defecto oculta el riesgo bajo — que es la mayoría de la plantilla y no
 * es sobre quien hay que actuar — y ordena por la probabilidad del objetivo
 * elegido, no por la del retiro, o al mirar faltas no justificadas la tabla
 * saldría en un orden que no corresponde.
 */
function DetalleConductores({
  conductores,
  corrida,
}: {
  conductores: ConductorPuntuado[];
  corrida: CorridaGuardada;
}) {
  const [objetivo, setObjetivo] = useState<Objetivo>("retiro");
  const [soloRiesgo, setSoloRiesgo] = useState(true);
  const [q, setQ] = useState("");

  const filas = useMemo(() => {
    const prob = (c: ConductorPuntuado) =>
      objetivo === "retiro" ? c.probRetiro : c.probNovedad;
    const nivel = (c: ConductorPuntuado) =>
      objetivo === "retiro" ? c.nivelRetiro : c.nivelNovedad;
    const texto = q.trim().toLowerCase();
    return conductores
      .filter((c) => !soloRiesgo || nivel(c) !== "Bajo")
      .filter(
        (c) =>
          !texto ||
          c.nombre.toLowerCase().includes(texto) ||
          c.cedula.includes(texto) ||
          (c.codigo ?? "").toLowerCase().includes(texto)
      )
      .sort((a, b) => prob(b) - prob(a));
  }, [conductores, objetivo, soloRiesgo, q]);

  async function exportar(formato: FormatoExport) {
    const filtros = { objetivo, soloRiesgo, q };
    await exportarRiesgo({ formato, corrida, filtros, filas });
    // El rastro va después de generar: si la descarga falla, no queda anotada
    // una copia que nunca existió.
    await registrarExportacion({
      corridaId: corrida.id,
      corte: corrida.corte,
      formato,
      objetivo,
      filas: filas.length,
    });
  }

  const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500";
  const thR = `${th} text-right`;
  const td = "px-3 py-2 align-top text-gray-700";
  const tdR = `${td} text-right tabular-nums`;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="border-l-4 border-[#4F46E5] pl-2.5 text-base font-semibold text-gray-900">
          Conductores, uno por uno
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
            {(
              [
                { v: "retiro", l: "Riesgo de retiro" },
                { v: "novedad", l: "Falta no justificada" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => setObjetivo(o.v)}
                className={`px-3 py-1.5 text-sm ${
                  objetivo === o.v
                    ? "bg-[#4F46E5] font-medium text-white"
                    : "bg-white text-gray-600 hover:bg-[#F8FAFC]"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={soloRiesgo}
              onChange={(e) => setSoloRiesgo(e.target.checked)}
              className="h-4 w-4 rounded border-[#CBD5E1]"
            />
            Solo alto y medio
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, cédula o código"
              className="h-9 w-56 rounded-lg border border-[#E2E8F0] bg-white pl-8 pr-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]"
            />
          </div>
          <BotonesExportar
            formatos={["pdf", "xlsx", "csv"]}
            sinDatos={filas.length === 0}
            onExportar={exportar}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <tr>
                <th className={thR}>#</th>
                <th className={th}>Conductor</th>
                <th className={th}>Tipo</th>
                <th className={thR}>Probabilidad</th>
                <th className={th}>Nivel</th>
                <th className={th}>Factores que pesan</th>
                <th className={thR}>Aus. 90d</th>
                <th className={thR}>No just. 90d</th>
                <th className={thR}>V. perdidos 90d</th>
                <th className={thR}>Antig. (meses)</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c, i) => {
                const prob = objetivo === "retiro" ? c.probRetiro : c.probNovedad;
                const nivel = objetivo === "retiro" ? c.nivelRetiro : c.nivelNovedad;
                const factores =
                  objetivo === "retiro" ? c.factoresRetiro : c.factoresNovedad;
                const v = c.variables;
                return (
                  <tr key={c.cedula} className="border-b border-[#F1F5F9] last:border-0">
                    <td className={tdR}>{i + 1}</td>
                    <td className={td}>
                      <span className="font-medium text-gray-900">{c.nombre}</span>
                      <span className="block text-xs text-gray-400">
                        {c.codigo ? `${c.codigo} · ` : ""}CC {c.cedula}
                      </span>
                    </td>
                    <td className={`${td} text-xs text-gray-500`}>{c.tipoConductor ?? "—"}</td>
                    <td className={`${tdR} font-semibold text-gray-900`}>{pct(prob)}</td>
                    <td className={td}>
                      <ChipNivel nivel={nivel} />
                    </td>
                    <td className={`${td} text-xs text-gray-500`}>
                      {factores.length
                        ? factores.map((f) => f.etiqueta).join(" · ")
                        : "Ninguno por encima del promedio"}
                    </td>
                    <td className={tdR}>{v.aus90 ?? 0}</td>
                    <td className={tdR}>{v.nj90 ?? 0}</td>
                    <td className={tdR}>{v.vp_cond90 ?? 0}</td>
                    <td className={tdR}>{Math.round(v.antig_meses ?? 0)}</td>
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">
                    Ningún conductor cumple el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {num(filas.length)} de {num(conductores.length)} conductores · ordenados por la
        probabilidad de{" "}
        {objetivo === "retiro" ? "retiro en 60 días" : "falta no justificada en 30 días"}. Los
        factores son las tres variables que más empujan el puntaje de ese conductor hacia
        arriba.
      </p>
    </section>
  );
}

export default function RiesgoClient({
  corridas,
  corrida,
  niveles,
  conductores,
  fallo,
  puedeRecalcular,
}: {
  corridas: CorridaResumen[];
  corrida: CorridaGuardada | null;
  niveles: NivelesCorrida | null;
  conductores: ConductorPuntuado[];
  fallo: string | null;
  puedeRecalcular: boolean;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  function recalcular() {
    empezar(async () => {
      const res = await recalcularRiesgo();
      if (res.success) {
        toast.success(`Análisis recalculado al corte ${res.corte}.`);
        router.push("/riesgo");
      } else {
        toast.error(res.error ?? "No se pudo recalcular");
      }
    });
  }

  const mR = corrida?.modelos?.retiro ?? null;
  const mN = corrida?.modelos?.novedad ?? null;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Recursos Humanos · Riesgo predictivo" icono={Activity}>
        {corridas.length > 0 && (
          <select
            value={corrida?.id ?? ""}
            onChange={(e) => router.push(`/riesgo?corrida=${e.target.value}`)}
            className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]"
            aria-label="Corte del análisis"
          >
            {corridas.map((c) => (
              <option key={c.id} value={c.id}>
                {etiquetaCorrida(c)}
              </option>
            ))}
          </select>
        )}
        {puedeRecalcular && (
          <button
            onClick={recalcular}
            disabled={pendiente}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-60"
          >
            {pendiente ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {pendiente ? "Calculando…" : "Recalcular"}
          </button>
        )}
      </PageHeader>

      {/* Ancho generoso: la tabla de conductores tiene 10 columnas y con
          max-w-6xl obligaba a desplazarse en horizontal para leerla. */}
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
        {fallo && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">No se pudo leer el análisis.</p>
              <p className="mt-0.5 text-xs">{fallo}</p>
              <p className="mt-1 text-xs">
                Si es la primera vez que se abre esta pantalla, falta correr la migración{" "}
                <code>20260910155217_modulo_de_riesgo_predictivo_de_conductores.sql</code> en el
                SQL Editor.
              </p>
            </div>
          </div>
        )}

        {!fallo && !corrida && (
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-gray-600">
            <p className="font-medium text-gray-900">Todavía no hay ninguna corrida.</p>
            <p className="mt-1">
              El análisis se calcula solo cada día a las 9:00, después de la sincronización con
              GEMA.
              {puedeRecalcular
                ? " Si necesitas verlo ahora, pulsa Recalcular."
                : " Vuelve mañana o pide a Administración que lo calcule."}
            </p>
          </div>
        )}

        {corrida?.estado === "error" && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Esta corrida falló, así que no tiene cifras.</p>
              <p className="mt-0.5 text-xs">{corrida.error ?? "Sin detalle."}</p>
            </div>
          </div>
        )}

        {corrida && niveles && mR && mN && (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Kpi
                label="Conductores en plantilla"
                valor={num(niveles.plantilla)}
                nota="Maestro de Gestivo, incluye relevos y afiliados"
              />
              <Kpi
                label="Riesgo alto de retiro"
                valor={num(niveles.retiroAlto)}
                nota={`${num(niveles.retiroMedio)} en riesgo medio · 60 días`}
                color="#DC2626"
              />
              <Kpi
                label="Riesgo alto de falta no justificada"
                valor={num(niveles.novedadAlto)}
                nota={`${num(niveles.novedadMedio)} en riesgo medio · 30 días`}
                color="#D97706"
              />
              <Kpi
                label="Tasa base de retiro"
                valor={pct(mR.base)}
                nota="Retiros en 60 días por conductor-mes"
              />
              <Kpi
                label="Tasa base de falta no justificada"
                valor={pct(mN.base)}
                nota="Faltas en 30 días por conductor-mes"
              />
            </section>

            <section>
              <h2 className="mb-3 border-l-4 border-[#4F46E5] pl-2.5 text-base font-semibold text-gray-900">
                Cuánto vale la predicción
              </h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <CalidadModelo
                  titulo="Retiro del conductor"
                  horizonte="Se va de la empresa dentro de los 60 días siguientes"
                  m={mR}
                  sujeto={{ pasado: "se retiraron", nombre: "retiro" }}
                />
                <CalidadModelo
                  titulo="Falta no justificada"
                  horizonte="Falta sin justificar (incluye «sin contacto») en los 30 días siguientes"
                  m={mN}
                  sujeto={{ pasado: "faltaron sin justificación", nombre: "falta no justificada" }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Las cifras salen de meses que el modelo no usó para entrenar. AUC es la
                probabilidad de que, tomando al azar un conductor al que le pasó y otro al que
                no, el modelo le dé más puntaje al primero.
              </p>
            </section>

            {conductores.length > 0 && (
              <DetalleConductores conductores={conductores} corrida={corrida} />
            )}

            <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div className="space-y-2 text-sm text-gray-600">
                  <h2 className="text-sm font-semibold text-gray-900">Cómo leer esto</h2>
                  <p>
                    <strong>Riesgo alto</strong> es una probabilidad de al menos 3 veces la tasa
                    general; <strong>medio</strong>, entre 1,5 y 3 veces. No es una sentencia: es
                    una lista de prioridad para hablar con el conductor o revisar su asignación
                    antes de que la novedad ocurra.
                  </p>
                  <p>
                    Dos variables salen aparentemente protectoras —
                    <em> vehículo en taller</em> y <em>sin ningún cierre en 30 días</em> — porque
                    quien no está operando no acumula retiros ni faltas registradas ese mes. Es
                    sesgo de exposición, no protección real.
                  </p>
                  <p>
                    El histórico disponible es corto y solo dos meses sirven de prueba, así que el
                    modelo se recalibra en cada corrida. El retiro sale de la fecha del maestro:
                    no distingue renuncia de despido ni de fin de contrato.
                  </p>
                  <p className="rounded-lg bg-[#FFFBEB] p-3 text-xs text-[#92400E]">
                    Esta pantalla se alimenta de datos personales de los conductores y cada
                    consulta queda registrada en Tesorería › Auditoría, módulo «riesgo».
                  </p>
                </div>
              </div>
            </section>

            <footer className="rounded-xl border border-[#E2E8F0] bg-white p-4 text-xs text-gray-500">
              Corte <strong className="text-gray-700">{corrida.corte}</strong> · calculado el{" "}
              {fechaHora(corrida.ejecutadaAt)} ·{" "}
              {corrida.origen === "cron" ? "automático" : "a mano"}
              {corrida.ejecutadaPorEmail ? ` por ${corrida.ejecutadaPorEmail}` : ""} ·{" "}
              {num(corrida.observaciones ?? 0)} observaciones conductor-mes en{" "}
              {corrida.cortes.length} meses
              {corrida.cortes.length > 0
                ? ` (${corrida.cortes[0].slice(0, 7)} a ${corrida.cortes[corrida.cortes.length - 1].slice(0, 7)})`
                : ""}
              {corrida.duracionMs
                ? ` · ${(corrida.duracionMs / 1000).toFixed(1).replace(".", ",")} s`
                : ""}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
