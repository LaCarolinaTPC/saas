import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getCambiosPendientesConductor } from "@/lib/gema/cambios-cierres-datos";
import { resumirCambios } from "@/lib/gema/cambios-cierres";
import { CAMPO_ETIQUETA, TIPO_CAMBIO, formatoValor, pesos } from "@/lib/gema/cambios-cierres-formato";
import type { CampoVigilado } from "@/lib/gema/cambios-cierres";

/**
 * Aviso de Liquidación: GEMA cambió cierres de este conductor en el rango
 * consultado después de sincronizados, y nadie lo ha revisado todavía. La
 * liquidación ya muestra los valores nuevos; aquí va el antes para explicarle
 * la diferencia al conductor. La página que lo usa ya verificó el permiso.
 */
export async function AvisoCambiosGema({
  codigo,
  ini,
  fin,
  verDetalle,
}: {
  codigo: string | null;
  ini: string;
  fin: string;
  /** Mostrar el enlace a Tesorería › Parámetros. */
  verDetalle: boolean;
}) {
  if (!codigo) return null;
  const cambios = await getCambiosPendientesConductor(codigo, ini, fin).catch(() => []);
  if (cambios.length === 0) return null;
  const r = resumirCambios(cambios);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex items-start gap-2 font-medium">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        GEMA cambió {r.cierres} {r.cierres === 1 ? "cierre" : "cierres"} de este conductor en el rango después de
        sincronizados · diferencia en salario neto {pesos(r.deltaNeto, true)}
      </p>
      <ul className="mt-2 space-y-1 pl-6 text-xs">
        {cambios.slice(0, 15).map((c) => (
          <li key={c.id}>
            <span className="font-medium">{c.fecha}</span>
            {c.ruta ? ` · ruta ${c.ruta}` : ""} · {TIPO_CAMBIO[c.tipo].texto.toLowerCase()}:{" "}
            {(Object.entries(c.cambios) as [CampoVigilado, [number | null, number | null]][])
              .map(([campo, [a, b]]) => `${CAMPO_ETIQUETA[campo]} ${formatoValor(campo, a)} → ${formatoValor(campo, b)}`)
              .join(" · ")}
          </li>
        ))}
        {cambios.length > 15 && <li>… y {cambios.length - 15} más</li>}
      </ul>
      <p className="mt-2 pl-6 text-xs text-amber-800">
        La liquidación ya usa los valores nuevos de GEMA.
        {verDetalle && (
          <>
            {" "}
            <Link href="/tesoreria/devengados/parametros" className="font-medium underline">
              Revisar en Parámetros
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
