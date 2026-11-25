"use server";

/**
 * Respuesta del aspirante en el enlace del correo (prueba psicosensotécnica).
 * Pública por diseño: no hay cuenta; el token del enlace es la llave y
 * responderEnlace solo actúa sobre el proceso de ese token. Ninguna acción de
 * aquí puede llamar a getCurrentPermissions.
 */
import { redirect } from "next/navigation";
import { responderEnlace } from "@/lib/seleccion/correo-psico-servidor";

export async function responderCorreoAccion(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const respuesta = formData.get("respuesta") === "si" ? "si" : "no";
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) redirect("/validar-correo/invalido");
  const { estado } = await responderEnlace(token, respuesta);
  redirect(`/validar-correo/${token}?r=${estado}`);
}
