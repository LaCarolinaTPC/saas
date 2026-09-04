"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle, Search, Send, Loader2, CheckCheck, Check, TriangleAlert,
  Paperclip, Clock, Settings, LayoutTemplate, MessageSquarePlus, FileText, X, Download, PanelRightOpen, PanelRightClose,
} from "lucide-react";
import type { ConversacionResumen, MensajeChat } from "@/lib/comunicaciones/data";
import { enviarMensaje } from "@/lib/comunicaciones/actions";
import PlantillaModal from "./PlantillaModal";
import FichaContacto from "./FichaContacto";
import type { FichaContacto as Ficha } from "@/lib/comunicaciones/ficha";

/**
 * Preferencia "panel de contacto abierto/cerrado", guardada en el navegador.
 * Se lee con useSyncExternalStore para que el servidor y la hidratación
 * coincidan (abierto) y el cliente adopte lo guardado justo después.
 */
const CLAVE_PANEL = "comunicaciones.panelContacto";
const oyentesPanel = new Set<() => void>();
const panelStore = {
  subscribe(cb: () => void) {
    oyentesPanel.add(cb);
    window.addEventListener("storage", cb);
    return () => {
      oyentesPanel.delete(cb);
      window.removeEventListener("storage", cb);
    };
  },
  get(): boolean {
    try {
      return localStorage.getItem(CLAVE_PANEL) !== "cerrado";
    } catch {
      return true;
    }
  },
  getServer(): boolean {
    return true;
  },
  set(abierto: boolean) {
    try {
      localStorage.setItem(CLAVE_PANEL, abierto ? "abierto" : "cerrado");
    } catch {
      /* sin localStorage: no se recuerda */
    }
    oyentesPanel.forEach((cb) => cb());
  },
};

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

/** Las URLs firmadas valen 1 h; se renuevan antes, cuando nada se está reproduciendo. */
const RENOVAR_URL_MS = 50 * 60 * 1000;

/**
 * Conserva la primera URL firmada de un medio aunque el refresco periódico
 * (router.refresh cada 7 s) traiga una firma distinta: si el `src` cambiara,
 * el navegador reiniciaría el audio o video a mitad de reproducción. Solo se
 * adopta la URL nueva cuando el medio recién se archivó (antes era null),
 * cuando la firma está por vencer y no hay reproducción en curso, o cuando
 * el navegador no pudo cargarla (firma vencida).
 */
function useUrlEstable(urlActual: string | null, medioRef: RefObject<HTMLMediaElement | null>) {
  const [url, setUrl] = useState(urlActual);
  const desdeRef = useRef(0); // cuándo se adoptó la URL vigente
  const ultimaRef = useRef(urlActual);

  // El medio acaba de archivarse (antes no había copia): tomar la URL ya.
  if (!url && urlActual) setUrl(urlActual);

  useEffect(() => {
    ultimaRef.current = urlActual;
  }, [urlActual]);

  useEffect(() => {
    desdeRef.current = Date.now();
    const t = setInterval(() => {
      const reproduciendo = medioRef.current ? !medioRef.current.paused : false;
      const vencida = Date.now() - desdeRef.current > RENOVAR_URL_MS;
      const nueva = ultimaRef.current;
      if (vencida && !reproduciendo && nueva && nueva !== url) setUrl(nueva);
    }, 60 * 1000);
    return () => clearInterval(t);
  }, [url, medioRef]);

  const renovar = () => {
    if (ultimaRef.current && ultimaRef.current !== url) setUrl(ultimaRef.current);
  };
  return { url, renovar };
}

/** Foto, video, audio o documento dentro de la burbuja. */
function Medio({ m }: { m: MensajeChat }) {
  const medioRef = useRef<HTMLMediaElement | null>(null);
  const { url, renovar } = useUrlEstable(m.mediaUrl, medioRef);
  if (!m.mediaTipo) return null;
  const saliente = m.direccion === "saliente";
  const nombre = m.nombreArchivo ?? m.mediaTipo;

  if (!url) {
    return (
      <div className={`mb-1 flex items-center gap-1.5 text-xs ${saliente ? "text-white/80" : "text-text-tertiary"}`}>
        <Paperclip className="h-3 w-3" />
        <span className="truncate">{nombre}</span>
        <span className="opacity-70">(archivo no disponible)</span>
      </div>
    );
  }

  if (m.mediaTipo === "image" || m.mediaTipo === "sticker") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mb-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={nombre}
          onError={renovar}
          className={`max-h-72 w-auto max-w-full rounded-lg ${m.mediaTipo === "sticker" ? "max-h-32" : ""}`}
          loading="lazy"
        />
      </a>
    );
  }
  if (m.mediaTipo === "video") {
    return <video ref={(el) => { medioRef.current = el; }} src={url} onError={renovar} controls preload="metadata" className="mb-1 max-h-72 w-full max-w-sm rounded-lg" />;
  }
  if (m.mediaTipo === "audio") {
    return <audio ref={(el) => { medioRef.current = el; }} src={url} onError={renovar} controls preload="metadata" className="mb-1 w-64 max-w-full" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs ${
        saliente ? "bg-white/15 text-white hover:bg-white/25" : "bg-slate-100 text-text-primary hover:bg-slate-200"
      }`}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{nombre}</span>
      <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </a>
  );
}

export default function BandejaClient({
  conversaciones,
  activa,
  mensajes,
  ficha,
}: {
  conversaciones: ConversacionResumen[];
  activa: string | null;
  mensajes: MensajeChat[];
  ficha: Ficha | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [modal, setModal] = useState<"plantilla" | "nuevo" | null>(null);
  // Panel derecho con los datos del contacto; la preferencia se recuerda en el navegador.
  const panel = useSyncExternalStore(panelStore.subscribe, panelStore.get, panelStore.getServer);
  const finRef = useRef<HTMLDivElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const conv = activa ? conversaciones.find((c) => c.id === activa) ?? null : null;
  const puedeEscribir = conv ? ventanaAbierta(conv.ultimoEntranteAt) : false;

  // Mensajes nuevos llegan por webhook: refrescar mientras la pestaña está visible.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && !modal) router.refresh();
    }, 7000);
    return () => clearInterval(t);
  }, [router, modal]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes.length, activa]);

  const alternarPanel = () => panelStore.set(!panel);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return conversaciones;
    return conversaciones.filter(
      (c) => c.telefono.includes(q) || (c.nombre ?? "").toLowerCase().includes(q)
    );
  }, [conversaciones, busqueda]);

  async function onEnviar() {
    if (!activa || enviando) return;
    if (!archivo && !texto.trim()) return;
    setEnviando(true);
    setError(null);

    let res: { ok: boolean; error?: string };
    if (archivo) {
      const form = new FormData();
      form.append("conversacionId", activa);
      form.append("archivo", archivo);
      form.append("texto", texto);
      try {
        const r = await fetch("/api/comunicaciones/adjuntos", { method: "POST", body: form });
        res = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as typeof res;
      } catch {
        res = { ok: false, error: "No se pudo subir el archivo." };
      }
    } else {
      res = await enviarMensaje(activa, texto);
    }

    setEnviando(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo enviar.");
      startTransition(() => router.refresh());
      return;
    }
    setTexto("");
    setArchivo(null);
    startTransition(() => router.refresh());
  }

  function onElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!f) return;
    setError(null);
    setArchivo(f);
  }

  function irA(conversacionId: string) {
    setModal(null);
    setArchivo(null);
    setError(null);
    router.push(`/comunicaciones?c=${conversacionId}`, { scroll: false });
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
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setModal("nuevo")}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 cursor-pointer"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" /> Nuevo mensaje
          </button>
          <Link
            href="/comunicaciones/configuracion"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-text-secondary hover:bg-slate-50"
          >
            <Settings className="h-3.5 w-3.5" /> Configurar canal
          </Link>
        </div>
      </div>

      <div
        className={`grid min-h-0 flex-1 grid-cols-1 gap-4 ${
          conv && ficha && panel ? "lg:grid-cols-[340px_1fr] xl:grid-cols-[340px_1fr_300px]" : "lg:grid-cols-[340px_1fr]"
        }`}
      >
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
                  ? "Aún no hay conversaciones. Llegarán aquí cuando alguien escriba al WhatsApp de la empresa, o inicia una con «Nuevo mensaje»."
                  : "Nada coincide con la búsqueda."}
              </p>
            ) : (
              filtradas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => irA(c.id)}
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
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-text-primary">
                    {conv.nombre ?? `+${conv.telefono}`}
                  </div>
                  <div className="text-xs text-text-tertiary">+{conv.telefono}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!puedeEscribir && (
                    <span className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                      <Clock className="h-3 w-3" />
                      Ventana de 24 h cerrada
                    </span>
                  )}
                  <button
                    onClick={() => setModal("plantilla")}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                      puedeEscribir
                        ? "border border-border bg-white text-text-secondary hover:bg-slate-50"
                        : "bg-primary text-white hover:bg-primary/90"
                    }`}
                  >
                    <LayoutTemplate className="h-3 w-3" /> Plantilla
                  </button>
                  {ficha && (
                    <button
                      onClick={alternarPanel}
                      className="hidden h-7 w-7 items-center justify-center rounded-lg border border-border bg-white text-text-secondary hover:bg-slate-50 cursor-pointer xl:flex"
                      aria-label={panel ? "Ocultar datos del contacto" : "Mostrar datos del contacto"}
                      title={panel ? "Ocultar datos del contacto" : "Mostrar datos del contacto"}
                    >
                      {panel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
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
                      {m.plantilla && (
                        <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/70">
                          <LayoutTemplate className="h-3 w-3" /> Plantilla · {m.plantilla}
                        </div>
                      )}
                      <Medio m={m} />
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
                {archivo && (
                  <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs text-text-secondary">
                    <Paperclip className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                    <span className="min-w-0 flex-1 truncate">{archivo.name}</span>
                    <span className="shrink-0 text-text-muted">{(archivo.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button
                      onClick={() => setArchivo(null)}
                      className="rounded p-0.5 text-text-muted hover:bg-slate-100 cursor-pointer"
                      aria-label="Quitar adjunto"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={archivoRef}
                    type="file"
                    className="hidden"
                    onChange={onElegirArchivo}
                    accept="image/jpeg,image/png,video/mp4,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                  />
                  <button
                    onClick={() => archivoRef.current?.click()}
                    disabled={!puedeEscribir || enviando}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-text-secondary hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
                    aria-label="Adjuntar archivo"
                    title="Adjuntar foto, audio o documento"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
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
                      !puedeEscribir
                        ? "Ventana de 24 h cerrada: envía una plantilla o espera a que el contacto escriba."
                        : archivo
                          ? "Texto que acompaña al archivo (opcional)…"
                          : "Escribe un mensaje… (Enter envía, Shift+Enter salto de línea)"
                    }
                    disabled={!puedeEscribir || enviando}
                    className="max-h-32 min-h-9 flex-1 resize-y rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary/30 disabled:bg-slate-50 disabled:text-text-muted"
                  />
                  <button
                    onClick={onEnviar}
                    disabled={!puedeEscribir || enviando || (!texto.trim() && !archivo)}
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

        {conv && ficha && panel && (
          <div className="hidden min-h-0 xl:block">
            <FichaContacto
              ficha={ficha}
              ventanaAbierta={puedeEscribir}
              ultimoEntranteAt={conv.ultimoEntranteAt}
              onCerrar={alternarPanel}
            />
          </div>
        )}
      </div>

      {modal === "plantilla" && conv && (
        <PlantillaModal
          conversacionId={conv.id}
          destinatario={conv.nombre ?? `+${conv.telefono}`}
          onCerrar={() => setModal(null)}
          onEnviado={irA}
        />
      )}
      {modal === "nuevo" && (
        <PlantillaModal onCerrar={() => setModal(null)} onEnviado={irA} />
      )}
    </div>
  );
}
