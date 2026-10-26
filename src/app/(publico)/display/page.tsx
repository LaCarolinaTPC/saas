import type { Metadata, Viewport } from "next";
import { DisplayClient } from "./display-client";

export const metadata: Metadata = {
  title: "Pantalla informativa · Gestivo",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

/**
 * Pantalla del televisor. Pública: el TV no tiene usuario. Todo lo que muestra
 * llega de /api/display con la clave guardada en este navegador; sin clave,
 * muestra un código para que RRHH lo vincule desde Gestivo › Pantalla TV.
 *
 * Bajo (publico) NADA puede llamar a getCurrentPermissions.
 */
export default function DisplayPage() {
  return <DisplayClient />;
}
