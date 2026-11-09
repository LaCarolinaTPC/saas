import { redirect } from "next/navigation";
import { getCurrentPermissions } from "@/lib/permissions";
import { getCanal } from "@/lib/comunicaciones/whatsapp";
import { leerConfigSeguimiento } from "@/lib/comunicaciones/seguimiento-ejecutar";
import ConfiguracionClient from "./ConfiguracionClient";
import SeguimientoConfig from "./SeguimientoConfig";

/** Configuración del canal de WhatsApp y del seguimiento a quien no responde (solo administradores). */
export default async function ConfiguracionCanalPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) redirect("/comunicaciones");

  const [canal, seguimiento] = await Promise.all([getCanal(), leerConfigSeguimiento()]);
  return (
    <ConfiguracionClient
      actual={
        canal
          ? {
              phoneNumberId: canal.phoneNumberId,
              wabaId: canal.wabaId,
              verifyToken: canal.verifyToken,
              numeroMostrado: canal.numeroMostrado,
              tieneToken: true,
              tieneAppSecret: !!canal.appSecret,
              origen: canal.origen,
            }
          : null
      }
    >
      <SeguimientoConfig actual={seguimiento.config} disponible={seguimiento.disponible} />
    </ConfiguracionClient>
  );
}
