import { redirect } from "next/navigation";
import { canAccess, getCurrentPermissions, puedeEditarEn } from "@/lib/permissions";
import { Fase2Client } from "./client";

export const dynamic = "force-dynamic";

/**
 * Candidatos › Exámenes fase 2 (27-nov-2026): quienes tienen la cita de la fase 2
 * en el laboratorio (si recibieron el recordatorio, si confirmaron) para registrar
 * el resultado. Los resultados de la fase 2 son médicos: los pone una persona.
 */
export default async function ExamenesFase2Page() {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "candidatos")) redirect("/");
  return <Fase2Client puedeEditar={puedeEditarEn(perms, "candidatos")} />;
}
