"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle, Search, Send, Loader2, CheckCheck, Check, TriangleAlert,
  Paperclip, Clock, Settings,
} from "lucide-react";
import type { ConversacionResumen, MensajeChat } from "@/lib/comunicaciones/data";
import { enviarMensaje } from "@/lib/comunicaciones/actions";

const HORA = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" });
const FECHA = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" });

function ventanaAbierta(ultimoEntranteAt: string | null): boolean {
  if (!ultimoEntranteAt) return false;
  return Date.now() - new Date(ultimoEntranteAt).getTime() < 24 * 60 * 60 * 1000;
}

function EstadoIcon({ m }: { m: MensajeChat }) {
  if (m.direccion !== "saliente") return null;
  if (m.estado === "failed")
    return <TriangleAlert className="h-3 w-3 text-red-500" aria-label="Falló" />;
  if (m.estado === "read") return <CheckCheck className="h-3 w-3 text-sky-500" />;
  if (m.estado === "delivered") return <CheckCheck className="h-3 w-3 text-slate-400" />;
  return <Check className="h-3 w-3 text-slate-400" />;
}

export default function BandejaClient({
  conversaciones,
  activa,
  mensajes,
}: {
  conversaciones: ConversacionResumen[];
  activa: string | null;
  mensajes: MensajeChat[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  const conv = activa ? conversaciones.find((c) => c.id === activa) ?? null : null;
  const puedeEscribir = conv ? ventanaAbierta(conv.ultimoEntranteAt) : false;

  // Mensajes nuevos llegan por webhook: refrescar mientras la pestaña está visible.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 7000);
    return () => clearInterval(t);
  }, [router]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes.length, activa]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return conversaciones;
    return conversaciones.filter(
      (c) => c.telefono.includes(q) || (c.nombre ?? "").toLowerCase().includes(q)
    );
  }, [conversaciones, busqueda]);

  async function onEnviar() {
    if (!activa || !texto.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    const res = await enviarMensaje(activa, texto);
    setEnviando(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo enviar.");
      return;
    }
    setTexto("");
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-6 lg:p-8">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <MessageCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Comunicaciones</h1>
          <p className="text-sm text-text-tertiary">
            WhatsApp de la empresa · {conversaciones.length} conversaciones
          </p>
        </div>
        {isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin text-text-muted" />}
        <Link
          href="/comunicaciones/configuracion"
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-text-secondary hover:bg-slate-50"
        >
          <Settings className="h-3.5 w-3.5" /> Configurar canal
        </Link>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* Lista de conversaciones */}
        <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-surface-raised">
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar nombre o teléfono…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-text-muted"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtradas.length === 0 ? (
              <p className="p-6 text-center text-xs text-text-tertiary">
                {conversaciones.length === 0
                  ? "Aún no hay conversaciones. Llegarán aquí cuando alguien escriba al WhatsApp de la empresa."
                  : "Nada coincide con la búsqueda."}
              </p>
            ) : (
              filtradas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => router.push(`/comunicaciones?c=${c.id}`, { scroll: false })}
                  className={`block w-full border-b border-border/60 px-3 py-2.5 text-left transition-colors cursor-pointer ${
                    c.id === activa ? "bg-primary/5" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">
                      {c.nombre ?? `+${c.telefono}`}
                    </span>
                    <span className="shrink-0 text-[10px] text-text-muted">
                      {FECHA.format(new Date(c.ultimoMensajeAt))}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-text-tertiary">{c.ultimoMensaje}</span>
                    {c.noLeidos > 0 && (
                      <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                        {c.noLeidos}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Hilo */}
        <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-surface-raised">
          {!conv ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <MessageCircle className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-text-primary">Selecciona una conversación</p>
              <p className="mt-1 max-w-xs text-xs text-text-tertiary">
                Los mensajes que lleguen al WhatsApp de la empresa aparecen en la lista de la izquierda.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-text-primary">
                    {conv.nombre ?? `+${conv.telefono}`}
                  </div>
                  <div className="text-xs text-text-tertiary">+{conv.telefono}</div>
                </div>
                {!puedeEscribir && (
                  <span className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                    <Clock className="h-3 w-3" />
                    Ventana de 24 h cerrada
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-4">
                {mensajes.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direccion === "saliente" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        m.direccion === "saliente"
                          ? "rounded-br-md bg-primary text-white"
                          : "rounded-bl-md border border-border bg-white text-text-primary"
                      }`}
                    >
                      {m.mediaTipo && (
                        <div
                          className={`mb-1 flex items-center gap-1.5 text-xs ${
                            m.direccion === "saliente" ? "text-white/80" : "text-text-tertiary"
                          }`}
                        >
                          <Paperclip className="h-3 w-3" />
                          {m.nombreArchivo ?? m.mediaTipo}
                        </div>
                      )}
                      {m.contenido && (
                        <p className="whitespace-pre-wrap break-words">{m.contenido}</p>
                      )}
                      <div
                        className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                          m.direccion === "saliente" ? "text-white/70" : "text-text-muted"
                        }`}
                      >
                        {m.enviadoPor && <span className="truncate">{m.enviadoPor.split("@")[0]}</span>}
                        <span>{HORA.format(new Date(m.timestamp))}</span>
                        <EstadoIcon m={m} />
                      </div>
                      {m.estado === "failed" && m.errorMensaje && (
                        <p className="mt-1 text-[10px] text-red-200">{m.errorMensaje}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={finRef} />
              </div>

              <div className="border-t border-border p-3">
                {error && (
                  <p className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onEnviar();
                      }
                    }}
                    rows={1}
                    placeholder={
                      puedeEscribir
                        ? "Escribe un mensaje… (Enter envía, Shift+Enter salto de línea)"
                        : "La ventana de 24 h está cerrada: el contacto debe escribir primero."
                    }
                    disabled={!puedeEscribir || enviando}
                    className="max-h-32 min-h-9 flex-1 resize-y rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary/30 disabled:bg-slate-50 disabled:text-text-muted"
                  />
                  <button
                    onClick={onEnviar}
                    disabled={!puedeEscribir || enviando || !texto.trim()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary/90 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
                    aria-label="Enviar mensaje"
                  >
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
