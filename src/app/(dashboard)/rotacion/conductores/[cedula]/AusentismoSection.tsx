import Section from "@/components/rotacion/ui/Section";
import EmptyState from "@/components/rotacion/ui/EmptyState";
import { Calendar, CalendarCheck } from "lucide-react";
import { formatDate } from "@/lib/rotacion/utils/format";

interface AusentismoRow {
  dias_it_pagados: number | null;
  origen: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  diagnostico: string | null;
  eps: string | null;
  indicador_prorroga: string | null;
}

const ORIGEN_SHORT: Record<string, string> = {
  EG: "Enf. General",
  EC: "Enf. Comun",
  EL: "Enf. Laboral",
  AT: "Acc. Trabajo",
  LM: "Lic. Maternidad",
  LP: "Lic. Paternidad",
};

export default function AusentismoSection({
  ausentismo,
}: {
  ausentismo: AusentismoRow[];
}) {
  const totalDias = ausentismo.reduce(
    (s, a) => s + (a.dias_it_pagados || 0),
    0
  );

  return (
    <Section
      icon={<Calendar className="w-4 h-4" />}
      title="Ausentismo"
      count={ausentismo.length || undefined}
    >
      {ausentismo.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="w-5 h-5" />}
          title="Sin incapacidades"
          description="No hay registros de ausentismo"
        />
      ) : (
        <>
          {totalDias > 0 && (
            <div className="mb-4 text-xs text-text-tertiary">
              Total:{" "}
              <span className="font-semibold text-negative">
                {totalDias} dias
              </span>{" "}
              en {ausentismo.length} incapacidad
              {ausentismo.length > 1 ? "es" : ""}
            </div>
          )}
          <div className="space-y-3">
            {ausentismo.map((a, i) => (
              <div
                key={i}
                className="bg-bg rounded-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary">
                    {formatDate(a.fecha_inicio)}
                    {a.fecha_fin && ` — ${formatDate(a.fecha_fin)}`}
                  </span>
                  {a.dias_it_pagados != null && (
                    <span className="text-xs font-medium bg-negative-bg text-negative px-2 py-0.5 rounded-full">
                      {a.dias_it_pagados} dias
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-xs text-text-tertiary space-y-0.5">
                  {a.origen && (
                    <p>{ORIGEN_SHORT[a.origen] || a.origen}</p>
                  )}
                  {a.diagnostico && (
                    <p className="text-text-secondary">{a.diagnostico}</p>
                  )}
                  {a.eps && <p>EPS: {a.eps}</p>}
                  {a.indicador_prorroga && (
                    <p>{a.indicador_prorroga}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}
