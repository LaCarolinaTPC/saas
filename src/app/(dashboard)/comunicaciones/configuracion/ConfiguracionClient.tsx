"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Copy, Loader2, Settings, TriangleAlert } from "lucide-react";
import { guardarCanal } from "@/lib/comunicaciones/actions";

interface CanalActual {
  phoneNumberId: string;
  wabaId: string | null;
  verifyToken: string | null;
  numeroMostrado: string | null;
  tieneToken: boolean;
  tieneAppSecret: boolean;
  origen: "db" | "env";
}

function tokenAleatorio(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `gestivo-wa-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const campo =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none " +
  "placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary/30";

export default function ConfiguracionClient({ actual }: { actual: CanalActual | null }) {
  const [phoneNumberId, setPhoneNumberId] = useState(actual?.phoneNumberId ?? "");
  const [wabaId, setWabaId] = useState(actual?.wabaId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [verifyToken, setVerifyToken] = useState(actual?.verifyToken ?? tokenAleatorio());
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/webhook/whatsapp` : "";

  async function copiar(texto: string, id: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      // El navegador puede negar el portapapeles: el usuario copia a mano.
    }
  }

  async function onGuardar() {
    setGuardando(true);
    setResultado(null);
    const res = await guardarCanal({ phoneNumberId, wabaId, accessToken, appSecret, verifyToken });
    setGuardando(false);
    if (res.ok) {
      setAccessToken("");
      setAppSecret("");
      setResultado({
        ok: true,
        texto: `Conectado con Meta: ${res.nombre ?? "número verificado"} (${res.numero ?? phoneNumberId}).`,
      });
    } else {
      setResultado({ ok: false, texto: res.error ?? "No se pudo guardar." });
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <Link
        href="/comunicaciones"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a la bandeja
      </Link>

      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Canal de WhatsApp</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            {actual
              ? `Conectado: ${actual.numeroMostrado ?? actual.phoneNumberId}${actual.origen === "env" ? " (desde variables de entorno)" : ""}`
              : "Registra las credenciales de la WhatsApp Business Cloud API (Meta)."}
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-surface-raised p-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Phone number ID <span className="text-red-500">*</span>
          </label>
          <input
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="p. ej. 103845762490128"
            className={campo}
          />
          <p className="mt-1 text-[11px] text-text-muted">
            developers.facebook.com → tu app → WhatsApp → API Setup.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Access token {actual?.tieneToken ? "(dejar vacío para conservar el actual)" : <span className="text-red-500">*</span>}
          </label>
          <input
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            type="password"
            placeholder={actual?.tieneToken ? "••••••••  (guardado)" : "Token permanente del usuario del sistema"}
            className={campo}
          />
          <p className="mt-1 text-[11px] text-text-muted">
            business.facebook.com → Usuarios del sistema → token con permisos
            whatsapp_business_messaging y whatsapp_business_management. Se guarda cifrado.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">WABA ID (opcional)</label>
            <input
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="Id de la cuenta de WhatsApp Business"
              className={campo}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              App secret {actual?.tieneAppSecret ? "(dejar vacío para conservar)" : "(recomendado)"}
            </label>
            <input
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              type="password"
              placeholder={actual?.tieneAppSecret ? "••••••••  (guardado)" : "Valida la firma del webhook"}
              className={campo}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Verify token <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              value={verifyToken}
              onChange={(e) => setVerifyToken(e.target.value)}
              className={campo}
            />
            <button
              onClick={() => copiar(verifyToken, "vt")}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-xs text-text-secondary hover:bg-slate-50 cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" /> {copiado === "vt" ? "¡Copiado!" : "Copiar"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            Se pega tal cual en la configuración del webhook en Meta.
          </p>
        </div>

        {resultado && (
          <div
            className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${
              resultado.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {resultado.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            {resultado.texto}
          </div>
        )}

        <button
          onClick={onGuardar}
          disabled={guardando || !phoneNumberId.trim() || !verifyToken.trim()}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
          Probar conexión y guardar
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-surface-raised p-5">
        <h2 className="text-sm font-semibold text-text-primary">Webhook en Meta</h2>
        <p className="mt-1 text-xs text-text-tertiary">
          En developers.facebook.com → tu app → WhatsApp → Configuration → Webhook, registra esta
          URL con el verify token de arriba y suscríbete al campo <b>messages</b>. Desde ese
          momento los mensajes del número llegan a Gestivo (y dejan de llegar a Varylo).
        </p>
        <div className="mt-2 flex gap-2">
          <code className="flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 text-xs text-text-secondary">
            {webhookUrl || "/api/webhook/whatsapp"}
          </code>
          <button
            onClick={() => copiar(webhookUrl, "wh")}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs text-text-secondary hover:bg-slate-50 cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" /> {copiado === "wh" ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
      </div>
    </div>
  );
}
