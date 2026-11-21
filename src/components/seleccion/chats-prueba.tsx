"use client";

/**
 * Varios chats de prueba a la vez, con la misma forma que la bandeja de
 * Comunicaciones: la lista de conversaciones a la izquierda y el chat abierto a
 * la derecha. Cada chat se abre con «Nuevo chat», que pregunta cómo se comporta
 * Gestivo (Croma de verdad o simulado, con qué escenario, y si se guarda en
 * Candidatos). Los chats viven mientras la página esté abierta; los candidatos
 * guardados quedan en Candidatos.
 */
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Bot, FlaskConical, Loader2, MessageCirclePlus, Plus, X } from "lucide-react";
import type { AgenteFormulario } from "@/lib/comunicaciones/agente/formulario";
import { estadoInfo } from "@/lib/contratacion/constants";
import {
  ESCENARIOS,
  ESCENARIO_BASE,
  FUENTES_SIMULADAS,
  RESPUESTAS_FUENTE,
  RESPUESTAS_RUNT,
  mismoEscenario,
  resumenEscenario,
  type EscenarioCroma,
  type RespuestaFuente,
  type RespuestaRunt,
} from "@/lib/seleccion/escenario-croma";
import { ChatPrueba, type ConfigChatPrueba, type ResumenChatPrueba } from "./chat-prueba";

interface ChatAbierto {
  id: number;
  numero: number;
  config: ConfigChatPrueba;
  resumen: ResumenChatPrueba | null;
}

const TONOS = [
  { bg: "#EEF2FF", fg: "#4338CA" },
  { bg: "#ECFDF5", fg: "#047857" },
  { bg: "#FFF7ED", fg: "#C2410C" },
  { bg: "#F5F3FF", fg: "#6D28D9" },
  { bg: "#F0F9FF", fg: "#0369A1" },
  { bg: "#FDF2F8", fg: "#BE185D" },
];

function iniciales(nombre: string | null, numero: number): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length || nombre === "POR CONFIRMAR") return `A${numero}`;
  return (partes[0][0] + (partes[1]?.[0] ?? "")).toUpperCase();
}

const hora = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }) : "");

export function ChatsPrueba({
  formulario,
  descripcion,
  profesor,
}: {
  formulario?: AgenteFormulario;
  descripcion?: string;
  /** Pantalla del profesor de prueba: va en el panel lateral del chat abierto. */
  profesor?: ReactNode;
}) {
  const [chats, setChats] = useState<ChatAbierto[]>([]);
  const [activo, setActivo] = useState<number | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [siguiente, setSiguiente] = useState(1);
  const [refAlto, altoPx] = useAltoDisponible();

  const abrir = (config: ConfigChatPrueba) => {
    const id = Date.now();
    setChats((c) => [{ id, numero: siguiente, config, resumen: null }, ...c]);
    setSiguiente((n) => n + 1);
    setActivo(id);
    setNuevo(false);
  };
  const cerrar = (id: number) => {
    const c = chats.find((x) => x.id === id);
    if (c?.resumen?.ultimo && !confirm("Se cierra este chat de prueba y se pierde la conversación (el candidato guardado sigue en Candidatos). ¿Cerrarlo?")) return;
    const resto = chats.filter((x) => x.id !== id);
    setChats(resto);
    if (activo === id) setActivo(resto[0]?.id ?? null);
  };
  const alResumen = useCallback((id: number, r: ResumenChatPrueba) => {
    setChats((c) => c.map((x) => (x.id === id ? { ...x, resumen: r } : x)));
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-muted">
        {descripcion ??
          "Conversa como si fueras el aspirante. No se envía nada por WhatsApp. Cada mensaje usa dos llamadas a la IA: la respuesta y la lectura de los datos."}
      </p>
      <div ref={refAlto} style={altoPx ? { height: altoPx } : undefined} className="grid gap-3 lg:grid-cols-[270px_minmax(0,1fr)]">
        {/* Lista de chats, como la bandeja de Comunicaciones */}
        <div className={`min-h-0 flex-col rounded-2xl border border-border bg-surface-raised lg:flex lg:h-[640px] xl:h-full ${activo ? "hidden" : "flex"}`}>
          <div className="flex items-center justify-between gap-2 border-b border-border p-3">
            <span className="flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-text-primary">
              <FlaskConical className="h-4 w-4 text-text-tertiary" /> Chats de prueba
            </span>
            <button
              type="button"
              onClick={() => setNuevo(true)}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo chat
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {chats.length === 0 ? (
              <div className="flex flex-col items-center gap-3 p-6 text-center">
                <p className="text-xs text-text-tertiary">Todavía no hay chats. Abre uno para conversar como un aspirante.</p>
                <button
                  type="button"
                  onClick={() => setNuevo(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 cursor-pointer"
                >
                  <MessageCirclePlus className="h-4 w-4" /> Abrir un chat
                </button>
              </div>
            ) : (
              chats.map((c) => {
                const r = c.resumen;
                const nombre = r?.nombre && r.nombre !== "POR CONFIRMAR" ? r.nombre : `Aspirante ${c.numero}`;
                const tono = TONOS[(c.numero - 1) % TONOS.length];
                const seleccionado = c.id === activo;
                const est = r?.estado ? estadoInfo(r.estado) : null;
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActivo(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActivo(c.id);
                      }
                    }}
                    aria-current={seleccionado ? "true" : undefined}
                    className={`group relative flex w-full cursor-pointer items-center gap-3 border-b border-border/60 py-2.5 pl-3 pr-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 ${
                      seleccionado ? "bg-primary/5" : "hover:bg-slate-50"
                    }`}
                  >
                    <span aria-hidden className={`absolute inset-y-0 left-0 w-0.5 ${seleccionado ? "bg-primary" : "bg-transparent"}`} />
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ background: tono.bg, color: tono.fg }}>
                      {iniciales(r?.nombre ?? null, c.numero)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-text-primary">{nombre}</span>
                          {r?.guardado && (
                            <span className="shrink-0 rounded-full bg-violet-50 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-violet-700" title="Guardado en Candidatos">
                              Candidato
                            </span>
                          )}
                          {r?.transferido ? (
                            <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-700">Humano</span>
                          ) : (
                            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-sky-50 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-sky-700">
                              <Bot className="h-2.5 w-2.5" /> IA
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-text-muted">{hora(r?.ultimoAt ?? null)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-text-tertiary">
                          {r?.probando ? (
                            <span className="flex items-center gap-1 text-emerald-700">
                              <Loader2 className="h-3 w-3 animate-spin" /> escribiendo…
                            </span>
                          ) : (
                            r?.ultimo || "Sin mensajes"
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            cerrar(c.id);
                          }}
                          className={`h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted hover:bg-slate-200 hover:text-text-primary cursor-pointer ${
                            seleccionado ? "flex" : "hidden group-hover:flex"
                          }`}
                          aria-label="Cerrar este chat"
                          title="Cerrar este chat"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span
                          className={`truncate rounded px-1.5 py-px text-[10px] font-medium ${c.config.cromaReal ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-text-tertiary"}`}
                          title={c.config.cromaReal ? "Consulta Croma de verdad" : `Croma simulado: ${resumenEscenario(c.config.escenario)}`}
                        >
                          {c.config.cromaReal ? "Croma real" : `Simulado · ${resumenEscenario(c.config.escenario)}`}
                        </span>
                        {est && (
                          <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-medium" style={{ backgroundColor: est.bg, color: est.color }}>
                            {est.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Chat abierto. Los demás siguen montados (ocultos) para no perder su conversación. */}
        <div className={`min-h-0 min-w-0 xl:h-full ${activo ? "" : "hidden lg:block"}`}>
          {chats.length === 0 && (
            <div className="flex h-[640px] flex-col items-center justify-center rounded-2xl border border-border bg-surface-raised p-8 text-center xl:h-full">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <MessageCirclePlus className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-text-primary">Abre un chat de prueba</p>
              <p className="mt-1 max-w-xs text-xs text-text-tertiary">
                Elige si Croma se consulta de verdad o se simula (y con qué resultado), y si el aspirante queda guardado en Candidatos.
              </p>
              <button
                type="button"
                onClick={() => setNuevo(true)}
                className="mt-4 flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 cursor-pointer"
              >
                <Plus className="h-4 w-4" /> Nuevo chat
              </button>
            </div>
          )}
          {chats.map((c) => (
            <div key={c.id} className={c.id === activo ? "xl:h-full" : "hidden"}>
              <ChatPrueba
                formulario={formulario}
                config={c.config}
                numero={c.numero}
                activo={c.id === activo}
                onVolver={() => setActivo(null)}
                onResumen={(r) => alResumen(c.id, r)}
                profesor={c.id === activo ? profesor : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      {nuevo && <NuevoChatDialog onClose={() => setNuevo(false)} onAbrir={abrir} />}
    </div>
  );
}

/** Lo que queda de pantalla hasta abajo (en pantallas anchas): la caja de texto siempre se ve sin desplazar. */
const RESERVA_ABAJO = 64; // margen inferior de la página y la franja de «DESARROLLO»
function useAltoDisponible() {
  const ref = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // El contenido del tablero se desplaza dentro de <main>, no en la ventana.
    const contenedor = (el.closest("main") as HTMLElement | null) ?? document.documentElement;
    const ancho = window.matchMedia("(min-width: 1280px)");
    const medir = () => {
      if (!ancho.matches) return setPx(null);
      const arriba = el.getBoundingClientRect().top - contenedor.getBoundingClientRect().top + contenedor.scrollTop;
      setPx(Math.max(520, Math.floor(contenedor.clientHeight - arriba - RESERVA_ABAJO)));
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(contenedor);
    // Lo de arriba (avisos, pestañas) también puede cambiar de alto.
    if (contenedor.firstElementChild) obs.observe(contenedor.firstElementChild);
    ancho.addEventListener("change", medir);
    return () => {
      obs.disconnect();
      ancho.removeEventListener("change", medir);
    };
  }, []);
  return [ref, px] as const;
}

function NuevoChatDialog({ onClose, onAbrir }: { onClose: () => void; onAbrir: (c: ConfigChatPrueba) => void }) {
  const [cromaReal, setCromaReal] = useState(false);
  const [guardar, setGuardar] = useState(true);
  const [escenario, setEscenario] = useState<EscenarioCroma>(ESCENARIO_BASE);
  const [detalle, setDetalle] = useState(false);
  const listo = ESCENARIOS.find((e) => mismoEscenario(e.escenario, escenario));
  const selector = "w-full rounded-lg border border-border bg-white px-2 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo chat de prueba"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <MessageCirclePlus className="h-5 w-5 text-primary" /> Nuevo chat de prueba
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
            <input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>
              <span className="block text-sm font-medium text-gray-900">Guardar en Candidatos</span>
              <span className="block text-xs text-gray-500">
                Como en WhatsApp: apenas dé la cédula y acepte la autorización, queda como candidato (marcado «Chat de prueba») y sigue el flujo real: preselección,
                antecedentes, cita y profesor. Nunca toca un proceso real abierto con esa cédula.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
            <input type="checkbox" checked={cromaReal} onChange={(e) => setCromaReal(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>
              <span className="block text-sm font-medium text-gray-900">Consultar Croma de verdad</span>
              <span className="block text-xs text-gray-500">
                Consulta el RUNT, el SIMIT y los antecedentes reales de la cédula que escribas (cuesta consultas). Úsalo solo con cédulas autorizadas.
              </span>
            </span>
          </label>

          {!cromaReal && (
            <div className="space-y-3 rounded-xl bg-slate-50 p-3">
              <div>
                <p className="text-sm font-medium text-gray-900">¿Qué responde Croma? (simulado)</p>
                <p className="text-xs text-gray-500">
                  {guardar ? "Queda en el candidato como «Simulado» y no gasta consultas." : "Sin guardar en Candidatos, Croma no se simula: solo se conversa con el asistente."}
                </p>
              </div>
              <select
                value={listo?.id ?? "personalizado"}
                disabled={!guardar}
                onChange={(e) => {
                  const x = ESCENARIOS.find((s) => s.id === e.target.value);
                  if (x) setEscenario(x.escenario);
                }}
                className={selector}
              >
                {ESCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.titulo}
                  </option>
                ))}
                {!listo && <option value="personalizado">Personalizado: {resumenEscenario(escenario)}</option>}
              </select>
              <button type="button" disabled={!guardar} onClick={() => setDetalle((v) => !v)} className="text-xs font-medium text-primary hover:underline disabled:opacity-40">
                {detalle ? "Ocultar el detalle por fuente" : "Elegir la respuesta de cada fuente"}
              </button>
              {detalle && guardar && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-gray-600">
                    RUNT (licencia)
                    <select value={escenario.runt} onChange={(e) => setEscenario({ ...escenario, runt: e.target.value as RespuestaRunt })} className={selector}>
                      {RESPUESTAS_RUNT.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.texto}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-gray-600">
                    SIMIT (multas)
                    <div className="flex gap-1">
                      <select
                        value={escenario.simit === "error" ? "error" : escenario.simit > 0 ? "deuda" : "cero"}
                        onChange={(e) =>
                          setEscenario({ ...escenario, simit: e.target.value === "error" ? "error" : e.target.value === "deuda" ? 1_250_000 : 0 })
                        }
                        className={selector}
                      >
                        <option value="cero">Sin multas</option>
                        <option value="deuda">Con multas</option>
                        <option value="error">Croma no responde</option>
                      </select>
                      {typeof escenario.simit === "number" && escenario.simit > 0 && (
                        <input
                          inputMode="numeric"
                          value={escenario.simit}
                          onChange={(e) => setEscenario({ ...escenario, simit: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                          className="w-28 rounded-lg border border-border bg-white px-2 py-1.5 text-sm"
                          aria-label="Valor de las multas"
                        />
                      )}
                    </div>
                  </label>
                  {FUENTES_SIMULADAS.map((f) => (
                    <label key={f.id} className="text-xs text-gray-600">
                      {f.texto}
                      <select value={escenario[f.id]} onChange={(e) => setEscenario({ ...escenario, [f.id]: e.target.value as RespuestaFuente })} className={selector}>
                        {RESPUESTAS_FUENTE.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.texto}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <p className="text-[11px] text-gray-500 sm:col-span-2">
                    Los antecedentes se simulan cuando pasa la preselección, como en el flujo real. Con «Croma no responde», lo que pase depende de si esa fuente es
                    obligatoria (Candidatos › Selección › Reglas).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (cromaReal && !confirm("Este chat consultará Croma de verdad (cuesta consultas). Úsalo solo con cédulas autorizadas. ¿Continuar?")) return;
              onAbrir({ cromaReal, guardar, escenario });
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Abrir chat
          </button>
        </div>
      </div>
    </div>
  );
}
