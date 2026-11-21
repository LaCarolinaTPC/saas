import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { getCurrentPermissions, tienePermiso } from "@/lib/permissions";
import { leerIndicadoresComparados } from "@/lib/comunicaciones/indicadores-servidor";
import {
  OPCIONES_ATENDIO,
  OPCIONES_TIPO,
  PERIODOS,
  diaBogota,
  etiquetaDia,
  formatoDuracion,
  leerFiltroAtendio,
  leerFiltroTipo,
  porcentaje,
  resolverPeriodo,
  variacion,
  type FiltroAtendio,
  type FiltroTipo,
  type Indicadores,
  type Rango,
  type Sentido,
  type Tiempos,
  type Variacion,
} from "@/lib/comunicaciones/indicadores";
import { BarrasConPorcentaje, BarrasPorDia, type FilaBarra } from "@/components/graficos/graficos-comunicaciones";

const RUTA = "/comunicaciones/indicadores";

const fmt = (n: number) => n.toLocaleString("es-CO");

type Parametro = string | string[] | undefined;
const primero = (v: Parametro) => (Array.isArray(v) ? v[0] : v);

/**
 * Indicadores de Comunicaciones: cómo se está atendiendo el WhatsApp
 * (volumen, quién responde, pases a una persona, tiempos, el asistente de IA,
 * la selección de conductores y la reactivación).
 *
 * Filtros en la URL (formulario GET): `dias` 7, 30 o 90; `desde` y `hasta`
 * (AAAA-MM-DD, mandan sobre `dias`); `atendio`; `tipo`; `comparar=1` para ver
 * el periodo anterior del mismo largo.
 */
export default async function IndicadoresComunicacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, Parametro>>;
}) {
  const perms = await getCurrentPermissions();
  if (!tienePermiso(perms, "comunicaciones.ver")) redirect("/");

  const sp = await searchParams;
  const periodo = resolverPeriodo({ dias: primero(sp.dias), desde: primero(sp.desde), hasta: primero(sp.hasta) });
  const atendio = leerFiltroAtendio(primero(sp.atendio));
  const tipo = leerFiltroTipo(primero(sp.tipo));
  const comparar = primero(sp.comparar) === "1";

  const { actual: ind, anterior: ant } = await leerIndicadoresComparados({
    rango: periodo.rango,
    filtros: { atendio, tipo },
    comparar,
  });
  const c = comparador(ind, ant);

  const hayFiltros = periodo.dias !== 30 || atendio !== "todas" || tipo !== "todas" || comparar;
  const resumenFiltros = [
    rangoCorto(ind.rango),
    atendio !== "todas" ? etiquetaDe(OPCIONES_ATENDIO, atendio) : null,
    tipo !== "todas" ? etiquetaDe(OPCIONES_TIPO, tipo) : null,
    ant ? `comparado con ${rangoCorto(ant.rango)}` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 pb-20 sm:p-6 md:pb-6 lg:p-8">
      <Link
        href="/comunicaciones"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a la bandeja
      </Link>

      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">Indicadores de comunicaciones</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Cómo se está atendiendo el WhatsApp: del {fechaLarga(ind.rango.desde)} al {fechaLarga(ind.rango.hasta)} (
            {ind.rango.dias} {ind.rango.dias === 1 ? "día" : "días"}).
          </p>
        </div>
      </div>

      <FilaFiltros dias={periodo.dias} rango={periodo.rango} atendio={atendio} tipo={tipo} comparar={comparar} />

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
        <span>
          <span className="text-text-tertiary">Mostrando:</span> {resumenFiltros.join(" · ")}
        </span>
        {hayFiltros && (
          <Link href={RUTA} className="font-medium text-primary hover:underline">
            Quitar filtros
          </Link>
        )}
      </div>

      {periodo.aviso && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">{periodo.aviso}</p>
      )}
      {tipo !== "todas" && (
        <p className="mb-4 text-xs text-text-tertiary">
          El tipo depende de que el asistente haya leído los datos de la conversación: en las conversaciones viejas casi todas
          salen como aspirantes.
        </p>
      )}
      {ind.faltantes.length > 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          Algunos datos aún no están disponibles en esta instalación ({ind.faltantes.join(", ")}). Se muestra el resto.
        </p>
      )}

      <div className="space-y-6">
        <Resumen ind={ind} c={c} />
        <Volumen ind={ind} c={c} />
        <Atencion ind={ind} />
        <Pases ind={ind} c={c} />
        <PrimeraRespuesta ind={ind} c={c} />
        <Asistente ind={ind} c={c} />
        <Seleccion ind={ind} c={c} />
        <Reactivacion ind={ind} c={c} />
      </div>
    </div>
  );
}

// ── Filtros ──────────────────────────────────────────────────────────────────

const etiquetaDe = <T extends string>(opciones: { valor: T; etiqueta: string }[], valor: T) =>
  opciones.find((o) => o.valor === valor)?.etiqueta ?? valor;

/** «16 oct – 14 nov»; con el año si el rango cruza de año. */
function rangoCorto(r: Rango): string {
  if (r.desde === r.hasta) return etiquetaDia(r.desde);
  const otroAno = r.desde.slice(0, 4) !== r.hasta.slice(0, 4);
  const conAno = (d: string) => (otroAno ? `${etiquetaDia(d)} ${d.slice(0, 4)}` : etiquetaDia(d));
  return `${conAno(r.desde)} – ${conAno(r.hasta)}`;
}

/** Enlace a la página con estos filtros, sin los que están en su valor por defecto. */
function enlace(p: { dias: number; atendio: FiltroAtendio; tipo: FiltroTipo; comparar: boolean }): string {
  const q = new URLSearchParams();
  if (p.dias !== 30) q.set("dias", String(p.dias));
  if (p.atendio !== "todas") q.set("atendio", p.atendio);
  if (p.tipo !== "todas") q.set("tipo", p.tipo);
  if (p.comparar) q.set("comparar", "1");
  const s = q.toString();
  return s ? `${RUTA}?${s}` : RUTA;
}

const CAMPO =
  "h-8 rounded-md border border-border bg-white px-2 text-xs text-text-primary outline-none focus:border-primary";
const ETIQUETA = "mb-1 block text-[11px] font-medium text-text-tertiary";

/**
 * Una sola fila de filtros, con un formulario GET normal (todo queda en la
 * URL). Los botones de 7, 30 y 90 días son enlaces que conservan los demás
 * filtros; las fechas, los dos filtros y «comparar» se aplican con el botón.
 * En pantallas angostas los grupos bajan de línea.
 */
function FilaFiltros({
  dias,
  rango,
  atendio,
  tipo,
  comparar,
}: {
  dias: number | null;
  rango: Rango;
  atendio: FiltroAtendio;
  tipo: FiltroTipo;
  comparar: boolean;
}) {
  const conRango = dias == null;
  const hoy = diaBogota(new Date());
  return (
    <form
      method="get"
      action={RUTA}
      className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl border border-border bg-white p-3"
    >
      {/* Si se dejan las fechas en blanco, se usa el periodo de los botones. */}
      {dias != null && dias !== 30 && <input type="hidden" name="dias" value={dias} />}
      <fieldset className="min-w-0">
        <legend className={ETIQUETA}>Periodo</legend>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex rounded-lg border border-border bg-white p-0.5 text-xs" aria-label="Periodo">
            {PERIODOS.map((p) => (
              <Link
                key={p}
                href={enlace({ dias: p, atendio, tipo, comparar })}
                aria-current={p === dias ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 ${
                  p === dias ? "bg-primary font-medium text-white" : "text-text-secondary hover:bg-slate-50"
                }`}
              >
                {p} días
              </Link>
            ))}
          </nav>
          <div
            className={`flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs text-text-secondary ${
              conRango ? "border-primary bg-primary/5" : "border-border"
            }`}
          >
            <span>Del</span>
            <input
              type="date"
              name="desde"
              aria-label="Desde"
              defaultValue={conRango ? rango.desde : undefined}
              max={hoy}
              className={`${CAMPO} h-7`}
            />
            <span>al</span>
            <input
              type="date"
              name="hasta"
              aria-label="Hasta (incluido)"
              defaultValue={conRango ? rango.hasta : undefined}
              max={hoy}
              className={`${CAMPO} h-7`}
            />
          </div>
        </div>
      </fieldset>

      <div className="min-w-0 max-w-full">
        <label htmlFor="filtro-atendio" className={ETIQUETA}>
          Quién atendió
        </label>
        <select id="filtro-atendio" name="atendio" defaultValue={atendio} className={`${CAMPO} max-w-full`}>
          {OPCIONES_ATENDIO.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="min-w-0">
        <label htmlFor="filtro-tipo" className={ETIQUETA}>
          Tipo
        </label>
        <select id="filtro-tipo" name="tipo" defaultValue={tipo} className={CAMPO}>
          {OPCIONES_TIPO.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <label className="flex h-8 cursor-pointer items-center gap-2 text-xs text-text-secondary">
        <input type="checkbox" name="comparar" value="1" defaultChecked={comparar} className="h-4 w-4 rounded border-border" />
        Comparar con el periodo anterior
      </label>

      <button type="submit" className="h-8 rounded-lg bg-primary px-4 text-xs font-medium text-white hover:bg-primary/90">
        Aplicar
      </button>
    </form>
  );
}

// ── Comparación ──────────────────────────────────────────────────────────────

interface Comparacion {
  /** Valor del periodo anterior ya con formato; null sin dato. */
  valor: string | null;
  variacion: Variacion | null;
}

type Formato = "cantidad" | "decimal" | "porcentaje" | "duracion";

const FORMATOS: Record<Formato, (n: number) => string> = {
  cantidad: fmt,
  decimal: (n) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 }),
  porcentaje: (n) => `${Math.round(n)}%`,
  duracion: (n) => formatoDuracion(n),
};

type Comparador = (
  medir: (i: Indicadores) => number | null,
  formato: Formato,
  sentido?: Sentido
) => Comparacion | undefined;

/** Arma la comparación de una cifra con el periodo anterior; sin él, nada. */
function comparador(ind: Indicadores, ant: Indicadores | null): Comparador {
  return (medir, formato, sentido = "neutro") => {
    if (!ant) return undefined;
    const antes = medir(ant);
    return {
      valor: antes == null ? null : FORMATOS[formato](antes),
      variacion: variacion(medir(ind), antes, { tipo: formato === "porcentaje" ? "puntos" : "cantidad", sentido }),
    };
  };
}

const TONO_VARIACION: Record<Variacion["tono"], string> = {
  mejor: "text-emerald-700",
  peor: "text-orange-700",
  neutro: "text-slate-500",
};
const LECTURA_TONO: Record<Variacion["tono"], string> = { mejor: " (mejora)", peor: " (empeora)", neutro: "" };

/** «antes 1.420 · ▲ +15 %», con color y flecha según si mejora o empeora. */
function Antes({ c }: { c: Comparacion }) {
  const v = c.variacion;
  return (
    <p className="mt-1.5 text-[11px] leading-snug text-[#64748B]">
      antes {c.valor ?? "—"}
      {v && (
        <>
          {" · "}
          <span className={`font-medium ${TONO_VARIACION[v.tono]}`}>
            {v.flecha && <span aria-hidden>{v.flecha} </span>}
            {v.texto}
            <span className="sr-only">{LECTURA_TONO[v.tono]}</span>
          </span>
        </>
      )}
    </p>
  );
}

/** Porcentaje sin redondear (para comparar en puntos); null sin base. */
const pctNum = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : null);
/** Mediana de unos tiempos, o null sin casos. */
const mediana = (t: Tiempos) => (t.n ? t.mediana : null);

// ── Piezas ───────────────────────────────────────────────────────────────────

function fechaLarga(dia: string): string {
  return new Date(`${dia}T12:00:00-05:00`).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

/**
 * Número grande con su nota. Sin dato (null) muestra «—» y la nota explica
 * por qué. Con `antes`, debajo va el valor del periodo anterior y el cambio.
 */
function Cifra({
  etiqueta,
  valor,
  nota,
  antes,
}: {
  etiqueta: string;
  valor: string | null;
  nota?: string;
  antes?: Comparacion;
}) {
  return (
    <div className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC] p-4">
      <p className="text-[12px] font-medium text-[#64748B]">{etiqueta}</p>
      <p className="mt-1.5 text-[24px] font-bold leading-none text-[#0F172A]">{valor ?? "—"}</p>
      {nota && <p className="mt-1.5 text-[11px] leading-snug text-[#64748B]">{nota}</p>}
      {antes && <Antes c={antes} />}
    </div>
  );
}

function Rejilla({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-medium text-text-secondary">{children}</h3>;
}

/** Cantidad o «—» si no hay base sobre la cual contar. */
const cantidad = (n: number, hayBase: boolean) => (hayBase ? fmt(n) : null);
const pct = (parte: number, total: number) => {
  const p = porcentaje(parte, total);
  return p == null ? null : `${p}%`;
};

function notaTiempos(t: Tiempos): string {
  return t.n ? `p90: ${formatoDuracion(t.p90)} · ${fmt(t.n)} casos` : "Sin casos en este periodo";
}

// ── Secciones ────────────────────────────────────────────────────────────────

type PropsSeccion = { ind: Indicadores; c: Comparador };

function Resumen({ ind, c }: PropsSeccion) {
  const { atencion, primeraRespuesta } = ind;
  // «Esperando ahora» es la situación de hoy: no tiene periodo anterior.
  const comparando = c((i) => i.esperandoAhora, "cantidad") !== undefined;
  return (
    <Rejilla>
      <Cifra
        etiqueta="Conversaciones nuevas"
        valor={cantidad(ind.volumen.conversacionesNuevas, ind.volumen.conversacionesNuevas > 0)}
        nota={ind.volumen.conversacionesNuevas ? `En ${ind.rango.dias} días` : "Sin conversaciones en este periodo"}
        antes={c((i) => i.volumen.conversacionesNuevas, "cantidad")}
      />
      <Cifra
        etiqueta="Atendidas solo por el asistente"
        valor={atencion.pctSoloAsistente == null ? null : `${Math.round(atencion.pctSoloAsistente)}%`}
        nota={atencion.base ? `${fmt(atencion.soloAsistente)} de ${fmt(atencion.base)}, sin mensajes de una persona` : "Sin conversaciones en este periodo"}
        antes={c((i) => i.atencion.pctSoloAsistente, "porcentaje", "mas_es_mejor")}
      />
      <Cifra
        etiqueta="Esperando a una persona ahora"
        valor={fmt(ind.esperandoAhora)}
        nota={`Pasadas a una persona y con el último mensaje del aspirante sin responder${
          comparando ? ". Es la situación de hoy: no se compara" : ""
        }`}
      />
      <Cifra
        etiqueta="Primera respuesta (mediana)"
        valor={primeraRespuesta.general.n ? formatoDuracion(primeraRespuesta.general.mediana) : null}
        nota={primeraRespuesta.general.n ? "Del primer mensaje del aspirante a la primera respuesta" : "Sin respuestas en este periodo"}
        antes={c((i) => mediana(i.primeraRespuesta.general), "duracion", "menos_es_mejor")}
      />
    </Rejilla>
  );
}

function Volumen({ ind, c }: PropsSeccion) {
  const v = ind.volumen;
  const hay = v.conversacionesNuevas > 0;
  const filas: FilaBarra[] = [
    { clave: "asistente", etiqueta: "Asistente de IA", n: v.enviadosPor.asistente },
    { clave: "gh", etiqueta: "Gestión Humana", n: v.enviadosPor.gestionHumana },
    { clave: "plantilla", etiqueta: "Plantilla", n: v.enviadosPor.plantilla },
    {
      clave: "automatico",
      etiqueta: "Aviso automático",
      n: v.enviadosPor.automatico,
      tono: "neutro",
      detalle: "Recordatorios de seguimiento y avisos de selección",
    },
  ];
  return (
    <Seccion encabezado="Volumen" ayuda="Conversaciones que empezaron en el periodo y sus mensajes.">
      <Rejilla>
        <Cifra
          etiqueta="Conversaciones nuevas"
          valor={cantidad(v.conversacionesNuevas, hay)}
          nota={hay ? undefined : "Sin conversaciones en este periodo"}
          antes={c((i) => i.volumen.conversacionesNuevas, "cantidad")}
        />
        <Cifra
          etiqueta="Promedio por día"
          valor={hay ? (v.conversacionesNuevas / ind.rango.dias).toLocaleString("es-CO", { maximumFractionDigits: 1 }) : null}
          antes={c((i) => i.volumen.conversacionesNuevas / i.rango.dias, "decimal")}
        />
        <Cifra
          etiqueta="Mensajes recibidos"
          valor={cantidad(v.recibidos, hay)}
          nota={hay ? "Escritos por los aspirantes" : undefined}
          antes={c((i) => i.volumen.recibidos, "cantidad")}
        />
        <Cifra
          etiqueta="Mensajes enviados"
          valor={cantidad(v.enviados, hay)}
          nota={hay ? "Por el asistente, el equipo o el sistema" : undefined}
          antes={c((i) => i.volumen.enviados, "cantidad")}
        />
      </Rejilla>
      <div>
        <Subtitulo>Conversaciones nuevas por día</Subtitulo>
        <BarrasPorDia datos={v.porDia} />
      </div>
      <div>
        <Subtitulo>Mensajes enviados, por quién</Subtitulo>
        <BarrasConPorcentaje filas={filas} total={v.enviados} unidad="mensajes" />
      </div>
    </Seccion>
  );
}

function Atencion({ ind }: { ind: Indicadores }) {
  const a = ind.atencion;
  const filas: FilaBarra[] = [
    { clave: "solo_ia", etiqueta: "Solo el asistente", n: a.soloAsistente },
    { clave: "ia_persona", etiqueta: "Asistente y una persona", n: a.asistenteYPersona },
    { clave: "persona", etiqueta: "Solo una persona", n: a.soloPersona },
    { clave: "nadie", etiqueta: "Sin respuesta", n: a.sinRespuesta, tono: "alerta" },
  ];
  return (
    <Seccion
      encabezado="Quién atiende"
      ayuda={`Conversaciones en las que el aspirante escribió (${fmt(a.base)}). Los avisos automáticos no cuentan como atención.`}
    >
      <BarrasConPorcentaje filas={filas} total={a.base} anchoEtiqueta={160} />
    </Seccion>
  );
}

function Pases({ ind, c }: PropsSeccion) {
  const p = ind.pases;
  const hay = p.total > 0;
  const filas: FilaBarra[] = [
    { clave: "solicitud", etiqueta: "Lo pidió el aspirante", n: p.porMotivo.solicitud },
    { clave: "agente", etiqueta: "Lo decidió el asistente", n: p.porMotivo.agente },
    { clave: "manual", etiqueta: "Lo pausó una persona", n: p.porMotivo.manual },
  ];
  if (p.porMotivo.falla > 0) {
    filas.push({ clave: "falla", etiqueta: "Falló el asistente", n: p.porMotivo.falla, tono: "alerta" });
  }
  return (
    <Seccion encabezado="Pases a una persona" ayuda="Conversaciones del periodo que el asistente dejó en manos de Gestión Humana.">
      <Rejilla>
        <Cifra
          etiqueta="Pases"
          valor={fmt(p.total)}
          nota={hay ? `${pct(p.total, ind.atencion.base) ?? "—"} de las conversaciones` : "Ningún pase en este periodo"}
          antes={c((i) => i.pases.total, "cantidad")}
        />
        <Cifra
          etiqueta="Respondidos por Gestión Humana"
          valor={cantidad(p.respondidos, hay)}
          nota={hay ? `${pct(p.respondidos, p.total)} de los pases` : undefined}
          antes={c((i) => i.pases.respondidos, "cantidad", "mas_es_mejor")}
        />
        <Cifra
          etiqueta="Sin respuesta de una persona"
          valor={cantidad(p.sinRespuesta, hay)}
          nota={hay ? "Aspirantes que nadie del equipo contestó (incluye los que esperan ahora)" : undefined}
          antes={c((i) => i.pases.sinRespuesta, "cantidad", "menos_es_mejor")}
        />
        <Cifra
          etiqueta="Tiempo hasta que respondió una persona"
          valor={p.tiempoHastaPersona.n ? formatoDuracion(p.tiempoHastaPersona.mediana) : null}
          nota={p.tiempoHastaPersona.n ? `Mediana · ${notaTiempos(p.tiempoHastaPersona)}` : "Sin respuestas después de un pase"}
          antes={c((i) => mediana(i.pases.tiempoHastaPersona), "duracion", "menos_es_mejor")}
        />
      </Rejilla>
      {hay && (
        <div>
          <Subtitulo>Por qué pasó a una persona</Subtitulo>
          <BarrasConPorcentaje filas={filas} total={p.total} anchoEtiqueta={170} />
        </div>
      )}
    </Seccion>
  );
}

function PrimeraRespuesta({ ind, c }: PropsSeccion) {
  const r = ind.primeraRespuesta;
  return (
    <Seccion
      encabezado="Tiempo de primera respuesta"
      ayuda="Desde el primer mensaje del aspirante hasta la primera respuesta (del asistente, de una persona o una plantilla). La mediana es el caso típico; el p90, lo que tarda en los casos más lentos (9 de cada 10 se responden antes)."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cifra
          etiqueta="Todas (mediana)"
          valor={r.general.n ? formatoDuracion(r.general.mediana) : null}
          nota={notaTiempos(r.general)}
          antes={c((i) => mediana(i.primeraRespuesta.general), "duracion", "menos_es_mejor")}
        />
        <Cifra
          etiqueta="Respondió primero el asistente"
          valor={r.asistente.n ? formatoDuracion(r.asistente.mediana) : null}
          nota={notaTiempos(r.asistente)}
          antes={c((i) => mediana(i.primeraRespuesta.asistente), "duracion", "menos_es_mejor")}
        />
        <Cifra
          etiqueta="Respondió primero una persona"
          valor={r.persona.n ? formatoDuracion(r.persona.mediana) : null}
          nota={notaTiempos(r.persona)}
          antes={c((i) => mediana(i.primeraRespuesta.persona), "duracion", "menos_es_mejor")}
        />
      </div>
    </Seccion>
  );
}

function Asistente({ ind, c }: PropsSeccion) {
  const a = ind.asistente;
  const hay = a.ejecuciones > 0;
  const errores: FilaBarra[] = a.errores.map((e) => ({ ...e, tono: e.clave === "__otros__" ? "neutro" : "alerta" }));
  const modelos: FilaBarra[] = a.modelos.map((m) => ({ ...m, tono: m.clave === "__otros__" ? "neutro" : "normal" }));
  return (
    <Seccion encabezado="Asistente de IA" ayuda="Cada vez que el asistente leyó un mensaje y decidió qué hacer.">
      <Rejilla>
        <Cifra
          etiqueta="Ejecuciones"
          valor={fmt(a.ejecuciones)}
          nota={hay ? undefined : "El asistente no actuó en este periodo"}
          antes={c((i) => i.asistente.ejecuciones, "cantidad")}
        />
        <Cifra
          etiqueta="Respondió"
          valor={pct(a.respondido, a.ejecuciones)}
          nota={hay ? `${fmt(a.respondido)} veces` : undefined}
          antes={c((i) => pctNum(i.asistente.respondido, i.asistente.ejecuciones), "porcentaje", "mas_es_mejor")}
        />
        <Cifra
          etiqueta="Pasó a una persona"
          valor={pct(a.transferido, a.ejecuciones)}
          nota={hay ? `${fmt(a.transferido)} veces` : undefined}
          antes={c((i) => pctNum(i.asistente.transferido, i.asistente.ejecuciones), "porcentaje")}
        />
        <Cifra
          etiqueta="Error"
          valor={pct(a.error, a.ejecuciones)}
          nota={hay ? `${fmt(a.error)} veces` : undefined}
          antes={c((i) => pctNum(i.asistente.error, i.asistente.ejecuciones), "porcentaje", "menos_es_mejor")}
        />
        <Cifra
          etiqueta="Tiempo de respuesta del modelo"
          valor={a.duracion.n ? formatoDuracion(a.duracion.mediana) : null}
          nota={a.duracion.n ? `Mediana · p90: ${formatoDuracion(a.duracion.p90)}` : "Sin datos"}
          antes={c((i) => mediana(i.asistente.duracion), "duracion", "menos_es_mejor")}
        />
        <Cifra
          etiqueta="Tokens leídos"
          valor={hay ? fmt(a.tokensEntrada) : null}
          nota={hay ? "Lo que el modelo leyó; con esto cobra el proveedor" : undefined}
          antes={c((i) => i.asistente.tokensEntrada, "cantidad")}
        />
        <Cifra
          etiqueta="Tokens escritos"
          valor={hay ? fmt(a.tokensSalida) : null}
          nota={hay ? "Lo que el modelo escribió en las respuestas" : undefined}
          antes={c((i) => i.asistente.tokensSalida, "cantidad")}
        />
      </Rejilla>
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

function Seleccion({ ind, c }: PropsSeccion) {
  const s = ind.seleccion;
  const nuevas = s.embudo[0]?.n ?? 0;
  const embudo: FilaBarra[] = s.embudo.map((e) => ({ ...e }));
  const causas: FilaBarra[] = s.causas.map((x) => ({ ...x, tono: x.clave === "__otros__" ? "neutro" : "alerta" }));
  return (
    <Seccion
      encabezado="Selección de conductores"
      ayuda="De las conversaciones nuevas, cuántas avanzaron en cada paso. El porcentaje es sobre las conversaciones nuevas."
    >
      {!s.disponible ? (
        <p className="text-sm text-text-tertiary">
          — Los datos del aspirante aún no se guardan en esta instalación.
        </p>
      ) : (
        <BarrasConPorcentaje filas={embudo} total={nuevas} anchoEtiqueta={200} />
      )}
      <div>
        <Subtitulo>Procesos creados desde el chat · preselección</Subtitulo>
        {s.procesos === 0 ? (
          <p className="text-sm text-text-tertiary">— Ningún proceso se creó desde el chat en este periodo.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Semaforo
              color="bg-emerald-500"
              etiqueta="Pasa"
              n={s.semaforo.pasa}
              total={s.procesos}
              antes={c((i) => i.seleccion.semaforo.pasa, "cantidad", "mas_es_mejor")}
            />
            <Semaforo
              color="bg-red-500"
              etiqueta="No cumple"
              n={s.semaforo.no_cumple}
              total={s.procesos}
              antes={c((i) => i.seleccion.semaforo.no_cumple, "cantidad")}
            />
            <Semaforo
              color="bg-amber-400"
              etiqueta="Incompleto"
              n={s.semaforo.incompleto}
              total={s.procesos}
              antes={c((i) => i.seleccion.semaforo.incompleto, "cantidad", "menos_es_mejor")}
            />
            <Semaforo
              color="bg-slate-300"
              etiqueta="Sin evaluar"
              n={s.semaforo.sin_evaluar}
              total={s.procesos}
              antes={c((i) => i.seleccion.semaforo.sin_evaluar, "cantidad")}
            />
          </div>
        )}
      </div>
      {s.causas.length > 0 && (
        <div>
          <Subtitulo>Por qué no cumple</Subtitulo>
          <BarrasConPorcentaje filas={causas} total={s.semaforo.no_cumple} unidad="procesos" anchoEtiqueta={240} />
        </div>
      )}
    </Seccion>
  );
}

function Semaforo({
  color,
  etiqueta,
  n,
  total,
  antes,
}: {
  color: string;
  etiqueta: string;
  n: number;
  total: number;
  antes?: Comparacion;
}) {
  return (
    <div className="rounded-xl border border-[#F1F5F9] bg-[#F8FAFC] p-4">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#64748B]">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} aria-hidden /> {etiqueta}
      </p>
      <p className="mt-1.5 text-[24px] font-bold leading-none text-[#0F172A]">{fmt(n)}</p>
      <p className="mt-1.5 text-[11px] text-[#64748B]">{pct(n, total)} de los procesos</p>
      {antes && <Antes c={antes} />}
    </div>
  );
}

function Reactivacion({ ind, c }: PropsSeccion) {
  const r = ind.reactivacion;
  const hay = r.avisados > 0;
  return (
    <Seccion encabezado="Reactivación" ayuda="Avisos a quienes dejaron de responder a mitad de la selección.">
      {!r.disponible ? (
        <p className="text-sm text-text-tertiary">— La reactivación aún no está disponible en esta instalación.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra
            etiqueta="Aspirantes avisados"
            valor={cantidad(r.avisados, hay)}
            nota={hay ? undefined : "No se enviaron avisos en este periodo"}
            antes={c((i) => i.reactivacion.avisados, "cantidad")}
          />
          <Cifra
            etiqueta="Volvieron a escribir"
            valor={cantidad(r.volvieron, hay)}
            nota={hay ? `${pct(r.volvieron, r.avisados)} de los avisados, después del último aviso` : undefined}
            antes={c((i) => i.reactivacion.volvieron, "cantidad", "mas_es_mejor")}
          />
        </div>
      )}
    </Seccion>
  );
}
