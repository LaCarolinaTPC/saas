import { canAccess, canAccessSub, getCurrentPermissions } from "@/lib/permissions";
import {
  listarPeriodos,
  marcaGema,
  ultimasCargas,
  type CargaFila,
  type PeriodoFila,
} from "@/lib/financiera/consolidacion";
import { SinAcceso } from "../../sin-acceso";
import { pestanasPermitidas } from "../marco";
import { DatosVista } from "./datos-vista";

export const dynamic = "force-dynamic";

/**
 * Datos de Gestión de flota: estado de cada mes (abierto, cerrado o
 * reabierto), la consolidación desde GEMA a demanda y la bitácora. La carga
 * del archivo contable (fase 4 del plan) se añade en esta misma pantalla.
 */
export default async function DatosPage() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "financiera")) return <SinAcceso />;
  if (!canAccessSub(perms, "financiera", "fin_datos")) {
    return (
      <SinAcceso
        titulo="Datos de flota"
        motivo="Consolidar y cargar datos cambia lo que ve todo el módulo; tu tipo de usuario solo consulta. Pide la sub-función «Datos» a Administración."
      />
    );
  }

  let periodos: PeriodoFila[] = [];
  let cargas: CargaFila[] = [];
  let marca: { fecha: string | null; corridoAt: string | null } = { fecha: null, corridoAt: null };
  let fallo: string | null = null;
  try {
    [periodos, cargas, marca] = await Promise.all([listarPeriodos(), ultimasCargas(25), marcaGema()]);
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }

  return <DatosVista periodos={periodos} cargas={cargas} marca={marca} fallo={fallo} pestanas={pestanasPermitidas(perms)} />;
}
