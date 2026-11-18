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
  listarConsultasExternas,
  listarDocumentosProceso,
  type DocumentoProceso,
  listarEventosProceso,
  postulacionesAnteriores,
  updateProcesoEstado,
  vinculoEmpresaProceso,
  type ConsultaExternaVista,
  type EventoProcesoVista,
  type PostulacionAnterior,
} from "@/lib/contratacion/actions";
import { SemaforoDetalle } from "./semaforo";
import { interpretarConsulta } from "@/lib/verificacion/interpretacion";
import { evaluarAntecedentes, NOMBRE_FUENTE, hallazgoDe, type ConsultaGuardada } from "@/lib/seleccion/antecedentes";
import { resumenVinculo, type VinculoEmpresa } from "@/lib/seleccion/vinculo";

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
      if (e.detalle?.reiniciado) return "Reiniciado desde el chat de prueba: se borran los datos y se vuelve a consultar Croma";
      const campos = e.detalle?.campos as string[] | undefined;
      if (campos?.length) return `Editó: ${campos.join(", ").replace(/_/g, " ")}`;
      if (e.detalle?.simit != null) return `SIMIT consultado: $${Number(e.detalle.simit).toLocaleString("es-CO")}`;
      if (e.detalle?.runt) {
        const r = e.detalle.runt as { registrado?: boolean; tiene_licencia?: boolean; categorias?: { categoria: string }[] };
        const nombre = (e.detalle.nombre as { nuevo?: string } | undefined)?.nuevo;
        const lic = r.registrado === false ? "la cédula no aparece" : r.tiene_licencia ? `licencia ${[...new Set((r.categorias ?? []).map((c) => c.categoria))].join(", ")}` : "sin licencia";
        return `RUNT consultado: ${lic}${nombre ? ` · nombre: ${nombre}` : ""}`;
      }
      if (e.detalle?.listo_para_citar) {
        return e.detalle.falta_rnmc
          ? "Quedó «Listo para citar» · falta el RNMC (Croma no respondió): revisarlo a mano en el portal de la Policía"
          : "Quedó «Listo para citar»";
      }
      if (e.detalle?.aviso_no_seleccionado) {
        const aviso = e.detalle.aviso as string | undefined;
        return `Se le avisó que no continúa en el proceso (sin el motivo)${aviso === "borrador" ? " · como borrador (ventana cerrada)" : ""}`;
      }
      if (e.detalle?.revision_reingreso) return "Trabajó antes en la empresa: reingreso para revisión de una persona";
      if (e.detalle?.revision_antecedentes) {
        const aviso = e.detalle.aviso as string | undefined;
        return `Antecedentes para revisión de una persona${aviso === "enviado" ? " · se le avisó al aspirante" : aviso === "borrador" ? " · aviso como borrador (ventana cerrada)" : ""}`;
      }
      if (e.detalle?.rnmc) {
        const r = e.detalle.rnmc as { fecha_coincide?: boolean; medidas_pendientes?: boolean | null };
        return r.fecha_coincide === false
          ? "RNMC: la fecha de expedición no coincide con la cédula"
          : `RNMC consultado: ${r.medidas_pendientes ? "con medidas correctivas pendientes" : "sin medidas pendientes"}`;
      }
      if (e.detalle?.antecedente) {
        const a = e.detalle.antecedente as { fuente?: string; hallazgo?: boolean | null };
        return `${FUENTE[a.fuente ?? ""] ?? a.fuente} consultada: ${a.hallazgo ? "con antecedentes" : a.hallazgo === false ? "sin antecedentes" : "sin veredicto"}`;
      }
      if (e.detalle?.policia) {
        const nombre = (e.detalle.nombre as { nuevo?: string } | undefined)?.nuevo;
        return `Policía consultada${nombre ? ` · nombre: ${nombre}` : ""}`;
      }
      return "Actualizó el proceso";
    }
  }
}

const FUENTE: Record<string, string> = {
  runt: "RUNT",
  simit: "SIMIT",
  policia: "Policía (antecedentes)",
  rnmc: "RNMC (medidas correctivas)",
  procuraduria: "Procuraduría (disciplinarios)",
  contraloria: "Contraloría (fiscales)",
};

/** Una línea por consulta: estado y lo principal de lo que devolvió. */
function resumirConsulta(c: ConsultaExternaVista): string {
  if (c.estado === "reiniciada") return "anterior al reinicio del chat de prueba (no cuenta)";
  if (c.estado === "pendiente") return "en curso en Croma";
  if (c.estado === "error") return `falló${c.error ? `: ${c.error}` : ""}`;
  if (c.fuente === "simit") return c.valor != null ? `$${Number(c.valor).toLocaleString("es-CO")} en comparendos` : c.estado;
  if (c.fuente === "procuraduria" || c.fuente === "contraloria") {
    const h = hallazgoDe(c.fuente, c.resultado);
    return h == null ? c.estado : h ? "con antecedentes" : "sin antecedentes";
  }
  if (c.fuente === "rnmc") {
    const r = c.resultado as { has_pending_measures?: boolean | null; pending_measures?: unknown[] | null } | null;
    if (r?.has_pending_measures === true) {
      const n = r.pending_measures?.length ?? 0;
      return `${n || "con"} ${n === 1 ? "medida correctiva pendiente" : "medidas correctivas pendientes"}`;
    }
    return r?.has_pending_measures === false ? "sin medidas correctivas pendientes" : c.estado;
  }
  if (c.fuente === "policia") {
    const r = c.resultado as { full_name?: string | null; has_records?: boolean | null } | null;
    const ant = r?.has_records === true ? "con asuntos pendientes" : r?.has_records === false ? "sin asuntos pendientes" : "sin dato de antecedentes";
    return `${r?.full_name ?? "sin nombre"} · ${ant}`;
  }
  if (c.fuente === "runt") {
    const r = c.resultado as { found?: boolean; person?: { full_name?: string | null } | null; licenses?: unknown[] | null } | null;
    if (r?.found === false) return "la cédula no aparece en el RUNT";
    const n = r?.licenses?.length ?? 0;
    return `${r?.person?.full_name ?? "sin nombre"} · ${n} ${n === 1 ? "licencia" : "licencias"}`;
  }
  return c.estado;
}

export function PanelSeleccion({ proceso, puedeEditar, onCerrado }: { proceso: ProcesoContratacion; puedeEditar: boolean; onCerrado: () => void }) {
  const router = useRouter();
  const [eventos, setEventos] = useState<EventoProcesoVista[] | null>(null);
  const [anteriores, setAnteriores] = useState<PostulacionAnterior[]>([]);
  const [consultas, setConsultas] = useState<ConsultaExternaVista[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoProceso[]>([]);
  const [vinculo, setVinculo] = useState<VinculoEmpresa | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  useEffect(() => {
    let vivo = true;
    listarEventosProceso(proceso.id).then((e) => vivo && setEventos(e)).catch(() => vivo && setEventos([]));
    postulacionesAnteriores({ procesoId: proceso.id, cedula: proceso.cedula, telefono: proceso.celular })
      .then((a) => vivo && setAnteriores(a))
      .catch(() => undefined);
    listarConsultasExternas(proceso.id)
      .then((c) => vivo && setConsultas(c))
      .catch(() => undefined);
    listarDocumentosProceso(proceso.id)
      .then((d) => vivo && setDocumentos(d))
      .catch(() => undefined);
    vinculoEmpresaProceso(proceso.id)
      .then((v) => vivo && setVinculo(v))
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
          {proceso.origen === "chat_prueba" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              <Bot className="h-3 w-3" /> Guardado desde el chat de prueba
            </span>
          )}
        </div>
        {pre ? <SemaforoDetalle resultado={pre} /> : <p className="text-sm text-gray-500">Sin evaluar todavía: guarde el proceso para calcular el semáforo.</p>}

        {abierto && pre?.global === "no_cumple" && causa && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="flex items-center gap-2 text-sm text-red-700">
              <TriangleAlert className="h-4 w-4 shrink-0" /> Se propone cerrar: {causa}
              {(proceso.origen === "whatsapp_agente" || proceso.origen === "chat_prueba") && (
                <span className="text-xs font-normal"> · si no cambia, se cierra solo a los 30 minutos</span>
              )}
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
          {proceso.cedula_fecha_expedicion && (
            <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">
              Cédula expedida el{" "}
              {new Date(`${proceso.cedula_fecha_expedicion.slice(0, 10)}T00:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })}
            </span>
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

      {vinculo && (
        <section className={`rounded-lg border p-3 ${vinculo.tipo === "activo" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
          <h4 className="mb-1 text-sm font-semibold text-gray-900">
            {vinculo.tipo === "activo" ? "Ya trabaja en la empresa" : "Trabajó antes en la empresa · reingreso para revisión"}
          </h4>
          <p className="text-sm text-gray-700">{resumenVinculo(vinculo)}</p>
          {vinculo.tipo === "retirado" && abierto && (
            <p className="mt-1 text-xs text-gray-600">
              No queda «Listo para citar» solo: una persona decide si sigue (citarlo) o no (cerrar, por ejemplo con «No aprobado reintegro»). Está en el filtro «Reingresos por revisar».
            </p>
          )}
        </section>
      )}

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

      {documentos.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">Documentos recibidos</h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {documentos.map((d) => (
              <li key={d.id} className="rounded-lg border border-[#F1F5F9] p-2 text-xs text-gray-700">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {d.tipo === "image" ? "Foto" : d.tipo === "audio" ? "Audio" : d.tipo === "video" ? "Video" : (d.nombre ?? "Documento")}
                    {d.origen === "chat_prueba" ? " (chat de prueba)" : ""}
                  </span>
                  <span className="text-gray-400">{fechaHora(d.fecha)}</span>
                </div>
                {d.url && d.tipo === "image" ? (
                  <a href={d.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada del bucket privado */}
                    <img src={d.url} alt="Documento recibido" className="mt-1 max-h-40 rounded" />
                  </a>
                ) : d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[#4F46E5]">
                    Abrir <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
                {d.lectura && <p className="mt-1 text-gray-600">Lectura automática: {d.lectura}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {consultas.some((c) => c.fuente in NOMBRE_FUENTE) && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">Antecedentes</h4>
          {(() => {
            const ev = evaluarAntecedentes(consultas as ConsultaGuardada[]);
            const color = ev.resultado === "limpio" ? "text-emerald-700" : ev.resultado === "hallazgo" ? "text-red-700" : "text-amber-700";
            return (
              <>
                <p className={`text-sm font-medium ${color}`}>
                  {ev.resultado === "limpio"
                    ? "Sin antecedentes en las cuatro fuentes."
                    : ev.resultado === "hallazgo"
                      ? "Tiene antecedentes: queda para revisión de una persona de Gestión Humana (se le avisó al aspirante que lo contactarán)."
                      : "Faltan fuentes por consultar."}
                </p>
                <ul className="mt-1 flex flex-wrap gap-2 text-xs">
                  {ev.fuentes.map((f) => (
                    <li key={f.fuente} className="rounded-full bg-gray-100 px-2 py-1 text-gray-700" title={f.detalle ?? undefined}>
                      {NOMBRE_FUENTE[f.fuente]}:{" "}
                      {f.estado === "limpio" ? "limpio" : f.estado === "hallazgo" ? "con hallazgo" : f.estado === "pendiente" ? "en curso" : f.estado === "error" ? "sin veredicto" : "sin consultar"}
                    </li>
                  ))}
                </ul>
              </>
            );
          })()}
        </section>
      )}

      {consultas.length > 0 && (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Search className="h-4 w-4" /> Consultas a Croma
          </h4>
          <ul className="space-y-1.5 text-sm">
            {consultas.map((c) => (
              <li key={c.id} className="rounded-lg border border-[#F1F5F9] px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-2 text-gray-700">
                  <span className="text-xs text-gray-400">{fechaHora(c.created_at)}</span>
                  <span className="font-medium">{FUENTE[c.fuente] ?? c.fuente.toUpperCase()}</span>
                  <span className="text-xs text-gray-500">{resumirConsulta(c)}</span>
                </div>
                {interpretarConsulta(c.fuente, c.resultado).length > 0 && (
                  <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr]">
                    {interpretarConsulta(c.fuente, c.resultado).map((x, i) => (
                      <div key={i} className="contents">
                        <dt className="text-gray-500">{x.etiqueta}</dt>
                        <dd className={x.alerta ? "font-medium text-red-700" : "text-gray-800"}>{x.valor}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {c.resultado != null && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-[#4F46E5]">Ver la respuesta completa de {c.proveedor === "croma" ? "Croma" : c.proveedor}</summary>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-gray-50 p-2 text-[11px] leading-snug text-gray-700">{JSON.stringify(c.resultado, null, 2)}</pre>
                  </details>
                )}
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
