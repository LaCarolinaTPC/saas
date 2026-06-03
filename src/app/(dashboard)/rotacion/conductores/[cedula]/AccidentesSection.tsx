import Section from "@/components/rotacion/ui/Section";
import EmptyState from "@/components/rotacion/ui/EmptyState";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/rotacion/utils/format";
import type { ViajePerdido } from "@/types/rotacion";

export default function AccidentesSection({
  viajes,
}: {
  viajes: ViajePerdido[];
}) {
  const accidentes = viajes.filter(
    (v) =>
      v.novedad?.toUpperCase().includes("ACCIDENTE") ||
      v.detalle_novedad?.toUpperCase().includes("ACCIDENTE")
  );

  return (
    <Section
      icon={<AlertTriangle className="w-4 h-4" />}
      title="Historial de Accidentes"
      count={accidentes.length || undefined}
      noPadding
    >
      {accidentes.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="w-5 h-5" />}
          title="Sin accidentes registrados"
          description="No hay incidentes en el historial"
        />
      ) : (
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg sticky top-0 z-10">
              <tr>
                {["Fecha", "Novedad", "Detalle", "Ruta", "Vehiculo", "Placa"].map(
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
              {accidentes.map((a, i) => (
                <tr
                  key={i}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-negative-bg/50 transition-colors"
                >
                  <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                    {formatDate(a.fecha)}
                  </td>
                  <td className="px-4 py-3 font-medium text-negative">
                    {a.novedad || "—"}
                  </td>
                  <td className="px-4 py-3 text-text-tertiary max-w-[180px] truncate">
                    {a.detalle_novedad || "—"}
                  </td>
                  <td className="px-4 py-3 text-text-tertiary max-w-[160px] truncate">
                    {a.ruta || "—"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {a.vehiculo || "—"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {a.placa || "—"}
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
