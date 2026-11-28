import { redirect } from "next/navigation";

/** Los indicadores del WhatsApp están en Candidatos › Indicadores › Atención del WhatsApp (21-nov-2026). */
export default function IndicadoresMovidos() {
  redirect("/candidatos/indicadores/whatsapp");
}
