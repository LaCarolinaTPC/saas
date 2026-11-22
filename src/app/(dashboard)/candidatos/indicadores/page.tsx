import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { PERIODOS, diaBogota, formatoDuracion, porcentaje, resolverPeriodo, type Indicadores, type Rango } from "@/lib/comunicaciones/indicadores";
import { leerIndicadoresComparados } from "@/lib/comunicaciones/indicadores-servidor";
import { leerIndicadoresRespuesta, leerIndicadoresSeleccion } from "@/lib/seleccion/indicadores-servidor";
import { duracionLegible, type IndicadoresSeleccion } from "@/lib/seleccion/indicadores";
import type { IndicadoresRespuesta } from "@/lib/seleccion/indicadores-respuesta";
import type { GastoDelMes } from "@/lib/seleccion/consumos-servidor";
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
  const [{ ind, gasto }, resp, chat] = await Promise.all([
    leerIndicadoresSeleccion(periodo.rango),
    leerIndicadoresRespuesta(periodo.rango),
    // Asistente de IA y preselección: se calculan con las conversaciones del periodo.
    leerIndicadoresComparados({ rango: periodo.rango }).then((r) => r.actual).catch(() => null),
  ]);

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

      <PestanasIndicadores actual="seleccion" periodo={periodoDeLaUrl(sp)} />

      <Filtros dias={periodo.dias} rango={periodo.rango} />

      {periodo.aviso && <Aviso>{periodo.aviso}</Aviso>}
      {ind.faltantes.length > 0 && (
        <Aviso>Algunos datos aún no están disponibles en esta instalación ({ind.faltantes.join(", ")}). Se muestra el resto.</Aviso>
      )}

      <div className="space-y-6">
        <CincoIndicadores ind={ind} />
        <Embudo ind={ind} />
        {chat && <Preseleccion c={chat} />}
        {resp && <Respuesta r={resp} />}
        {resp && <Recordatorios r={resp} />}
        {resp && <Recomendados r={resp} />}
        <Tiempos ind={ind} />
        <Cierres ind={ind} />
        <SemanaYCanal ind={ind} />
        <Antecedentes ind={ind} />
        {chat && <Asistente c={chat} />}
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
