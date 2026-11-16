import { redirect } from "next/navigation";
import { getCurrentPermissions, puedeEditarEn, tienePermiso } from "@/lib/permissions";
import { leerAjustes, leerMensajes, valoresFijos } from "@/lib/seleccion/servidor";
import { leerConfigSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";
import { getAgenteConClaves } from "@/lib/comunicaciones/agente/config";
import SeleccionClient from "./SeleccionClient";

export const dynamic = "force-dynamic";

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
        horaDesde: seguimiento.config.horaDesde,
        horaHasta: seguimiento.config.horaHasta,
        horasEspera: seguimiento.config.horasEspera,
        horasEscalar: seguimiento.config.horasEscalar,
        esperaAgente: agente.config.esperaSegundos,
      }}
    />
  );
}
