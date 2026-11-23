/**
 * Laboratorios de los exámenes de ingreso y la orden que se les envía (Salud
 * Ocupacional, 21-nov-2026). PURO: tipos, validación y el armado del correo y
 * del WhatsApp. La lectura y el envío están en laboratorios-servidor.ts.
 *
 * Biobac recibe la orden por correo (recepción y comercial), con la orden de
 * servicio en Word de cada aspirante adjunta; Rescate, por WhatsApp. Cualquiera
 * de los dos puede cambiar de canal. La fase 2 se hace en el mismo laboratorio.
 */

export type CanalLaboratorio = "whatsapp" | "correo";

export interface Laboratorio {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono_contacto: string | null;
  canal: CanalLaboratorio;
  whatsapp: string | null;
  correos: string[];
  correos_copia: string[];
  asunto: string | null;
  plantilla_orden_ruta: string | null;
  activo: boolean;
  predeterminado: boolean;
  orden: number;
  /** Días en que atiende (0 = domingo … 6 = sábado). Sin la migración 20261121202736: lunes a sábado. */
  dias_atencion?: number[];
  /** Días en que se prefiere sobre el reparto (Rescate los sábados). */
  dias_preferidos?: number[];
  /** Parte de los aspirantes con el reparto por porcentaje. */
  porcentaje?: number;
}

// ── Reparto entre laboratorios (21-nov-2026) ─────────────────────────────────

export type ModoReparto = "predeterminado" | "porcentaje";
export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DIAS_CORTOS = ["D", "L", "M", "X", "J", "V", "S"];
const LUNES_A_SABADO = [1, 2, 3, 4, 5, 6];

/** Día de la semana de una fecha AAAA-MM-DD (0 = domingo). */
export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

/** ¿El laboratorio atiende ese día? */
export function atiende(l: Pick<Laboratorio, "dias_atencion">, fecha: string): boolean {
  return (l.dias_atencion?.length ? l.dias_atencion : LUNES_A_SABADO).includes(diaSemana(fecha));
}

export interface EleccionLaboratorio {
  laboratorio: Laboratorio | null;
  motivo: string;
}

/**
 * A qué laboratorio va un aspirante citado ese día:
 *  1. Solo los activos que atienden ese día.
 *  2. Si alguno lo tiene como día preferido, entre esos (Rescate los sábados).
 *  3. Si no, según el reparto: el predeterminado (o el primero si no atiende),
 *     o por porcentaje: al que más lejos esté de su parte, contando las
 *     asignaciones recientes (`asignados`, por id de laboratorio).
 * Con varios preferidos el mismo día, también se reparten por porcentaje.
 */
export function elegirLaboratorio(labs: Laboratorio[], fecha: string, modo: ModoReparto, asignados: Record<string, number> = {}): EleccionLaboratorio {
  const dia = DIAS_SEMANA[diaSemana(fecha)].toLowerCase();
  const disponibles = labs.filter((l) => l.activo && atiende(l, fecha)).sort((a, b) => a.orden - b.orden);
  if (!disponibles.length) return { laboratorio: null, motivo: `Ningún laboratorio activo atiende el ${dia}.` };
  const preferidos = disponibles.filter((l) => l.dias_preferidos?.includes(diaSemana(fecha)));
  const porPorcentaje = (lista: Laboratorio[]): Laboratorio => {
    const conPeso = lista.filter((l) => (l.porcentaje ?? 0) > 0);
    const base = conPeso.length ? conPeso : lista;
    const suma = base.reduce((s, l) => s + (conPeso.length ? l.porcentaje ?? 0 : 1), 0);
    const total = base.reduce((s, l) => s + (asignados[l.id] ?? 0), 0) + 1;
    // El que más le falta para llegar a su parte; con empate, el de menor orden.
    return base
      .map((l) => ({ l, falta: ((conPeso.length ? l.porcentaje ?? 0 : 1) / suma) * total - (asignados[l.id] ?? 0) }))
      .sort((a, b) => b.falta - a.falta || a.l.orden - b.l.orden)[0].l;
  };
  if (preferidos.length) {
    const l = preferidos.length === 1 ? preferidos[0] : porPorcentaje(preferidos);
    return { laboratorio: l, motivo: `${l.nombre} es el preferido los ${dia}s.` };
  }
  if (modo === "porcentaje") {
    const l = porPorcentaje(disponibles);
    return { laboratorio: l, motivo: `Reparto por porcentaje: ${l.nombre} es el que va más atrás de su parte.` };
  }
  const pred = disponibles.find((l) => l.predeterminado);
  if (pred) return { laboratorio: pred, motivo: `${pred.nombre} es el predeterminado.` };
  return { laboratorio: disponibles[0], motivo: `El predeterminado no atiende el ${dia}: va a ${disponibles[0].nombre}.` };
}

/**
 * Aspirantes de prueba (23-nov-2026): uno a cada laboratorio, por turnos, entre
 * los que atienden ese día, para probar el flujo con todos. `ultimoId` es el
 * laboratorio del último aspirante de prueba; el turno es el siguiente.
 */
export function laboratorioPorTurno(labs: Laboratorio[], fecha: string, ultimoId: string | null): EleccionLaboratorio {
  const disponibles = labs.filter((l) => l.activo && atiende(l, fecha)).sort((a, b) => a.orden - b.orden);
  if (!disponibles.length) return { laboratorio: null, motivo: `Ningún laboratorio activo atiende el ${DIAS_SEMANA[diaSemana(fecha)].toLowerCase()}.` };
  const todos = labs.filter((l) => l.activo).sort((a, b) => a.orden - b.orden);
  // El siguiente al último en el orden de todos, saltando los que no atienden ese día.
  const desde = todos.findIndex((l) => l.id === ultimoId);
  for (let i = 1; i <= todos.length; i++) {
    const l = todos[(desde + i + todos.length) % todos.length];
    if (disponibles.includes(l)) return { laboratorio: l, motivo: `Aspirante de prueba: por turnos, le toca a ${l.nombre}.` };
  }
  return { laboratorio: disponibles[0], motivo: `Aspirante de prueba: por turnos, le toca a ${disponibles[0].nombre}.` };
}

/**
 * La primera fecha (desde `fecha`, inclusive) en que atiende alguno de los
 * laboratorios; `siguiente` da el siguiente día hábil. null si en dos semanas
 * no atiende ninguno (laboratorios mal configurados).
 */
export function primeraFechaAtendida(fecha: string, labs: Pick<Laboratorio, "activo" | "dias_atencion">[], siguiente: (f: string) => string): string | null {
  const activos = labs.filter((l) => l.activo);
  if (!activos.length) return fecha;
  let f = fecha;
  for (let i = 0; i < 14; i++) {
    if (activos.some((l) => atiende(l, f))) return f;
    f = siguiente(f);
  }
  return null;
}

/** Cargo que va en la orden y en la carta si el ajuste `cargo_documentos` está vacío o no existe. */
export const CARGO_POR_DEFECTO = "CONDUCTOR - COBRADOR";

/**
 * El cargo de la carta del banco y la orden (23-nov-2026): el del ajuste, en
 * mayúsculas, o CONDUCTOR - COBRADOR. Ya no sale de la vacante: todos los
 * procesos tienen «Conductor de transporte público colectivo» y la carta debe
 * decir el cargo que define Gestión Humana.
 */
export function cargoDocumentos(ajuste: unknown): string {
  const v = typeof ajuste === "string" ? ajuste.replace(/\s+/g, " ").trim() : "";
  return v ? v.toUpperCase() : CARGO_POR_DEFECTO;
}

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lista de correos escrita a mano (comas, punto y coma o renglones) → limpia y sin repetir. */
export function parsearCorreos(texto: string): string[] {
  return [...new Set(texto.split(/[\s,;]+/).map((c) => c.trim().toLowerCase()).filter(Boolean))];
}

/** Lo que falta para que el laboratorio pueda recibir órdenes; vacío si está listo. */
export function faltantesLaboratorio(l: Pick<Laboratorio, "nombre" | "canal" | "whatsapp" | "correos" | "correos_copia">): string[] {
  const f: string[] = [];
  if (!l.nombre.trim()) f.push("el nombre");
  if (l.canal === "correo") {
    if (!l.correos.length) f.push("al menos un correo de destino");
    const malos = [...l.correos, ...l.correos_copia].filter((c) => !CORREO_RE.test(c));
    if (malos.length) f.push(`correos válidos (revise: ${malos.join(", ")})`);
  } else if (!(l.whatsapp ?? "").replace(/\D/g, "").match(/^\d{10,15}$/)) {
    f.push("el número de WhatsApp (10 dígitos, o con el indicativo)");
  }
  return f;
}

export interface AspiranteOrden {
  procesoId: string;
  citaId: string;
  nombre: string;
  cedula: string;
  cargo: string;
  fase: 1 | 2;
  fecha: string;
  hora: string;
  /** Candidato del chat de prueba: nunca se le envía nada de verdad. */
  prueba: boolean;
}

export interface CorreoOrden {
  para: string[];
  copia: string[];
  asunto: string;
  texto: string;
  html: string;
}

const escaparHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** «13175742» → «13.175.742». */
export function cedulaConPuntos(cedula: string): string {
  const d = cedula.replace(/\D/g, "");
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Saludo según la hora de Bogotá, como lo escribe Salud Ocupacional. */
export function saludoDelDia(ahora: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", hourCycle: "h23" }).format(ahora));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/**
 * El correo con la orden, como el que envía hoy Salud Ocupacional: un solo
 * correo por laboratorio con la lista de aspirantes (nombre y cédula); las
 * órdenes van adjuntas aparte.
 */
export function armarCorreoOrden(lab: Pick<Laboratorio, "nombre" | "correos" | "correos_copia" | "asunto">, aspirantes: AspiranteOrden[], ahora: Date, firma = "Salud Ocupacional\nTransportes La Carolina"): CorreoOrden {
  const nombreCorto = lab.nombre.split(/\s+-\s+|\s+/)[0];
  const saludo = `${saludoDelDia(ahora)} señores ${nombreCorto.charAt(0).toUpperCase()}${nombreCorto.slice(1).toLowerCase()},`;
  const fases = [...new Set(aspirantes.map((a) => a.fase))];
  const queFase = fases.length === 1 ? (fases[0] === 1 ? " (fase 1)" : " (fase 2, en ayunas)") : "";
  const intro = `Me permito enviar adjunto órdenes de exámenes médicos de los siguientes aspirantes al cargo conductor${queFase}:`;
  const lineas = aspirantes.map((a) => `${a.nombre.toUpperCase()}  CC. ${a.cedula}`);
  const cuando = [...new Set(aspirantes.map((a) => `${a.fecha} a las ${a.hora}`))];
  const cita = cuando.length === 1 ? `Se presentan el ${cuando[0]}, por orden de llegada.` : "";
  const texto = [saludo, "", intro, "", ...lineas.map((l) => `• ${l}`), "", ...(cita ? [cita, ""] : []), "Quedo atenta a los resultados.", "", "Cordialmente,", firma].join("\n");
  const html = [
    `<p>${escaparHtml(saludo)}</p>`,
    `<p>${escaparHtml(intro)}</p>`,
    `<ul>${lineas.map((l) => `<li>${escaparHtml(l)}</li>`).join("")}</ul>`,
    cita ? `<p>${escaparHtml(cita)}</p>` : "",
    "<p>Quedo atenta a los resultados.</p>",
    `<p>Cordialmente,<br>${firma.split("\n").map(escaparHtml).join("<br>")}</p>`,
  ].join("");
  return {
    para: lab.correos,
    copia: lab.correos_copia,
    asunto: lab.asunto?.trim() || "ORDEN CONDUCTOR EXAMENES MEDICOS DE INGRESOS",
    texto,
    html,
  };
}

/** Nombre del archivo de la orden de un aspirante. */
export const archivoOrden = (a: Pick<AspiranteOrden, "nombre" | "cedula">) =>
  `ORDEN CONDUCTOR ${a.nombre.toUpperCase().replace(/[^A-ZÑÁÉÍÓÚ ]/g, "").trim()} ${a.cedula}.docx`;

/** Nombre del archivo de la carta del banco (en PDF desde el 23-nov-2026, si la plantilla es PDF). */
export const archivoCarta = (a: Pick<AspiranteOrden, "nombre" | "cedula">, ext: "docx" | "pdf" = "docx") =>
  `CARTA BANCO ${a.nombre.toUpperCase().replace(/[^A-ZÑÁÉÍÓÚ ]/g, "").trim()} ${a.cedula}.${ext}`;
