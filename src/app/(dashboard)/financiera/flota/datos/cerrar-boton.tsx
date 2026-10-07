"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { cerrarPeriodoAccion } from "./actions";

type Cobertura = "completo" | "parcial" | "sin_dato" | null;

/**
 * Cierra un mes a mano, cuando el archivo contable ya está cargado y revisado.
 * La confirmación dice cómo está el archivo: cerrar sin él congela una
 * utilidad que solo es un techo.
 */
export function CerrarBoton({
  periodo,
  nombre,
  cobertura,
  conContable,
  vehiculos,
  deshabilitado,
  motivo,
}: {
  periodo: string;
  nombre: string;
  cobertura: Cobertura;
  conContable: number | null;
  vehiculos: number | null;
  deshabilitado?: boolean;
  motivo?: string;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  function cerrar() {
    const aviso =
      cobertura === "completo"
        ? "El archivo contable está completo."
        : cobertura === "parcial"
          ? `ATENCIÓN: el archivo contable está incompleto (${conContable ?? 0} de ${vehiculos ?? 0} vehículos). La utilidad de los que faltan quedará como un techo.`
          : "ATENCIÓN: el mes no tiene archivo contable. Sus gastos y su utilidad quedarán incompletos.";
    const texto =
      `¿Cerrar ${nombre} (${periodo})?\n\n${aviso}\n\n` +
      "Se consolida por última vez desde GEMA y las cifras quedan congeladas: después, reemplazar o reversar el archivo contable exige que el administrador lo reabra.";
    if (!window.confirm(texto)) return;
    empezar(async () => {
      const res = await cerrarPeriodoAccion(periodo);
      if (res.success) {
        toast.success(`Período ${periodo} cerrado.`);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo cerrar el período");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={cerrar}
      disabled={pendiente || deshabilitado}
      title={deshabilitado ? motivo : "Cerrar el período cuando el archivo contable esté cargado y revisado"}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-[#E2E8F0] px-2 text-xs text-gray-700 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pendiente ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
      Cerrar período
    </button>
  );
}
