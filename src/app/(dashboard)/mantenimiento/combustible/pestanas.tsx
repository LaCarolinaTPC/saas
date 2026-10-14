import Link from "next/link";

/** Pestañas de Combustible: cargar el archivo del proveedor e historial de tanqueos. */
export function PestanasCombustible({ activa }: { activa: "cargar" | "historial" }) {
  const cls = (a: boolean) =>
    `px-3 py-1.5 text-sm font-medium rounded-md ${a ? "bg-white text-[#4F46E5] shadow-sm" : "text-gray-600 hover:text-gray-900"}`;
  return (
    <div className="inline-flex gap-1 rounded-lg bg-[#EEF2FF] p-1">
      <Link href="/mantenimiento/combustible" className={cls(activa === "cargar")}>Cargar</Link>
      <Link href="/mantenimiento/combustible/historial" className={cls(activa === "historial")}>Historial</Link>
    </div>
  );
}
