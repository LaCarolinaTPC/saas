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
import { SeccionCitas } from "./seccion-citas";
import { RevisionManual, type FuentePendiente } from "./revision-manual";
import { SeccionAntecedentes } from "./seccion-antecedentes";
import { SeccionCarpeta, SeccionContratacion, SeccionExamenesRutas } from "./seccion-entrega3";
import { SeccionDiaContratacion, SeccionDocumentosLeidos } from "./seccion-entrega4";
import { SeccionExperiencia } from "./seccion-experiencia";
import { fechaEnTexto, horaEnTexto } from "@/lib/seleccion/agenda";
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
      if (e.detalle?.reabierto) return `Reabierto: volvió a escribir después del cierre («${String(e.detalle.causa_anterior ?? "")}») · queda para que una persona lo llame`;
      return `${label(e.estado_anterior)} → ${label(e.estado_nuevo)}${e.causa ? ` (${e.causa})` : ""}${e.detalle?.falta_simit ? " · sin el SIMIT (Croma no respondió): revisarlo a mano" : ""}${
        e.detalle?.contratado_con_excepcion ? ` · contratado con excepción: ${String(e.detalle.justificacion ?? "")}` : ""
      }`;
    case "preseleccion": {
      const g = (e.detalle?.global as string) ?? "";
      return g === "pasa" ? "Preselección: cumple los 4 requisitos" : g === "no_cumple" ? `Preselección: no cumple (${e.causa ?? "—"})` : "Preselección: faltan datos";
    }
    case "autorizacion":
      return e.detalle?.respuesta === "si" ? "Autorizó el tratamiento de datos" : "No autorizó el tratamiento de datos";
    case "cita":
      return describirCita(e.detalle ?? {});
    case "prueba":
      return describirProfesor(e.detalle ?? {});
    case "examen_medico": {
      const d = e.detalle ?? {};
      return `Exámenes, fase ${String(d.fase ?? "")}: ${d.resultado === "apto" ? "apto" : "no apto"}${d.observacion ? ` · ${String(d.observacion)}` : ""}`;
    }
    case "carpeta": {
      const d = e.detalle ?? {};
      if (d.item) return `Carpeta: ${String(d.item)} · ${d.estado === "validado" ? "validado" : d.estado === "recibido" ? "recibido" : "pendiente"}`;
      if (d.archivo) return `Subió un archivo: ${String(d.archivo)}`;
      if (d.archivo_anulado) return `Anuló el archivo ${String(d.archivo_anulado)}: ${String(d.motivo ?? "")}`;
      if (d.referencia_validada) return `Validó la referencia de ${String(d.referencia_validada)} (habló con ${String(d.hablo_con ?? "")})`;
      if (d.referencia) return `Agregó la referencia ${d.tipo === "personal" ? "personal" : "laboral"} de ${String(d.referencia)}`;
      return "Carpeta";
    }
    case "examen": {
      // Prueba psicosensotécnica (src/lib/psicosensotecnica). Sin puntajes: el
      // historial lo ve quien no tiene el módulo de la psicóloga.
      const d = e.detalle ?? {};
      if (d.accion === "asignada") return "Prueba psicosensotécnica asignada";
      if (d.accion === "presentada") return "Presentó la prueba psicosensotécnica · pendiente del concepto de psicología";
      if (d.accion === "concepto") return `Prueba psicosensotécnica: ${d.concepto === "apto" ? "apto" : "no apto"}`;
      if (d.accion === "anulada") return "Prueba psicosensotécnica anulada";
      return "Prueba psicosensotécnica";
    }
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
        const NOMBRE: Record<string, string> = {
          rnmc: "el RNMC",
          simit: "el SIMIT",
          runt: "la licencia en el RUNT",
          policia: "los antecedentes de la Policía",
          procuraduria: "la Procuraduría",
          contraloria: "la Contraloría",
        };
        const lista = Array.isArray(e.detalle.faltan)
          ? (e.detalle.faltan as string[])
          : [e.detalle.falta_rnmc ? "rnmc" : null, e.detalle.falta_simit ? "simit" : null].filter((x): x is string => !!x);
        const faltan = lista.map((f) => NOMBRE[f] ?? f);
        return faltan.length
          ? `Quedó «Listo para citar» · falta revisar a mano ${faltan.join(", ")}: Croma no respondió. No se cita solo`
          : "Quedó «Listo para citar»";
      }
      if (e.detalle?.aviso_no_seleccionado) {
        const aviso = e.detalle.aviso as string | undefined;
        return `Se le avisó que no continúa en el proceso (sin el motivo)${aviso === "borrador" ? " · como borrador (ventana cerrada)" : ""}`;
      }
      if (e.detalle?.revision_manual) {
        const r = e.detalle.revision_manual as { fuente?: string; hallazgo?: boolean; valor?: number | null; nota?: string | null; pdf?: boolean };
        const que = r.fuente === "simit" ? `$${Number(r.valor ?? 0).toLocaleString("es-CO")}` : r.hallazgo ? "con hallazgo" : "sin novedad";
        return `Revisión manual de ${FUENTE[r.fuente ?? ""] ?? r.fuente}: ${que}${r.nota ? ` · ${r.nota}` : ""}${r.pdf ? " · con certificado en PDF" : ""}`;
      }
      if (e.detalle && "aprobacion_contratacion" in e.detalle) {
        return e.detalle.aprobacion_contratacion ? "Dio el visto bueno para contratar" : "Retiró el visto bueno para contratar";
      }
      if (e.detalle?.decision_antecedentes) {
        const j = e.detalle.justificacion as string | undefined;
        return `Antecedentes: ${e.detalle.decision_antecedentes === "aprobado" ? "aprobó seguir con el proceso" : "rechazó al aspirante"}${j ? ` · ${j}` : ""}`;
      }
      if (e.detalle?.revision_reingreso) return "Trabajó antes en la empresa: reingreso para revisión de una persona";
      if (e.detalle?.revision_antecedentes) {
        const aviso = e.detalle.aviso as string | undefined;
        return `${e.detalle.propone_cierre ? "Antecedentes: las reglas proponen el cierre; lo confirma una persona" : "Antecedentes para revisión de una persona"}${aviso === "enviado" ? " · se le avisó al aspirante" : aviso === "borrador" ? " · aviso como borrador (ventana cerrada)" : ""}`;
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

const ENVIO: Record<string, string> = {
  enviado: " · mensaje enviado",
  borrador: " · mensaje como borrador en la bandeja",
  prueba: " · mensaje en el chat de prueba",
  sin_conversacion: " · sin WhatsApp: avisar por otro medio",
  sin_plantilla: " · mensaje sin enviar (sin plantilla)",
  falta_dato: " · mensaje sin enviar (falta un dato)",
  fallido: " · WhatsApp rechazó el mensaje",
};

function describirCita(d: Record<string, unknown>): string {
  const cuando = typeof d.fecha === "string" && typeof d.hora === "string" ? `${fechaEnTexto(d.fecha)} a las ${horaEnTexto(d.hora)}` : "";
  const envio = ENVIO[String(d.envio ?? "")] ?? "";
  switch (d.accion) {
    case "citado":
      return `Citado a la prueba de manejo: ${cuando}${envio}`;
    case "reprogramada":
      return `Cita reprogramada por ${d.por === "empresa" ? "la empresa" : "el aspirante"}: ${cuando}${envio}`;
    case "confirmada":
      return `Confirmó la cita del ${cuando}`;
    case "pide_otra_fecha":
      return `Pidió otra fecha para la cita del ${cuando}`;
    case "llego":
      return "Llegó a la cita";
    case "no_asistio":
      return `No asistió a la cita del ${cuando}`;
    case "deshacer_no_asistio":
      return "Se corrigió el «No asistió»: la cita sigue en pie";
    case "recordatorio":
      return `Recordatorio de la cita${envio}`;
    case "alerta_no_confirmo":
      return "No ha confirmado la cita: llamar";
    default:
      return "Cita actualizada";
  }
}

const RESULTADO_PROFESOR: Record<string, string> = {
  aprobo: "pasa a exámenes",
  escuela: "va a escuela",
  no_continua: "no continúa",
  sigue: "sigue en escuela",
  listo: "listo, pasa a exámenes",
  aprendida: "aprendida",
  repetir: "debe repetirla",
};

function describirProfesor(d: Record<string, unknown>): string {
  const res = RESULTADO_PROFESOR[String(d.resultado ?? "")] ?? "";
  const obs = typeof d.observacion === "string" && d.observacion ? ` · ${d.observacion}` : "";
  switch (d.accion) {
    case "prueba_manejo":
      return `Prueba de manejo: ${res}${obs}`;
    case "clase_escuela":
      if (d.falto) return `No llegó a la clase de escuela${d.resultado === "no_continua" ? ": no continúa" : ""}${obs}`;
      return `Clase de escuela: ${res}${d.clases_faltantes != null ? ` · le faltan ${String(d.clases_faltantes)}` : ""}${obs}`;
    case "reconocimiento_ruta":
      return `Reconocimiento de ruta ${String(d.ruta ?? "")}: ${res}${obs}`;
    case "rutas_completas":
      return `Rutas completas (${String(d.rutas ?? "")} de ${String(d.minimas ?? "")})`;
    case "observacion":
      return `Observación del profesor${obs}`;
    case "concepto":
      return `Concepto del profesor: ${d.concepto === "acepta" ? "lo acepta" : "no lo acepta"}${obs}`;
    default:
      return "Registro del profesor";
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
  if (c.proveedor === "manual") {
    const r = (c.resultado ?? {}) as { nota?: string | null };
    const h = c.fuente === "simit" ? null : hallazgoDe(c.fuente as never, c.resultado);
    const que = c.fuente === "simit" ? `$${Number(c.valor ?? 0).toLocaleString("es-CO")} en comparendos` : h ? "con hallazgo" : "sin novedad";
    return `${que}${r.nota ? ` · ${r.nota}` : ""} · ${c.consultado_por ?? ""}`;
  }
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

type Pestana = "resumen" | "citas" | "croma" | "documentos" | "contratacion" | "historial";

export function PanelSeleccion({
  proceso,
  puedeEditar,
  onCerrado,
  sinCitas = false,
  conPestanas = true,
  modoCitas = "real",
  version = 0,
}: {
  proceso: ProcesoContratacion;
  puedeEditar: boolean;
  onCerrado: () => void;
  /** Sin la pestaña «Citas y profesor». */
  sinCitas?: boolean;
  /** En pestañas (ficha y perfil del candidato); si no, todo seguido. */
  conPestanas?: boolean;
  /** «prueba»: el chat de prueba lee las citas y lo del profesor con sus propias acciones. */
  modoCitas?: "real" | "prueba";
  /** Cambia para volver a leer las citas y lo del profesor. */
  version?: number;
}) {
  const router = useRouter();
  const [eventos, setEventos] = useState<EventoProcesoVista[] | null>(null);
  const [anteriores, setAnteriores] = useState<PostulacionAnterior[]>([]);
  const [consultas, setConsultas] = useState<ConsultaExternaVista[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoProceso[]>([]);
  const [vinculo, setVinculo] = useState<VinculoEmpresa | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  // Cambia al guardar una revisión manual, para volver a leer consultas e historial.
  const [recarga, setRecarga] = useState(0);
  const [pestana, setPestana] = useState<Pestana>("resumen");
  const ver = (p: Pestana) => !conPestanas || pestana === p;

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
  }, [proceso.id, proceso.cedula, proceso.celular, recarga, version]);

  // Fuentes que Croma no respondió (falló o sigue en curso) y que una persona puede revisar a mano.
  const abiertoParaRevisar = proceso.estado !== "cierre" && proceso.estado !== "contratado";
  const pendientesCroma: FuentePendiente[] = [];
  // Fuentes con un hallazgo de Croma: también se pueden revisar a mano, para corregirlo con el certificado oficial.
  const conHallazgo: FuentePendiente[] = [];
  if (abiertoParaRevisar && consultas.length > 0) {
    const vivas = consultas.filter((c) => c.estado !== "reiniciada");
    const motivo = (estado: string, detalle: string | null) => (estado === "pendiente" ? "Sigue en curso en Croma" : estado === "error" ? `Falló${detalle ? `: ${detalle}` : ""}` : "Sin consultar todavía");
    if (vivas.some((c) => c.fuente in NOMBRE_FUENTE)) {
      for (const f of evaluarAntecedentes(vivas as ConsultaGuardada[]).fuentes) {
        if (f.estado === "error" || f.estado === "pendiente") pendientesCroma.push({ fuente: f.fuente, motivo: motivo(f.estado, f.detalle) });
        else if (f.estado === "hallazgo") conHallazgo.push({ fuente: f.fuente, conHallazgo: true, motivo: "Trae un hallazgo: si lo revisó en el portal oficial, registre aquí lo que encontró" });
      }
    }
    const simit = vivas.find((c) => c.fuente === "simit");
    if (!proceso.simit && simit && (simit.estado === "error" || simit.estado === "pendiente")) {
      pendientesCroma.unshift({ fuente: "simit", motivo: motivo(simit.estado, simit.error) });
    }
  }

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

  const vivas = consultas.filter((c) => c.estado !== "reiniciada");
  const pestanas: { id: Pestana; texto: string; aviso?: boolean }[] = [
    { id: "resumen", texto: "Resumen" },
    ...(sinCitas ? [] : [{ id: "citas" as Pestana, texto: "Citas y profesor" }]),
    // La pestaña se llamaba «Croma»: ahora empieza por los antecedentes y sus reglas, y debajo van las consultas.
    { id: "croma", texto: `Antecedentes (${vivas.length})`, aviso: pendientesCroma.length > 0 },
    { id: "documentos", texto: "Carpeta" },
    // Entrega 4: psicotécnica, entrevista e inducción.
    ...(sinCitas ? [] : [{ id: "contratacion" as Pestana, texto: "Día de contratación" }]),
    { id: "historial", texto: `Historial${eventos ? ` (${eventos.length})` : ""}` },
  ];

  return (
    <div className="mt-6 space-y-5 border-t border-[#F1F5F9] pt-5">
      {conPestanas && (
        <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-[#E2E8F0] px-1" aria-label="Secciones del proceso">
          {pestanas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPestana(p.id)}
              className={`relative shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                pestana === p.id ? "border-[#4F46E5] text-[#4F46E5]" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {p.texto}
              {p.aviso && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" title="Croma no respondió alguna fuente" />}
            </button>
          ))}
        </nav>
      )}

      {conPestanas && pestana === "resumen" && pendientesCroma.length > 0 && (
        <button
          type="button"
          onClick={() => setPestana("croma")}
          className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left text-sm text-red-800 hover:bg-red-100"
        >
          <TriangleAlert className="h-4 w-4 shrink-0" />
          Croma no respondió: {pendientesCroma.map((p) => FUENTE[p.fuente] ?? p.fuente).join(", ")}. Ver y revisar a mano →
        </button>
      )}

      {ver("resumen") && (
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
      )}

      {/* Experiencia laboral (sin verificar hasta la carta laboral o la llamada a la referencia) y referencias. */}
      {ver("resumen") && <SeccionExperiencia procesoId={proceso.id} version={recarga + version} />}

      {!sinCitas && ver("citas") && <SeccionCitas proceso={proceso} puedeEditar={puedeEditar} modo={modoCitas} version={version} onCitado={() => router.refresh()} />}
      {/* Entrega 3: exámenes médicos y rutas, después de lo del profesor. */}
      {!sinCitas && ver("citas") && <SeccionExamenesRutas procesoId={proceso.id} abierto={abierto} version={recarga + version} />}

      {ver("resumen") && vinculo && (
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

      {ver("resumen") && anteriores.length > 0 && (
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

      {!sinCitas && ver("contratacion") && <SeccionDiaContratacion procesoId={proceso.id} abierto={abierto} version={recarga + version} />}

      {/* Entrega 4: lo leído con IA, para aceptar, corregir o rechazar. */}
      {ver("documentos") && <SeccionDocumentosLeidos procesoId={proceso.id} version={recarga + version} />}
      {ver("documentos") && <SeccionCarpeta procesoId={proceso.id} version={recarga + version} />}
      {ver("documentos") && conPestanas && documentos.length === 0 && <p className="text-sm text-gray-500">Todavía no ha enviado documentos por WhatsApp.</p>}
      {ver("documentos") && documentos.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">Documentos recibidos por WhatsApp</h4>
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

      {ver("croma") && puedeEditar && (
        <RevisionManual
          procesoId={proceso.id}
          pendientes={[...pendientesCroma, ...conHallazgo]}
          onGuardado={() => {
            setRecarga((n) => n + 1);
            router.refresh();
          }}
        />
      )}
      {ver("croma") && !puedeEditar && pendientesCroma.length > 0 && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Croma no respondió: {pendientesCroma.map((p) => FUENTE[p.fuente] ?? p.fuente).join(", ")}. Gestivo sigue reintentando; una persona puede revisarlo a mano en la ficha.
        </p>
      )}

      {/* Entrega 3: qué le falta para contratar, en las últimas etapas. */}
      {ver("resumen") && (
        <SeccionContratacion procesoId={proceso.id} estado={proceso.estado} version={recarga + version} onCambio={() => { setRecarga((n) => n + 1); onCerrado(); }} />
      )}
      {/* En el Resumen, solo el veredicto; el detalle, las reglas y la decisión van en la pestaña «Antecedentes». */}
      {conPestanas && pestana === "resumen" && (
        <SeccionAntecedentes
          procesoId={proceso.id}
          abierto={abierto}
          puedeEditar={puedeEditar}
          version={recarga + version}
          compacta
          onCambio={() => setRecarga((n) => n + 1)}
          onVerDetalle={() => setPestana("croma")}
        />
      )}
      {ver("croma") && (
        <SeccionAntecedentes procesoId={proceso.id} abierto={abierto} puedeEditar={puedeEditar} version={recarga + version} onCambio={() => setRecarga((n) => n + 1)} />
      )}

      {ver("croma") && conPestanas && consultas.length === 0 && <p className="text-sm text-gray-500">Todavía no se ha consultado nada en Croma.</p>}
      {ver("croma") && consultas.length > 0 && (
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
                  {c.proveedor === "manual" && <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-medium text-[#4338CA]">Revisión manual</span>}
                  {c.proveedor === "simulado" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Simulado (chat de prueba)</span>}
                  {(c.estado === "error" || c.estado === "pendiente") && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">{c.estado === "error" ? "Error en Croma" : "En curso"}</span>
                  )}
                  <span className="text-xs text-gray-500">{resumirConsulta(c)}</span>
                  {c.pdf_url && (
                    <a href={c.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#4F46E5]">
                      Ver el certificado (PDF) <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
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

      {ver("historial") && (
      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <History className="h-4 w-4" /> Historial
        </h4>
        {eventos === null ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : eventos.length === 0 ? (
          <p className="text-sm text-gray-500">Sin cambios registrados.</p>
        ) : (
          <ol className={`space-y-1.5 text-sm ${conPestanas ? "" : "max-h-56 overflow-y-auto"}`}>
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
      )}
    </div>
  );
}
