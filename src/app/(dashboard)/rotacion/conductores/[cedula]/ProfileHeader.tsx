import Link from "next/link";
import { getInitials, formatDate } from "@/lib/rotacion/utils/format";
import { GrupoBadge, TipoBadge, EstadoBadge, AfiliacionBadge } from "@/components/rotacion/ui/Badge";
import { ChevronLeft } from "lucide-react";
import type { ConductorConGrupo } from "@/types/rotacion";

const ESTADO_CARD: Record<string, { bg: string; border: string; avatar: string }> = {
  ACTIVO:     { bg: "bg-emerald-100",  border: "border-l-[6px] border-emerald-600", avatar: "bg-emerald-700 text-white" },
  RETIRADO:   { bg: "bg-red-100",      border: "border-l-[6px] border-red-600",     avatar: "bg-red-700 text-white"     },
  SUSPENDIDO: { bg: "bg-amber-100",    border: "border-l-[6px] border-amber-500",   avatar: "bg-amber-600 text-white"   },
};

export default function ProfileHeader({
  conductor,
}: {
  conductor: ConductorConGrupo;
}) {
  const inactivo = conductor.estado !== "ACTIVO";
  const style = ESTADO_CARD[(conductor.estado || "").toUpperCase()] ?? ESTADO_CARD.ACTIVO;
  return (
    <div>
      <Link
        href="/dashboard/conductores"
        className="inline-flex items-center gap-1 text-sm text-text-tertiary hover:text-text-primary transition-colors mb-4"
      >
        <ChevronLeft className="w-4 h-4" />
        Volver al buscador
      </Link>

      <div className={`${style.bg} ${style.border} rounded-2xl border-t border-r border-b border-border shadow-sm p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5`}>
        <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${style.avatar} flex items-center justify-center font-bold text-xl sm:text-2xl shrink-0`}>
          {getInitials(conductor.nombre)}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary truncate">
            {conductor.nombre}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            CC {conductor.cedula}
            {conductor.codigo && ` · Cod. ${conductor.codigo}`}
            {conductor.meses_antiguedad != null &&
              ` · ${Math.round(conductor.meses_antiguedad)} meses`}
            {inactivo && conductor.fecha_retiro &&
              ` · Retiro: ${formatDate(conductor.fecha_retiro)}`}
            {conductor.fecha_reingreso &&
              ` · Reingreso: ${formatDate(conductor.fecha_reingreso)}`}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <TipoBadge tipo={conductor.tipo_conductor} />
            <AfiliacionBadge tipo={conductor.tipo_conductor} />
            <GrupoBadge grupo={conductor.grupo_antiguedad} />
            <EstadoBadge estado={conductor.estado} />
          </div>
        </div>
      </div>
    </div>
  );
}
