import Link from "next/link";
import { BellRing } from "lucide-react";
import type { Aviso } from "@/lib/tesoreria/recobros-vista";

/**
 * Lo que este usuario tiene que atender en Recobros, según su rol: sin
 * gestión hoy (caja), decide subgerencia, plazo vencido (Operativo),
 * incobrables y liquidaciones (directora) y correcciones por validar
 * (director de Mantenimiento). Cada línea lleva a la bandeja filtrada. Sin
 * nada pendiente no se pinta.
 */
export function AvisoRecobros({ avisos, className = "" }: { avisos: readonly Aviso[]; className?: string }) {
  if (!avisos.length) return null;
  return (
    <div role="alert" className={`space-y-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 ${className}`}>
      {avisos.map((a) => (
        <div key={a.clave} className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-medium">
            <BellRing className="h-4 w-4 shrink-0 text-[#DC2626]" aria-hidden="true" />
            {a.texto}
          </span>
          <Link
            href={a.href}
            className="rounded-lg bg-[#DC2626] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#B91C1C]"
          >
            Ver
          </Link>
        </div>
      ))}
    </div>
  );
}
