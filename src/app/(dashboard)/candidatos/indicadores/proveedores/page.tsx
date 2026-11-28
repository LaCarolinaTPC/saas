import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Server } from "lucide-react";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { PERIODOS, resolverPeriodo, sumarDias } from "@/lib/comunicaciones/indicadores";
import { leerEstadisticasProveedores } from "@/lib/servicios/estadisticas-servidor";
import { duracionLegible, tiempoLegible, type FilaProveedor } from "@/lib/servicios/estadisticas";
import { PestanasIndicadores, periodoDeLaUrl } from "../pestanas-indicadores";
import { HerramientasIndicadores } from "@/components/indicadores/herramientas-indicadores";

const RUTA = "/candidatos/indicadores/proveedores";

type Parametro = string | string[] | undefined;
const primero = (v: Parametro) => (Array.isArray(v) ? v[0] : v);
const fmt = (n: number) => n.toLocaleString("es-CO");

const FECHA_HORA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const DIA_CORTO = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", day: "numeric", month: "short" });
const fechaHora = (iso: string | null) => (iso ? FECHA_HORA.format(new Date(iso)) : "—");
const diaCorto = (d: string) => DIA_CORTO.format(new Date(`${d}T12:00:00Z`));

/** Colores de estado de la aplicación: responde, a medias, casi nunca, sin uso. */
function tonoTasa(t: number | null): { bg: string; texto: string; etiqueta: string } {
  if (t == null) return { bg: "bg-slate-100", texto: "text-text-muted", etiqueta: "Sin uso" };
  if (t >= 0.95) return { bg: "bg-emerald-500", texto: "text-emerald-700", etiqueta: "Responde (95 % o más)" };
  if (t >= 0.8) return { bg: "bg-amber-400", texto: "text-amber-700", etiqueta: "A medias (80–94 %)" };
  return { bg: "bg-red-500", texto: "text-red-700", etiqueta: "Falla (menos del 80 %)" };
}

/**
 * Candidatos › Indicadores › Proveedores (26-nov-2026): qué tanto responde cada
 * proveedor externo (Croma por fuente, la IA por uso), cuánto tarda, cuándo se
 * cayó y cuánto cuesta, para decidir si conviene cambiarlo. Filtros en la URL:
 * `dias` 7, 30 o 90, o `desde` y `hasta`.
 */
export default async function IndicadoresProveedoresPage({ searchParams }: { searchParams: Promise<Record<string, Parametro>> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) redirect("/");
  const sp = await searchParams;
  const periodo = resolverPeriodo({ dias: primero(sp.dias), desde: primero(sp.desde), hasta: primero(sp.hasta) });
  const est = await leerEstadisticasProveedores(periodo.rango);
  const croma = est.filas.filter((f) => f.servicio === "croma");
  const ia = est.filas.filter((f) => f.servicio !== "croma");
  const caidas = est.filas
    .flatMap((f) => f.caidas.map((c) => ({ ...c, nombre: f.nombre })))
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
  const conAviso = est.filas.filter((f) => f.recomendacion);
  // Más de 45 días: por semana (empieza el lunes), para que la tabla quepa.
  const porSemana = est.dias.length > 45;

  return (
    <div className="mx-auto w-full max-w-6xl p-4 pb-20 sm:p-6 md:pb-6 lg:p-8">
      <Link href="/candidatos" className="mb-4 inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Candidatos
      </Link>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Server className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">Proveedores</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Qué tanto responden Croma y la IA, cuánto tardan y cuándo se cayeron, del {diaCorto(periodo.rango.desde)} al {diaCorto(periodo.rango.hasta)}. Para decidir si
            conviene cambiar de proveedor.
          </p>
        </div>
      </div>

      <PestanasIndicadores actual="proveedores" periodo={periodoDeLaUrl(sp)} />
      <HerramientasIndicadores titulo="Proveedores" contexto={`Del ${diaCorto(periodo.rango.desde)} al ${diaCorto(periodo.rango.hasta)}`} />

      <form method="get" action={RUTA} className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl border border-border bg-white p-3">
        <fieldset>
          <legend className="mb-1 text-[11px] font-medium text-text-tertiary">Periodo</legend>
          <div className="flex flex-wrap gap-2">
            {PERIODOS.map((p) => (
              <Link
                key={p}
                href={`${RUTA}?dias=${p}`}
                className={`rounded-lg border px-2.5 py-1 text-xs ${periodo.dias === p ? "border-primary bg-primary text-white" : "border-border text-text-secondary hover:bg-slate-50"}`}
              >
                {p} días
              </Link>
            ))}
          </div>
        </fieldset>
        <label className="text-[11px] font-medium text-text-tertiary">
          Desde
          <input type="date" name="desde" defaultValue={periodo.dias == null ? periodo.rango.desde : ""} className="mt-1 block rounded-lg border border-border px-2 py-1 text-xs text-text-primary" />
        </label>
        <label className="text-[11px] font-medium text-text-tertiary">
          Hasta
          <input type="date" name="hasta" defaultValue={periodo.dias == null ? periodo.rango.hasta : ""} className="mt-1 block rounded-lg border border-border px-2 py-1 text-xs text-text-primary" />
        </label>
        <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90">
          Ver rango
        </button>
      </form>

      {periodo.aviso && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{periodo.aviso}</p>}
      <p className="mb-4 text-xs text-text-tertiary">
        {est.sinRegistro
          ? "Todavía no se registra cada llamada (falta la migración 20261126191610): por ahora se muestra el resultado final de cada consulta a Croma, sin el tiempo de respuesta, y cada respuesta del asistente."
          : est.registroDesde
            ? `Cada llamada, con su tiempo de respuesta, se registra desde el ${fechaHora(est.registroDesde)}. Antes de eso: el resultado final de cada consulta a Croma (sin tiempo) y cada respuesta del asistente.`
            : "El registro de cada llamada está listo y empieza con la próxima consulta. Mientras tanto: el resultado final de cada consulta a Croma (sin tiempo) y cada respuesta del asistente."}{" "}
        Una caída son 3 errores seguidos de la misma fuente.
      </p>

      <div id="indicadores-contenido" className="space-y-6">
        {/* Qué hacer: lo primero que se ve. */}
        <section className={`rounded-2xl border p-4 sm:p-5 ${conAviso.length ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
          <h2 className={`text-base font-semibold ${conAviso.length ? "text-red-800" : "text-emerald-800"}`}>
            {conAviso.length ? `${conAviso.length} ${conAviso.length === 1 ? "proveedor para revisar" : "proveedores para revisar"}` : "Todos los proveedores responden bien en el periodo"}
          </h2>
          {conAviso.length > 0 && (
            <ul className="mt-2 space-y-1.5 text-sm text-red-800">
              {conAviso.map((f) => (
                <li key={f.clave}>
                  <span className="font-medium">{f.nombre}:</span> {f.recomendacion}
                </li>
              ))}
            </ul>
          )}
        </section>

        <TablaProveedores titulo="Croma, por fuente" filas={croma} />
        <TablaProveedores titulo="Inteligencia artificial, por uso" filas={ia} />

        <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-text-primary">Día a día</h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Qué parte de las llamadas respondió {porSemana ? "cada semana" : "cada día"}. Pase el mouse por una celda para ver las cifras.
          </p>
          <Leyenda />
          <SerieDiaria filas={est.filas} dias={est.dias} porSemana={porSemana} />
        </section>

        <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-text-primary">Caídas del periodo</h2>
          {caidas.length === 0 ? (
            <p className="mt-1 text-sm text-text-tertiary">Ninguna: no hubo 3 errores seguidos de una misma fuente.</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-text-tertiary">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Proveedor y fuente</th>
                    <th className="py-1.5 pr-3 font-medium">Empezó</th>
                    <th className="py-1.5 pr-3 font-medium">Volvió</th>
                    <th className="py-1.5 pr-3 font-medium">Duró</th>
                    <th className="py-1.5 font-medium">Errores</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {caidas.map((c) => {
                    const min = c.minutos;
                    return (
                      <tr key={`${c.nombre}-${c.inicio}`}>
                        <td className="py-1.5 pr-3 text-text-primary">{c.nombre}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-text-secondary">{fechaHora(c.inicio)}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{c.fin ? <span className="text-text-secondary">{fechaHora(c.fin)}</span> : <span className="font-medium text-red-700">Sigue caída</span>}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-text-secondary">{duracionLegible(min)}{c.fin ? "" : " hasta ahora"}</td>
                        <td className="py-1.5 tabular-nums text-text-secondary">{fmt(c.errores)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
          <h2 className="text-base font-semibold text-text-primary">Costo del periodo por proveedor</h2>
          <p className="mt-0.5 text-xs text-text-tertiary">Lo registrado para el tope mensual (en dólares). El detalle por candidato está en la pestaña Selección › Costo.</p>
          {est.costos.length === 0 ? (
            <p className="mt-1 text-sm text-text-tertiary">Sin costos registrados en el periodo.</p>
          ) : (
            <table className="mt-2 w-full text-left text-xs">
              <thead className="text-text-tertiary">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Proveedor</th>
                  <th className="py-1.5 pr-3 font-medium">Uso</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Llamadas</th>
                  <th className="py-1.5 text-right font-medium">Costo (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {est.costos.map((c) => (
                  <tr key={`${c.proveedor}-${c.concepto}`}>
                    <td className="py-1.5 pr-3 text-text-primary">{c.proveedor}</td>
                    <td className="py-1.5 pr-3 text-text-secondary">{c.concepto}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-text-secondary">{fmt(c.llamadas)}</td>
                    <td className="py-1.5 text-right tabular-nums text-text-primary">{c.usd.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function TablaProveedores({ titulo, filas }: { titulo: string; filas: FilaProveedor[] }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-text-primary">{titulo}</h2>
      {filas.length === 0 ? (
        <p className="mt-1 text-sm text-text-tertiary">Sin llamadas en el periodo.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-text-tertiary">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Proveedor y fuente</th>
                <th className="py-1.5 pr-3 text-right font-medium">Llamadas</th>
                <th className="py-1.5 pr-3 text-right font-medium">Respondió</th>
                <th className="py-1.5 pr-3 text-right font-medium" title="La mitad de las respuestas tarda menos que esto">
                  Tiempo típico
                </th>
                <th className="py-1.5 pr-3 text-right font-medium" title="El 5 % más lento tarda más que esto">
                  Más lentas
                </th>
                <th className="py-1.5 pr-3 text-right font-medium">Caídas</th>
                <th className="py-1.5 pr-3 font-medium">Última buena</th>
                <th className="py-1.5 font-medium">Último error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((f) => {
                const tono = tonoTasa(f.tasa);
                return (
                  <tr key={f.clave} className="align-top">
                    <td className="py-1.5 pr-3 font-medium text-text-primary">{f.nombre}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-text-secondary">{fmt(f.intentos)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      <span className={`inline-flex items-center gap-1.5 font-medium ${tono.texto}`}>
                        <span className={`h-2 w-2 rounded-full ${tono.bg}`} aria-hidden />
                        {f.tasa == null ? "—" : `${Math.round(f.tasa * 100)} %`}
                      </span>
                      <span className="block text-[10px] text-text-muted">
                        {fmt(f.respondio)} de {fmt(f.intentos)}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-text-secondary">{tiempoLegible(f.p50)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-text-secondary">{tiempoLegible(f.p95)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-text-secondary">
                      {f.caidas.length ? (
                        <>
                          {fmt(f.caidas.length)}
                          <span className="block text-[10px] text-text-muted">{duracionLegible(f.minutosCaida)} en total</span>
                        </>
                      ) : (
                        "0"
                      )}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-text-secondary">{fechaHora(f.ultimaBuenaAt)}</td>
                    <td className="max-w-[260px] py-1.5 text-text-tertiary">
                      {f.ultimoError ? (
                        <span className="line-clamp-2" title={f.ultimoError.texto}>
                          {fechaHora(f.ultimoError.at)}: {f.ultimoError.texto}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Leyenda() {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-secondary">
      {[1, 0.85, 0.5, null].map((t) => {
        const tono = tonoTasa(t);
        return (
          <span key={String(t)} className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-sm ${tono.bg}`} aria-hidden />
            {tono.etiqueta}
          </span>
        );
      })}
    </div>
  );
}

/** El lunes de la semana de un día (AAAA-MM-DD). */
function lunesDe(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return sumarDias(dia, -((d + 6) % 7));
}

function SerieDiaria({ filas, dias, porSemana }: { filas: FilaProveedor[]; dias: string[]; porSemana: boolean }) {
  if (!filas.length) return <p className="mt-2 text-sm text-text-tertiary">Sin llamadas en el periodo.</p>;
  const columnas = porSemana ? [...new Set(dias.map(lunesDe))] : dias;
  const celda = (f: FilaProveedor, col: string) => {
    const del = f.porDia.filter((d) => (porSemana ? lunesDe(d.dia) === col : d.dia === col));
    const intentos = del.reduce((s, d) => s + d.intentos, 0);
    const respondio = del.reduce((s, d) => s + d.respondio, 0);
    return { intentos, respondio, tasa: intentos ? respondio / intentos : null };
  };
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="text-[11px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white pr-3 text-left font-medium text-text-tertiary">Proveedor y fuente</th>
            {columnas.map((c, i) => (
              <th key={c} className="px-px pb-1 text-center font-normal text-text-muted">
                {/* Una etiqueta cada 7 columnas para que no se monten. */}
                <span className="inline-block w-5">{i % 7 === 0 ? diaCorto(c).replace(" de", "").split(" ")[0] : ""}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.clave}>
              <td className="sticky left-0 max-w-[220px] truncate bg-white py-0.5 pr-3 text-text-secondary" title={f.nombre}>
                {f.nombre}
              </td>
              {columnas.map((c) => {
                const x = celda(f, c);
                const tono = tonoTasa(x.tasa);
                const cuando = porSemana ? `semana del ${diaCorto(c)}` : diaCorto(c);
                return (
                  <td key={c} className="p-px">
                    <span
                      className={`block h-5 w-5 rounded-sm ${tono.bg}`}
                      title={x.intentos ? `${f.nombre} · ${cuando}: respondió ${x.respondio} de ${x.intentos} (${Math.round((x.tasa ?? 0) * 100)} %)` : `${f.nombre} · ${cuando}: sin llamadas`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
