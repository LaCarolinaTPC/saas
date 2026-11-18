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
import { CAUSAS_PRESELECCION, type ProcesoContratacion } from "@/lib/contratacion/constants";
import type { ChequeoCaso, MensajeSimulado } from "@/lib/seleccion/simulacion";
import type { ResumenRunt } from "@/lib/verificacion/proveedores";
import { pareceAvisoDeRevision, type FechaRechazada } from "@/lib/comunicaciones/agente/motor";
import { fotosADescartar, resumenLectura, type LecturaCedula, type MotivoDescarte } from "@/lib/seleccion/lectura-cedula";
import {
  consultarCromaPrueba,
  consultarRuntPrueba,
  correrCasoPrueba,
  fichaPrueba,
  guardarPruebaEnCandidatos,
  leerCedulaPrueba,
  guardarFotoPrueba,
  descartarFotoPrueba,
  type ResultadoLecturaPrueba,
  panelPrueba,
  recalcularPanel,
  responderPrueba,
  simularSilencioPrueba,
  type PanelPrueba,
  type PasoSilencio,
} from "@/lib/seleccion/prueba-actions";
import { SemaforoDetalle } from "./semaforo";
import { FichaPrueba } from "./ficha-prueba";
import { LecturaCedulaPanel } from "./lectura-cedula-panel";

type Motivo = "frase" | "marca" | "rechazo" | "vacio";
interface MensajeChat extends MensajeSimulado {
  id: number;
  meta?: string;
  /** Vista previa de una foto subida de verdad (data URL), solo para mostrarla. */
  imagen?: string;
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
  // Casilla «Consultar Croma de verdad»: como en el flujo real, al tener cédula y
  // autorización se consulta el RUNT (y luego el SIMIT) y el asistente lo usa.
  // Activada por defecto (pedido de GH del 18-nov-2026), igual que «Guardar en Candidatos».
  const [cromaAuto, setCromaAuto] = useState(true);
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
  // Casilla «Guardar en Candidatos»: va por el flujo real y deja el caso guardado (origen «chat_prueba»).
  const [guardar, setGuardar] = useState(true);
  // Casilla «Reconsultar en Croma» (activada por defecto): en cada conversación nueva,
  // la primera vez que aparece una cédula su candidato de prueba se reinicia (el mismo
  // candidato, con «Reiniciado» en la línea de tiempo) y Croma se consulta de nuevo.
  // Así se prueban casos distintos con la misma cédula.
  const [reconsultar, setReconsultar] = useState(true);
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

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chat.length, probando]);

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
  });
  const caso = useMemo(() => CASOS.find((c) => c.id === casoId)!, [casoId]);
  const esperaRespuesta = chat.length > 0 && chat[chat.length - 1].direccion === "entrante";
  const nuevo = (m: MensajeSimulado & { meta?: string }): MensajeChat => ({ ...m, id: ++idRef.current });
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
    setPanelViejo(false);
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
      setEstadoCroma(nuevaCedula ? `Guardando en Candidatos y consultando Croma con la cédula ${d.cedula}…` : "Actualizando el candidato…");
      const reiniciarCedula = reconsultar && !cedulasReconsultadas.current.has(d.cedula);
      const g = await guardarPruebaEnCandidatos(d, {
        reconsultar: reiniciarCedula,
        procesoId: procesoPrueba?.id ?? null,
        fotoCedula: fotoCedulaDe(d.cedula),
      }).catch((e: Error) => ({
        ok: false as const,
        error: e.message,
      }));
      if (!g.ok) {
        setEstadoCroma(g.error);
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
      setEstadoCroma(
        `Guardado en Candidatos: ${g.nombre}${g.runt ? ` · ${final?.preseleccion?.licencia.motivo ?? ""}` : sinRunt}${
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

    // Como en el flujo real: el RUNT con la cédula y el primer apellido (el de
    // la foto de la cédula o el que escribió); el RNMC solo en antecedentes,
    // que este modo sin guardar no simula.
    const foto = fotoCedulaDe(d.cedula);
    const apellidos = foto?.apellidos ?? d.primer_apellido ?? null;
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
    const resumen = r.ok ? resumenLectura(r.lectura) : "no se pudo leer la foto";
    const conversacion = [...chat, { ...nuevo({ direccion: "entrante", contenido, mediaTipo: "image", lectura: resumen }), imagen: foto.dataUrl }];
    setChat(conversacion);
    if (panel) setPanelViejo(true);
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
    if (!rafaga) void responder(conversacion);
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
    setPanelViejo(false);
    setCroma(null);
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
    const p = await recalcularPanel(panel.extraido, { formulario, simit: valor, ahora: hora ? new Date(hora).toISOString() : null, transferencia, runt }).catch(() => null);
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
          "Conversa como si fueras el aspirante. No se envía nada por WhatsApp ni se guarda (salvo con «Guardar en Candidatos»). Cada mensaje usa dos llamadas a la IA: la respuesta y la lectura de los datos, que deja al día «Así se vería en Candidatos»."}
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
                {m.imagen ? (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa local (data URL), no se publica
                  <img src={m.imagen} alt="Foto subida" className="mb-1 max-h-48 rounded-lg" />
                ) : (
                  medio &&
                  Icono && (
                    <span className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                      <Icono className="h-3.5 w-3.5" /> {medio.texto} (simulado)
                    </span>
                  )
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
          title="Sube una foto de verdad (por ejemplo, de la cédula): va al chat y el modelo del asistente intenta leer los datos"
          className="flex items-center gap-1.5 rounded-xl border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50 cursor-pointer"
        >
          <ImageIcon className="h-3.5 w-3.5" /> Subir foto de la cédula
        </button>
        {MEDIOS.map(({ tipo, texto, icono: Icono }) => (
          <button key={tipo} onClick={() => enviar(tipo)} disabled={probando || !!transferencia} title="Usa el texto escrito como pie del archivo" className={boton}>
            <Icono className="h-3.5 w-3.5" /> {texto}
          </button>
        ))}
        <label
          className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-text-tertiary"
          title="Como en el flujo real: con cédula y autorización consulta el RUNT y el SIMIT de verdad en Croma (cuesta consultas y una llamada a la IA por mensaje para leer los datos; no se guarda nada)"
        >
          <input
            type="checkbox"
            checked={cromaAuto}
            onChange={(e) => {
              if (e.target.checked && !confirm("Con esta casilla, al tener cédula y autorización se consultan de verdad el RUNT y el SIMIT en Croma (cuestan consultas) y cada mensaje usa una llamada más a la IA para leer los datos. No se guarda nada. ¿Activarla?")) return;
              setCromaAuto(e.target.checked);
            }}
            className="accent-primary"
          />
          Consultar Croma de verdad
        </label>
        <label
          className="flex cursor-pointer items-center gap-1.5 text-[11px] text-text-tertiary"
          title="Como en el flujo real: apenas haya cédula y autorización guarda el aspirante en Candidatos (origen «chat de prueba»), consulta el RUNT y el SIMIT en Croma y deja todo en su ficha"
        >
          <input
            type="checkbox"
            checked={guardar}
            onChange={(e) => {
              if (e.target.checked && !confirm("Con esta casilla, apenas haya cédula y autorización el aspirante de prueba queda guardado en Candidatos (marcado «Guardado desde el chat de prueba») y se consultan de verdad el RUNT y el SIMIT en Croma. Si hay un proceso real abierto con esa cédula, no se toca. ¿Activarla?")) return;
              setGuardar(e.target.checked);
            }}
            className="accent-primary"
          />
          Guardar en Candidatos
        </label>
        <label
          className="flex cursor-pointer items-center gap-1.5 text-[11px] text-text-tertiary"
          title="En cada conversación nueva (después de «Reiniciar»), la primera vez que aparece una cédula el candidato de prueba con esa cédula se reinicia (el mismo candidato, con «Reiniciado» en la línea de tiempo) y se consultan de nuevo RNMC, RUNT, SIMIT y antecedentes en Croma (cuestan consultas). Desmárcala para reutilizar lo ya consultado. Nunca toca procesos reales."
        >
          <input type="checkbox" checked={reconsultar} onChange={(e) => setReconsultar(e.target.checked)} disabled={!guardar} className="accent-primary" />
          Reconsultar en Croma
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-text-tertiary" title="El asistente responde una sola vez a varios mensajes seguidos, como en WhatsApp">
          <input type="checkbox" checked={rafaga} onChange={(e) => setRafaga(e.target.checked)} className="accent-primary" />
          Varios mensajes seguidos
        </label>
        {esperaRespuesta && !probando && !transferencia && (
          <button onClick={() => void responder(chat)} className="flex items-center gap-1.5 rounded-xl border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5 cursor-pointer">
            <Bot className="h-3.5 w-3.5" /> Que responda
          </button>
        )}
      </div>

      {(cromaAuto || guardar) && estadoCroma && <p className="-mt-1 text-[11px] text-text-secondary">{estadoCroma}</p>}

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
                    ["Nombre", runt?.nombre ? `${runt.nombre} (RUNT)` : d.nombre ? `${d.nombre} (dicho)` : "— (lo trae el RUNT)"],
                    ["Cédula", d.cedula ?? "—"],
                    ["Nacimiento", d.fecha_nacimiento ?? "—"],
                    ["Edad", d.edad != null ? `${d.edad} años (dicha)` : "—"],
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
                {runt && (
                  <p className="mt-1 text-text-secondary">
                    <span className="font-medium">RUNT (Croma):</span>{" "}
                    {runt.registrado === false
                      ? "la cédula no aparece."
                      : runt.categorias.length
                        ? runt.categorias.map((c) => `${c.categoria}${c.vence ? ` vence ${c.vence}` : ""}${c.activa ? "" : " (no activa)"}`).join(" · ")
                        : "sin licencia."}
                    {runt.restricciones?.length ? ` · Restricciones: ${runt.restricciones.join(", ")}` : ""}
                  </p>
                )}
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
