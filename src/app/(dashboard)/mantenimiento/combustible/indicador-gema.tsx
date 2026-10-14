import { CAUSA_CONCILIACION_LABEL, type CausaConciliacion, type ConciliacionGema } from "@/lib/mantenimiento/combustible-conciliacion";
import { cop, entero, fechaCorta } from "@/lib/financiera/formato";

const listaDias = (dias: string[]) =>
  dias.length <= 3 ? dias.map(fechaCorta).join(", ") : `${dias.length} días (${fechaCorta(dias[0])} a ${fechaCorta(dias[dias.length - 1])})`;

/**
 * Cruce de los tanqueos del proveedor con el combustible que descuenta el
 * cierre de GEMA (ingreso_tercero), por bus y día. `compacto` es la versión de
 * la tabla de últimas cargas: solo el semáforo y, si hay diferencias, la lista
 * plegada.
 */
export function IndicadorGema({ c, compacto = false }: { c: ConciliacionGema | null | undefined; compacto?: boolean }) {
  if (!c) return compacto ? <span className="text-xs text-gray-400">—</span> : null;
  const pendiente = c.diasSinLiquidar.length > 0 && (
    <span className="text-xs text-gray-500">GEMA aún no liquida {listaDias(c.diasSinLiquidar)}.</span>
  );
  const chip = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium";

  let semaforo;
  if (c.estado === "sin_liquidar") {
    semaforo = <span className={`${chip} border-gray-200 bg-gray-50 text-gray-600`}>Sin cierre de GEMA aún</span>;
  } else if (c.estado === "cuadra") {
    semaforo = <span className={`${chip} border-emerald-200 bg-emerald-50 text-emerald-800`}>Cuadra con GEMA · {entero(c.cuadran)} buses-día</span>;
  } else if (Math.abs(c.diferencia) < 1) {
    semaforo = (
      <span className={`${chip} border-amber-200 bg-amber-50 text-amber-800`}>
        Total igual; {entero(c.busesDia - c.cuadran)} buses-día se compensan
      </span>
    );
  } else {
    semaforo = (
      <span className={`${chip} border-amber-200 bg-amber-50 text-amber-800`}>
        Diferencia {cop(c.diferencia)} · {entero(c.busesDia - c.cuadran)} de {entero(c.busesDia)} buses-día
      </span>
    );
  }

  const detalle = c.diferencias.length > 0 && (
    <details className="text-xs">
      <summary className="cursor-pointer text-gray-700">Ver diferencias</summary>
      <ul className="mt-1 space-y-0.5 text-gray-600">
        {c.diferencias.map((d) => (
          <li key={`${d.fecha}|${d.bus}`} className="tabular-nums">
            {fechaCorta(d.fecha)} · bus {d.bus}: proveedor {cop(d.petromil)}, GEMA {cop(d.gema)} ({cop(d.diferencia)}) — {CAUSA_CONCILIACION_LABEL[d.causa]}
          </li>
        ))}
      </ul>
    </details>
  );

  if (compacto) {
    return (
      <div className="flex min-w-[220px] flex-col items-start gap-1">
        {semaforo}
        {pendiente}
        {detalle}
      </div>
    );
  }

  const causas = Object.entries(c.porCausa) as [CausaConciliacion, { n: number; valor: number }][];
  return (
    <div className="space-y-2 rounded-lg border border-[#E2E8F0] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-700">Cierre de GEMA (ingreso_tercero)</span>
        {semaforo}
      </div>
      {c.estado !== "sin_liquidar" && (
        <div className="text-xs text-gray-600 tabular-nums">
          Días comparados: {listaDias(c.diasComparados)} · Proveedor {cop(c.petromil)} · GEMA {cop(c.gema)}
        </div>
      )}
      {pendiente}
      {causas.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {causas.map(([causa, x]) => (
            <span key={causa} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
              {CAUSA_CONCILIACION_LABEL[causa]}: <strong>{x.n}</strong> ({cop(x.valor)})
            </span>
          ))}
        </div>
      )}
      {detalle}
    </div>
  );
}
