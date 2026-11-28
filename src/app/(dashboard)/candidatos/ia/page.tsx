import { redirect } from "next/navigation";

/** La IA se configura en Candidatos › Selección › IA (21-nov-2026); se conserva la dirección. */
export default function IaMovida() {
  redirect("/candidatos/seleccion?pestana=ia");
}
