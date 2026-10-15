"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { formatDateBogota } from "@/lib/utils";
import { ESTADOS_REFERIDO } from "@/lib/padrino/reglas";
import { FUENTE_PADRINO, HORIZONTES } from "@/lib/padrino/tablero";
import type { getTablero } from "@/lib/padrino/tablero-datos";

type Datos = Awaited<ReturnType<typeof getTablero>>;

const COP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const inputCls = "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

export function TableroClient({ datos, error, filtros, hoy }: { datos: Datos | null; error: string | null; filtros: { desde: string; hasta: string }; hoy: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const aplicar = (c: Partial<typeof filtros>) => {
    const f = { ...filtros, ...c };
    router.push(`${pathname}?${new URLSearchParams(f)}`);
  };

  if (!datos) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error ?? "No se pudo cargar el tablero."}</p>
      </div>
    );
  }
  const r = datos.resumen;
  const maxMes = Math.max(1, ...r.mensual.flatMap((m) => [m.causado, m.pagado]));
  const padrinoFila = datos.permanencia.find((p) => p.fuente === FUENTE_PADRINO);
  const otras = datos.permanencia.find((p) => p.fuente === "Otras fuentes (todas)");

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-5 sm:px-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Referidos registrados" valor={r.totalReferidos} detalle={`${r.contratados} contratados`} />
        <Tile label="Por aprobar" valor={r.porAprobar.cantidad} detalle={COP.format(r.porAprobar.valor)} href="/candidatos/plan-padrino/hitos?vista=por_aprobar" />
        <Tile label="Aprobados por pagar" valor={r.porPagar.cantidad} detalle={COP.format(r.porPagar.valor)} href="/candidatos/plan-padrino/hitos?vista=aprobado" />
        <Tile label="Por causar en 30 días" valor={r.proximos.cantidad} detalle={COP.format(r.proximos.valor)} href="/candidatos/plan-padrino/hitos?vista=proximos" />
        <Tile label="Pagado en total" valor={COP.format(r.pagadoTotal)} />
      </div>

      <section id="alertas" className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <TriangleAlert className={`h-4 w-4 ${datos.alertas.length ? "text-amber-600" : "text-gray-300"}`} />
          <h2 className="text-sm font-semibold text-gray-900">Alertas antes del próximo hito</h2>
          <span className="hidden text-xs text-gray-400 sm:inline">Faltas no justificadas o accidentes desde el ingreso del referido</span>
        </div>
        {datos.alertas.length === 0 ? (
          <p className="text-sm text-gray-400">Ningún referido en seguimiento tiene faltas no justificadas ni accidentes.</p>
        ) : (
          <ul className="divide-y divide-[#F1F5F9]">
            {datos.alertas.map((a) => (
              <li key={a.referidoId} className="flex flex-wrap items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link href={`/candidatos/plan-padrino/${a.referidoId}`} className="text-sm font-medium text-gray-900 hover:text-[#4F46E5]">{a.nombre ?? a.cedula}</Link>
                  {a.motivos.map((m) => (
                    <p key={m} className="text-xs text-amber-700">{m}</p>
                  ))}
                </div>
                {a.proximoHito && (
                  <span className="shrink-0 text-right text-xs text-gray-500">
                    Hito {a.proximoHito.numero} · {COP.format(a.proximoHito.valor)}
                    <span className="block">vence {formatDateBogota(a.proximoHito.fecha)}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel titulo="Referidos por estado">
          <ul className="space-y-2">
            {ESTADOS_REFERIDO.filter((e) => r.porEstado[e.value]).map((e) => (
              <li key={e.value} className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: e.bg, color: e.color }}>{e.label}</span>
                <span className="font-medium tabular-nums text-gray-800">{r.porEstado[e.value]}</span>
              </li>
            ))}
            {r.totalReferidos === 0 && <li className="text-sm text-gray-400">Todavía no hay referidos.</li>}
          </ul>
        </Panel>

        <Panel titulo="Causado y pagado por mes" nota="Últimos 12 meses">
          <div className="flex h-40 items-end gap-1.5">
            {r.mensual.map((m) => (
              <div key={m.mes} className="flex flex-1 flex-col items-center gap-1" title={`${nombreMes(m.mes)} · causado ${COP.format(m.causado)} · pagado ${COP.format(m.pagado)}`}>
                <div className="flex h-32 w-full items-end justify-center gap-0.5">
                  <span className="w-1/2 rounded-t bg-[#C7D2FE]" style={{ height: `${(m.causado / maxMes) * 100}%` }} />
                  <span className="w-1/2 rounded-t bg-[#4F46E5]" style={{ height: `${(m.pagado / maxMes) * 100}%` }} />
                </div>
                <span className="text-[10px] text-gray-400">{nombreMes(m.mes)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 flex gap-4 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#C7D2FE]" /> Causado (por fecha de causación)</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-[#4F46E5]" /> Pagado (por fecha de pago)</span>
          </p>
        </Panel>
      </div>

      <Panel titulo="Padrinos con más referidos" nota="Contratados, pagado y pendiente de pago">
        {r.topPadrinos.length === 0 ? (
          <p className="text-sm text-gray-400">Sin padrinos todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-4">Padrino</th>
                  <th className="py-2 pr-4 text-right">Referidos</th>
                  <th className="py-2 pr-4 text-right">Contratados</th>
                  <th className="py-2 pr-4 text-right">Pagado</th>
                  <th className="py-2 text-right">Por pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F8FAFC]">
                {r.topPadrinos.map((p) => (
                  <tr key={p.cedula}>
                    <td className="py-2 pr-4"><span className="text-gray-800">{p.nombre ?? "—"}</span> <span className="text-xs text-gray-400">{p.cedula}</span></td>
                    <td className="py-2 pr-4 text-right tabular-nums">{p.referidos}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{p.contratados}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{COP.format(p.pagado)}</td>
                    <td className="py-2 text-right tabular-nums">{COP.format(p.porPagar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">¿Funciona el plan? Permanencia y costo por fuente</h2>
            <p className="text-xs text-gray-500">Conductores contratados con fecha de contrato en el rango. Permanencia a N días = de quienes ya cumplieron N días, cuántos no se habían retirado.</p>
          </div>
          <div className="flex gap-2">
            <label className="text-xs font-medium text-gray-500">Contratados desde
              <input type="date" value={filtros.desde} max={filtros.hasta} onChange={(e) => e.target.value && aplicar({ desde: e.target.value })} className={`${inputCls} mt-1 block`} />
            </label>
            <label className="text-xs font-medium text-gray-500">hasta
              <input type="date" value={filtros.hasta} min={filtros.desde} max={hoy} onChange={(e) => e.target.value && aplicar({ hasta: e.target.value })} className={`${inputCls} mt-1 block`} />
            </label>
          </div>
        </div>

        {padrinoFila && otras && padrinoFila.tasas[90].pct !== null && otras.tasas[90].pct !== null && (
          <p className="mb-3 rounded-lg bg-[#EEF2FF] px-3 py-2 text-sm text-[#3730A3]">
            A 90 días permanece el {padrinoFila.tasas[90].pct}% de los referidos frente al {otras.tasas[90].pct}% de las demás fuentes:{" "}
            <strong>{(padrinoFila.tasas[90].pct - otras.tasas[90].pct).toFixed(1)} puntos</strong> de diferencia (la hipótesis de la spec es 15 o más).
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="py-2 pr-4">Fuente</th>
                <th className="py-2 pr-4 text-right">Contratados</th>
                {HORIZONTES.map((n) => <th key={n} className="py-2 pr-4 text-right">{n} días</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F8FAFC]">
              {datos.permanencia.map((p) => (
                <tr key={p.fuente} className={p.fuente === FUENTE_PADRINO ? "bg-[#EEF2FF]/50 font-medium" : p.fuente.startsWith("Otras") ? "border-t border-[#E2E8F0] text-gray-600" : ""}>
                  <td className="py-2 pr-4 text-gray-800">{p.fuente}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{p.contratados}</td>
                  {HORIZONTES.map((n) => (
                    <td key={n} className="py-2 pr-4 text-right tabular-nums" title={`${p.tasas[n].permanecen} de ${p.tasas[n].base} que ya cumplieron ${n} días`}>
                      {p.tasas[n].pct === null ? <span className="text-gray-300">—</span> : `${p.tasas[n].pct}%`}
                      <span className="ml-1 text-[11px] text-gray-400">({p.tasas[n].base})</span>
                    </td>
                  ))}
                </tr>
              ))}
              {datos.permanencia.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-sm text-gray-400">Ningún conductor contratado en el rango.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {datos.sinConductor > 0 && (
          <p className="mt-2 text-xs text-gray-400">{datos.sinConductor} contratado(s) del rango no aparecen en conductores (vacantes no conductoras o GEMA aún sin el dato): no entran en la comparación.</p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Costo titulo="Plan Padrino" nota="Hitos causados (por aprobar, aprobados y pagados) de los referidos contratados en el rango" c={datos.costos.padrino} />
          <Costo titulo="Meta Ads" nota="Gasto en Meta del rango ÷ contratados que llegaron por WhatsApp o ManyChat" c={datos.costos.meta} />
        </div>
      </section>
    </div>
  );
}

function Tile({ label, valor, detalle, href }: { label: string; valor: React.ReactNode; detalle?: string; href?: string }) {
  const contenido = (
    <>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 truncate text-xl font-bold text-gray-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-gray-400">{detalle}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-xl border border-[#E2E8F0] bg-white p-4 hover:border-[#4F46E5]">{contenido}</Link>
  ) : (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">{contenido}</div>
  );
}

function Panel({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
        {nota && <span className="text-xs text-gray-400">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

function Costo({ titulo, nota, c }: { titulo: string; nota: string; c: { costo: number; contratados: number; porContratado: number | null } }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] p-3">
      <p className="text-xs font-medium text-gray-500">Costo por contratado · {titulo}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{c.porContratado === null ? "—" : COP.format(c.porContratado)}</p>
      <p className="text-xs text-gray-400">{COP.format(c.costo)} ÷ {c.contratados} contratado(s)</p>
      <p className="mt-1 text-[11px] text-gray-400">{nota}</p>
    </div>
  );
}
