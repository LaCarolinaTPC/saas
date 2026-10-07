import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { getAccidentes, getAccidenteStats, type OrigenAccidente } from "@/lib/rotacion/data/accidentes";
import AccidenteStatusBadge, {
  CasoBadge,
  type AccidenteEstado,
} from "@/components/accidentabilidad/AccidenteStatusBadge";
import { TablaPaginada } from "@/components/shared/paginacion";
import { getCurrentPermissions } from "@/lib/permissions";

const FILTERS: { key: string; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendiente_revision", label: "Pendientes" },
  { key: "falta_informacion", label: "Falta info" },
  { key: "completada", label: "Completadas" },
  { key: "aprobado", label: "Aprobados" },
];

const RESPONSABILIDAD: Record<string, string> = {
  directo: "Conductor",
  tercero: "Tercero",
  compartido: "Compartida",
  en_estudio: "En estudio",
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function ConsultarAccidentesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; origen?: string }>;
}) {
  const { estado = "todos", origen: origenParam } = await searchParams;
  const origen: OrigenAccidente = origenParam === "historico" ? "historico" : "gestivo";
  const historico = origen === "historico";
  const [accidentes, stats, perms] = await Promise.all([
    getAccidentes(estado, origen),
    getAccidenteStats(),
    getCurrentPermissions(),
  ]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Consultar accidentes">
        {perms.isAdmin && (
          <Link href="/accidentabilidad/catalogos" className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-[#F8FAFC]">
            Catálogos
          </Link>
        )}
        <Link href="/accidentabilidad/reportar" className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white">
          + Reportar accidente
        </Link>
      </PageHeader>

      <div className="px-6 py-6">
        {/* Origen: reportes de Gestivo o histórico de la matriz */}
        <div className="mb-5 flex gap-1 border-b border-[#E2E8F0]">
          <Pestana href="/accidentabilidad/consultar" activa={!historico}>
            Reportes
          </Pestana>
          <Pestana href="/accidentabilidad/consultar?origen=historico" activa={historico}>
            Histórico <span className="ml-1 text-xs text-gray-400">{stats.historico ?? 0}</span>
          </Pestana>
        </div>

        {historico ? (
          <p className="mb-4 rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-gray-600">
            Accidentes importados de la <strong>Matriz de Control de Accidentes de Tráfico (GO-R-22)</strong>, que se
            llevaba en Excel antes de reportar en Gestivo. Cuentan para el historial del conductor y la reincidencia,
            pero no tienen firma ni dictamen y no se editan.
          </p>
        ) : (
          <>
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
          </>
        )}

        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          <TablaPaginada
            key={`${origen}-${estado}`}
            unidad={historico ? "accidentes" : "reportes"}
            encabezado={
              <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Conductor</th>
                  <th className="px-4 py-3">Fecha</th>
                  {historico && <th className="px-4 py-3">Vehículo</th>}
                  <th className="px-4 py-3">Dirección</th>
                  {historico && <th className="px-4 py-3">Responsabilidad</th>}
                  <th className="px-4 py-3">{historico ? "Caso" : "Estado"}</th>
                </tr>
              </thead>
            }
            vacio={
              <p className="px-4 py-10 text-center text-sm text-gray-400">
                {historico
                  ? "Todavía no se ha cargado el histórico de la matriz."
                  : `No hay reportes ${estado !== "todos" ? "con este estado" : ""}.`}
              </p>
            }
            filas={accidentes.map((a) => (
              <tr key={a.id} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC]">
                <td className="px-4 py-3 font-medium text-gray-900">
                  <Link href={`/accidentabilidad/consultar/${a.id}`} className="hover:underline">
                    #{a.consecutivo}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/accidentabilidad/consultar/${a.id}`} className="block">
                    <span className="font-medium text-gray-900">{a.conductor_nombre}</span>
                    <span className="block text-xs text-gray-500">{a.conductor_cedula ?? "Sin cédula"}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600">{fmtDate(a.fecha_accidente)}</td>
                {historico && (
                  <td className="px-4 py-3 text-gray-600">
                    {a.vehiculo_codigo ?? "—"}
                    {a.vehiculo_placa && <span className="block text-xs text-gray-400">{a.vehiculo_placa}</span>}
                  </td>
                )}
                <td className="px-4 py-3 text-gray-600">{a.direccion_accidente}</td>
                {historico && (
                  <td className="px-4 py-3 text-gray-600">{RESPONSABILIDAD[a.responsabilidad_reportada ?? ""] ?? "—"}</td>
                )}
                <td className="px-4 py-3">
                  {historico ? (
                    <CasoBadge estado={a.caso_estado} />
                  ) : (
                    <AccidenteStatusBadge estado={a.estado as AccidenteEstado} />
                  )}
                </td>
              </tr>
            ))}
          />
        </div>
      </div>
    </div>
  );
}

function Pestana({ href, activa, children }: { href: string; activa: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
        activa ? "border-[#4F46E5] text-[#4F46E5]" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </Link>
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
