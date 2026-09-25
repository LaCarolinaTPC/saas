import { redirect } from "next/navigation";
import { RUTA_PORTAL, getCuentaPortal, secretoSesion } from "@/lib/portal-afiliados/servidor";
import { FormularioIngreso } from "../formularios";
import { TarjetaPortal } from "../marco";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal de afiliados · La Carolina" };

export default async function IngresoPortal() {
  if (await getCuentaPortal()) redirect(RUTA_PORTAL);
  return (
    <TarjetaPortal titulo="Ingresar">
      {(await secretoSesion()) ? (
        <FormularioIngreso />
      ) : (
        <p className="text-center text-sm text-gray-600">El portal no está disponible en este momento.</p>
      )}
    </TarjetaPortal>
  );
}
