"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Info, LineChart, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { BotonesExportar } from "@/components/ui/botones-exportar";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { BarrasPesos, BarrasRetirosMes, BarrasTramo } from "@/components/graficos/graficos-riesgo";
import { LineaNetoFlota, LineasTrayectoria } from "@/components/graficos/graficos-liquidacion";
import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import type { FormatoExport } from "@/lib/exportar/formatos";
import { mesMas, type Analisis, type ConductorPuntuado } from "@/lib/analisis-liquidacion/analisis";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const num = (x: number) => x.toLocaleString("es-CO");
const pesos = (x: number | null) => (x == null ? "—" : `$${Math.round(x).toLocaleString("es-CO")}`);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesLargo = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const fechaCorta = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;

const NIVEL_COLOR: Record<string, string> = { Alto: "#DC2626", Medio: "#D97706", Bajo: "#059669" };

function ChipNivel({ nivel }: { nivel: string }) {
  const c = NIVEL_COLOR[nivel] ?? "#64748B";
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: `${c}1a`, color: c }}>
      {nivel}
    </span>
  );
}

function Kpi({ label, valor, nota, color }: { label: string; valor: string; nota?: string; color?: string }) {
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

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 border-l-4 border-[#4F46E5] pl-2.5 text-base font-semibold text-gray-900">{titulo}</h2>
      {nota && <p className="mb-3 pl-3.5 text-sm text-gray-500">{nota}</p>}
      {children}
    </section>
  );
}

function Tarjeta({ titulo, children, nota }: { titulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{titulo}</h3>
      {children}
      {nota && <p className="mt-2 text-xs text-gray-500">{nota}</p>}
    </div>
  );
}

// ── Exportación ──────────────────────────────────────────────────────────────

const ENCABEZADO = [
  "Conductor", "Código", "Cédula", "Probabilidad de retiro 60 días", "Nivel", "Factores",
  "Ruta principal", "Antigüedad (meses)", "Días mes anterior", "Días mes en curso",
  "Neto por día", "Ventas por día", "Ventas vs. su ruta", "Días bajo la base", "Último cierre",
];

function fila(c: ConductorPuntuado): CeldaCsv[] {
  return [
    c.nombre, c.codigo ?? "", c.cedula, Number((c.prob * 100).toFixed(1)), c.nivel, c.factores.join(" · "),
    c.ruta ?? "", Math.round(c.antigMeses), c.diasM1, c.diasMesActual,
    c.netoDia == null ? "" : Math.round(c.netoDia), c.brutoDia == null ? "" : Math.round(c.brutoDia),
    c.brutoVsRuta == null ? "" : Number(c.brutoVsRuta.toFixed(2)),
    c.pctBajoBase == null ? "" : Number((c.pctBajoBase * 100).toFixed(0)), c.ultimoCierre ?? "",
  ];
}

async function exportar(formato: FormatoExport, filas: ConductorPuntuado[], a: Analisis) {
  const nombre = `analisis_liquidacion_${a.corte}`;
  const contexto = [
    [`Análisis de liquidación · riesgo de retiro en 60 días · corte ${a.corte}`],
    [
      a.metricas
        ? `Modelo: AUC ${a.metricas.auc.toFixed(3)} · acierto en el 10 % superior ${pct(a.metricas.precisionTop10)} · probado en ${a.metricas.mesesTest.join(", ")}`
        : "Modelo sin datos suficientes para publicar métricas",
    ],
    ["Contiene ingresos de cada conductor: uso interno, no reenviar."],
    [],
  ];
  if (formato === "csv") {
    descargarCsv(`${nombre}.csv`, [...contexto, ENCABEZADO, ...filas.map(fila)]);
    return;
  }
  const XLSX = await import("xlsx");
  const hoja = XLSX.utils.aoa_to_sheet([...contexto, ENCABEZADO, ...filas.map(fila)]);
  hoja["!cols"] = ENCABEZADO.map((h, i) => ({ wch: i === 0 || i === 5 ? 36 : Math.max(12, h.length + 2) }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Conductores");
  XLSX.writeFile(libro, `${nombre}.xlsx`);
}

// ── Conductores ──────────────────────────────────────────────────────────────

function TablaConductores({ a }: { a: Analisis }) {
  const [soloRiesgo, setSoloRiesgo] = useState(true);
  const [ruta, setRuta] = useState("");
  const [q, setQ] = useState("");
  const rutas = useMemo(() => [...new Set(a.conductores.map((c) => c.ruta).filter(Boolean))].sort() as string[], [a]);

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return a.conductores
      .filter((c) => !soloRiesgo || c.nivel !== "Bajo")
      .filter((c) => !ruta || c.ruta === ruta)
      .filter((c) => !t || c.nombre.toLowerCase().includes(t) || c.cedula.includes(t) || (c.codigo ?? "").toLowerCase().includes(t));
  }, [a, soloRiesgo, ruta, q]);
  const pag = usePaginacion(filas, { reiniciar: `${soloRiesgo}|${ruta}|${q}` });
  const ancla = useRef<HTMLDivElement>(null);

  const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500";
  const thR = `${th} text-right`;
  const td = "px-3 py-2 align-top text-gray-700";
  const tdR = `${td} text-right tabular-nums`;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="border-l-4 border-[#4F46E5] pl-2.5 text-base font-semibold text-gray-900">
          Conductores activos, del más al menos propenso a retirarse
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={soloRiesgo} onChange={(e) => setSoloRiesgo(e.target.checked)} className="h-4 w-4 rounded border-[#CBD5E1]" />
            Solo alto y medio
          </label>
          <select value={ruta} onChange={(e) => setRuta(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700">
            <option value="">Todas las rutas</option>
            {rutas.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, cédula o código"
              className="h-9 w-56 rounded-lg border border-[#E2E8F0] bg-white pl-8 pr-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]"
            />
          </div>
          <BotonesExportar formatos={["xlsx", "csv"]} sinDatos={filas.length === 0} onExportar={(f) => exportar(f, filas, a)} />
        </div>
      </div>

      <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
              <tr>
                <th className={thR}>#</th>
                <th className={th}>Conductor</th>
                <th className={thR}>Probabilidad</th>
                <th className={th}>Nivel</th>
                <th className={th}>Qué le pesa</th>
                <th className={thR}>Días mes ant.</th>
                <th className={thR}>Días este mes</th>
                <th className={thR}>Neto / día</th>
                <th className={thR}>Ventas vs. ruta</th>
                <th className={thR}>Antig. (meses)</th>
              </tr>
            </thead>
            <tbody>
              {pag.filas.map((c, i) => (
                <tr key={c.cedula} className="border-b border-[#F1F5F9] last:border-0">
                  <td className={tdR}>{pag.desde + i}</td>
                  <td className={td}>
                    <span className="font-medium text-gray-900">{c.nombre}</span>
                    <span className="block text-xs text-gray-400">
                      {c.codigo ? `${c.codigo} · ` : ""}CC {c.cedula}
                      {c.ruta ? ` · ${c.ruta}` : ""}
                    </span>
                  </td>
                  <td className={`${tdR} font-semibold text-gray-900`}>{pct(c.prob)}</td>
                  <td className={td}>
                    <ChipNivel nivel={c.nivel} />
                  </td>
                  <td className={`${td} text-xs text-gray-500`}>{c.factores.length ? c.factores.join(" · ") : "Nada por encima del promedio"}</td>
                  <td className={tdR}>{c.diasM1}</td>
                  <td className={tdR}>
                    {c.diasMesActual}
                    {c.ultimoCierre && <span className="block text-[11px] text-gray-400">últ. {fechaCorta(c.ultimoCierre)}</span>}
                  </td>
                  <td className={tdR}>{pesos(c.netoDia)}</td>
                  <td className={tdR}>
                    {c.brutoVsRuta == null ? (
                      "—"
                    ) : (
                      <span className={c.brutoVsRuta < 0.9 ? "font-medium text-[#B91C1C]" : ""}>{c.brutoVsRuta.toFixed(2).replace(".", ",")}</span>
                    )}
                  </td>
                  <td className={tdR}>{Math.round(c.antigMeses)}</td>
                </tr>
              ))}
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
        <Paginador p={pag} unidad="conductores" ancla={ancla} />
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {num(filas.length)} de {num(a.conductores.length)} conductores activos con cierres recientes. Las variables
        miran {mesLargo(mesMas(a.corte, -1))} y los dos meses previos; «Días este mes» es lo que va del mes en curso. «Ventas vs. ruta»: 1,00 = la mediana de su ruta; por debajo de 0,90
        va en rojo.
      </p>
    </section>
  );
}

// ── Pantalla ─────────────────────────────────────────────────────────────────

export function AnalisisLiquidacionClient({ analisis: a, fallo }: { analisis: Analisis | null; fallo: string | null }) {
  const [medida, setMedida] = useState<"dias" | "neto">("dias");

  if (fallo || !a) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <PageHeader titulo="Análisis de liquidación" icono={LineChart} />
        <div className="p-6">
          <div className="flex items-start gap-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-5 text-sm text-[#991B1B]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">No se pudo leer la liquidación.</p>
              <p className="mt-1">
                Si el módulo se acaba de desplegar, falta aplicar en el SQL Editor la migración{" "}
                <code>20261007192020_vista_mensual_de_liquidacion_por_conductor_y_modulo_analisis_de_liquidacion.sql</code>.
              </p>
              {fallo && <p className="mt-2 font-mono text-xs opacity-75">{fallo}</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const m = a.metricas;
  const alto = a.conductores.filter((c) => c.nivel === "Alto").length;
  const medio = a.conductores.filter((c) => c.nivel === "Medio").length;
  const ultimo = [...a.flota].reverse().find((f) => f.netoDia != null);
  const retiros12 = a.flota.slice(-13, -1);
  const tasaAnual = retiros12.reduce((s, f) => s + f.retiros, 0);
  const t1 = a.trayectoria.find((p) => p.mesesAntes === 1);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Análisis de liquidación"
        descripcion={`Deserción de conductores según lo que trabajan, venden y ganan · corte ${mesLargo(a.corte)}`}
        icono={LineChart}
      />

      <div className="space-y-8 px-6 py-6">
        {a.mesesSinValores.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Los cierres de <strong>{a.mesesSinValores.map(mesLargo).join(", ")}</strong> llegaron de GEMA sin valores en
              plata (neto, ventas). Esos meses cuentan para días, viajes y pasajeros, pero no para el ingreso. Se corrige
              volviendo a sincronizar esos meses desde GEMA.
            </span>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Riesgo alto" valor={num(alto)} nota={`de ${num(a.conductores.length)} activos`} color={NIVEL_COLOR.Alto} />
          <Kpi label="Riesgo medio" valor={num(medio)} color={NIVEL_COLOR.Medio} />
          <Kpi label="Retiros 12 meses" valor={num(tasaAnual)} nota="según el maestro" />
          <Kpi label="Neto por día" valor={pesos(ultimo?.netoDia ?? null)} nota={ultimo ? `mediana de ${ultimo.mes}` : undefined} />
          <Kpi
            label="Días antes de irse"
            valor={t1 ? t1.retiradosDias.toFixed(0) : "—"}
            nota={t1 ? `el mes previo al retiro, contra ${t1.activosDias.toFixed(0)} de los activos` : undefined}
          />
        </div>

        {/* Predictivo */}
        <TablaConductores a={a} />

        <Seccion
          titulo="Qué tan confiable es la predicción"
          nota="El modelo se entrena con los meses viejos y se prueba con los dos más recientes que ya se pueden verificar, sin dejarle ver el resultado."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Tarjeta titulo="Calidad del modelo">
              {m ? (
                <div className="space-y-1.5 text-sm text-gray-700">
                  <p>
                    En {m.mesesTest.join(" y ")}, de cada 10 conductores del grupo de mayor puntaje{" "}
                    <strong>{Math.round(m.precisionTop10 * 10)} se retiraron</strong> en los 60 días siguientes, frente a{" "}
                    {Math.round(m.base * 10)} de cada 10 en la plantilla.
                  </p>
                  <p>
                    El 20 % con más puntaje concentró <strong>{pct(m.capturaTop20, 0)}</strong> de los retiros. AUC{" "}
                    {m.auc.toFixed(2).replace(".", ",")} (0,5 = azar, 1 = perfecto).
                  </p>
                  <p className="text-xs text-gray-500">
                    {num(m.n)} observaciones de entrenamiento · {num(m.nTest)} de prueba · {num(m.positivos)} retiros en la prueba.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Todavía no hay suficientes meses verificables para medir el modelo.</p>
              )}
            </Tarjeta>
            <Tarjeta titulo="Lo que más pesa" nota="Rojo suma riesgo de retiro; verde lo resta. Variables estandarizadas.">
              <BarrasPesos coeficientes={a.coeficientes} maximo={10} />
            </Tarjeta>
          </div>
        </Seccion>

        {/* Descriptivo */}
        <Seccion
          titulo="Cómo venían los que se fueron"
          nota="Mes a mes antes del retiro, frente a la plantilla activa de hoy en sus últimos meses."
        >
          <Tarjeta titulo={medida === "dias" ? "Días trabajados por mes" : "Neto ganado por día (mediana)"}>
            <div className="mb-2 flex w-fit overflow-hidden rounded-lg border border-[#E2E8F0] text-sm">
              {(
                [
                  { v: "dias", l: "Días trabajados" },
                  { v: "neto", l: "Neto por día" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setMedida(o.v)}
                  className={`px-3 py-1.5 ${medida === o.v ? "bg-[#4F46E5] font-medium text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            <LineasTrayectoria datos={a.trayectoria} medida={medida} />
          </Tarjeta>
        </Seccion>

        <Seccion titulo="Tasa de retiro según la liquidación" nota="Proporción de conductores que se retiró en los 60 días siguientes, según cómo les fue el mes anterior.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {a.tramos.map((t) => (
              <Tarjeta key={t.titulo} titulo={t.titulo} nota={t.nota}>
                <BarrasTramo datos={t.datos} />
              </Tarjeta>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="La flota mes a mes">
          <div className="grid gap-4 lg:grid-cols-2">
            <Tarjeta titulo="Neto ganado por día (mediana de la flota)" nota="En blanco los meses que llegaron sin valores de GEMA.">
              <LineaNetoFlota datos={a.flota} />
            </Tarjeta>
            <Tarjeta titulo="Retiros por mes" nota="Tasa sobre los conductores con cierres ese mes.">
              <BarrasRetirosMes datos={a.flota.map((f) => ({ mes: f.mes, plantilla: f.conductores, retiros: f.retiros, tasa: f.tasa }))} />
            </Tarjeta>
          </div>
        </Seccion>

        {a.rutas.length > 0 && (
          <Seccion titulo="Por ruta principal" nota="La ruta principal de cada mes es la de más viajes del conductor.">
            <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Ruta</th>
                    <th className="px-3 py-2 text-right">Conductores el mes pasado</th>
                    <th className="px-3 py-2 text-right">Días por mes</th>
                    <th className="px-3 py-2 text-right">Neto por día</th>
                    <th className="px-3 py-2 text-right">Retiro en 60 días</th>
                  </tr>
                </thead>
                <tbody>
                  {a.rutas.map((r) => (
                    <tr key={r.ruta} className="border-b border-[#F1F5F9] last:border-0">
                      <td className="px-3 py-2 font-medium text-gray-900">{r.ruta}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(r.conductores)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.diasPromedio.toFixed(1).replace(".", ",")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pesos(r.netoDia)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {pct(r.tasa)} <span className="text-xs font-normal text-gray-400">({num(r.n)} conductor-mes)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>
        )}

        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 text-sm leading-relaxed text-gray-600">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Cómo leer esto</h2>
          <p>
            La probabilidad estima si el conductor se retira en los próximos 60 días según su liquidación de los tres meses
            anteriores: días trabajados y su caída, viajes y pasajeros, ventas y su comparación con la ruta, neto por día y su
            tendencia, días por debajo de la base, variabilidad del ingreso y cambios de ruta o vehículo, además de la
            antigüedad. Es una alerta para conversar con el conductor, no una decisión: se recalcula en cada visita con los
            cierres sincronizados de GEMA. «Alto» es al menos 3 veces la tasa general; «Medio», al menos 1,5 veces.
          </p>
        </div>
      </div>
    </div>
  );
}
