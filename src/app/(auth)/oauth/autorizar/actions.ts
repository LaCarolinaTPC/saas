"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { construirRedireccion, urlMcp, urlPublicaDesdeHeaders } from "@/lib/oauth/config";
import {
  emitirCodigo,
  puedeConectarAgentes,
  validarSolicitudAutorizacion,
} from "@/lib/oauth/servicio";

/**
 * Decisión del administrador sobre la solicitud de un agente. Todo se vuelve a
 * validar aquí: los campos ocultos del formulario no son confiables.
 */
export async function decidirAutorizacion(formData: FormData) {
  let params: Record<string, string | undefined> = {};
  try {
    const crudo = JSON.parse(String(formData.get("solicitud") ?? "{}")) as Record<string, unknown>;
    params = Object.fromEntries(
      Object.entries(crudo).filter(([, v]) => typeof v === "string")
    ) as Record<string, string>;
  } catch {
    throw new Error("Solicitud de autorización ilegible.");
  }

  const base = urlPublicaDesdeHeaders(await headers());
  const validacion = await validarSolicitudAutorizacion(params, urlMcp(base), base);
  if (!validacion.ok) {
    if (!validacion.redirigible) throw new Error(validacion.mensaje);
    redirect(
      construirRedireccion(validacion.redirectUri, {
        error: validacion.error,
        error_description: validacion.descripcion,
        state: validacion.state,
        iss: base,
      })
    );
  }
  const { solicitud } = validacion;

  const denegar = (descripcion: string) =>
    redirect(
      construirRedireccion(solicitud.redirectUri, {
        error: "access_denied",
        error_description: descripcion,
        state: solicitud.state,
        iss: base,
      })
    );

  if (formData.get("decision") !== "autorizar") {
    denegar("El usuario rechazó la autorización.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await puedeConectarAgentes(user.id))) {
    denegar("El usuario no tiene un tipo de usuario asignado en Gestivo.");
  }

  const codigo = await emitirCodigo(solicitud, user.id);
  redirect(
    construirRedireccion(solicitud.redirectUri, {
      code: codigo,
      state: solicitud.state,
      iss: base,
    })
  );
}
