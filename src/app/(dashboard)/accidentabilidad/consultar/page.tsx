import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { getAccidenteStats } from "@/lib/rotacion/data/accidentes";
import {
  filtrosDesdeParams, getAccidentesAnalisis, getOpcionesFiltro,
} from "@/lib/accidentabilidad/analisis";
import { getCurrentPermissions } from "@/lib/permissions";
import FiltrosAccidentes from "../_components/filtros-accidentes";
import { ConsultarAccidentesClient } from "./consultar-client";

const FILTERS: { key: string; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendiente_revision", label: "Pendientes" },
  { key: "falta_informacion", label: "Falta info" },
  { key: "completada", label: "Completadas" },
  { key: "aprobado", label: "Aprobados" },
];

export default async function ConsultarAccidentesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const estado = sp.estado ?? "todos";
  const historico = sp.origen === "historico";

  const filtros = filtrosDesdeParams(sp);
  filtros.origen = historico ? "historico" : "gestivo";

  const [accidentes, stats, perms, opciones] = await Promise.all([
    getAccidentesAnalisis(filtros),
    getAccidenteStats(),
    getCurrentPermissions(),
    getOpcionesFiltro(),
  ]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Consultar accidentes">
        {perms.isAdmin && (
          <Link href="/accidentabilidad/catalogos" className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-[#F8FAFC]">
            Catálogos
          </Link>
        )}
        {(perms.isAdmin || perms.modules.includes("accidentabilidad_analisis")) && (
          <Link href="/accidentabilidad/analisis" className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-[#F8FAFC]">
            Análisis
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

            {/* Filtros rápidos por estado del flujo */}
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

        {/* Filtros de segmentación por campos */}
        <FiltrosAccidentes
          basePath="/accidentabilidad/consultar"
          rutas={opciones.rutas}
          aseguradoras={opciones.aseguradoras}
        />

        {/* Tabla con orden por columna, columnas/compacto/ampliar y export */}
        <ConsultarAccidentesClient filas={accidentes} historico={historico} filtros={filtros} />
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
