// Marco común de las pantallas de Gestión de flota: encabezado, pestañas
// permitidas y barra de filtros. Server Component.
import { Landmark } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccessSub, type Permissions } from "@/lib/permissions";
import type { OpcionesFiltro } from "@/lib/financiera/analisis";
import { BarraFiltros, Pestanas, type Pestana } from "./filtros";

/** Pestaña → sub-función que la habilita. */
const PESTANAS: (Pestana & { sub: string })[] = [
  { href: "/financiera/flota", label: "Resumen", sub: "fin_tablero" },
  { href: "/financiera/flota/rentabilidad", label: "Rentabilidad", sub: "fin_tablero" },
  { href: "/financiera/flota/timbrada", label: "Gasto por timbrada", sub: "fin_tablero" },
  { href: "/financiera/flota/productividad", label: "Productividad", sub: "fin_tablero" },
  { href: "/financiera/flota/comparacion", label: "Comparación", sub: "fin_analisis" },
  { href: "/financiera/flota/perdida", label: "Vehículos en pérdida", sub: "fin_analisis" },
  { href: "/financiera/flota/mantenimiento", label: "Mantenimiento", sub: "fin_analisis" },
  { href: "/financiera/flota/datos", label: "Datos", sub: "fin_datos" },
  { href: "/financiera/flota/auditoria", label: "Auditoría", sub: "fin_auditoria" },
  { href: "/financiera/flota/parametros", label: "Parámetros", sub: "fin_parametros" },
];

export function pestanasPermitidas(perms: Permissions): Pestana[] {
  return PESTANAS.filter((p) => canAccessSub(perms, "financiera", p.sub)).map(({ href, label }) => ({ href, label }));
}

export function MarcoFlota({
  perms,
  titulo,
  descripcion,
  anios,
  opciones,
  conVista = false,
  acciones,
  children,
}: {
  perms: Permissions;
  titulo: string;
  descripcion?: string;
  anios: number[];
  opciones: OpcionesFiltro;
  conVista?: boolean;
  acciones?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo={titulo}
        icono={Landmark}
        descripcion={descripcion}
        pie={
          <div className="mt-2">
            <Pestanas pestanas={pestanasPermitidas(perms)} />
          </div>
        }
      >
        {acciones}
      </PageHeader>
      <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
        <BarraFiltros anios={anios} opciones={opciones} conVista={conVista} />
        {children}
      </div>
    </div>
  );
}
