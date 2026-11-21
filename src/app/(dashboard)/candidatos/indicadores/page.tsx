import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { PERIODOS, diaBogota, resolverPeriodo, type Rango } from "@/lib/comunicaciones/indicadores";
import { leerIndicadoresSeleccion } from "@/lib/seleccion/indicadores-servidor";
import { duracionLegible, type IndicadoresSeleccion } from "@/lib/seleccion/indicadores";
import type { GastoDelMes } from "@/lib/seleccion/consumos-servidor";
import { BarrasConPorcentaje, BarrasPorDia, type FilaBarra } from "@/components/graficos/graficos-comunicaciones";

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
 * cierre, por semana y por canal, y el costo frente al tope del mes.
 * Periodo en la URL, como en los de Comunicaciones: `dias` o `desde`/`hasta`.
 */
export default async function IndicadoresSeleccionPage({ searchParams }: { searchParams: Promise<Record<string, Parametro>> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) redirect("/");

  const sp = await searchParams;
  const periodo = resolverPeriodo({ dias: primero(sp.dias), desde: primero(sp.desde), hasta: primero(sp.hasta) });
  const { ind, gasto } = await leerIndicadoresSeleccion(periodo.rango);

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
            Aspirantes cuyo proceso empezó del {fechaLarga(ind.rango.desde)} al {fechaLarga(ind.rango.hasta)} ({ind.rango.dias}{" "}
            {ind.rango.dias === 1 ? "día" : "días"}). Sin los del chat de prueba.
          </p>
        </div>
      </div>

      <Filtros dias={periodo.dias} rango={periodo.rango} />

      {periodo.aviso && <Aviso>{periodo.aviso}</Aviso>}
      {ind.faltantes.length > 0 && (
        <Aviso>Algunos datos aún no están disponibles en esta instalación ({ind.faltantes.join(", ")}). Se muestra el resto.</Aviso>
      )}

      <div className="space-y-6">
        <CincoIndicadores ind={ind} />
        <Embudo ind={ind} />
        <Tiempos ind={ind} />
        <Cierres ind={ind} />
        <SemanaYCanal ind={ind} />
        <Antecedentes ind={ind} />
        <Costo ind={ind} gasto={gasto} />
      </div>
    </div>
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

function Filtros({ dias, rango }: { dias: number | null; rango: Rango }) {
  const conRango = dias == null;
  const hoy = diaBogota(new Date());
  return (
    <form method="get" action={RUTA} className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl border border-border bg-white p-3">
      <nav className="flex rounded-lg border border-border bg-white p-0.5 text-xs" aria-label="Periodo">
        {PERIODOS.map((p) => (
          <Link
            key={p}
            href={p === 30 ? RUTA : `${RUTA}?dias=${p}`}
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
    detalle: `${fmt(c.contratados)} contratados`,
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

function Costo({ ind, gasto }: P & { gasto: GastoDelMes | null }) {
  const c = ind.clave.costo;
  const filas: FilaBarra[] = ind.costoPorConcepto;
  return (
    <Seccion
      encabezado="Costo"
      ayuda="Lo que cobran los proveedores del modelo y las consultas reales a Croma (por su valor en Tiempos y reglas), pasado a pesos con la TRM configurada."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra etiqueta="Gasto del periodo" valor={pesos(c.totalCop)} nota={`USD ${c.totalUsd.toLocaleString("es-CO", { maximumFractionDigits: 2 })}`} />
        <Cifra etiqueta="Por aspirante" valor={pesos(c.porAspiranteCop)} />
        <Cifra etiqueta="Por contratado" valor={pesos(c.porContratadoCop)} nota={c.porContratadoCop == null ? "Nadie se contrató en el periodo" : undefined} />
        <Cifra
          etiqueta="Gasto del mes frente al tope"
          valor={gasto ? (gasto.topeCop > 0 ? `${Math.round(gasto.porcentaje)}%` : pesos(gasto.gastoCop)) : null}
          nota={gasto ? (gasto.topeCop > 0 ? `${pesos(gasto.gastoCop)} de ${pesos(gasto.topeCop)}` : "Sin tope configurado") : "Falta la migración de la entrega 3"}
        />
      </div>
      <p className="text-xs text-text-tertiary">
        {fmt(c.consultasCroma)} consultas reales a Croma en el periodo.
        {c.consultasCroma > 0 && !filas.some((f) => f.clave === "antecedentes") && " Su valor está en 0 en Tiempos y reglas: no suman al costo."}
      </p>
      {filas.length > 0 && (
        <div>
          <Subtitulo>Por concepto (pesos)</Subtitulo>
          <BarrasConPorcentaje filas={filas} total={c.totalCop} unidad="pesos" anchoEtiqueta={200} />
        </div>
      )}
    </Seccion>
  );
}
