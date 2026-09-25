import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentPermissions, canAccessSub } from "@/lib/permissions";
import { PLAZOS, fechaCorta } from "@/lib/tesoreria/calendario-pago";
import { resumenPorAfiliado, type FilaTercero } from "@/lib/tesoreria/liquidacion-afiliados";
import { NOTA, PESOS, hojaDetalle, libroAfiliado, respuestaExcel } from "@/lib/tesoreria/liquidacion-excel";
import { armarPagos, periodosQuePaganEl, rangoDe } from "@/lib/tesoreria/pagos-afiliados";
import {
  getFilasAfiliados, getPropietarios, getReglasPago, getUltimoDiaSincronizado,
} from "@/lib/tesoreria/liquidacion-afiliados-data";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
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
    const { buffer, archivo } = await libroAfiliado(cedula, desde, hasta);
    return respuestaExcel(buffer, archivo);
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
      "Anticipo", "Combustible", "Rtica", "Admon", "Incentivo", "Otras", "Pago obligaciones", "Deducciones", "Líquido",
      "Producido neto"];
    ws.addRow(cab).font = { bold: true };
    for (const x of resumen) {
      const row = ws.addRow([
        x.codigo, x.cedula, x.nombre, x.plazo, x.periodo, x.vehiculos.join(", "), x.viajes, x.r.base, x.r.cartulina,
        x.r.poliza, x.r.anticipo, x.r.combustible, x.r.rtica, x.r.admon, x.r.incentivo, x.r.facturas + x.r.sitra,
        x.r.obligaciones, x.r.totalDeducciones, x.r.liquido, x.r.producidoNeto,
      ]);
      row.eachCell((c, n) => { if (n >= 8) c.numFmt = PESOS; });
    }
    ws.columns.forEach((c, i) => { c.width = [9, 13, 34, 11, 30, 16][i] ?? 13; });
    ws.views = [{ state: "frozen", ySplit: 4 }];
    hojaDetalle(wb, "Detalle diario", filas, true);
  }

  return respuestaExcel((await wb.xlsx.writeBuffer()) as ArrayBuffer, archivo);
}
