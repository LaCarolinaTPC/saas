"use client";

/**
 * Pantalla de configuración de la selección: catálogo de mensajes (texto,
 * vista previa, historial, modo de envío y plantilla de Meta) y tiempos y
 * reglas con su valor sugerido.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, FlaskConical, History, Loader2, MessageSquareText, RefreshCw, RotateCcw, Send, TriangleAlert } from "lucide-react";
import { EJEMPLOS, VARIABLES, aFormatoMeta, renderizarMensaje, type MensajeSeleccion } from "@/lib/seleccion/mensajes";
import { mostrarValor, type AjusteSeleccion } from "@/lib/seleccion/ajustes";
import {
  actualizarEstadoPlantillas,
  enviarPlantillaAAprobacion,
  guardarAjuste,
  guardarMensaje,
  historialCambios,
  restaurarAjuste,
  restaurarMensaje,
  type CambioSeleccion,
} from "./actions";
import { ChatPrueba } from "@/components/seleccion/chat-prueba";
import { MarcoProfesorPrueba } from "@/components/seleccion/marco-profesor-prueba";

interface Seguimiento {
  disponible: boolean;
  horaDesde: string;
  horaHasta: string;
  horasEspera: number;
  horasEscalar: number;
  esperaAgente: number;
}

type Aviso = { ok: boolean; texto: string } | null;

const campo =
  "w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary/30 disabled:bg-slate-50";

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso));

const ESTADO_META: Record<string, { texto: string; clase: string }> = {
  APPROVED: { texto: "Aprobada", clase: "bg-emerald-50 text-emerald-700" },
  PENDING: { texto: "En revisión de Meta", clase: "bg-amber-50 text-amber-700" },
  IN_APPEAL: { texto: "En apelación", clase: "bg-amber-50 text-amber-700" },
  REJECTED: { texto: "Rechazada", clase: "bg-red-50 text-red-700" },
  PAUSED: { texto: "Pausada por Meta", clase: "bg-red-50 text-red-700" },
  DISABLED: { texto: "Deshabilitada", clase: "bg-red-50 text-red-700" },
  NO_EXISTE: { texto: "No existe en Meta", clase: "bg-red-50 text-red-700" },
};

function EstadoPlantilla({ estado }: { estado: string | null }) {
  const e = ESTADO_META[estado ?? ""] ?? { texto: estado ?? "Sin revisar", clase: "bg-slate-100 text-text-secondary" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.clase}`}>{e.texto}</span>;
}

function AvisoLinea({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <p className={`flex items-start gap-1.5 text-xs ${aviso.ok ? "text-emerald-700" : "text-red-700"}`}>
      {aviso.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {aviso.texto}
    </p>
  );
}

function Historial({ tipo, clave, unidad }: { tipo: "mensaje" | "ajuste"; clave: string; unidad?: string }) {
  const [cambios, setCambios] = useState<CambioSeleccion[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const mostrar = (v: unknown) => (unidad ? mostrarValor(unidad, v) : typeof v === "string" ? v : JSON.stringify(v));
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          setAbierto(!abierto);
          if (!cambios) setCambios(await historialCambios(tipo, clave).catch(() => []));
        }}
        className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary"
      >
        <History className="h-3.5 w-3.5" /> {abierto ? "Ocultar historial" : "Historial"}
      </button>
      {abierto && (
        <div className="mt-2 rounded-xl bg-slate-50 p-3 text-xs">
          {cambios === null ? (
            <p className="text-text-tertiary">Cargando…</p>
          ) : cambios.length === 0 ? (
            <p className="text-text-tertiary">Sin cambios: tiene el valor sugerido.</p>
          ) : (
            <ol className="space-y-2">
              {cambios.map((c) => (
                <li key={c.id}>
                  <span className="text-text-tertiary">
                    {fechaHora(c.created_at)} · {c.usuario_email ?? "—"} · {c.campo === "modo" ? "modo de envío" : c.campo}
                  </span>
                  <div className="text-text-secondary">
                    <span className="line-through opacity-60">{mostrar(c.valor_anterior)}</span> → {mostrar(c.valor_nuevo)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaMensaje({ m, valores, puedeEditar }: { m: MensajeSeleccion; valores: Record<string, string>; puedeEditar: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState(m.texto);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendiente, start] = useTransition();
  const cambiado = texto.trim() !== m.texto;
  const vista = renderizarMensaje(texto, { ...EJEMPLOS, ...Object.fromEntries(Object.entries(valores).filter(([, v]) => v)) });
  // ¿El texto guardado difiere de la plantilla aprobada? Entonces hay que enviar una versión nueva.
  const difiereDeMeta =
    !!m.plantilla_nombre && !!m.plantilla_texto_aprobado && aFormatoMeta(m.texto, m.plantilla_variables) !== m.plantilla_texto_aprobado;

  const correr = (fn: () => Promise<{ ok: boolean; aviso?: string; error?: string }>, ok = "Guardado.") =>
    start(async () => {
      setAviso(null);
      try {
        const r = await fn();
        setAviso(r.ok ? { ok: true, texto: r.aviso ?? ok } : { ok: false, texto: r.error ?? "No se pudo guardar." });
        if (r.ok) router.refresh();
      } catch (e) {
        setAviso({ ok: false, texto: e instanceof Error ? e.message : "Error." });
      }
    });

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{m.nombre}</h3>
          <p className="text-xs text-text-tertiary">{m.cuando}</p>
        </div>
        <select
          value={m.modo}
          disabled={!puedeEditar || pendiente}
          onChange={(e) => correr(() => guardarMensaje(m.clave, { modo: e.target.value as "automatico" | "revisar" }))}
          className="rounded-xl border border-border bg-white px-2 py-1.5 text-xs"
          aria-label="Modo de envío"
        >
          <option value="automatico">Sale automático</option>
          <option value="revisar">Revisar antes de enviar</option>
        </select>
      </div>

      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!puedeEditar} rows={3} className={campo} />

      {m.variables.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-text-tertiary">Variables:</span>
          {m.variables.map((v) => (
            <button
              key={v}
              type="button"
              disabled={!puedeEditar}
              onClick={() => setTexto((t) => `${t}{${v}}`)}
              title={VARIABLES[v]?.descripcion ?? v}
              className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-text-secondary hover:bg-slate-200 disabled:opacity-60"
            >
              {`{${v}}`}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl bg-[#E7FFDB] px-3 py-2 text-sm text-gray-800">
        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Vista previa</p>
        {vista}
      </div>

      {m.plantilla_nombre && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span>
            Fuera de la ventana de 24 h: plantilla <code className="font-mono">{m.plantilla_nombre}</code>
          </span>
          <EstadoPlantilla estado={m.plantilla_estado} />
          {m.plantilla_propuesta_nombre && (
            <span className="inline-flex items-center gap-1">
              · versión nueva <code className="font-mono">{m.plantilla_propuesta_nombre}</code> <EstadoPlantilla estado={m.plantilla_propuesta_estado} />
            </span>
          )}
          {puedeEditar && difiereDeMeta && !cambiado && !m.plantilla_propuesta_nombre && (
            <button
              type="button"
              disabled={pendiente}
              onClick={() => {
                if (confirm(`¿Enviar a aprobación de Meta una versión nueva de «${m.plantilla_nombre}» con este texto?`)) {
                  correr(() => enviarPlantillaAAprobacion(m.clave));
                }
              }}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              <Send className="h-3 w-3" /> Enviar versión nueva a Meta
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Historial tipo="mensaje" clave={m.clave} />
          {m.actualizado_por && <span className="text-[11px] text-text-tertiary">Último cambio: {m.actualizado_por} · {fechaHora(m.updated_at)}</span>}
        </div>
        {puedeEditar && (
          <div className="flex items-center gap-2">
            {m.texto !== m.texto_sugerido && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() => correr(async () => {
                  const r = await restaurarMensaje(m.clave);
                  if (r.ok) setTexto(m.texto_sugerido);
                  return r;
                }, "Volvió al texto sugerido.")}
                className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Volver al sugerido
              </button>
            )}
            <button
              type="button"
              disabled={!cambiado || pendiente}
              onClick={() => correr(() => guardarMensaje(m.clave, { texto }))}
              className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {pendiente && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
            </button>
          </div>
        )}
      </div>
      <AvisoLinea aviso={aviso} />
    </div>
  );
}

function FilaAjuste({ a, puedeEditar }: { a: AjusteSeleccion; puedeEditar: boolean }) {
  const router = useRouter();
  const inicial = a.unidad === "lista" && Array.isArray(a.valor) ? (a.valor as string[]).join(", ") : String(a.valor ?? "");
  const [valor, setValor] = useState(inicial);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendiente, start] = useTransition();
  const esSugerido = JSON.stringify(a.valor) === JSON.stringify(a.valor_sugerido);

  const correr = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setAviso(null);
      try {
        const r = await fn();
        setAviso(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.error ?? "No se pudo guardar." });
        if (r.ok) router.refresh();
      } catch (e) {
        setAviso({ ok: false, texto: e instanceof Error ? e.message : "Error." });
      }
    });

  return (
    <div className="grid gap-2 border-b border-border py-3 last:border-0 sm:grid-cols-[1fr_200px_auto] sm:items-center">
      <div>
        <p className="text-sm text-text-primary">
          {a.nombre}
          {a.entrega > 1 && <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-text-tertiary">se usa desde la entrega {a.entrega}</span>}
        </p>
        <p className="text-[11px] text-text-tertiary">
          Sugerido: {mostrarValor(a.unidad, a.valor_sugerido)}
          {a.origen ? ` · ${a.origen}` : ""}
          {a.actualizado_por ? ` · cambiado por ${a.actualizado_por}, ${fechaHora(a.updated_at)}` : ""}
        </p>
        {a.actualizado_por && <Historial tipo="ajuste" clave={a.clave} unidad={a.unidad} />}
        <AvisoLinea aviso={aviso} />
      </div>
      {a.unidad === "si_no" ? (
        <select value={valor} onChange={(e) => setValor(e.target.value)} disabled={!puedeEditar} className={campo} aria-label={a.nombre}>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      ) : (
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          disabled={!puedeEditar}
          type={a.unidad === "hora" ? "time" : "text"}
          inputMode={["horas", "dias", "minutos", "numero", "pesos"].includes(a.unidad) ? "numeric" : undefined}
          className={campo}
          aria-label={a.nombre}
        />
      )}
      {puedeEditar && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={valor === inicial || pendiente}
            onClick={() => correr(() => guardarAjuste(a.clave, valor))}
            className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            Guardar
          </button>
          {!esSugerido && (
            <button
              type="button"
              title="Volver al valor sugerido"
              disabled={pendiente}
              onClick={() => correr(async () => {
                const r = await restaurarAjuste(a.clave);
                if (r.ok) setValor(a.unidad === "lista" && Array.isArray(a.valor_sugerido) ? (a.valor_sugerido as string[]).join(", ") : String(a.valor_sugerido ?? ""));
                return r;
              })}
              className="rounded-xl border border-border p-1.5 text-text-secondary hover:bg-slate-50 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const GRUPOS: { grupo: AjusteSeleccion["grupo"]; titulo: string; detalle: string }[] = [
  { grupo: "regla", titulo: "Reglas del semáforo de preselección", detalle: "Con los 4 requisitos en verde y la autorización de datos aceptada, el proceso pasa solo a antecedentes. La experiencia no bloquea." },
  { grupo: "tiempo", titulo: "Tiempos", detalle: "Los de la reactivación se usan desde ya; los de la cita, la escuela y la carpeta, desde la entrega que se indica." },
  { grupo: "dato", titulo: "Datos de los mensajes", detalle: "Se usan en las variables {direccion}, {laboratorio} y {enlace_politica}. Sin el enlace, la autorización se pide sin él. Los datos «Política de datos» completan la página pública /politica-de-datos (lo vacío se omite)." },
];

export default function SeleccionClient({
  mensajes,
  ajustes,
  valores,
  puedeEditar,
  disponible,
  seguimiento,
}: {
  mensajes: MensajeSeleccion[];
  ajustes: AjusteSeleccion[];
  valores: Record<string, string>;
  puedeEditar: boolean;
  disponible: boolean;
  seguimiento: Seguimiento;
}) {
  const router = useRouter();
  const [pestana, setPestana] = useState<"mensajes" | "tiempos" | "probar">("mensajes");
  // Entrega 2: la pantalla del profesor al lado del chat de prueba.
  const [verProfesor, setVerProfesor] = useState(true);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [sincronizando, start] = useTransition();

  return (
    <div className={`mx-auto w-full p-4 pb-20 sm:p-6 md:pb-6 lg:p-8 ${pestana === "probar" && verProfesor ? "max-w-7xl" : "max-w-4xl"}`}>
      <Link href="/candidatos" className="mb-4 inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Candidatos
      </Link>
      <h1 className="text-xl font-bold tracking-tight text-text-primary sm:text-2xl">Selección de conductores</h1>
      <p className="mt-1 text-sm text-text-tertiary">
        Lo que Gestivo les dice a los aspirantes, cuándo lo dice y las reglas de la preselección. Cada cambio queda con quién lo hizo.
      </p>

      {!disponible && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Falta aplicar la migración <code>20261113205625_seleccion_entrega_1_asistente_y_preseleccion.sql</code>.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl border border-border bg-white p-1">
          <button
            onClick={() => setPestana("mensajes")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${pestana === "mensajes" ? "bg-primary text-white" : "text-text-secondary"}`}
          >
            <MessageSquareText className="h-4 w-4" /> Mensajes
          </button>
          <button
            onClick={() => setPestana("tiempos")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${pestana === "tiempos" ? "bg-primary text-white" : "text-text-secondary"}`}
          >
            <Clock className="h-4 w-4" /> Tiempos y reglas
          </button>
          <button
            onClick={() => setPestana("probar")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${pestana === "probar" ? "bg-primary text-white" : "text-text-secondary"}`}
          >
            <FlaskConical className="h-4 w-4" /> Probar el asistente
          </button>
        </div>
        {pestana === "mensajes" && puedeEditar && disponible && (
          <button
            disabled={sincronizando}
            onClick={() =>
              start(async () => {
                const r = await actualizarEstadoPlantillas().catch((e: Error) => ({ ok: false as const, error: e.message }));
                setAviso(r.ok ? { ok: true, texto: r.aviso ?? "Actualizado." } : { ok: false, texto: r.error });
                router.refresh();
              })
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-1.5 text-xs text-text-secondary hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? "animate-spin" : ""}`} /> Actualizar estado de las plantillas con Meta
          </button>
        )}
      </div>
      <div className="mt-2">
        <AvisoLinea aviso={aviso} />
      </div>

      {pestana === "probar" ? (
        <div className="mt-4 space-y-3">
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-text-secondary">
            <input type="checkbox" checked={verProfesor} onChange={(e) => setVerProfesor(e.target.checked)} className="accent-primary" />
            Profesor: mostrar su pantalla al lado
          </label>
          {/* En pantallas angostas quedan uno debajo del otro. */}
          <div className={verProfesor ? "grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_410px]" : ""}>
            <ChatPrueba descripcion="Prueba el asistente con la configuración guardada, como lo vería un aspirante. No se envía nada por WhatsApp ni se guarda. Cada mensaje usa una llamada a la IA; el panel «Qué pasaría en Gestivo» usa otra, solo cuando lo pides. Los casos listos muestran cuántas llamadas cuestan." />
            {verProfesor && <MarcoProfesorPrueba puedeEditar={puedeEditar} />}
          </div>
        </div>
      ) : pestana === "mensajes" ? (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-text-tertiary">
            «Sale automático» lo envía Gestivo solo. «Revisar antes de enviar» lo deja escrito en el chat para que una persona lo ajuste y lo envíe. El
            asistente de IA no copia estos textos palabra por palabra: su forma de hablar se ajusta en su propio prompt (Comunicaciones › Agente de
            IA); la autorización de datos sí la usa tal cual.
          </p>
          {mensajes.map((m) => (
            <TarjetaMensaje key={`${m.clave}:${m.updated_at}`} m={m} valores={valores} puedeEditar={puedeEditar} />
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {GRUPOS.map((g) => {
            const filas = ajustes.filter((a) => a.grupo === g.grupo);
            if (!filas.length) return null;
            return (
              <section key={g.grupo} className="rounded-2xl border border-border bg-surface-raised p-4">
                <h2 className="text-sm font-semibold text-text-primary">{g.titulo}</h2>
                <p className="mb-1 text-xs text-text-tertiary">{g.detalle}</p>
                {filas.map((a) => (
                  <div key={`${a.clave}:${a.updated_at}`}>
                    <FilaAjuste a={a} puedeEditar={puedeEditar} />
                  </div>
                ))}
              </section>
            );
          })}

          <section className="rounded-2xl border border-border bg-surface-raised p-4">
            <h2 className="text-sm font-semibold text-text-primary">Tiempos del asistente y del seguimiento</h2>
            <p className="mb-3 text-xs text-text-tertiary">Se cambian en Comunicaciones, donde ya estaban; aquí se muestran para tenerlos juntos.</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-text-tertiary">Horario permitido para mensajes automáticos (sugerido 07:00 a 20:00)</dt>
                <dd>{seguimiento.horaDesde} a {seguimiento.horaHasta}, hora de Bogotá</dd>
              </div>
              <div>
                <dt className="text-xs text-text-tertiary">Espera del asistente antes de responder (sugerido 6 s)</dt>
                <dd>{seguimiento.esperaAgente} segundos</dd>
              </div>
              <div>
                <dt className="text-xs text-text-tertiary">Recordatorio dentro de la ventana de 24 h (sugerido 2 h)</dt>
                <dd>{seguimiento.horasEspera} horas de silencio</dd>
              </div>
              <div>
                <dt className="text-xs text-text-tertiary">Pasar el chat a una persona (sugerido 24 h)</dt>
                <dd>{seguimiento.horasEscalar} horas después del recordatorio</dd>
              </div>
            </dl>
            <div className="mt-3 flex gap-3 text-xs">
              <Link href="/comunicaciones/configuracion" className="text-primary hover:underline">Seguimiento y horario →</Link>
              <Link href="/comunicaciones/agente" className="text-primary hover:underline">Agente de IA →</Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
