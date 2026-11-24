import { NextRequest, NextResponse } from "next/server";
import { leerDocumentoPrueba, probarAudio, probarLecturaDocumento } from "@/lib/seleccion/prueba-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Chat de prueba › «Probar lectura»: lee un documento o transcribe un audio sin
 * enviarlo al chat ni guardarlo (23-nov-2026). Va por ruta y no por server
 * action: al abrir la página, los chats de prueba guardados lanzan muchas
 * actions que Next atiende de una en una, y la prueba esperaba su turno más de
 * un minuto (la lectura en sí tarda segundos). Además el archivo puede pasar de
 * 1 MB, el tope de las actions.
 *
 * multipart/form-data: tipo y archivo. «documento» y «audio» solo prueban la
 * lectura; «chat» es el documento subido en el chat de prueba (va al chat y, con
 * candidato, a su ficha; además procesoId y formulario). Los permisos los revisan
 * las funciones del chat de prueba.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo leer el formulario." }, { status: 400 });
  }
  const tipo = String(form.get("tipo") ?? "");
  if (tipo !== "documento" && tipo !== "audio" && tipo !== "chat") return NextResponse.json({ ok: false, error: "Tipo de prueba no válido." }, { status: 400 });
  const r = tipo === "audio" ? await probarAudio(form) : tipo === "chat" ? await leerDocumentoPrueba(form) : await probarLecturaDocumento(form);
  return NextResponse.json(r);
}
