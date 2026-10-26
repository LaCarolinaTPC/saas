/**
 * Pantalla informativa — modelo de la presentación (PURO: sin React ni servidor).
 *
 * Una presentación es una lista de diapositivas de 1920×1080. Cada diapositiva
 * tiene un fondo, una duración, una transición de entrada y elementos
 * posicionados en coordenadas del lienzo: textos, imágenes, videos, formas y
 * «widgets» de datos vivos (accidentabilidad, ausentismo, marcaciones,
 * cumpleaños, reloj).
 *
 * Se guarda como JSON (`pantalla_presentaciones.borrador` / `.publicada`) y se
 * valida SIEMPRE al guardar y al leer con `validarPresentacion`, igual que el
 * croquis de accidentes (`accidentabilidad/croquis.ts`): el JSON viene del
 * navegador y se pinta en un televisor que nadie está mirando de cerca.
 */

import { esFuente, type FuenteClave } from "./fuentes-catalogo";
import { FORMAS, esForma, type ClaveForma } from "./formas";
import { esEmoji } from "./emojis";
import { validarMiniaturaWeb, validarRefVideoWeb, type RefVideoWeb } from "./enlaces-video";
import { FONDOS_ICONO, esIcono, type ClaveIcono, type FondoIcono } from "./iconos";

// ── Límites ─────────────────────────────────────────────────────────────────

export const LIENZO = { ancho: 1920, alto: 1080 } as const;
export const MAX_DIAPOSITIVAS = 30;
export const MAX_ELEMENTOS = 40;
export const MAX_TEXTO = 500;
export const MAX_NOMBRE = 60;
/**
 * Tamaño máximo del JSON serializado. Las server actions cortan el cuerpo en
 * 1 MB; con este margen el borrador siempre cabe en `guardarBorrador`.
 */
export const MAX_BYTES = 700_000;
export const DURACION = { min: 3, max: 300, defecto: 10 } as const;
export const TRANSICION_MS = 600;
/** Si el video que manda nunca avisa que terminó, se avanza igual pasado esto. */
export const MARGEN_FIN_VIDEO_MS = 5000;
export const TAMANO_TEXTO = { min: 12, max: 400 } as const;

// ── Medios ──────────────────────────────────────────────────────────────────

export const MEDIOS = {
  imagen: {
    mimes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 4 * 1024 * 1024,
  },
  video: {
    mimes: ["video/mp4", "video/webm"],
    maxBytes: 150 * 1024 * 1024,
  },
} as const;
export type TipoMedio = keyof typeof MEDIOS;

/** Rutas que deja la subida firmada en el bucket `pantalla`. */
export const RUTA_MEDIO = /^biblioteca\/[0-9a-f-]{36}(\.poster)?\.(jpg|png|webp|mp4|webm)$/i;
/** Fotos de accidentes (bucket `accidentes`), la misma regla que `accidentabilidad/fotos.ts`. */
export const RUTA_FOTO_ACCIDENTE = /^fotos\/[0-9a-f-]{36}\.(jpg|png|webp)$/i;

/** Referencia a un archivo en Storage. Las imágenes pueden venir de `accidentes`; los videos solo de `pantalla`. */
export interface RefMedio {
  bucket: "pantalla" | "accidentes";
  path: string;
}

// ── Tipos ───────────────────────────────────────────────────────────────────

export const TRANSICIONES = {
  ninguna: "Sin transición",
  fundido: "Fundido",
  deslizar: "Deslizar",
  zoom: "Zoom",
} as const;
export type Transicion = keyof typeof TRANSICIONES;

/** Cómo ENTRA un elemento (una vez, al aparecer la diapositiva). */
export const ANIMACIONES = {
  ninguna: "Sin animación",
  aparecer: "Aparecer",
  subir: "Subir",
  bajar: "Bajar",
  izquierda: "Entrar por la izquierda",
  derecha: "Entrar por la derecha",
  zoom: "Zoom",
  rebote: "Rebote",
  girar: "Girar",
  desenfoque: "Enfocar",
  voltear: "Voltear",
} as const;
export type Animacion = keyof typeof ANIMACIONES;

/** Lo que HACE un elemento mientras está en pantalla (se repite sin parar). */
export const EFECTOS = {
  ninguno: "Sin efecto",
  pulsar: "Pulsar",
  latido: "Latido",
  flotar: "Flotar",
  balancear: "Balancear",
  sacudir: "Sacudir",
  girar: "Girar sin parar",
  parpadear: "Parpadear",
  brillar: "Brillar",
} as const;
export type Efecto = keyof typeof EFECTOS;

export const VELOCIDADES = { lenta: "Lenta", normal: "Normal", rapida: "Rápida" } as const;
export type Velocidad = keyof typeof VELOCIDADES;

export type Alineacion = "izquierda" | "centro" | "derecha";
export type Ajuste = "cubrir" | "contener";
export type TemaWidget = "claro" | "oscuro";

export type Fondo =
  | { tipo: "color"; color: string }
  | { tipo: "degradado"; desde: string; hasta: string; angulo: number }
  /** `oscurecer`: capa negra encima, 0-0.9, para que el texto se lea sobre una foto. */
  | { tipo: "imagen"; imagen: RefMedio; ajuste: Ajuste; oscurecer: number };

/** Lo común a todo lo que se coloca en el lienzo. x,y = esquina superior izquierda. */
export interface Caja {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Grados, 0-359. */
  rot: number;
  /** 0-1. */
  opacidad: number;
  entrada: { animacion: Animacion; retardoMs: number };
  /** Efecto continuo; empieza cuando termina la entrada. */
  efecto: { tipo: Efecto; velocidad: Velocidad };
}

export const WIDGETS = {
  acc_kpis: {
    nombre: "Accidentes del mes",
    descripcion: "Total del mes, variación contra el mes anterior, graves y fatales.",
    familia: "accidentabilidad",
    w: 1200,
    h: 300,
  },
  acc_serie: {
    nombre: "Accidentes por mes",
    descripcion: "Línea mensual de accidentes y graves.",
    familia: "accidentabilidad",
    w: 1400,
    h: 600,
  },
  acc_dias_sin: {
    nombre: "Días sin accidentes",
    descripcion: "Días desde el último accidente registrado.",
    familia: "accidentabilidad",
    w: 640,
    h: 400,
  },
  aus_kpis: {
    nombre: "Ausentismo del año",
    descripcion: "Incapacidades, días perdidos, trabajadores afectados.",
    familia: "ausentismo",
    w: 1200,
    h: 300,
  },
  aus_serie: {
    nombre: "Días perdidos por mes",
    descripcion: "Barras de días de incapacidad por mes del año.",
    familia: "ausentismo",
    w: 1400,
    h: 600,
  },
  marc_hoy: {
    nombre: "Operación de hoy",
    descripcion: "Conductores esperados, que salieron, por salir y sin despacho. Solo cifras.",
    familia: "marcaciones",
    w: 1200,
    h: 300,
  },
  cumple_mes: {
    nombre: "Cumpleaños del mes",
    descripcion: "Conductores que cumplen años de hoy al fin de mes (solo nombre y día).",
    familia: "cumpleanos",
    w: 800,
    h: 800,
  },
  aniv_mes: {
    nombre: "Aniversarios del mes",
    descripcion: "Quienes cumplen años en la empresa de hoy al fin de mes.",
    familia: "aniversarios",
    w: 800,
    h: 800,
  },
  reloj: {
    nombre: "Reloj",
    descripcion: "Hora (y fecha) de Colombia.",
    familia: null,
    w: 600,
    h: 220,
  },
  acc_factor: {
    nombre: "Factor de riesgo del mes",
    descripcion: "La causa más frecuente de los accidentes del mes, con un consejo para evitarla.",
    familia: "accidentabilidad",
    w: 1400,
    h: 420,
  },
  vel_semana: {
    nombre: "Velocidad de la flota",
    descripcion: "Excesos de velocidad de esta semana frente a la anterior. Solo totales, sin nombres.",
    familia: "velocidad",
    w: 1200,
    h: 340,
  },
  huella_hoy: {
    nombre: "Huella de hoy",
    descripcion: "De los conductores que ya salieron a rodar hoy, cuántos pasaron la huella y cuántos no.",
    familia: "marcaciones",
    w: 1100,
    h: 380,
  },
  vacantes: {
    nombre: "Vacantes y Plan Padrino",
    descripcion: "Cargos abiertos y cuánto gana quien refiere a un conductor.",
    familia: "vacantes",
    w: 1200,
    h: 560,
  },
  bienvenida: {
    nombre: "Bienvenida a nuevos",
    descripcion: "Quienes ingresaron a la empresa este mes.",
    familia: "bienvenidas",
    w: 800,
    h: 700,
  },
  qr: {
    nombre: "Código QR",
    descripcion: "Para abrir un enlace con la cámara del celular (reportar un daño, una vacante, una encuesta…).",
    familia: null,
    w: 560,
    h: 680,
  },
} as const;
export type TipoWidget = keyof typeof WIDGETS;
export type FamiliaDatos = Exclude<(typeof WIDGETS)[TipoWidget]["familia"], null>;

export type Widget =
  | { tipo: "acc_kpis"; tema: TemaWidget }
  | { tipo: "acc_serie"; tema: TemaWidget; meses: 6 | 12 }
  | { tipo: "acc_dias_sin"; tema: TemaWidget }
  | { tipo: "aus_kpis"; tema: TemaWidget }
  | { tipo: "aus_serie"; tema: TemaWidget }
  | { tipo: "marc_hoy"; tema: TemaWidget }
  | { tipo: "cumple_mes"; tema: TemaWidget; maxFilas: number }
  | { tipo: "aniv_mes"; tema: TemaWidget; maxFilas: number }
  | { tipo: "reloj"; tema: TemaWidget; formato: "hora" | "fecha_hora" }
  | { tipo: "acc_factor"; tema: TemaWidget }
  | { tipo: "vel_semana"; tema: TemaWidget }
  | { tipo: "huella_hoy"; tema: TemaWidget }
  | { tipo: "vacantes"; tema: TemaWidget }
  | { tipo: "bienvenida"; tema: TemaWidget; maxFilas: number }
  /** `destino`: ruta de la app («/reportar-dano») o dirección https. */
  | { tipo: "qr"; tema: TemaWidget; destino: string; texto: string };

/** Destinos listos para el QR (rutas públicas de la app). */
export const DESTINOS_QR = [{ ruta: "/reportar-dano", nombre: "Reportar un daño del bus", texto: "Reporte un daño desde su celular" }] as const;

/** Ruta de la app («/reportar-dano») o dirección https sin rarezas. */
export function esDestinoQr(v: unknown): v is string {
  if (typeof v !== "string" || !v || v.length > 300 || /["'<>\s\\]/.test(v)) return false;
  if (v.startsWith("/")) return /^\/[A-Za-z0-9\-_/?=&.%]*$/.test(v) && !v.startsWith("//");
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && u.href === v;
  } catch {
    return false;
  }
}

export type ElementoTexto = Caja & {
  tipo: "texto";
  texto: string;
  fuente: FuenteClave;
  /** px del lienzo. */
  tamano: number;
  color: string;
  negrita: boolean;
  cursiva: boolean;
  alineacion: Alineacion;
  sombra: boolean;
  /** 0.8-2. */
  interlineado: number;
};
/** Marco alrededor de una imagen o un video: grosor en px del lienzo (0 = sin marco) y color. */
export interface Marco {
  marco: number;
  colorMarco: string;
}
export const MAX_MARCO = 80;

export type ElementoImagen = Caja & Marco & { tipo: "imagen"; imagen: RefMedio; ajuste: Ajuste; radio: number };
export type ElementoVideo = Caja & Marco & {
  tipo: "video";
  /** Siempre del bucket `pantalla`. */
  video: RefMedio;
  /** Primer fotograma: lo que pinta el editor y lo que queda si el TV no reproduce el video. */
  poster: RefMedio | null;
  /** Medida al subir; null = desconocida. */
  duracionSeg: number | null;
  ajuste: Ajuste;
  radio: number;
  /** Sin gesto del usuario, el navegador solo reproduce en silencio. */
  silenciado: boolean;
  /** Se ignora si la diapositiva avanza al terminar este video. */
  bucle: boolean;
};
export type ElementoForma = Caja & {
  tipo: "forma";
  /** Clave del catálogo `formas.ts`. */
  forma: ClaveForma;
  relleno: string;
  borde: string;
  grosorBorde: number;
  /** Solo el rectángulo. */
  radio: number;
};
export type ElementoWidget = Caja & { tipo: "widget"; widget: Widget };
/** Un emoticono que llena su caja (se pinta con la fuente de emoticonos de la app). */
export type ElementoEmoji = Caja & { tipo: "emoji"; emoji: string; sombra: boolean };
/** Ícono vectorial de un color (catálogo `iconos.ts`), con fondo opcional tipo señal. */
export type ElementoIcono = Caja & {
  tipo: "icono";
  icono: ClaveIcono;
  color: string;
  /** Grosor del trazo, 1-3 (2 = el normal). */
  grosor: number;
  fondo: FondoIcono;
  colorFondo: string;
  sombra: boolean;
};
/** Video desde un enlace: YouTube, Vimeo o un MP4/WebM en otra dirección. */
export type ElementoVideoWeb = Caja &
  Marco & {
    tipo: "video_web";
    web: RefVideoWeb;
    /** Título del video (informativo, para el editor). */
    titulo: string;
    /** Miniatura de Vimeo (la de YouTube se arma con el id). */
    miniatura: string | null;
    /** Medida al insertar; null = desconocida (no puede mandar la diapositiva). */
    duracionSeg: number | null;
    radio: number;
    silenciado: boolean;
    bucle: boolean;
  };

export type Elemento =
  | ElementoTexto
  | ElementoImagen
  | ElementoVideo
  | ElementoVideoWeb
  | ElementoForma
  | ElementoWidget
  | ElementoEmoji
  | ElementoIcono;
/** Lo que se reproduce: video propio o desde enlace. */
export type ElementoReproducible = ElementoVideo | ElementoVideoWeb;
export type TipoElemento = Elemento["tipo"];

export interface Diapositiva {
  id: string;
  /** "" permitido: el panel muestra «Diapositiva n». */
  nombre: string;
  fondo: Fondo;
  /** "tiempo": dura `duracionSeg`. "video": dura lo que el video más largo; sin videos cae a `duracionSeg`. */
  avance: "tiempo" | "video";
  duracionSeg: number;
  /** Con la que ENTRA esta diapositiva. */
  transicion: Transicion;
  /** Orden = orden de capa (el último queda encima). */
  elementos: Elemento[];
}

export interface Presentacion {
  version: 1;
  diapositivas: Diapositiva[];
}

// ── Fábricas ────────────────────────────────────────────────────────────────

/** Id corto para elementos y diapositivas. No es secreto: solo distingue. */
export function nuevoId(): string {
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const COLOR_FONDO = "#0f172a";

export function diapositivaVacia(): Diapositiva {
  return {
    id: nuevoId(),
    nombre: "",
    fondo: { tipo: "color", color: COLOR_FONDO },
    avance: "tiempo",
    duracionSeg: DURACION.defecto,
    transicion: "fundido",
    elementos: [],
  };
}

export function presentacionVacia(): Presentacion {
  return { version: 1, diapositivas: [diapositivaVacia()] };
}

const cajaBase = (w: number, h: number): Omit<Caja, "id"> => ({
  x: Math.round((LIENZO.ancho - w) / 2),
  y: Math.round((LIENZO.alto - h) / 2),
  w,
  h,
  rot: 0,
  opacidad: 1,
  entrada: { animacion: "ninguna", retardoMs: 0 },
  efecto: { tipo: "ninguno", velocidad: "normal" },
});

export function crearTexto(texto = "Escriba aquí"): ElementoTexto {
  return {
    id: nuevoId(),
    ...cajaBase(1000, 200),
    tipo: "texto",
    texto,
    fuente: "inter",
    tamano: 96,
    color: "#ffffff",
    negrita: true,
    cursiva: false,
    alineacion: "centro",
    sombra: false,
    interlineado: 1.15,
  };
}

export function crearForma(forma: ClaveForma): ElementoForma {
  const prop = "proporcion" in FORMAS[forma] ? (FORMAS[forma] as { proporcion: number }).proporcion : 1.5;
  const [w, h] = forma === "linea" ? [800, 8] : prop >= 1 ? [Math.round(400 * prop), 400] : [400, Math.round(400 / prop)];
  return {
    id: nuevoId(),
    ...cajaBase(w, h),
    tipo: "forma",
    forma,
    relleno: forma === "linea" ? "#ffffff" : "#2a78d6",
    borde: "#ffffff",
    grosorBorde: 0,
    radio: forma === "rect" ? 24 : 0,
  };
}

/** Tamaño que cabe en el lienzo (80 %) conservando la proporción del medio. */
export function tamanoQueCabe(ancho: number | null, alto: number | null): { w: number; h: number } {
  const maxW = LIENZO.ancho * 0.8;
  const maxH = LIENZO.alto * 0.8;
  if (!ancho || !alto || ancho <= 0 || alto <= 0) return { w: 960, h: 540 };
  const escala = Math.min(maxW / ancho, maxH / alto, 1.5);
  return { w: Math.round(ancho * escala), h: Math.round(alto * escala) };
}

export function crearImagen(imagen: RefMedio, ancho: number | null, alto: number | null): ElementoImagen {
  const { w, h } = tamanoQueCabe(ancho, alto);
  return { id: nuevoId(), ...cajaBase(w, h), tipo: "imagen", imagen, ajuste: "cubrir", radio: 0, marco: 0, colorMarco: "#ffffff" };
}

export function crearVideo(m: {
  path: string;
  posterPath: string | null;
  ancho: number | null;
  alto: number | null;
  duracionSeg: number | null;
}): ElementoVideo {
  const { w, h } = tamanoQueCabe(m.ancho, m.alto);
  return {
    id: nuevoId(),
    ...cajaBase(w, h),
    tipo: "video",
    video: { bucket: "pantalla", path: m.path },
    poster: m.posterPath ? { bucket: "pantalla", path: m.posterPath } : null,
    duracionSeg: m.duracionSeg,
    ajuste: "cubrir",
    radio: 0,
    marco: 0,
    colorMarco: "#ffffff",
    silenciado: true,
    bucle: true,
  };
}

export function crearVideoWeb(m: { web: RefVideoWeb; titulo: string; miniatura: string | null; duracionSeg: number | null }): ElementoVideoWeb {
  return {
    id: nuevoId(),
    ...cajaBase(1280, 720),
    tipo: "video_web",
    web: m.web,
    titulo: m.titulo.slice(0, 120),
    miniatura: m.miniatura,
    duracionSeg: m.duracionSeg,
    radio: 0,
    marco: 0,
    colorMarco: "#ffffff",
    silenciado: true,
    bucle: true,
  };
}

/** Por defecto parece una señal: ícono blanco sobre círculo azul. */
export function crearIcono(icono: ClaveIcono): ElementoIcono {
  return {
    id: nuevoId(),
    ...cajaBase(300, 300),
    tipo: "icono",
    icono,
    color: "#ffffff",
    grosor: 2,
    fondo: "circulo",
    colorFondo: "#2a78d6",
    sombra: false,
  };
}

export function crearEmoji(emoji: string): ElementoEmoji {
  return { id: nuevoId(), ...cajaBase(300, 300), tipo: "emoji", emoji, sombra: false };
}

export function widgetPorDefecto(tipo: TipoWidget): Widget {
  switch (tipo) {
    case "acc_serie":
      return { tipo, tema: "oscuro", meses: 12 };
    case "cumple_mes":
    case "aniv_mes":
    case "bienvenida":
      return { tipo, tema: "oscuro", maxFilas: 10 };
    case "reloj":
      return { tipo, tema: "oscuro", formato: "fecha_hora" };
    case "qr":
      return { tipo, tema: "claro", destino: DESTINOS_QR[0].ruta, texto: DESTINOS_QR[0].texto };
    default:
      return { tipo, tema: "oscuro" };
  }
}

export function crearWidget(tipo: TipoWidget): ElementoWidget {
  const def = WIDGETS[tipo];
  return { id: nuevoId(), ...cajaBase(def.w, def.h), tipo: "widget", widget: widgetPorDefecto(tipo) };
}

// ── Consultas ───────────────────────────────────────────────────────────────

export function claveDeRef(r: RefMedio): string {
  return `${r.bucket}/${r.path}`;
}

/** Tipos de widget presentes: el servidor calcula solo los datos que se usan. */
export function tiposDeWidget(p: Presentacion): Set<TipoWidget> {
  const s = new Set<TipoWidget>();
  for (const d of p.diapositivas) for (const e of d.elementos) if (e.tipo === "widget") s.add(e.widget.tipo);
  return s;
}

export function familiasDeDatos(tipos: Iterable<TipoWidget>): Set<FamiliaDatos> {
  const s = new Set<FamiliaDatos>();
  for (const t of tipos) {
    const f = WIDGETS[t].familia;
    if (f) s.add(f);
  }
  return s;
}

/**
 * Archivos que usa la presentación, sin repetir: fondos, imágenes, videos y
 * los pósters de los videos (que se tratan como imagen).
 */
export function refsDeMedios(p: Presentacion): { ref: RefMedio; tipo: TipoMedio }[] {
  const vistos = new Map<string, { ref: RefMedio; tipo: TipoMedio }>();
  const add = (ref: RefMedio | null | undefined, tipo: TipoMedio) => {
    if (!ref) return;
    const k = claveDeRef(ref);
    if (!vistos.has(k)) vistos.set(k, { ref, tipo });
  };
  for (const d of p.diapositivas) {
    if (d.fondo.tipo === "imagen") add(d.fondo.imagen, "imagen");
    for (const e of d.elementos) {
      if (e.tipo === "imagen") add(e.imagen, "imagen");
      if (e.tipo === "video") {
        add(e.video, "video");
        add(e.poster, "imagen");
      }
    }
  }
  return [...vistos.values()];
}

/** ¿Usa la presentación este archivo? (para no borrar un medio en uso). */
export function usaMedio(p: Presentacion, bucket: RefMedio["bucket"], path: string): boolean {
  return refsDeMedios(p).some((r) => r.ref.bucket === bucket && r.ref.path === path);
}

/** Videos propios y desde enlace de la diapositiva. */
export function videosDe(d: Diapositiva): ElementoReproducible[] {
  return d.elementos.filter((e): e is ElementoReproducible => e.tipo === "video" || e.tipo === "video_web");
}

/**
 * El video que decide cuándo termina la diapositiva: el de mayor duración
 * conocida, solo si la diapositiva avanza por video.
 */
export function videoQueManda(d: Diapositiva): ElementoReproducible | null {
  if (d.avance !== "video") return null;
  let mejor: ElementoReproducible | null = null;
  for (const v of videosDe(d)) {
    if (v.duracionSeg == null || !(v.duracionSeg > 0)) continue;
    if (!mejor || v.duracionSeg > (mejor.duracionSeg ?? 0)) mejor = v;
  }
  return mejor;
}

/** Cuánto dura la diapositiva y si la decide un video. */
export function duracionEfectiva(d: Diapositiva): { seg: number; porVideo: boolean } {
  const v = videoQueManda(d);
  if (v?.duracionSeg) return { seg: Math.round(v.duracionSeg * 10) / 10, porVideo: true };
  return { seg: d.duracionSeg, porVideo: false };
}

export function duracionTotal(p: Presentacion): number {
  return p.diapositivas.reduce((a, d) => a + duracionEfectiva(d).seg, 0);
}

export function tamanoJson(p: Presentacion): number {
  return new TextEncoder().encode(JSON.stringify(p)).length;
}

// ── Edición pura ────────────────────────────────────────────────────────────

/** Mueve el elemento de la posición `de` a la posición `a`. */
export function reordenar<T>(lista: readonly T[], de: number, a: number): T[] {
  if (de === a || de < 0 || de >= lista.length || a < 0 || a >= lista.length) return [...lista];
  const copia = [...lista];
  const [x] = copia.splice(de, 1);
  copia.splice(a, 0, x);
  return copia;
}

function clonar<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function duplicarElemento(e: Elemento): Elemento {
  const c = clonar(e);
  c.id = nuevoId();
  c.x += 40;
  c.y += 40;
  return c;
}

export function duplicarDiapositiva(d: Diapositiva): Diapositiva {
  const c = clonar(d);
  c.id = nuevoId();
  c.elementos = c.elementos.map((e) => ({ ...e, id: nuevoId() }));
  return c;
}

/** Sube (+1) o baja (-1) una capa; al extremo con "frente"/"fondo". */
export function moverCapa(d: Diapositiva, id: string, hacia: 1 | -1 | "frente" | "fondo"): Diapositiva {
  const i = d.elementos.findIndex((e) => e.id === id);
  if (i < 0) return d;
  const ultimo = d.elementos.length - 1;
  const destino = hacia === "frente" ? ultimo : hacia === "fondo" ? 0 : Math.min(ultimo, Math.max(0, i + hacia));
  return { ...d, elementos: reordenar(d.elementos, i, destino) };
}

// ── Validación ──────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

const num = (v: unknown, min: number, max: number, defecto: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v * 100) / 100)) : defecto;
const entero = (v: unknown, min: number, max: number, defecto: number): number =>
  Math.round(num(v, min, max, defecto));
const grados = (v: unknown): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.round((((n % 360) + 360) % 360) * 10) / 10;
};
const bool = (v: unknown, defecto: boolean) => (typeof v === "boolean" ? v : defecto);
const uno = <T extends string>(v: unknown, opciones: readonly T[], defecto: T): T =>
  typeof v === "string" && (opciones as readonly string[]).includes(v) ? (v as T) : defecto;

const COLOR = /^#[0-9a-f]{6}$/i;
export function esColor(v: unknown): v is string {
  return typeof v === "string" && COLOR.test(v);
}
const color = (v: unknown, defecto: string) => (esColor(v) ? v.toLowerCase() : defecto);

const ID = /^[\w-]{1,40}$/;
const id = (v: unknown, usados: Set<string>): string => {
  let r = typeof v === "string" && ID.test(v) ? v : nuevoId();
  while (usados.has(r)) r = nuevoId();
  usados.add(r);
  return r;
};

const textoLimpio = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, max) : "";

/** Referencia a una IMAGEN: biblioteca propia (sin pósters ni videos) o foto de accidente. */
export function validarRefImagen(v: unknown): RefMedio | null {
  if (!esObj(v) || typeof v.path !== "string") return null;
  if (v.bucket === "pantalla" && RUTA_MEDIO.test(v.path) && /\.(jpg|png|webp)$/i.test(v.path)) {
    return { bucket: "pantalla", path: v.path };
  }
  if (v.bucket === "accidentes" && RUTA_FOTO_ACCIDENTE.test(v.path)) return { bucket: "accidentes", path: v.path };
  return null;
}

function validarRefVideo(v: unknown): RefMedio | null {
  if (!esObj(v) || v.bucket !== "pantalla" || typeof v.path !== "string") return null;
  return RUTA_MEDIO.test(v.path) && /^[^.]+\.(mp4|webm)$/i.test(v.path.split("/")[1] ?? "")
    ? { bucket: "pantalla", path: v.path }
    : null;
}

function validarPoster(v: unknown): RefMedio | null {
  if (!esObj(v) || v.bucket !== "pantalla" || typeof v.path !== "string") return null;
  return RUTA_MEDIO.test(v.path) && /\.poster\.jpg$/i.test(v.path) ? { bucket: "pantalla", path: v.path } : null;
}

function validarFondo(v: unknown): Fondo {
  const defecto: Fondo = { tipo: "color", color: COLOR_FONDO };
  if (!esObj(v)) return defecto;
  switch (v.tipo) {
    case "color":
      return { tipo: "color", color: color(v.color, COLOR_FONDO) };
    case "degradado":
      return {
        tipo: "degradado",
        desde: color(v.desde, "#0f172a"),
        hasta: color(v.hasta, "#2a78d6"),
        angulo: grados(v.angulo),
      };
    case "imagen": {
      const imagen = validarRefImagen(v.imagen);
      if (!imagen) return defecto;
      return {
        tipo: "imagen",
        imagen,
        ajuste: uno(v.ajuste, ["cubrir", "contener"], "cubrir"),
        oscurecer: num(v.oscurecer, 0, 0.9, 0),
      };
    }
    default:
      return defecto;
  }
}

function validarWidget(v: unknown): Widget | null {
  if (!esObj(v) || typeof v.tipo !== "string" || !(v.tipo in WIDGETS)) return null;
  const tipo = v.tipo as TipoWidget;
  const tema = uno<TemaWidget>(v.tema, ["claro", "oscuro"], "oscuro");
  switch (tipo) {
    case "acc_serie":
      return { tipo, tema, meses: v.meses === 6 ? 6 : 12 };
    case "cumple_mes":
    case "aniv_mes":
    case "bienvenida":
      return { tipo, tema, maxFilas: entero(v.maxFilas, 1, 30, 10) };
    case "reloj":
      return { tipo, tema, formato: v.formato === "hora" ? "hora" : "fecha_hora" };
    case "qr":
      if (!esDestinoQr(v.destino)) return null;
      return { tipo, tema, destino: v.destino, texto: textoLimpio(v.texto, 80).replace(/\n/g, " ").replace(/[<>]/g, "") };
    default:
      return { tipo, tema };
  }
}

function validarCaja(o: Obj, usados: Set<string>): Caja {
  const entrada = esObj(o.entrada) ? o.entrada : {};
  const efecto = esObj(o.efecto) ? o.efecto : {};
  return {
    id: id(o.id, usados),
    x: num(o.x, -LIENZO.ancho, 2 * LIENZO.ancho, 0),
    y: num(o.y, -LIENZO.alto, 2 * LIENZO.alto, 0),
    w: num(o.w, 4, 4 * LIENZO.ancho, 200),
    h: num(o.h, 2, 4 * LIENZO.alto, 200),
    rot: grados(o.rot),
    opacidad: num(o.opacidad, 0, 1, 1),
    entrada: {
      animacion: uno(entrada.animacion, Object.keys(ANIMACIONES) as Animacion[], "ninguna"),
      retardoMs: entero(entrada.retardoMs, 0, 10_000, 0),
    },
    efecto: {
      tipo: uno(efecto.tipo, Object.keys(EFECTOS) as Efecto[], "ninguno"),
      velocidad: uno(efecto.velocidad, Object.keys(VELOCIDADES) as Velocidad[], "normal"),
    },
  };
}

function validarElemento(v: unknown, usados: Set<string>): Elemento | null {
  if (!esObj(v)) return null;
  switch (v.tipo) {
    case "texto": {
      const texto = textoLimpio(v.texto, MAX_TEXTO);
      if (!texto.trim()) return null;
      return {
        ...validarCaja(v, usados),
        tipo: "texto",
        texto,
        fuente: esFuente(v.fuente) ? v.fuente : "inter",
        tamano: entero(v.tamano, TAMANO_TEXTO.min, TAMANO_TEXTO.max, 96),
        color: color(v.color, "#ffffff"),
        negrita: bool(v.negrita, false),
        cursiva: bool(v.cursiva, false),
        alineacion: uno<Alineacion>(v.alineacion, ["izquierda", "centro", "derecha"], "izquierda"),
        sombra: bool(v.sombra, false),
        interlineado: num(v.interlineado, 0.8, 2, 1.15),
      };
    }
    case "imagen": {
      const imagen = validarRefImagen(v.imagen);
      if (!imagen) return null;
      return {
        ...validarCaja(v, usados),
        tipo: "imagen",
        imagen,
        ajuste: uno(v.ajuste, ["cubrir", "contener"], "cubrir"),
        radio: entero(v.radio, 0, 540, 0),
        marco: entero(v.marco, 0, MAX_MARCO, 0),
        colorMarco: color(v.colorMarco, "#ffffff"),
      };
    }
    case "video": {
      const video = validarRefVideo(v.video);
      if (!video) return null;
      const dur = v.duracionSeg;
      return {
        ...validarCaja(v, usados),
        tipo: "video",
        video,
        poster: validarPoster(v.poster),
        duracionSeg: typeof dur === "number" && Number.isFinite(dur) && dur > 0 && dur <= 3600 ? Math.round(dur * 100) / 100 : null,
        ajuste: uno(v.ajuste, ["cubrir", "contener"], "cubrir"),
        radio: entero(v.radio, 0, 540, 0),
        marco: entero(v.marco, 0, MAX_MARCO, 0),
        colorMarco: color(v.colorMarco, "#ffffff"),
        silenciado: bool(v.silenciado, true),
        bucle: bool(v.bucle, true),
      };
    }
    case "forma":
      return {
        ...validarCaja(v, usados),
        tipo: "forma",
        forma: esForma(v.forma) ? v.forma : "rect",
        relleno: color(v.relleno, "#2a78d6"),
        borde: color(v.borde, "#ffffff"),
        grosorBorde: entero(v.grosorBorde, 0, 60, 0),
        radio: entero(v.radio, 0, 540, 0),
      };
    case "widget": {
      const widget = validarWidget(v.widget);
      if (!widget) return null;
      return { ...validarCaja(v, usados), tipo: "widget", widget };
    }
    case "video_web": {
      const web = validarRefVideoWeb(v.web);
      if (!web) return null;
      const dur = v.duracionSeg;
      return {
        ...validarCaja(v, usados),
        tipo: "video_web",
        web,
        titulo: textoLimpio(v.titulo, 120).replace(/\n/g, " ").replace(/[<>]/g, ""),
        miniatura: validarMiniaturaWeb(v.miniatura),
        duracionSeg: typeof dur === "number" && Number.isFinite(dur) && dur > 0 && dur <= 6 * 3600 ? Math.round(dur * 100) / 100 : null,
        radio: entero(v.radio, 0, 540, 0),
        marco: entero(v.marco, 0, MAX_MARCO, 0),
        colorMarco: color(v.colorMarco, "#ffffff"),
        silenciado: bool(v.silenciado, true),
        bucle: bool(v.bucle, true),
      };
    }
    case "icono": {
      if (!esIcono(v.icono)) return null;
      return {
        ...validarCaja(v, usados),
        tipo: "icono",
        icono: v.icono,
        color: color(v.color, "#ffffff"),
        grosor: num(v.grosor, 0.75, 3, 2),
        fondo: uno(v.fondo, Object.keys(FONDOS_ICONO) as FondoIcono[], "ninguno"),
        colorFondo: color(v.colorFondo, "#2a78d6"),
        sombra: bool(v.sombra, false),
      };
    }
    case "emoji": {
      if (!esEmoji(v.emoji)) return null;
      return { ...validarCaja(v, usados), tipo: "emoji", emoji: (v.emoji as string).trim(), sombra: bool(v.sombra, false) };
    }
    default:
      return null;
  }
}

function validarDiapositiva(v: unknown, usados: Set<string>): Diapositiva | null {
  if (!esObj(v)) return null;
  const elementos = Array.isArray(v.elementos)
    ? v.elementos
        .map((e) => validarElemento(e, usados))
        .filter((e): e is Elemento => e !== null)
        .slice(0, MAX_ELEMENTOS)
    : [];
  return {
    id: id(v.id, usados),
    nombre: textoLimpio(v.nombre, MAX_NOMBRE).replace(/\n/g, " ").trim(),
    fondo: validarFondo(v.fondo),
    avance: v.avance === "video" ? "video" : "tiempo",
    duracionSeg: entero(v.duracionSeg, DURACION.min, DURACION.max, DURACION.defecto),
    transicion: uno(v.transicion, Object.keys(TRANSICIONES) as Transicion[], "fundido"),
    elementos,
  };
}

/**
 * Presentación saneada, o null si no es una presentación. Descarta elementos
 * inválidos, recorta a los límites y normaliza colores, fuentes y rutas.
 * Una presentación sin diapositivas es válida (recién creada).
 */
export function validarPresentacion(v: unknown): Presentacion | null {
  if (!esObj(v) || v.version !== 1 || !Array.isArray(v.diapositivas)) return null;
  const usados = new Set<string>();
  const diapositivas = v.diapositivas
    .slice(0, MAX_DIAPOSITIVAS)
    .map((d) => validarDiapositiva(d, usados))
    .filter((d): d is Diapositiva => d !== null);
  return { version: 1, diapositivas };
}
