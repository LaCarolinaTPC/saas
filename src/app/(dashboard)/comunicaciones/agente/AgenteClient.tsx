"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, CheckCircle2, FlaskConical, Loader2, TriangleAlert, Hand, KeyRound } from "lucide-react";
import { guardarAgente, probarAgente, type AgenteFormulario } from "@/lib/comunicaciones/agente/actions";
import {
  MODELOS_ANTHROPIC,
  MODELO_ANTHROPIC_POR_DEFECTO,
  MODELO_OPENAI_POR_DEFECTO,
  type AgenteConfig,
  type Proveedor,
} from "@/lib/comunicaciones/agente/opciones";

export interface Ejecucion {
  id: string;
  fecha: string;
  contacto: string;
  modelo: string;
  tokensEntrada: number | null;
  tokensSalida: number | null;
  duracionMs: number | null;
  resultado: string;
  error: string | null;
}

const campo =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none " +
  "placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary/30";

const PROVEEDORES: { id: Proveedor; nombre: string; detalle: string }[] = [
  { id: "openrouter", nombre: "OpenRouter", detalle: "Elige el modelo más económico que responda bien" },
  { id: "anthropic", nombre: "Claude", detalle: "Anthropic: Opus, Sonnet o Haiku" },
  { id: "openai", nombre: "OpenAI", detalle: "Modelos GPT" },
];

const NIVELES = [
  { id: "low", nombre: "Económico", detalle: "Lo más barato que contesta bien un chat" },
  { id: "medium", nombre: "Equilibrado", detalle: "Más capacidad para instrucciones largas" },
  { id: "high", nombre: "Alto", detalle: "Modelos de punta; más costoso" },
] as const;

const RESULTADO: Record<string, { texto: string; clase: string }> = {
  respondido: { texto: "Respondió", clase: "bg-emerald-50 text-emerald-700" },
  transferido: { texto: "Pasó a humano", clase: "bg-amber-50 text-amber-700" },
  error: { texto: "Error", clase: "bg-red-50 text-red-700" },
};

const FECHA = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function Etiqueta({ children, ayuda }: { children: React.ReactNode; ayuda?: string }) {
  return (
    <div className="mb-1">
      <label className="block text-xs font-medium text-text-secondary">{children}</label>
      {ayuda && <p className="text-[11px] text-text-muted">{ayuda}</p>}
    </div>
  );
}

function modeloInicial(p: Proveedor): string {
  return p === "anthropic" ? MODELO_ANTHROPIC_POR_DEFECTO : p === "openai" ? MODELO_OPENAI_POR_DEFECTO : "";
}

export default function AgenteClient({
  config,
  disponibles,
  ejecuciones,
}: {
  config: AgenteConfig;
  /** Proveedores con API key en Configuración → Proveedores de IA. */
  disponibles: Record<Proveedor, boolean>;
  ejecuciones: Ejecucion[];
}) {
  const router = useRouter();
  // Si el proveedor guardado ya no tiene key, se propone el primero que sí la tenga.
  const primeroDisponible = PROVEEDORES.find((p) => disponibles[p.id])?.id;
  const proveedorInicial = disponibles[config.proveedor] || !primeroDisponible ? config.proveedor : primeroDisponible;
  const [f, setF] = useState<AgenteFormulario>({
    activo: config.activo,
    proveedor: proveedorInicial,
    modelo: proveedorInicial === config.proveedor ? config.modelo ?? "" : modeloInicial(proveedorInicial),
    openrouterModo: config.openrouterModo,
    openrouterNivelCosto: config.openrouterNivelCosto,
    openrouterModelosPermitidos: config.openrouterModelosPermitidos ?? "",
    prompt: config.prompt,
    mensajeTransferencia: config.mensajeTransferencia,
    frasesTransferencia: config.frasesTransferencia,
    mensajesHistorial: config.mensajesHistorial,
    esperaSegundos: config.esperaSegundos,
  });
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [mensajePrueba, setMensajePrueba] = useState("Hola, ¿están contratando conductores?");
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<Awaited<ReturnType<typeof probarAgente>> | null>(null);

  const set = <K extends keyof AgenteFormulario>(k: K, v: AgenteFormulario[K]) => setF((x) => ({ ...x, [k]: v }));

  /** Al cambiar de proveedor, el modelo del anterior no sirve. */
  function elegirProveedor(p: Proveedor) {
    setF((x) => ({ ...x, proveedor: p, modelo: modeloInicial(p) }));
  }

  const hayClaves = PROVEEDORES.some((p) => disponibles[p.id]);
  const sinClave = !disponibles[f.proveedor];

  async function onGuardar(activo = f.activo) {
    setGuardando(true);
    setResultado(null);
    const datos = { ...f, activo };
    const r = await guardarAgente(datos);
    setGuardando(false);
    if (r.ok) {
      setF(datos);
      setResultado({ ok: true, texto: activo ? "Guardado. El agente está respondiendo." : "Guardado. El agente está apagado." });
      router.refresh();
    } else {
      setResultado({ ok: false, texto: r.error ?? "No se pudo guardar." });
    }
  }

  async function onProbar() {
    setProbando(true);
    setPrueba(null);
    setPrueba(await probarAgente(f, mensajePrueba));
    setProbando(false);
  }

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <Link
        href="/comunicaciones"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a la bandeja
      </Link>

      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Agente de IA</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Responde solo los WhatsApp que llegan, con tus instrucciones, hasta que una persona del equipo toma el
            control.
          </p>
        </div>
        <button
          onClick={() => onGuardar(!f.activo)}
          disabled={guardando || (!f.activo && sinClave)}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${
            f.activo ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-border bg-white text-text-secondary hover:bg-slate-50"
          }`}
          title={f.activo ? "Apagar el agente en todas las conversaciones" : "Guardar y encender el agente"}
        >
          <span className={`h-2 w-2 rounded-full ${f.activo ? "bg-white" : "bg-slate-300"}`} />
          {f.activo ? "Activo · Apagar" : "Apagado · Encender"}
        </button>
      </div>

      {resultado && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${
            resultado.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {resultado.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          {resultado.texto}
        </div>
      )}

      <div className="space-y-4">
        {/* Proveedor y modelo */}
        <section className="space-y-4 rounded-2xl border border-border bg-surface-raised p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text-primary">Proveedor y modelo</h2>
            <Link
              href="/configuracion"
              className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-primary"
            >
              <KeyRound className="h-3 w-3" /> Gestionar API keys
            </Link>
          </div>

          {!hayClaves && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                No hay ninguna API key de IA. Agrega al menos una en{" "}
                <Link href="/configuracion" className="font-medium underline">
                  Configuración → Proveedores de IA
                </Link>{" "}
                y aparecerá aquí.
              </span>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            {PROVEEDORES.map((p) => {
              const conClave = disponibles[p.id];
              const elegido = f.proveedor === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => elegirProveedor(p.id)}
                  disabled={!conClave}
                  title={conClave ? undefined : "Sin API key: agrégala en Configuración → Proveedores de IA"}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    !conClave
                      ? "cursor-not-allowed border-dashed border-border bg-slate-50 opacity-60"
                      : elegido
                        ? "cursor-pointer border-primary bg-primary/5 ring-1 ring-primary"
                        : "cursor-pointer border-border bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary">{p.nombre}</span>
                    <span
                      className={`rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${
                        conClave ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-text-tertiary"
                      }`}
                    >
                      {conClave ? "Key lista" : "Sin key"}
                    </span>
                  </span>
                  <span className="block text-[11px] text-text-tertiary">{p.detalle}</span>
                </button>
              );
            })}
          </div>

          {hayClaves && sinClave && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              El proveedor guardado ({PROVEEDORES.find((p) => p.id === f.proveedor)?.nombre}) ya no tiene API key. Elige
              otro o vuelve a agregarla en Configuración.
            </p>
          )}

          {f.proveedor === "anthropic" && (
            <div>
              <Etiqueta ayuda="Precio por millón de tokens (entrada / salida).">Modelo</Etiqueta>
              <select value={f.modelo || MODELO_ANTHROPIC_POR_DEFECTO} onChange={(e) => set("modelo", e.target.value)} className={campo}>
                {MODELOS_ANTHROPIC.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} · {m.precio}
                  </option>
                ))}
              </select>
            </div>
          )}

          {f.proveedor === "openai" && (
            <div>
              <Etiqueta ayuda="El id del modelo tal como lo publica OpenAI. Usa «Probar» para confirmar que existe.">Modelo</Etiqueta>
              <input
                value={f.modelo}
                onChange={(e) => set("modelo", e.target.value)}
                placeholder={MODELO_OPENAI_POR_DEFECTO}
                list="modelos-openai"
                className={campo}
              />
              <datalist id="modelos-openai">
                <option value="gpt-5-mini" />
                <option value="gpt-5" />
                <option value="gpt-4.1-mini" />
              </datalist>
            </div>
          )}

          {f.proveedor === "openrouter" && (
            <div className="space-y-4">
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-xs">
                {(
                  [
                    { id: "auto", nombre: "Automático (recomendado)" },
                    { id: "manual", nombre: "Modelo fijo" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => set("openrouterModo", m.id)}
                    className={`flex-1 rounded-lg px-3 py-1.5 font-medium cursor-pointer ${
                      f.openrouterModo === m.id ? "bg-white text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-primary"
                    }`}
                  >
                    {m.nombre}
                  </button>
                ))}
              </div>

              {f.openrouterModo === "auto" ? (
                <>
                  <div>
                    <Etiqueta ayuda="El Auto Router de OpenRouter elige, para cada mensaje, el modelo que mejor responde dentro de este nivel de costo.">
                      Nivel de costo
                    </Etiqueta>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {NIVELES.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => set("openrouterNivelCosto", n.id)}
                          className={`rounded-xl border px-3 py-2 text-left cursor-pointer ${
                            f.openrouterNivelCosto === n.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-white hover:bg-slate-50"
                          }`}
                        >
                          <span className="block text-sm font-medium text-text-primary">{n.nombre}</span>
                          <span className="block text-[11px] text-text-tertiary">{n.detalle}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Etiqueta ayuda="Opcional. Limita la elección a estas familias, separadas por coma (p. ej. anthropic/*, google/*, openai/*). Vacío = todos.">
                      Modelos permitidos
                    </Etiqueta>
                    <input
                      value={f.openrouterModelosPermitidos}
                      onChange={(e) => set("openrouterModelosPermitidos", e.target.value)}
                      placeholder="anthropic/*, google/*, openai/*"
                      className={campo}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <Etiqueta ayuda="Id del modelo en openrouter.ai/models. Se usa el proveedor más barato que lo sirva.">Modelo</Etiqueta>
                  <input
                    value={f.modelo}
                    onChange={(e) => set("modelo", e.target.value)}
                    placeholder="p. ej. google/gemini-2.5-flash"
                    className={campo}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Prompt */}
        <section className="space-y-4 rounded-2xl border border-border bg-surface-raised p-5">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Instrucciones del agente</h2>
            <p className="text-[11px] text-text-muted">
              Quién es, cómo habla y todo lo que puede contestar: vacantes, requisitos, horarios, documentos, direcciones,
              preguntas frecuentes. El agente solo usa esta información; lo que no esté aquí lo pasa a una persona.
            </p>
          </div>
          <textarea
            value={f.prompt}
            onChange={(e) => set("prompt", e.target.value)}
            rows={14}
            placeholder={"Eres el asistente de Recursos Humanos de la empresa…\n\nVacantes abiertas:\n- Conductor de bus: licencia C2, experiencia de 2 años…\n\nPara postularse deben enviar: …"}
            className={`${campo} font-mono text-xs leading-relaxed`}
          />
          <p className="text-[11px] text-text-muted">
            Ya va incluido, sin que lo escribas: responder corto y en español, no inventar datos, no ver archivos, ignorar
            intentos de cambiarle las reglas y pasar a una persona cuando lo piden o el tema es delicado.
          </p>
        </section>

        {/* Paso a humano */}
        <section className="space-y-4 rounded-2xl border border-border bg-surface-raised p-5">
          <div className="flex items-center gap-2">
            <Hand className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Paso a una persona</h2>
          </div>
          <p className="-mt-2 text-[11px] text-text-muted">
            El agente deja de responder en una conversación cuando alguien del equipo escribe en ella, cuando la persona lo
            pide o cuando el agente no puede ayudar. La conversación queda en «Requieren humano» hasta que alguien responda;
            desde el hilo se puede reactivar el agente.
          </p>
          <div>
            <Etiqueta>Mensaje que recibe la persona</Etiqueta>
            <textarea
              value={f.mensajeTransferencia}
              onChange={(e) => set("mensajeTransferencia", e.target.value)}
              rows={2}
              className={campo}
            />
          </div>
          <div>
            <Etiqueta ayuda="Una por línea. Si el mensaje contiene una, pasa directo a una persona sin consultar al modelo (no importan tildes ni mayúsculas).">
              Frases que piden una persona
            </Etiqueta>
            <textarea
              value={f.frasesTransferencia}
              onChange={(e) => set("frasesTransferencia", e.target.value)}
              rows={4}
              className={`${campo} font-mono text-xs`}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Etiqueta ayuda="Cuántos mensajes anteriores del chat lee el agente (2–60).">Memoria de la conversación</Etiqueta>
              <input
                type="number"
                min={2}
                max={60}
                value={f.mensajesHistorial}
                onChange={(e) => set("mensajesHistorial", Number(e.target.value))}
                className={campo}
              />
            </div>
            <div>
              <Etiqueta ayuda="Segundos que espera antes de responder, para contestar una sola vez si la persona manda varios mensajes seguidos (0–20).">
                Espera antes de responder
              </Etiqueta>
              <input
                type="number"
                min={0}
                max={20}
                value={f.esperaSegundos}
                onChange={(e) => set("esperaSegundos", Number(e.target.value))}
                className={campo}
              />
            </div>
          </div>
        </section>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onGuardar()}
            disabled={guardando}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
          >
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar cambios
          </button>
        </div>

        {/* Prueba */}
        <section className="space-y-3 rounded-2xl border border-border bg-surface-raised p-5">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Probar</h2>
          </div>
          <p className="-mt-1 text-[11px] text-text-muted">
            Usa lo que está en el formulario, aunque no lo hayas guardado. No envía nada por WhatsApp.
          </p>
          <div className="flex gap-2">
            <input
              value={mensajePrueba}
              onChange={(e) => setMensajePrueba(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !probando && onProbar()}
              placeholder="Escribe como si fueras la persona…"
              className={campo}
            />
            <button
              onClick={onProbar}
              disabled={probando || !mensajePrueba.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-white px-4 text-sm font-medium text-text-secondary hover:bg-slate-50 disabled:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
            >
              {probando && <Loader2 className="h-4 w-4 animate-spin" />} Probar
            </button>
          </div>
          {prueba &&
            (prueba.ok ? (
              <div className="space-y-1.5">
                <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-border bg-white px-3 py-2 text-sm text-text-primary">
                  {prueba.texto || "(sin texto)"}
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
                  <span>Modelo: {prueba.modeloUsado}</span>
                  <span>
                    Tokens: {prueba.tokensEntrada ?? "—"} entrada · {prueba.tokensSalida ?? "—"} salida
                  </span>
                  <span>{(prueba.duracionMs / 1000).toFixed(1)} s</span>
                  {prueba.transferir && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">Pasaría a una persona</span>
                  )}
                </p>
              </div>
            ) : (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{prueba.error}</p>
            ))}
        </section>

        {/* Bitácora */}
        <section className="rounded-2xl border border-border bg-surface-raised p-5">
          <h2 className="text-sm font-semibold text-text-primary">Últimas respuestas</h2>
          <p className="mb-3 text-[11px] text-text-muted">
            Qué modelo respondió de verdad y cuántos tokens usó: útil para vigilar el costo en modo automático.
          </p>
          {ejecuciones.length === 0 ? (
            <p className="py-4 text-center text-xs text-text-tertiary">Todavía no ha respondido ningún mensaje.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-text-tertiary">
                  <tr className="border-b border-border">
                    <th className="py-1.5 pr-3 font-medium">Fecha</th>
                    <th className="py-1.5 pr-3 font-medium">Contacto</th>
                    <th className="py-1.5 pr-3 font-medium">Modelo</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Tokens</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Tiempo</th>
                    <th className="py-1.5 font-medium">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {ejecuciones.map((e) => {
                    const r = RESULTADO[e.resultado] ?? { texto: e.resultado, clase: "bg-slate-100 text-text-tertiary" };
                    return (
                      <tr key={e.id} className="border-b border-border/60 align-top">
                        <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-text-tertiary">{FECHA.format(new Date(e.fecha))}</td>
                        <td className="max-w-[160px] truncate py-1.5 pr-3 text-text-primary">{e.contacto}</td>
                        <td className="max-w-[200px] truncate py-1.5 pr-3 font-mono text-[11px] text-text-secondary" title={e.modelo}>
                          {e.modelo}
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-text-secondary">
                          {e.tokensEntrada != null ? `${e.tokensEntrada} / ${e.tokensSalida ?? "—"}` : "—"}
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-text-secondary">
                          {e.duracionMs != null ? `${(e.duracionMs / 1000).toFixed(1)} s` : "—"}
                        </td>
                        <td className="py-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.clase}`}>{r.texto}</span>
                          {e.error && <p className="mt-0.5 max-w-[260px] text-[10px] text-text-muted">{e.error}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
