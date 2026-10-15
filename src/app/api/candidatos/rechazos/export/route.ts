import { NextRequest, NextResponse } from "next/server";
import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { getEtapasReporte, getRechazos, parseFiltrosRechazos } from "@/lib/rechazos/datos";
import { resumirRechazos } from "@/lib/rechazos/reporte";
import { construirExcelRechazos, nombreArchivoRechazos } from "@/lib/rechazos/excel";

/** Excel del reporte de rechazos por fase con los filtros de la pantalla. */
export async function GET(request: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const filtros = parseFiltrosRechazos(request.nextUrl.searchParams);
  const [filas, etapas] = await Promise.all([getRechazos(filtros), getEtapasReporte()]);
  const buffer = await construirExcelRechazos({ resumen: resumirRechazos(filas, etapas), filas, filtros });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivoRechazos(filtros)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
