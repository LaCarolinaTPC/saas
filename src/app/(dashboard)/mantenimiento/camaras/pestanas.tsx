import Link from "next/link";
import { contarSolicitudesCamaraPendientes } from "@/lib/tesoreria/recobros-data";

/**
 * Pestañas del control de cámaras y sensores: registrar, solicitudes,
 * historial y tablero. «Solicitudes» lleva en rojo cuántas revisiones de
 * cámara pidió Tesorería y siguen sin resolver.
 */
export async function PestanasCamaras({ activa }: { activa: "registrar" | "solicitudes" | "historial" | "tablero" }) {
  const pendientes = await contarSolicitudesCamaraPendientes();
  const cls = (a: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md ${a ? "bg-white text-[#4F46E5] shadow-sm" : "text-gray-600 hover:text-gray-900"}`;
  return (
    <div className="inline-flex gap-1 rounded-lg bg-[#EEF2FF] p-1">
      <Link href="/mantenimiento/camaras" className={cls(activa === "registrar")}>Registrar</Link>
      <Link href="/mantenimiento/camaras/solicitudes" className={cls(activa === "solicitudes")}>
        Solicitudes
        {pendientes > 0 && (
          <span
            className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-[#DC2626] px-1.5 text-[11px] font-semibold leading-5 text-white"
            aria-label={`${pendientes} por resolver`}
          >
            {pendientes}
          </span>
        )}
      </Link>
      <Link href="/mantenimiento/camaras/historial" className={cls(activa === "historial")}>Historial</Link>
      <Link href="/mantenimiento/camaras/tablero" className={cls(activa === "tablero")}>Tablero</Link>
    </div>
  );
}
