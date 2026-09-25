import { redirect } from "next/navigation";
import { RUTA_PORTAL, getCuentaPortal, registrarAcceso } from "@/lib/portal-afiliados/servidor";
import { cargarDetalleAfiliado } from "@/lib/tesoreria/detalle-afiliado";
import { getReglasPago, getUltimoDiaSincronizado } from "@/lib/tesoreria/liquidacion-afiliados-data";
import { DetalleAfiliadoClient } from "@/app/(dashboard)/tesoreria/liquidacion-afiliados/detalle-client";
import { BotonSalir } from "./marco";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi liquidación · Portal de afiliados" };

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/**
 * Portal de afiliados: la liquidación del propio afiliado. La cédula sale de
 * la sesión (afiliado_cuentas), nunca de la URL: solo ve sus vehículos y solo
 * en los días en que GEMA los liquidó a su nombre.
 */
export default async function MiLiquidacion({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string }> }) {
  const cuenta = await getCuentaPortal();
  if (!cuenta) redirect(`${RUTA_PORTAL}/login`);
  if (cuenta.debeCambiarClave) redirect(`${RUTA_PORTAL}/cambiar-clave`);
  const sp = await searchParams;
  const hoy = hoyBogota();
  const [{ reglas }, ultimoSincronizado] = await Promise.all([getReglasPago(), getUltimoDiaSincronizado()]);
  const d = await cargarDetalleAfiliado({ cedula: cuenta.cedula, desde: sp.desde, hasta: sp.hasta, hoy, reglas });
  await registrarAcceso({ evento: "consulta", cuentaId: cuenta.id, email: cuenta.email, detalle: { desde: d.desde, hasta: d.hasta } });
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <DetalleAfiliadoClient
        hoy={hoy}
        reglas={reglas}
        ultimoSincronizado={ultimoSincronizado}
        cedula={cuenta.cedula}
        {...d}
        volverA="pagos"
        modo="portal"
        acciones={<BotonSalir />}
      />
    </div>
  );
}
