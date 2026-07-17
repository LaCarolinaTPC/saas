import { getDatosEntregasDia, type EntregaRow } from "@/lib/devengados/data";
import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { logTesoreriaAudit } from "@/lib/devengados/audit";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function horaBogota(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TITULOS: Record<string, string> = {
  cierre: "Cierre de caja",
  diario: "Reporte diario de entrega de Otros Devengados",
  entregado: "Entregado del día (detallado y consolidado)",
};

const th = "border border-gray-300 px-2 py-1 text-left text-[11px] uppercase tracking-wide";
const td = "border border-gray-300 px-2 py-1";
const tdR = "border border-gray-300 px-2 py-1 text-right";

export default async function ImprimirPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; fecha?: string }>;
}) {
  const perms = await requireTesoreriaSub("entregas");
  const { tipo: tipoRaw, fecha: fechaRaw } = await searchParams;
  const tipo = tipoRaw && tipoRaw in TITULOS ? tipoRaw : "entregado";
  const fecha =
    fechaRaw && /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)
      ? fechaRaw
      : new Date().toISOString().slice(0, 10);

  const { entregas, cajeros, acumQuincena } = await getDatosEntregasDia(fecha);
  const nombreCajero = (id: string | null) =>
    (id && (cajeros[id]?.nombre || cajeros[id]?.email)) || "—";

  const pagos = entregas.filter((e) => e.movimiento === "DEBITO");
  const reversos = entregas.filter((e) => e.movimiento === "CREDITO");
  const totalPagado = pagos.reduce((s, e) => s + e.valor_entregado, 0);
  const totalDevoluciones = reversos.reduce((s, e) => s + e.valor_entregado, 0);

  type FilaCajero = {
    cajero: string;
    pagos: number;
    valorTotal: number;
    devoluciones: number;
    conductores: Set<string>;
    horaInicio: string | null;
    horaFin: string | null;
  };
  const porCajero = new Map<string, FilaCajero>();
  for (const e of entregas) {
    const id = e.aprobada_por ?? "—";
    let f = porCajero.get(id);
    if (!f) {
      f = {
        cajero: nombreCajero(e.aprobada_por),
        pagos: 0,
        valorTotal: 0,
        devoluciones: 0,
        conductores: new Set(),
        horaInicio: null,
        horaFin: null,
      };
      porCajero.set(id, f);
    }
    if (e.movimiento === "DEBITO") {
      f.pagos += 1;
      f.valorTotal += e.valor_entregado;
      f.conductores.add(e.cedula_conductor);
    } else {
      f.devoluciones += e.valor_entregado;
    }
    if (!f.horaInicio || e.created_at < f.horaInicio) f.horaInicio = e.created_at;
    if (!f.horaFin || e.created_at > f.horaFin) f.horaFin = e.created_at;
  }
  const consolidado = [...porCajero.values()];

  await logTesoreriaAudit({
    accion: "reporte_generado",
    rol: perms.userType,
    detalle: { tipo, formato: "pdf", fecha },
  });

  const firmas = (
    <div className="mt-12 grid grid-cols-2 gap-12">
      <div className="border-t border-gray-400 pt-1 text-center text-xs text-gray-600">
        Firma cajero
      </div>
      <div className="border-t border-gray-400 pt-1 text-center text-xs text-gray-600">
        Firma supervisor
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl bg-white p-8 text-[12px] text-gray-900 print:p-0">
      <PrintButton />

      <div className="mb-4 border-b-2 border-gray-800 pb-2">
        <h1 className="text-lg font-bold">GESTIVO · Tesorería — {TITULOS[tipo]}</h1>
        <p className="text-xs text-gray-600">
          Fecha: <strong>{fecha}</strong> · Generado por: {perms.userEmail ?? "—"} · Pagos:{" "}
          {pagos.length} · Total pagado: {cop.format(totalPagado)} · Devoluciones:{" "}
          {cop.format(totalDevoluciones)} · Neto: {cop.format(totalPagado - totalDevoluciones)}
        </p>
      </div>

      {tipo === "cierre" && (
        <>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Cajero</th>
                <th className={th}>Fecha</th>
                <th className={th}>Hora inicio</th>
                <th className={th}>Hora fin</th>
                <th className={th}>Cant. pagos</th>
                <th className={th}>Valor total pagado</th>
                <th className={th}>Total devoluciones</th>
                <th className={th}>Valor neto</th>
                <th className={th}>Firma cajero</th>
                <th className={th}>Firma supervisor</th>
              </tr>
            </thead>
            <tbody>
              {consolidado.map((f) => (
                <tr key={f.cajero}>
                  <td className={td}>{f.cajero}</td>
                  <td className={td}>{fecha}</td>
                  <td className={td}>{horaBogota(f.horaInicio)}</td>
                  <td className={td}>{horaBogota(f.horaFin)}</td>
                  <td className={tdR}>{f.pagos}</td>
                  <td className={tdR}>{cop.format(f.valorTotal)}</td>
                  <td className={tdR}>{cop.format(f.devoluciones)}</td>
                  <td className={tdR}>{cop.format(f.valorTotal - f.devoluciones)}</td>
                  <td className={`${td} w-28`}></td>
                  <td className={`${td} w-28`}></td>
                </tr>
              ))}
            </tbody>
          </table>
          {firmas}
        </>
      )}

      {tipo === "diario" && (
        <>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Código</th>
                <th className={th}>Cédula</th>
                <th className={th}>Nombres y apellidos</th>
                <th className={th}>Saldo antes</th>
                <th className={th}>Abono recibido</th>
                <th className={th}>Saldo después</th>
                <th className={th}>Firma</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((e: EntregaRow) => (
                <tr key={e.id}>
                  <td className={td}>{e.codigo_conductor ?? "—"}</td>
                  <td className={td}>{e.cedula_conductor}</td>
                  <td className={td}>
                    {e.conductor_nombre ?? "—"}
                    {e.estado === "devuelta" && (
                      <span className="ml-1 text-[10px] text-red-600">(DEVUELTO)</span>
                    )}
                  </td>
                  <td className={tdR}>{e.saldo_antes != null ? cop.format(e.saldo_antes) : "—"}</td>
                  <td className={tdR}>{cop.format(e.valor_entregado)}</td>
                  <td className={tdR}>
                    {e.saldo_despues != null ? cop.format(e.saldo_despues) : "—"}
                  </td>
                  <td className={`${td} w-36`}></td>
                </tr>
              ))}
              {pagos.length === 0 && (
                <tr>
                  <td className={td} colSpan={7}>
                    Sin pagos registrados el {fecha}.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${td} font-bold`} colSpan={4}>
                  TOTALES · Pagos: {pagos.length} · Devoluciones: {cop.format(totalDevoluciones)}
                </td>
                <td className={`${tdR} font-bold`}>{cop.format(totalPagado)}</td>
                <td className={td} colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
          {firmas}
        </>
      )}

      {tipo === "entregado" && (
        <>
          <h2 className="mb-2 mt-2 text-sm font-bold">Detallado</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Fecha</th>
                <th className={th}>Hora</th>
                <th className={th}>Código</th>
                <th className={th}>Cédula</th>
                <th className={th}>Nombre</th>
                <th className={th}>Cajero</th>
                <th className={th}>Valor</th>
                <th className={th}>Comprobante</th>
                <th className={th}>Estado</th>
                <th className={th}>Observaciones</th>
                <th className={th}>Motivo devolución</th>
                <th className={th}>Autorizó 2.º pago</th>
              </tr>
            </thead>
            <tbody>
              {entregas.map((e) => (
                <tr key={e.id}>
                  <td className={td}>{e.fecha}</td>
                  <td className={td}>{horaBogota(e.created_at)}</td>
                  <td className={td}>{e.codigo_conductor ?? "—"}</td>
                  <td className={td}>{e.cedula_conductor}</td>
                  <td className={td}>{e.conductor_nombre ?? "—"}</td>
                  <td className={td}>{nombreCajero(e.aprobada_por)}</td>
                  <td className={tdR}>
                    {e.movimiento === "CREDITO" ? "−" : ""}
                    {cop.format(e.valor_entregado)}
                  </td>
                  <td className={`${td} text-[10px]`}>{e.id.slice(0, 8)}</td>
                  <td className={td}>
                    {e.estado === "activa" ? "Pagado" : e.estado === "devuelta" ? "Devuelto" : "Reverso"}
                  </td>
                  <td className={td}>{e.observacion ?? "—"}</td>
                  <td className={td}>{e.devolucion_motivo ?? "—"}</td>
                  <td className={td}>{e.autorizado_por ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mb-2 mt-6 text-sm font-bold">Consolidado por cajero</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Cajero</th>
                <th className={th}>Cant. pagos</th>
                <th className={th}>Valor total</th>
                <th className={th}>Devoluciones</th>
                <th className={th}>Valor neto</th>
                <th className={th}>Conductores</th>
                <th className={th}>Apertura</th>
                <th className={th}>Cierre</th>
                <th className={th}>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {consolidado.map((f) => (
                <tr key={f.cajero}>
                  <td className={td}>{f.cajero}</td>
                  <td className={tdR}>{f.pagos}</td>
                  <td className={tdR}>{cop.format(f.valorTotal)}</td>
                  <td className={tdR}>{cop.format(f.devoluciones)}</td>
                  <td className={tdR}>{cop.format(f.valorTotal - f.devoluciones)}</td>
                  <td className={tdR}>{f.conductores.size}</td>
                  <td className={td}>{horaBogota(f.horaInicio)}</td>
                  <td className={td}>{horaBogota(f.horaFin)}</td>
                  <td className={`${td} w-32`}></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${td} font-bold`}>TOTAL GENERAL</td>
                <td className={`${tdR} font-bold`}>{pagos.length}</td>
                <td className={`${tdR} font-bold`}>{cop.format(totalPagado)}</td>
                <td className={`${tdR} font-bold`}>{cop.format(totalDevoluciones)}</td>
                <td className={`${tdR} font-bold`}>
                  {cop.format(totalPagado - totalDevoluciones)}
                </td>
                <td className={tdR}>
                  {new Set(pagos.map((p) => p.cedula_conductor)).size}
                </td>
                <td className={td} colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
          {firmas}
        </>
      )}

      <p className="mt-6 text-[10px] text-gray-400">
        Acumulado del período (quincena) al {fecha}:{" "}
        {cop.format(Object.values(acumQuincena).reduce((s, v) => s + v, 0))} en{" "}
        {Object.keys(acumQuincena).length} conductores.
      </p>
    </div>
  );
}
