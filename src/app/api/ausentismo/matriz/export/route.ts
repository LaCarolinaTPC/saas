import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { getMatriz } from "@/lib/ausentismo/matriz";
import { esSegmentoCobro } from "@/lib/ausentismo/matriz-reglas";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Encabezados de la hoja "BASE DE AUSENTISMO", en el orden del Excel de RRHH. */
const ENCABEZADOS = [
  "CONSECUTIVO INCAPACIDAD",
  "DOCUMENTO DE IDENTIDAD",
  "NOMBRE",
  "CARGO",
  "INDICADOR PRORROGA",
  "DIAS PERDIDOS",
  "ORIGEN",
  "FECHA INICIO",
  "FECHA FIN",
  "MES INICIO",
  "DIA DE OCURRENCIA DEL EVENTO",
  "EPS",
  "IPS",
  "PROFESIONAL RESPONSABLE",
  "TIPO DE CONDUCTOR",
  "ESTADO",
  "CIE10",
  "DX",
  "SOAT",
  "GRUPO RELACIONADOS DE DIAGNOSTICOS (GRD)",
];

function fechaExcel(iso: string | null): Date | "" {
  return iso ? new Date(`${iso}T00:00:00`) : "";
}

/**
 * Exporta la matriz con las mismas columnas del archivo original, título en
 * la fila 1 y encabezados en la fila 2, así el archivo se puede volver a
 * cargar con el lector existente. Por defecto solo salen los registros
 * cerrados (la matriz oficial); `todo=1` incluye los pendientes.
 */
export async function GET(request: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const valida = (v: string | null) => (v && FECHA_RE.test(v) ? v : null);
  const hasta = valida(sp.get("hasta")) ?? hoy;
  const desde = valida(sp.get("desde")) ?? `${hasta.slice(0, 4)}-01-01`;
  const todo = sp.get("todo") === "1";
  const estadoFiltro = sp.get("estado");

  const filas = await getMatriz({
    desde,
    hasta,
    eps: sp.get("eps") || null,
    origen: sp.get("origen") || null,
    estado: todo ? (estadoFiltro || null) : "cerrado",
    revision: sp.get("rev") === "1",
    q: sp.get("q") || null,
    cobro: esSegmentoCobro(sp.get("cobro")) ? (sp.get("cobro") as "eps" | "arl") : null,
    diasMin: /^\d{1,3}$/.test(sp.get("dmin") ?? "") ? Number(sp.get("dmin")) : null,
  });

  const datos = filas.map((r) => [
    r.consecutivo_incapacidad ?? "",
    r.cedula,
    r.nombre ?? "",
    r.cargo ?? "",
    r.indicador_prorroga ?? "",
    r.dias_it_pagados ?? "",
    r.origen ?? "",
    fechaExcel(r.fecha_inicio),
    fechaExcel(r.fecha_fin),
    r.mes_inicio ?? "",
    r.dia_ocurrencia ?? "",
    r.eps ?? "",
    r.ips ?? "",
    r.profesional_responsable ?? "",
    r.tipo_conductor ?? "",
    r.estado ?? "",
    r.cie10 ?? "",
    r.diagnostico ?? "",
    r.soat ?? "",
    r.grd ?? "",
  ]);

  const hoja = XLSX.utils.aoa_to_sheet(
    [[`MATRIZ DE AUSENTISMO ${hasta.slice(0, 4)} · corte ${hasta}${todo ? " · incluye pendientes" : ""}`], ENCABEZADOS, ...datos],
    { cellDates: true }
  );
  // Fechas en AA/MM/DD, como las lee RRHH. Columnas H e I, desde la fila 3.
  for (let i = 0; i < datos.length; i++) {
    for (const col of ["H", "I"]) {
      const celda = hoja[`${col}${i + 3}`];
      if (celda && celda.t === "d") celda.z = "yy/mm/dd";
    }
  }
  hoja["!cols"] = ENCABEZADOS.map((h, i) => ({
    wch: i === 2 || i === 12 || i === 13 || i === 17 ? 34 : Math.max(10, Math.min(h.length + 2, 26)),
  }));

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "BASE DE AUSENTISMO");
  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx", cellDates: true }) as Buffer;

  const nombre = `MATRIZ DE AUSENTISMO ${hasta.slice(0, 4)} CORTE ${hasta.slice(8, 10)}.${hasta.slice(5, 7)}.${hasta.slice(2, 4)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}
