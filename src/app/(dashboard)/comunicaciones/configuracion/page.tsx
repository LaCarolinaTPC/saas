import { redirect } from "next/navigation";
import { getCurrentPermissions } from "@/lib/permissions";
import { getCanal } from "@/lib/comunicaciones/whatsapp";
import ConfiguracionClient from "./ConfiguracionClient";

/** Configuración del canal de WhatsApp (solo administradores). */
export default async function ConfiguracionCanalPage() {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin) redirect("/comunicaciones");

  const canal = await getCanal();
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
    />
  );
}
