import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentPermissions, canAccessSub } from "@/lib/permissions";
import { PLAZOS, fechaCorta } from "@/lib/tesoreria/calendario-pago";
import {
  COLUMNAS_DIA, lineasDeducciones, liquidar, prefijoCierre, resumenPorAfiliado, type FilaTercero,
} from "@/lib/tesoreria/liquidacion-afiliados";
import { armarPagos, periodosQuePaganEl, rangoDe } from "@/lib/tesoreria/pagos-afiliados";
import {
  getFilasAfiliados, getPropietarios, getReglasPago, getUltimoDiaSincronizado,
} from "@/lib/tesoreria/liquidacion-afiliados-data";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const PESOS = '"$"#,##0;"$"-#,##0';
const NOTA = "Líquido antes de obligaciones: el pago de obligaciones (descuentos otros) de GEMA aún no está en Gestivo.";

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/** Hoja con el detalle diario, una fila por cierre, con las columnas del GAF-R-12. */
function hojaDetalle(wb: ExcelJS.Workbook, nombre: string, filas: FilaTercero[], conPropietario: boolean) {
  const ws = wb.addWorksheet(nombre.slice(0, 31));
  const cols: Partial<ExcelJS.Column>[] = [
    ...(conPropietario ? [{ header: "Cédula propietario", key: "cedula", width: 16 }, { header: "Propietario", key: "prop", width: 32 }] : []),
    { header: "Vehículo", key: "veh", width: 9 },
    { header: "Placa", key: "placa", width: 9 },
    { header: "Fecha", key: "fecha", width: 11 },
    { header: "Cierre", key: "cierre", width: 9 },
    { header: "Ruta", key: "ruta", width: 20 },
    { header: "Conductor", key: "conduc", width: 9 },
    { header: "Nombre conductor", key: "nconduc", width: 30 },
    ...COLUMNAS_DIA.map((c) => ({ header: c.titulo, key: c.campo, width: c.formato === "pesos" ? 13 : 9 })),
  ];
  ws.columns = cols;
  for (const f of filas) {
    ws.addRow({
      cedula: f.cedula_propietario, prop: f.propietario_nombre, veh: f.codigo_vehiculo, placa: f.placa,
      fecha: f.fecha, cierre: prefijoCierre(f.tipo_cierre), ruta: f.ruta, conduc: f.codigo_conductor, nconduc: f.conductor_nombre,
      ...Object.fromEntries(COLUMNAS_DIA.map((c) => [c.campo, Number(f[c.campo] ?? 0)])),
    });
  }
  for (const c of COLUMNAS_DIA) if (c.formato === "pesos") ws.getColumn(c.campo).numFmt = PESOS;
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

/**
 * Excel de la liquidación de afiliados con los mismos filtros de la pantalla:
 *  - `cedula` + `desde` + `hasta`: un afiliado, una hoja por vehículo.
 *  - `vista=pagos&pago=AAAA-MM-DD`: los afiliados que se pagan en esa fecha.
 *  - `vista=rango&desde&hasta`: todos los afiliados del rango.
 */
export async function GET(request: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccessSub(perms, "tesoreria", "liq_afiliados")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const valida = (v: string | null) => (v && FECHA_RE.test(v) ? v : null);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestivo";
  let archivo: string;

  const cedula = sp.get("cedula");
  if (cedula) {
    const desde = valida(sp.get("desde"));
    const hasta = valida(sp.get("hasta"));
    if (!desde || !hasta || desde > hasta) return NextResponse.json({ error: "Rango inválido" }, { status: 400 });
    const [filas, fichas] = await Promise.all([getFilasAfiliados({ desde, hasta, cedula }), getPropietarios([cedula])]);
    const l = liquidar(cedula, filas);
    const ficha = fichas.get(cedula);
    const res = wb.addWorksheet("Resumen");
    res.columns = [{ width: 34 }, ...l.vehiculos.map(() => ({ width: 16 })), { width: 16 }];
    res.addRow([`Liquidación de ${l.nombre ?? ficha?.nombre ?? cedula}`]).font = { bold: true, size: 13 };
    res.addRow([`CC ${cedula}${ficha?.codigo ? ` · ${ficha.codigo}` : ""} · del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`]);
    res.addRow([NOTA]).font = { italic: true, color: { argb: "FF1E40AF" } };
    res.addRow([]);
    res.addRow(["Concepto", ...l.vehiculos.map((v) => `Vehículo ${v.codigo}`), "Total"]).font = { bold: true };
    const filasResumen: [string, (r: typeof l.resumen) => number][] = [
      ["Base liquidación (bruto)", (r) => r.base],
      ...lineasDeducciones(l.resumen).map((x, i) => [x.etiqueta, (r: typeof l.resumen) => lineasDeducciones(r)[i].valor] as [string, (r: typeof l.resumen) => number]),
      ["Total deducciones (sin obligaciones)", (r) => r.totalDeducciones],
      ["Líquido antes de obligaciones", (r) => r.liquido],
    ];
    for (const [etiqueta, valor] of filasResumen) {
      const row = res.addRow([etiqueta, ...l.vehiculos.map((v) => valor(v.resumen)), valor(l.resumen)]);
      row.eachCell((c, n) => { if (n > 1) c.numFmt = PESOS; });
      if (etiqueta.startsWith("Líquido") || etiqueta.startsWith("Total")) row.font = { bold: true };
    }
    for (const v of l.vehiculos) hojaDetalle(wb, `Vehículo ${v.codigo}`, v.filas, false);
    archivo = `liquidacion_${ficha?.codigo ?? cedula}_${desde}_a_${hasta}`;
  } else {
    const hoy = hoyBogota();
    let filas: FilaTercero[] = [];
    let titulo: string;
    let resumen: { cedula: string; nombre: string | null; codigo: string | null; plazo: string; periodo: string; vehiculos: string[]; viajes: number; r: ReturnType<typeof resumenPorAfiliado>[number]["resumen"] }[];
    if (sp.get("vista") === "rango") {
      const desde = valida(sp.get("desde"));
      const hasta = valida(sp.get("hasta"));
      if (!desde || !hasta || desde > hasta) return NextResponse.json({ error: "Rango inválido" }, { status: 400 });
      filas = await getFilasAfiliados({ desde, hasta });
      const fichas = await getPropietarios([...new Set(filas.map((f) => f.cedula_propietario))]);
      const { reglas } = await getReglasPago();
      resumen = resumenPorAfiliado(filas).map((x) => ({
        cedula: x.cedula, nombre: x.nombre, codigo: fichas.get(x.cedula)?.codigo ?? null,
        plazo: reglas[fichas.get(x.cedula)?.plazo ?? "SEMANAL"].etiqueta, periodo: `${desde} a ${hasta}`,
        vehiculos: x.vehiculos, viajes: x.viajes, r: x.resumen,
      }));
      titulo = `Afiliados del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
      archivo = `liquidacion_afiliados_${desde}_a_${hasta}`;
    } else {
      const pago = valida(sp.get("pago"));
      if (!pago) return NextResponse.json({ error: "Falta la fecha de pago" }, { status: 400 });
      const [{ reglas }, ultimo] = await Promise.all([getReglasPago(), getUltimoDiaSincronizado()]);
      const periodos = periodosQuePaganEl(reglas, pago);
      const rango = rangoDe(periodos);
      const todas = rango ? await getFilasAfiliados(rango) : [];
      const fichas = await getPropietarios([...new Set(todas.map((f) => f.cedula_propietario))]);
      const pagos = armarPagos({ periodos, filas: todas, propietarios: fichas, hoy, ultimoSincronizado: ultimo });
      // El detalle lleva solo los días del periodo de cada afiliado.
      filas = todas.filter((f) => {
        const pp = periodos[fichas.get(f.cedula_propietario)?.plazo ?? "SEMANAL"];
        return !!pp && f.fecha >= pp.periodo.desde && f.fecha <= pp.periodo.hasta;
      });
      resumen = pagos.map((x) => ({
        cedula: x.cedula, nombre: x.nombre, codigo: x.codigo, plazo: reglas[x.plazo].etiqueta,
        periodo: x.pago.periodo.etiqueta, vehiculos: x.vehiculos, viajes: x.viajes, r: x.resumen,
      }));
      titulo = `Pagos del ${fechaCorta(pago)} · ${PLAZOS.filter((p) => periodos[p]).map((p) => `${reglas[p].etiqueta}: ${periodos[p]!.periodo.etiqueta}`).join(" · ")}`;
      archivo = `liquidacion_afiliados_pago_${pago}`;
    }
    const ws = wb.addWorksheet("Afiliados");
    ws.addRow([titulo]).font = { bold: true, size: 12 };
    ws.addRow([NOTA]).font = { italic: true, color: { argb: "FF1E40AF" } };
    ws.addRow([]);
    const cab = ["Código", "Cédula", "Afiliado", "Plazo", "Periodo", "Vehículos", "Viajes", "Bruto", "Cartulina", "Póliza",
      "Anticipo", "Combustible", "Rtica", "Admon", "Incentivo", "Otras", "Deducciones", "Líquido"];
    ws.addRow(cab).font = { bold: true };
    for (const x of resumen) {
      const row = ws.addRow([
        x.codigo, x.cedula, x.nombre, x.plazo, x.periodo, x.vehiculos.join(", "), x.viajes, x.r.base, x.r.cartulina,
        x.r.poliza, x.r.anticipo, x.r.combustible, x.r.rtica, x.r.admon, x.r.incentivo, x.r.facturas + x.r.sitra,
        x.r.totalDeducciones, x.r.liquido,
      ]);
      row.eachCell((c, n) => { if (n >= 8) c.numFmt = PESOS; });
    }
    ws.columns.forEach((c, i) => { c.width = [9, 13, 34, 11, 30, 16][i] ?? 13; });
    ws.views = [{ state: "frozen", ySplit: 4 }];
    hojaDetalle(wb, "Detalle diario", filas, true);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
