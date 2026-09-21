import { redirect } from "next/navigation";

/**
 * Raíz del módulo Financiera. Mientras no exista el tablero (fase 5 del plan)
 * manda a la única pantalla disponible, Datos de flota. Cuando el tablero
 * exista, esta ruta debe redirigir a la primera pantalla permitida al usuario.
 */
export default function FinancieraPage() {
  redirect("/financiera/flota/datos");
}
