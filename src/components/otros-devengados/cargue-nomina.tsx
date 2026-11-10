"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONCEPTOS_DEVENGO_DEFECTO, claveCorte } from "@/lib/otros-devengados/calculo";
import type { CargaNomina } from "@/lib/otros-devengados/data";
import { interpretarListadoNomina } from "@/lib/otros-devengados/nomina-excel";
import { cargarNominaExcel, type LineaCargue } from "@/lib/otros-devengados/nomina-actions";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function textoCelda(v: unknown): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return o.result;
    if (typeof o.text === "string") return o.text;
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("");
  }
  return v;
}

/** Lee el listado (CSV con «;» en Windows-1252, o .xlsx) a una matriz de celdas. */
async function leerMatriz(file: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const out: unknown[][] = [];
    wb.worksheets[0]?.eachRow({ includeEmpty: false }, (row) => {
      const fila: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (c, i) => (fila[i - 1] = textoCelda(c.value)));
      out.push(fila);
    });
    return out;
  }
  const bytes = await file.arrayBuffer();
  let texto = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // MGX exporta en Windows-1252: si hay caracteres inválidos, se relee así.
  if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(bytes);
  return texto.split(/\r?\n/).map((l) => l.split(";"));
}

const fmtFechaHora = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/**
 * Cargue del listado de nómina que exporta MGX (una fila por empleado y
 * concepto) para un corte cuya nómina todavía no está cerrada en MGX. Con él
 * se calculan y entregan los otros devengados; cuando la nómina cierre en MGX
 * se compara contra lo cargado.
 */
export function CargueNomina({
  corte,
  carga,
  puedeCargar,
  onCargado,
}: {
  corte: { periodo: string; quincena: number };
  /** Cargue activo del corte, si ya hay uno. */
  carga: CargaNomina | null;
  puedeCargar: boolean;
  onCargado: () => void;
}) {
  const [pendiente, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const etiqueta = `${corte.periodo} Q${corte.quincena}`;

  async function leer(file: File) {
    let listado: ReturnType<typeof interpretarListadoNomina>;
    try {
      listado = interpretarListadoNomina(await leerMatriz(file));
    } catch {
      toast.error("No se pudo leer el archivo. Usa el listado de MGX en CSV o .xlsx.");
      return;
    }
    if (typeof listado === "string") {
      toast.error(listado);
      return;
    }
    if (claveCorte(listado.corte) !== claveCorte(corte)) {
      toast.error(
        `El listado es de la nómina ${listado.codPer} (${listado.corte.periodo} Q${listado.corte.quincena}) y este corte es ${etiqueta}.`
      );
      return;
    }
    const devengo = new Set<string>(CONCEPTOS_DEVENGO_DEFECTO);
    const deCruce = listado.lineas.filter((l) => devengo.has(l.codCon));
    const porConcepto = CONCEPTOS_DEVENGO_DEFECTO.map((c) => {
      const ls = deCruce.filter((l) => l.codCon === c);
      return `  ${c} ${ls[0]?.nomCon ?? ""}: ${cop.format(ls.reduce((t, l) => t + l.valor, 0))}`;
    }).join("\n");
    const empleados = new Set(deCruce.map((l) => l.codEpl)).size;
    if (
      !window.confirm(
        `Nómina ${listado.codPer}${listado.nomPer ? ` · ${listado.nomPer}` : ""}\n` +
          `${listado.lineas.length} líneas, ${empleados} empleados. Conceptos que usa Otros devengados:\n${porConcepto}\n\n` +
          (carga ? `Reemplaza el cargue anterior (${carga.archivo ?? "sin nombre"}).\n` : "") +
          `¿Cargar como nómina del corte ${etiqueta}?`
      )
    )
      return;
    const conceptos: Record<string, string | null> = {};
    const lineas: LineaCargue[] = listado.lineas.map((l) => {
      conceptos[l.codCon] ??= l.nomCon;
      return [l.codEpl, l.nomEpl, l.codCon, l.cantidad, l.valor];
    });
    start(async () => {
      const r = await cargarNominaExcel({
        periodo: corte.periodo,
        quincena: corte.quincena,
        archivo: file.name,
        codPer: listado.codPer,
        nomPer: listado.nomPer,
        corteListado: claveCorte(listado.corte),
        conceptos,
        lineas,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `Nómina cargada: ${r.empleados} empleados, ${cop.format(r.totalDevengo)} en los conceptos del cruce.` +
          (r.sinMaestro ? ` ${r.sinMaestro} no están en el maestro de conductores.` : "")
      );
      onCargado();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Nómina por listado de MGX · {etiqueta}</div>
          <div className="text-xs text-muted-foreground">
            {carga
              ? `Cargada la nómina ${carga.cod_per}: ${carga.empleados} empleados, ${carga.lineas} líneas · archivo ${carga.archivo ?? "—"} · ${
                  carga.cargada_por_email ?? "—"
                } el ${fmtFechaHora(carga.created_at)}.`
              : "Sin nómina cargada en este corte."}{" "}
            Exporta el listado de nómina en MGX (CSV o Excel) y súbelo tal cual: con él se calculan los otros devengados mientras la nómina
            cierra en MGX; después se compara.
          </div>
        </div>
        {puedeCargar && (
          <>
            <input
              ref={input}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void leer(f);
              }}
            />
            <Button size="sm" onClick={() => input.current?.click()} disabled={pendiente}>
              <FileUp className="mr-1 h-4 w-4" /> {pendiente ? "Cargando…" : carga ? "Reemplazar nómina" : "Cargar nómina"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
