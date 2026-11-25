import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { PERIODOS, diaBogota, formatoDuracion, porcentaje, resolverPeriodo, type Indicadores, type Rango } from "@/lib/comunicaciones/indicadores";
import { leerIndicadoresDelPeriodo } from "@/lib/comunicaciones/indicadores-servidor";
import { leerIndicadoresRespuesta, leerIndicadoresSeleccion } from "@/lib/seleccion/indicadores-servidor";
import { duracionLegible, type IndicadoresSeleccion } from "@/lib/seleccion/indicadores";
import type { IndicadoresRespuesta } from "@/lib/seleccion/indicadores-respuesta";
import { resolverRangoCostos } from "@/lib/seleccion/costos";
import { leerCostosSeleccion } from "@/lib/seleccion/costos-servidor";
import { CostoSeccion } from "./costo-seccion";
import { configReporteDiario } from "./reporte-actions";
import { ReporteDiarioConfig } from "./reporte-diario-config";
import { evaluarAlertas, umbralesAlertas } from "@/lib/seleccion/alertas-indicadores";
import { leerAjustes, valorAjuste } from "@/lib/seleccion/servidor";
import { BarrasConPorcentaje, BarrasPorDia, type FilaBarra } from "@/components/graficos/graficos-comunicaciones";
import { PestanasIndicadores, periodoDeLaUrl } from "./pestanas-indicadores";

export const dynamic = "force-dynamic";

const RUTA = "/candidatos/indicadores";
const fmt = (n: number) => n.toLocaleString("es-CO");
const pesos = (n: number | null) => (n == null ? null : `$${Math.round(n).toLocaleString("es-CO")}`);
const pctTxt = (p: number | null) => (p == null ? null : `${Math.round(p)}%`);

type Parametro = string | string[] | undefined;
const primero = (v: Parametro) => (Array.isArray(v) ? v[0] : v);

/**
 * Indicadores de la selección de conductores (entrega 4, K1): los cinco que se
 * prometieron a la junta, el embudo por etapa, los tiempos, las causas de
 * cierre, por semana y por canal, y el costo frente al tope del mes. Desde el
 * 21-nov-2026 también el asistente de IA y el semáforo de la preselección, que
 * estaban en los indicadores de Comunicaciones.
 * Periodo en la URL, como en los de Comunicaciones: `dias` o `desde`/`hasta`.
 */
export default async function IndicadoresSeleccionPage({ searchParams }: { searchParams: Promise<Record<string, Parametro>> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) redirect("/");

  const sp = await searchParams;
  const periodo = resolverPeriodo({ dias: primero(sp.dias), desde: primero(sp.desde), hasta: primero(sp.hasta) });
  // El costo tiene su propio periodo (el mes en curso por defecto); cada filtro conserva el del otro.
  const urlCosto = { costo_desde: primero(sp.costo_desde), costo_hasta: primero(sp.costo_hasta) };
  const periodoCosto = resolverRangoCostos({ desde: urlCosto.costo_desde, hasta: urlCosto.costo_hasta });
  const periodoPagina = { dias: primero(sp.dias), desde: primero(sp.desde), hasta: primero(sp.hasta) };
  // 24-nov-2026: no se espera todo antes de mostrar la página. Las lecturas arrancan a la
  // vez y cada grupo de secciones aparece cuando llegan sus datos (<Suspense>).
  const selP = leerIndicadoresSeleccion(periodo.rango);
  const respP = leerIndicadoresRespuesta(periodo.rango);
  // Asistente de IA y preselección: se calculan con las conversaciones del periodo.
  const chatP = leerIndicadoresDelPeriodo(periodo.rango.desde, periodo.rango.hasta).catch(() => null);
  const costosP = leerCostosSeleccion(periodoCosto.rango);
  const reporteP = configReporteDiario().catch(() => null);
  const dias = Math.round((new Date(`${periodo.rango.hasta}T12:00:00Z`).getTime() - new Date(`${periodo.rango.desde}T12:00:00Z`).getTime()) / 86_400_000) + 1;

  return (
    <div className="mx-auto w-full max-w-6xl p-4 pb-20 sm:p-6 md:pb-6 lg:p-8">
      <Link href="/candidatos" className="mb-4 inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Candidatos
      </Link>

      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">Indicadores de selección</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Aspirantes cuyo proceso empezó del {fechaLarga(periodo.rango.desde)} al {fechaLarga(periodo.rango.hasta)} ({dias} {dias === 1 ? "día" : "días"}). Sin
            los del chat de prueba.
          </p>
        </div>
      </div>

      <PestanasIndicadores actual="seleccion" periodo={periodoDeLaUrl(sp)} />

      <Filtros dias={periodo.dias} rango={periodo.rango} costo={urlCosto} />

      {periodo.aviso && <Aviso>{periodo.aviso}</Aviso>}

      <div className="space-y-6">
        <Suspense fallback={<Cargando titulos={["Alertas"]} />}>
          <GrupoAlertas selP={selP} chatP={chatP} respP={respP} />
        </Suspense>
        <Suspense fallback={<Cargando titulos={["Los cinco indicadores", "Embudo"]} />}>
          <GrupoPrincipal selP={selP} />
        </Suspense>
        <Suspense fallback={<Cargando titulos={["Mensajes de WhatsApp", "Preselección del asistente"]} />}>
          <GrupoChat chatP={chatP} selP={selP} />
        </Suspense>
        <Suspense fallback={<Cargando titulos={["¿Responden los aspirantes?"]} />}>
          <GrupoRespuesta respP={respP} />
        </Suspense>
        <Suspense fallback={<Cargando titulos={["Cuánto tardan en cada etapa", "Por qué se cerraron"]} />}>
          <GrupoDetalle selP={selP} chatP={chatP} />
        </Suspense>
        <Suspense fallback={<Cargando titulos={["Costo"]} />}>
          <GrupoCosto
            costosP={costosP}
            selP={selP}
            aviso={periodoCosto.aviso}
            periodoPagina={periodoPagina}
            elegido={!!(urlCosto.costo_desde || urlCosto.costo_hasta) && !periodoCosto.aviso}
          />
        </Suspense>
        <Suspense fallback={null}>
          <GrupoReporte reporteP={reporteP} />
        </Suspense>
      </div>
    </div>
  );
}

// ── Grupos que se muestran a medida que llegan sus datos ─────────────────────

type SelP = ReturnType<typeof leerIndicadoresSeleccion>;
type ChatP = Promise<Indicadores | null>;

/**
 * Alertas (24-nov-2026): los mismos umbrales del reporte diario, con el periodo
 * de la página. Las de «ayer» solo van en el correo.
 */
async function GrupoAlertas({ selP, chatP, respP }: { selP: SelP; chatP: ChatP; respP: Promise<IndicadoresRespuesta | null> }) {
  const [{ ind }, chat, resp, ajustes] = await Promise.all([selP, chatP, respP, leerAjustes().catch(() => [])]);
  const alertas = evaluarAlertas({ ind, chat, resp }, umbralesAlertas((k) => valorAjuste<unknown>(ajustes, k, undefined)));
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${alertas.length ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
      <h2 className={`text-base font-semibold ${alertas.length ? "text-red-800" : "text-emerald-800"}`}>
        {alertas.length ? `⚠ ${alertas.length} ${alertas.length === 1 ? "alerta" : "alertas"} para revisar` : "Sin alertas"}
      </h2>
      <p className={`mt-0.5 text-xs ${alertas.length ? "text-red-700" : "text-emerald-700"}`}>
        Indicadores del periodo fuera de los umbrales (Selección › Tiempos y reglas › «Alertas del reporte diario»). Son las mismas del correo diario a Gestión Humana.
      </p>
      {alertas.length > 0 && (
        <ul className="mt-3 divide-y divide-red-200">
          {alertas.map((a) => (
            <li key={a.clave} className="py-2">
              <p className="text-sm font-semibold text-red-900">
                {a.titulo}: {a.valor} <span className="font-normal text-red-700">({a.umbral})</span>
              </p>
              <p className="text-xs text-red-800">{a.accion}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function GrupoPrincipal({ selP }: { selP: SelP }) {
  const { ind } = await selP;
  return (
    <>
      {ind.faltantes.length > 0 && (
        <Aviso>Algunos datos aún no están disponibles en esta instalación ({ind.faltantes.join(", ")}). Se muestra el resto.</Aviso>
      )}
      <CincoIndicadores ind={ind} />
      <Embudo ind={ind} />
    </>
  );
}

async function GrupoChat({ chatP, selP }: { chatP: ChatP; selP: SelP }) {
  const [chat, { ind }] = await Promise.all([chatP, selP]);
  if (!chat) return null;
  return (
    <>
      <Mensajes c={chat} ind={ind} />
      <Preseleccion c={chat} />
    </>
  );
}

async function GrupoRespuesta({ respP }: { respP: Promise<IndicadoresRespuesta | null> }) {
  const resp = await respP;
  if (!resp) return null;
  return (
    <>
      <Respuesta r={resp} />
      <Recordatorios r={resp} />
      <Recomendados r={resp} />
    </>
  );
}

async function GrupoDetalle({ selP, chatP }: { selP: SelP; chatP: ChatP }) {
  const [{ ind }, chat] = await Promise.all([selP, chatP]);
  return (
    <>
      <Tiempos ind={ind} />
      <Cierres ind={ind} />
      <SemanaYCanal ind={ind} />
      <Antecedentes ind={ind} />
      {chat && <Asistente c={chat} />}
    </>
  );
}

type PropsCosto = Parameters<typeof CostoSeccion>[0];

async function GrupoCosto({
  costosP,
  selP,
  aviso,
  periodoPagina,
  elegido,
}: {
  costosP: ReturnType<typeof leerCostosSeleccion>;
  selP: SelP;
  aviso: PropsCosto["aviso"];
  periodoPagina: PropsCosto["periodoPagina"];
  elegido: PropsCosto["elegido"];
}) {
  const [costos, { gasto }] = await Promise.all([costosP, selP]);
  return <CostoSeccion d={costos.detalle} gasto={gasto} aviso={aviso} periodoPagina={periodoPagina} elegido={elegido} />;
}

async function GrupoReporte({ reporteP }: { reporteP: Promise<Awaited<ReturnType<typeof configReporteDiario>> | null> }) {
  const reporte = await reporteP;
  return reporte ? <ReporteDiarioConfig inicial={reporte} /> : null;
}

/** Lo que se ve mientras llegan los datos de un grupo. */
function Cargando({ titulos }: { titulos: string[] }) {
  return (
    <>
      {titulos.map((t) => (
        <section key={t} className="rounded-2xl border border-border bg-white p-4 sm:p-5" aria-busy="true">
          <h2 className="text-base font-semibold text-text-primary">{t}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[84px] animate-pulse rounded-xl bg-[#F1F5F9]" />
            ))}
          </div>
          <p className="mt-3 text-xs text-text-tertiary">Cargando…</p>
        </section>
      ))}
    </>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────────

function fechaLarga(dia: string): string {
  return new Date(`${dia}T12:00:00-05:00`).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" });
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">{children}</p>;
}

function Seccion({ encabezado, ayuda, children }: { encabezado: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-text-primary">{encabezado}</h2>
      {ayuda && <p className="mt-0.5 text-xs text-text-tertiary">{ayuda}</p>}
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: string | null; nota?: string }) {
  return (
    <div className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC] p-4">
      <p className="text-[12px] font-medium text-[#64748B]">{etiqueta}</p>
      <p className="mt-1.5 text-[24px] font-bold leading-none text-[#0F172A]">{valor ?? "—"}</p>
      {nota && <p className="mt-1.5 text-[11px] leading-snug text-[#64748B]">{nota}</p>}
    </div>
  );
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-medium text-text-secondary">{children}</h3>;
}

const CAMPO = "h-7 rounded-md border border-border bg-white px-2 text-xs text-text-primary outline-none focus:border-primary";

function Filtros({ dias, rango, costo }: { dias: number | null; rango: Rango; costo: Record<string, string | undefined> }) {
  const conRango = dias == null;
  const hoy = diaBogota(new Date());
  const conCosto = (base: Record<string, string>) => {
    const q = new URLSearchParams(base);
    for (const [k, v] of Object.entries(costo)) if (v) q.set(k, v);
    const t = q.toString();
    return t ? `${RUTA}?${t}` : RUTA;
  };
  return (
    <form method="get" action={RUTA} className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl border border-border bg-white p-3">
      {Object.entries(costo).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <nav className="flex rounded-lg border border-border bg-white p-0.5 text-xs" aria-label="Periodo">
        {PERIODOS.map((p) => (
          <Link
            key={p}
            href={conCosto(p === 30 ? {} : { dias: String(p) })}
            aria-current={p === dias ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 ${p === dias ? "bg-primary font-medium text-white" : "text-text-secondary hover:bg-slate-50"}`}
          >
            {p} días
          </Link>
        ))}
      </nav>
      <div className={`flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs text-text-secondary ${conRango ? "border-primary bg-primary/5" : "border-border"}`}>
        <span>Del</span>
        <input type="date" name="desde" aria-label="Desde" defaultValue={conRango ? rango.desde : undefined} max={hoy} className={CAMPO} />
        <span>al</span>
        <input type="date" name="hasta" aria-label="Hasta (incluido)" defaultValue={conRango ? rango.hasta : undefined} max={hoy} className={CAMPO} />
      </div>
      <button type="submit" className="h-8 rounded-lg bg-primary px-4 text-xs font-medium text-white hover:bg-primary/90">
        Aplicar
      </button>
    </form>
  );
}

// ── Secciones ────────────────────────────────────────────────────────────────

type P = { ind: IndicadoresSeleccion };

function CincoIndicadores({ ind }: P) {
  const k = ind.clave;
  return (
    <Seccion encabezado="Los cinco indicadores" ayuda="Los que se acordaron con la junta para medir la selección.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cifra
          etiqueta="Envían la hoja de vida"
          valor={pctTxt(k.hojaVida.pct)}
          nota={k.hojaVida.base ? `${fmt(k.hojaVida.n)} de ${fmt(k.hojaVida.base)} que llegaron por el asistente` : "Nadie llegó por el asistente en este periodo"}
        />
        <Cifra
          etiqueta="Citados que asisten"
          valor={pctTxt(k.asistencia.pct)}
          nota={
            k.asistencia.citas
              ? `Prueba de manejo: ${fmt(k.asistencia.asistieron)} sí, ${fmt(k.asistencia.noAsistieron)} no${k.asistencia.sinRegistrar ? `, ${fmt(k.asistencia.sinRegistrar)} sin registrar` : ""}`
              : "Sin citas pasadas en este periodo"
          }
        />
        <Cifra
          etiqueta="Del primer mensaje a la contratación"
          valor={k.diasHastaContratar.n ? duracionLegible(k.diasHastaContratar.mediana) : null}
          nota={k.diasHastaContratar.n ? `Mediana de ${fmt(k.diasHastaContratar.n)} contratados en el periodo` : "Nadie se contrató en este periodo"}
        />
        <Cifra
          etiqueta="Antecedentes automáticos"
          valor={pctTxt(k.antecedentes.pctAutomaticas)}
          nota={k.antecedentes.total ? `${fmt(k.antecedentes.automaticas + k.antecedentes.reutilizadas)} de ${fmt(k.antecedentes.total)} consultas sin intervención` : "Sin consultas en este periodo"}
        />
        <Cifra
          etiqueta="Costo por aspirante"
          valor={pesos(k.costo.porAspiranteCop)}
          nota={ind.aspirantes ? `${pesos(k.costo.totalCop)} entre ${fmt(ind.aspirantes)} aspirantes` : "Sin aspirantes en este periodo"}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra etiqueta="Aspirantes" valor={fmt(ind.aspirantes)} nota="Procesos creados en el periodo" />
        <Cifra etiqueta="En curso" valor={fmt(ind.enCurso)} />
        <Cifra etiqueta="Contratados" valor={fmt(ind.contratados)} nota={ind.aspirantes ? `${pctTxt((ind.contratados / ind.aspirantes) * 100)} de los aspirantes` : undefined} />
        <Cifra etiqueta="Cerrados" valor={fmt(ind.cerrados)} nota={ind.aspirantes ? `${pctTxt((ind.cerrados / ind.aspirantes) * 100)} de los aspirantes` : undefined} />
      </div>
    </Seccion>
  );
}

function Embudo({ ind }: P) {
  const embudo: FilaBarra[] = ind.embudo.map((f) => ({ ...f, tono: f.clave === "contratado" ? "normal" : undefined }));
  const actual: FilaBarra[] = ind.porEtapa.filter((f) => f.n > 0).map((f) => ({ ...f, tono: f.clave === "cierre" ? "alerta" : "normal" }));
  return (
    <Seccion
      encabezado="Embudo"
      ayuda="Cuántos llegaron a cada etapa (o la pasaron). El porcentaje es sobre todos los aspirantes del periodo. Los procesos anteriores al 13 de noviembre no tienen historial de etapas."
    >
      <BarrasConPorcentaje filas={embudo} total={ind.aspirantes} unidad="aspirantes" anchoEtiqueta={220} />
      <div>
        <Subtitulo>Dónde están hoy</Subtitulo>
        <BarrasConPorcentaje filas={actual} total={ind.aspirantes} unidad="aspirantes" anchoEtiqueta={220} />
      </div>
    </Seccion>
  );
}

function Tiempos({ ind }: P) {
  const filas = ind.tiempoEnEtapa.filter((t) => t.tiempos.n > 0);
  return (
    <Seccion encabezado="Cuánto tardan en cada etapa" ayuda="Desde que entran a la etapa hasta que pasan a la siguiente. La mediana es el caso típico; el p90, los más lentos.">
      {filas.length === 0 ? (
        <p className="text-sm text-text-tertiary">— Ningún aspirante del periodo ha pasado de etapa todavía.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-tertiary">
                <th className="py-2 pr-3 font-medium">Etapa</th>
                <th className="py-2 pr-3 font-medium">Mediana</th>
                <th className="py-2 pr-3 font-medium">p90</th>
                <th className="py-2 font-medium">Casos</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((t) => (
                <tr key={t.estado} className="border-b border-[#F1F5F9] last:border-0">
                  <td className="py-2 pr-3 text-text-primary">{t.etiqueta}</td>
                  <td className="py-2 pr-3 font-semibold text-text-primary">{duracionLegible(t.tiempos.mediana)}</td>
                  <td className="py-2 pr-3 text-text-secondary">{duracionLegible(t.tiempos.p90)}</td>
                  <td className="py-2 text-text-secondary">{fmt(t.tiempos.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}

// ── Respuesta de los aspirantes (pedido del 21-nov-2026) ─────────────────────

type R = { r: IndicadoresRespuesta };

function FilaTiempo({ etiqueta, t }: { etiqueta: string; t: IndicadoresRespuesta["tiempos"]["respuestaAspirante"] }) {
  return (
    <tr className="border-b border-[#F1F5F9] last:border-0">
      <td className="py-2 pr-3 text-text-primary">{etiqueta}</td>
      <td className="py-2 pr-3 font-semibold text-text-primary">{duracionLegible(t.mediana)}</td>
      <td className="py-2 pr-3 text-text-secondary">{duracionLegible(t.p90)}</td>
      <td className="py-2 text-text-secondary">{fmt(t.n)}</td>
    </tr>
  );
}

function Respuesta({ r }: R) {
  const preguntas: FilaBarra[] = r.preguntas.map((p) => ({ clave: p.clave, etiqueta: p.etiqueta, n: p.n }));
  return (
    <Seccion
      encabezado="¿Responden los aspirantes?"
      ayuda="Conversaciones que empezaron en el periodo y a las que les escribimos (sin las de otros temas). Hasta qué pregunta del asistente llegó cada una y cuánto tardan."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra etiqueta="Conversaciones" valor={fmt(r.base)} nota="Aspirantes a los que les escribimos" />
        <Cifra etiqueta="Nos respondieron" valor={pctTxt(r.pctRespondieron)} nota={`${fmt(r.respondieron)} de ${fmt(r.base)} escribieron de nuevo`} />
        <Cifra etiqueta="Tardan en responder" valor={duracionLegible(r.tiempos.respuestaAspirante.mediana)} nota="Mediana, desde nuestro mensaje" />
        <Cifra etiqueta="Hasta quedar registrados" valor={duracionLegible(r.tiempos.hastaRegistro.mediana)} nota="Del primer mensaje a cédula y autorización" />
      </div>
      <div>
        <Subtitulo>Hasta qué pregunta llegaron</Subtitulo>
        <BarrasConPorcentaje filas={preguntas} total={r.base} unidad="conversaciones" anchoEtiqueta={220} />
      </div>
      <div className="overflow-x-auto">
        <Subtitulo>Tiempos</Subtitulo>
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-tertiary">
              <th className="py-2 pr-3 font-medium">Qué se mide</th>
              <th className="py-2 pr-3 font-medium">Mediana</th>
              <th className="py-2 pr-3 font-medium">p90</th>
              <th className="py-2 font-medium">Casos</th>
            </tr>
          </thead>
          <tbody>
            <FilaTiempo etiqueta="El aspirante responde un mensaje nuestro" t={r.tiempos.respuestaAspirante} />
            <FilaTiempo etiqueta="Del primer mensaje al registro como candidato" t={r.tiempos.hastaRegistro} />
            <FilaTiempo etiqueta="Del registro a la primera cita" t={r.tiempos.hastaPrimeraCita} />
            <FilaTiempo etiqueta="Responde después de un recordatorio" t={r.recordatorios.tiempoRespuesta} />
          </tbody>
        </table>
      </div>
    </Seccion>
  );
}

function Recordatorios({ r }: R) {
  const s = r.recordatorios;
  const c = r.citas;
  const citas: FilaBarra[] = [
    { clave: "confirmaron", etiqueta: "Confirmaron", n: c.confirmaron },
    { clave: "otra", etiqueta: "Pidieron otra fecha", n: c.pidieronOtraFecha },
    { clave: "sin", etiqueta: "Sin respuesta", n: c.sinRespuesta },
  ];
  return (
    <Seccion
      encabezado="¿Sirven los recordatorios?"
      ayuda="Recordatorios por silencio (cuando el aspirante deja de escribir) y recordatorios de cita. Un recordatorio cuenta como respondido si lo siguiente en la conversación es un mensaje del aspirante."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra etiqueta="Recibieron recordatorio" valor={fmt(s.conversaciones)} nota={`${fmt(s.enviados)} recordatorios enviados`} />
        <Cifra etiqueta="Volvieron a escribir" valor={pctTxt(s.pctVolvieron)} nota={`${fmt(s.volvieron)} de ${fmt(s.conversaciones)}`} />
        <Cifra etiqueta="Volvieron y se registraron" valor={fmt(s.volvieronYRegistraron)} nota="Quedaron como candidatos" />
        <Cifra etiqueta="Quedaron para una persona" valor={fmt(s.escaladas)} nota="No respondieron a ninguno" />
      </div>
      {s.porNumero.length > 0 && (
        <div className="overflow-x-auto">
          <Subtitulo>Por número de recordatorio</Subtitulo>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-tertiary">
                <th className="py-2 pr-3 font-medium">Recordatorio</th>
                <th className="py-2 pr-3 font-medium">Enviados</th>
                <th className="py-2 pr-3 font-medium">Respondidos</th>
                <th className="py-2 font-medium">% respondidos</th>
              </tr>
            </thead>
            <tbody>
              {s.porNumero.map((n) => (
                <tr key={n.numero} className="border-b border-[#F1F5F9] last:border-0">
                  <td className="py-2 pr-3 text-text-primary">{n.numero}.º</td>
                  <td className="py-2 pr-3 text-text-secondary">{fmt(n.enviados)}</td>
                  <td className="py-2 pr-3 text-text-secondary">{fmt(n.respondidos)}</td>
                  <td className="py-2 font-semibold text-text-primary">{pctTxt(n.pct) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <Subtitulo>Recordatorio de cita ({fmt(c.recordadas)} citas)</Subtitulo>
        <BarrasConPorcentaje filas={citas} total={c.recordadas} unidad="citas" anchoEtiqueta={200} />
        {c.asistenciaConfirmadas.citas + c.asistenciaSinConfirmar.citas > 0 && (
          <p className="mt-2 text-xs text-text-tertiary">
            Asistieron {pctTxt(c.asistenciaConfirmadas.pct) ?? "—"} de las que confirmaron ({fmt(c.asistenciaConfirmadas.asistieron)} de {fmt(c.asistenciaConfirmadas.citas)}) y{" "}
            {pctTxt(c.asistenciaSinConfirmar.pct) ?? "—"} de las que no confirmaron ({fmt(c.asistenciaSinConfirmar.asistieron)} de {fmt(c.asistenciaSinConfirmar.citas)}).
          </p>
        )}
      </div>
    </Seccion>
  );
}

function Recomendados({ r }: R) {
  const x = r.recomendados;
  const filas: FilaBarra[] = [
    { clave: "si", etiqueta: "Sí viene recomendado", n: x.si },
    { clave: "no", etiqueta: "No", n: x.no },
    { clave: "sin", etiqueta: "Sin responder", n: x.sinResponder },
  ];
  return (
    <Seccion
      encabezado="Recomendados y Plan Padrino"
      ayuda="Respuesta a la primera pregunta del asistente (desde el 21-nov-2026). Quien dice que sí queda como apadrinado hasta que Gestión Humana le asigna el padrino."
    >
      <BarrasConPorcentaje filas={filas} total={r.base} unidad="conversaciones" anchoEtiqueta={200} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra etiqueta="Candidatos apadrinados" valor={fmt(x.apadrinados)} nota="Recomendados que ya son candidatos" />
        <Cifra etiqueta="Sin padrino asignado" valor={fmt(x.sinPadrino)} nota={`${fmt(x.conPadrino)} ya tienen padrino`} />
        <Cifra etiqueta="Tiempo hasta asignarlo" valor={duracionLegible(x.tiempoHastaPadrino.mediana)} nota="Mediana, desde que lo dijo" />
        <Cifra
          etiqueta="Contratados: recomendados"
          valor={pctTxt(x.contratacion.recomendados.pct)}
          nota={`${fmt(x.contratacion.recomendados.contratados)} de ${fmt(x.contratacion.recomendados.n)}; el resto: ${pctTxt(x.contratacion.resto.pct) ?? "—"} (${fmt(x.contratacion.resto.contratados)} de ${fmt(x.contratacion.resto.n)})`}
        />
      </div>
    </Seccion>
  );
}

// ── Del chat (antes en los indicadores de Comunicaciones) ───────────────────

type C = { c: Indicadores };
const pctDe = (parte: number, total: number) => pctTxt(porcentaje(parte, total));

function Preseleccion({ c }: C) {
  const s = c.seleccion;
  const causas: FilaBarra[] = s.causas.map((x) => ({ ...x, tono: x.clave === "__otros__" ? "neutro" : "alerta" }));
  const semaforo = [
    { color: "bg-emerald-500", etiqueta: "Pasa", n: s.semaforo.pasa },
    { color: "bg-red-500", etiqueta: "No cumple", n: s.semaforo.no_cumple },
    { color: "bg-amber-400", etiqueta: "Incompleto", n: s.semaforo.incompleto },
    { color: "bg-slate-300", etiqueta: "Sin evaluar", n: s.semaforo.sin_evaluar },
  ];
  return (
    <Seccion encabezado="Preselección del asistente" ayuda="Semáforo de los procesos que el asistente creó desde el chat en el periodo.">
      {s.procesos === 0 ? (
        <p className="text-sm text-text-tertiary">— Ningún proceso se creó desde el chat en este periodo.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {semaforo.map((x) => (
            <div key={x.etiqueta} className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC] p-4">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#64748B]">
                <span className={`h-2.5 w-2.5 rounded-full ${x.color}`} aria-hidden /> {x.etiqueta}
              </p>
              <p className="mt-1.5 text-[24px] font-bold leading-none text-[#0F172A]">{fmt(x.n)}</p>
              <p className="mt-1.5 text-[11px] text-[#64748B]">{pctDe(x.n, s.procesos)} de los procesos</p>
            </div>
          ))}
        </div>
      )}
      {causas.length > 0 && (
        <div>
          <Subtitulo>Por qué no cumple</Subtitulo>
          <BarrasConPorcentaje filas={causas} total={s.semaforo.no_cumple} unidad="procesos" anchoEtiqueta={240} />
        </div>
      )}
    </Seccion>
  );
}

function Asistente({ c }: C) {
  const a = c.asistente;
  const hay = a.ejecuciones > 0;
  const errores: FilaBarra[] = a.errores.map((e) => ({ ...e, tono: e.clave === "__otros__" ? "neutro" : "alerta" }));
  const modelos: FilaBarra[] = a.modelos.map((m) => ({ ...m, tono: m.clave === "__otros__" ? "neutro" : "normal" }));
  return (
    <Seccion encabezado="Asistente de IA" ayuda="Cada vez que el asistente leyó un mensaje y decidió qué hacer, en las conversaciones del periodo.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra etiqueta="Ejecuciones" valor={fmt(a.ejecuciones)} nota={hay ? undefined : "El asistente no actuó en este periodo"} />
        <Cifra etiqueta="Respondió" valor={hay ? pctDe(a.respondido, a.ejecuciones) : null} nota={hay ? `${fmt(a.respondido)} veces` : undefined} />
        <Cifra etiqueta="Pasó a una persona" valor={hay ? pctDe(a.transferido, a.ejecuciones) : null} nota={hay ? `${fmt(a.transferido)} veces` : undefined} />
        <Cifra etiqueta="Error" valor={hay ? pctDe(a.error, a.ejecuciones) : null} nota={hay ? `${fmt(a.error)} veces` : undefined} />
        <Cifra
          etiqueta="Tiempo de respuesta del modelo"
          valor={a.duracion.n ? formatoDuracion(a.duracion.mediana) : null}
          nota={a.duracion.n ? `Mediana · p90: ${formatoDuracion(a.duracion.p90)}` : "Sin datos"}
        />
        <Cifra etiqueta="Tokens leídos" valor={hay ? fmt(a.tokensEntrada) : null} nota={hay ? "Lo que el modelo leyó; con esto cobra el proveedor" : undefined} />
        <Cifra etiqueta="Tokens escritos" valor={hay ? fmt(a.tokensSalida) : null} nota={hay ? "Lo que el modelo escribió en las respuestas" : undefined} />
      </div>
      {a.error > 0 && (
        <div>
          <Subtitulo>Errores más frecuentes</Subtitulo>
          <BarrasConPorcentaje filas={errores} total={a.error} unidad="errores" anchoEtiqueta={220} />
        </div>
      )}
      {hay && (
        <div>
          <Subtitulo>Modelos usados</Subtitulo>
          <BarrasConPorcentaje filas={modelos} total={modelos.reduce((s, m) => s + m.n, 0)} unidad="ejecuciones" anchoEtiqueta={220} />
        </div>
      )}
    </Seccion>
  );
}

function Cierres({ ind }: P) {
  const filas: FilaBarra[] = ind.causasCierre.map((c) => ({ ...c, tono: "alerta" }));
  return (
    <Seccion encabezado="Por qué se cerraron" ayuda="Causa registrada al cerrar el proceso.">
      {filas.length === 0 ? (
        <p className="text-sm text-text-tertiary">— Ningún proceso del periodo se ha cerrado.</p>
      ) : (
        <BarrasConPorcentaje filas={filas} total={ind.cerrados} unidad="procesos" anchoEtiqueta={260} />
      )}
    </Seccion>
  );
}

function SemanaYCanal({ ind }: P) {
  const canal: FilaBarra[] = ind.porCanal.map((c) => ({
    clave: c.clave,
    etiqueta: c.etiqueta,
    n: c.n,
    tono: c.clave === "sin_dato" ? "neutro" : "normal",
    detalle: `${fmt(c.contratados)} contratados (${pctTxt(c.n ? (c.contratados / c.n) * 100 : null) ?? "—"})`,
  }));
  return (
    <Seccion encabezado="Por semana y por canal">
      <div>
        <Subtitulo>Aspirantes nuevos por semana</Subtitulo>
        <BarrasPorDia datos={ind.porSemana} clave="aspirantes" unidad="aspirantes nuevos" />
      </div>
      <div>
        <Subtitulo>Contratados por semana</Subtitulo>
        <BarrasPorDia datos={ind.porSemana} clave="contratados" unidad="contratados" alto={160} />
      </div>
      <div>
        <Subtitulo>Por dónde llegaron</Subtitulo>
        <BarrasConPorcentaje filas={canal} total={ind.aspirantes} unidad="aspirantes" anchoEtiqueta={160} />
      </div>
    </Seccion>
  );
}

/** Mensajes de WhatsApp del periodo (24-nov-2026; también van en el reporte diario por correo). */
function Mensajes({ c, ind }: { c: Indicadores; ind: IndicadoresSeleccion }) {
  const v = c.volumen;
  const por: FilaBarra[] = [
    { clave: "asistente", etiqueta: "Asistente de IA", n: v.enviadosPor.asistente },
    { clave: "gh", etiqueta: "Gestión Humana", n: v.enviadosPor.gestionHumana },
    { clave: "plantilla", etiqueta: "Plantillas", n: v.enviadosPor.plantilla },
    { clave: "auto", etiqueta: "Automáticos (recordatorios, citas)", n: v.enviadosPor.automatico },
  ];
  return (
    <Seccion encabezado="Mensajes de WhatsApp" ayuda="Conversaciones y mensajes del periodo, y cuántos aspirantes quedaron como candidatos.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra etiqueta="Conversaciones nuevas" valor={fmt(v.conversacionesNuevas)} />
        <Cifra etiqueta="Mensajes recibidos" valor={fmt(v.recibidos)} />
        <Cifra etiqueta="Mensajes enviados" valor={fmt(v.enviados)} />
        <Cifra etiqueta="Candidatos" valor={fmt(ind.aspirantes)} nota="Procesos creados en el periodo" />
      </div>
      <div>
        <Subtitulo>Enviados por</Subtitulo>
        <BarrasConPorcentaje filas={por} total={v.enviados} unidad="mensajes" anchoEtiqueta={240} />
      </div>
    </Seccion>
  );
}

function Antecedentes({ ind }: P) {
  const filas: FilaBarra[] = ind.antecedentesFilas.map((f) => ({ ...f, tono: f.clave === "manual" ? "neutro" : "normal" }));
  const asistencia: FilaBarra[] = ind.asistenciaPorTipo;
  return (
    <Seccion encabezado="Antecedentes y citas" ayuda="Consultas de antecedentes del periodo, sin las simuladas del chat de prueba.">
      <BarrasConPorcentaje filas={filas} total={ind.clave.antecedentes.total} unidad="consultas" anchoEtiqueta={200} />
      {asistencia.length > 0 && (
        <div>
          <Subtitulo>Asistencia por tipo de cita (citas ya pasadas)</Subtitulo>
          <BarrasConPorcentaje filas={asistencia} unidad="asistieron" anchoEtiqueta={200} />
        </div>
      )}
    </Seccion>
  );
}

