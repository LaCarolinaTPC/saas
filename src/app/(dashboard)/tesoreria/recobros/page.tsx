import { redirect } from "next/navigation";
import { HandCoins } from "lucide-react";
import { getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { PageHeader } from "@/components/layout/page-header";
import { hoyBogota } from "@/lib/operativo/constants";
import { getConductoresRetirados, getDatosRecobros, getViajesConductorPorDia } from "@/lib/tesoreria/recobros-data";
import { ESTADOS_CAJERO } from "@/lib/tesoreria/recobros";
import { avisosRecobros, diasParaViajes, esClaveAviso, esDeCajero, filaBandeja, type FilaBandeja } from "@/lib/tesoreria/recobros-vista";
import { rolRecobros } from "@/lib/tesoreria/recobros-acceso";
import { refrescarRecobrosDelDia } from "@/lib/gema/recobros-al-dia";
import { RecobrosClient } from "./recobros-client";

export const dynamic = "force-dynamic";
// El refresco de GEMA al abrir puede tardar unos segundos.
export const maxDuration = 60;

/**
 * Tesorería · Recobros: una sola página para seguir cada recobro de
 * principio a fin (requerimiento de Tesorería del 28-oct-2026). Resumen del
 * periodo, flujo de estados, bandeja con semáforo, detalle con la línea de
 * tiempo y rankings de conductores y busetas. El cajero sin otro rol solo ve
 * los recobros por cobrar. En el detalle, cada rol tiene sus acciones:
 * gestión diaria y pago (caja), instrucción (Operativo), cobrar o no cobrar
 * sin conteo (subgerencia), correcciones (las valida el director de
 * Mantenimiento), incobrable y liquidación definitiva (directora).
 */
export default async function RecobrosPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const perms = await getCurrentPermissions();
  const rol = rolRecobros(perms);
  if (!rol.ve) redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");

  // Nunca lanza: si GEMA falla se muestra lo guardado con el aviso.
  const refresco = await refrescarRecobrosDelDia();
  const hoy = hoyBogota();
  const datos = await getDatosRecobros();
  const nombres = new Map(datos.catalogo.map((c) => [c.clave, c.nombre]));
  const nombreResultado = (clave: string) => nombres.get(clave) ?? clave;

  let filas: FilaBandeja[] = datos.recobros.map((s) =>
    filaBandeja(s, datos.gestiones.get(s.id) ?? [], datos.correcciones.get(s.id) ?? [], nombreResultado, hoy));
  const avisos = avisosRecobros(filas, rol.acciones);
  if (rol.soloCajero) filas = filas.filter(esDeCajero);
  const { ver } = await searchParams;
  // Conductores retirados con recobros por cobrar: su saldo va a la liquidación definitiva.
  const retirados = await getConductoresRetirados(
    filas.filter((f) => ESTADOS_CAJERO.has(f.estado.estado) && f.conductorCedula).map((f) => f.conductorCedula!),
  );

  // «No vino a trabajar» frente al despacho de GEMA de ese día (y el de hoy, para el cajero).
  const viajes = await getViajesConductorPorDia(
    filas.flatMap((f) => (f.conductorCedula ? diasParaViajes(f, hoy).map((fecha) => ({ cedula: f.conductorCedula!, fecha })) : [])),
  );
  filas = filas.map((f) => {
    const dias = f.conductorCedula ? diasParaViajes(f, hoy) : [];
    if (!dias.length) return f;
    return { ...f, viajesDelDia: Object.fromEntries(dias.map((d) => [d, viajes.get(`${f.conductorCedula}|${d}`) ?? 0])) };
  });

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Recobros"
        icono={HandCoins}
        descripcion="Cada recobro de la solicitud al pago: revisión, decisión de subgerencia, gestión diaria de caja y rankings."
      />
      <RecobrosClient
        filas={filas}
        catalogo={datos.catalogo}
        acciones={rol.acciones}
        retirados={retirados}
        hoy={hoy}
        disponible={datos.disponible}
        soloCajero={rol.soloCajero}
        actualizadoAt={refresco.actualizadoAt}
        errorGema={refresco.error ?? null}
        avisos={avisos}
        verInicial={esClaveAviso(ver) ? ver : null}
      />
    </div>
  );
}
