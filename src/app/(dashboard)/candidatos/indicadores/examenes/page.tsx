import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Stethoscope } from "lucide-react";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { pantallaExamenes } from "@/lib/seleccion/estadisticas-examenes-servidor";
import type { ConteoFase, FilaCausa } from "@/lib/seleccion/estadisticas-examenes";
import { BarrasConPorcentaje } from "@/components/graficos/graficos-comunicaciones";
import { PestanasIndicadores, periodoDeLaUrl } from "../pestanas-indicadores";
import { CargarRegistro } from "./cargar-registro";
import { HerramientasIndicadores } from "@/components/indicadores/herramientas-indicadores";

export const dynamic = "force-dynamic";

const RUTA = "/candidatos/indicadores/examenes";
type Parametro = string | string[] | undefined;
const primero = (v: Parametro) => (Array.isArray(v) ? v[0] : v);
const fmt = (n: number) => n.toLocaleString("es-CO");
const pct = (n: number, de: number) => (de ? `${Math.round((n / de) * 100)} %` : "—");
const MES = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", month: "long" });
const nombreMes = (m: string) => (/^\d{4}-\d{2}$/.test(m) ? MES.format(new Date(`${m}-15T12:00:00Z`)).replace(/^./, (c) => c.toUpperCase()) : "Sin fecha");
const FECHA_HORA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

/**
 * Candidatos › Indicadores › Exámenes médicos (27-nov-2026): las cifras del
 * registro de exámenes de ingreso de Salud Ocupacional (el Excel cargado más lo
 * registrado en Gestivo), por mes de la fase 1. Filtro: `anio` en la URL.
 */
export default async function IndicadoresExamenesPage({ searchParams }: { searchParams: Promise<Record<string, Parametro>> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) redirect("/");
  const sp = await searchParams;
  const anioUrl = Number(primero(sp.anio));
  const anio = Number.isInteger(anioUrl) && anioUrl > 2000 && anioUrl < 2100 ? anioUrl : new Date().getFullYear();
  const d = await pantallaExamenes(anio);
  const e = d.estadisticas;
  const t = e.total;

  return (
    <div className="mx-auto w-full max-w-6xl p-4 pb-20 sm:p-6 md:pb-6 lg:p-8">
      <Link href="/candidatos" className="mb-4 inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Candidatos
      </Link>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Stethoscope className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">Exámenes médicos de ingreso</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Aspirantes citados a la fase 1 en {anio}, por el mes de la fase 1. Junta el registro de Salud Ocupacional cargado del Excel ({fmt(e.fuentes.historico)}) y lo
            registrado en Gestivo ({fmt(e.fuentes.gestivo)}); quien esté en los dos se cuenta una vez.
          </p>
        </div>
        <CargarRegistro puedeEditar={puedeEditarEn(perms, "candidatos")} />
      </div>

      <PestanasIndicadores actual="examenes" periodo={periodoDeLaUrl(sp)} />
      <HerramientasIndicadores titulo="Exámenes médicos de ingreso" contexto={`Año ${anio}, por el mes de la fase 1`} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-text-tertiary">Año:</span>
        {d.anios.map((a) => (
          <Link key={a} href={`${RUTA}?anio=${a}`} className={`rounded-lg px-3 py-1 ${a === anio ? "bg-primary text-white" : "border border-border bg-white text-text-secondary hover:bg-slate-50"}`}>
            {a}
          </Link>
        ))}
        {d.historico && (
          <span className="ml-auto text-xs text-text-tertiary">
            Registro cargado: {fmt(d.historico.filas)} filas{d.historico.ultimaCarga ? ` · última carga ${FECHA_HORA.format(new Date(d.historico.ultimaCarga))}` : ""}
            {d.historico.archivo ? ` («${d.historico.archivo}»)` : ""}
          </span>
        )}
      </div>

      {d.error && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{d.error}</p>}

      {t.citados === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-white p-8 text-center text-sm text-text-tertiary">
          No hay aspirantes citados a exámenes en {anio}. Cargue el Excel del registro de Salud Ocupacional para ver el histórico.
        </p>
      ) : (
        <div id="indicadores-contenido" className="space-y-4">
          <section>
            <h2 className="sr-only">Resumen del año</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Cifra etiqueta="Citados a la fase 1" valor={fmt(t.citados)} />
            <Cifra etiqueta="Aptos para contratar" valor={fmt(t.aptosContratar)} nota={`${pct(t.aptosContratar, t.citados)} de los citados`} />
            <Cifra etiqueta="No aptos" valor={fmt(t.fase1.no_apto + t.fase2.no_apto)} nota={`fase 1: ${fmt(t.fase1.no_apto)} · fase 2: ${fmt(t.fase2.no_apto)}`} />
            <Cifra etiqueta="Desistieron en la fase 1" valor={fmt(t.fase1.desistio)} nota={`${pct(t.fase1.desistio, t.citados)} de los citados`} alerta />
            <Cifra etiqueta="Desistieron en la fase 2" valor={fmt(t.fase2.desistio)} nota={`${pct(t.fase2.desistio, t.fase1.apto)} de los que pasaron la fase 1`} />
            </div>
          </section>

          <Seccion encabezado="Por mes" ayuda="Cada aspirante cuenta en el mes de su fase 1. La fase 2 solo la hacen los aptos de la fase 1.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-xs text-text-tertiary">
                  <tr className="border-b border-border">
                    <th rowSpan={2} className="px-2 py-1.5 text-left font-medium">Mes</th>
                    <th rowSpan={2} className="px-2 py-1.5 text-right font-medium">Citados</th>
                    <th colSpan={4} className="border-l border-border px-2 py-1 text-center font-medium">Fase 1</th>
                    <th colSpan={4} className="border-l border-border px-2 py-1 text-center font-medium">Fase 2</th>
                    <th rowSpan={2} className="border-l border-border px-2 py-1.5 text-right font-medium">Aptos para contratar</th>
                  </tr>
                  <tr className="border-b border-border">
                    {["Apto", "No apto", "Desistió", "Pend./aplaz."].map((h) => (
                      <th key={`f1${h}`} className={`px-2 py-1 text-right font-medium ${h === "Apto" ? "border-l border-border" : ""}`}>
                        {h}
                      </th>
                    ))}
                    {["Apto", "No apto", "Desistió", "Pend./aplaz."].map((h) => (
                      <th key={`f2${h}`} className={`px-2 py-1 text-right font-medium ${h === "Apto" ? "border-l border-border" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {e.meses.map((m) => (
                    <FilaMes key={m.mes} etiqueta={nombreMes(m.mes)} citados={m.citados} f1={m.fase1} f2={m.fase2} aptos={m.aptosContratar} />
                  ))}
                  <FilaMes etiqueta="Total" citados={t.citados} f1={t.fase1} f2={t.fase2} aptos={t.aptosContratar} total />
                </tbody>
              </table>
            </div>
          </Seccion>

          <div className="grid gap-4 lg:grid-cols-2">
            <Seccion encabezado="Por qué desistieron" ayuda="Causa anotada al desistir. «Sin explicación»: no contestó o no dijo por qué.">
              <p className="mb-1 text-xs font-medium text-text-secondary">Fase 1 ({fmt(t.fase1.desistio)})</p>
              <BarrasConPorcentaje filas={barras(e.causasDesistio.fase1)} total={t.fase1.desistio} unidad="aspirantes" anchoEtiqueta={170} />
              {t.fase2.desistio > 0 && (
                <>
                  <p className="mb-1 mt-3 text-xs font-medium text-text-secondary">Fase 2 ({fmt(t.fase2.desistio)})</p>
                  <BarrasConPorcentaje filas={barras(e.causasDesistio.fase2)} total={t.fase2.desistio} unidad="aspirantes" anchoEtiqueta={170} />
                </>
              )}
            </Seccion>
            <Seccion encabezado="Por qué no fueron aptos" ayuda="Causa médica anotada (una persona puede tener varias). Las dos fases juntas.">
              <BarrasConPorcentaje filas={barras(e.causasNoApto)} total={t.fase1.no_apto + t.fase2.no_apto} unidad="aspirantes" anchoEtiqueta={170} />
            </Seccion>
          </div>

          <Seccion encabezado="Por laboratorio">
            <table className="w-full text-sm">
              <thead className="text-xs text-text-tertiary">
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left font-medium">Laboratorio</th>
                  <th className="px-2 py-1.5 text-right font-medium">Citados</th>
                  <th className="px-2 py-1.5 text-right font-medium">Aptos para contratar</th>
                  <th className="px-2 py-1.5 text-right font-medium">No aptos</th>
                  <th className="px-2 py-1.5 text-right font-medium">Desistieron</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {e.laboratorios.map((l) => (
                  <tr key={l.laboratorio}>
                    <td className="px-2 py-1.5">{l.laboratorio}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(l.citados)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmt(l.aptosContratar)} <span className="text-xs text-text-tertiary">{pct(l.aptosContratar, l.citados)}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmt(l.noApto)} <span className="text-xs text-text-tertiary">{pct(l.noApto, l.citados)}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmt(l.desistio)} <span className="text-xs text-text-tertiary">{pct(l.desistio, l.citados)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Seccion>
        </div>
      )}
    </div>
  );
}

const barras = (filas: FilaCausa[]) => filas.slice(0, 10).map((f) => ({ clave: f.causa, etiqueta: f.causa, n: f.n }));

function FilaMes({ etiqueta, citados, f1, f2, aptos, total = false }: { etiqueta: string; citados: number; f1: ConteoFase; f2: ConteoFase; aptos: number; total?: boolean }) {
  const celda = (n: number, de: number, extra = "") => (
    <td className={`px-2 py-1.5 text-right tabular-nums ${extra}`}>
      {fmt(n)}
      {n > 0 && de > 0 && <span className="ml-1 text-[11px] text-text-tertiary">{pct(n, de)}</span>}
    </td>
  );
  return (
    <tr className={total ? "bg-slate-50 font-semibold" : ""}>
      <td className="px-2 py-1.5">{etiqueta}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{fmt(citados)}</td>
      {celda(f1.apto, citados, "border-l border-border")}
      {celda(f1.no_apto, citados)}
      {celda(f1.desistio, citados, f1.desistio ? "text-red-700" : "")}
      <td className="px-2 py-1.5 text-right tabular-nums text-text-tertiary">{fmt(f1.pendiente + f1.aplazado)}</td>
      {celda(f2.apto, f1.apto, "border-l border-border")}
      {celda(f2.no_apto, f1.apto)}
      {celda(f2.desistio, f1.apto, f2.desistio ? "text-red-700" : "")}
      <td className="px-2 py-1.5 text-right tabular-nums text-text-tertiary">{fmt(f2.pendiente + f2.aplazado)}</td>
      {celda(aptos, citados, "border-l border-border")}
    </tr>
  );
}

function Seccion({ encabezado, ayuda, children }: { encabezado: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-white p-4">
      <h2 className="text-sm font-semibold text-text-primary">{encabezado}</h2>
      {ayuda && <p className="mb-3 text-xs text-text-tertiary">{ayuda}</p>}
      {children}
    </section>
  );
}

function Cifra({ etiqueta, valor, nota, alerta = false }: { etiqueta: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white p-3 ${alerta ? "border-red-200" : "border-border"}`} data-cifra={etiqueta} data-valor={valor} data-nota={nota ?? ""}>
      <p className="text-xs text-text-tertiary">{etiqueta}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${alerta ? "text-red-700" : "text-text-primary"}`}>{valor}</p>
      {nota && <p className="text-[11px] text-text-tertiary">{nota}</p>}
    </div>
  );
}
