"use client";

/**
 * Panel de selección dentro de la ficha del proceso: semáforo de
 * preselección con la propuesta de cierre, autorización de datos, SIMIT,
 * postulaciones anteriores (B3) e historial de cambios (NF6).
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, ExternalLink, History, Search, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import { estadoInfo, type ProcesoContratacion } from "@/lib/contratacion/constants";
import {
  consultarSimit,
  listarEventosProceso,
  postulacionesAnteriores,
  updateProcesoEstado,
  type EventoProcesoVista,
  type PostulacionAnterior,
} from "@/lib/contratacion/actions";
import { SemaforoDetalle } from "./semaforo";

// Consulta ciudadana por documento (gratuita, con captcha).
const RUNT_URL = "https://www.runt.gov.co/actores/ciudadano/consulta-por-tipo-de-documento";

const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso));

const ACTOR: Record<EventoProcesoVista["actor"], string> = { usuario: "", agente: "Asistente IA", sistema: "Sistema" };

function describirEvento(e: EventoProcesoVista): string {
  const label = (v: string | null) => estadoInfo(v)?.label ?? v ?? "—";
  switch (e.tipo) {
    case "creado":
      return `Creó el proceso en «${label(e.estado_nuevo)}»`;
    case "estado":
      return `${label(e.estado_anterior)} → ${label(e.estado_nuevo)}${e.causa ? ` (${e.causa})` : ""}`;
    case "preseleccion": {
      const g = (e.detalle?.global as string) ?? "";
      return g === "pasa" ? "Preselección: cumple los 4 requisitos" : g === "no_cumple" ? `Preselección: no cumple (${e.causa ?? "—"})` : "Preselección: faltan datos";
    }
    case "autorizacion":
      return e.detalle?.respuesta === "si" ? "Autorizó el tratamiento de datos" : "No autorizó el tratamiento de datos";
    default: {
      const campos = e.detalle?.campos as string[] | undefined;
      if (campos?.length) return `Editó: ${campos.join(", ").replace(/_/g, " ")}`;
      if (e.detalle?.simit != null) return `SIMIT consultado: $${Number(e.detalle.simit).toLocaleString("es-CO")}`;
      return "Actualizó el proceso";
    }
  }
}

export function PanelSeleccion({ proceso, puedeEditar, onCerrado }: { proceso: ProcesoContratacion; puedeEditar: boolean; onCerrado: () => void }) {
  const router = useRouter();
  const [eventos, setEventos] = useState<EventoProcesoVista[] | null>(null);
  const [anteriores, setAnteriores] = useState<PostulacionAnterior[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  useEffect(() => {
    let vivo = true;
    listarEventosProceso(proceso.id).then((e) => vivo && setEventos(e)).catch(() => vivo && setEventos([]));
    postulacionesAnteriores({ procesoId: proceso.id, cedula: proceso.cedula, telefono: proceso.celular })
      .then((a) => vivo && setAnteriores(a))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [proceso.id, proceso.cedula, proceso.celular]);

  const pre = proceso.preseleccion;
  const abierto = proceso.estado !== "cierre" && proceso.estado !== "contratado";
  const causa = proceso.requisito_incumplido;

  function cerrarConCausa() {
    if (!causa) return;
    if (!confirm(`¿Cerrar el proceso de ${proceso.nombre} con la causa «${causa}»?`)) return;
    startTransition(async () => {
      try {
        await updateProcesoEstado(proceso.id, "cierre", causa);
        router.refresh();
        onCerrado();
      } catch (e) {
        setMensaje(e instanceof Error ? e.message : "No se pudo cerrar.");
      }
    });
  }

  function pedirSimit() {
    setMensaje(null);
    startTransition(async () => {
      try {
        const r = await consultarSimit(proceso.id);
        setMensaje(
          r.modo === "consultado"
            ? `SIMIT consultado: $${r.valor.toLocaleString("es-CO")}.`
            : r.mensaje
        );
        router.refresh();
      } catch (e) {
        setMensaje(e instanceof Error ? e.message : "No se pudo consultar.");
      }
    });
  }

  return (
    <div className="mt-6 space-y-5 border-t border-[#F1F5F9] pt-5">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-900">Preselección</h4>
          {proceso.origen === "whatsapp_agente" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-medium text-[#4F46E5]">
              <Bot className="h-3 w-3" /> Creado por el asistente de WhatsApp
            </span>
          )}
        </div>
        {pre ? <SemaforoDetalle resultado={pre} /> : <p className="text-sm text-gray-500">Sin evaluar todavía: guarde el proceso para calcular el semáforo.</p>}

        {abierto && pre?.global === "no_cumple" && causa && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="flex items-center gap-2 text-sm text-red-700">
              <TriangleAlert className="h-4 w-4 shrink-0" /> Se propone cerrar: {causa}
            </p>
            {puedeEditar && (
              <button
                type="button"
                onClick={cerrarConCausa}
                disabled={pendiente}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Cerrar con esta causa
              </button>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {proceso.autorizacion_datos === "si" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> Autorizó datos
              {proceso.autorizacion_datos_at ? ` · ${fechaHora(proceso.autorizacion_datos_at)}` : ""}
            </span>
          ) : proceso.autorizacion_datos === "no" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-700">
              <ShieldX className="h-3.5 w-3.5" /> No autorizó datos
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">Autorización de datos pendiente</span>
          )}
          {proceso.hoja_vida_recibida_at && (
            <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">Hoja de vida recibida · {fechaHora(proceso.hoja_vida_recibida_at)}</span>
          )}
          {proceso.carta_laboral_pendiente && (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Carta laboral pendiente</span>
          )}
          <a href={RUNT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-gray-600 hover:text-[#4F46E5]">
            Consultar licencia en el RUNT <ExternalLink className="h-3 w-3" />
          </a>
          {puedeEditar && abierto && (
            <button
              type="button"
              onClick={pedirSimit}
              disabled={pendiente}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-gray-600 hover:text-[#4F46E5] disabled:opacity-50"
            >
              <Search className="h-3 w-3" /> Consultar SIMIT
            </button>
          )}
        </div>
        {mensaje && <p className="mt-2 text-xs text-gray-600">{mensaje}</p>}
      </section>

      {anteriores.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">
            Postuló antes: {anteriores.length} {anteriores.length === 1 ? "vez" : "veces"}
          </h4>
          <ul className="space-y-1 text-sm text-gray-600">
            {anteriores.slice(0, 5).map((a) => (
              <li key={a.id}>
                {a.fecha_creacion} · {estadoInfo(a.estado)?.label ?? a.estado}
                {a.causa_no_contrato ? ` · ${a.causa_no_contrato}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <History className="h-4 w-4" /> Historial
        </h4>
        {eventos === null ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : eventos.length === 0 ? (
          <p className="text-sm text-gray-500">Sin cambios registrados.</p>
        ) : (
          <ol className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
            {eventos.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-2 text-gray-700">
                <span className="text-xs text-gray-400">{fechaHora(e.created_at)}</span>
                <span>{describirEvento(e)}</span>
                <span className="text-xs text-gray-400">{ACTOR[e.actor] || e.usuario_email || ""}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
