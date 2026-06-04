import Link from "next/link";
import { getAccidentes, getAccidenteStats } from "@/lib/rotacion/data/accidentes";
import AccidenteStatusBadge, {
  type AccidenteEstado,
} from "@/components/accidentabilidad/AccidenteStatusBadge";

const FILTERS: { key: string; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendiente_revision", label: "Pendientes" },
  { key: "falta_informacion", label: "Falta info" },
  { key: "completada", label: "Completadas" },
  { key: "aprobado", label: "Aprobados" },
];

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function ConsultarAccidentesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado = "todos" } = await searchParams;
  const [accidentes, stats] = await Promise.all([getAccidentes(estado), getAccidenteStats()]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Consultar accidentes</h1>
        <Link href="/accidentabilidad/reportar" className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white">
          + Reportar accidente
        </Link>
      </div>

      <div className="px-6 py-6">
        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Pendientes" value={stats.pendiente_revision} />
          <Stat label="Falta info" value={stats.falta_informacion} />
          <Stat label="Completadas" value={stats.completada} />
          <Stat label="Aprobados" value={stats.aprobado} />
        </div>

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/accidentabilidad/consultar?estado=${f.key}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                estado === f.key ? "bg-[#4F46E5] text-white" : "border border-[#E2E8F0] bg-white text-gray-600"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Conductor</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Dirección</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {accidentes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    No hay reportes {estado !== "todos" ? "con este estado" : ""}.
                  </td>
                </tr>
              ) : (
                accidentes.map((a) => (
                  <tr key={a.id} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/accidentabilidad/consultar/${a.id}`} className="hover:underline">
                        #{a.consecutivo}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/accidentabilidad/consultar/${a.id}`} className="block">
                        <span className="font-medium text-gray-900">{a.conductor_nombre}</span>
                        <span className="block text-xs text-gray-500">{a.conductor_cedula}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(a.fecha_accidente)}</td>
                    <td className="px-4 py-3 text-gray-600">{a.direccion_accidente}</td>
                    <td className="px-4 py-3">
                      <AccidenteStatusBadge estado={a.estado as AccidenteEstado} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
