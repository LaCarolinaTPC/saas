import { redirect } from "next/navigation";

/** Gestión de flota: el tablero de rentabilidad llega en la fase 5; hasta entonces, Datos. */
export default function FlotaPage() {
  redirect("/financiera/flota/datos");
}
