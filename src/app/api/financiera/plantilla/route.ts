import { NextRequest, NextResponse } from "next/server";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { plantillaCsv } from "@/lib/financiera/archivo-contable";
import { plantillaXlsx } from "@/lib/financiera/cargar-contable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Plantilla del archivo contable: ?formato=csv | xlsx (plan, 6.6). */
export async function GET(req: NextRequest) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) {
    return NextResponse.json({ ok: false, error: "Sin permiso para el módulo Financiera." }, { status: 403 });
  }
  const formato = req.nextUrl.searchParams.get("formato") === "xlsx" ? "xlsx" : "csv";
  if (formato === "csv") {
    return new NextResponse(plantillaCsv(), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="plantilla_contable_financiera.csv"',
        "Cache-Control": "no-store",
      },
    });
  }
  const buffer = await plantillaXlsx();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla_contable_financiera.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
