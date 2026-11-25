import Link from "next/link";
import { Download } from "lucide-react";
import { pesosDetalle, rangoMesActual, rangoMesAnterior, type DetalleCostos, type GrupoCosto } from "@/lib/seleccion/costos";
import type { GastoDelMes } from "@/lib/seleccion/consumos-servidor";

/**
 * Sección «Costo» de los indicadores de selección (24-nov-2026): con su propio
 * periodo (`costo_desde`/`costo_hasta`, el mes en curso por defecto), separa IA
 * de Croma, da el costo por unidad de cada concepto (respuesta, documento,
 * audio, consulta), por modelo y Croma por fuente, y se exporta a Excel.
 */

const RUTA = "/candidatos/indicadores";
const fmt = (n: number) => n.toLocaleString("es-CO");
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;
const usd = (v: number) => `US$${v.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CAMPO = "h-7 rounded-md border border-border bg-white px-2 text-xs text-text-primary outline-none focus:border-primary";

const GRUPOS: { id: GrupoCosto; nombre: string }[] = [
  { id: "ia", nombre: "Inteligencia artificial" },
  { id: "croma", nombre: "Croma" },
  { id: "whatsapp", nombre: "WhatsApp" },
];

type Valores = Record<string, string | undefined>;

function fechaLarga(dia: string): string {
  return new Date(`${dia}T12:00:00-05:00`).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" });
}

function enlaceCon(valores: Valores): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(valores)) if (v) q.set(k, v);
  const t = q.toString();
  return `${RUTA}${t ? `?${t}` : ""}#costo`;
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

const pct = (v: number, total: number) => (total > 0 ? `${Math.round((v / total) * 100)}%` : "—");

const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-text-tertiary";
const thN = `${th} text-right`;
const td = "px-3 py-2 align-top";
const tdN = `${td} text-right tabular-nums`;

export function CostoSeccion({
  d,
  gasto,
  aviso,
  periodoPagina,
  elegido,
}: {
  d: DetalleCostos;
  gasto: GastoDelMes | null;
  aviso: string | null;
  /** `dias`, `desde` y `hasta` de la página, para no perderlos al cambiar el del costo. */
  periodoPagina: Valores;
  /** ¿Hay fechas del costo en la URL? */
  elegido: boolean;
}) {
  const mes = rangoMesActual();
  const anterior = rangoMesAnterior();
  const esMes = d.rango.desde === mes.desde && d.rango.hasta === mes.hasta;
  const esAnterior = d.rango.desde === anterior.desde && d.rango.hasta === anterior.hasta;
  const excel = `/api/seleccion/costos?costo_desde=${d.rango.desde}&costo_hasta=${d.rango.hasta}`;
  const subtotal: Record<GrupoCosto, number> = { ia: d.ia.cop, croma: d.croma.cop, whatsapp: d.whatsapp.cop };

  return (
    <section id="costo" className="scroll-mt-4 rounded-2xl border border-border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="text-base font-semibold text-text-primary">Costo</h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            Del {fechaLarga(d.rango.desde)} al {fechaLarga(d.rango.hasta)}. Tiene su propio periodo: el mes en curso si no se elige otro. Lo que cobran los
            modelos de IA y las consultas reales a Croma, en pesos con la TRM de ${fmt(d.trm)}.
          </p>
        </div>
        <a
          href={excel}
          download
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-medium text-text-primary hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" /> Exportar a Excel
        </a>
      </div>

      <form method="get" action={`${RUTA}#costo`} className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {Object.entries(periodoPagina).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <nav className="flex rounded-lg border border-border bg-white p-0.5 text-xs" aria-label="Periodo del costo">
          {[
            { nombre: "Este mes", activo: esMes, href: enlaceCon(periodoPagina) },
            { nombre: "Mes anterior", activo: esAnterior, href: enlaceCon({ ...periodoPagina, costo_desde: anterior.desde, costo_hasta: anterior.hasta }) },
          ].map((b) => (
            <Link
              key={b.nombre}
              href={b.href}
              aria-current={b.activo ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 ${b.activo ? "bg-primary font-medium text-white" : "text-text-secondary hover:bg-slate-50"}`}
            >
              {b.nombre}
            </Link>
          ))}
        </nav>
        <div
          className={`flex flex-wrap items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs text-text-secondary ${
            !esMes && !esAnterior ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <span>Del</span>
          <input type="date" name="costo_desde" aria-label="Costo desde" defaultValue={elegido ? d.rango.desde : undefined} max={mes.hasta} className={CAMPO} />
          <span>al</span>
          <input type="date" name="costo_hasta" aria-label="Costo hasta (incluido)" defaultValue={elegido ? d.rango.hasta : undefined} max={mes.hasta} className={CAMPO} />
        </div>
        <button type="submit" className="h-8 rounded-lg bg-primary px-4 text-xs font-medium text-white hover:bg-primary/90">
          Aplicar
        </button>
      </form>
      {aviso && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">{aviso}</p>}

      <div className="mt-4 space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Cifra etiqueta="Total del periodo" valor={pesosDetalle(d.total.cop)} nota={usd(d.total.usd)} />
          <Cifra etiqueta="Inteligencia artificial" valor={pesosDetalle(d.ia.cop)} nota={`${usd(d.ia.usd)} · ${fmt(d.ia.llamadas)} llamadas al modelo`} />
          <Cifra
            etiqueta="Croma"
            valor={pesosDetalle(d.croma.cop)}
            nota={`${fmt(d.croma.cobradas)} consultas cobradas${d.croma.sinValor ? " · valor por consulta en 0" : ` a ${pesos(d.cromaCostoCop)}`}`}
          />
          <Cifra etiqueta="Por aspirante" valor={pesosDetalle(d.porAspiranteCop)} nota={`${fmt(d.aspirantes)} aspirantes en el periodo`} />
          <Cifra
            etiqueta="Por contratado"
            valor={pesosDetalle(d.porContratadoCop)}
            nota={d.contratados ? `${fmt(d.contratados)} contratados en el periodo` : "Nadie se contrató en el periodo"}
          />
          <Cifra
            etiqueta="Mes en curso frente al tope"
            valor={gasto ? (gasto.topeCop > 0 ? `${Math.round(gasto.porcentaje)}%` : pesos(gasto.gastoCop)) : null}
            nota={gasto ? (gasto.topeCop > 0 ? `${pesos(gasto.gastoCop)} de ${pesos(gasto.topeCop)}` : "Sin tope configurado") : "Falta la migración de la entrega 3"}
          />
        </div>

        <div>
          <Subtitulo>Por concepto y costo por unidad</Subtitulo>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Concepto</th>
                  <th className={thN}>Cantidad</th>
                  <th className={thN}>Costo</th>
                  <th className={thN}>Por unidad</th>
                  <th className={thN}>% del total</th>
                </tr>
              </thead>
              <tbody>
                {GRUPOS.map((g) => {
                  const filas = d.conceptos.filter((c) => c.grupo === g.id);
                  if (g.id === "whatsapp" && filas.every((c) => c.unidades === 0 && c.cop === 0)) return null;
                  return [
                    <tr key={g.id} className="border-t border-border bg-slate-50/60">
                      <td className={`${td} font-semibold text-text-primary`}>{g.nombre}</td>
                      <td className={tdN} />
                      <td className={`${tdN} font-semibold text-text-primary`}>{pesosDetalle(subtotal[g.id])}</td>
                      <td className={tdN} />
                      <td className={`${tdN} font-semibold text-text-primary`}>{pct(subtotal[g.id], d.total.cop)}</td>
                    </tr>,
                    ...filas.map((c) => (
                      <tr key={c.clave} className="border-t border-border">
                        <td className={`${td} pl-6`}>
                          <span className="text-text-primary">{c.etiqueta}</span>
                          {c.nota && <span className="block text-[11px] text-text-tertiary">{c.nota}</span>}
                        </td>
                        <td className={tdN}>
                          {fmt(c.unidades)} {c.unidades === 1 ? c.unidad[0] : c.unidad[1]}
                        </td>
                        <td className={tdN}>{pesosDetalle(c.cop)}</td>
                        <td className={tdN}>{c.porUnidadCop == null ? "—" : `${pesosDetalle(c.porUnidadCop)} / ${c.unidad[0]}`}</td>
                        <td className={tdN}>{pct(c.cop, d.total.cop)}</td>
                      </tr>
                    )),
                  ];
                })}
                <tr className="border-t-2 border-border">
                  <td className={`${td} font-semibold text-text-primary`}>Total</td>
                  <td className={tdN} />
                  <td className={`${tdN} font-semibold text-text-primary`}>{pesosDetalle(d.total.cop)}</td>
                  <td className={tdN} />
                  <td className={tdN} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {d.modelos.length > 0 && (
          <div>
            <Subtitulo>Por modelo de IA</Subtitulo>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[680px] text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Concepto</th>
                    <th className={th}>Modelo</th>
                    <th className={thN}>Llamadas</th>
                    <th className={thN}>Tokens (entrada / salida)</th>
                    <th className={thN}>Costo</th>
                    <th className={thN}>Por llamada</th>
                  </tr>
                </thead>
                <tbody>
                  {d.modelos.map((m) => (
                    <tr key={`${m.concepto}|${m.proveedor}|${m.modelo}`} className="border-t border-border">
                      <td className={td}>{m.etiquetaConcepto}</td>
                      <td className={td}>
                        {m.etiquetaModelo}
                        <span className="block text-[11px] text-text-tertiary">{m.proveedor}</span>
                      </td>
                      <td className={tdN}>{fmt(m.llamadas)}</td>
                      <td className={tdN}>{m.tokensEntrada || m.tokensSalida ? `${fmt(m.tokensEntrada)} / ${fmt(m.tokensSalida)}` : "Cobro por minuto"}</td>
                      <td className={tdN}>{pesosDetalle(m.cop)}</td>
                      <td className={tdN}>{pesosDetalle(m.porLlamadaCop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {d.fuentes.length > 0 && (
          <div>
            <Subtitulo>Croma por fuente</Subtitulo>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Fuente</th>
                    <th className={thN}>Cobradas</th>
                    <th className={thN}>Reutilizadas (sin costo)</th>
                    <th className={thN}>Con error (no se cuentan)</th>
                    <th className={thN}>Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.fuentes.map((f) => (
                    <tr key={f.fuente} className="border-t border-border">
                      <td className={td}>{f.etiqueta}</td>
                      <td className={tdN}>{fmt(f.cobradas)}</td>
                      <td className={tdN}>{fmt(f.reutilizadas)}</td>
                      <td className={tdN}>{fmt(f.conError)}</td>
                      <td className={tdN}>{pesosDetalle(f.cop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {d.croma.sinValor && d.croma.cobradas > 0 && (
          <p className="text-xs text-amber-700">
            El valor de una consulta a Croma está en 0 (Candidatos › Selección › Tiempos y reglas › Costo del asistente): las consultas se cuentan, pero no suman
            al costo.
          </p>
        )}
      </div>
    </section>
  );
}
