import Link from "next/link";
import { ELEMENTO_LABEL } from "@/lib/mantenimiento/camaras-reglas";
import { MIN_VIAJES_CONDUCTOR, type Tablero } from "@/lib/mantenimiento/camaras-tablero";

const inputCls = "h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";
const tarjeta = "rounded-xl border border-[#E2E8F0] bg-white";
const fmt = new Intl.NumberFormat("es-CO");
const MAX_FILAS = 15;

function Kpi({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className={`${tarjeta} p-4`}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{valor}</div>
      {detalle && <div className="mt-0.5 text-xs text-gray-500">{detalle}</div>}
    </div>
  );
}

const pctTexto = (v: number | null) => (v == null ? "—" : `${String(v).replace(".", ",")} %`);

/** Color del % de cuadre del sensor: verde desde 80 %, ámbar desde 60 %. */
function claseCuadre(v: number | null) {
  if (v == null) return "text-gray-400";
  return v >= 80 ? "text-emerald-700" : v >= 60 ? "text-amber-700" : "text-red-700";
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

      {t && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi titulo="Viajes revisados" valor={fmt.format(t.viajesRevisados)} detalle={`${fmt.format(t.revisiones)} revisiones`} />
            <Kpi titulo="Cobertura" valor={pctTexto(cobertura)} detalle={`de ${fmt.format(despachados)} viajes despachados en GEMA`} />
            <Kpi titulo="Con falla" valor={fmt.format(t.fallas)} detalle={`${pctTexto(t.revisiones ? Math.round((t.fallas / t.revisiones) * 1000) / 10 : null)} de las revisiones`} />
            <Kpi titulo="Sensor cuadra con el aforo" valor={pctTexto(t.pctCuadra)} detalle={`en ${fmt.format(t.comparables)} viajes con DFS y aforo`} />
          </div>

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

            <section className={tarjeta}>
              <h2 className="border-b border-[#F1F5F9] px-4 py-3 text-sm font-semibold text-gray-900">Por mes</h2>
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr><th className="px-4 py-2">Mes</th><th className="px-4 py-2 text-right">Revisiones</th><th className="px-4 py-2 text-right">Fallas</th><th className="px-4 py-2 text-right">Sensor cuadra</th></tr>
                </thead>
                <tbody>
                  {t.porMes.map((m) => (
                    <tr key={m.mes} className="border-t border-[#F1F5F9]">
                      <td className="px-4 py-2">{m.mes}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt.format(m.revisiones)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt.format(m.fallas)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${claseCuadre(m.pctCuadra)}`}>{pctTexto(m.pctCuadra)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section className={tarjeta}>
            <h2 className="border-b border-[#F1F5F9] px-4 py-3 text-sm font-semibold text-gray-900">
              Vehículos con más fallas <span className="font-normal text-gray-500">· los {MAX_FILAS} primeros</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Vehículo</th><th className="px-4 py-2 text-right">Revisiones</th>
                    <th className="px-4 py-2 text-right">Fallas cámara</th><th className="px-4 py-2 text-right">Fallas sensor</th>
                    <th className="px-4 py-2 text-right">Sensor cuadra</th><th className="px-4 py-2 text-right">DFS − aforo</th>
                  </tr>
                </thead>
                <tbody>
                  {t.vehiculos.slice(0, MAX_FILAS).map((v) => (
                    <tr key={v.codigo} className="border-t border-[#F1F5F9]">
                      <td className="px-4 py-2 font-semibold">
                        <Link href={historial(desde, hasta, { codigo: v.codigo })} className="hover:underline">{v.codigo}</Link>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{v.revisiones}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${v.fallasCamara >= 2 ? "font-semibold text-red-700" : ""}`}>{v.fallasCamara}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${v.fallasSensor >= 2 ? "font-semibold text-red-700" : ""}`}>{v.fallasSensor}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${claseCuadre(v.pctCuadra)}`}>{pctTexto(v.pctCuadra)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{v.comparables ? fmt.format(v.diferenciaDfs) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Conductor</th><th className="px-4 py-2 text-right">Viajes</th>
                      <th className="px-4 py-2 text-right">Aforo</th><th className="px-4 py-2 text-right">Caja</th>
                      <th className="px-4 py-2 text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.conductores.slice(0, MAX_FILAS).map((c) => (
                      <tr key={c.cedula} className="border-t border-[#F1F5F9]">
                        <td className="px-4 py-2">
                          <Link href={historial(desde, hasta, { conductor: c.cedula })} className="hover:underline">{c.nombre}</Link>
                          <span className="block text-xs text-gray-500">CC {c.cedula}</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{c.viajes}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt.format(c.aforo)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt.format(c.caja)}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${(c.pct ?? 0) <= -15 ? "font-semibold text-red-700" : (c.pct ?? 0) <= -5 ? "text-amber-700" : "text-gray-700"}`}>
                          {fmt.format(c.diferencia)} <span className="text-xs">({pctTexto(c.pct)})</span>
                        </td>
                      </tr>
                    ))}
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
