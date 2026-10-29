import { redirect } from "next/navigation";

/**
 * La pestaña «Solicitudes a cámaras» se retiró con la fase 5 del módulo de
 * Recobros: su seguimiento y el cobro de caja viven ahora en la página
 * /tesoreria/recobros. Se conserva la ruta para los enlaces y marcadores
 * viejos.
 */
export default function SolicitudesCamarasPage() {
  redirect("/tesoreria/recobros");
}
