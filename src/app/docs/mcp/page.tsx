import type { Metadata } from "next";
import Image from "next/image";
import { Info, ShieldCheck, TriangleAlert } from "lucide-react";
import { CodeBlock } from "../api/code-block";
import { DocsSidebar, type DocsNavItem } from "../api/docs-sidebar";

// Guía pública paso a paso para conectar agentes de IA (Claude, ChatGPT,
// Codex) al servidor MCP de Gestivo. Las capturas son reales, tomadas el
// 2026-09-11 recorriendo cada flujo contra producción; viven en
// public/docs/mcp. Si cambian las pantallas de un proveedor, se vuelven a tomar.

export const metadata: Metadata = {
  title: "GESTIVO · Conectar agentes de IA",
  description:
    "Guía con capturas para conectar Claude, ChatGPT y Codex a los datos de Gestivo mediante el servidor MCP.",
};

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://saas-six-vert.vercel.app";
const URL_MCP = `${BASE_URL}/api/mcp`;

const NAV_ITEMS: DocsNavItem[] = [
  { id: "antes", label: "Antes de empezar" },
  { id: "claude", label: "Claude (web y escritorio)" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "codex", label: "Codex" },
  { id: "otros", label: "Otros agentes (API key)" },
  { id: "revocar", label: "Revocar el acceso" },
  { id: "problemas", label: "Problemas frecuentes" },
];

// ── Piezas de presentación ────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-[#E2E8F0] py-10 first:pt-0 last:border-0">
      <h2 className="text-2xl font-bold tracking-tight text-[#0F172A]">{title}</h2>
      <div className="mt-4 space-y-6">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-[#475569]">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[#EEF2FF] px-1.5 py-0.5 font-mono text-[13px] text-[#4F46E5]">{children}</code>
  );
}

function Aviso({ tipo = "info", children }: { tipo?: "info" | "alerta"; children: React.ReactNode }) {
  const alerta = tipo === "alerta";
  const Icono = alerta ? TriangleAlert : Info;
  return (
    <div
      className={`flex gap-3 rounded-lg border p-4 text-sm leading-relaxed ${
        alerta ? "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]" : "border-[#C7D2FE] bg-[#EEF2FF] text-[#3730A3]"
      }`}
    >
      <Icono className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

type Captura = { src: string; ancho: number; alto: number; alt: string };

function Paso({
  numero,
  titulo,
  children,
  captura,
}: {
  numero: number;
  titulo: string;
  children?: React.ReactNode;
  captura?: Captura;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4F46E5] text-sm font-semibold text-white">
          {numero}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-base font-semibold text-[#0F172A]">{titulo}</h3>
          {children && <div className="space-y-2 text-[15px] leading-relaxed text-[#475569]">{children}</div>}
        </div>
      </div>
      {captura && (
        <div className="mt-4 overflow-hidden rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2">
          <Image
            src={captura.src}
            width={captura.ancho}
            height={captura.alto}
            alt={captura.alt}
            className="mx-auto h-auto max-w-full rounded-md"
            style={{ maxHeight: 620, width: "auto" }}
          />
        </div>
      )}
    </div>
  );
}

const img = (archivo: string, ancho: number, alto: number, alt: string): Captura => ({
  src: `/docs/mcp/${archivo}`,
  ancho,
  alto,
  alt,
});

// ── Página ────────────────────────────────────────────────────────────────────

export default function GuiaMcpPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-[#0F172A]">
      <header className="sticky top-0 z-40 border-b border-[#E2E8F0] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-[#4F46E5]" />
            <span className="text-lg font-bold">GESTIVO</span>
            <span className="text-[#CBD5E1]">/</span>
            <span className="text-sm font-medium text-[#475569]">Conectar agentes de IA</span>
          </div>
          <a href="/docs/api" className="text-sm font-medium text-[#4F46E5] hover:underline">
            Documentación técnica
          </a>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-10 px-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto py-10 pr-2">
            <DocsSidebar items={NAV_ITEMS} />
          </div>
        </aside>

        <main className="min-w-0 max-w-3xl flex-1 py-10">
          <div className="border-b border-[#E2E8F0] pb-10">
            <h1 className="text-4xl font-bold tracking-tight">Conectar Claude, ChatGPT o Codex a Gestivo</h1>
            <p className="mt-4 text-lg leading-relaxed text-[#475569]">
              Con esta guía un asistente de IA puede consultar los datos de Gestivo en{" "}
              <strong>solo lectura</strong>: conductores, producción, ausentismo, accidentes, riesgo,
              reclutamiento, tesorería, GEMA, vehículos y mantenimiento. Cada respuesta le llega
              documentada para que no confunda la información. Las capturas son de los flujos reales.
            </p>
            <div className="mt-6">
              <CodeBlock title="Dirección del servidor MCP de Gestivo" code={URL_MCP} />
            </div>
          </div>

          <Section id="antes" title="Antes de empezar">
            <ul className="list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-[#475569]">
              <li>
                Necesita una cuenta de <strong>administrador de Gestivo</strong>. Solo un administrador puede
                autorizar a un agente, y si deja de serlo el agente pierde el acceso.
              </li>
              <li>
                El agente podrá leer datos personales y de salud si los pide. Conecte solo cuentas de IA que
                usted controle.
              </li>
              <li>El agente no puede crear, modificar ni borrar nada en Gestivo.</li>
              <li>
                Todo acceso se puede revocar en <em>Configuración → API</em> (ver{" "}
                <a href="#revocar" className="font-medium text-[#4F46E5] hover:underline">
                  Revocar el acceso
                </a>
                ).
              </li>
            </ul>
          </Section>

          <Section id="claude" title="Claude (claude.ai y Claude Desktop)">
            <P>
              El conector se agrega una vez en su cuenta de Claude y queda disponible en claude.ai y en la
              app de escritorio. Las capturas muestran la interfaz en inglés; en español los botones tienen
              los nombres equivalentes.
            </P>
            <Paso
              numero={1}
              titulo="Abra Customize → Connectors y pulse Add"
              captura={img("claude-01-conectores.png", 984, 520, "Página Customize, pestaña Connectors, con el botón Add")}
            >
              <p>En el menú de su perfil entre a <strong>Customize</strong>, pestaña <strong>Connectors</strong>.</p>
            </Paso>
            <Paso
              numero={2}
              titulo="Escriba el nombre y la dirección del servidor"
              captura={img("claude-02-agregar-conector.png", 560, 474, "Formulario Add custom connector con nombre Gestivo y la URL del MCP")}
            >
              <p>
                Nombre: <Code>Gestivo</Code>. MCP server URL: <Code>{URL_MCP}</Code>. Pulse{" "}
                <strong>Continue</strong>.
              </p>
            </Paso>
            <Paso
              numero={3}
              titulo="Deje la autenticación que Claude detecta y pulse Add"
              captura={img("claude-03-autenticacion-oauth.png", 560, 804, "Paso 2: Sign in now y Register automatically marcados como detectados")}
            >
              <p>
                Claude detecta solo que Gestivo usa inicio de sesión (<strong>Sign in now</strong>) y registro
                automático (<strong>Register automatically</strong>). No cambie nada.
              </p>
            </Paso>
            <Paso
              numero={4}
              titulo="Pulse Connect"
              captura={img("claude-04-conectar.png", 984, 620, "Página del conector Gestivo con el botón Connect")}
            />
            <Paso
              numero={5}
              titulo="Inicie sesión en Gestivo"
              captura={img("claude-05-login-gestivo.png", 600, 700, "Pantalla de inicio de sesión de Gestivo")}
            >
              <p>Use su correo y contraseña de administrador. Si ya tenía la sesión abierta, este paso no aparece.</p>
            </Paso>
            <Paso
              numero={6}
              titulo="Revise y pulse Autorizar"
              captura={img("claude-06-autorizar-gestivo.png", 500, 609, "Pantalla de Gestivo: Claude quiere acceder a Gestivo")}
            >
              <p>
                Verifique que diga <strong>Claude quiere acceder a Gestivo</strong> y que al autorizar volverá a{" "}
                <Code>claude.ai</Code>.
              </p>
            </Paso>
            <Paso
              numero={7}
              titulo="Listo: el conector queda conectado"
              captura={img("claude-07-conectado.png", 984, 820, "Conector Gestivo conectado con 8 herramientas de solo lectura")}
            >
              <p>
                Verá las 8 herramientas de solo lectura. Por defecto piden aprobación cada vez (
                <strong>Needs approval</strong>); puede cambiarlas a permitir siempre.
              </p>
            </Paso>
            <Paso
              numero={8}
              titulo="Pregunte en un chat y permita las herramientas"
              captura={img("claude-08-permiso-herramienta.png", 984, 820, "Claude pide permiso para usar la herramienta Guía de Gestivo")}
            >
              <p>
                Escriba, por ejemplo: <em>«Usa el conector Gestivo: ¿cuántos conductores activos hay hoy?»</em>. La
                primera vez que use cada herramienta Claude pide permiso: <strong>Always allow</strong> la deja
                aprobada.
              </p>
            </Paso>
            <Paso
              numero={9}
              titulo="Resultado"
              captura={img("claude-09-respuesta.png", 984, 820, "Respuesta de Claude con los conductores activos y retirados según Gestivo")}
            >
              <p>Claude responde con la cifra, el recurso de donde sale y la frescura de los datos.</p>
            </Paso>
          </Section>

          <Section id="chatgpt" title="ChatGPT">
            <Aviso tipo="alerta">
              ChatGPT solo permite conectores propios con el <strong>modo desarrollador</strong> activo, disponible
              en planes que lo incluyan (la guía se hizo con Plus). OpenAI lo marca como de riesgo elevado porque
              permite agregar conectores que no ha revisado.
            </Aviso>
            <Paso
              numero={1}
              titulo="Active el modo desarrollador"
              captura={img("chatgpt-01-modo-desarrollador.png", 447, 174, "Interruptor Developer mode activado en Seguridad")}
            >
              <p>
                <strong>Settings → Security and login → Developer mode</strong>.
              </p>
            </Paso>
            <Paso
              numero={2}
              titulo="Abra Plugins y pulse +"
              captura={img("chatgpt-02-crear-app.png", 1247, 330, "Página Plugins con el botón + para crear una app")}
            >
              <p>
                En la barra lateral entre a <strong>Plugins</strong>. El botón <strong>+</strong> junto al buscador
                es <strong>Create app</strong>.
              </p>
            </Paso>
            <Paso
              numero={3}
              titulo="Complete el formulario y pulse Create"
              captura={img("chatgpt-03-nuevo-plugin.png", 472, 811, "Formulario New Plugin con Gestivo, la URL y autenticación OAuth")}
            >
              <p>
                Name: <Code>Gestivo</Code>. Server URL: <Code>{URL_MCP}</Code>. Authentication:{" "}
                <strong>OAuth</strong>. Marque <strong>I understand and want to continue</strong>.
              </p>
            </Paso>
            <Paso
              numero={4}
              titulo="Pulse Sign in with Gestivo"
              captura={img("chatgpt-04-agregar-gestivo.png", 604, 461, "Ventana Add Gestivo to ChatGPT con el botón Sign in with Gestivo")}
            />
            <Paso
              numero={5}
              titulo="Autorice en Gestivo"
              captura={img("chatgpt-05-autorizar-gestivo.png", 500, 609, "Pantalla de Gestivo: ChatGPT quiere acceder a Gestivo")}
            >
              <p>
                Se abre una ventana de Gestivo. Si no tiene sesión, inicie sesión como administrador; luego
                verifique que diga <strong>ChatGPT quiere acceder a Gestivo</strong> y pulse{" "}
                <strong>Autorizar</strong>.
              </p>
            </Paso>
            <Paso
              numero={6}
              titulo="Listo: el plugin queda conectado"
              captura={img("chatgpt-06-conectado.png", 696, 616, "Plugin Gestivo conectado en los ajustes de ChatGPT")}
            />
            <Paso
              numero={7}
              titulo="Pregunte en un chat"
              captura={img("chatgpt-07-respuesta.png", 1280, 900, "Respuesta de ChatGPT usando la app Gestivo")}
            >
              <p>
                Escriba, por ejemplo: <em>«Usa la app Gestivo: ¿cuántos conductores activos hay hoy?»</em>.
              </p>
            </Paso>
          </Section>

          <Section id="codex" title="Codex">
            <Aviso>
              Codex web (chatgpt.com/codex) no admite servidores MCP propios. Conéctelo desde la app de escritorio,
              el CLI o la extensión de IDE: los tres comparten la configuración <Code>~/.codex/config.toml</Code>,
              así que basta con agregarlo en uno.
            </Aviso>
            <Paso numero={1} titulo="App de escritorio: agregue el servidor">
              <p>
                <strong>Settings → MCP servers → Add server</strong>. Tipo <strong>Streamable HTTP</strong>, URL{" "}
                <Code>{URL_MCP}</Code>. Guarde y pulse <strong>Restart</strong>.
              </p>
            </Paso>
            <Paso numero={2} titulo="App de escritorio: inicie sesión">
              <p>
                En la lista de servidores, Gestivo aparece como OAuth. Pulse <strong>Authenticate</strong>: se abre
                el navegador, inicia sesión en Gestivo como administrador y pulsa <strong>Autorizar</strong> en la
                pantalla <strong>Codex quiere acceder a Gestivo</strong>.
              </p>
            </Paso>
            <Paso numero={3} titulo="O desde la terminal (CLI)">
              <CodeBlock
                title="Con inicio de sesión de administrador (OAuth)"
                code={`codex mcp add gestivo --url ${URL_MCP}
codex mcp login gestivo`}
              />
              <CodeBlock
                title="O con una API key de Configuración → API"
                code={`export GESTIVO_API_KEY=sk_live_XXXXXXXXXXXX
codex mcp add gestivo --url ${URL_MCP} --bearer-token-env-var GESTIVO_API_KEY`}
              />
              <p>
                Compruebe con <Code>codex mcp list</Code>: debe aparecer <Code>gestivo</Code> activo. Luego pida en
                Codex: <em>«usa gestivo y dime cuántos conductores activos hay»</em>.
              </p>
            </Paso>
            <P>
              Los pasos de la app siguen la documentación de OpenAI; la app de escritorio no se pudo capturar
              automáticamente. La conexión OAuth de Codex con Gestivo está verificada en producción.
            </P>
          </Section>

          <Section id="otros" title="Otros agentes (Claude Code, Cursor, VS Code, n8n, Hermes)">
            <P>
              Estos clientes se conectan con una API key creada en <em>Configuración → API</em>, enviada como{" "}
              <Code>Authorization: Bearer sk_live_…</Code>. Los ejemplos de configuración están en la{" "}
              <a href="/docs/api#mcp" className="font-medium text-[#4F46E5] hover:underline">
                documentación técnica
              </a>
              .
            </P>
            <CodeBlock
              title="Claude Code"
              code={`claude mcp add --transport http gestivo ${URL_MCP} \\
  --header "Authorization: Bearer $GESTIVO_API_KEY"`}
            />
          </Section>

          <Section id="revocar" title="Revocar el acceso">
            <ul className="list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-[#475569]">
              <li>
                En Gestivo: <strong>Configuración → API → Agentes conectados por OAuth → Revocar</strong>. El agente
                deja de consultar de inmediato.
              </li>
              <li>
                Las conexiones por API key se cortan revocando la clave en la misma pantalla.
              </li>
              <li>
                En el agente: <strong>Disconnect</strong> en el conector de Claude, o eliminar el plugin en ChatGPT.
                Eso no revoca la autorización en Gestivo; hágalo también allá.
              </li>
            </ul>
          </Section>

          <Section id="problemas" title="Problemas frecuentes">
            <div className="space-y-4 text-[15px] leading-relaxed text-[#475569]">
              <p>
                <strong>«Solo un administrador de Gestivo puede conectar agentes de IA».</strong> La cuenta con la que
                inició sesión no es administradora. Pida a un administrador que haga la conexión.
              </p>
              <p>
                <strong>El agente vuelve a pedir inicio de sesión.</strong> La autorización fue revocada o el usuario
                que la dio dejó de ser administrador. Conéctelo de nuevo.
              </p>
              <p>
                <strong>ChatGPT no muestra el botón + en Plugins.</strong> El modo desarrollador está desactivado o su
                plan no lo incluye.
              </p>
              <p>
                <strong>Claude pide permiso en cada pregunta.</strong> En el conector, cambie las herramientas de{" "}
                <em>Needs approval</em> a permitir siempre.
              </p>
              <p>
                <strong>Una respuesta dice que un dato no está disponible.</strong> Es a propósito: el agente solo ve
                los conjuntos de datos habilitados y se le indica no inventar lo que no existe.
              </p>
            </div>
          </Section>

          <footer className="py-10 text-center text-sm text-[#94A3B8]">
            GESTIVO · Guía de conexión de agentes de IA · Capturas tomadas el 11 de septiembre de 2026.
          </footer>
        </main>
      </div>
    </div>
  );
}
