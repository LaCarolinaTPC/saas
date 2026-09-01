import type { Metadata } from "next";
import { ReportarClient } from "./reportar-client";

// Ruta pública: el conductor entra desde su celular sin cuenta de Gestivo, se
// identifica con la cédula y reporta. No se comprueban permisos a propósito.
export const metadata: Metadata = {
  title: "Reportar daño · Transportes La Carolina",
  description: "Formulario para que los conductores reporten daños del vehículo",
  robots: { index: false, follow: false },
};

export default function ReportarDanoPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <ReportarClient />
    </div>
  );
}
