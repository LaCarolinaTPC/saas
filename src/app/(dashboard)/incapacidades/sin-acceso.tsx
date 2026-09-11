import { HeartPulse } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

/** Pantalla de denegación del módulo (segunda línea tras el proxy). */
export function SinAcceso({ titulo = "Recuperación de incapacidades", motivo }: { titulo?: string; motivo?: string }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo={titulo} icono={HeartPulse} />
      <div className="p-6">
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-gray-600">
          {motivo ??
            "No tienes acceso a este módulo. Contiene datos personales y de salud de los trabajadores, así que se habilita por solicitud a Administración."}
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
        <code className="rounded bg-white/70 px-1">20260911201033_modulo_de_recuperacion_de_incapacidades_expediente_corte_y_etapa_1.sql</code>.
      </p>
      <p className="mt-2 font-mono text-xs text-amber-800">{mensaje}</p>
    </div>
  );
}
