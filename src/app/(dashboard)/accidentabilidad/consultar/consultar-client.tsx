"use client";

import { SiExporta } from "@/components/permisos/permisos-provider";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { TablaFiltrable, type ColumnaTabla } from "@/components/shared/tabla-filtrable";
import { descargarCsv, type CeldaCsv } from "@/lib/exportar/csv";
import { descargarPdfTabla } from "@/lib/exportar/pdf-tabla";
import {
  CLASE_LABEL, RESPONSABILIDAD_LABEL, type FilaAccidente, type FiltrosAccidente, type Responsabilidad,
} from "@/lib/accidentabilidad/analisis";
import type { ClaseAccidente } from "@/lib/accidentabilidad/formato";
import { pesosCosto } from "@/lib/accidentabilidad/costo";

const ESTADO_LABEL: Record<string, string> = {
  pendiente_revision: "Pendiente",
  falta_informacion: "Falta info",
  completada: "Completada",
  aprobado: "Aprobado",
};
const CASO_LABEL: Record<string, string> = { abierto: "Abierto", cerrado: "Cerrado" };

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
const g = (clase: ClaseAccidente | null) => (clase ? CLASE_LABEL[clase] : "");
const r = (resp: Responsabilidad | null) => (resp ? RESPONSABILIDAD_LABEL[resp] : "");
const est = (e: string) => ESTADO_LABEL[e] ?? e;
const cas = (c: string | null) => (c ? CASO_LABEL[c] ?? c : "");

/** Resumen legible de los filtros de la barra, para el contexto del PDF. */
function contextoFiltros(f: FiltrosAccidente, tab: string): string[] {
  const l: string[] = [`Vista: ${tab}`];
  if (f.desde || f.hasta) l.push(`Fechas: ${f.desde ?? "…"} a ${f.hasta ?? "…"}`);
  if (f.clase) l.push(`Gravedad: ${CLASE_LABEL[f.clase]}`);
  if (f.responsabilidad) l.push(`Responsabilidad: ${RESPONSABILIDAD_LABEL[f.responsabilidad]}`);
  if (f.factor) l.push(`Factor: ${f.factor}`);
  if (f.ruta) l.push(`Ruta: ${f.ruta}`);
  if (f.tenencia) l.push(`Tenencia: ${f.tenencia}`);
  if (f.caso) l.push(`Caso: ${f.caso}`);
  if (f.aseguradora) l.push(`Aseguradora: ${f.aseguradora}`);
  if (f.tieneIpat != null) l.push(`IPAT: ${f.tieneIpat ? "Sí" : "No"}`);
  if (f.conductor) l.push(`Buscar: ${f.conductor}`);
  if (f.estado) l.push(`Estado: ${est(f.estado)}`);
  return l;
}

export function ConsultarAccidentesClient({
  filas,
  historico,
  filtros,
}: {
  filas: FilaAccidente[];
  historico: boolean;
  filtros: FiltrosAccidente;
}) {
  const router = useRouter();
  const [vista, setVista] = useState<FilaAccidente[]>(filas);

  const columnas: ColumnaTabla<FilaAccidente>[] = [
    { clave: "num", titulo: "#", tipo: "numero", valor: (f) => f.consecutivo, claseCelda: "px-2 py-1.5 font-medium text-gray-900" },
    { clave: "fecha", titulo: "Fecha", tipo: "texto", valor: (f) => f.fecha.slice(0, 10), render: (f) => fmtFecha(f.fecha) },
    { clave: "conductor", titulo: "Conductor", tipo: "texto", valor: (f) => f.conductorNombre, claseCelda: "px-2 py-1.5" },
    { clave: "cedula", titulo: "Cédula", tipo: "texto", valor: (f) => f.conductorCedula },
    { clave: "vehiculo", titulo: "Vehículo", tipo: "texto", valor: (f) => f.vehiculoCodigo },
    { clave: "placa", titulo: "Placa", tipo: "texto", valor: (f) => f.vehiculoPlaca },
    { clave: "ruta", titulo: "Ruta", tipo: "texto", valor: (f) => f.vehiculoRuta },
    { clave: "propietario", titulo: "Propietario", tipo: "texto", valor: (f) => f.propietario, claseCelda: "px-2 py-1.5" },
    { clave: "direccion", titulo: "Dirección", tipo: "texto", valor: (f) => f.direccion, claseCelda: "px-2 py-1.5 max-w-[22rem]" },
    { clave: "gravedad", titulo: "Gravedad", tipo: "lista", valor: (f) => g(f.clase) },
    { clave: "responsabilidad", titulo: "Responsabilidad", tipo: "lista", valor: (f) => r(f.responsabilidad) },
    { clave: "factores", titulo: "Factores", tipo: "texto", valor: (f) => f.factores.join(", ") },
    { clave: "caso", titulo: "Caso", tipo: "lista", valor: (f) => cas(f.casoEstado) },
    {
      clave: "costo",
      titulo: "Costo reparación",
      tipo: "numero",
      valor: (f) => f.costoReparacion,
      render: (f) => (f.costoReparacion == null ? "—" : pesosCosto(f.costoReparacion)),
      claseCelda: "px-2 py-1.5 text-right tabular-nums whitespace-nowrap",
      claseTitulo: "text-right",
    },
    { clave: "estado", titulo: "Estado", tipo: "lista", valor: (f) => (historico ? "" : est(f.estado)) },
  ];

  // Celdas del export (todas las columnas, para las filas visibles).
  const cabeceras = ["#", "Fecha", "Conductor", "Cédula", "Vehículo", "Placa", "Ruta", "Propietario", "Dirección", "Gravedad", "Responsabilidad", "Factores", "Caso", "Costo reparación", "Estado"];
  const filaDe = (f: FilaAccidente): (string | number)[] => [
    f.consecutivo, fmtFecha(f.fecha), f.conductorNombre, f.conductorCedula ?? "", f.vehiculoCodigo ?? "",
    f.vehiculoPlaca ?? "", f.vehiculoRuta ?? "", f.propietario ?? "", f.direccion, g(f.clase), r(f.responsabilidad),
    f.factores.join(", "), cas(f.casoEstado), f.costoReparacion ?? "", historico ? "" : est(f.estado),
  ];
  // Total de lo que queda a la vista (respeta filtros de la barra y de la tabla).
  const costoTotal = vista.reduce((s, f) => s + (f.costoReparacion ?? 0), 0);
  const conCosto = vista.filter((f) => (f.costoReparacion ?? 0) > 0).length;

  function exportarCsv() {
    // En el CSV el costo va como número, para sumarlo en Excel.
    const filasCsv: CeldaCsv[][] = [cabeceras, ...vista.map(filaDe)];
    descargarCsv(`accidentes-${historico ? "historico" : "reportes"}.csv`, filasCsv);
  }

  async function exportarPdf() {
    await descargarPdfTabla({
      archivo: `accidentes-${historico ? "historico" : "reportes"}`,
      modulo: "Accidentabilidad",
      titulo: "Consulta de accidentes",
      contexto: [
        ...contextoFiltros(filtros, historico ? "Histórico" : "Reportes"),
        `${vista.length} registro(s) · costo de reparación ${pesosCosto(costoTotal)} (${conCosto} con costo)`,
      ],
      orientacion: "landscape",
      columnas: [
        { titulo: "#", ancho: 12, alinear: "right" },
        { titulo: "Fecha", ancho: 20 },
        { titulo: "Conductor" },
        { titulo: "Cédula", ancho: 24 },
        { titulo: "Veh.", ancho: 14 },
        { titulo: "Placa", ancho: 18 },
        { titulo: "Ruta", ancho: 18 },
        { titulo: "Propietario" },
        { titulo: "Dirección" },
        { titulo: "Gravedad", ancho: 22 },
        { titulo: "Responsab.", ancho: 24 },
        { titulo: "Factores" },
        { titulo: "Caso", ancho: 16 },
        { titulo: "Costo rep.", ancho: 24, alinear: "right" },
        { titulo: "Estado", ancho: 20 },
      ],
      filas: vista.map((f) => {
        const fila = filaDe(f);
        fila[13] = f.costoReparacion == null ? "—" : pesosCosto(f.costoReparacion);
        return fila;
      }),
      vacio: "No hay accidentes para los filtros seleccionados.",
    });
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          Costo de reparación de lo filtrado: <strong className="tabular-nums text-gray-900">{pesosCosto(costoTotal)}</strong>
          <span className="text-gray-400"> · {conCosto} de {vista.length} con costo</span>
        </p>
        <SiExporta>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={exportarCsv}
              disabled={vista.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              type="button"
              onClick={exportarPdf}
              disabled={vista.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <FileText className="h-4 w-4" /> PDF
            </button>
          </div>
        </SiExporta>
      </div>

      <TablaFiltrable
        id="accidentes-consulta"
        filas={filas}
        columnas={columnas}
        claveFila={(f) => f.id}
        onFila={(f) => router.push(`/accidentabilidad/consultar/${f.id}`)}
        ocultasIniciales={["factores"]}
        reportarVista={setVista}
        vacio="No hay accidentes para los filtros seleccionados."
      />
    </div>
  );
}
