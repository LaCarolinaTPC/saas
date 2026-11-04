"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quincenaDeFecha } from "@/lib/otros-devengados/calculo";
import type { NovedadOtros } from "@/lib/otros-devengados/data";
import { cargarReporteGestor, type FilaGestor } from "@/lib/otros-devengados/novedades-actions";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

/** Fecha del reporte (2026-10-16, 16/10/2026 o fecha de Excel) → 'YYYY-MM-DD'. */
function aFecha(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return s;
}

function aValor(v: unknown): number {
  if (typeof v === "number") return v;
  const d = String(v ?? "").replace(/[^\d]/g, "");
  return d ? Number(d) : 0;
}

function textoCelda(v: unknown): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return o.result;
    if (typeof o.text === "string") return o.text;
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("");
  }
  return v;
}

/** Lee el reporte (CSV con «;» en Windows-1252, o .xlsx) a una matriz de celdas. */
async function leerMatriz(file: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const out: unknown[][] = [];
    ws?.eachRow({ includeEmpty: false }, (row) => {
      const fila: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (c, i) => (fila[i - 1] = textoCelda(c.value)));
      out.push(fila);
    });
    return out;
  }
  const bytes = await file.arrayBuffer();
  let texto = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // GEMA exporta en Windows-1252: si hay caracteres inválidos, se relee así.
  if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(bytes);
  return texto.split(/\r?\n/).map((l) => l.split(";"));
}

/** Convierte la matriz del «Reporte Gestor Viajes Perdidos» en filas. */
function interpretar(m: unknown[][]): FilaGestor[] | string {
  const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();
  const iCab = m.findIndex((r) => r.some((c) => norm(c) === "FECHA") && r.some((c) => norm(c) === "VALOR GESTOR"));
  if (iCab < 0) return "No se encontró el encabezado del reporte (FECHA … VALOR GESTOR). ¿Es el «Reporte Gestor Viajes Perdidos» de GEMA?";
  const cab = m[iCab].map(norm);
  const col = (n: string) => cab.indexOf(n);
  const c = {
    fecha: col("FECHA"),
    novedad: col("NOVEDAD"),
    detalle: col("DETALLE NOVEDAD"),
    vehiculo: col("VEHICULO"),
    placa: col("PLACA"),
    conductor: col("CONDUCTOR"),
    turno: col("TURNO"),
    viaje: col("VIAJE"),
    ruta: col("RUTA"),
    tipo: col("TIPO GESTOR"),
    valor: col("VALOR GESTOR"),
    obs: col("OBSERVACION GESTOR"),
  };
  const txt = (r: unknown[], i: number) => (i < 0 ? null : String(r[i] ?? "").trim() || null);
  const filas: FilaGestor[] = [];
  for (let i = iCab + 1; i < m.length; i++) {
    const r = m[i];
    const fecha = aFecha(r[c.fecha]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    filas.push({
      fila: i + 1,
      fecha,
      novedad: txt(r, c.novedad),
      detalle: txt(r, c.detalle),
      vehiculo: txt(r, c.vehiculo),
      placa: txt(r, c.placa),
      conductor: txt(r, c.conductor),
      turno: txt(r, c.turno),
      viaje: txt(r, c.viaje),
      ruta: txt(r, c.ruta),
      tipoGestor: txt(r, c.tipo),
      valor: aValor(r[c.valor]),
      observacion: txt(r, c.obs),
    });
  }
  return filas.length ? filas : "El reporte no trae viajes.";
}

/**
 * Cargue del «Reporte Gestor Viajes Perdidos» de GEMA como pérdida de viaje.
 * GEMA no expone el valor del gestor por sus procedimientos, así que se sube
 * el reporte tal cual se exporta (CSV o Excel).
 */
export function CargueGestor({
  cargadas,
  puedeCargar,
  onCargado,
}: {
  /** Pérdidas de viaje activas del corte que vinieron del reporte. */
  cargadas: NovedadOtros[];
  puedeCargar: boolean;
  onCargado: () => void;
}) {
  const [pendiente, start] = useTransition();
  const [rechazadas, setRechazadas] = useState<{ fila: number; cedula: string; motivo: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const total = cargadas.reduce((t, n) => t + n.valor, 0);
  const archivo = cargadas[0]?.archivo ?? null;

  async function leer(file: File) {
    setRechazadas([]);
    let filas: FilaGestor[] | string;
    try {
      filas = interpretar(await leerMatriz(file));
    } catch {
      toast.error("No se pudo leer el archivo.");
      return;
    }
    if (typeof filas === "string") {
      toast.error(filas);
      return;
    }
    const conValor = filas.filter((f) => f.valor > 0);
    const porCorte = new Map<string, { n: number; v: number }>();
    for (const f of conValor) {
      const q = quincenaDeFecha(f.fecha);
      const k = `${q.periodo} Q${q.quincena}`;
      const a = porCorte.get(k) ?? { n: 0, v: 0 };
      a.n++;
      a.v += f.valor;
      porCorte.set(k, a);
    }
    const resumen = [...porCorte].map(([k, a]) => `  ${k}: ${a.n} viajes · ${cop.format(a.v)}`).join("\n");
    if (
      !window.confirm(
        `Reporte del gestor: ${filas.length} viajes, ${conValor.length} con cobro.\n${resumen}\n` +
          (filas.length - conValor.length ? `${filas.length - conValor.length} en $0 (justificados) no se cargan.\n` : "") +
          "\nReemplaza lo cargado antes desde el reporte en esas fechas. ¿Cargar?"
      )
    )
      return;
    start(async () => {
      const r = await cargarReporteGestor({ archivo: file.name, filas });
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo cargar el reporte.");
        setRechazadas(r.rechazadas ?? []);
        return;
      }
      toast.success(`Pérdida de viaje cargada: ${r.cargadas} viajes por ${cop.format(r.total ?? 0)} (${(r.cortes ?? []).join(", ")}).`);
      onCargado();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Pérdida de viaje · Reporte Gestor Viajes Perdidos (GEMA)</div>
          <div className="text-xs text-muted-foreground">
            {cargadas.length
              ? `${cargadas.length} viajes en este corte · ${cop.format(total)}${archivo ? ` · archivo ${archivo}` : ""}`
              : "Sin reporte cargado en este corte."}{" "}
            Exporta el reporte en GEMA (CSV o Excel) y súbelo tal cual: entran los viajes con valor gestor; el corte sale de la fecha del viaje.
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
              <FileUp className="mr-1 h-4 w-4" /> {pendiente ? "Cargando…" : "Cargar reporte del gestor"}
            </Button>
          </>
        )}
      </div>
      {rechazadas.length > 0 && (
        <ul className="mt-3 max-h-48 overflow-auto rounded-lg bg-red-50 p-3 text-xs text-red-700">
          {rechazadas.map((r, i) => (
            <li key={i}>
              Fila {r.fila} · {r.cedula || "(sin conductor)"}: {r.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
