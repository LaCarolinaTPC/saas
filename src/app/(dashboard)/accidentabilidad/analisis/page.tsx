import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, BarChart3, CircleDollarSign, HandCoins, ShieldAlert, TrendingDown, TrendingUp, Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import {
  calcularKpis, contarFactoresPolitica, filtrosDesdeParams, generarPrescriptivos, getAccidentesAnalisis,
  getOpcionesFiltro, porDiaSemana, porGravedad, porHora, porResponsabilidad, porRuta, porTenencia,
  rankingConductores, rankingVehiculos, serieMensual, type FiltrosAccidente, type Recomendacion, type Severidad,
} from "@/lib/accidentabilidad/analisis";
import FiltrosAccidentes from "../_components/filtros-accidentes";
import { Barras, Dona, LineaMensual } from "./analisis-graficos";

export const dynamic = "force-dynamic";

const pesos = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Rango anterior de igual duración (para la variación), si hay desde+hasta. */
function rangoAnterior(f: FiltrosAccidente): FiltrosAccidente | null {
  if (!f.desde || !f.hasta) return null;
  const d0 = new Date(f.desde);
  const d1 = new Date(f.hasta);
  const dias = Math.round((d1.getTime() - d0.getTime()) / 86400000) + 1;
  const prevFin = new Date(d0.getTime() - 86400000);
  const prevIni = new Date(prevFin.getTime() - (dias - 1) * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { ...f, desde: iso(prevIni), hasta: iso(prevFin) };
}

export default async function AnalisisAccidentabilidadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "accidentabilidad_analisis")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }

  const sp = await searchParams;
  const filtros = filtrosDesdeParams(sp);
  if (!filtros.origen) filtros.origen = "ambos"; // Gestivo + histórico (decisión 1)

  const prev = rangoAnterior(filtros);
  const [rows, anteriores, opciones] = await Promise.all([
    getAccidentesAnalisis(filtros),
    prev ? getAccidentesAnalisis(prev) : Promise.resolve(undefined),
    getOpcionesFiltro(),
  ]);

  const kpis = calcularKpis(rows, anteriores);
  const recomendaciones = generarPrescriptivos(rows);
  const mensual = serieMensual(rows);
  const factores = contarFactoresPolitica(rows);
  const responsabilidad = porResponsabilidad(rows);
  const gravedad = porGravedad(rows);
  const tenencia = porTenencia(rows);
  const rutas = porRuta(rows, 10);
  const horas = porHora(rows);
  const dias = porDiaSemana(rows);
  const topConductores = rankingConductores(rows, 10);
  const topVehiculos = rankingVehiculos(rows, 10);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Análisis de accidentabilidad" icono={BarChart3}>
        <Link
          href="/accidentabilidad/consultar"
          className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-[#F8FAFC]"
        >
          Ir a consultar
        </Link>
      </PageHeader>

      <div className="px-6 py-6">
        <FiltrosAccidentes basePath="/accidentabilidad/analisis" rutas={opciones.rutas} aseguradoras={opciones.aseguradoras} />

        {rows.length === 0 ? (
          <p className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-10 text-center text-sm text-gray-400">
            No hay accidentes para los filtros seleccionados.
          </p>
        ) : (
          <>
            {/* KPIs */}
            <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Kpi
                icon={AlertTriangle}
                label="Total de accidentes"
                value={kpis.total.toLocaleString("es-CO")}
                extra={
                  kpis.variacion == null ? undefined : (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${kpis.variacion > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {kpis.variacion > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {kpis.variacion > 0 ? "+" : ""}{kpis.variacion}% vs. periodo previo
                    </span>
                  )
                }
              />
              <Kpi icon={ShieldAlert} label="Responsabilidad propia" value={`${kpis.pctResponsabilidadPropia}%`} sub="conductor o compartida" />
              <Kpi icon={AlertTriangle} label="Accidentes graves" value={`${kpis.pctGraves}%`} sub={`${kpis.fatales} con víctima fatal`} tono={kpis.fatales > 0 ? "rojo" : undefined} />
              <Kpi icon={CircleDollarSign} label="Costo de reparación" value={pesos(kpis.costoReparacionTotal)} sub={`Prom. ${pesos(kpis.costoReparacionPromedio)}`} />
              <Kpi icon={HandCoins} label="Arreglos directos" value={pesos(kpis.arregloTotal)} sub="monto pagado en sitio" />
              <Kpi icon={ShieldAlert} label="Factor dominante" value={kpis.factorDominante?.label ?? "—"} sub={kpis.factorDominante ? `${kpis.factorDominante.count} casos` : "sin factores"} />
              <Kpi icon={Users} label="Reincidencia" value={`${kpis.pctReincidencia}%`} sub={`${kpis.conductoresReincidentes} conductor(es) ≥2`} />
              <Kpi icon={AlertTriangle} label="Casos abiertos" value={kpis.casosAbiertos.toLocaleString("es-CO")} sub={`${kpis.pctConIpat}% con IPAT`} />
            </section>

            {/* Prescriptivo */}
            {recomendaciones.length > 0 && (
              <section className="mb-6">
                <h2 className="mb-2 text-sm font-semibold text-gray-700">Acciones sugeridas</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {recomendaciones.map((r, i) => (
                    <Prescripcion key={i} r={r} />
                  ))}
                </div>
              </section>
            )}

            {/* Descriptivo */}
            <section className="grid gap-4 lg:grid-cols-2">
              <Panel titulo="Tendencia mensual">
                <LineaMensual datos={mensual} />
              </Panel>
              <Panel titulo="Factores de riesgo (Política de Correctivos)">
                {factores.length > 0 ? <Barras datos={factores} color="#eb6834" /> : <Vacio />}
              </Panel>
              <Panel titulo="Responsabilidad">
                <Dona datos={responsabilidad} />
              </Panel>
              <Panel titulo="Gravedad">
                <Barras datos={gravedad} />
              </Panel>
              <Panel titulo="Rutas con más accidentes">
                <Barras datos={rutas} horizontal />
              </Panel>
              <Panel titulo="Empresa vs. afiliado">
                <Dona datos={tenencia} />
              </Panel>
              <Panel titulo="Por hora del día">
                <Barras datos={horas} />
              </Panel>
              <Panel titulo="Por día de la semana">
                <Barras datos={dias} />
              </Panel>
              <Panel titulo="Conductores con más accidentes">
                <TablaRanking items={topConductores} etiqueta="Conductor" />
              </Panel>
              <Panel titulo="Vehículos con más accidentes">
                <TablaRanking items={topVehiculos} etiqueta="Vehículo" />
              </Panel>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, extra, tono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  extra?: React.ReactNode;
  tono?: "rojo";
}) {
  return (
    <div className={`rounded-xl border bg-white p-4 ${tono === "rojo" ? "border-red-200" : "border-[#E2E8F0]"}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
      {extra && <div className="mt-1">{extra}</div>}
    </div>
  );
}

const TONO_SEV: Record<Severidad, string> = {
  alta: "border-red-200 bg-red-50 text-red-900",
  media: "border-amber-200 bg-amber-50 text-amber-900",
  baja: "border-sky-200 bg-sky-50 text-sky-900",
};

function Prescripcion({ r }: { r: Recomendacion }) {
  const qs = r.filtro
    ? "?" + new URLSearchParams(
        Object.entries(r.filtro).flatMap(([k, v]) => {
          const map: Record<string, string> = { responsabilidad: "resp", aseguradora: "aseg", conductor: "q" };
          return v == null ? [] : [[map[k] ?? k, String(v)]];
        })
      ).toString()
    : "";
  return (
    <div className={`rounded-xl border p-4 ${TONO_SEV[r.severidad]}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{r.titulo}</h3>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase">{r.severidad}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed opacity-90">{r.detalle}</p>
      {r.filtro && (
        <Link href={`/accidentabilidad/consultar${qs}`} className="mt-2 inline-block text-xs font-medium underline">
          Ver casos →
        </Link>
      )}
    </div>
  );
}

function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{titulo}</h3>
      {children}
    </div>
  );
}

function Vacio() {
  return <p className="py-10 text-center text-xs text-gray-400">Sin datos</p>;
}

function TablaRanking({ items, etiqueta }: { items: { clave: string; nombre: string; total: number; propias: number; graves: number }[]; etiqueta: string }) {
  if (items.length === 0) return <Vacio />;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
        <tr>
          <th className="py-1.5">{etiqueta}</th>
          <th className="py-1.5 text-right">Total</th>
          <th className="py-1.5 text-right">Propias</th>
          <th className="py-1.5 text-right">Graves</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.clave} className="border-t border-[#F1F5F9]">
            <td className="py-1.5 text-gray-800">{it.nombre}</td>
            <td className="py-1.5 text-right font-medium text-gray-900">{it.total}</td>
            <td className="py-1.5 text-right text-gray-600">{it.propias}</td>
            <td className="py-1.5 text-right text-gray-600">{it.graves}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
