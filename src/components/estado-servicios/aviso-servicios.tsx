import { leerEstadoServicios } from "@/lib/estado-servicios";
import { BarraServicios } from "./barra-servicios";

/**
 * Estado de los servicios externos en Candidatos y Comunicaciones (24-nov-2026).
 * Desde el 26-nov-2026 es una barra que siempre se ve (en verde si todo
 * responde) y se actualiza sola; cuando algo falla dice qué hacer. Componente
 * de servidor: entrega el primer estado para que la barra no aparezca vacía.
 */
export async function AvisoServicios({ className = "" }: { className?: string }) {
  const estados = await leerEstadoServicios();
  return <BarraServicios inicial={estados} className={className} />;
}
