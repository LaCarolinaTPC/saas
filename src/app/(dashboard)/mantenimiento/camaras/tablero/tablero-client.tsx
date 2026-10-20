import Link from "next/link";
import { CircleCheck, Info, Lightbulb, TriangleAlert } from "lucide-react";
import { ELEMENTO_LABEL } from "@/lib/mantenimiento/camaras-reglas";
import { analizarTablero, MIN_VIAJES_CONDUCTOR, type Insight, type InsightTono, type Tablero } from "@/lib/mantenimiento/camaras-tablero";

const inputCls = "h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";
const tarjeta = "rounded-xl border border-[#E2E8F0] bg-white";
const fmt = new Intl.NumberFormat("es-CO");
const MAX_FILAS = 15;
const theadCls = "sticky top-0 z-10 bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500";
const filaZebra = "border-t border-[#F1F5F9] odd:bg-white even:bg-[#FBFCFE]";

function Kpi({ titulo, valor, detalle, barra }: {
  titulo: string;
  valor: string;
  detalle?: string;
  /** Barra de progreso opcional (0-100) con su color. */
  barra?: { pct: number; color: string };
}) {
  return (
    <div className={`${tarjeta} p-4`}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{valor}</div>
      {barra && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#F1F5F9]">
          <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, barra.pct))}%`, background: barra.color }} />
        </div>
      )}
      {detalle && <div className="mt-1 text-xs text-gray-500">{detalle}</div>}
    </div>
  );
}

const pctTexto = (v: number | null) => (v == null ? "—" : `${String(v).replace(".", ",")} %`);

/** Color del % de cuadre del sensor: verde desde 80 %, ámbar desde 60 %. */
function claseCuadre(v: number | null) {
  if (v == null) return "text-gray-400";
  return v >= 80 ? "text-emerald-700" : v >= 60 ? "text-amber-700" : "text-red-700";
}

const TONO: Record<InsightTono, { borde: string; fondo: string; punto: string; texto: string }> = {
  critico: { borde: "border-red-200", fondo: "bg-red-50", punto: "bg-red-500", texto: "text-red-800" },
  alerta: { borde: "border-amber-200", fondo: "bg-amber-50", punto: "bg-amber-500", texto: "text-amber-800" },
  bueno: { borde: "border-emerald-200", fondo: "bg-emerald-50", punto: "bg-emerald-500", texto: "text-emerald-800" },
  info: { borde: "border-slate-200", fondo: "bg-slate-50", punto: "bg-slate-400", texto: "text-slate-700" },
};

function InsightItem({ i }: { i: Insight }) {
  const c = TONO[i.tono];
  return (
    <li className={`flex gap-2 rounded-lg border ${c.borde} ${c.fondo} p-2.5`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c.punto}`} />
      <div>
        <div className={`text-sm font-semibold ${c.texto}`}>{i.titulo}</div>
        <div className="text-xs text-gray-600">{i.detalle}</div>
      </div>
    </li>
  );
}

/** Leyenda compartida de los semáforos de color del tablero. */
function Leyenda() {
  const punto = (cls: string, txt: string) => (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${cls}`} />
      {txt}
    </span>
  );
  return (
    <div className={`${tarjeta} flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs text-gray-600`}>
      <span className="inline-flex items-center gap-1 font-medium text-gray-500"><Info className="h-3.5 w-3.5" /> Cómo leer los colores:</span>
      <span className="inline-flex items-center gap-2">
        <span className="text-gray-400">Sensor cuadra</span>
        {punto("bg-emerald-500", "≥ 80 %")}
        {punto("bg-amber-500", "60-79 %")}
        {punto("bg-red-500", "< 60 %")}
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="text-gray-400">Caja − aforo</span>
        {punto("bg-amber-500", "≤ −5 %")}
        {punto("bg-red-500", "≤ −15 %")}
      </span>
    </div>
  );
}

function historial(desde: string, hasta: string, extra: Record<string, string>) {
  return `/mantenimiento/camaras/historial?${new URLSearchParams({ desde, hasta, ...extra })}`;
}

export function TableroCamarasClient({ desde, hasta, tablero, despachados, aviso, error }: {
  desde: string;
  hasta: string;
  tablero: Tablero | null;
  despachados: number;
  aviso: string | null;
  error: string | null;
}) {
  const t = tablero;
  const cobertura = t && despachados > 0 ? Math.round((t.viajesRevisados / despachados) * 1000) / 10 : null;
  const maxTipo = Math.max(1, ...(t?.porTipo.map((x) => x.cantidad) ?? [1]));
  const analisis = t && t.revisiones > 0 ? analizarTablero(t, despachados) : null;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <form method="get" className={`${tarjeta} grid grid-cols-2 gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]`}>
        <label className="text-sm text-gray-600">Desde<input type="date" name="desde" defaultValue={desde} className={inputCls} /></label>
        <label className="text-sm text-gray-600">Hasta<input type="date" name="hasta" defaultValue={hasta} className={inputCls} /></label>
        <div className="col-span-2 flex items-end sm:col-span-1">
          <button type="submit" className="h-10 w-full rounded-lg bg-[#4F46E5] px-5 text-sm font-semibold text-white hover:bg-[#4338CA]">Consultar</button>
        </div>
      </form>

      {aviso && <p className="text-sm text-amber-700">{aviso}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">No se pudo cargar el tablero. Detalle: {error}</p>}

      {t && t.revisiones === 0 && !error && (
        <div className={`${tarjeta} flex flex-col items-center gap-2 p-10 text-center`}>
          <Info className="h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-700">No hay revisiones en este periodo</p>
          <p className="text-xs text-gray-500">Ajusta el rango de fechas o registra revisiones en «Cámaras y sensores».</p>
        </div>
      )}

      {t && t.revisiones > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi titulo="Viajes revisados" valor={fmt.format(t.viajesRevisados)} detalle={`${fmt.format(t.revisiones)} revisiones`} />
            <Kpi
              titulo="Cobertura" valor={pctTexto(cobertura)}
              detalle={`de ${fmt.format(despachados)} viajes despachados en GEMA`}
              barra={cobertura != null ? { pct: cobertura, color: "#4F46E5" } : undefined}
            />
            <Kpi titulo="Con falla" valor={fmt.format(t.fallas)} detalle={`${pctTexto(t.revisiones ? Math.round((t.fallas / t.revisiones) * 1000) / 10 : null)} de las revisiones`} />
            <Kpi
              titulo="Sensor cuadra con el aforo" valor={pctTexto(t.pctCuadra)}
              detalle={`en ${fmt.format(t.comparables)} viajes con DFS y aforo (solo el histórico del Forms)`}
              barra={t.pctCuadra != null ? { pct: t.pctCuadra, color: t.pctCuadra >= 80 ? "#10B981" : t.pctCuadra >= 60 ? "#F59E0B" : "#EF4444" } : undefined}
            />
          </div>

          <Leyenda />

          {analisis && (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className={tarjeta}>
                <h2 className="flex items-center gap-2 border-b border-[#F1F5F9] px-4 py-3 text-sm font-semibold text-gray-900">
                  <Info className="h-4 w-4 text-slate-500" /> Qué está pasando
                </h2>
                {analisis.descriptivo.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">Sin señales relevantes en el periodo.</p>
                ) : (
                  <ul className="space-y-2 p-4">
                    {analisis.descriptivo.map((i, k) => <InsightItem key={k} i={i} />)}
                  </ul>
                )}
              </section>

              <section className={tarjeta}>
                <h2 className="flex items-center gap-2 border-b border-[#F1F5F9] px-4 py-3 text-sm font-semibold text-gray-900">
                  <Lightbulb className="h-4 w-4 text-[#4F46E5]" /> Qué hacer
                  <span className="font-normal text-gray-500">· recomendaciones</span>
                </h2>
                {analisis.recomendaciones.length === 0 ? (
                  <p className="flex items-center gap-2 p-4 text-sm text-emerald-700">
                    <CircleCheck className="h-4 w-4" /> Todo en verde: sin acciones urgentes este periodo.
                  </p>
                ) : (
                  <ul className="space-y-2 p-4">
                    {analisis.recomendaciones.map((i, k) => <InsightItem key={k} i={i} />)}
                  </ul>
                )}
              </section>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className={tarjeta}>
              <h2 className="border-b border-[#F1F5F9] px-4 py-3 text-sm font-semibold text-gray-900">Fallas por tipo</h2>
              {t.porTipo.length === 0 ? <p className="p-4 text-sm text-gray-500">Sin fallas en el periodo.</p> : (
                <ul className="space-y-2 p-4 text-sm">
                  {t.porTipo.map((x) => (
                    <li key={x.clave}>
                      <Link href={historial(desde, hasta, { tipo: x.clave })} className="flex items-center justify-between gap-2 hover:underline">
                        <span>{ELEMENTO_LABEL[x.elemento]} · {x.nombre}</span>
                        <span className="tabular-nums font-medium">{fmt.format(x.cantidad)}</span>
                      </Link>
                      <div className="mt-1 h-1.5 rounded-full bg-[#F1F5F9]">
                        <div className={`h-1.5 rounded-full ${x.elemento === "camara" ? "bg-[#4F46E5]" : "bg-[#0EA5E9]"}`} style={{ width: `${(x.cantidad / maxTipo) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${tarjeta} overflow-hidden`}>
              <h2 className="border-b border-[#F1F5F9] px-4 py-3 text-sm font-semibold text-gray-900">Por mes</h2>
              {t.porMes.length === 0 ? <p className="p-4 text-sm text-gray-500">Sin revisiones en el periodo.</p> : (
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead className={theadCls}>
                    <tr><th className="px-4 py-2">Mes</th><th className="px-4 py-2 text-right">Revisiones</th><th className="px-4 py-2 text-right">Fallas</th><th className="px-4 py-2 text-right">Sensor cuadra</th></tr>
                  </thead>
                  <tbody>
                    {t.porMes.map((m) => (
                      <tr key={m.mes} className={filaZebra}>
                        <td className="px-4 py-2">{m.mes}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt.format(m.revisiones)}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${m.fallas > 0 ? "text-red-700" : "text-gray-700"}`}>{fmt.format(m.fallas)}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[#F1F5F9] sm:block">
                              <div className="h-1.5 rounded-full" style={{ width: `${m.pctCuadra ?? 0}%`, background: m.pctCuadra == null ? "transparent" : m.pctCuadra >= 80 ? "#10B981" : m.pctCuadra >= 60 ? "#F59E0B" : "#EF4444" }} />
                            </div>
                            <span className={`w-14 text-right tabular-nums ${claseCuadre(m.pctCuadra)}`}>{pctTexto(m.pctCuadra)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </section>
          </div>

          <section className={tarjeta}>
            <h2 className="border-b border-[#F1F5F9] px-4 py-3 text-sm font-semibold text-gray-900">
              Vehículos con más fallas <span className="font-normal text-gray-500">· los {MAX_FILAS} primeros</span>
            </h2>
            {t.vehiculos.length === 0 ? <p className="p-4 text-sm text-gray-500">Sin fallas registradas en el periodo.</p> : (
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className={theadCls}>
                  <tr>
                    <th className="px-4 py-2">Vehículo</th><th className="px-4 py-2 text-right">Revisiones</th>
                    <th className="px-4 py-2 text-right">Fallas cámara</th><th className="px-4 py-2 text-right">Fallas sensor</th>
                    <th className="px-4 py-2 text-right">Sensor cuadra</th><th className="px-4 py-2 text-right">DFS − aforo</th>
                  </tr>
                </thead>
                <tbody>
                  {t.vehiculos.slice(0, MAX_FILAS).map((v) => {
                    const critico = v.fallasCamara + v.fallasSensor >= 3 || (v.pctCuadra != null && v.pctCuadra < 60);
                    return (
                    <tr key={v.codigo} className={`${filaZebra} ${critico ? "!bg-red-50" : ""}`}>
                      <td className="px-4 py-2 font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          {critico && <TriangleAlert className="h-3.5 w-3.5 text-red-600" />}
                          <Link href={historial(desde, hasta, { codigo: v.codigo })} className="hover:underline">{v.codigo}</Link>
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{v.revisiones}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${v.fallasCamara >= 2 ? "font-semibold text-red-700" : ""}`}>{v.fallasCamara}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${v.fallasSensor >= 2 ? "font-semibold text-red-700" : ""}`}>{v.fallasSensor}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${claseCuadre(v.pctCuadra)}`}>{pctTexto(v.pctCuadra)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{v.comparables ? fmt.format(v.diferenciaDfs) : "—"}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </section>

          <section className={tarjeta}>
            <h2 className="border-b border-[#F1F5F9] px-4 py-3 text-sm font-semibold text-gray-900">
              Caja frente al aforo por conductor
              <span className="block text-xs font-normal text-gray-500">
                Pasajeros que pagaron en caja (GEMA) contra los contados en el video, en los viajes revisados; conductores con {MIN_VIAJES_CONDUCTOR} o más viajes.
                Un faltante es un indicio para revisar, no una prueba.
              </span>
            </h2>
            {t.conductores.length === 0 ? <p className="p-4 text-sm text-gray-500">No hay viajes con aforo y caja suficientes en el periodo.</p> : (
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className={theadCls}>
                    <tr>
                      <th className="px-4 py-2">Conductor</th><th className="px-4 py-2 text-right">Viajes</th>
                      <th className="px-4 py-2 text-right">Aforo</th><th className="px-4 py-2 text-right">Caja</th>
                      <th className="px-4 py-2 text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.conductores.slice(0, MAX_FILAS).map((c) => {
                      const critico = (c.pct ?? 0) <= -15;
                      return (
                      <tr key={c.cedula} className={`${filaZebra} ${critico ? "!bg-red-50" : ""}`}>
                        <td className="px-4 py-2">
                          <span className="inline-flex items-center gap-1.5">
                            {critico && <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-red-600" />}
                            <Link href={historial(desde, hasta, { conductor: c.cedula })} className="hover:underline">{c.nombre}</Link>
                          </span>
                          <span className="block text-xs text-gray-500">CC {c.cedula}</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{c.viajes}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt.format(c.aforo)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt.format(c.caja)}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${(c.pct ?? 0) <= -15 ? "font-semibold text-red-700" : (c.pct ?? 0) <= -5 ? "text-amber-700" : "text-gray-700"}`}>
                          {fmt.format(c.diferencia)} <span className="text-xs">({pctTexto(c.pct)})</span>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
