import Link from "next/link";

/** Pestañas de la revisión preoperacional: el día en curso y el historial. */
export function PestanasPreop({ activa }: { activa: "dia" | "historial" }) {
  const cls = (a: boolean) =>
    `px-3 py-1.5 text-sm font-medium rounded-md ${a ? "bg-white text-[#4F46E5] shadow-sm" : "text-gray-600 hover:text-gray-900"}`;
  return (
    <div className="inline-flex gap-1 rounded-lg bg-[#EEF2FF] p-1">
      <Link href="/operativo/preoperacional" className={cls(activa === "dia")}>Hoy</Link>
      <Link href="/operativo/preoperacional/historial" className={cls(activa === "historial")}>Historial</Link>
    </div>
  );
}
