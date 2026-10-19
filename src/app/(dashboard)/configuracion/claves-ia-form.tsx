"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, KeyRound, Trash2, ExternalLink } from "lucide-react";
import { guardarClave, quitarClave } from "@/lib/ia/actions";
import { PROVEEDORES_IA, type ProveedorIA } from "@/lib/ia/proveedores";
import type { EstadoClave } from "@/lib/ia/claves";

const FUENTE: Record<string, string> = {
  config: "",
  env: " · variable de entorno",
  agente: " · guardada en el agente (guárdala aquí para moverla)",
};

function FilaClave({ id, estado, editable }: { id: ProveedorIA; estado: EstadoClave | undefined; editable: boolean }) {
  const p = PROVEEDORES_IA.find((x) => x.id === id)!;
  const [valor, setValor] = useState("");
  const [pending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);

  function guardar() {
    setMensaje(null);
    startTransition(async () => {
      const r = await guardarClave(id, valor);
      if (r.ok) {
        setValor("");
        setMensaje({ ok: true, texto: "Verificada con el proveedor y guardada." });
      } else setMensaje({ ok: false, texto: r.error ?? "No se pudo guardar." });
    });
  }

  function quitar() {
    setMensaje(null);
    startTransition(async () => {
      const r = await quitarClave(id);
      setMensaje(r.ok ? { ok: true, texto: "API key quitada." } : { ok: false, texto: r.error ?? "No se pudo quitar." });
    });
  }

  return (
    <div className="space-y-2 border-b border-[#F1F5F9] py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{p.nombre}</p>
          <a
            href={p.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#4F46E5]"
          >
            {p.donde} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {estado?.configurada ? (
          <span className="shrink-0 text-right text-sm font-medium text-[#059669]">
            Configurada ({estado.enmascarada}){FUENTE[estado.fuente ?? "config"]}
          </span>
        ) : (
          <span className="shrink-0 text-sm font-medium text-[#D97706]">No configurada</span>
        )}
      </div>

      {editable && (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={estado?.configurada ? `Reemplazar (${p.prefijo}…)` : `${p.prefijo}…`}
            className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
          />
          <button
            onClick={guardar}
            disabled={pending || valor.trim().length < 10}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Guardar
          </button>
          {estado?.configurada && estado.fuente !== "env" && (
            <button
              onClick={quitar}
              disabled={pending}
              className="inline-flex shrink-0 items-center rounded-lg border border-[#E2E8F0] p-2 text-gray-500 hover:bg-gray-50 hover:text-[#EF4444] disabled:opacity-60"
              aria-label={`Quitar la API key de ${p.nombre}`}
              title="Quitar API key"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {mensaje && (
        <p className={`flex items-center gap-1.5 text-sm ${mensaje.ok ? "text-[#059669]" : "text-[#EF4444]"}`}>
          {mensaje.ok && <Check className="h-4 w-4" />} {mensaje.texto}
        </p>
      )}
    </div>
  );
}

/**
 * API keys de los proveedores de IA. Las usan la transcripción de accidentes
 * (OpenAI) y el agente de WhatsApp, que ofrece solo los proveedores con key.
 */
export default function ClavesIAForm({ estados, editable }: { estados: EstadoClave[]; editable: boolean }) {
  return (
    <div>
      {PROVEEDORES_IA.map((p) => (
        <FilaClave key={p.id} id={p.id} estado={estados.find((e) => e.proveedor === p.id)} editable={editable} />
      ))}
      <p className="pt-2 text-xs text-gray-500">
        {editable
          ? "Cada key se verifica con el proveedor antes de guardarla. Se guardan cifradas y nunca se muestran completas."
          : "Solo el administrador puede cambiar las API keys."}
      </p>
    </div>
  );
}
