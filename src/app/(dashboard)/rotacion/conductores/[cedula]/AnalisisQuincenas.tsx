import Section from "@/components/rotacion/ui/Section";
import EmptyState from "@/components/rotacion/ui/EmptyState";
import { TrendingUp, ArrowUp, ArrowDown } from "lucide-react";
import { formatNumber } from "@/lib/rotacion/utils/format";

interface Cierre {
  fecha: string;
  timbradas: number;
  diff_tim: number;
  viajes: number;
}

interface VP {
  fecha: string;
  tipologia: string | null;
  quincena: number | null;
  periodo: string | null;
}

interface QuincenaStat {
  key: string;
  label: string;
  diasTrabajados: number;
  timbradas: number;
  promTim: number;
  vpCount: number;
}

function computeStats(cierres: Cierre[], viajes: VP[]): QuincenaStat[] {
  const vpConductor = viajes.filter(
    (v) => v.tipologia?.toUpperCase() === "CONDUCTOR"
  );
  const periodos = new Set([
    ...cierres.map((c) => c.fecha.slice(0, 7)),
    ...vpConductor.map((v) => v.periodo).filter(Boolean),
  ]);

  const stats: QuincenaStat[] = [];
  const months: Record<string, string> = {
    "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
  };

  for (const periodo of Array.from(periodos).sort()) {
    for (const q of [1, 2]) {
      const qCierres = cierres.filter((c) => {
        if (!c.fecha.startsWith(periodo!)) return false;
        const day = parseInt(c.fecha.split("-")[2], 10);
        return q === 1 ? day <= 15 : day > 15;
      });
      const qVP = vpConductor.filter(
        (v) => v.periodo === periodo && v.quincena === q
      );
      if (qCierres.length === 0 && qVP.length === 0) continue;

      const dias = new Set(qCierres.map((c) => c.fecha)).size;
      const tim = qCierres.reduce((s, c) => s + Number(c.timbradas || 0) - Number(c.diff_tim || 0), 0);
      const mm = periodo!.split("-")[1];

      stats.push({
        key: `${periodo}-Q${q}`,
        label: `${months[mm] || mm} Q${q}`,
        diasTrabajados: dias,
        timbradas: Math.round(tim),
        promTim: dias > 0 ? Math.round(tim / dias) : 0,
        vpCount: qVP.length,
      });
    }
  }
  return stats;
}

export default function AnalisisQuincenas({
  cierres,
  viajes,
}: {
  cierres: Cierre[];
  viajes: VP[];
}) {
  const stats = computeStats(cierres, viajes);

  if (stats.length < 1) return null;

  return (
    <Section
      icon={<TrendingUp className="w-4 h-4" />}
      title="Analisis por Quincena"
      noPadding
    >
      {stats.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="w-5 h-5" />}
          title="Sin datos suficientes"
        />
      ) : (
        <>
          {/* Stats table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg">
                <tr>
                  {["Periodo", "Dias", "Timbradas", "Prom/Dia", "VP"].map(
                    (h) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border ${
                          h !== "Periodo" ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr
                    key={s.key}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-gold-50/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {s.label}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                      {s.diasTrabajados}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                      {formatNumber(s.timbradas)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-text-primary">
                      {formatNumber(s.promTim)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-semibold ${
                        s.vpCount > 0 ? "text-negative" : "text-positive"
                      }`}
                    >
                      {s.vpCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Comparisons */}
          {stats.length >= 2 && (
            <div className="px-6 py-5 border-t border-border-subtle">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-3">
                Evolucion
              </h4>
              <div className="space-y-2">
                {stats.slice(1).map((to, i) => {
                  const from = stats[i];
                  const deltaTim =
                    from.promTim > 0
                      ? Math.round(
                          ((to.promTim - from.promTim) / from.promTim) * 100
                        )
                      : 0;
                  const deltaVP = to.vpCount - from.vpCount;

                  return (
                    <div
                      key={to.key}
                      className="flex items-center gap-4 text-sm bg-bg rounded-xl px-4 py-3 flex-wrap"
                    >
                      <span className="text-xs font-medium text-text-tertiary">
                        {from.label} → {to.label}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="text-text-muted">Tim/dia</span>
                        <span className="text-text-secondary">
                          {formatNumber(from.promTim)} →{" "}
                          {formatNumber(to.promTim)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-0.5 font-semibold ${
                            deltaTim >= 0 ? "text-positive" : "text-negative"
                          }`}
                        >
                          {deltaTim >= 0 ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          )}
                          {Math.abs(deltaTim)}%
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 text-xs ml-auto">
                        <span className="text-text-muted">VP</span>
                        <span className="text-text-secondary">
                          {from.vpCount} → {to.vpCount}
                        </span>
                        <span
                          className={`inline-flex items-center gap-0.5 font-semibold ${
                            deltaVP <= 0 ? "text-positive" : "text-negative"
                          }`}
                        >
                          {deltaVP <= 0 ? (
                            <ArrowDown className="w-3 h-3" />
                          ) : (
                            <ArrowUp className="w-3 h-3" />
                          )}
                          {Math.abs(deltaVP)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
