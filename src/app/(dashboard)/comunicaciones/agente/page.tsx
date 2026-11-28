import { redirect } from "next/navigation";

/** La configuración de la IA pasó a Candidatos › Selección › IA (21-nov-2026); se conserva la dirección vieja. */
export default function AgenteMovido() {
  redirect("/candidatos/seleccion?pestana=ia");
}
