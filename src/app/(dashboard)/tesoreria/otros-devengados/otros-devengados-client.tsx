"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, CheckCircle2, ChevronDown, ChevronRight, Coins, FileSpreadsheet, Lock, LockOpen, Search, TriangleAlert, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { esBusquedaCodigo } from "@/lib/devengados/buscar";
import { anularEntregaOtrosDevengados, cerrarQuincena, entregarOtrosDevengados, reabrirQuincena } from "@/lib/otros-devengados/actions";
import { anularNovedad, trasladarSaldoNegativo } from "@/lib/otros-devengados/novedades-actions";
import { NOMBRE_NOVEDAD, TIPOS_NOVEDAD, TIPOS_TRASLADO, novedadSuma, siguienteCorte } from "@/lib/otros-devengados/calculo";
import { PlantillaNovedad } from "@/components/otros-devengados/plantilla-novedad";
import type { Cruce, EntregaOtros, FilaCruce, PeriodoNomina } from "@/lib/otros-devengados/data";

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const NOMBRE_CONCEPTO: Record<string, string> = {
  "003": "Salario básico",
  "010": "Auxilio de transporte",
  "202": "Dominicales y festivos",
  "208": "Recargo nocturno",
  "209": "Horas extras diurnas",
};

type Filtro = "todos" | "por_entregar" | "anticipo" | "entregado" | "descuentos" | "negativo";

/** Descuentos menos devoluciones de la fila (positivo = resta). */
const netoNovedades = (f: FilaCruce) => f.descuentos - f.devoluciones;

function fmtFecha(f: string) {
  const m = f.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : f;
}

const nombreCorte = (q: { periodo: string; quincena: number }) => `${q.quincena === 1 ? "1.ª" : "2.ª"} quincena de ${q.periodo}`;

export function OtrosDevengadosClient({
  periodos,
  cruce,
  puedeEntregar,
  verDetalle,
  esAdmin,
}: {
  periodos: PeriodoNomina[];
  cruce: Cruce | null;
  puedeEntregar: boolean;
  /** Nómina y administradores: producción, conceptos de nómina y referencia MGX. */
  verDetalle: boolean;
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [entregar, setEntregar] = useState<FilaCruce | null>(null);
  const [anular, setAnular] = useState<EntregaOtros | null>(null);
  const [trasladar, setTrasladar] = useState<FilaCruce | null>(null);
  const anclaTabla = useRef<HTMLDivElement>(null);

  const periodo = cruce?.periodo ?? null;
  const filas = useMemo(() => cruce?.filas ?? [], [cruce]);
  const cerrado = cruce?.cierre?.estado === "cerrado";
  // Con el corte cerrado nada se modifica; las entregas además esperan a que
  // la quincena anterior esté cerrada.
  const editable = puedeEntregar && !cerrado;
  const puedeEntregarAhora = editable && !!cruce?.anteriorCerrado;

  const filtradas = useMemo(() => {
    const q = query.toLowerCase().trim();
    return filas.filter((f) => {
      if (q) {
        const ok = esBusquedaCodigo(q)
          ? f.codigo === q
          : f.nombre?.toLowerCase().includes(q) || f.cedula.includes(q) || f.codigo?.toLowerCase().includes(q);
        if (!ok) return false;
      }
      if (filtro === "por_entregar") return f.porEntregar > 0;
      if (filtro === "anticipo") return f.anticipo > 0;
      if (filtro === "entregado") return f.entregado > 0;
      if (filtro === "descuentos") return f.descuentos > 0 || f.devoluciones > 0;
      if (filtro === "negativo") return f.saldoNegativo > 0;
      return true;
    });
  }, [filas, query, filtro]);

  const pagina = usePaginacion(filtradas, { reiniciar: `${query}|${filtro}|${periodo?.codigo}` });

  const totales = useMemo(
    () =>
      filas.reduce(
        (t, f) => ({
          produccion: t.produccion + f.produccion,
          nomina: t.nomina + f.nominaDevengo,
          otros: t.otros + f.otrosDevengados,
          novedades: t.novedades + netoNovedades(f),
          entregado: t.entregado + f.entregado,
          porEntregar: t.porEntregar + f.porEntregar,
          anticipo: t.anticipo + f.anticipo,
          conSaldo: t.conSaldo + (f.porEntregar > 0 ? 1 : 0),
        }),
        { produccion: 0, nomina: 0, otros: 0, novedades: 0, entregado: 0, porEntregar: 0, anticipo: 0, conSaldo: 0 }
      ),
    [filas]
  );

  async function exportarExcel() {
    if (!cruce || !periodo) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Cruce", { views: [{ state: "frozen", ySplit: 1 }] });
    const conceptos = verDetalle ? cruce.conceptos : [];
    const headers = !verDetalle
      ? [
          "Código", "Cédula", "Nombre", "Estado",
          ...TIPOS_NOVEDAD.map((t) => `${NOMBRE_NOVEDAD[t]}${novedadSuma(t) ? " (+)" : " (−)"}`),
          "Disponible", "Entregado caja", "Entregado otros dev.", "Por entregar", "Saldo negativo",
        ]
      : [
      "Código", "Cédula", "Nombre", "Estado", "Días",
      "Producción GEMA",
      ...conceptos.map((c) => `${c} ${NOMBRE_CONCEPTO[c] ?? ""}`.trim()),
      "Nómina devengo", "Otros devengados",
      ...TIPOS_NOVEDAD.map((t) => `${NOMBRE_NOVEDAD[t]}${novedadSuma(t) ? " (+)" : " (−)"}`),
      "Disponible", "Entregado caja", "Entregado otros dev.", "Por entregar", "Anticipo salario", "Descuento sin cubrir",
      "MGX 216 (ref.)", "MGX 546 (ref.)",
    ];
    ws.columns = headers.map((h, i) => ({ width: i === 2 ? 34 : Math.max(12, Math.min(22, h.length + 2)) }));
    const hr = ws.getRow(1);
    headers.forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    filtradas.forEach((f, idx) => {
      const vals: (string | number)[] = !verDetalle
        ? [
            f.codigo ?? "", f.cedula, f.nombre ?? "", f.estado ?? "",
            ...TIPOS_NOVEDAD.map((t) => f.novedades[t] ?? 0),
            f.disponible, f.entregadoCaja, f.entregadoOtros, f.porEntregar, f.saldoNegativo,
          ]
        : [
        f.codigo ?? "", f.cedula, f.nombre ?? "", f.estado ?? "", f.dias, f.produccion,
        ...conceptos.map((c) => f.conceptos[c] ?? 0),
        f.nominaDevengo, f.otrosDevengados,
        ...TIPOS_NOVEDAD.map((t) => f.novedades[t] ?? 0),
        f.disponible, f.entregadoCaja, f.entregadoOtros, f.porEntregar, f.anticipo, f.descuentoPendiente,
        f.mgx216, f.mgx546,
      ];
      const r = ws.getRow(idx + 2);
      vals.forEach((v, i) => {
        const c = r.getCell(i + 1);
        c.value = v;
        c.font = { size: 10 };
        if (i >= (verDetalle ? 5 : 4) && typeof v === "number") c.numFmt = '"$"#,##0';
      });
    });
    const buffer = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `otros_devengados_${periodo.codigo}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        titulo="Otros devengados"
        icono={Coins}
        descripcion="Entrega por quincena de lo que deja la producción después de la nómina de conductores cerrada en MGX y los descuentos del corte."
      >
        <select
          className="h-9 rounded-lg border border-border bg-white px-3 text-sm"
          value={periodo?.codigo ?? ""}
          onChange={(e) => router.push(`/tesoreria/otros-devengados?per=${e.target.value}`)}
          aria-label="Quincena de nómina"
        >
          {periodos.length === 0 && <option value="">Sin períodos</option>}
          {periodos.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.codigo} · {fmtFecha(p.quincena.ini)} al {fmtFecha(p.quincena.fin)} {p.cerrada ? "" : "(abierta)"}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={exportarExcel} disabled={!filtradas.length}>
          <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
        </Button>
      </PageHeader>

      <div className="space-y-4 p-4 sm:p-6">
        {!periodo && (
          <Aviso>
            Otros devengados arranca en la 1.ª quincena de noviembre de 2026: la pantalla se llena cuando esa nómina
            exista en MGX y llegue la sincronización diaria.
          </Aviso>
        )}
        {periodo && !periodo.cerrada && (
          <Aviso icono={<Lock className="h-4 w-4" />}>
            La nómina {periodo.codigo} ({periodo.nombre}) todavía no está cerrada en MGX
            {periodo.lineas === 0 ? " y no tiene líneas" : ""}. El cruce y las entregas se habilitan cuando
            Nómina la cierre y llegue la sincronización diaria de MGX.
          </Aviso>
        )}

        {periodo?.cerrada && cruce && (
          <>
            <p className="text-sm text-muted-foreground">
              Nómina <b>{periodo.codigo}</b> · {periodo.nombre} · {fmtFecha(periodo.quincena.ini)} al{" "}
              {fmtFecha(periodo.quincena.fin)}
              {verDetalle && <> · conceptos {cruce.conceptos.join(", ")}</>}
            </p>

            <CierreQuincena
              cruce={cruce}
              puedeCerrar={puedeEntregar}
              esAdmin={esAdmin}
              pendientes={{ porEntregar: totales.conSaldo, negativos: filas.filter((f) => f.saldoNegativo > 0).length }}
              onCambio={() => router.refresh()}
            />

            <div className={`grid grid-cols-2 gap-3 md:grid-cols-4 ${verDetalle ? "xl:grid-cols-7" : "xl:grid-cols-4"}`}>
              {verDetalle && <Tarjeta titulo="Producción GEMA" valor={cop.format(totales.produccion)} />}
              {verDetalle && <Tarjeta titulo="Nómina devengo" valor={cop.format(totales.nomina)} />}
              {verDetalle && <Tarjeta titulo="Otros devengados" valor={cop.format(totales.otros)} />}
              <Tarjeta titulo="Descuentos netos" valor={cop.format(totales.novedades)} nota="pérdidas y casino − devoluciones" />
              <Tarjeta titulo="Entregado" valor={cop.format(totales.entregado)} />
              <Tarjeta titulo="Por entregar" valor={cop.format(totales.porEntregar)} nota={`${totales.conSaldo} conductores`} destacado />
              {verDetalle ? (
                <Tarjeta titulo="Anticipo salario" valor={cop.format(totales.anticipo)} />
              ) : (
                <Tarjeta titulo="Saldo negativo" valor={cop.format(filas.reduce((t, f) => t + f.saldoNegativo, 0))} />
              )}
            </div>

            {cruce.sinNomina.length > 0 && (
              <Aviso>
                {cruce.sinNomina.length} conductor(es) con producción en la quincena no están en la nómina de
                conductores de este período (casi siempre retirados en liquidación) y quedan fuera del cruce:{" "}
                {cruce.sinNomina
                  .map((s) => `${s.nombre ?? s.cedula}${s.estado === "RETIRADO" ? " (retirado)" : ""}${verDetalle ? ` ${cop.format(s.produccion)}` : ""}`)
                  .join(" · ")}
              </Aviso>
            )}
            {cruce.cierresSinCedula > 0 && (
              <Aviso>{cruce.cierresSinCedula} cierre(s) GEMA sin cédula ni código reconocible no entran al cruce.</Aviso>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="w-72 pl-8"
                  placeholder="Nombre, cédula o código"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select
                className="h-9 rounded-lg border border-border bg-white px-3 text-sm"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value as Filtro)}
                aria-label="Filtro"
              >
                <option value="todos">Todos</option>
                <option value="por_entregar">Con saldo por entregar</option>
                {verDetalle && <option value="anticipo">Con anticipo de salario</option>}
                <option value="entregado">Con entregas</option>
                <option value="descuentos">Con descuentos o devoluciones</option>
                <option value="negativo">Con saldo negativo</option>
              </select>
            </div>

            <div ref={anclaTabla} className="overflow-x-auto rounded-xl border border-border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="w-8" />
                    <th className="px-3 py-2 text-left">Código</th>
                    <th className="px-3 py-2 text-left">Conductor</th>
                    {verDetalle && <th className="px-3 py-2 text-right">Días</th>}
                    {verDetalle && <th className="px-3 py-2 text-right">Producción</th>}
                    {verDetalle && <th className="px-3 py-2 text-right">Nómina devengo</th>}
                    {verDetalle && <th className="px-3 py-2 text-right">Otros devengados</th>}
                    <th className="px-3 py-2 text-right">Descuentos</th>
                    {!verDetalle && <th className="px-3 py-2 text-right">Disponible</th>}
                    <th className="px-3 py-2 text-right">Entregado</th>
                    <th className="px-3 py-2 text-right">Por entregar</th>
                    {verDetalle && <th className="px-3 py-2 text-right">Anticipo</th>}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {pagina.filas.map((f) => {
                    const abiertaFila = abierta === f.cedula;
                    return (
                      <Fragment key={f.cedula}>
                        <tr className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-2">
                            <button
                              type="button"
                              aria-label="Ver detalle"
                              onClick={() => setAbierta(abiertaFila ? null : f.cedula)}
                              className="text-slate-400 hover:text-primary"
                            >
                              {abiertaFila ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="px-3 py-2 tabular-nums">{f.codigo ?? "—"}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{f.nombre ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {f.cedula}
                              {f.estado === "RETIRADO" && (
                                <span className="ml-2 font-semibold text-amber-700">
                                  RETIRADO{f.fechaRetiro ? ` ${fmtFecha(f.fechaRetiro)}` : ""}
                                </span>
                              )}
                            </div>
                          </td>
                          {verDetalle && <td className="px-3 py-2 text-right tabular-nums">{f.dias}</td>}
                          {verDetalle && <td className="px-3 py-2 text-right tabular-nums">{cop.format(f.produccion)}</td>}
                          {verDetalle && <td className="px-3 py-2 text-right tabular-nums">{cop.format(f.nominaDevengo)}</td>}
                          {verDetalle && <td className="px-3 py-2 text-right tabular-nums">{cop.format(f.otrosDevengados)}</td>}
                          <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                            {netoNovedades(f) !== 0 ? cop.format(-netoNovedades(f)) : "—"}
                            {f.descuentoPendiente > 0 && (
                              <div className="text-xs text-red-600">sin cubrir {cop.format(f.descuentoPendiente)}</div>
                            )}
                          </td>
                          {!verDetalle && <td className="px-3 py-2 text-right tabular-nums">{cop.format(f.disponible)}</td>}
                          <td className="px-3 py-2 text-right tabular-nums">{cop.format(f.entregado)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700">
                            {f.porEntregar > 0 ? cop.format(f.porEntregar) : "—"}
                          </td>
                          {verDetalle && (
                            <td className="px-3 py-2 text-right tabular-nums text-red-600">
                              {f.anticipo > 0 ? cop.format(f.anticipo) : "—"}
                            </td>
                          )}
                          <td className="px-3 py-2 text-right">
                            {puedeEntregarAhora && f.porEntregar > 0 && (
                              <Button size="sm" onClick={() => setEntregar(f)}>
                                Entregar
                              </Button>
                            )}
                            {f.saldoNegativo > 0 && (
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-xs font-semibold text-red-600">Debe {cop.format(f.saldoNegativo)}</span>
                                {editable && (
                                  <Button size="sm" variant="outline" onClick={() => setTrasladar(f)}>
                                    <ArrowRightLeft className="mr-1 h-4 w-4" /> Llevar a cero
                                  </Button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                        {abiertaFila && (
                          <tr className="bg-slate-50/60">
                            <td />
                            <td colSpan={verDetalle ? 11 : 7} className="px-3 py-3">
                              <Detalle fila={f} conceptos={cruce.conceptos} verDetalle={verDetalle} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {pagina.filas.length === 0 && (
                    <tr>
                      <td colSpan={verDetalle ? 12 : 8} className="px-3 py-8 text-center text-muted-foreground">
                        Ningún conductor con ese filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <Paginador p={pagina} unidad="conductores" ancla={anclaTabla} />
            </div>

            <Entregas entregas={cruce.entregas} puedeAnular={editable} onAnular={setAnular} />
          </>
        )}

        {periodo && cruce && (
          <PlantillaNovedad
            tipo="casino"
            corte={periodo.quincena}
            cargadas={cruce.novedades.filter((n) => n.tipo === "casino" && n.origen === "excel")}
            conductores={cruce.filas.map((f) => ({ cedula: f.cedula, nombre: f.nombre, codigo: f.codigo }))}
            puedeCargar={editable}
            onCargado={() => router.refresh()}
            nota={`Pérdidas de turno y de viaje las registra Operativo en «Descuentos conductores» (${
              cruce.novedades.filter((n) => ["perdida_turno", "perdida_viaje", "devolucion_viaje"].includes(n.tipo)).length
            } registros).`}
          />
        )}

        {periodo && cruce && (
          <Traslados
            novedades={cruce.novedades.filter((n) => TIPOS_TRASLADO.includes(n.tipo))}
            puedeAnular={editable}
            onAnulado={() => router.refresh()}
          />
        )}
      </div>

      {entregar && periodo && (
        <DialogoEntrega
          fila={entregar}
          codPer={periodo.codigo}
          onClose={() => setEntregar(null)}
          onHecho={() => {
            setEntregar(null);
            router.refresh();
          }}
        />
      )}
      {trasladar && periodo && (
        <DialogoTraslado
          fila={trasladar}
          periodo={periodo}
          onClose={() => setTrasladar(null)}
          onHecho={() => {
            setTrasladar(null);
            router.refresh();
          }}
        />
      )}
      {anular && (
        <DialogoAnular
          entrega={anular}
          onClose={() => setAnular(null)}
          onHecho={() => {
            setAnular(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Aviso({ children, icono }: { children: React.ReactNode; icono?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="mt-0.5 shrink-0">{icono ?? <TriangleAlert className="h-4 w-4" />}</span>
      <div>{children}</div>
    </div>
  );
}

function Tarjeta({ titulo, valor, nota, destacado }: { titulo: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border bg-white px-4 py-3 ${destacado ? "border-emerald-300" : "border-border"}`}>
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className={`text-lg font-semibold tabular-nums ${destacado ? "text-emerald-700" : ""}`}>{valor}</div>
      {nota && <div className="text-xs text-muted-foreground">{nota}</div>}
    </div>
  );
}

function Detalle({ fila: f, conceptos, verDetalle }: { fila: FilaCruce; conceptos: string[]; verDetalle: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <table className="text-sm">
        <tbody>
          {verDetalle && (
          <tr>
            <td className="pr-6">Producción GEMA ({f.dias} días)</td>
            <td className="text-right tabular-nums">{cop.format(f.produccion)}</td>
          </tr>
          )}
          {verDetalle && conceptos.map((c) => (
            <tr key={c} className="text-muted-foreground">
              <td className="pr-6">
                − {c} {NOMBRE_CONCEPTO[c] ?? ""}
              </td>
              <td className="text-right tabular-nums">{cop.format(f.conceptos[c] ?? 0)}</td>
            </tr>
          ))}
          {verDetalle && (
          <tr className="border-t font-medium">
            <td className="pr-6">= Generado en el corte</td>
            <td className="text-right tabular-nums">{cop.format(f.generado)}</td>
          </tr>
          )}
          {TIPOS_NOVEDAD.filter((t) => f.novedades[t]).map((t) => (
            <tr key={t} className="text-muted-foreground">
              <td className="pr-6">
                {novedadSuma(t) ? "+" : "−"} {NOMBRE_NOVEDAD[t]}
              </td>
              <td className="text-right tabular-nums">{cop.format(f.novedades[t] ?? 0)}</td>
            </tr>
          ))}
          {(!verDetalle || f.descuentos > 0 || f.devoluciones > 0) && (
            <tr className="font-medium">
              <td className="pr-6">= Disponible</td>
              <td className="text-right tabular-nums">{cop.format(f.disponible)}</td>
            </tr>
          )}
          <tr>
            <td className="pr-6">− Entregado por Caja devengados</td>
            <td className="text-right tabular-nums">{cop.format(f.entregadoCaja)}</td>
          </tr>
          <tr>
            <td className="pr-6">− Entregado por Otros devengados</td>
            <td className="text-right tabular-nums">{cop.format(f.entregadoOtros)}</td>
          </tr>
          <tr className="border-t font-semibold">
            <td className="pr-6">= Saldo</td>
            <td className={`text-right tabular-nums ${f.saldo < 0 ? "text-red-600" : "text-emerald-700"}`}>
              {cop.format(f.saldo)}
            </td>
          </tr>
        </tbody>
      </table>
      {verDetalle && (
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Un saldo negativo queda como <b>anticipo de salario</b> del mismo corte y no pasa a la quincena siguiente.
          Los descuentos que los otros devengados no alcanzan a cubrir quedan como <b>descuento sin cubrir</b>.
        </p>
        <p>
          Referencia MGX: 216 Otros devengados {cop.format(f.mgx216)} · 546 Anticipo salario {cop.format(f.mgx546)}.
          {Math.abs(f.mgx216 - f.otrosDevengados) > 1 && " El cálculo no coincide con el 216: revisar con Nómina antes de entregar."}
        </p>
      </div>
      )}
    </div>
  );
}

function Entregas({
  entregas,
  puedeAnular,
  onAnular,
}: {
  entregas: EntregaOtros[];
  puedeAnular: boolean;
  onAnular: (e: EntregaOtros) => void;
}) {
  if (entregas.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-white">
      <div className="border-b px-4 py-2 text-sm font-semibold">Entregas de la quincena ({entregas.length})</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Conductor</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-right">Saldo después</th>
              <th className="px-3 py-2 text-left">Registró</th>
              <th className="px-3 py-2 text-left">Observación</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {entregas.map((e) => (
              <tr key={e.id} className={`border-t border-slate-100 ${e.estado === "anulada" ? "text-slate-400 line-through" : ""}`}>
                <td className="px-3 py-2">{fmtFecha(e.fecha)}</td>
                <td className="px-3 py-2">
                  {e.conductor_nombre ?? e.cedula_conductor}
                  <span className="ml-1 text-xs text-muted-foreground">{e.codigo_conductor ?? ""}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{cop.format(e.valor_entregado)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cop.format(e.saldo_despues)}</td>
                <td className="px-3 py-2 text-xs">{e.registrada_por_email ?? "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {e.estado === "anulada" ? `Anulada: ${e.anulada_motivo ?? ""}` : e.observacion ?? ""}
                </td>
                <td className="px-3 py-2 text-right">
                  {puedeAnular && e.estado === "activa" && (
                    <Button size="sm" variant="ghost" onClick={() => onAnular(e)}>
                      <Undo2 className="mr-1 h-4 w-4" /> Anular
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DialogoEntrega({
  fila,
  codPer,
  onClose,
  onHecho,
}: {
  fila: FilaCruce;
  codPer: string;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [valor, setValor] = useState(String(Math.floor(fila.porEntregar)));
  const [observacion, setObservacion] = useState("");
  const [pendiente, start] = useTransition();
  const numero = Number(valor.replace(/\D/g, ""));
  const valido = numero > 0 && numero <= fila.porEntregar;

  function confirmar() {
    start(async () => {
      const r = await entregarOtrosDevengados({ codPer, cedula: fila.cedula, valor: numero, observacion: observacion || null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Entrega registrada. Saldo por entregar: ${cop.format(r.saldoDespues)}`);
      onHecho();
    });
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !pendiente && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entregar otros devengados</DialogTitle>
          <DialogDescription>
            {fila.nombre} · {fila.cedula} · nómina {codPer}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span>Saldo por entregar</span>
            <b className="tabular-nums text-emerald-700">{cop.format(fila.porEntregar)}</b>
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Valor a entregar</span>
            <Input inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} />
          </label>
          {!valido && valor !== "" && (
            <p className="text-xs text-red-600">El valor debe ser mayor que cero y no superar el saldo.</p>
          )}
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Observación (opcional)</span>
            <Textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pendiente}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!valido || pendiente}>
            {pendiente ? "Registrando…" : `Entregar ${valido ? cop.format(numero) : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoAnular({
  entrega,
  onClose,
  onHecho,
}: {
  entrega: EntregaOtros;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [pendiente, start] = useTransition();

  function confirmar() {
    start(async () => {
      const r = await anularEntregaOtrosDevengados({ id: entrega.id, motivo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Entrega anulada: el valor vuelve a quedar por entregar.");
      onHecho();
    });
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !pendiente && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular entrega</DialogTitle>
          <DialogDescription>
            {entrega.conductor_nombre} · {cop.format(entrega.valor_entregado)} del {fmtFecha(entrega.fecha)}
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">Motivo (queda en la auditoría)</span>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pendiente}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={motivo.trim().length < 5 || pendiente}>
            {pendiente ? "Anulando…" : "Anular entrega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function DialogoTraslado({
  fila,
  periodo,
  onClose,
  onHecho,
}: {
  fila: FilaCruce;
  periodo: PeriodoNomina;
  onClose: () => void;
  onHecho: () => void;
}) {
  const [observacion, setObservacion] = useState("");
  const [pendiente, start] = useTransition();
  const sig = siguienteCorte(periodo.quincena);
  function confirmar() {
    start(async () => {
      const r = await trasladarSaldoNegativo({ codPer: periodo.codigo, cedula: fila.cedula, observacion: observacion || null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Saldo llevado a cero: ${cop.format(r.valor)} se descuenta en ${r.corteSiguiente}.`);
      onHecho();
    });
  }
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !pendiente && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Llevar el saldo a cero</DialogTitle>
          <DialogDescription>
            {fila.nombre} · {fila.cedula} · nómina {periodo.codigo}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Saldo negativo del corte</span>
            <b className="tabular-nums text-red-600">{cop.format(fila.saldoNegativo)}</b>
          </div>
          <p className="text-muted-foreground">
            Se registra un ajuste a cero en este corte y un descuento «Saldo del corte anterior» por el mismo valor en la{" "}
            {sig.quincena === 1 ? "1.ª" : "2.ª"} quincena de {sig.periodo} ({fmtFecha(sig.ini)} al {fmtFecha(sig.fin)}).
          </p>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Observación (opcional)</span>
            <Textarea rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pendiente}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={pendiente}>
            {pendiente ? "Registrando…" : "Llevar a cero"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Traslados de saldo que tocan el corte: los que salen y los que llegan. */
function Traslados({
  novedades,
  puedeAnular,
  onAnulado,
}: {
  novedades: Cruce["novedades"];
  puedeAnular: boolean;
  onAnulado: () => void;
}) {
  const [pendiente, start] = useTransition();
  if (novedades.length === 0) return null;
  function anular(id: string) {
    const motivo = window.prompt("Motivo de la anulación (se anulan el ajuste y el descuento del corte siguiente):");
    if (!motivo || motivo.trim().length < 5) return;
    start(async () => {
      const r = await anularNovedad({ id, motivo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Traslado anulado en los dos cortes.");
      onAnulado();
    });
  }
  return (
    <div className="rounded-xl border border-border bg-white">
      <div className="border-b px-4 py-2 text-sm font-semibold">Saldos negativos trasladados ({novedades.length})</div>
      <table className="w-full text-sm">
        <tbody>
          {novedades.map((n) => (
            <tr key={n.id} className="border-t border-slate-100">
              <td className="px-3 py-2">{n.conductor_nombre}</td>
              <td className="px-3 py-2">{NOMBRE_NOVEDAD[n.tipo]}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${novedadSuma(n.tipo) ? "text-emerald-700" : "text-red-600"}`}>
                {novedadSuma(n.tipo) ? "+" : "−"}
                {cop.format(n.valor)}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{n.observacion}</td>
              <td className="px-3 py-2 text-xs">{n.registrada_por_email}</td>
              <td className="px-3 py-2 text-right">
                {puedeAnular && (
                  <Button size="sm" variant="ghost" disabled={pendiente} onClick={() => anular(n.id)}>
                    <Undo2 className="mr-1 h-4 w-4" /> Anular
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CierreQuincena({
  cruce,
  puedeCerrar,
  esAdmin,
  pendientes,
  onCambio,
}: {
  cruce: Cruce;
  puedeCerrar: boolean;
  esAdmin: boolean;
  pendientes: { porEntregar: number; negativos: number };
  onCambio: () => void;
}) {
  const [pendiente, start] = useTransition();
  const [faltan, setFaltan] = useState<string[]>([]);
  const c = cruce.cierre;
  const q = cruce.periodo.quincena;

  function cerrar() {
    if (!window.confirm(`¿Cerrar la ${nombreCorte(q)}? Después no admite entregas ni descuentos, y se habilita la quincena siguiente.`)) return;
    start(async () => {
      const r = await cerrarQuincena({ codPer: cruce.periodo.codigo });
      if (!r.ok) {
        toast.error(r.error);
        setFaltan(r.pendientes ?? []);
        return;
      }
      setFaltan([]);
      toast.success(`${nombreCorte(q)} cerrada.`);
      onCambio();
    });
  }
  function reabrir() {
    const motivo = window.prompt("Motivo de la reapertura (queda en la auditoría):");
    if (!motivo || motivo.trim().length < 5) return;
    start(async () => {
      const r = await reabrirQuincena({ codPer: cruce.periodo.codigo, motivo });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${nombreCorte(q)} reabierta.`);
      onCambio();
    });
  }

  if (c?.estado === "cerrado") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <span className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Quincena cerrada el {fmtFecha(c.cerrado_at.slice(0, 10))} por {c.cerrado_por_email ?? "—"}. No admite entregas ni descuentos.
        </span>
        {esAdmin && (
          <Button size="sm" variant="outline" onClick={reabrir} disabled={pendiente}>
            <LockOpen className="mr-1 h-4 w-4" /> Reabrir
          </Button>
        )}
      </div>
    );
  }

  const listo = cruce.anteriorCerrado && pendientes.porEntregar === 0 && pendientes.negativos === 0;
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!cruce.anteriorCerrado && cruce.anterior ? (
            <span className="font-medium text-amber-700">
              Primero hay que cerrar la {nombreCorte(cruce.anterior)}: mientras tanto esta quincena no admite entregas.
            </span>
          ) : listo ? (
            <span className="font-medium text-emerald-700">Todo entregado: la quincena se puede cerrar.</span>
          ) : (
            <span>
              Para cerrar la quincena falta entregar a <b>{pendientes.porEntregar}</b> conductor(es)
              {pendientes.negativos > 0 && (
                <>
                  {" "}y trasladar <b>{pendientes.negativos}</b> saldo(s) negativo(s)
                </>
              )}
              .
            </span>
          )}
          {c?.estado === "reabierto" && (
            <div className="text-xs text-muted-foreground">
              Reabierta el {fmtFecha(String(c.reabierto_at).slice(0, 10))} por {c.reabierto_por_email}: {c.reabierto_motivo}
            </div>
          )}
        </div>
        {puedeCerrar && (
          <Button size="sm" onClick={cerrar} disabled={!listo || pendiente}>
            <Lock className="mr-1 h-4 w-4" /> {pendiente ? "Cerrando…" : "Cerrar quincena"}
          </Button>
        )}
      </div>
      {faltan.length > 0 && (
        <ul className="mt-2 max-h-40 overflow-auto rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          {faltan.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
