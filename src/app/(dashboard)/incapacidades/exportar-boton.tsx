"use client";

import { BotonesExportar } from "@/components/ui/botones-exportar";
import type { FormatoExport } from "@/lib/exportar/formatos";
import { exportarListado, type DatosExport } from "@/lib/incapacidades/exportar";
import { registrarExportacionIncapacidades } from "./exportar-actions";

/**
 * Descargas de un listado del módulo con lo que se ve. Los datos vienen ya
 * armados del servidor (serializables); la generación corre en el navegador y
 * el rastro se deja después de generar, como en Riesgo.
 */
export function ExportarBoton({ datos, pantalla }: { datos: DatosExport; pantalla: string }) {
  const filas = datos.secciones ? datos.secciones.reduce((s, x) => s + x.filas.length, 0) : datos.filas.length;
  async function exportar(formato: FormatoExport) {
    await exportarListado(formato, datos);
    await registrarExportacionIncapacidades({ pantalla, formato, filas, archivo: datos.archivo });
  }
  return <BotonesExportar formatos={["pdf", "xlsx", "csv"]} sinDatos={filas === 0} onExportar={exportar} />;
}
