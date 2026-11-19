"use client";

/**
 * Chat de prueba de la selección: simula todo el flujo sin enviar WhatsApp ni
 * guardar nada. Para ahorrar llamadas a la IA, cada mensaje cuesta UNA
 * llamada (la respuesta); la ficha «Así se vería en Candidatos» se lee sola.
 * La simulación de silencio no usa IA.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, Bot, Clapperboard, CornerUpLeft, FileText, Image as ImageIcon, Loader2, Mic, Paperclip, Play, Send, Smile, Timer,
} from "lucide-react";
import type { AgenteFormulario } from "@/lib/comunicaciones/agente/formulario";
import { CASOS, GRUPOS_CASOS, estimarLlamadas } from "@/lib/seleccion/evaluacion/casos";
import type { ProcesoContratacion } from "@/lib/contratacion/constants";
import type { ChequeoCaso, MensajeSimulado } from "@/lib/seleccion/simulacion";
import type { ResumenRunt } from "@/lib/verificacion/proveedores";
import { ESCENARIO_BASE, resumenEscenario, type EscenarioCroma } from "@/lib/seleccion/escenario-croma";
import { pareceAvisoDeRevision, type FechaRechazada } from "@/lib/comunicaciones/agente/motor";
import { combinarLecturas, fotosADescartar, resumenLectura, type LecturaCedula, type MotivoDescarte } from "@/lib/seleccion/lectura-cedula";
import {
  consultarCromaPrueba,
  consultarRuntPrueba,
  vinculoPrueba,
  correrCasoPrueba,
  fichaPrueba,
  guardarPruebaEnCandidatos,
  leerCedulaPrueba,
  guardarFotoPrueba,
  descartarFotoPrueba,
  type ResultadoLecturaPrueba,
  panelPrueba,
  recalcularPanel,
  botonesPlantillasPrueba,
  responderPrueba,
  simularSilencioPrueba,
  type PanelPrueba,
  type PasoSilencio,
} from "@/lib/seleccion/prueba-actions";
import { agendaSimuladaPrueba, candidatosDePrueba, respuestaCitaPrueba, simularCierreAutomaticoPrueba, type CandidatoDePrueba } from "@/lib/seleccion/prueba-profesor-actions";
import { estadoInfo } from "@/lib/contratacion/constants";
import { CitarDialog } from "./citar-dialog";
import { CITAR_PRUEBA } from "./acciones-prueba";
import { ETIQUETA_MENSAJE, EVENTO_PRUEBA, avisarPrueba, textoEnvio, type AvisoPrueba } from "./profesor-tipos";
import { FichaPrueba } from "./ficha-prueba";
import { LecturaCedulaPanel } from "./lectura-cedula-panel";

type Motivo = "frase" | "marca" | "rechazo" | "vacio";
interface MensajeChat extends MensajeSimulado {
  id: number;
  meta?: string;
  /** Vista previa de una foto subida de verdad (data URL), solo para mostrarla. */
  imagen?: string;
  /** Cuándo se escribió (para la hora del globo). */
  at?: number;
  /** Botones de respuesta rápida de la plantilla (como los muestra WhatsApp). */
  botones?: string[];
}

/**
 * Reduce la foto en el navegador (máx. 1280 px por lado, JPEG): una foto de
 * celular pesa varios MB y la acción del servidor admite poco; además, menos
 * píxeles es menos costo de lectura.
 */
async function reducirFoto(archivo: File): Promise<{ dataUrl: string; base64: string }> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo abrir la foto."));
      i.src = url;
    });
    const escala = Math.min(1, 1280 / Math.max(img.width, img.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext("2d")!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    // Las acciones del servidor admiten 1 MB: se baja la calidad hasta que quepa.
    let dataUrl = lienzo.toDataURL("image/jpeg", 0.85);
    for (const calidad of [0.75, 0.65, 0.55, 0.45]) {
      if (dataUrl.length < 900_000) break;
      dataUrl = lienzo.toDataURL("image/jpeg", calidad);
    }
    return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  } finally {
    URL.revokeObjectURL(url);
  }
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

const FRASE_INICIAL = "Hola, vi el anuncio de conductor";

/** Como en WhatsApp: *texto* se ve en negrita. */
function conNegritas(texto: string): ReactNode[] {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
    /^\*[^*\n]+\*$/.test(parte) ? <strong key={i}>{parte.slice(1, -1)}</strong> : parte
  );
}

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

const boton =
  "flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-1.5 text-xs text-text-secondary hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed";

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`;

/** Cómo se comporta Gestivo en este chat (se elige al abrirlo, en «Nuevo chat»). */
export interface ConfigChatPrueba {
  /** Consultar Croma de verdad; si no, se simula con `escenario`. */
  cromaReal: boolean;
  /** Guardar el aspirante en Candidatos (origen «chat_prueba»). */
  guardar: boolean;
  escenario: EscenarioCroma;
}

/** Lo que la lista de chats muestra de cada uno. */
export interface ResumenChatPrueba {
  nombre: string | null;
  ultimo: string | null;
  ultimoAt: number | null;
  estado: string | null;
  guardado: boolean;
  probando: boolean;
  transferido: boolean;
}

const CONFIG_BASE: ConfigChatPrueba = { cromaReal: false, guardar: true, escenario: ESCENARIO_BASE };

export function ChatPrueba({
  formulario,
  config = CONFIG_BASE,
  numero = 1,
  activo = true,
  onVolver,
  onResumen,
  profesor,
}: {
  formulario?: AgenteFormulario;
  config?: ConfigChatPrueba;
  /** Número del chat en la lista («Aspirante 3»). */
  numero?: number;
  /** Es el chat que se ve (los demás siguen montados, ocultos). */
  activo?: boolean;
  /** En pantallas angostas: volver a la lista de chats. */
  onVolver?: () => void;
  onResumen?: (r: ResumenChatPrueba) => void;
  /** Pantalla del profesor (marco de celular), en la pestaña «Profesor» del panel lateral. */
  profesor?: ReactNode;
}) {
  const [lado, setLado] = useState<"candidato" | "profesor" | "pruebas">("candidato");
  const [citando, setCitando] = useState(false);
  const [chat, setChat] = useState<MensajeChat[]>([]);
  const [borrador, setBorrador] = useState(FRASE_INICIAL);
  const [probando, setProbando] = useState(false);
  const [transferencia, setTransferencia] = useState<{ turno: number; motivo: Motivo } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelPrueba | null>(null);
  // SIMIT para el semáforo mientras no haya consulta (el del escenario simulado).
  const [simit, setSimit] = useState(String(typeof config.escenario.simit === "number" ? config.escenario.simit : 0));
  // «Consultar Croma de verdad» (se elige al abrir el chat): como en el flujo real, al tener
  // cédula y autorización se consulta el RUNT (y luego el SIMIT) y el asistente lo usa.
  const cromaAuto = config.cromaReal;
  // La fecha de expedición del chat no corresponde a la cédula (RNMC): el asistente la vuelve a pedir.
  const [fechaRechazada, setFechaRechazada] = useState<FechaRechazada | null>(null);
  // Croma no respondió la verificación de la cédula: el asistente no dice que ya revisamos.
  const [verificacionDemorada, setVerificacionDemorada] = useState(false);
  // Fechas rechazadas en esta conversación (sin guardar), para contar los intentos.
  const fechasRechazadas = useRef<Set<string>>(new Set());
  const [runt, setRunt] = useState<ResumenRunt | null>(null);
  const [simitCedula, setSimitCedula] = useState<string | null>(null);
  const [estadoCroma, setEstadoCroma] = useState<string | null>(null);
  // Lectura de la foto de la cédula con el modelo del asistente (prueba de la entrega 4).
  const [lectura, setLectura] = useState<
    { estado: "leyendo" } | { estado: "error"; error: string } | { estado: "ok"; resultado: Extract<ResultadoLecturaPrueba, { ok: true }> } | null
  >(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  // Fotos que van a la ficha con «Guardar en Candidatos». Como en WhatsApp, las
  // de la cédula que no sirven (ilegibles o reemplazadas por otra mejor) no se guardan.
  const fotosPrueba = useRef<{ base64: string; resumen: string; lectura: LecturaCedula | null; ruta: string | null; subiendo: boolean }[]>([]);
  const [descarteFoto, setDescarteFoto] = useState<string | null>(null);
  // Apellidos con que se consultó el RUNT sin guardar: si cambian, se vuelve a consultar.
  const runtApellidos = useRef<string | null>(null);
  /** Nombres y apellidos de la foto de la cédula de esta conversación con ese número (para el RUNT). */
  const fotoCedulaDe = (cedula: string | null | undefined): { nombres: string | null; apellidos: string | null } | null => {
    const limpia = (cedula ?? "").replace(/\D/g, "");
    const f = [...fotosPrueba.current].reverse().find((x) => x.lectura?.esCedula && x.lectura.numero === limpia && x.lectura.apellidos);
    return f?.lectura ? { nombres: f.lectura.nombres, apellidos: f.lectura.apellidos } : null;
  };
  // «Guardar en Candidatos» (se elige al abrir el chat): va por el flujo real y deja el caso guardado (origen «chat_prueba»).
  const guardar = config.guardar;
  // Casilla «Reconsultar en Croma» (activada por defecto): en cada conversación nueva,
  // la primera vez que aparece una cédula su candidato de prueba se reinicia (el mismo
  // candidato, con «Reiniciado» en la línea de tiempo) y Croma se consulta de nuevo.
  // Así se prueban casos distintos con la misma cédula.
  // (18-nov-2026) Ya no hay casilla: el candidato siempre se reinicia en una conversación
  // nueva, pero Croma no se vuelve a consultar: se reutiliza lo consultado bien en los
  // últimos días (ajuste «croma_cache_dias»). Lo que había dado error sí se consulta.
  const reconsultar = true;
  const cedulasReconsultadas = useRef<Set<string>>(new Set());
  // Ficha guardada desde el chat (con «Guardar en Candidatos»), releída tras cada mensaje.
  const [procesoPrueba, setProcesoPrueba] = useState<ProcesoContratacion | null>(null);
  // RNMC consultado sin guardar: la clave «cédula|fecha» evita repetir la consulta.
  const [rnmc, setRnmc] = useState<{ clave: string; texto: string; nombre: string | null } | null>(null);
  const [fichaVersion, setFichaVersion] = useState(0);
  const [hora, setHora] = useState("");
  const [silencio, setSilencio] = useState<{ horas: number; pasos: PasoSilencio[]; horario: string } | null>(null);
  const [casoId, setCasoId] = useState(CASOS[0].id);
  const [revision, setRevision] = useState<{ titulo: string; aprobado: boolean; chequeos: ChequeoCaso[] } | null>(null);
  const idRef = useRef(0);
  const finRef = useRef<HTMLDivElement>(null);
  // Entrega 2: lo que Gestivo hizo con la respuesta a la cita y lo que haría el cron a la hora simulada.
  const [notaCita, setNotaCita] = useState<string | null>(null);
  const [agendaSimulada, setAgendaSimulada] = useState<string | null>(null);
  // Candidatos de prueba ya guardados: se pueden citar sin repetir la conversación.
  const [guardados, setGuardados] = useState<CandidatoDePrueba[]>([]);
  const [elegidoGuardado, setElegidoGuardado] = useState("");
  useEffect(() => {
    candidatosDePrueba()
      .then(setGuardados)
      .catch(() => undefined);
  }, []);
  async function usarGuardado(id: string) {
    const f = await fichaPrueba(id).catch(() => null);
    if (!f) return setError("No se pudo abrir ese candidato de prueba.");
    setProcesoPrueba(f);
    setFichaVersion((n) => n + 1);
  }
  const procesoIdRef = useRef<string | null>(null);
  // Botones de las plantillas de Meta por mensaje del catálogo (citación, recordatorio…).
  const botonesRef = useRef<Record<string, string[]>>({});
  useEffect(() => {
    void botonesPlantillasPrueba()
      .then((b) => {
        botonesRef.current = b;
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    procesoIdRef.current = procesoPrueba?.id ?? null;
  }, [procesoPrueba]);
  const activoRef = useRef(activo);
  useEffect(() => {
    activoRef.current = activo;
  }, [activo]);

  // Avisos de la agenda y del profesor de prueba (misma página): el mensaje que
  // le llegaría al aspirante entra al chat, y la ficha se vuelve a leer.
  useEffect(() => {
    const alAviso = (e: Event) => {
      const d = (e as CustomEvent<AvisoPrueba>).detail;
      // Con varios chats abiertos, cada mensaje va solo al chat de su candidato.
      if (d?.procesoId && d.procesoId !== procesoIdRef.current) return;
      const texto = d?.texto;
      if (texto && (d.procesoId || activoRef.current)) {
        const meta = `${d.etiqueta ?? "Mensaje de Gestivo"} · en el flujo real sale por WhatsApp`;
        const botones = d.clave ? botonesRef.current[d.clave] : undefined;
        setChat((c) => [...c, { id: ++idRef.current, direccion: "saliente", contenido: texto, mediaTipo: null, meta, at: Date.now(), botones }]);
      }
      const id = procesoIdRef.current;
      if (!id) return;
      void fichaPrueba(id)
        .then((f) => {
          if (!f) return;
          setProcesoPrueba(f);
          setFichaVersion((n) => n + 1);
        })
        .catch(() => undefined);
    };
    window.addEventListener(EVENTO_PRUEBA, alAviso);
    return () => window.removeEventListener(EVENTO_PRUEBA, alAviso);
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chat.length, probando]);

  const ultimoMensaje = chat[chat.length - 1];
  const nombreChat = procesoPrueba?.nombre ?? null;
  useEffect(() => {
    onResumen?.({
      nombre: nombreChat,
      ultimo: ultimoMensaje ? `${ultimoMensaje.direccion === "saliente" ? "IA: " : ""}${ultimoMensaje.contenido || (ultimoMensaje.mediaTipo ? "📎 Archivo" : "")}` : null,
      ultimoAt: ultimoMensaje?.at ?? null,
      estado: procesoPrueba?.estado ?? null,
      guardado: !!procesoPrueba,
      probando,
      transferido: !!transferencia,
    });
    // onResumen cambia en cada render del padre; basta con avisar cuando cambia lo mostrado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimoMensaje, nombreChat, procesoPrueba?.estado, probando, transferencia]);

  const simitNum = simit.trim() === "" ? null : Number(simit.replace(/\D/g, ""));
  const opciones = () => ({
    formulario,
    simit: simitNum,
    ahora: hora ? new Date(hora).toISOString() : null,
    runt,
    renovaraLicencia: panel?.extraido?.renovara_licencia ?? null,
    cedula: panel?.extraido?.cedula ?? null,
    fechaRechazada,
    verificacionDemorada,
    procesoId: procesoPrueba?.id ?? null,
  });
  const caso = useMemo(() => CASOS.find((c) => c.id === casoId)!, [casoId]);
  const esperaRespuesta = chat.length > 0 && chat[chat.length - 1].direccion === "entrante";
  const nuevo = (m: MensajeSimulado & { meta?: string }): MensajeChat => ({ ...m, id: ++idRef.current, at: Date.now() });
  const sinId = (c: MensajeChat[]): MensajeSimulado[] =>
    c.map(({ direccion, contenido, mediaTipo, lectura }) => ({ direccion, contenido, mediaTipo, ...(lectura ? { lectura } : {}) }));

  async function responder(conversacion: MensajeChat[]) {
    setProbando(true);
    setError(null);
    const r = await responderPrueba(sinId(conversacion), opciones()).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setProbando(false);
    if (!r.ok) return setError(r.error);
    const meta = r.modelo ? `${r.modelo} · ${(r.ms / 1000).toFixed(1)} s` : "Sin consultar al modelo";
    const respuesta = r.texto ? nuevo({ direccion: "saliente", contenido: r.texto, mediaTipo: null, meta }) : null;
    if (respuesta) setChat((c) => [...c, respuesta]);
    if (r.reprogramada) {
      setNotaCita("Gestivo: el asistente movió la cita al día que eligió el aspirante.");
      avisarPrueba();
    }
    if (r.motivo) setTransferencia({ turno: conversacion.filter((m) => m.direccion === "entrante").length, motivo: r.motivo });
    const conRespuesta = respuesta ? [...conversacion, respuesta] : conversacion;
    const aviso = !!respuesta && pareceAvisoDeRevision(respuesta.contenido);
    // Los datos se leen después de cada respuesta, como en el flujo real, para
    // que «Así se vería en Candidatos» quede al día.
    const rev = await revisarCroma(conRespuesta);
    if (r.motivo || !respuesta) return;
    // Como en el flujo real: si avisó que estaba revisando (o el RUNT trae algo
    // que decirle), terminada la revisión el asistente escribe por su cuenta.
    const hayQueDecir = (!!rev?.revisado && !!rev.runt && rev.licenciaColor !== "verde") || !!rev?.fechaNueva;
    const fechaActual = rev && "fechaRechazada" in rev ? rev.fechaRechazada ?? null : fechaRechazada;
    const demoradaActual = rev && "verificacionDemorada" in rev ? rev.verificacionDemorada === true : verificacionDemorada;
    if ((aviso && rev?.autorizado) || hayQueDecir) await seguir(conRespuesta, rev?.runt ?? runt, fechaActual, demoradaActual);
  }

  /** Segundo mensaje del asistente tras la revisión (enviarSeguimientoRevision en el flujo real). */
  async function seguir(conversacion: MensajeChat[], runtActual: ResumenRunt | null, fechaActual: FechaRechazada | null, demoradaActual = false) {
    setProbando(true);
    const r = await responderPrueba(sinId(conversacion), {
      ...opciones(),
      runt: runtActual,
      fechaRechazada: fechaActual,
      verificacionDemorada: demoradaActual,
      seguimiento: true,
    }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setProbando(false);
    if (!r.ok) return setError(r.error);
    if (!r.texto) return;
    // Se ve qué supo el asistente: la fecha rechazada o la verificación demorada.
    const conFecha = fechaActual
      ? ` · fecha de expedición rechazada (${fechaActual.fecha ?? "?"})`
      : demoradaActual
        ? " · verificación demorada (Croma no respondió)"
        : "";
    const meta = `Seguimiento de la revisión${conFecha}${r.modelo ? ` · ${r.modelo} · ${(r.ms / 1000).toFixed(1)} s` : ""}`;
    setChat((c) => [...c, nuevo({ direccion: "saliente", contenido: r.texto, mediaTipo: null, meta })]);
  }

  /**
   * Lo que en el flujo real hace el webhook en paralelo: leer los datos del
   * chat y, con cédula y autorización, consultar el RUNT y luego el SIMIT en
   * Croma. Con «Guardar en Candidatos» va por el flujo real y queda guardado;
   * si no, consulta sin guardar. El asistente lo usa desde su siguiente mensaje.
   */
  async function revisarCroma(
    conversacion: MensajeChat[]
  ): Promise<{
    runt: ResumenRunt | null;
    revisado: boolean;
    licenciaColor: string | null;
    autorizado?: boolean;
    fechaRechazada?: FechaRechazada | null;
    /** El rechazo de la fecha es de este turno: el asistente escribe por su cuenta para pedirla. */
    fechaNueva?: boolean;
    /** Croma no respondió la verificación de la cédula. */
    verificacionDemorada?: boolean;
  } | null> {
    const base = { formulario, ahora: hora ? new Date(hora).toISOString() : null, transferencia };
    setEstadoCroma("Leyendo los datos del chat…");
    const p = await panelPrueba(sinId(conversacion), { ...base, simit: simitNum, runt }).catch(() => null);
    if (!p?.ok) {
      setEstadoCroma(p ? p.error : "No se pudieron leer los datos del chat.");
      return null;
    }
    setPanel(p.panel);
    const d = p.panel.extraido;
    const autorizado = d?.autorizacion === "si";
    if (!cromaAuto && !guardar) {
      setEstadoCroma(null);
      return { runt, revisado: false, licenciaColor: null, autorizado };
    }
    if (!d?.cedula || d.autorizacion !== "si") {
      setEstadoCroma(d?.cedula ? "Falta que el aspirante acepte la autorización." : "Falta la cédula del aspirante.");
      return { runt, revisado: false, licenciaColor: null };
    }
    const nuevaCedula = !runt || runt.cedula !== d.cedula;

    if (guardar) {
      setEstadoCroma(nuevaCedula ? (cromaAuto ? `Guardando en Candidatos y consultando Croma con la cédula ${d.cedula}…` : "Guardando en Candidatos con Croma simulado…") : "Actualizando el candidato…");
      const reiniciarCedula = reconsultar && !cedulasReconsultadas.current.has(d.cedula);
      const g = await guardarPruebaEnCandidatos(d, {
        reconsultar: reiniciarCedula,
        procesoId: procesoPrueba?.id ?? null,
        fotoCedula: fotoCedulaDe(d.cedula),
        // Con «Consultar Croma de verdad» apagada, Croma se simula y queda en el candidato.
        simular: cromaAuto ? null : { simit: simitNum, escenario: config.escenario },
      }).catch((e: Error) => ({
        ok: false as const,
        error: e.message,
      }));
      if (!g.ok) {
        setEstadoCroma(g.error);
        // Puede seguir cerrado: la ficha se vuelve a leer para mostrarlo.
        if (procesoPrueba) {
          const f = await fichaPrueba(procesoPrueba.id).catch(() => null);
          if (f) {
            setProcesoPrueba(f);
            setFichaVersion((n) => n + 1);
          }
        }
        return { runt, revisado: false, licenciaColor: null };
      }
      if (reiniciarCedula) cedulasReconsultadas.current.add(d.cedula);
      setRunt(g.runt);
      setFechaRechazada(g.fechaRechazada);
      setVerificacionDemorada(g.verificacionDemorada);
      if (g.simitConsultado && g.simitValor != null) setSimit(String(g.simitValor));
      if (g.simitConsultado) setSimitCedula(d.cedula);
      if (g.avisoRevision) {
        setChat((c) => [...c, nuevo({ direccion: "saliente", contenido: g.avisoRevision!, mediaTipo: null, meta: "Aviso automático: antecedentes para revisión de una persona" })]);
      }
      if (fotosPrueba.current.some((f) => !f.ruta)) await guardarFotosPendientes(g.procesoId);
      const ficha = await fichaPrueba(g.procesoId).catch(() => null);
      if (ficha) {
        setProcesoPrueba(ficha);
        setFichaVersion((n) => n + 1);
      }
      const simitG = g.simitConsultado ? g.simitValor : simitNum;
      const final = await recalcularPanel(d, { ...base, simit: simitG, runt: g.runt }).catch(() => null);
      if (final) setPanel(final);
      const sinRunt = !fotoCedulaDe(d.cedula) && !d.primer_apellido
        ? " · el RUNT espera el primer apellido (o la foto de la cédula)"
        : g.verificacionDemorada
          ? " · Croma no respondió el RUNT: se reintenta con el siguiente mensaje"
          : " · sin RUNT todavía (¿Croma no respondió o falta CROMA_API_KEY?)";
      const conFecha = g.fechaRechazada ? ` · la fecha de expedición ${g.fechaRechazada.fecha ?? ""} no coincide con la cédula (RNMC, en antecedentes)` : "";
      if (g.citacion) avisarPrueba({ texto: g.citacion, procesoId: g.procesoId, etiqueta: "Citación automática (quedó «Listo para citar»)", clave: "citacion" });
      if (g.reabierto) setNotaCita("Gestivo: el candidato estaba cerrado y este mensaje lo reabrió. En WhatsApp el chat queda marcado para que una persona lo llame.");
      setEstadoCroma(
        `${g.reabierto ? "REABIERTO · " : ""}${cromaAuto ? "" : "Croma SIMULADO · "}Guardado en Candidatos: ${g.nombre}${g.runt ? ` · ${final?.preseleccion?.licencia.motivo ?? ""}` : sinRunt}${
          g.simitConsultado ? ` · SIMIT ${pesos(g.simitValor ?? 0)}` : ""
        }${conFecha}`
      );
      return {
        runt: g.runt,
        revisado: nuevaCedula,
        licenciaColor: final?.preseleccion?.licencia.color ?? null,
        autorizado: true,
        fechaRechazada: g.fechaRechazada,
        verificacionDemorada: g.verificacionDemorada,
        fechaNueva: !!g.fechaRechazada && (g.fechaRechazada.fecha !== fechaRechazada?.fecha || g.fechaRechazada.intentos !== fechaRechazada?.intentos),
      };
    }

    // Como en el flujo real, lo primero es ver si ya trabaja en la empresa: si
    // es conductor activo no se consulta nada en Croma.
    const vinculo = await vinculoPrueba(d.cedula).catch(() => null);
    if (vinculo === "activo") {
      setEstadoCroma("Ya trabaja en la empresa (conductor activo): no se consulta Croma.");
      return { runt, revisado: false, licenciaColor: null, autorizado: true };
    }
    // El RUNT con la cédula y el primer apellido (el de la foto de la cédula o
    // el que escribió); el RNMC solo en antecedentes, que este modo sin guardar no simula.
    const foto = fotoCedulaDe(d.cedula);
    // Lo que escribió o confirmó la persona manda sobre la lectura de la foto.
    const apellidos = d.primer_apellido ?? foto?.apellidos ?? null;
    let runtActual = runt;
    if (!apellidos) {
      setEstadoCroma("El RUNT espera el primer apellido (o la foto de la cédula): sin él no se consulta.");
      return { runt, revisado: false, licenciaColor: null, autorizado: true };
    }
    const nombreRegistro = foto ? [foto.nombres, foto.apellidos].filter(Boolean).join(" ") : null;
    // Se vuelve a consultar si cambió la cédula o el apellido.
    if (nuevaCedula || !runt?.identidadVerificada || runtApellidos.current !== apellidos) {
      runtApellidos.current = apellidos;
      setEstadoCroma(`Consultando el RUNT de la cédula ${d.cedula} en Croma…`);
      const r = await consultarRuntPrueba(d.cedula, true, nombreRegistro, apellidos).catch((e: Error) => ({ ok: false as const, error: e.message }));
      if (!r.ok) {
        setEstadoCroma(r.error);
        return { runt, revisado: true, licenciaColor: null, autorizado: true };
      }
      runtActual = r.resumen;
      setRunt(runtActual);
    }
    let simitActual = simitNum;
    const descartaAntes = p.panel.preseleccion?.edad.color === "rojo" || p.panel.preseleccion?.residencia.color === "rojo";
    if (simitCedula !== d.cedula && !descartaAntes) {
      const conRunt = await recalcularPanel(d, { ...base, simit: simitNum, runt: runtActual }).catch(() => null);
      // Como en el flujo real: si el RUNT ya descarta, no se gasta la consulta del SIMIT.
      if (conRunt?.preseleccion?.licencia.color !== "rojo") {
        setEstadoCroma("Consultando el SIMIT en Croma…");
        const s = await consultarCromaPrueba(d.cedula, true).catch((e: Error) => ({ ok: false as const, error: e.message }));
        if (s.ok && s.valor != null) {
          simitActual = s.valor;
          setSimit(String(s.valor));
          setSimitCedula(d.cedula);
        }
      }
    }
    const final = await recalcularPanel(d, { ...base, simit: simitActual, runt: runtActual }).catch(() => null);
    if (final) setPanel(final);
    setEstadoCroma(
      `Croma consultado (sin guardar): ${runtActual?.nombre ?? "sin nombre en el RUNT"} · ${final?.preseleccion?.licencia.motivo ?? ""}${
        simitCedula === d.cedula || simitActual !== simitNum ? ` · SIMIT ${pesos(simitActual ?? 0)}` : ""
      }`
    );
    return { runt: runtActual, revisado: nuevaCedula, licenciaColor: final?.preseleccion?.licencia.color ?? null, autorizado: true };
  }

  /** Envía lo escrito o, si viene `boton`, el texto del botón que tocó (como en WhatsApp). */
  function enviar(media: MensajeChat["mediaTipo"] = null, boton?: string) {
    const contenido = (boton ?? borrador).trim();
    if ((!contenido && !media) || probando || transferencia) return;
    const conversacion = [...chat, nuevo({ direccion: "entrante", contenido, mediaTipo: media })];
    setChat(conversacion);
    if (boton === undefined) setBorrador("");
    setSilencio(null);
    // Como el webhook: con una cita en pie, «Sí, voy» la confirma y «Necesito otra fecha» la marca.
    if ((procesoPrueba?.estado === "citado" || procesoPrueba?.estado === "prueba_manejo") && contenido && !media) {
      void respuestaCitaPrueba(procesoPrueba.id, contenido)
        .then((r) => {
          setNotaCita(r.nota);
          if (r.nota) avisarPrueba();
        })
        .catch(() => undefined);
    }
    void responder(conversacion);
  }

  /** Sube una foto de verdad: va al chat como foto (el asistente responde) y se lee con el modelo. */
  async function subirFoto(archivo: File) {
    if (probando || transferencia) return;
    setLectura({ estado: "leyendo" });
    let foto: { dataUrl: string; base64: string };
    try {
      foto = await reducirFoto(archivo);
    } catch (e) {
      return setLectura({ estado: "error", error: e instanceof Error ? e.message : "No se pudo leer la foto." });
    }
    const contenido = borrador.trim();
    setBorrador("");
    // Como en WhatsApp: la foto se lee ANTES de que el asistente responda, y la
    // lectura va con el mensaje para que muestre los datos y pida confirmarlos.
    const r = await leerCedulaPrueba({ tipo: "image/jpeg", base64: foto.base64 }, { formulario }).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setLectura(r.ok ? { estado: "ok", resultado: r } : { estado: "error", error: r.error });
    // Como en WhatsApp: junto con lo ya leído en las fotos anteriores (frente y
    // reverso); lo de esta foto manda. Así no vuelve a pedir lo que ya se tiene.
    const resumen = r.ok ? resumenLectura(combinarLecturas(r.lectura, fotosPrueba.current.map((f) => f.lectura))) : "no se pudo leer la foto";
    const conversacion = [...chat, { ...nuevo({ direccion: "entrante", contenido, mediaTipo: "image", lectura: resumen }), imagen: foto.dataUrl }];
    setChat(conversacion);
    // Con «Guardar en Candidatos», la foto queda en la ficha (si aún no hay candidato, al crearse),
    // salvo que no sirva: ilegible, o que reemplace a una anterior del mismo lado (esa se borra).
    const lista = [...fotosPrueba.current, { base64: foto.base64, resumen, lectura: r.ok ? r.lectura : null, ruta: null, subiendo: false }];
    const fuera = fotosADescartar(lista.map((f) => f.lectura));
    fotosPrueba.current = lista.filter((_, i) => !fuera.has(i));
    const motivos: Record<MotivoDescarte, string> = {
      ilegible: "esta foto no se guardará en la ficha: no se pudo leer ningún dato",
      reemplazada: "la foto anterior del mismo lado se borró de la ficha: esta la reemplaza",
    };
    const nuevaFuera = fuera.get(lista.length - 1);
    const reemplazadas = lista.filter((f, i) => fuera.get(i) === "reemplazada");
    setDescarteFoto(nuevaFuera ? motivos[nuevaFuera] : reemplazadas.length ? motivos.reemplazada : null);
    if (procesoPrueba) {
      for (const f of reemplazadas) if (f.ruta) void descartarFotoPrueba(procesoPrueba.id, f.ruta).then(() => setFichaVersion((n) => n + 1));
    }
    if (guardar && procesoPrueba) void guardarFotosPendientes(procesoPrueba.id);
    void responder(conversacion);
  }

  /** Sube a la ficha del candidato de prueba las fotos que aún no se guardaron. */
  async function guardarFotosPendientes(procesoId: string) {
    for (const f of fotosPrueba.current.filter((x) => !x.ruta && !x.subiendo)) {
      f.subiendo = true;
      const g = await guardarFotoPrueba(procesoId, f.base64, f.resumen).catch(() => ({ ok: false as const, ruta: undefined }));
      f.subiendo = false;
      if (!g.ok || !g.ruta) continue;
      f.ruta = g.ruta;
      // Si mientras subía llegó otra que la reemplaza, se borra de una vez.
      if (!fotosPrueba.current.includes(f)) void descartarFotoPrueba(procesoId, g.ruta);
    }
    setFichaVersion((n) => n + 1);
  }

  function reiniciar() {
    setChat([]);
    setTransferencia(null);
    setError(null);
    setPanel(null);
    setRunt(null);
    setSimitCedula(null);
    setFechaRechazada(null);
    setVerificacionDemorada(false);
    fechasRechazadas.current = new Set();
    cedulasReconsultadas.current = new Set();
    setProcesoPrueba(null);
    setLectura(null);
    fotosPrueba.current = [];
    setDescarteFoto(null);
    setRnmc(null);
    setEstadoCroma(null);
    setSilencio(null);
    setRevision(null);
    setNotaCita(null);
    setAgendaSimulada(null);
    setBorrador(FRASE_INICIAL);
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

  const nombreVisible = procesoPrueba?.nombre && procesoPrueba.nombre !== "POR CONFIRMAR" ? procesoPrueba.nombre : `Aspirante ${numero}`;
  const est = procesoPrueba ? estadoInfo(procesoPrueba.estado) : null;

  return (
    <section className="grid gap-3 xl:h-full xl:grid-cols-[minmax(0,1fr)_420px]">
      {/* Hilo, con la forma del de Comunicaciones */}
      <div className="flex h-[640px] min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised xl:h-full">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          {onVolver && (
            <button onClick={onVolver} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-slate-100 cursor-pointer lg:hidden" aria-label="Volver a la lista de chats">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-text-primary">{nombreVisible}</span>
              {procesoPrueba && (
                <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700" title="Guardado en Candidatos (origen «chat de prueba»)">
                  Candidato
                </span>
              )}
              {est && (
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: est.bg, color: est.color }}>
                  {est.label}
                </span>
              )}
              {procesoPrueba && ["pendiente", "antecedentes", "citado"].includes(procesoPrueba.estado) && (
                <button
                  onClick={() => setCitando(true)}
                  className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-emerald-700"
                  title={procesoPrueba.estado === "citado" ? "Mover la cita de la prueba de manejo" : "Citar a la prueba de manejo (la citación llega a este chat)"}
                >
                  {procesoPrueba.estado === "citado" ? "Reprogramar" : "Citar"}
                </button>
              )}
              {transferencia ? (
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Pasó a una persona</span>
              ) : (
                <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  <Bot className="h-3 w-3" /> IA activa
                </span>
              )}
            </div>
            <div className="truncate text-xs text-text-tertiary" title={cromaAuto ? "Consulta Croma de verdad" : `Croma simulado: ${resumenEscenario(config.escenario)}`}>
              Chat de prueba · {cromaAuto ? "Croma de verdad" : guardar ? `Croma simulado: ${resumenEscenario(config.escenario)}` : "sin Croma"} · {guardar ? "guarda en Candidatos" : "no guarda"}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-4">
          {chat.length === 0 && !probando && (
            <p className="py-10 text-center text-xs text-text-tertiary">Escribe el primer mensaje como si fueras el aspirante, o reproduce un caso listo (abajo).</p>
          )}
          {chat.map((m) => {
            const medio = m.mediaTipo ? MEDIOS.find((x) => x.tipo === m.mediaTipo) : null;
            const Icono = medio?.icono;
            const saliente = m.direccion === "saliente";
            return (
              <div key={m.id} className={`flex ${saliente ? "justify-end" : "justify-start"}`}>
                <div className="flex max-w-[78%] flex-col gap-1">
                <div
                  className={`rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    saliente ? "rounded-br-md bg-primary text-white" : "rounded-bl-md border border-border bg-white text-text-primary"
                  }`}
                >
                  {m.imagen ? (
                    // eslint-disable-next-line @next/next/no-img-element -- vista previa local (data URL), no se publica
                    <img src={m.imagen} alt="Foto subida" className="mb-1 max-h-48 rounded-lg" />
                  ) : (
                    medio &&
                    Icono && (
                      <span className={`mb-0.5 flex items-center gap-1.5 text-xs font-medium ${saliente ? "text-white/80" : "text-text-secondary"}`}>
                        <Icono className="h-3.5 w-3.5" /> {medio.texto} (simulado)
                      </span>
                    )
                  )}
                  {m.contenido && <p className="whitespace-pre-wrap break-words">{conNegritas(m.contenido)}</p>}
                  <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${saliente ? "text-white/70" : "text-text-muted"}`}>
                    {saliente && (
                      <span className="flex min-w-0 items-center gap-0.5 truncate" title={m.meta}>
                        <Bot className="h-3 w-3 shrink-0" /> <span className="truncate">{m.meta ?? "Agente IA"}</span>
                      </span>
                    )}
                    {m.at && <span className="shrink-0">{new Date(m.at).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}</span>}
                  </div>
                </div>
                {/* Botones de respuesta rápida, como los muestra WhatsApp: tocarlos responde con su texto. */}
                {saliente &&
                  m.botones?.map((b) => (
                    <button
                      key={b}
                      type="button"
                      disabled={probando || !!transferencia}
                      onClick={() => enviar(null, b)}
                      title="Responder con este botón"
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-white py-1.5 text-sm font-medium text-sky-600 shadow-sm hover:bg-sky-50 disabled:opacity-60"
                    >
                      <CornerUpLeft className="h-3.5 w-3.5" /> {b}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {probando && (
            <div className="flex justify-end">
              <span className="flex items-center gap-1.5 rounded-2xl rounded-br-md bg-primary/10 px-3 py-2 text-xs text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> El asistente está escribiendo…
              </span>
            </div>
          )}
          {transferencia && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">Aquí el chat pasaría a una persona</span> (mensaje {transferencia.turno} del aspirante). {MOTIVO[transferencia.motivo]}
            </div>
          )}
          <div ref={finRef} />
        </div>

        <div className="border-t border-border p-3">
          {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>}
          {estadoCroma && (cromaAuto || guardar) && (
            <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-800">
              <Bot className="h-3.5 w-3.5 shrink-0" /> {estadoCroma}
            </p>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fotoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void subirFoto(f);
              }}
            />
            <button
              onClick={() => fotoRef.current?.click()}
              disabled={probando || !!transferencia || lectura?.estado === "leyendo"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-white text-text-secondary hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
              aria-label="Subir foto de la cédula"
              title="Sube una foto de verdad (por ejemplo, de la cédula): va al chat y el asistente intenta leer los datos"
            >
              {lectura?.estado === "leyendo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </button>
            <textarea
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              rows={1}
              disabled={!!transferencia}
              placeholder={transferencia ? "El chat pasó a una persona" : "Escribe como si fueras el aspirante…"}
              className="max-h-32 min-h-9 flex-1 resize-y rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-primary/30 disabled:bg-slate-50 disabled:text-text-muted"
            />
            <button
              onClick={() => enviar()}
              disabled={probando || !!transferencia || !borrador.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary/90 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
              aria-label="Enviar mensaje"
            >
              {probando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-text-muted">Simular que envía:</span>
            {MEDIOS.map(({ tipo, texto, icono: Icono }) => (
              <button
                key={tipo}
                onClick={() => enviar(tipo)}
                disabled={probando || !!transferencia}
                title="Usa el texto escrito como pie del archivo"
                className="flex items-center gap-1 rounded-full border border-border bg-white px-2 py-0.5 text-[11px] text-text-secondary hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                <Icono className="h-3 w-3" /> {texto}
              </button>
            ))}
            {esperaRespuesta && !probando && !transferencia && (
              <button onClick={() => void responder(chat)} className="ml-auto flex items-center gap-1 rounded-full border border-primary px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/5 cursor-pointer">
                <Bot className="h-3 w-3" /> Que responda
              </button>
            )}
          </div>
        </div>
      </div>


      {/* Panel lateral, como la ficha del contacto en Comunicaciones */}
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised xl:h-full">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2" aria-label="Panel del chat de prueba">
          {(
            [
              { id: "candidato", texto: procesoPrueba ? "Candidato" : "Así se vería" },
              ...(profesor ? [{ id: "profesor", texto: "Profesor" } as const] : []),
              { id: "pruebas", texto: "Simular" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setLado(t.id)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
                lado === t.id ? "border-primary text-primary" : "border-transparent text-text-tertiary hover:text-text-primary"
              }`}
            >
              {t.texto}
            </button>
          ))}
        </nav>
        <div className="@container min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {lado === "candidato" && (
            <>
          {lectura && (
            <LecturaCedulaPanel
              lectura={lectura}
              chat={{
                cedula: panel?.extraido?.cedula ?? null,
                fecha_expedicion: panel?.extraido?.fecha_expedicion ?? null,
                fecha_nacimiento: panel?.extraido?.fecha_nacimiento ?? null,
              }}
              descarte={descarteFoto}
            />
          )}

          {!procesoPrueba && (
            <div className="space-y-2 rounded-xl border border-border bg-white p-3">
              <p className="text-sm font-semibold text-text-primary">Todavía no es candidato</p>
              <p className="text-xs text-text-tertiary">
                {guardar
                  ? "Queda guardado en Candidatos apenas el aspirante dé la cédula y acepte la autorización. Entonces aparece «Citar» arriba del chat."
                  : "Este chat no guarda en Candidatos: abajo se ve lo que se leería del chat."}
              </p>
              {guardados.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-text-secondary">O sigue con uno ya guardado:</span>
                  <select value={elegidoGuardado} onChange={(e) => setElegidoGuardado(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-white px-2 py-1.5 text-sm">
                    <option value="">Elige un candidato de prueba…</option>
                    {guardados.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} · {c.cedula} · {estadoInfo(c.estado)?.label ?? c.estado}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => elegidoGuardado && void usarGuardado(elegidoGuardado)}
                    disabled={!elegidoGuardado}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-40"
                  >
                    Usar
                  </button>
                </div>
              )}
            </div>
          )}
              {notaCita && <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">{notaCita}</p>}
          <FichaPrueba
            proceso={procesoPrueba}
            version={fichaVersion}
            extraido={panel?.extraido ?? null}
            runt={runt}
            simit={{ valor: simitNum, consultado: simitCedula != null && simitCedula === panel?.extraido?.cedula }}
            preseleccion={panel?.preseleccion ?? null}
            estado={panel?.gestivo.estado ?? null}
            rnmc={rnmc?.texto ?? null}
            nombreRegistro={rnmc?.nombre ?? null}
            hoy={new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(hora ? new Date(hora) : new Date())}
          />
            </>
          )}
          {profesor && <div className={lado === "profesor" ? "" : "hidden"}>{profesor}</div>}
          {lado === "pruebas" && (
            <>
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
            {procesoPrueba?.estado === "pendiente" && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    if (!confirm("Se cierra el candidato de prueba como lo haría Gestivo solo: con la causa del requisito si la preselección está en rojo (30 minutos sin cambios), o como «Incomunicado» si no. Después escribe como aspirante para ver si se reabre. ¿Continuar?")) return;
                    void simularCierreAutomaticoPrueba(procesoPrueba.id).then((r) => {
                      setNotaCita(r.ok ? `Gestivo: cierre automático simulado («${r.causa}»). Escribe como aspirante para ver si se reabre.` : (r.error ?? "No se pudo cerrar."));
                      avisarPrueba();
                    });
                  }}
                  className={boton}
                  title="En desarrollo el cron no corre: este botón hace el cierre automático para poder probar la reapertura"
                >
                  <Timer className="h-3.5 w-3.5" /> Simular el cierre automático
                </button>
                <span className="text-[11px] text-text-muted">Después, si vuelve a escribir y cambia lo que lo descartó, se reabre el mismo candidato.</span>
              </div>
            )}
            {procesoPrueba && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    void agendaSimuladaPrueba(procesoPrueba.id, hora ? new Date(hora).toISOString() : null)
                      .then((r) => setAgendaSimulada(r.texto))
                      .catch((e: Error) => setAgendaSimulada(e.message))
                  }
                  className={boton}
                  title="Con la fecha y hora simuladas: recordatorio de las 8:00, alerta de las 11:00 si no confirma, «No asistió» pasada la tolerancia. No envía ni cambia nada."
                >
                  <Timer className="h-3.5 w-3.5" /> ¿Qué haría con la cita a esa hora?
                </button>
                {agendaSimulada && <span className="text-xs text-text-secondary">{agendaSimulada}</span>}
              </div>
            )}
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

            </>
          )}
        </div>
      </aside>

      {citando && procesoPrueba && (
        <CitarDialog
          procesoId={procesoPrueba.id}
          nombre={procesoPrueba.nombre}
          acciones={CITAR_PRUEBA}
          onClose={() => setCitando(false)}
          onHecho={(r, reprogramada) => {
            setCitando(false);
            setNotaCita(`${reprogramada ? "Cita reprogramada." : "Citado."} ${textoEnvio(r.envio)}`);
            avisarPrueba({
              texto: r.texto,
              procesoId: procesoPrueba.id,
              etiqueta: ETIQUETA_MENSAJE[reprogramada ? "cita_reprogramada" : "citacion"],
              clave: reprogramada ? "cita_reprogramada" : "citacion",
            });
          }}
        />
      )}
    </section>
  );
}
