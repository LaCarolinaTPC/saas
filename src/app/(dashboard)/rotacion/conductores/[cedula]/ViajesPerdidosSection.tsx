import Section from "@/components/rotacion/ui/Section";
import EmptyState from "@/components/rotacion/ui/EmptyState";
import { CircleAlert, CheckCircle } from "lucide-react";
import { formatDate } from "@/lib/rotacion/utils/format";
import type { ViajePerdido } from "@/types/rotacion";

export default function ViajesPerdidosSection({
  viajes,
}: {
  viajes: ViajePerdido[];
}) {
  const vpConductor = viajes.filter(
    (v) => v.tipologia?.toUpperCase() === "CONDUCTOR"
  );

  const byPeriodo: Record<
    string,
    { novedades: Record<string, number>; total: number }
  > = {};

  for (const v of vpConductor) {
    const key = `${v.periodo || "?"} Q${v.quincena || "?"}`;
    if (!byPeriodo[key]) byPeriodo[key] = { novedades: {}, total: 0 };
    byPeriodo[key].total++;
    const nov = v.novedad || "Otra";
    byPeriodo[key].novedades[nov] = (byPeriodo[key].novedades[nov] || 0) + 1;
  }

  return (
    <Section
      icon={<CircleAlert className="w-4 h-4" />}
      title="Vueltas Perdidas"
      count={vpConductor.length || undefined}
      noPadding
    >
      {vpConductor.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="w-5 h-5" />}
          title="Sin vueltas perdidas"
          description="No hay registros de viajes perdidos"
        />
      ) : (
        <>
          {/* Summary by period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-6 py-5">
            {Object.entries(byPeriodo)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, data]) => (
                <div
                  key={key}
                  className="bg-bg rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                      {key}
                    </h4>
                    <span className="text-xs font-semibold text-negative bg-negative-bg px-2 py-0.5 rounded-full">
                      {data.total}
                    </span>
                  </div>
                  {Object.entries(data.novedades)
                    .sort(([, a], [, b]) => b - a)
                    .map(([novedad, count]) => (
                      <div
                        key={novedad}
                        className="flex justify-between text-sm py-1.5"
                      >
                        <span className="text-text-tertiary">{novedad}</span>
                        <span className="font-medium tabular-nums text-text-primary">
                          {count}
                        </span>
                      </div>
                    ))}
                </div>
              ))}
          </div>

          {/* Detail table */}
          <div className="max-h-[300px] overflow-y-auto border-t border-border-subtle">
            <table className="w-full text-sm">
              <thead className="bg-bg sticky top-0 z-10">
                <tr>
                  {["Fecha", "Novedad", "Detalle", "Ruta", "Turno"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {viajes.map((v, i) => (
                  <tr
                    key={v.id || i}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-gold-50/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                      {formatDate(v.fecha)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {v.novedad || "—"}
                    </td>
                    <td className="px-4 py-3 text-text-tertiary max-w-[180px] truncate">
                      {v.detalle_novedad || "—"}
                    </td>
                    <td className="px-4 py-3 text-text-tertiary max-w-[160px] truncate">
                      {v.ruta || "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary tabular-nums">
                      {v.turno || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}
