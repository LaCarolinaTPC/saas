"use client";

// Tabla detallada de vehículos, compartida por las pantallas analíticas.
import { useState } from "react";
import { nivelSemaforo, type ParametroSemaforo, type VistaRentabilidad } from "@/lib/financiera/motor";
import { tieneTimbradas, valoresVista, vistaPrincipal, type VehiculoAcumulado } from "@/lib/financiera/analisis";
import { cop, decimal, entero } from "@/lib/financiera/formato";
import type { Salvedad } from "@/lib/financiera/salvedades";
import { ChipSemaforo, Pct, Pesos } from "./ui";

type ColumnaOrden = "codigo" | "viajes" | "utilidad" | "rentabilidad" | "gasto_timbrada" | "productividad";
type Direccion = "asc" | "desc";

export function TablaVehiculos({
  vehiculos,
  vista,
  parametros,
  /** Columna por la que se ordena de entrada. */
  orden = "rentabilidad",
  salvedades = [],
}: {
  vehiculos: VehiculoAcumulado[];
  vista: VistaRentabilidad;
  parametros: { rentabilidad: ParametroSemaforo; gasto_timbrada: ParametroSemaforo; productividad: ParametroSemaforo };
  orden?: ColumnaOrden;
  /** Las del rango: marcan al vehículo junto a su código. */
  salvedades?: readonly Salvedad[];
}) {
  const [ordenActual, setOrdenActual] = useState<ColumnaOrden>(orden);
  const [direccion, setDireccion] = useState<Direccion>(orden === "gasto_timbrada" ? "desc" : "asc");
  const principal = vistaPrincipal(vista);
  const ambas = vista === "ambas";
  const filas = [...vehiculos].sort((a, b) => {
    const va = valoresVista(a.indicadores, principal);
    const vb = valoresVista(b.indicadores, principal);
    let diferencia: number;
    switch (ordenActual) {
      case "viajes": diferencia = a.viajes - b.viajes; break;
      case "utilidad": diferencia = va.utilidad - vb.utilidad; break;
      case "gasto_timbrada": diferencia = va.gastosPorTimbrada - vb.gastosPorTimbrada; break;
      case "productividad": diferencia = a.productividad - b.productividad; break;
      case "codigo": diferencia = a.codigoVehiculo.localeCompare(b.codigoVehiculo, "es", { numeric: true }); break;
      default: diferencia = va.rentabilidad - vb.rentabilidad;
    }
    return (direccion === "asc" ? diferencia : -diferencia) || a.codigoVehiculo.localeCompare(b.codigoVehiculo, "es", { numeric: true });
  });
  const encabezado = (columna: ColumnaOrden, etiqueta: string, derecha = false) => (
    <th scope="col" aria-sort={ordenActual === columna ? (direccion === "asc" ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-3 py-2 ${derecha ? "text-right" : ""}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-gray-900 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500" onClick={() => {
        if (ordenActual === columna) setDireccion(direccion === "asc" ? "desc" : "asc");
        else { setOrdenActual(columna); setDireccion("asc"); }
      }} title={`Ordenar por ${etiqueta} ${ordenActual === columna && direccion === "asc" ? "descendente" : "ascendente"}`}>
        {etiqueta}<span aria-hidden="true" className="text-[10px]">{ordenActual === columna ? (direccion === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
      <table className="w-full text-sm">
        <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            {encabezado("codigo", "Vehículo")}
            <th className="whitespace-nowrap px-3 py-2">Propietario</th>
            <th className="whitespace-nowrap px-3 py-2">Flota</th>
            <th className="whitespace-nowrap px-3 py-2 text-right">Meses</th>
            {encabezado("viajes", "Viajes", true)}
            <th className="whitespace-nowrap px-3 py-2 text-right">Timbradas</th>
            <th className="whitespace-nowrap px-3 py-2 text-right">Ingresos</th>
            <th className="whitespace-nowrap px-3 py-2 text-right">Gastos</th>
            {encabezado("utilidad", "Utilidad", true)}
            {ambas && <th className="whitespace-nowrap px-3 py-2 text-right">Utilidad desp. fin.</th>}
            {encabezado("rentabilidad", "Rentabilidad", true)}
            {ambas && <th className="whitespace-nowrap px-3 py-2 text-right">Rent. desp. fin.</th>}
            {encabezado("gasto_timbrada", "Gasto / timbrada", true)}
            {encabezado("productividad", "Viajes / mes", true)}
            <th className="whitespace-nowrap px-3 py-2">Semáforo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F1F5F9]">
          {filas.length === 0 && (
            <tr>
              <td colSpan={ambas ? 15 : 13} className="px-4 py-8 text-center text-sm text-gray-500">
                No hay vehículos en el rango elegido.
              </td>
            </tr>
          )}
          {filas.map((v) => {
            const val = valoresVista(v.indicadores, principal);
            const fin = valoresVista(v.indicadores, "financiero");
            const techo = !v.tieneContable;
            return (
              <tr key={v.codigoVehiculo} className="hover:bg-[#F8FAFC]">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                  {v.codigoVehiculo}
                  {v.placa && <span className="ml-1.5 font-mono text-xs text-gray-400">{v.placa}</span>}
                  {v.mesesSoloContable > 0 && <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] text-amber-800" title={`${v.mesesSoloContable} mes(es) con costo contable y sin operación en GEMA`}>solo contable</span>}
                  {v.vehiculoActivo === false && <span className="ml-1.5 rounded bg-gray-100 px-1 text-[10px] text-gray-500">retirado</span>}
                  {salvedades
                    .filter((s) => s.codigoVehiculo === v.codigoVehiculo)
                    .map((s) => (
                      <span key={s.desde} className="ml-1.5 rounded bg-sky-100 px-1 text-[10px] text-sky-800" title={`${s.titulo}. ${s.texto}`}>
                        {s.etiqueta}
                      </span>
                    ))}
                </td>
                <td className="max-w-[220px] truncate px-3 py-2 text-gray-700" title={v.propietarioNombre}>{v.propietarioNombre}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">{v.tipoPropietario}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" title={`${v.mesesConContable} con archivo contable`}>
                  {v.meses}
                  {!v.tieneContable && <span className="ml-1 text-amber-600" title="Faltan meses con archivo contable">*</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{entero(v.viajes)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{entero(v.timbradas)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(v.ingresos)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{cop(val.gastos)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right"><Pesos valor={val.utilidad} techo={techo} /></td>
                {ambas && <td className="whitespace-nowrap px-3 py-2 text-right"><Pesos valor={fin.utilidad} techo={techo} /></td>}
                <td className="whitespace-nowrap px-3 py-2 text-right"><Pct valor={val.rentabilidad} techo={techo} /></td>
                {ambas && <td className="whitespace-nowrap px-3 py-2 text-right"><Pct valor={fin.rentabilidad} techo={techo} /></td>}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums" title={techo ? "Falta el archivo contable: es un piso." : undefined}>
                  {tieneTimbradas(v) ? (
                    <span className={techo ? "text-gray-400" : ""}>{techo ? "≥ " : ""}{cop(val.gastosPorTimbrada)}</span>
                  ) : (
                    <span className="text-xs text-gray-400" title="Sin timbradas en el rango: el gasto por timbrada no se puede calcular.">sin timbradas</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{decimal(v.productividad)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {techo ? (
                    <span className="text-xs text-gray-400" title="Sin archivo contable no se puede clasificar la rentabilidad.">sin dato</span>
                  ) : (
                    <ChipSemaforo nivel={nivelSemaforo(val.rentabilidad, parametros.rentabilidad)} pequeno />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filas.length > 0 && (
        <p className="border-t border-[#F1F5F9] px-3 py-2 text-xs text-gray-500">
          {entero(filas.length)} vehículos · el asterisco marca los que no tienen el archivo contable de todos sus meses ·
          los importes van en pesos enteros y la rentabilidad con dos decimales · agrupado por código de vehículo, nunca por
          placa.
        </p>
      )}
    </div>
  );
}
