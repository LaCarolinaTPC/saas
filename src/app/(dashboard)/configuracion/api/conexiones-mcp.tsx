"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bot, Check, Copy, Plug } from "lucide-react";
import { revocarConexionMcp } from "./actions";

export type ConexionMcpRow = {
  id: string;
  cliente: string;
  destino: string | null;
  autorizada_por: string | null;
  creado_at: string;
  ultimo_uso_at: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Copiable({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-gray-50 p-2.5">
      <code className="min-w-0 flex-1 break-all font-mono text-xs text-gray-800">{texto}</code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        }}
        className="shrink-0 rounded-lg border border-[#E2E8F0] bg-white p-1.5 text-gray-600 hover:bg-gray-50"
        title="Copiar"
      >
        {copiado ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function ConexionesMcp({
  urlMcp,
  conexiones,
  migracionPendiente,
}: {
  urlMcp: string;
  conexiones: ConexionMcpRow[];
  migracionPendiente: boolean;
}) {
  const [objetivo, setObjetivo] = useState<ConexionMcpRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function revocar() {
    if (!objetivo) return;
    setError(null);
    startTransition(async () => {
      try {
        await revocarConexionMcp(objetivo.id);
        setObjetivo(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo revocar la conexión.");
      }
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div className="flex items-start gap-3">
        <Plug className="mt-0.5 h-5 w-5 text-[#4F46E5]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-900">Servidor MCP para agentes de IA</h2>
          <p className="mt-1 text-sm text-gray-500">
            Claude, ChatGPT, Codex, Cursor, Hermes y cualquier agente compatible con MCP pueden
            consultar los datos de Gestivo en solo lectura, con la documentación de cada dato en
            cada respuesta. Se conectan con OAuth (un administrador autoriza) o con una de las API
            keys de arriba enviada como <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">Authorization: Bearer</code>.{" "}
            <Link href="/docs/api#mcp" target="_blank" className="font-medium text-[#4F46E5] hover:underline">
              Guía de conexión
            </Link>
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">URL del servidor</p>
              <Copiable texto={urlMcp} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Claude Code con API key</p>
              <Copiable
                texto={`claude mcp add --transport http gestivo ${urlMcp} --header "Authorization: Bearer sk_live_…"`}
              />
            </div>
            <div className="lg:col-start-2">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Codex con API key</p>
              <Copiable
                texto={`codex mcp add gestivo --url ${urlMcp} --bearer-token-env-var GESTIVO_API_KEY`}
              />
            </div>
          </div>
        </div>
      </div>

      <h3 className="mt-8 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Bot className="h-4 w-4 text-gray-500" /> Agentes conectados por OAuth
      </h3>

      {migracionPendiente ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Falta aplicar la migración del servidor MCP en la base de datos; hasta entonces no hay
          conexiones OAuth ni agregaciones.
        </p>
      ) : conexiones.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          Ningún agente autorizado por OAuth. Aparecerán aquí cuando un administrador conecte
          claude.ai, ChatGPT u otro cliente.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-4">Agente</th>
                <th className="py-2 pr-4">Retorna a</th>
                <th className="whitespace-nowrap py-2 pr-4">Autorizado por</th>
                <th className="whitespace-nowrap py-2 pr-4">Autorizado</th>
                <th className="whitespace-nowrap py-2 pr-4">Último uso</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {conexiones.map((c) => (
                <tr key={c.id} className="border-b border-[#F1F5F9] last:border-0">
                  <td className="py-3 pr-4 font-medium text-gray-900">{c.cliente}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-gray-500">{c.destino ?? "—"}</td>
                  <td className="whitespace-nowrap py-3 pr-4 text-gray-500">{c.autorizada_por ?? "—"}</td>
                  <td className="whitespace-nowrap py-3 pr-4 text-gray-500">{formatDate(c.creado_at)}</td>
                  <td className="whitespace-nowrap py-3 pr-4 text-gray-500">{formatDate(c.ultimo_uso_at)}</td>
                  <td className="whitespace-nowrap py-3 text-right">
                    <button
                      onClick={() => setObjetivo(c)}
                      className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Revocar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {objetivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Revocar acceso</h3>
            <p className="mt-2 text-sm text-gray-600">
              <strong>{objetivo.cliente}</strong> dejará de consultar Gestivo de inmediato. Para
              volver a conectarlo, un administrador tendrá que autorizarlo otra vez.
            </p>
            {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setObjetivo(null);
                  setError(null);
                }}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={revocar}
                disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isPending ? "Revocando…" : "Revocar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
