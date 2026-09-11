import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Bot, Eye, ShieldAlert, ShieldCheck, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EXTERNAL_RESOURCES } from "@/lib/external/resources";
import { construirRedireccion, urlMcp, urlPublicaDesdeHeaders } from "@/lib/oauth/config";
import { esAdministrador, validarSolicitudAutorizacion } from "@/lib/oauth/servicio";
import { Button } from "@/components/ui/button";
import { decidirAutorizacion } from "./actions";

export const dynamic = "force-dynamic";

// Pantalla de consentimiento OAuth: un agente de IA (claude.ai, ChatGPT…) pide
// acceso de solo lectura a los datos de Gestivo y un administrador lo concede.

const DESTINOS_CONOCIDOS = new Set([
  "claude.ai",
  "claude.com",
  "chatgpt.com",
  "chat.openai.com",
  "localhost",
  "127.0.0.1",
]);

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#EEF2FF]">
            <ShieldCheck className="h-7 w-7 text-[#4F46E5]" />
          </div>
          <h1 className="text-xl font-bold text-[#0F172A]">GESTIVO</h1>
        </div>
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-7">{children}</div>
      </div>
    </div>
  );
}

function Error({ mensaje }: { mensaje: string }) {
  return (
    <Marco>
      <div className="flex flex-col items-center text-center">
        <ShieldAlert className="mb-3 h-8 w-8 text-red-500" />
        <h2 className="mb-2 text-lg font-semibold text-[#0F172A]">No se puede autorizar</h2>
        <p className="text-sm text-[#64748B]">{mensaje}</p>
        <p className="mt-4 text-xs text-[#94A3B8]">
          Vuelva a iniciar la conexión desde la aplicación del agente de IA.
        </p>
      </div>
    </Marco>
  );
}

export default async function AutorizarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const crudos = await searchParams;
  const params = Object.fromEntries(
    Object.entries(crudos).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  ) as Record<string, string | undefined>;

  const base = urlPublicaDesdeHeaders(await headers());
  const validacion = await validarSolicitudAutorizacion(params, urlMcp(base), base);
  if (!validacion.ok) {
    if (!validacion.redirigible) return <Error mensaje={validacion.mensaje} />;
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const retorno = `/oauth/autorizar?${new URLSearchParams(
      Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string")
    ).toString()}`;
    redirect(`/login?siguiente=${encodeURIComponent(retorno)}`);
  }
  if (user.user_metadata?.must_change_password) redirect("/cambiar-contrasena");

  const admin = await esAdministrador(user.id);
  const destino = new URL(solicitud.redirectUri);
  const destinoTexto = destino.protocol.startsWith("http") ? destino.host : `${destino.protocol}//`;
  const destinoConocido = DESTINOS_CONOCIDOS.has(destino.hostname);
  const solicitudSerializada = JSON.stringify(params);

  return (
    <Marco>
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9]">
          <Bot className="h-5 w-5 text-[#334155]" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-[#0F172A]">
            {solicitud.cliente.nombre} quiere acceder a Gestivo
          </h2>
          <p className="mt-0.5 text-sm text-[#64748B]">
            Sesión de <span className="font-medium text-[#334155]">{user.email}</span>
          </p>
        </div>
      </div>

      <ul className="mb-5 space-y-3 text-sm text-[#334155]">
        <li className="flex gap-2.5">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-[#4F46E5]" />
          <span>
            <strong>Solo lectura</strong> de los {EXTERNAL_RESOURCES.length} conjuntos de datos
            expuestos: conductores, producción, ausentismo, accidentes, riesgo, reclutamiento,
            tesorería, GEMA, vehículos y mantenimiento. No podrá crear, modificar ni borrar nada.
          </span>
        </li>
        <li className="flex gap-2.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            Si el agente las pide, podrá leer datos personales y de salud (teléfonos, diagnósticos,
            puntajes de riesgo). Autorice solo agentes que usted controle.
          </span>
        </li>
        <li className="flex gap-2.5">
          <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-[#64748B]" />
          <span>Puede revocar el acceso en cualquier momento en Configuración → API.</span>
        </li>
      </ul>

      <div
        className={`mb-6 rounded-lg px-3 py-2 text-xs ${
          destinoConocido ? "bg-[#F8FAFC] text-[#64748B]" : "bg-amber-50 text-amber-800"
        }`}
      >
        Al autorizar volverá a <span className="font-mono font-medium">{destinoTexto}</span>
        {!destinoConocido && " — verifique que reconoce esta dirección antes de continuar."}
      </div>

      {admin ? (
        <form action={decidirAutorizacion} className="flex gap-3">
          <input type="hidden" name="solicitud" value={solicitudSerializada} />
          <Button
            type="submit"
            name="decision"
            value="denegar"
            variant="outline"
            className="flex-1 border-[#E2E8F0]"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            name="decision"
            value="autorizar"
            className="flex-1 bg-[#4F46E5] hover:bg-[#4338CA]"
          >
            Autorizar
          </Button>
        </form>
      ) : (
        <form action={decidirAutorizacion} className="space-y-3">
          <input type="hidden" name="solicitud" value={solicitudSerializada} />
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Solo un administrador de Gestivo puede conectar agentes de IA a los datos.
          </p>
          <Button
            type="submit"
            name="decision"
            value="denegar"
            variant="outline"
            className="w-full border-[#E2E8F0]"
          >
            Volver al agente
          </Button>
        </form>
      )}
    </Marco>
  );
}
