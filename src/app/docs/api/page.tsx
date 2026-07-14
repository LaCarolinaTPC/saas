import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { EXTERNAL_RESOURCES } from "@/lib/external/resources";
import { CodeBlock } from "./code-block";
import { DocsSidebar, type DocsNavItem } from "./docs-sidebar";

// Documentación pública de la Data API (/api/external/v1).
// El catálogo de recursos se genera desde EXTERNAL_RESOURCES y las columnas se
// introspectan en vivo, así la página nunca queda desactualizada respecto al código.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GESTIVO · Documentación de la API",
  description:
    "Referencia completa de la Data API de solo lectura de GESTIVO: autenticación, endpoints, filtros, paginación y catálogo de recursos.",
};

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://saas-six-vert.vercel.app";

const DOMAIN_LABELS: Record<string, string> = {
  rotacion: "Rotación",
  ausentismo: "Ausentismo",
  accidentabilidad: "Accidentabilidad",
  reclutamiento: "Reclutamiento",
  rrhh: "Familia e incentivos",
  campanas: "Campañas (Meta Ads)",
  config: "Organización",
};

const OPERATORS: { op: string; desc: string; example: string }[] = [
  { op: "eq", desc: "Igual a", example: `{"column":"estado","op":"eq","value":"ACTIVO"}` },
  { op: "neq", desc: "Distinto de", example: `{"column":"estado","op":"neq","value":"RETIRADO"}` },
  { op: "gt", desc: "Mayor que", example: `{"column":"viajes","op":"gt","value":10}` },
  { op: "gte", desc: "Mayor o igual que", example: `{"column":"fecha","op":"gte","value":"2026-01-01"}` },
  { op: "lt", desc: "Menor que", example: `{"column":"velocidad","op":"lt","value":60}` },
  { op: "lte", desc: "Menor o igual que", example: `{"column":"fecha","op":"lte","value":"2026-06-30"}` },
  { op: "like", desc: "Patrón (sensible a mayúsculas)", example: `{"column":"nombre","op":"like","value":"%PEREZ%"}` },
  { op: "ilike", desc: "Patrón (ignora mayúsculas)", example: `{"column":"nombre","op":"ilike","value":"%perez%"}` },
  { op: "in", desc: "Dentro de una lista", example: `{"column":"ruta","op":"in","value":["R1","R2"]}` },
  { op: "is", desc: "Es null / true / false", example: `{"column":"fecha_retiro","op":"is","value":null}` },
];

const ERRORS: { code: string; meaning: string; detail: string }[] = [
  { code: "400", meaning: "Petición inválida", detail: "Falta un parámetro, un filtro está mal formado o una columna no existe. El mensaje indica el problema exacto." },
  { code: "401", meaning: "No autenticado", detail: "La API key falta, fue revocada o es incorrecta. Verifique el header x-api-key." },
  { code: "404", meaning: "Recurso inexistente", detail: "El resource solicitado no está en el catálogo. Consulte GET /schema para ver los disponibles." },
  { code: "500", meaning: "Error del servidor", detail: "Error interno. Si persiste, contacte al administrador." },
];

const NAV_ITEMS: DocsNavItem[] = [
  { id: "introduccion", label: "Introducción" },
  { id: "autenticacion", label: "Autenticación" },
  {
    id: "endpoints",
    label: "Endpoints",
    children: [
      { id: "endpoint-schema", label: "GET /schema" },
      { id: "endpoint-query-get", label: "GET /query" },
      { id: "endpoint-query-post", label: "POST /query" },
      { id: "endpoint-aggregate", label: "POST /aggregate" },
    ],
  },
  { id: "filtros", label: "Filtros y operadores" },
  { id: "paginacion", label: "Paginación" },
  { id: "errores", label: "Errores" },
  { id: "recursos", label: "Catálogo de recursos" },
  { id: "ejemplos", label: "Ejemplos de integración" },
  { id: "limites", label: "Límites y buenas prácticas" },
];

// ── Piezas de presentación ────────────────────────────────────────────────────

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-[#E2E8F0] py-10 first:pt-0 last:border-0">
      <h2 className="text-2xl font-bold tracking-tight text-[#0F172A]">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function MethodBadge({ method }: { method: "GET" | "POST" }) {
  return (
    <span
      className={
        method === "GET"
          ? "rounded-md bg-[#DCFCE7] px-2 py-0.5 font-mono text-xs font-bold text-[#166534]"
          : "rounded-md bg-[#DBEAFE] px-2 py-0.5 font-mono text-xs font-bold text-[#1E40AF]"
      }
    >
      {method}
    </span>
  );
}

function Endpoint({
  id,
  method,
  path,
  children,
}: {
  id: string;
  method: "GET" | "POST";
  path: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-24 rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div className="flex flex-wrap items-center gap-3">
        <MethodBadge method={method} />
        <code className="font-mono text-sm font-semibold text-[#0F172A]">{path}</code>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function ParamsTable({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; type: string; desc: string }[];
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-[#0F172A]">{title}</h4>
      <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-left text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
              <th className="px-4 py-2">Parámetro</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-[#F1F5F9] last:border-0">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[#4F46E5]">{r.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-[#64748B]">{r.type}</td>
                <td className="px-4 py-2.5 text-[#475569]">{r.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-[#475569]">{children}</p>;
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[#EEF2FF] px-1.5 py-0.5 font-mono text-[13px] text-[#4F46E5]">
      {children}
    </code>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default async function ApiDocsPage() {
  // Introspección en vivo: una fila por recurso para descubrir sus columnas.
  const admin = createAdminClient();
  const resources = await Promise.all(
    EXTERNAL_RESOURCES.map(async (r) => {
      const { data, error } = await admin.from(r.name).select("*").limit(1);
      return {
        ...r,
        columns: error || !data?.[0] ? [] : Object.keys(data[0]),
      };
    })
  );

  const domains = [...new Set(resources.map((r) => r.domain))];

  return (
    <div className="min-h-screen bg-white font-sans text-[#0F172A]">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[#E2E8F0] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-[#4F46E5]" />
            <span className="text-lg font-bold">GESTIVO</span>
            <span className="text-[#CBD5E1]">/</span>
            <span className="text-sm font-medium text-[#475569]">Documentación de la API</span>
          </div>
          <span className="rounded-full bg-[#EEF2FF] px-3 py-1 text-xs font-semibold text-[#4F46E5]">
            v1
          </span>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-10 px-6">
        {/* Sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto py-10 pr-2">
            <DocsSidebar items={NAV_ITEMS} />
          </div>
        </aside>

        {/* Contenido */}
        <main className="min-w-0 flex-1 py-10">
          {/* Hero */}
          <div className="border-b border-[#E2E8F0] pb-10">
            <h1 className="text-4xl font-bold tracking-tight">Data API de GESTIVO</h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[#475569]">
              API REST de <strong>solo lectura</strong> para consultar toda la información
              operativa del negocio: conductores, rendimiento, ausentismo, accidentes,
              reclutamiento, incentivos y campañas. Pensada para conectar herramientas de
              BI, automatizaciones y agentes de IA.
            </p>
            <div className="mt-6">
              <CodeBlock title="Base URL" code={`${BASE_URL}/api/external/v1`} />
            </div>
          </div>

          <Section id="introduccion" title="Introducción">
            <P>
              La API expone un conjunto controlado de <strong>recursos</strong> (tablas y
              vistas) a través de tres endpoints genéricos. El flujo típico es:
            </P>
            <ol className="list-decimal space-y-2 pl-6 text-[15px] leading-relaxed text-[#475569]">
              <li>
                Llamar <InlineCode>GET /schema</InlineCode> para descubrir qué recursos
                existen y qué columnas tiene cada uno.
              </li>
              <li>
                Consultar datos con <InlineCode>GET /query</InlineCode> o{" "}
                <InlineCode>POST /query</InlineCode> aplicando filtros, orden y paginación.
              </li>
              <li>
                Para métricas sobre grandes volúmenes (conteos, sumas, promedios), usar{" "}
                <InlineCode>POST /aggregate</InlineCode>, que agrega en el servidor sin
                transferir las filas.
              </li>
            </ol>
            <P>
              Todas las respuestas son JSON. Los mensajes de error están en español. La API
              es de solo lectura: ningún endpoint crea, modifica ni elimina datos.
            </P>
          </Section>

          <Section id="autenticacion" title="Autenticación">
            <P>
              Todas las peticiones requieren una <strong>API key</strong>. Las claves se
              crean y revocan desde <em>Configuración → API</em> en el dashboard de GESTIVO
              (solo administradores) y tienen el formato{" "}
              <InlineCode>sk_live_...</InlineCode>. La clave se envía en cada petición
              usando cualquiera de estos dos headers:
            </P>
            <ParamsTable
              title="Headers de autenticación"
              rows={[
                { name: "x-api-key", type: "string", desc: "La API key tal cual. Forma recomendada." },
                { name: "Authorization", type: "string", desc: "Alternativa: `Bearer <api-key>`." },
              ]}
            />
            <CodeBlock
              title="Ejemplo"
              code={`curl -H "x-api-key: sk_live_XXXXXXXXXXXX" \\
  "${BASE_URL}/api/external/v1/schema"`}
            />
            <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-4 text-sm leading-relaxed text-[#92400E]">
              <strong>Importante:</strong> la clave completa se muestra una sola vez al
              crearla (solo se almacena su hash). Trátela como una contraseña: no la
              incluya en código fuente ni en URLs, y use una clave distinta por cada
              integración para poder revocarlas de forma independiente.
            </div>
          </Section>

          <Section id="endpoints" title="Endpoints">
            <Endpoint id="endpoint-schema" method="GET" path="/api/external/v1/schema">
              <P>
                Catálogo autodescriptivo: devuelve todos los recursos disponibles con su
                dominio, descripción, orden por defecto y columnas reales (introspectadas
                en vivo). Es el punto de partida recomendado para cualquier integración —
                especialmente agentes de IA.
              </P>
              <CodeBlock
                title="Request"
                code={`curl -H "x-api-key: $KEY" "${BASE_URL}/api/external/v1/schema"`}
              />
              <CodeBlock
                title="Response · 200"
                code={`{
  "version": "v1",
  "description": "Data API de solo lectura de GESTIVO...",
  "operators": ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"],
  "resources": [
    {
      "resource": "conductores_con_grupo",
      "domain": "rotacion",
      "description": "Maestro de conductores con su grupo de antigüedad...",
      "defaultOrder": "fecha_ingreso",
      "columns": ["cedula", "nombre", "codigo", "estado", "grupo", "..."]
    }
  ]
}`}
              />
            </Endpoint>

            <div className="h-4" />

            <Endpoint id="endpoint-query-get" method="GET" path="/api/external/v1/query">
              <P>
                Forma rápida de consultar: los parámetros van en la URL y cualquier
                parámetro no reservado se interpreta como filtro de igualdad. Ideal para
                pruebas y consultas simples.
              </P>
              <ParamsTable
                title="Query params"
                rows={[
                  { name: "resource", type: "string · requerido", desc: "Nombre del recurso (ver /schema o el catálogo abajo)." },
                  { name: "select", type: "string", desc: "Columnas a devolver, separadas por coma. Por defecto: todas (*)." },
                  { name: "order", type: "string", desc: "Columna por la que ordenar. Si se omite, usa el orden por defecto del recurso (descendente)." },
                  { name: "order_dir", type: "asc | desc", desc: "Dirección del orden. Por defecto: desc." },
                  { name: "limit", type: "number", desc: "Filas por página. Por defecto 100, máximo 1000." },
                  { name: "offset", type: "number", desc: "Desplazamiento para paginar. Por defecto 0." },
                  { name: "<columna>", type: "string", desc: "Cualquier otro parámetro filtra por igualdad: ?estado=ACTIVO." },
                ]}
              />
              <CodeBlock
                title="Request · conductores activos"
                code={`curl -H "x-api-key: $KEY" \\
  "${BASE_URL}/api/external/v1/query?resource=conductores_con_grupo&estado=ACTIVO&limit=50"`}
              />
            </Endpoint>

            <div className="h-4" />

            <Endpoint id="endpoint-query-post" method="POST" path="/api/external/v1/query">
              <P>
                La forma completa de consultar: admite todos los operadores de filtro,
                selección de columnas y orden explícito. El cuerpo es JSON (header{" "}
                <InlineCode>content-type: application/json</InlineCode>).
              </P>
              <ParamsTable
                title="Body (JSON)"
                rows={[
                  { name: "resource", type: "string · requerido", desc: "Nombre del recurso a consultar." },
                  { name: "select", type: "string", desc: "Columnas a devolver, separadas por coma. Por defecto: *." },
                  { name: "filters", type: "Filter[]", desc: "Lista de filtros { column, op, value }. Ver operadores abajo. Se combinan con AND." },
                  { name: "order", type: "{ column, ascending? }", desc: "Orden explícito. ascending por defecto es true." },
                  { name: "limit", type: "number", desc: "Filas por página. Por defecto 100, máximo 1000." },
                  { name: "offset", type: "number", desc: "Desplazamiento para paginar. Por defecto 0." },
                ]}
              />
              <CodeBlock
                title="Request · ausentismos de 2026 con más de 5 días"
                code={`curl -X POST "${BASE_URL}/api/external/v1/query" \\
  -H "x-api-key: $KEY" -H "content-type: application/json" \\
  -d '{
    "resource": "ausentismo",
    "select": "cedula,fecha_inicio,dias_it_pagados,diagnostico,eps",
    "filters": [
      { "column": "fecha_inicio", "op": "gte", "value": "2026-01-01" },
      { "column": "dias_it_pagados", "op": "gt", "value": 5 }
    ],
    "order": { "column": "dias_it_pagados", "ascending": false },
    "limit": 100
  }'`}
              />
              <CodeBlock
                title="Response · 200"
                code={`{
  "resource": "ausentismo",
  "count": 100,          // filas en esta página
  "total": 431,          // total de filas que cumplen los filtros
  "limit": 100,
  "offset": 0,
  "nextOffset": 100,     // null cuando no hay más páginas
  "data": [ { "cedula": "...", "fecha_inicio": "...", "...": "..." } ]
}`}
              />
            </Endpoint>

            <div className="h-4" />

            <Endpoint id="endpoint-aggregate" method="POST" path="/api/external/v1/aggregate">
              <P>
                Agregación en el servidor sobre <strong>todas</strong> las filas que
                cumplen los filtros, sin transferirlas. Devuelve una fila por grupo,
                ordenada de mayor a menor por el valor agregado. Úselo para responder
                preguntas tipo “quién tiene más…”, “cuánto suma…”, “promedio por…”.
              </P>
              <ParamsTable
                title="Body (JSON)"
                rows={[
                  { name: "resource", type: "string · requerido", desc: "Recurso sobre el que agregar." },
                  { name: "group_by", type: "string[] · requerido", desc: "Columnas por las que agrupar." },
                  { name: "agg", type: "count | sum | avg | min | max", desc: "Función de agregación. Por defecto: count." },
                  { name: "metric", type: "string", desc: "Columna numérica a agregar. Requerida salvo con agg=count." },
                  { name: "filters", type: "Filter[]", desc: "Mismos filtros que /query; se aplican antes de agrupar." },
                  { name: "limit", type: "number", desc: "Máximo de grupos a devolver. Por defecto 100." },
                ]}
              />
              <CodeBlock
                title="Request · top 10 conductores con más viajes perdidos"
                code={`curl -X POST "${BASE_URL}/api/external/v1/aggregate" \\
  -H "x-api-key: $KEY" -H "content-type: application/json" \\
  -d '{
    "resource": "viajes_perdidos",
    "group_by": ["cedula_conductor"],
    "agg": "count",
    "limit": 10
  }'`}
              />
              <CodeBlock
                title="Response · 200"
                code={`{
  "resource": "viajes_perdidos",
  "groupBy": ["cedula_conductor"],
  "agg": "count",
  "metric": null,
  "count": 10,
  "data": [
    { "cedula_conductor": "1023456789", "value": 42 },
    { "cedula_conductor": "1098765432", "value": 37 }
  ]
}`}
              />
            </Endpoint>
          </Section>

          <Section id="filtros" title="Filtros y operadores">
            <P>
              Los filtros son objetos <InlineCode>{`{ column, op, value }`}</InlineCode> y
              se combinan siempre con <strong>AND</strong>. Estos son los operadores
              admitidos:
            </P>
            <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-left text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                    <th className="px-4 py-2">Operador</th>
                    <th className="px-4 py-2">Significado</th>
                    <th className="px-4 py-2">Ejemplo</th>
                  </tr>
                </thead>
                <tbody>
                  {OPERATORS.map((o) => (
                    <tr key={o.op} className="border-b border-[#F1F5F9] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[#4F46E5]">{o.op}</td>
                      <td className="px-4 py-2.5 text-[#475569]">{o.desc}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[#64748B]">{o.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <P>
              Para <InlineCode>in</InlineCode>, el valor puede ser una lista JSON o una
              cadena separada por comas. Para <InlineCode>like</InlineCode> /{" "}
              <InlineCode>ilike</InlineCode>, use <InlineCode>%</InlineCode> como comodín.
            </P>
          </Section>

          <Section id="paginacion" title="Paginación">
            <P>
              La paginación es por <InlineCode>limit</InlineCode> +{" "}
              <InlineCode>offset</InlineCode>. Cada respuesta de{" "}
              <InlineCode>/query</InlineCode> incluye <InlineCode>total</InlineCode> (filas
              que cumplen los filtros) y <InlineCode>nextOffset</InlineCode>: páselo como{" "}
              <InlineCode>offset</InlineCode> de la siguiente petición hasta que sea{" "}
              <InlineCode>null</InlineCode>.
            </P>
            <CodeBlock
              title="Bucle de paginación (JavaScript)"
              code={`let offset = 0;
const rows = [];

while (offset !== null) {
  const res = await fetch("${BASE_URL}/api/external/v1/query", {
    method: "POST",
    headers: { "x-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({ resource: "cierres_diarios", limit: 1000, offset }),
  });
  const page = await res.json();
  rows.push(...page.data);
  offset = page.nextOffset; // null en la última página
}`}
            />
          </Section>

          <Section id="errores" title="Errores">
            <P>
              Los errores devuelven un JSON con el campo <InlineCode>error</InlineCode> y
              un mensaje descriptivo en español:
            </P>
            <CodeBlock
              title="Formato de error"
              code={`{ "error": "Recurso 'conductores' no permitido o inexistente. Consulte /api/external/v1/schema." }`}
            />
            <div className="overflow-x-auto rounded-lg border border-[#E2E8F0]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-left text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
                    <th className="px-4 py-2">Código</th>
                    <th className="px-4 py-2">Significado</th>
                    <th className="px-4 py-2">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {ERRORS.map((e) => (
                    <tr key={e.code} className="border-b border-[#F1F5F9] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[#DC2626]">{e.code}</td>
                      <td className="px-4 py-2.5 font-medium text-[#0F172A]">{e.meaning}</td>
                      <td className="px-4 py-2.5 text-[#475569]">{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="recursos" title="Catálogo de recursos">
            <P>
              Estos son los <strong>{resources.length} recursos</strong> disponibles,
              agrupados por dominio. Las columnas se muestran tal como existen hoy en la
              base de datos (esta página las introspecta en vivo, igual que{" "}
              <InlineCode>GET /schema</InlineCode>).
            </P>
            <div className="space-y-8">
              {domains.map((domain) => (
                <div key={domain}>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-[1.5px] text-[#94A3B8]">
                    {DOMAIN_LABELS[domain] ?? domain}
                  </h3>
                  <div className="space-y-4">
                    {resources
                      .filter((r) => r.domain === domain)
                      .map((r) => (
                        <div key={r.name} className="rounded-xl border border-[#E2E8F0] bg-white p-5">
                          <div className="flex flex-wrap items-center gap-3">
                            <code className="font-mono text-sm font-bold text-[#0F172A]">{r.name}</code>
                            {r.defaultOrder && (
                              <span className="rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-[11px] font-medium text-[#64748B]">
                                orden por defecto: {r.defaultOrder} ↓
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-[#475569]">{r.description}</p>
                          {r.columns.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {r.columns.map((c) => (
                                <code
                                  key={c}
                                  className="rounded bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[11px] text-[#475569] ring-1 ring-[#E2E8F0]"
                                >
                                  {c}
                                </code>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="ejemplos" title="Ejemplos de integración">
            <CodeBlock
              title="cURL"
              code={`BASE="${BASE_URL}"
KEY="sk_live_XXXXXXXXXXXX"

# 1. Descubrir recursos y columnas
curl -s -H "x-api-key: $KEY" "$BASE/api/external/v1/schema" | jq .

# 2. Conductores activos
curl -s -H "x-api-key: $KEY" \\
  "$BASE/api/external/v1/query?resource=conductores_con_grupo&estado=ACTIVO&limit=20" | jq .

# 3. Gasto total de Meta Ads por campaña
curl -s -X POST -H "x-api-key: $KEY" -H "content-type: application/json" \\
  -d '{"resource":"meta_spend_daily","group_by":["campaign_id"],"agg":"sum","metric":"gasto"}' \\
  "$BASE/api/external/v1/aggregate" | jq .`}
            />
            <CodeBlock
              title="JavaScript / TypeScript"
              code={`const BASE = "${BASE_URL}/api/external/v1";
const KEY = process.env.GESTIVO_API_KEY;

async function query(body) {
  const res = await fetch(\`\${BASE}/query\`, {
    method: "POST",
    headers: { "x-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

// Accidentes pendientes de revisión, más recientes primero
const { data } = await query({
  resource: "accidentes",
  filters: [{ column: "estado", op: "eq", value: "pendiente_revision" }],
  limit: 50,
});`}
            />
            <CodeBlock
              title="Python"
              code={`import os, requests

BASE = "${BASE_URL}/api/external/v1"
HEADERS = {"x-api-key": os.environ["GESTIVO_API_KEY"]}

# Incapacidades del primer semestre de 2026
res = requests.post(f"{BASE}/query", headers=HEADERS, json={
    "resource": "ausentismo",
    "filters": [
        {"column": "fecha_inicio", "op": "gte", "value": "2026-01-01"},
        {"column": "fecha_inicio", "op": "lt",  "value": "2026-07-01"},
    ],
    "limit": 1000,
})
res.raise_for_status()
print(res.json()["total"], "registros")`}
            />
            <P>
              Para conectar un <strong>agente de IA</strong> (Hermes, GPTs, Claude, n8n…),
              configure la autenticación como API key en header{" "}
              <InlineCode>x-api-key</InlineCode> y dele esta instrucción al modelo:
            </P>
            <CodeBlock
              title="Instrucciones para el modelo"
              code={`Tienes una Data API de solo lectura de GESTIVO.
- Primero llama GET /schema para ver los recursos y columnas disponibles.
- Luego llama POST /query con { resource, filters?, order?, limit? } para traer datos.
- Para métricas (conteos, sumas, promedios) usa POST /aggregate con { resource, group_by, agg, metric? }.
- Operadores de filtro: eq, neq, gt, gte, lt, lte, like, ilike, in, is.
- Nunca inventes nombres de recurso o columna: úsalos tal como aparecen en /schema.
- Límite máximo 1000 filas por consulta; usa filtros para acotar y nextOffset para paginar.`}
            />
          </Section>

          <Section id="limites" title="Límites y buenas prácticas">
            <ul className="list-disc space-y-2 pl-6 text-[15px] leading-relaxed text-[#475569]">
              <li>
                <strong>Máximo 1000 filas por petición.</strong> Para volúmenes mayores,
                pagine con <InlineCode>nextOffset</InlineCode> o use{" "}
                <InlineCode>/aggregate</InlineCode> si solo necesita métricas.
              </li>
              <li>
                <strong>Seleccione solo las columnas que necesita</strong> con{" "}
                <InlineCode>select</InlineCode>: reduce el tamaño de la respuesta y acelera
                la consulta.
              </li>
              <li>
                <strong>Filtre por fecha</strong> en recursos grandes (
                <InlineCode>cierres_diarios</InlineCode>,{" "}
                <InlineCode>puntos_virtuales</InlineCode> si se habilita) para evitar
                recorrer todo el histórico.
              </li>
              <li>
                <strong>Una clave por integración.</strong> Así puede revocar el acceso de
                un consumidor sin afectar al resto y saber quién usa la API (columna
                “último uso”).
              </li>
              <li>
                <strong>La API es de solo lectura.</strong> No hay endpoints de escritura y
                los recursos disponibles están limitados por una lista blanca en el
                servidor.
              </li>
            </ul>
          </Section>

          <footer className="py-10 text-center text-sm text-[#94A3B8]">
            GESTIVO · Data API v1 · Documentación generada desde el catálogo real de recursos.
          </footer>
        </main>
      </div>
    </div>
  );
}
