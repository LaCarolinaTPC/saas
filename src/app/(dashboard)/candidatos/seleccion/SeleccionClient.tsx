"use client";

/**
 * Pantalla de configuración de la selección: catálogo de mensajes (texto,
 * vista previa, historial, modo de envío y plantilla de Meta) y tiempos y
 * reglas con su valor sugerido.
 */
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Bot, Clock, Smartphone, FlaskConical, Loader2, MessageSquareText, Microscope, RefreshCw, RotateCcw, TriangleAlert, ShieldCheck } from "lucide-react";
import { EJEMPLOS, RESPUESTAS_ASISTENTE, VARIABLES, renderizarConLineas, saltosDeLinea, type MensajeSeleccion } from "@/lib/seleccion/mensajes";
import { BurbujaWhatsApp, FondoChat, PlantillaMeta, TextoWhatsApp } from "./PlantillaMeta";
import type { AjusteSeleccion } from "@/lib/seleccion/ajustes";
import { actualizarEstadoPlantillas, enviarPlantillaAAprobacion, guardarMensaje, restaurarMensaje } from "./actions";
import { AvisoLinea, Historial, campo, fechaHora, type Aviso } from "./comunes";
import TiemposReglas, { type SeguimientoPantalla } from "./TiemposReglas";
import ReglasAntecedentes from "./ReglasAntecedentes";
import BuscadorSeleccion from "./BuscadorSeleccion";
import { anclaMensaje, type PestanaBuscable } from "@/lib/seleccion/buscador-seleccion";
import Laboratorios from "./Laboratorios";
import PestanaIa, { type Ejecucion } from "./PestanaIa";
import { SOLO_ADMIN, esPestana, type Pestana } from "./pestanas";
import PestanaCanal, { type CanalActual } from "./PestanaCanal";
import type { AgenteConfig, Proveedor } from "@/lib/comunicaciones/agente/opciones";
import { ChatsPrueba } from "@/components/seleccion/chats-prueba";
import { BarraServicios } from "@/components/estado-servicios/barra-servicios";
import { MarcoProfesorPrueba } from "@/components/seleccion/marco-profesor-prueba";
import { LaboratoriosPrueba } from "@/components/seleccion/laboratorios-prueba";

/** Mensajes que usa el asistente de IA en la conversación, con lo que conviene saber de cada uno. */
const NOTA_DEL_ASISTENTE: Record<string, string> = {
  bienvenida:
    "Es el primer mensaje del asistente a quien escribe. Lo copia tal cual y solo lo adapta si la persona ya mandó algún dato o hizo una pregunta. No necesita aprobación de Meta: siempre responde a un mensaje del aspirante, con la ventana de 24 horas abierta. Si no pide la cédula, el primer apellido y la fecha de expedición, el asistente los pide igual al final.",
  salario_horario:
    "El asistente responde con esta idea cuando preguntan por los temas que no informa (salario, horarios, pagos; se configuran en la pestaña IA) y sigue pidiendo lo que falte. No necesita aprobación de Meta.",
};

function TarjetaMensaje({ m, valores, puedeEditar }: { m: MensajeSeleccion; valores: Record<string, string>; puedeEditar: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState(m.texto);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendiente, start] = useTransition();
  const cambiado = saltosDeLinea(texto) !== saltosDeLinea(m.texto);
  // La bienvenida y la respuesta sobre salario u horario las escribe el asistente
  // dentro de la conversación: no tienen modo de envío ni necesitan plantilla de Meta.
  const respuesta = RESPUESTAS_ASISTENTE[m.clave];
  const notaAsistente =
    NOTA_DEL_ASISTENTE[m.clave] ??
    (respuesta
      ? `Lo usa el asistente de IA con estas palabras. ${respuesta.charAt(0).toUpperCase()}${respuesta.slice(1)}. No necesita aprobación de Meta.`
      : undefined);
  const valoresVista = { ...EJEMPLOS, ...Object.fromEntries(Object.entries(valores).filter(([, v]) => v)) };
  const vista = renderizarConLineas(texto, valoresVista);

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
    <div id={anclaMensaje(m.clave)} className="scroll-mt-24 space-y-3 rounded-2xl border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{m.nombre}</h3>
          <p className="text-xs text-text-tertiary">{m.cuando}</p>
        </div>
        {notaAsistente ? (
          <span className="rounded-xl bg-slate-100 px-2 py-1.5 text-xs text-text-secondary">Lo envía el asistente</span>
        ) : (
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
        )}
      </div>

      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!puedeEditar} rows={Math.min(Math.max(texto.split(/\n/).length, 3), 14)} className={campo} />

      {notaAsistente && <p className="text-xs text-text-tertiary">{notaAsistente}</p>}

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

      <div className={`grid gap-3 ${m.plantilla_nombre ? "md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2" : ""}`}>
        <FondoChat
          titulo={m.plantilla_nombre ? "Dentro de la ventana de 24 horas: texto" : "Así llega"}
          detalle={cambiado ? <span className="text-amber-700">Vista previa del texto sin guardar</span> : undefined}
        >
          <BurbujaWhatsApp>
            <TextoWhatsApp texto={vista} />
          </BurbujaWhatsApp>
        </FondoChat>
        <PlantillaMeta
          m={m}
          valores={valoresVista}
          puedeEnviar={puedeEditar && !cambiado}
          enviando={pendiente}
          onEnviar={() => {
            if (confirm(`¿Enviar a aprobación de Meta una versión nueva de «${m.plantilla_nombre}» con este texto?`)) {
              correr(() => enviarPlantillaAAprobacion(m.clave));
            }
          }}
        />
      </div>

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

const CLAVE_PESTANA = "gestivo:seleccion:pestana";
/** Pestañas en las que busca el buscador (las del administrador, solo si las tiene). */
const PESTANAS_BUSCABLES: PestanaBuscable[] = ["mensajes", "tiempos", "antecedentes", "laboratorios", "ia", "canal", "probar"];

export default function SeleccionClient({
  mensajes,
  ajustes,
  valores,
  puedeEditar,
  disponible,
  seguimiento,
  ia,
  canal,
  pestanaInicial,
}: {
  mensajes: MensajeSeleccion[];
  ajustes: AjusteSeleccion[];
  valores: Record<string, string>;
  puedeEditar: boolean;
  disponible: boolean;
  seguimiento: SeguimientoPantalla;
  /** Solo para el administrador: la pestaña «IA». */
  ia: { config: AgenteConfig; disponibles: Record<Proveedor, boolean>; ejecuciones: Ejecucion[] } | null;
  /** Solo para el administrador: la pestaña «Canal» (null en `actual` = sin canal configurado). */
  canal: { actual: CanalActual | null } | null;
  /** `?pestana=` en la dirección. */
  pestanaInicial?: Pestana;
}) {
  const router = useRouter();
  // Las pestañas del administrador solo existen si llegaron sus datos.
  const disponiblePestana = (p: Pestana) => !SOLO_ADMIN.includes(p) || (p === "ia" ? !!ia : !!canal);
  const [pestana, setPestanaEstado] = useState<Pestana>(pestanaInicial && disponiblePestana(pestanaInicial) ? pestanaInicial : "mensajes");
  // Recuerda la última pestaña: al volver a la página se retoma donde se iba (por ejemplo, el chat de prueba).
  const setPestana = (p: Pestana) => {
    setPestanaEstado(p);
    try {
      localStorage.setItem(CLAVE_PESTANA, p);
    } catch {
      // Sin almacenamiento: no se recuerda.
    }
  };
  useEffect(() => {
    // Con ?pestana= manda la dirección; si no, la última que se usó.
    if (pestanaInicial) return;
    const t = setTimeout(() => {
      try {
        const p = localStorage.getItem(CLAVE_PESTANA);
        if (esPestana(p) && disponiblePestana(p)) setPestanaEstado(p);
      } catch {
        // Sin almacenamiento: queda en «Mensajes».
      }
    }, 0);
    return () => clearTimeout(t);
    // disponiblePestana depende solo de ia y canal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pestanaInicial, ia, canal]);
  // Entrega 2: la pantalla del profesor al lado del chat de prueba.
  const [aviso, setAviso] = useState<Aviso>(null);
  const [sincronizando, start] = useTransition();

  return (
    <div className={`mx-auto w-full p-4 pb-20 sm:p-6 md:pb-6 lg:p-8 ${pestana === "probar" ? "max-w-none" : "max-w-[1800px]"}`}>
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

      {/* Fija arriba al bajar (25-nov-2026): las pestañas y el buscador siempre a la mano. */}
      <div className="sticky top-0 z-20 -mx-2 mt-5 flex flex-wrap items-center justify-between gap-2 rounded-b-xl bg-background/90 px-2 py-2 backdrop-blur">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-white p-1">
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
            onClick={() => setPestana("antecedentes")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${pestana === "antecedentes" ? "bg-primary text-white" : "text-text-secondary"}`}
          >
            <ShieldCheck className="h-4 w-4" /> Antecedentes
          </button>
          <button
            onClick={() => setPestana("laboratorios")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${pestana === "laboratorios" ? "bg-primary text-white" : "text-text-secondary"}`}
          >
            <Microscope className="h-4 w-4" /> Laboratorios
          </button>
          {ia && (
            <button
              onClick={() => setPestana("ia")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${pestana === "ia" ? "bg-primary text-white" : "text-text-secondary"}`}
            >
              <Bot className="h-4 w-4" /> IA
            </button>
          )}
          {canal && (
            <button
              onClick={() => setPestana("canal")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${pestana === "canal" ? "bg-primary text-white" : "text-text-secondary"}`}
            >
              <Smartphone className="h-4 w-4" /> Canal de WhatsApp
            </button>
          )}
          <button
            onClick={() => setPestana("probar")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${pestana === "probar" ? "bg-primary text-white" : "text-text-secondary"}`}
          >
            <FlaskConical className="h-4 w-4" /> Probar el asistente
          </button>
          {/* Página aparte: lee la base en el servidor y su periodo va en la URL. */}
          <Link href="/candidatos/indicadores" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50">
            <BarChart3 className="h-4 w-4" /> Indicadores
          </Link>
        </div>
        <BuscadorSeleccion
          mensajes={mensajes}
          ajustes={ajustes}
          disponibles={PESTANAS_BUSCABLES.filter((p) => disponiblePestana(p))}
          onIr={setPestana}
        />
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
        <div className="mt-3 space-y-2">
          {/* Estado de los servicios (26-nov-2026): si Croma o la IA no responden, qué hacer sin salir de la prueba. */}
          <BarraServicios />
          <ChatsPrueba
            descripcion="Prueba el asistente con la configuración guardada, como lo vería un aspirante, en varios chats a la vez. No se envía nada por WhatsApp. Cada mensaje usa dos llamadas a la IA."
            profesor={<MarcoProfesorPrueba puedeEditar={puedeEditar} compacto />}
            laboratorios={<LaboratoriosPrueba puedeEditar />}
          />
        </div>
      ) : pestana === "antecedentes" ? (
        <ReglasAntecedentes ajustes={ajustes} puedeEditar={puedeEditar} />
      ) : pestana === "laboratorios" ? (
        <Laboratorios />
      ) : pestana === "canal" && canal ? (
        <PestanaCanal actual={canal.actual} />
      ) : pestana === "ia" && ia ? (
        <PestanaIa config={ia.config} disponibles={ia.disponibles} ejecuciones={ia.ejecuciones} irA={setPestana} />
      ) : pestana === "mensajes" ? (
        <div className="mt-4 space-y-4">
          <p className="max-w-5xl text-xs text-text-tertiary">
            «Sale automático» lo envía Gestivo solo. «Revisar antes de enviar» lo deja escrito en el chat para que una persona lo ajuste y lo envíe. El
            asistente de IA usa tal cual la bienvenida, la respuesta sobre salario u horario y la autorización de datos; en lo demás habla con su
            propio estilo, que se ajusta en sus instrucciones (pestaña IA).
          </p>
          {/* 25-nov-2026: dos columnas en pantallas anchas. En columnas y no en cuadrícula: las tarjetas
              tienen altos muy distintos y la cuadrícula dejaba huecos debajo de las cortas. */}
          <div className="gap-4 xl:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
            {mensajes.map((m) => (
              <TarjetaMensaje key={`${m.clave}:${m.updated_at}`} m={m} valores={valores} puedeEditar={puedeEditar} />
            ))}
          </div>
        </div>
      ) : (
        <TiemposReglas ajustes={ajustes} seguimiento={seguimiento} puedeEditar={puedeEditar} irAIa={ia ? () => setPestana("ia") : undefined} />
      )}
    </div>
  );
}
