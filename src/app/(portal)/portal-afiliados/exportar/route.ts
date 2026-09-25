import { NextRequest, NextResponse } from "next/server";
import { getCuentaPortal, registrarAcceso } from "@/lib/portal-afiliados/servidor";
import { rangoPedido } from "@/lib/tesoreria/detalle-afiliado";
import { libroAfiliado, respuestaExcel } from "@/lib/tesoreria/liquidacion-excel";

/** Excel de la liquidación del afiliado de la sesión. La cédula nunca viene en la URL. */
export async function GET(request: NextRequest) {
  const cuenta = await getCuentaPortal();
  if (!cuenta || cuenta.debeCambiarClave) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const sp = request.nextUrl.searchParams;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const { desde, hasta } = rangoPedido(sp.get("desde"), sp.get("hasta"), hoy, { desde: hoy, hasta: hoy });
  const { buffer, archivo } = await libroAfiliado(cuenta.cedula, desde, hasta);
  await registrarAcceso({ evento: "exportacion", cuentaId: cuenta.id, email: cuenta.email, detalle: { desde, hasta } });
  return respuestaExcel(buffer, archivo);
}
