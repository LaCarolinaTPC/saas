"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Plus, ShieldAlert, X } from "lucide-react";
import { createApiKey, revokeApiKey } from "./actions";

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApiKeysClient({ keys }: { keys: ApiKeyRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const { key } = await createApiKey(name);
        setNewKey(key);
        setName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear la clave.");
      }
    });
  }

  function handleRevoke() {
    if (!revokeTarget) return;
    setError(null);
    startTransition(async () => {
      try {
        await revokeApiKey(revokeTarget.id);
        setRevokeTarget(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo revocar la clave.");
      }
    });
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function closeCreate() {
    setCreateOpen(false);
    setNewKey(null);
    setName("");
    setError(null);
  }

  return (
    <>
      {/* Intro + acción */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 text-[#4F46E5]" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">API Keys</h2>
              <p className="mt-1 text-sm text-gray-500">
                Claves de acceso a la Data API de solo lectura (
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">/api/external/v1</code>
                ). Cada consumidor (IA, BI, integraciones) debería tener su propia
                clave para poder revocarla sin afectar a los demás.
              </p>
            </div>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
          >
            <Plus className="h-4 w-4" /> Nueva clave
          </button>
        </div>

        {/* Tabla de claves */}
        <div className="mt-6 overflow-x-auto">
          {keys.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              Aún no hay claves. Crea la primera para conectar un consumidor externo.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F1F5F9] text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Clave</th>
                  <th className="py-2 pr-4">Creada</th>
                  <th className="py-2 pr-4">Último uso</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-[#F1F5F9] last:border-0">
                    <td className="py-3 pr-4 font-medium text-gray-900">{k.name}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-gray-500">
                      {k.key_prefix}…
                    </td>
                    <td className="py-3 pr-4 text-gray-500">{formatDate(k.created_at)}</td>
                    <td className="py-3 pr-4 text-gray-500">{formatDate(k.last_used_at)}</td>
                    <td className="py-3 pr-4">
                      {k.is_active ? (
                        <span className="inline-flex rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-xs font-medium text-[#166534]">
                          Activa
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-medium text-[#991B1B]">
                          Revocada
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {k.is_active && (
                        <button
                          onClick={() => setRevokeTarget(k)}
                          className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Revocar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal: crear clave / mostrar clave una vez */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {newKey ? "Clave creada" : "Nueva API key"}
              </h3>
              <button onClick={closeCreate} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {newKey ? (
              <>
                <p className="text-sm text-gray-600">
                  Copia la clave ahora.{" "}
                  <span className="font-semibold text-red-600">
                    No se volverá a mostrar
                  </span>
                  : solo guardamos una versión cifrada.
                </p>
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-gray-50 p-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-gray-800">
                    {newKey}
                  </code>
                  <button
                    onClick={copyKey}
                    className="shrink-0 rounded-lg border border-[#E2E8F0] bg-white p-2 text-gray-600 hover:bg-gray-50"
                    title="Copiar"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={closeCreate}
                    className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA]"
                  >
                    Listo
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Nombre del consumidor
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    placeholder="Ej: Hermes IA, Power BI, n8n..."
                    className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
                    autoFocus
                  />
                  <p className="mt-1.5 text-xs text-gray-400">
                    Un nombre que te permita saber quién usa la clave.
                  </p>
                </div>
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={closeCreate}
                    className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={isPending || !name.trim()}
                    className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
                  >
                    {isPending ? "Creando..." : "Crear clave"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal: confirmar revocación */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  ¿Revocar “{revokeTarget.name}”?
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  La clave dejará de funcionar de inmediato y no se puede reactivar.
                  Cualquier integración que la use recibirá error 401.
                </p>
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setRevokeTarget(null)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleRevoke}
                disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Revocando..." : "Revocar clave"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
