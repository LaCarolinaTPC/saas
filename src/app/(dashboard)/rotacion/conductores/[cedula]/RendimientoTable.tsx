import Section from "@/components/rotacion/ui/Section";
import EmptyState from "@/components/rotacion/ui/EmptyState";
import { ClipboardList } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/rotacion/utils/format";

interface Cierre {
  fecha: string;
  ruta: string | null;
  vehiculo: string | null;
  viajes: number;
  timbradas: number;
  diff_tim: number;
  prom_tim: number;
}

export default function RendimientoTable({ cierres }: { cierres: Cierre[] }) {
  return (
    <Section
      icon={<ClipboardList className="w-4 h-4" />}
      title="Rendimiento Operativo"
      count={cierres.length ? `${cierres.length} registros` : undefined}
      noPadding
    >
      {!cierres.length ? (
        <EmptyState
          icon={<ClipboardList className="w-5 h-5" />}
          title="Sin datos operativos"
          description="Los registros de cierre apareceran aqui"
        />
      ) : (
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg sticky top-0 z-10">
              <tr>
                {["Fecha", "Ruta", "Viajes", "Timbradas", "Diff", "Prom"].map(
                  (h) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border ${
                        ["Viajes", "Timbradas", "Diff", "Prom"].includes(h)
                          ? "text-right"
                          : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {cierres.map((c, i) => (
                <tr
                  key={`${c.fecha}-${i}`}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-gold-50/50 transition-colors"
                >
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                    {formatDate(c.fecha)}
                  </td>
                  <td className="px-4 py-3 text-text-secondary max-w-[180px] truncate">
                    {c.ruta || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                    {formatNumber(c.viajes)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                    {formatNumber(c.timbradas - c.diff_tim, 2)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums font-medium ${
                      c.diff_tim >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {c.diff_tim >= 0 ? "+" : ""}
                    {formatNumber(c.diff_tim, 2)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-text-secondary">
                    {formatNumber(c.prom_tim)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
