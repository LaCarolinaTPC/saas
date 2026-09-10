"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Info, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import type { MetricasModelo } from "@/lib/riesgo/corrida";
import type { CorridaGuardada, CorridaResumen, NivelesCorrida } from "@/lib/riesgo/persistir";
import { recalcularRiesgo } from "./actions";

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

export default function RiesgoClient({
  corridas,
  corrida,
  niveles,
  fallo,
  puedeRecalcular,
}: {
  corridas: CorridaResumen[];
  corrida: CorridaGuardada | null;
  niveles: NivelesCorrida | null;
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

      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
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
