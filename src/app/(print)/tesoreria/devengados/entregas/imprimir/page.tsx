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
  novedad: "Soporte de novedad de caja — pagos entregados sin registrar",
};

// Densidad máxima por hoja (ahorro de papelería): celdas compactas y
// tipografía pequeña pero legible.
const th = "border border-gray-300 px-1.5 py-0.5 text-left text-[9px] uppercase tracking-wide";
const td = "border border-gray-300 px-1.5 py-0.5";
const tdR = "border border-gray-300 px-1.5 py-0.5 text-right";

export default async function ImprimirPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; fecha?: string; cajero?: string }>;
}) {
  const perms = await requireTesoreriaSub("entregas");
  const { tipo: tipoRaw, fecha: fechaRaw, cajero: cajeroRaw } = await searchParams;
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

  // Soporte de novedad: pagos que el cajero entregó ese día y no alcanzó a
  // registrar, regularizados después con el registro extemporáneo.
  const novedades = cajeroRaw
    ? entregas.filter(
        (e) =>
          e.aprobada_por === cajeroRaw &&
          e.extemporanea &&
          e.movimiento === "DEBITO" &&
          e.estado === "activa"
      )
    : [];
  const totalNovedades = novedades.reduce((s, e) => s + e.valor_entregado, 0);
  const cajeroNovedad = cajeroRaw ? nombreCajero(cajeroRaw) : "—";

  await logTesoreriaAudit({
    accion: "reporte_generado",
    rol: perms.userType,
    detalle: { tipo, formato: "pdf", fecha },
  });

  // Fecha/hora de impresión (momento en que se abre el reporte, Bogotá).
  const impresoEn = new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "short",
  });

  // Encabezado que se REPITE en cada página impresa: al ir dentro del
  // <thead> (display: table-header-group) se imprime en el tope de cada hoja.
  const encabezadoPagina = (cols: number) => (
    <tr>
      <th colSpan={cols} className="border-0 p-0">
        <div className="mb-1 flex items-end justify-between border-b-2 border-gray-800 pb-1">
          <span className="text-[11px] font-bold text-gray-900">
            GESTIVO · Tesorería — {TITULOS[tipo]}
          </span>
          <span className="text-[9px] font-normal text-gray-500">
            Fecha del reporte: {fecha} · Impreso: {impresoEn}
          </span>
        </div>
      </th>
    </tr>
  );

  const firmas = (
    <div className="mt-8 grid grid-cols-2 gap-12">
      <div className="border-t border-gray-400 pt-1 text-center text-xs text-gray-600">
        Firma cajero
      </div>
      <div className="border-t border-gray-400 pt-1 text-center text-xs text-gray-600">
        Firma supervisor
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl bg-white p-8 text-[10px] leading-tight text-gray-900 print:p-0">
      {/* Márgenes mínimos y encabezado de tabla repetido en cada hoja */}
      <style>{`
        @page { margin: 8mm; }
        @media print {
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
      `}</style>
      <PrintButton />

      {/* Bloque de portada: en pantalla siempre; en impresión el título va
          en el encabezado repetido de cada página (thead), así que aquí solo
          se imprime el resumen una vez. */}
      <div className="mb-2 border-b-2 border-gray-800 pb-1 print:hidden">
        <h1 className="text-base font-bold">GESTIVO · Tesorería — {TITULOS[tipo]}</h1>
        {tipo === "novedad" ? (
          <p className="text-[10px] text-gray-600">
            Cajero: <strong>{cajeroNovedad}</strong> · Cierre del <strong>{fecha}</strong> ·
            Generado por: {perms.userEmail ?? "—"}
          </p>
        ) : (
          <p className="text-[10px] text-gray-600">
            Fecha: <strong>{fecha}</strong> · Generado por: {perms.userEmail ?? "—"} · Pagos:{" "}
            {pagos.length} · Total pagado: {cop.format(totalPagado)} · Devoluciones:{" "}
            {cop.format(totalDevoluciones)} · Neto: {cop.format(totalPagado - totalDevoluciones)}
          </p>
        )}
      </div>
      {tipo !== "novedad" && (
        <p className="mb-2 hidden text-[10px] text-gray-600 print:block">
          Generado por: {perms.userEmail ?? "—"} · Pagos: {pagos.length} · Total pagado:{" "}
          {cop.format(totalPagado)} · Devoluciones: {cop.format(totalDevoluciones)} · Neto:{" "}
          {cop.format(totalPagado - totalDevoluciones)}
        </p>
      )}

      {tipo === "cierre" && (
        <>
          <table className="w-full border-collapse">
            <thead>
              {encabezadoPagina(8)}
              <tr>
                <th className={th}>Cajero</th>
                <th className={th}>Fecha</th>
                <th className={th}>Hora inicio</th>
                <th className={th}>Hora fin</th>
                <th className={th}>Cant. pagos</th>
                <th className={th}>Valor total pagado</th>
                <th className={th}>Total devoluciones</th>
                <th className={th}>Valor neto</th>
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
              {encabezadoPagina(7)}
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
                    {e.extemporanea && (
                      <span className="ml-1 text-[9px] text-amber-700">(EXTEMPORÁNEA)</span>
                    )}
                  </td>
                  <td className={tdR}>{e.saldo_antes != null ? cop.format(e.saldo_antes) : "—"}</td>
                  <td className={tdR}>{cop.format(e.valor_entregado)}</td>
                  <td className={tdR}>
                    {e.saldo_despues != null ? cop.format(e.saldo_despues) : "—"}
                  </td>
                  <td className={`${td} h-6 w-36`}></td>
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
              {encabezadoPagina(12)}
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
                    {e.extemporanea && (
                      <span className="ml-1 text-[9px] text-amber-700">(EXTEMPORÁNEA)</span>
                    )}
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
              {encabezadoPagina(9)}
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

      {tipo === "novedad" && (
        <>
          <p className="mb-3 text-[10px] leading-snug text-gray-700">
            Se deja constancia de que el cajero <strong>{cajeroNovedad}</strong> entregó en
            efectivo, el <strong>{fecha}</strong>, los valores de Otros Devengados que se
            relacionan a continuación, sin alcanzar a registrarlos en Gestivo ese mismo día. Esa
            omisión produjo un faltante aparente en su cuadre de caja. Los pagos fueron
            regularizados mediante registro extemporáneo, conservando la fecha contable original
            del {fecha} y quedando acreditados a su nombre.
          </p>
          <table className="w-full border-collapse">
            <thead>
              {encabezadoPagina(7)}
              <tr>
                <th className={th}>Código</th>
                <th className={th}>Cédula</th>
                <th className={th}>Nombres y apellidos</th>
                <th className={th}>Valor entregado</th>
                <th className={th}>Motivo de la novedad</th>
                <th className={th}>Registrado por</th>
                <th className={th}>Fecha y hora del registro</th>
              </tr>
            </thead>
            <tbody>
              {novedades.map((e) => (
                <tr key={e.id}>
                  <td className={td}>{e.codigo_conductor ?? "—"}</td>
                  <td className={td}>{e.cedula_conductor}</td>
                  <td className={td}>{e.conductor_nombre ?? "—"}</td>
                  <td className={tdR}>{cop.format(e.valor_entregado)}</td>
                  <td className={td}>{e.registro_motivo ?? "—"}</td>
                  <td className={td}>{e.registrada_por_email ?? "—"}</td>
                  <td className={td}>
                    {e.registro_at
                      ? new Date(e.registro_at).toLocaleString("es-CO", {
                          timeZone: "America/Bogota",
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
              {novedades.length === 0 && (
                <tr>
                  <td className={td} colSpan={7}>
                    {cajeroRaw
                      ? `Sin registros extemporáneos de este cajero el ${fecha}.`
                      : "Selecciona el cajero para generar el soporte."}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td className={`${td} font-bold`} colSpan={3}>
                  TOTAL REGULARIZADO · {novedades.length} pago(s)
                </td>
                <td className={`${tdR} font-bold`}>{cop.format(totalNovedades)}</td>
                <td className={td} colSpan={3}></td>
              </tr>
            </tfoot>
          </table>

          {/* El sistema no conoce el efectivo contado: el faltante reportado y
              la diferencia se diligencian a mano al legalizar la novedad. */}
          <table className="mt-4 w-1/2 border-collapse">
            <tbody>
              <tr>
                <td className={td}>Faltante reportado en el cuadre del día</td>
                <td className={`${tdR} w-32`}></td>
              </tr>
              <tr>
                <td className={td}>Total regularizado (este soporte)</td>
                <td className={`${tdR} font-bold`}>{cop.format(totalNovedades)}</td>
              </tr>
              <tr>
                <td className={`${td} font-bold`}>Diferencia pendiente</td>
                <td className={`${tdR} w-32`}></td>
              </tr>
            </tbody>
          </table>

          <div className="mt-10 grid grid-cols-3 gap-8">
            <div className="border-t border-gray-400 pt-1 text-center text-[10px] text-gray-600">
              Cajero
              <br />
              {cajeroNovedad}
            </div>
            <div className="border-t border-gray-400 pt-1 text-center text-[10px] text-gray-600">
              Quien registró
              <br />
              {novedades[0]?.registrada_por_email ?? "—"}
            </div>
            <div className="border-t border-gray-400 pt-1 text-center text-[10px] text-gray-600">
              Jefe de Tesorería
            </div>
          </div>
        </>
      )}

      {tipo !== "novedad" && (
      <p className="mt-6 text-[10px] text-gray-400">
        Acumulado del período (quincena) al {fecha}:{" "}
        {cop.format(Object.values(acumQuincena).reduce((s, v) => s + v, 0))} en{" "}
        {Object.keys(acumQuincena).length} conductores.
      </p>
      )}
    </div>
  );
}
