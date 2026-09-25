import { Info, TriangleAlert } from "lucide-react";
import { fechaCorta, type EstadoPago } from "@/lib/tesoreria/calendario-pago";

/** Piezas compartidas por la pantalla de Tesorería y el portal de afiliados (sin acciones de servidor). */

export const ESTADO_ESTILO: Record<EstadoPago, string> = {
  en_curso: "bg-[#F1F5F9] text-[#475569]",
  por_pagar: "bg-[#FEF3C7] text-[#92400E]",
  pagadero_hoy: "bg-[#DBEAFE] text-[#1D4ED8]",
  fecha_cumplida: "bg-[#D1FAE5] text-[#047857]",
};

export type EstadoObligaciones = "ok" | "parcial" | "sin_dato";

/** Estado del dato de obligaciones en un conjunto de resúmenes. */
export function estadoObligaciones(resumenes: { obligaciones: number | null; obligacionesParciales: boolean }[]): EstadoObligaciones {
  if (!resumenes.length || resumenes.every((r) => r.obligaciones !== null && !r.obligacionesParciales)) return "ok";
  return resumenes.every((r) => r.obligaciones === null) ? "sin_dato" : "parcial";
}

/**
 * Aviso del pago de obligaciones («descuentos otros» de GEMA). No aparece
 * cuando todos los días traen el dato; los sincronizados antes de la columna
 * (migración 20260925213418) no lo tienen.
 */
export function AvisoObligaciones({ estado }: { estado: EstadoObligaciones }) {
  if (estado === "ok") return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-xs text-[#1E40AF]">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        {estado === "sin_dato" ? (
          <>
            Estos días no traen el <strong>pago de obligaciones</strong> («descuentos otros» de GEMA): se sincronizaron
            antes de que Gestivo guardara ese campo. Por eso se muestra el <strong>líquido antes de obligaciones</strong>{" "}
            y no el producido neto.
          </>
        ) : (
          <>
            Parte de los días no trae el <strong>pago de obligaciones</strong> («descuentos otros» de GEMA): el total de
            deducciones y el producido neto pueden quedarse cortos.
          </>
        )}
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
