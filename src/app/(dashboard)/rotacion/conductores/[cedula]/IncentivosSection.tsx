import Section from "@/components/rotacion/ui/Section";
import { Gift } from "lucide-react";
import { formatCOP } from "@/lib/rotacion/utils/format";

interface IncentivoRow {
  mes_entrega: string | null;
  periodo: string | null;
  valor: number;
  concepto: string | null;
}

export default function IncentivosSection({
  incentivos,
}: {
  incentivos: IncentivoRow[];
}) {
  if (!incentivos.length) return null;

  const totalValor = incentivos.reduce((s, i) => s + (i.valor || 0), 0);

  return (
    <Section
      icon={<Gift className="w-4 h-4" />}
      title="Incentivos"
      count={incentivos.length}
    >
      {totalValor > 0 && (
        <div className="mb-4 text-xs text-text-tertiary">
          Total:{" "}
          <span className="font-semibold text-positive">
            {formatCOP(totalValor)}
          </span>{" "}
          en {incentivos.length} incentivo
          {incentivos.length > 1 ? "s" : ""}
        </div>
      )}
      <div className="space-y-3">
        {incentivos.map((item, i) => (
          <div key={i} className="bg-bg rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">
                {item.concepto || "—"}
              </span>
              <span className="text-xs font-medium bg-positive-bg text-positive px-2 py-0.5 rounded-full shrink-0 ml-2">
                {formatCOP(item.valor)}
              </span>
            </div>
            {item.mes_entrega && (
              <p className="text-xs text-text-tertiary mt-1">{item.mes_entrega}</p>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
