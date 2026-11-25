import Link from "next/link";
import { TriangleAlert, PauseCircle } from "lucide-react";
import { leerEstadoServicios } from "@/lib/estado-servicios";
import { haceCuanto } from "./comun";

/**
 * Aviso en Candidatos y Comunicaciones (24-nov-2026) cuando un servicio externo
 * está fallando (Croma, IA, WhatsApp, correo) o Croma está en pausa. Sin nada
 * raro no muestra nada. Componente de servidor.
 */
export async function AvisoServicios({ className = "" }: { className?: string }) {
  const estados = await leerEstadoServicios();
  const mal = estados.filter((e) => e.nivel === "fallando");
  const pausa = estados.find((e) => e.id === "croma" && e.nivel === "pausado");
  if (!mal.length && !pausa) return null;
  return (
    <div className={`space-y-2 ${className}`}>
      {mal.map((e) => (
        <div key={e.id} className="flex flex-wrap items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {e.nombre} está fallando: {e.seguidos > 0 ? `${e.seguidos} error${e.seguidos === 1 ? "" : "es"} seguido${e.seguidos === 1 ? "" : "s"}` : `${e.errores24h} errores en 24 h`}
              {e.ultimoError ? `, el último ${haceCuanto(e.ultimoError.at)}` : ""}.
            </p>
            {e.ultimoError && <p className="truncate text-xs opacity-80">{e.ultimoError.texto}</p>}
            {e.consejo && <p className="mt-0.5 text-xs">{e.consejo}</p>}
          </div>
          <Link href="/candidatos/seleccion?pestana=tiempos" className="shrink-0 text-xs font-medium underline">
            Ver estado
          </Link>
        </div>
      ))}
      {pausa && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <PauseCircle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1">
            Croma está en pausa: no se consulta el RUNT, el SIMIT ni los antecedentes. Lo que falta se revisa a mano en la ficha («Lo revisé a mano») y nadie se cita solo.
          </p>
          <Link href="/candidatos/seleccion?pestana=tiempos" className="shrink-0 text-xs font-medium underline">
            Quitar la pausa
          </Link>
        </div>
      )}
    </div>
  );
}
