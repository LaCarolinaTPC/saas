import { redirect } from "next/navigation";
import { getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import { leerAjustes, leerMensajes, valoresFijos } from "@/lib/seleccion/servidor";
import { leerConfigSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";
import { getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import SeleccionClient from "./SeleccionClient";

export const dynamic = "force-dynamic";
// El chat de prueba (Server Actions de esta página) consulta Croma de verdad y
// el RNMC puede tardar cerca de un minuto: sin esto se corta con el límite por defecto.
export const maxDuration = 300;

/** Selección de conductores: mensajes, plantillas, tiempos y reglas del semáforo (N1–N5, B1). */
export default async function SeleccionConfigPage() {
  const perms = await getCurrentPermissions();
  const puedeEditar = puedeEditarEn(perms, "candidatos.seleccion_config");
  if (!puedeEditar && !tienePermiso(perms, "candidatos.seleccion_config.ver")) redirect("/candidatos");

  const [mensajes, ajustes, seguimiento, agente] = await Promise.all([
    leerMensajes(),
    leerAjustes(),
    leerConfigSeguimiento(),
    getAgenteConClaves(),
  ]);

  return (
    <SeleccionClient
      mensajes={mensajes}
      ajustes={ajustes}
      valores={valoresFijos(ajustes)}
      puedeEditar={puedeEditar}
      disponible={mensajes.length > 0}
      seguimiento={{
        disponible: seguimiento.disponible,
        config: seguimiento.config,
        esperaAgente: agente.config.esperaSegundos,
      }}
    />
  );
}
