import { NextRequest, NextResponse } from "next/server";
import { getCuentaPortal, registrarAcceso } from "@/lib/portal-afiliados/servidor";
import { leerSoporte, urlSoporte } from "@/lib/tesoreria/soportes";

export const dynamic = "force-dynamic";

/**
 * Soporte para el afiliado de la sesión: solo si es suyo (misma cédula; al
 * subirlo se comprobó que el vehículo era suyo ese día). Queda en la bitácora.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cuenta = await getCuentaPortal();
  if (!cuenta || cuenta.debeCambiarClave) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const s = await leerSoporte((await params).id);
  // Mismo 404 si no existe o si es de otro afiliado: no se delata que exista.
  if (!s || s.cedula !== cuenta.cedula) return NextResponse.json({ error: "Soporte no encontrado" }, { status: 404 });
  const descargar = req.nextUrl.searchParams.get("descargar") === "1";
  const url = await urlSoporte(s.ruta, s.archivoNombre, descargar);
  if (!url) return NextResponse.json({ error: "No se pudo abrir el archivo" }, { status: 502 });
  await registrarAcceso({
    evento: descargar ? "soporte_descargado" : "soporte_visto", cuentaId: cuenta.id, email: cuenta.email,
    detalle: { soporte_id: s.id, vehiculo: s.codigoVehiculo, fecha: s.fecha, archivo: s.archivoNombre },
  });
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}
