"use client";

/**
 * Chat de prueba de la selección: simula todo el flujo sin enviar WhatsApp ni
 * guardar nada. Para ahorrar llamadas a la IA, cada mensaje cuesta UNA
 * llamada (la respuesta) y el panel «qué pasaría en Gestivo» se calcula solo
 * cuando se pide (otra llamada). La simulación de silencio y el SIMIT
 * simulado no usan IA.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot, Clapperboard, FileText, FlaskConical, Image as ImageIcon, Loader2, Mic, Play, RefreshCw, RotateCcw, Search, Send, Smile, Timer, TriangleAlert,
} from "lucide-react";
import type { AgenteFormulario } from "@/lib/comunicaciones/agente/formulario";
import { CASOS, GRUPOS_CASOS, estimarLlamadas } from "@/lib/seleccion/evaluacion/casos";
import { prefiltroCompleto, faltantes } from "@/lib/seleccion/extraccion";
import { CAUSAS_PRESELECCION } from "@/lib/contratacion/constants";
import type { ChequeoCaso, MensajeSimulado } from "@/lib/seleccion/simulacion";
import {
  consultarCromaPrueba,
  correrCasoPrueba,
  panelPrueba,
  recalcularPanel,
  responderPrueba,
  simularSilencioPrueba,
  type PanelPrueba,
  type PasoSilencio,
} from "@/lib/seleccion/prueba-actions";
import { SemaforoDetalle } from "./semaforo";

type Motivo = "frase" | "marca" | "rechazo" | "vacio";
interface MensajeChat extends MensajeSimulado {
  id: number;
  meta?: string;
}

const MOTIVO: Record<Motivo, string> = {
  frase: "La persona pidió hablar con alguien (frase de transferencia).",
  marca: "El asistente decidió pasar la conversación.",
  rechazo: "El modelo se negó a responder.",
  vacio: "El modelo no devolvió texto.",
};

const MEDIOS: { tipo: "image" | "document" | "audio" | "sticker" | "video"; texto: string; icono: typeof ImageIcon }[] = [
  { tipo: "image", texto: "Foto", icono: ImageIcon },
  { tipo: "document", texto: "Documento", icono: FileText },
  { tipo: "audio", texto: "Audio", icono: Mic },
  { tipo: "sticker", texto: "Sticker", icono: Smile },
  { tipo: "video", texto: "Video", icono: Clapperboard },
];

const FRASES = [
  "Hola, vi el anuncio de conductor",
  "¿Cuánto pagan?",
  "¿Dónde quedan?",
  "ola tng licensia c2 k nomas piden",
  "Vivo en Cartagena pero me puedo trasladar",
  "Tengo licencia B1",
  "Ahorita no tengo la hoja de vida",
  "Ya trabajo con ustedes y no me han pagado",
  "Quiero hablar con una persona",
];

const SILENCIOS = [
  { horas: 24, texto: "24 h" },
  { horas: 96, texto: "4 días" },
  { horas: 120, texto: "5 días" },
  { horas: 24 * 8, texto: "8 días" },
];

const ACCION_SILENCIO: Record<PasoSilencio["accion"], string> = {
  aviso1: "Primer aviso de reactivación",
  aviso2: "Segundo aviso de reactivación",
  llamar: "Marca «Llamar»",
  incomunicado: "Cierre por «Incomunicado»",
};

const campo =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary/30 disabled:bg-slate-50";
const boton =
  "flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-1.5 text-xs text-text-secondary hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed";

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

export function ChatPrueba({ formulario, descripcion }: { formulario?: AgenteFormulario; descripcion?: string }) {
  const [chat, setChat] = useState<MensajeChat[]>([]);
  const [borrador, setBorrador] = useState(FRASES[0]);
  const [rafaga, setRafaga] = useState(false);
  const [probando, setProbando] = useState(false);
  const [transferencia, setTransferencia] = useState<{ turno: number; motivo: Motivo } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelPrueba | null>(null);
  const [panelViejo, setPanelViejo] = useState(false);
  const [cargandoPanel, setCargandoPanel] = useState(false);
  const [simit, setSimit] = useState("0");
  const [croma, setCroma] = useState<string | null>(null);
  const [hora, setHora] = useState("");
  const [silencio, setSilencio] = useState<{ horas: number; pasos: PasoSilencio[]; horario: string } | null>(null);
  const [casoId, setCasoId] = useState(CASOS[0].id);
  const [revision, setRevision] = useState<{ titulo: string; aprobado: boolean; chequeos: ChequeoCaso[] } | null>(null);
  const idRef = useRef(0);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chat.length, probando]);

  const simitNum = simit.trim() === "" ? null : Number(simit.replace(/\D/g, ""));
  const opciones = () => ({ formulario, simit: simitNum, ahora: hora ? new Date(hora).toISOString() : null });
  const caso = useMemo(() => CASOS.find((c) => c.id === casoId)!, [casoId]);
  const esperaRespuesta = chat.length > 0 && chat[chat.length - 1].direccion === "entrante";
  const nuevo = (m: MensajeSimulado & { meta?: string }): MensajeChat => ({ ...m, id: ++idRef.current });
  const sinId = (c: MensajeChat[]): MensajeSimulado[] => c.map(({ direccion, contenido, mediaTipo }) => ({ direccion, contenido, mediaTipo }));

  async function responder(conversacion: MensajeChat[]) {
    setProbando(true);
    setError(null);
    const r = await responderPrueba(sinId(conversacion), opciones()).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setProbando(false);
    if (!r.ok) return setError(r.error);
    const meta = r.modelo ? `${r.modelo} · ${(r.ms / 1000).toFixed(1)} s` : "Sin consultar al modelo";
    if (r.texto) setChat((c) => [...c, nuevo({ direccion: "saliente", contenido: r.texto, mediaTipo: null, meta })]);
    if (r.motivo) setTransferencia({ turno: conversacion.filter((m) => m.direccion === "entrante").length, motivo: r.motivo });
  }

  function enviar(media: MensajeChat["mediaTipo"] = null) {
    const contenido = borrador.trim();
    if ((!contenido && !media) || probando || transferencia) return;
    const conversacion = [...chat, nuevo({ direccion: "entrante", contenido, mediaTipo: media })];
    setChat(conversacion);
    setBorrador("");
    if (panel) setPanelViejo(true);
    setSilencio(null);
    if (!rafaga) void responder(conversacion);
  }

  function reiniciar() {
    setChat([]);
    setTransferencia(null);
    setError(null);
    setPanel(null);
    setPanelViejo(false);
    setCroma(null);
    setSilencio(null);
    setRevision(null);
    setBorrador(FRASES[0]);
  }

  async function verPanel() {
    setCargandoPanel(true);
    setError(null);
    const r = await panelPrueba(sinId(chat), { ...opciones(), transferencia }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setCargandoPanel(false);
    if (!r.ok) return setError(r.error);
    setPanel(r.panel);
    setPanelViejo(false);
  }

  async function aplicarSimit(valor: number | null) {
    if (!panel?.extraido) return;
    const p = await recalcularPanel(panel.extraido, { formulario, simit: valor, ahora: hora ? new Date(hora).toISOString() : null, transferencia }).catch(() => null);
    if (p) setPanel(p);
  }

  async function pedirCroma() {
    if (!panel?.extraido?.cedula) return;
    if (!confirm("Se hará una consulta REAL del SIMIT en Croma con la cédula de la conversación (no se guarda nada). ¿Continuar?")) return;
    setCroma("Consultando Croma…");
    const r = await consultarCromaPrueba(panel.extraido.cedula, panel.extraido.autorizacion === "si").catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (!r.ok) return setCroma(r.error);
    if (r.pendiente) return setCroma("Croma dejó la consulta en curso (tarda más de 15 s). En el flujo real el resultado llega solo; aquí vuelve a intentar en un momento.");
    if (r.valor == null) return setCroma(r.error ?? "Croma no devolvió el total.");
    setSimit(String(r.valor));
    setCroma(`Croma: ${pesos(r.valor)}${r.multas != null ? ` · ${r.multas} multas` : ""}${r.acuerdos ? ` · ${r.acuerdos} acuerdos de pago` : ""}.`);
    await aplicarSimit(r.valor);
  }

  async function pedirSilencio(horas: number) {
    setError(null);
    const r = await simularSilencioPrueba({ horas, ahora: hora ? new Date(hora).toISOString() : null, extraido: panel?.extraido ?? null }).catch(
      (e: Error) => ({ ok: false as const, error: e.message })
    );
    if (!r.ok) return setError(r.error);
    setSilencio({ horas, pasos: r.pasos, horario: r.horario });
  }

  async function reproducirCaso() {
    const n = estimarLlamadas(caso);
    if (!confirm(`«${caso.titulo}» cuesta unas ${n} llamadas a la IA. ¿Reproducirlo?`)) return;
    reiniciar();
    setProbando(true);
    const r = await correrCasoPrueba(caso.id, { formulario, simit: caso.simit ?? 0, ahora: hora ? new Date(hora).toISOString() : null }).catch(
      (e: Error) => ({ ok: false as const, error: e.message })
    );
    setProbando(false);
    if (!r.ok) return setError(r.error);
    setChat(r.resultado.mensajes.map((m) => nuevo(m)));
    if (r.resultado.transferencia) setTransferencia(r.resultado.transferencia);
    if (r.resultado.error) setError(r.resultado.error);
    setPanel(r.panel);
    setSimit(String(caso.simit ?? 0));
    setRevision({ titulo: caso.titulo, aprobado: r.aprobado, chequeos: r.chequeos });
  }

  const d = panel?.extraido ?? null;
  const g = panel?.gestivo ?? null;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-text-tertiary" />
          <h2 className="text-sm font-semibold text-text-primary">Chat de prueba</h2>
        </div>
        <button onClick={reiniciar} disabled={probando || chat.length === 0} className={boton}>
          <RotateCcw className="h-3.5 w-3.5" /> Reiniciar
        </button>
      </div>
      <p className="-mt-1 text-[11px] text-text-muted">
        {descripcion ??
          "Conversa como si fueras el aspirante. No se envía nada por WhatsApp ni se guarda. Cada mensaje usa una llamada a la IA; el panel «Qué pasaría en Gestivo» usa otra, solo cuando lo pides."}
      </p>

      {/* Casos del banco */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
        <span className="text-xs font-medium text-text-secondary">Caso listo:</span>
        <select value={casoId} onChange={(e) => setCasoId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-white px-2 py-1.5 text-xs">
          {GRUPOS_CASOS.map((gr) => (
            <optgroup key={gr.grupo} label={gr.titulo}>
              {CASOS.filter((c) => c.grupo === gr.grupo).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titulo} (~{estimarLlamadas(c)} llamadas)
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button onClick={reproducirCaso} disabled={probando} className={boton}>
          <Play className="h-3.5 w-3.5" /> Reproducir
        </button>
      </div>

      {revision && (
        <div className={`rounded-xl border px-3 py-2 text-xs ${revision.aprobado ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          <p className="font-semibold">
            {revision.aprobado ? "✔ Aprobado" : "✘ Falló"}: {revision.titulo}
          </p>
          <ul className="mt-1 space-y-0.5">
            {revision.chequeos.map((c, i) => (
              <li key={i} className={c.ok ? "opacity-70" : "font-medium"}>
                {c.ok ? "✔" : "✘"} {c.detalle}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conversación */}
      <div className="max-h-[480px] min-h-[160px] space-y-2 overflow-y-auto rounded-xl bg-[#EFEAE2] p-3">
        {chat.length === 0 && !probando && <p className="py-10 text-center text-xs text-slate-500">Escribe el primer mensaje del aspirante o reproduce un caso.</p>}
        {chat.map((m) => {
          const medio = m.mediaTipo ? MEDIOS.find((x) => x.tipo === m.mediaTipo) : null;
          const Icono = medio?.icono;
          const entrante = m.direccion === "entrante";
          return (
            <div key={m.id} className={`flex flex-col ${entrante ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm text-text-primary shadow-sm ${
                  entrante ? "rounded-br-md bg-[#D9FDD3]" : "rounded-bl-md bg-white"
                }`}
              >
                {medio && Icono && (
                  <span className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <Icono className="h-3.5 w-3.5" /> {medio.texto} (simulado)
                  </span>
                )}
                {m.contenido}
              </div>
              {m.meta && <span className="mt-0.5 px-1 text-[10px] text-slate-500">{m.meta}</span>}
            </div>
          );
        })}
        {probando && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> El asistente está escribiendo…
          </div>
        )}
        {transferencia && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span className="font-semibold">Aquí el chat pasaría a una persona</span> (mensaje {transferencia.turno} del aspirante). {MOTIVO[transferencia.motivo]}
          </div>
        )}
        <div ref={finRef} />
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-1.5">
        {FRASES.map((c) => (
          <button
            key={c}
            onClick={() => setBorrador(c)}
            disabled={!!transferencia}
            className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] text-text-secondary hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enviar()}
          disabled={!!transferencia}
          placeholder={transferencia ? "El chat pasó a una persona" : "Escribe como si fueras el aspirante…"}
          className={campo}
        />
        <button
          onClick={() => enviar()}
          disabled={probando || !!transferencia || !borrador.trim()}
          title="Enviar"
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {MEDIOS.map(({ tipo, texto, icono: Icono }) => (
          <button key={tipo} onClick={() => enviar(tipo)} disabled={probando || !!transferencia} title="Usa el texto escrito como pie del archivo" className={boton}>
            <Icono className="h-3.5 w-3.5" /> {texto}
          </button>
        ))}
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-text-tertiary" title="El asistente responde una sola vez a varios mensajes seguidos, como en WhatsApp">
          <input type="checkbox" checked={rafaga} onChange={(e) => setRafaga(e.target.checked)} className="accent-primary" />
          Varios mensajes seguidos
        </label>
        {esperaRespuesta && !probando && !transferencia && (
          <button onClick={() => void responder(chat)} className="flex items-center gap-1.5 rounded-xl border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 cursor-pointer">
            <Bot className="h-3.5 w-3.5" /> Que responda
          </button>
        )}
      </div>

      {/* Qué pasaría en Gestivo */}
      <div className="space-y-3 rounded-xl border border-border bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">Qué pasaría en Gestivo</h3>
          <button onClick={verPanel} disabled={cargandoPanel || probando || !chat.some((m) => m.direccion === "entrante")} className={boton}>
            {cargandoPanel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {panel ? "Actualizar" : "Calcular"} (1 llamada)
          </button>
        </div>
        {panelViejo && <p className="text-[11px] text-amber-700">La conversación cambió: actualiza el panel para verlo al día.</p>}
        {!panel ? (
          <p className="text-xs text-text-muted">Pulsa «Calcular» para ver los datos leídos, el semáforo, el proceso y la reactivación.</p>
        ) : (
          <>
            {d && (
              <div className="text-xs">
                <p className="mb-1 font-medium text-text-secondary">
                  Datos del prefiltro · {prefiltroCompleto(d) ? "completos" : `faltan: ${faltantes(d).join(", ")}`}
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                  {[
                    ["Nombre", d.nombre ?? "—"],
                    ["Cédula", d.cedula ?? "—"],
                    ["Edad", d.edad != null ? `${d.edad} años` : "—"],
                    ["Ciudad", d.ciudad ?? "—"],
                    ["Se traslada", d.dispuesto_traslado == null ? "—" : d.dispuesto_traslado ? "Sí" : "No"],
                    ["Licencia", d.licencia ?? "—"],
                    ["Experiencia", d.experiencia_meses != null ? `${d.experiencia_meses} meses` : "—"],
                    ["Hoja de vida", d.hoja_vida ? "Recibida" : "—"],
                    ["Autorización", d.autorizacion === "si" ? "Aceptó" : d.autorizacion === "no" ? "No aceptó" : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex gap-1.5">
                      <dt className="text-text-tertiary">{k}:</dt>
                      <dd className="text-text-secondary">{v}</dd>
                    </div>
                  ))}
                </dl>
                {!d.busca_trabajo && <p className="mt-1 text-amber-700">Parece que no busca trabajo: no se crearía proceso.</p>}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-text-secondary">Semáforo de preselección</p>
                {panel.preseleccion && <SemaforoDetalle resultado={panel.preseleccion} />}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <label className="flex items-center gap-1.5 text-text-tertiary">
                    SIMIT simulado
                    <input
                      value={simit}
                      onChange={(e) => setSimit(e.target.value)}
                      onBlur={() => aplicarSimit(simitNum)}
                      inputMode="numeric"
                      className="w-28 rounded-lg border border-border px-2 py-1 text-xs"
                      placeholder="sin consultar"
                    />
                  </label>
                  <button onClick={pedirCroma} disabled={!d?.cedula || d?.autorizacion !== "si"} className={boton} title="Consulta real en Croma (necesita cédula y autorización en el chat)">
                    <Search className="h-3.5 w-3.5" /> Consultar Croma de verdad
                  </button>
                </div>
                {croma && <p className="mt-1 text-[11px] text-text-secondary">{croma}</p>}
              </div>

              {g && (
                <div className="text-xs">
                  <p className="mb-1 font-medium text-text-secondary">Proceso</p>
                  <p className="text-text-secondary">{g.explicacion}</p>
                  {g.estado && <p className="mt-1">Quedaría en: <strong>{g.estado === "antecedentes" ? "Antecedentes" : "Preselección"}</strong></p>}
                  {g.cierrePropuesto && (
                    <p className="mt-1 flex items-center gap-1 text-red-700">
                      <TriangleAlert className="h-3.5 w-3.5" /> Se propone cerrar: {CAUSAS_PRESELECCION[g.cierrePropuesto as keyof typeof CAUSAS_PRESELECCION] ?? g.cierrePropuesto}
                    </p>
                  )}
                  {g.listoParaCitar && <p className="mt-1 font-medium text-emerald-700">El chat quedaría «Listo para citar» para Gestión Humana.</p>}
                  {g.consultariaSimit && <p className="mt-1 text-text-tertiary">Se consultaría el SIMIT en Croma.</p>}
                  {g.eventos.length > 0 && (
                    <>
                      <p className="mt-2 font-medium text-text-secondary">Historial que quedaría</p>
                      <ul className="list-disc pl-4 text-text-secondary">
                        {g.eventos.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {panel.anteriores.length > 0 && (
                    <p className="mt-2 text-text-tertiary">
                      Esa cédula ya postuló {panel.anteriores.length} {panel.anteriores.length === 1 ? "vez" : "veces"} (último: {panel.anteriores[0].estado}
                      {panel.anteriores[0].causa ? `, ${panel.anteriores[0].causa}` : ""}).
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Silencio y hora simulada */}
      <div className="space-y-2 rounded-xl border border-border bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <Timer className="h-4 w-4" /> Si deja de responder
          </h3>
          <span className="text-[11px] text-text-muted">Sin IA: aplica las reglas de reactivación con los tiempos configurados.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SILENCIOS.map((s) => (
            <button key={s.horas} onClick={() => pedirSilencio(s.horas)} className={boton}>
              {s.texto}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-text-tertiary">
            Fecha y hora simuladas
            <input type="datetime-local" value={hora} onChange={(e) => setHora(e.target.value)} className="rounded-lg border border-border px-2 py-1 text-xs" />
          </label>
        </div>
        {silencio && (
          <div className="text-xs">
            <p className="text-text-tertiary">
              Tras {silencio.horas} h sin respuesta (horario permitido {silencio.horario}){silencio.pasos.length === 0 ? ": no pasaría nada todavía." : ":"}
            </p>
            <ol className="mt-1 space-y-1.5">
              {silencio.pasos.map((p, i) => (
                <li key={i} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                  <p className="font-medium text-text-secondary">
                    A las {p.horas} h · {ACCION_SILENCIO[p.accion]}
                    {p.plantilla ? ` · plantilla ${p.plantilla} (${p.estadoPlantilla ?? "sin revisar"})` : ""}
                  </p>
                  <p className="text-text-tertiary">{p.nota}</p>
                  {p.texto && <p className="mt-0.5 whitespace-pre-wrap text-text-primary">«{p.texto}»</p>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
