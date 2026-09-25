"use client";

import { useState } from "react";
import { cop, entero, porcentaje } from "@/lib/financiera/formato";
import { TablaInteractiva } from "./tabla-interactiva";

export interface FilaMarca {
  marca: string;
  vehiculos: number;
  viajes: number;
  utilidad: number;
  rentabilidad: number;
  gastoTimbrada: number | null;
  incompleto: boolean;
}

type Columna = "marca" | "vehiculos" | "viajes" | "utilidad" | "rentabilidad" | "gastoTimbrada";

export function TablaMarcas({ datos }: { datos: FilaMarca[] }) {
  const [columna, setColumna] = useState<Columna>("marca");
  const [ascendente, setAscendente] = useState(true);
  const filas = [...datos].sort((a, b) => {
    const diferencia = columna === "marca"
      ? a.marca.localeCompare(b.marca, "es", { numeric: true })
      : columna === "gastoTimbrada"
        ? (a.gastoTimbrada ?? Number.POSITIVE_INFINITY) - (b.gastoTimbrada ?? Number.POSITIVE_INFINITY)
        : a[columna] - b[columna];
    return (ascendente ? diferencia : -diferencia) || a.marca.localeCompare(b.marca, "es");
  });
  const encabezado = (clave: Columna, etiqueta: string, derecha = false) => (
    <th scope="col" aria-sort={columna === clave ? (ascendente ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-3 py-2 ${derecha ? "text-right" : ""}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-gray-900 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500" onClick={() => {
        if (columna === clave) setAscendente(!ascendente);
        else { setColumna(clave); setAscendente(true); }
      }}>
        {etiqueta}<span aria-hidden="true" className="text-[10px]">{columna === clave ? (ascendente ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );

  return (
    <TablaInteractiva id="detalle-marcas" columnas={[
      { id: "marca", nombre: "Marca", fija: true },
      { id: "vehiculos", nombre: "Vehículos" },
      { id: "viajes", nombre: "Viajes" },
      { id: "utilidad", nombre: "Utilidad" },
      { id: "rentabilidad", nombre: "Rentabilidad" },
      { id: "gastoTimbrada", nombre: "Gasto / timbrada" },
    ]}>
      <table className="w-full text-sm">
        <thead className="bg-[#F8FAFC] text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            {encabezado("marca", "Marca")}
            {encabezado("vehiculos", "Vehículos", true)}
            {encabezado("viajes", "Viajes", true)}
            {encabezado("utilidad", "Utilidad", true)}
            {encabezado("rentabilidad", "Rentabilidad", true)}
            {encabezado("gastoTimbrada", "Gasto / timbrada", true)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F1F5F9]">
          {filas.map((fila) => (
            <tr key={fila.marca} className="hover:bg-[#F8FAFC]">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">{fila.marca}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{entero(fila.vehiculos)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{entero(fila.viajes)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fila.incompleto ? "≤ " : ""}{cop(fila.utilidad)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fila.incompleto ? "≤ " : ""}{porcentaje(fila.rentabilidad)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{fila.gastoTimbrada == null ? "sin timbradas" : `${fila.incompleto ? "≥ " : ""}${cop(fila.gastoTimbrada)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TablaInteractiva>
  );
}
