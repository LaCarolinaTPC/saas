import Link from "next/link";

/** Pestañas del control de cámaras y sensores: registrar y el historial. */
export function PestanasCamaras({ activa }: { activa: "registrar" | "historial" }) {
  const cls = (a: boolean) =>
    `px-3 py-1.5 text-sm font-medium rounded-md ${a ? "bg-white text-[#4F46E5] shadow-sm" : "text-gray-600 hover:text-gray-900"}`;
  return (
    <div className="inline-flex gap-1 rounded-lg bg-[#EEF2FF] p-1">
      <Link href="/mantenimiento/camaras" className={cls(activa === "registrar")}>Registrar</Link>
      <Link href="/mantenimiento/camaras/historial" className={cls(activa === "historial")}>Historial</Link>
    </div>
  );
}
