import { getEstadoConductor, type EntregaRow } from "@/lib/devengados/data";
import type { DiaCalculado } from "@/lib/devengados/engine";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { PrintButton } from "../../entregas/imprimir/print-button";

/**
 * Enriquece cada día de producción con el pago REAL de ese día (entregas
 * vigentes) y el saldo corriente (liberado acumulado − entregado hasta la
 * fecha). El último saldo es el pendiente por pagar.
 */
function construirCuenta(dias: DiaCalculado[], entregas: EntregaRow[]) {
  const pagoPorDia = new Map<string, number>();
  for (const e of entregas) {
    if (e.movimiento === "DEBITO" && (e.estado ?? "activa") === "activa") {
      pagoPorDia.set(e.fecha, (pagoPorDia.get(e.fecha) ?? 0) + e.valor_entregado);
    }
  }
  const filas: Array<DiaCalculado & { pago: number; saldo: number }> = [];
  let entregadoAcum = 0;
  for (const d of dias) {
    const pago = pagoPorDia.get(d.fecha) ?? 0;
    entregadoAcum += pago;
    filas.push({ ...d, pago, saldo: Math.round((d.liberadoAcum - entregadoAcum) * 100) / 100 });
  }
  // El total suma TODAS las entregas vigentes (incluso si cayeran en un día sin
  // producción, que no tendría renglón propio).
  let totalPago = 0;
  for (const v of pagoPorDia.values()) totalPago += v;
  return { filas, totalPago };
}

export const dynamic = "force-dynamic";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const th = "border border-gray-300 px-1.5 py-1 text-right text-[9px] uppercase tracking-wide";
const thL = "border border-gray-300 px-1.5 py-1 text-left text-[9px] uppercase tracking-wide";
const td = "border border-gray-300 px-1.5 py-1 text-right";
const tdL = "border border-gray-300 px-1.5 py-1";

/**
 * Estado de cuenta imprimible de un conductor en la quincena. Muestra, día a
 * día, producción, base, excedente/(déficit), acumulados, el PAGO real de cada
 * día y el saldo corriente (liberado − entregado). El último saldo es el
 * pendiente por pagar. Es el soporte con el que contabilidad cuadra contra GEMA.
 */
export default async function EstadoCuentaImprimirPage({
  searchParams,
}: {
  searchParams: Promise<{ cedula?: string; fecha?: string }>;
}) {
  const perms = await requireTesoreriaSub("caja");
  const { cedula: cedulaRaw, fecha: fechaRaw } = await searchParams;
  const cedula = (cedulaRaw ?? "").replace(/\D/g, "");
  const fecha =
    fechaRaw && /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)
      ? fechaRaw
      : new Date().toISOString().slice(0, 10);

  if (!cedula) {
    return <div className="p-8 text-sm text-gray-600">Falta la cédula del conductor.</div>;
  }

  const supabase = createAdminClient();
  const [{ data: conductor }, estado] = await Promise.all([
    supabase.from("conductores").select("nombre").eq("cedula", cedula).maybeSingle(),
    getEstadoConductor(cedula, fecha),
  ]);
  const r = estado.resumen;

  const { filas, totalPago } = construirCuenta(r.dias, estado.entregas);

  await logTesoreriaAudit({
    accion: "reporte_generado",
    cedulaConductor: cedula,
    conductorNombre: conductor?.nombre ?? null,
    rol: perms.userType,
    detalle: { tipo: "estado-cuenta", formato: "pdf", fecha },
  });

  const impresoEn = new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-[10px] leading-tight text-gray-900 print:p-0">
      <style>{`@page { margin: 10mm; }`}</style>
      <PrintButton />

      <div className="mb-2 border-b-2 border-gray-800 pb-1">
        <h1 className="text-base font-bold">
          GESTIVO · Tesorería — Estado de cuenta del conductor
        </h1>
        <p className="text-[10px] text-gray-600">
          Conductor: <strong>{conductor?.nombre ?? estado.entregas[0]?.conductor_nombre ?? "—"}</strong>{" "}
          (CC {cedula}) · Quincena <strong>{r.dias[0]?.fecha ? `${estado.quincena.periodo} Q${estado.quincena.quincena}` : "—"}</strong>{" "}
          · Corte <strong>{fecha}</strong> · Base diaria {cop.format(estado.baseDiaria)}
        </p>
        <p className="text-[9px] text-gray-500">
          Generado por: {perms.userEmail ?? "—"} · Impreso: {impresoEn}
        </p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={thL}>Fecha</th>
            <th className={th}>Producción</th>
            <th className={th}>Base</th>
            <th className={th}>Excedente / (déficit)</th>
            <th className={th}>Prod. acum.</th>
            <th className={th}>Liberado acum.</th>
            <th className={th}>Pago (real)</th>
            <th className={th}>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((d) => (
            <tr key={d.fecha}>
              <td className={tdL}>{d.fecha}</td>
              <td className={td}>{cop.format(d.produccion)}</td>
              <td className={td}>{cop.format(d.baseExigida)}</td>
              <td className={`${td} ${d.deficitDia > 0 ? "font-semibold text-red-600" : ""}`}>
                {d.deficitDia > 0 ? `(${cop.format(d.deficitDia)})` : cop.format(d.excedenteDia)}
              </td>
              <td className={td}>{cop.format(d.acumProduccion)}</td>
              <td className={td}>{cop.format(d.liberadoAcum)}</td>
              <td className={`${td} ${d.pago > 0 ? "font-semibold" : ""}`}>
                {d.pago > 0 ? cop.format(d.pago) : "—"}
              </td>
              <td className={`${td} ${d.saldo > 0 ? "font-semibold" : ""}`}>{cop.format(d.saldo)}</td>
            </tr>
          ))}
          {filas.length === 0 && (
            <tr>
              <td className={`${tdL} text-center`} colSpan={8}>
                Sin producción registrada en la quincena.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-gray-100 font-bold">
            <td className={tdL}>Total</td>
            <td className={td}>{cop.format(r.produccionAcum)}</td>
            <td className={td}>{cop.format(r.baseAcum)}</td>
            <td className={td}>{cop.format(r.excedenteAcum)}</td>
            <td className={td}></td>
            <td className={td}></td>
            <td className={td}>{cop.format(totalPago)}</td>
            <td className={td}>{cop.format(r.disponible)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-2 text-[9px] text-gray-500">
        Saldo = liberado acumulado − entregado hasta la fecha. El saldo del último día es el
        <strong> pendiente por pagar</strong> ({cop.format(r.disponible)}). Un déficit de un día
        reduce el excedente liberado (se refleja en la caída del «Liberado acum.»).
      </p>

      <div className="mt-10 grid grid-cols-2 gap-12">
        <div className="border-t border-gray-400 pt-1 text-center text-xs text-gray-600">
          Firma cajero
        </div>
        <div className="border-t border-gray-400 pt-1 text-center text-xs text-gray-600">
          Firma quien recibe
        </div>
      </div>
    </div>
  );
}
