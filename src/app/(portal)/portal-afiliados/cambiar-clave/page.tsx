import { redirect } from "next/navigation";
import { RUTA_PORTAL, getCuentaPortal } from "@/lib/portal-afiliados/servidor";
import { FormularioCambioClave } from "../formularios";
import { BotonSalir, TarjetaPortal } from "../marco";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cambiar contraseña · Portal de afiliados" };

export default async function CambiarClavePortal() {
  const cuenta = await getCuentaPortal();
  if (!cuenta) redirect(`${RUTA_PORTAL}/login`);
  return (
    <TarjetaPortal titulo="Cambiar contraseña">
      <FormularioCambioClave obligatorio={cuenta.debeCambiarClave} />
      <div className="mt-4 flex justify-center"><BotonSalir /></div>
    </TarjetaPortal>
  );
}
