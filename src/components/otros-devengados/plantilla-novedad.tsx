"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NOMBRE_NOVEDAD, VALOR_UNITARIO_SUGERIDO } from "@/lib/otros-devengados/calculo";
import type { NovedadOtros } from "@/lib/otros-devengados/data";
import { cargarPlantillaNovedad, type TipoPlantilla } from "@/lib/otros-devengados/novedades-actions";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Valor de una celda de exceljs como texto o número (fórmulas → su resultado). */
function valorCelda(v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return valorCelda(o.result);
    if (typeof o.text === "string") return o.text;
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("");
  }
  return String(v);
}

const aNumero = (v: string | number | null): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const limpio = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return limpio ? Number(limpio) : NaN;
};

/**
 * Plantilla de Excel para cargar una novedad de Otros devengados por corte
 * (casino desde Tesorería, pérdida de turno desde Operativo). La plantilla
 * sale prellenada con los conductores y lo ya cargado; cada cargue reemplaza
 * el cargue anterior por Excel de ese tipo y corte.
 */
export function PlantillaNovedad({
  tipo,
  corte,
  cargadas,
  conductores,
  puedeCargar,
  onCargado,
  nota,
}: {
  tipo: TipoPlantilla;
  corte: { periodo: string; quincena: number };
  /** Novedades activas de este tipo y corte cargadas por Excel. */
  cargadas: NovedadOtros[];
  conductores: { cedula: string; nombre: string | null; codigo: string | null }[];
  puedeCargar: boolean;
  onCargado: () => void;
  nota?: React.ReactNode;
}) {
  const [pendiente, start] = useTransition();
  const [rechazadas, setRechazadas] = useState<{ fila: number; cedula: string; motivo: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const conCantidad = tipo === "perdida_turno";
  const unitario = VALOR_UNITARIO_SUGERIDO[tipo] ?? 0;
  const nombre = NOMBRE_NOVEDAD[tipo];
  const total = cargadas.reduce((t, n) => t + n.valor, 0);
  const archivo = cargadas[0]?.archivo ?? null;
  const etiqueta = `${corte.periodo} Q${corte.quincena}`;
  const encabezados = conCantidad
    ? ["Cédula", "Código", "Nombre", "Cantidad", "Valor", "Observación"]
    : ["Cédula", "Código", "Nombre", "Valor", "Observación"];

  async function descargarPlantilla() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(nombre.slice(0, 30));
    ws.columns = (conCantidad ? [14, 10, 36, 11, 14, 30] : [14, 10, 36, 14, 30]).map((width) => ({ width }));
    ws.addRow(encabezados).eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    });
    const ya = new Map(cargadas.map((n) => [n.cedula_conductor, n]));
    const lista = [...conductores];
    for (const n of cargadas) {
      if (!lista.some((c) => c.cedula === n.cedula_conductor)) {
        lista.push({ cedula: n.cedula_conductor, nombre: n.conductor_nombre, codigo: n.codigo_conductor });
      }
    }
    for (const c of lista) {
      const n = ya.get(c.cedula);
      const fila = conCantidad
        ? [c.cedula, c.codigo ?? "", c.nombre ?? "", n?.cantidad ?? null, n?.valor ?? null, n?.observacion ?? ""]
        : [c.cedula, c.codigo ?? "", c.nombre ?? "", n?.valor ?? null, n?.observacion ?? ""];
      ws.addRow(fila).getCell(conCantidad ? 5 : 4).numFmt = '"$"#,##0';
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const ayuda = wb.addWorksheet("Instrucciones");
    ayuda.columns = [{ width: 100 }];
    [
      `Plantilla de ${nombre.toLowerCase()} · corte ${etiqueta}.`,
      "Llene solo los conductores que tienen descuento; las filas sin valor se ignoran.",
      conCantidad
        ? `Si deja el Valor vacío y escribe la Cantidad, se calcula Cantidad × ${cop.format(unitario)}.`
        : "El Valor es el total a descontar en la quincena.",
      "Cada cargue reemplaza el cargue anterior por Excel de este corte (lo digitado a mano en el formulario se conserva).",
      "No cambie los encabezados de la primera hoja.",
    ].forEach((t) => ayuda.addRow([t]));
    const buffer = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `plantilla_${tipo}_${corte.periodo}_Q${corte.quincena}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function leerArchivo(file: File) {
    setRechazadas([]);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await file.arrayBuffer());
    } catch {
      toast.error("No se pudo leer el archivo. Usa la plantilla en formato .xlsx.");
      return;
    }
    const ws = wb.worksheets[0];
    if (!ws) {
      toast.error("El archivo no tiene hojas.");
      return;
    }
    // Columnas por encabezado (la fila 1), para tolerar columnas movidas.
    const cab = new Map<string, number>();
    ws.getRow(1).eachCell((c, i) => cab.set(String(valorCelda(c.value) ?? "").trim().toLowerCase(), i));
    const colCed = cab.get("cédula") ?? cab.get("cedula");
    const colVal = cab.get("valor") ?? cab.get("valor casino");
    const colCant = cab.get("cantidad");
    const colObs = cab.get("observación") ?? cab.get("observacion");
    if (!colCed || (!colVal && !colCant)) {
      toast.error(`La plantilla debe tener las columnas «Cédula» y «Valor»${conCantidad ? " o «Cantidad»" : ""}.`);
      return;
    }
    const filas: { fila: number; cedula: string; cantidad: number | null; valor: number | null; observacion: string | null }[] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const ced = valorCelda(row.getCell(colCed).value);
      const valor = colVal ? aNumero(valorCelda(row.getCell(colVal).value)) : null;
      const cantidad = colCant ? aNumero(valorCelda(row.getCell(colCant).value)) : null;
      if (!valor && !cantidad) return;
      filas.push({
        fila: n,
        cedula: String(ced ?? ""),
        cantidad,
        valor,
        observacion: colObs ? String(valorCelda(row.getCell(colObs).value) ?? "") || null : null,
      });
    });
    if (filas.length === 0) {
      toast.error("La plantilla no trae valores.");
      return;
    }
    const suma = filas.reduce((t, f) => {
      const v = f.valor || (f.cantidad && unitario ? f.cantidad * unitario : 0);
      return t + (Number.isFinite(v) ? v : 0);
    }, 0);
    if (
      !window.confirm(
        `¿Cargar ${nombre.toLowerCase()} de ${filas.length} conductores por ${cop.format(suma)} en el corte ${etiqueta}?` +
          (cargadas.length ? `\n\nReemplaza el cargue anterior por Excel (${cargadas.length} conductores, ${cop.format(total)}).` : "")
      )
    )
      return;
    start(async () => {
      const r = await cargarPlantillaNovedad({ tipo, periodo: corte.periodo, quincena: corte.quincena, archivo: file.name, filas });
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo cargar la plantilla.");
        setRechazadas(r.rechazadas ?? []);
        return;
      }
      toast.success(`${nombre} cargada: ${r.cargadas} conductores por ${cop.format(r.total ?? 0)}.`);
      onCargado();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{nombre} por plantilla de Excel · {etiqueta}</div>
          <div className="text-xs text-muted-foreground">
            {cargadas.length
              ? `${cargadas.length} conductores · ${cop.format(total)}${archivo ? ` · archivo ${archivo}` : ""}`
              : "Sin cargue por Excel en este corte."}{" "}
            {nota}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={descargarPlantilla}>
            <Download className="mr-1 h-4 w-4" /> Plantilla
          </Button>
          {puedeCargar && (
            <>
              <input
                ref={input}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void leerArchivo(f);
                }}
              />
              <Button size="sm" onClick={() => input.current?.click()} disabled={pendiente}>
                <Upload className="mr-1 h-4 w-4" /> {pendiente ? "Cargando…" : "Cargar plantilla"}
              </Button>
            </>
          )}
        </div>
      </div>
      {rechazadas.length > 0 && (
        <ul className="mt-3 max-h-48 overflow-auto rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {rechazadas.map((r, i) => (
            <li key={i}>
              Fila {r.fila} · {r.cedula || "(vacía)"}: {r.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
