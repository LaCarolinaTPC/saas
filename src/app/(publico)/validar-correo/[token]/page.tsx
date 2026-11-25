import type { Metadata } from "next";
import { CheckCircle2, Mail, MessageCircle, XCircle } from "lucide-react";
import { leerEnlace } from "@/lib/seleccion/correo-psico-servidor";
import { responderCorreoAccion } from "./actions";

/**
 * Página del enlace que le llega al aspirante para confirmar su correo
 * (prueba psicosensotécnica, 24-nov-2026). Pública: sin cuenta de Gestivo.
 * Abrir el enlace no confirma nada (los antivirus del correo abren los
 * enlaces solos): la respuesta va con un botón.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmar correo · Transportes La Carolina",
  robots: { index: false, follow: false },
};

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-4">
      <main className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-6 text-center shadow-sm sm:p-8">{children}</main>
    </div>
  );
}

function Final({ icono, titulo, texto }: { icono: React.ReactNode; titulo: string; texto: string }) {
  return (
    <Marco>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50">{icono}</div>
      <h1 className="text-lg font-semibold text-[#0F172A]">{titulo}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#475569]">{texto}</p>
    </Marco>
  );
}

export default async function ValidarCorreoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const { token } = await params;
  const { r } = await searchParams;

  if (r === "validado") {
    return (
      <Final
        icono={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
        titulo="¡Listo! Tu correo quedó confirmado"
        texto="Cuando te inscribamos en la plataforma de la prueba psicosensotécnica te avisamos por WhatsApp, y la información para presentarla te llegará a este correo. Ya puedes cerrar esta página."
      />
    );
  }
  if (r === "corregir") {
    return (
      <Final
        icono={<MessageCircle className="h-6 w-6 text-[#4F46E5]" />}
        titulo="Gracias por avisarnos"
        texto="Te escribimos por WhatsApp para que nos envíes tu correo correcto. Ya puedes cerrar esta página."
      />
    );
  }

  const v = await leerEnlace(token);
  if (v.estado === "validado") {
    return <Final icono={<CheckCircle2 className="h-6 w-6 text-emerald-600" />} titulo="Este correo ya está confirmado" texto="No tienes que hacer nada más. Ya puedes cerrar esta página." />;
  }
  if (v.estado === "vencido") {
    return (
      <Final
        icono={<XCircle className="h-6 w-6 text-amber-600" />}
        titulo="Este enlace venció"
        texto="Escríbenos tu correo por WhatsApp y te enviamos uno nuevo."
      />
    );
  }
  if (v.estado !== "pendiente") {
    return (
      <Final
        icono={<XCircle className="h-6 w-6 text-slate-500" />}
        titulo="Este enlace no sirve"
        texto="Puede que ya lo hayas usado o que haya llegado uno más nuevo. Si tienes dudas, escríbenos por WhatsApp."
      />
    );
  }

  return (
    <Marco>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF]">
        <Mail className="h-6 w-6 text-[#4F46E5]" />
      </div>
      <h1 className="text-lg font-semibold text-[#0F172A]">{v.nombre ? `${v.nombre}, ¿este es tu correo?` : "¿Este es tu correo?"}</h1>
      <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 text-base font-medium text-[#0F172A]">{v.correo}</p>
      <p className="mt-3 text-sm leading-relaxed text-[#475569]">
        Aquí te llegará la información para presentar la prueba psicosensotécnica de tu proceso de selección.
      </p>
      <form action={responderCorreoAccion} className="mt-6 flex flex-col gap-2">
        <input type="hidden" name="token" value={token} />
        <button type="submit" name="respuesta" value="si" className="h-11 rounded-lg bg-[#4F46E5] text-sm font-semibold text-white hover:bg-[#4338CA]">
          Sí, es mi correo
        </button>
        <button type="submit" name="respuesta" value="no" className="h-11 rounded-lg border border-[#E2E8F0] bg-white text-sm font-medium text-[#334155] hover:bg-slate-50">
          No, este no es mi correo
        </button>
      </form>
    </Marco>
  );
}
