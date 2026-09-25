/* eslint-disable @next/next/no-img-element -- logo estático pequeño, sin optimización */
import { LogOut } from "lucide-react";
import { salir } from "./actions";

/** Tarjeta centrada de las pantallas sin sesión (ingreso y cambio de clave). */
export function TarjetaPortal({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/sgc/logo-formato.png" alt="La Carolina" className="mb-3 h-14 w-auto" />
          <h1 className="text-xl font-bold text-[#0F172A]">Portal de afiliados</h1>
          <p className="mt-1 text-sm text-[#64748B]">Consulte la liquidación de sus vehículos</p>
        </div>
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
          <h2 className="mb-5 text-center text-base font-semibold text-[#0F172A]">{titulo}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Botón de salida del portal (formulario con acción de servidor). */
export function BotonSalir() {
  return (
    <form action={salir}>
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC]"
      >
        <LogOut className="h-4 w-4" /> Salir
      </button>
    </form>
  );
}
