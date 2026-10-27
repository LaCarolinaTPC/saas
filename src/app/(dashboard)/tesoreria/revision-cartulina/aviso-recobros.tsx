import Link from "next/link";
import { BellRing } from "lucide-react";
import { filtroDeAlarma, textoAlarma, type Alarma } from "@/lib/tesoreria/recobros-camaras";

/**
 * Aviso de lo pendiente en las solicitudes a cámaras: respuestas que cartulina
 * no ha visto, recobros abiertos en caja (y cuántos con la gestión vencida) e
 * incobrables por autorizar. Llega a la lista ya filtrada por lo que más
 * urge. Sin nada pendiente (o sin migración) no se pinta. Quien lo pinta pasa
 * solo lo que le toca a ese usuario (alarmaPara).
 */
export function AvisoRecobros({ alarma, className = "" }: { alarma: Alarma | null; className?: string }) {
  const texto = alarma ? textoAlarma(alarma) : null;
  if (!alarma || !texto) return null;
  return (
    <div role="alert" className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 ${className}`}>
      <span className="inline-flex items-center gap-2 font-medium">
        <BellRing className="h-4 w-4 shrink-0 text-[#DC2626]" aria-hidden="true" />
        {texto}
      </span>
      <Link
        href={`/tesoreria/revision-cartulina/solicitudes-camaras?etapa=${filtroDeAlarma(alarma)}`}
        className="rounded-lg bg-[#DC2626] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#B91C1C]"
      >
        Ver solicitudes
      </Link>
    </div>
  );
}

/**
 * Total que se pinta en la pestaña: lo que alguien tiene que atender. Los
 * incobrables por autorizar ya son recobros abiertos; solo suman para quien
 * no ve lo abierto (la directora sin caja ni cartulina).
 */
export const totalAlarma = (a: Alarma | null) => (a ? a.sinVer + Math.max(a.porCobrar, a.porAutorizar) : 0);
