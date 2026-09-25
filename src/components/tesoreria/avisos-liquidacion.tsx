import { Info, TriangleAlert } from "lucide-react";
import { fechaCorta, type EstadoPago } from "@/lib/tesoreria/calendario-pago";

/** Piezas compartidas por la pantalla de Tesorería y el portal de afiliados (sin acciones de servidor). */

export const ESTADO_ESTILO: Record<EstadoPago, string> = {
  en_curso: "bg-[#F1F5F9] text-[#475569]",
  por_pagar: "bg-[#FEF3C7] text-[#92400E]",
  pagadero_hoy: "bg-[#DBEAFE] text-[#1D4ED8]",
  fecha_cumplida: "bg-[#D1FAE5] text-[#047857]",
};

/** Aviso fijo: lo que el reporte de GEMA tiene y Gestivo todavía no. */
export function AvisoObligaciones() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-xs text-[#1E40AF]">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        El <strong>pago de obligaciones</strong> («descuentos otros» del GAF-R-12: facturas de parqueadero, repuestos,
        cuotas…) aún no llega de GEMA a Gestivo. Por eso las deducciones no lo incluyen y el valor final es el
        <strong> líquido antes de obligaciones</strong>; el producido neto de GEMA es ese líquido menos las obligaciones.
      </p>
    </div>
  );
}

export function AvisoSincronizacion({ ultimo, hasta }: { ultimo: string | null; hasta: string }) {
  if (ultimo && ultimo >= hasta) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        GEMA está sincronizado hasta el <strong>{ultimo ? fechaCorta(ultimo) : "—"}</strong>: los días posteriores del
        periodo todavía no están y las cifras pueden cambiar.
      </p>
    </div>
  );
}
