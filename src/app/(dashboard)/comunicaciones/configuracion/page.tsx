import { redirect } from "next/navigation";

/** El canal de WhatsApp se configura en Candidatos › Selección › Canal (21-nov-2026); se conserva la dirección. */
export default function CanalMovido() {
  redirect("/candidatos/seleccion?pestana=canal");
}
