import { Landmark } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

/** Pantalla de denegación del módulo Financiera (segunda línea tras el proxy). */
export function SinAcceso({ titulo = "Financiera", motivo }: { titulo?: string; motivo?: string }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo={titulo} icono={Landmark} />
      <div className="p-6">
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-gray-600">
          {motivo ??
            "No tienes acceso a este módulo. Contiene los ingresos y costos por vehículo y propietario, así que se habilita por solicitud a Administración."}
        </div>
      </div>
    </div>
  );
}

/** Aviso cuando la base no responde (lo más probable: la migración no se ha corrido). */
export function Fallo({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-medium">No se pudo leer el módulo.</p>
      <p className="mt-1">
        Si acaba de desplegarse, falta correr en el SQL Editor la migración{" "}
        <code className="rounded bg-white/70 px-1">20260921140156_modulo_financiera_consolidado_mensual_y_cargas.sql</code>.
      </p>
      <p className="mt-2 font-mono text-xs text-amber-800">{mensaje}</p>
    </div>
  );
}
