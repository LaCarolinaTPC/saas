import Link from "next/link";
import { BellRing } from "lucide-react";
import type { Aviso, ItemPorGestionar } from "@/lib/tesoreria/recobros-vista";

const nf = new Intl.NumberFormat("es-CO");
/** Filas de la lista de Caja antes de «y N más». */
const MAX_LISTA = 8;

/**
 * Lo que este usuario tiene que atender en Recobros, según su rol: por
 * gestionar (caja, con la lista de recobros), decide subgerencia, plazo vencido (Operativo),
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
          {a.detalle && a.detalle.length > 0 && <ListaPorGestionar items={a.detalle} />}
        </div>
      ))}
    </div>
  );
}

/** Los recobros por gestionar de Caja, el más antiguo primero. */
function ListaPorGestionar({ items }: { items: readonly ItemPorGestionar[] }) {
  const resto = items.length - MAX_LISTA;
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-red-100 bg-white">
      <table className="w-full min-w-[480px] text-xs text-gray-700">
        <thead>
          <tr className="border-b border-red-100 text-left text-[11px] uppercase tracking-wide text-gray-400">
            <th className="px-2 py-1.5">Buseta</th>
            <th className="px-2 py-1.5">Viaje</th>
            <th className="px-2 py-1.5">Fecha</th>
            <th className="px-2 py-1.5 text-right">Diferencia</th>
            <th className="px-2 py-1.5 text-right">Saldo</th>
            <th className="px-2 py-1.5 text-right">Días pendiente</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, MAX_LISTA).map((i) => (
            <tr key={i.id} className="border-b border-slate-50 last:border-0">
              <td className="px-2 py-1.5 font-medium text-gray-900">{i.vehiculoCodigo ?? "—"}</td>
              <td className="px-2 py-1.5 tabular-nums">
                {i.numero}
                {i.nota && <div className="text-[11px] font-medium text-amber-700">{i.nota}</div>}
              </td>
              <td className="px-2 py-1.5 tabular-nums">{i.fechaViaje}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{i.diferencia ?? "—"}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">${nf.format(i.saldo)}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${i.dias > 2 ? "font-semibold text-red-700" : ""}`}>{i.dias}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {resto > 0 && <p className="px-2 py-1.5 text-xs text-gray-500">y {resto} más en Recobros.</p>}
    </div>
  );
}
