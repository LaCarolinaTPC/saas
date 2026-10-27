"use client";

/**
 * Widgets de datos vivos de la pantalla informativa. Se pintan dentro del
 * lienzo de 1920×1080 que luego se escala con CSS, así que todo va en píxeles
 * del lienzo y con tamaños fijos (Recharts sin ResponsiveContainer, que mide 0
 * dentro de un `transform: scale`). Pensados para leerse a varios metros:
 * cifras grandes, alto contraste, sin tooltips.
 *
 * Regla de tamaños: el Marco calcula el área útil EXACTA (caja menos relleno y
 * título) y se la pasa al contenido; cada texto grande se ajusta al ancho y al
 * alto que tiene (`tamParaCaber`). Así nada se sale del recuadro aunque la
 * persona lo achique en el editor o la cifra crezca a cinco dígitos.
 */

import { createContext, use, useEffect, useLayoutEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";
import { Cake, Handshake, PartyPopper, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { CAMPOS_ESTILO_WIDGET, LIENZO, MAX_ACCIDENTES_CARRUSEL, type ElementoWidget, type EstiloWidget, type TemaWidget } from "@/lib/pantalla/modelo";
import { fontFamilyDe } from "@/lib/pantalla/fuentes-catalogo";
import {
  CONSEJOS_FACTOR,
  fechaLarga,
  nombreMes,
  RESPONSABILIDAD_TV,
  panelesCarrusel,
  recomendacionDelDia,
  textoReincidencia,
  type AccidenteDelDia,
  type AccidentesDelDia,
  type DatosWidgets,
} from "@/lib/pantalla/datos-reglas";
import { MENSAJES_SIN_ACCIDENTES } from "@/lib/pantalla/mensajes-seguridad";
import { medidaPreventiva } from "@/lib/pantalla/medidas-accidente";
import { FUENTE_EMOJI } from "@/lib/pantalla/emojis";
import { MENSAJES_ANIVERSARIO, MENSAJES_CUMPLEANOS, elegirMensaje, textoAnios, unirNombres } from "@/lib/pantalla/mensajes-cumpleanos";
import { Ajustado } from "./Ajustado";

const AZUL = "#2a78d6";
const NARANJA = "#eb6834";
const VERDE = "#22c55e";
const ROJO = "#ef4444";
const AMARILLO = "#facc15";
/** «#rrggbb» + opacidad → rgba(). */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

type Paleta = {
  fondo: string;
  /** El fondo lo eligió la persona (el widget de cumpleaños deja su degradado). */
  fondoPropio: boolean;
  titulo: string;
  texto: string;
  suave: string;
  linea: string;
  tarjeta: string;
  azul: string;
  serie: string;
  destacado: string;
  destacadoPropio: boolean;
  fuente: string;
};

/** Colores y fuente del widget: los del tema, con lo que la persona haya cambiado encima. */
function paletaCon(tema: TemaWidget, e: EstiloWidget): Paleta {
  const claro = tema === "claro";
  const base = claro
    ? { fondoRgb: "#ffffff", opacidad: 0.94, texto: "#0f172a", suave: "#475569", linea: "#e2e8f0", tarjeta: "#f1f5f9", azul: AZUL }
    : { fondoRgb: "#0f172a", opacidad: 0.82, texto: "#ffffff", suave: "#cbd5e1", linea: "rgba(255,255,255,0.15)", tarjeta: "rgba(255,255,255,0.08)", azul: "#60a5fa" };
  const texto = e.colorTexto ?? base.texto;
  const fondoPropio = e.colorFondo != null || e.opacidadFondo != null;
  return {
    fondo: rgba(e.colorFondo ?? base.fondoRgb, e.opacidadFondo ?? base.opacidad),
    fondoPropio,
    titulo: e.colorTitulo ?? texto,
    texto,
    suave: e.colorTexto ? rgba(e.colorTexto, 0.75) : base.suave,
    linea: e.colorTexto ? rgba(e.colorTexto, 0.18) : base.linea,
    // Con colores propios la tarjeta sale del texto, para contrastar con cualquier fondo.
    tarjeta: e.colorTexto || e.colorFondo ? rgba(texto, 0.08) : base.tarjeta,
    azul: e.colorAcento ?? base.azul,
    serie: e.colorAcento ?? AZUL,
    destacado: e.colorDestacado ?? AMARILLO,
    destacadoPropio: e.colorDestacado != null,
    fuente: fontFamilyDe(e.fuente ?? "inter"),
  };
}

/** El estilo del widget que se está pintando; lo pone `WidgetPantalla`. */
const EstiloCtx = createContext<EstiloWidget>({});

function usePaleta(tema: TemaWidget): Paleta {
  // `use` (React 19) puede leerse desde cualquier función de render.
  return paletaCon(tema, use(EstiloCtx));
}

const miles = (n: number) => n.toLocaleString("es-CO");

/**
 * Tamaño de letra para que `texto` quepa en `ancho` × `alto` en una línea.
 * `proporcion` ≈ ancho medio de un carácter respecto al tamaño (0.6 en Inter
 * negrita para cifras; algo más para letras).
 */
function tamParaCaber(texto: string, ancho: number, alto: number, max: number, proporcion = 0.62, min = 14): number {
  const porAncho = ancho / Math.max(1, texto.length * proporcion);
  return Math.max(min, Math.floor(Math.min(max, porAncho, alto)));
}

type Area = { w: number; h: number };

/** Recuadro con fondo, relleno y título. El contenido recibe su área útil exacta. */
function Marco({
  tema,
  w,
  h,
  titulo,
  icono: Icono,
  children,
}: {
  tema: TemaWidget;
  w: number;
  h: number;
  titulo: string;
  icono?: LucideIcon;
  children: (area: Area) => React.ReactNode;
}) {
  const p = usePaleta(tema);
  const pad = Math.round(Math.max(16, Math.min(56, Math.min(w, h) * 0.07)));
  const anchoTitulo = w - pad * 2;
  // El alto del título sale del alto del recuadro; el ancho lo resuelve
  // <Ajustado>, que mide y achica si el título es largo (sin «…»).
  const tamTitulo = Math.max(18, Math.floor(Math.min(56, h * 0.12)));
  const altoTitulo = Math.round(tamTitulo * 1.2);
  const anchoTexto = anchoTitulo - (Icono ? Math.round(tamTitulo * 1.35) : 0);
  const separacion = Math.round(pad * 0.5);
  const area = { w: w - pad * 2, h: Math.max(0, h - pad * 2 - altoTitulo - separacion) };
  return (
    <div
      style={{
        width: w,
        height: h,
        boxSizing: "border-box",
        background: p.fondo,
        color: p.texto,
        borderRadius: Math.min(40, pad),
        padding: pad,
        overflow: "hidden",
        fontFamily: p.fuente,
      }}
    >
      <div style={{ height: altoTitulo, display: "flex", alignItems: "center", gap: Math.round(tamTitulo * 0.35), marginBottom: separacion }}>
        <Ajustado ancho={anchoTexto} alto={altoTitulo} max={tamTitulo} min={14} unaLinea soloLoNecesario clave={titulo} style={{ fontWeight: 700, lineHeight: 1.2, color: p.titulo }}>
          {titulo}
        </Ajustado>
        {Icono && <Icono style={{ width: tamTitulo, height: tamTitulo, flexShrink: 0, color: p.destacado }} />}
      </div>
      <div style={{ width: area.w, height: area.h, position: "relative", overflow: "hidden" }}>{children(area)}</div>
    </div>
  );
}

function SinDatos({ tema, area }: { tema: TemaWidget; area: Area }) {
  return (
    <Ajustado alto={area.h} max={Math.min(40, area.h * 0.3)} min={12} alinear="centro" style={{ color: usePaleta(tema).suave }}>
      Sin datos por ahora
    </Ajustado>
  );
}

type Ficha = { etiqueta: string; valor: string; extra?: { pct: number | null }; color?: string };

/**
 * Fichas de cifras en una fila. Si el recuadro es angosto (menos de ~260 px
 * por ficha) pasan a dos filas de dos para que la cifra siga siendo grande.
 */
/** Ancho «en caracteres» de una ficha: la cifra más la variación, que va a ~45 % del tamaño. */
/** «25%»; por encima de 999 % ya no aporta el número exacto y achicaría toda la fila. */
const textoVariacion = (pct: number | null | undefined) =>
  pct == null ? "" : Math.abs(pct) > 999 ? "+999%" : `${Math.abs(Math.round(pct))}%`;

function largoFicha(it: Ficha): number {
  const textoVar = textoVariacion(it.extra?.pct);
  return it.valor.length + (textoVar ? (textoVar.length + 1.6) * 0.45 : 0);
}

/** Medidas de las fichas en una grilla de `columnas`. */
function medirFichas(items: Ficha[], area: Area, columnas: number) {
  const gap = Math.round(Math.max(10, Math.min(24, area.w * 0.015)));
  const filas = Math.ceil(items.length / columnas);
  const anchoFicha = (area.w - gap * (columnas - 1)) / columnas;
  const altoFicha = (area.h - gap * (filas - 1)) / filas;
  const padX = Math.round(Math.max(10, Math.min(28, anchoFicha * 0.08)));
  const padY = Math.round(Math.max(8, Math.min(20, altoFicha * 0.08)));
  const util = { w: anchoFicha - padX * 2, h: altoFicha - padY * 2 };
  // Etiqueta: hasta dos líneas; crece con la ficha pero nunca a costa de la cifra.
  const tamEtiqueta = Math.max(14, Math.min(30, Math.floor(Math.min(util.h * 0.17, util.w / 9))));
  const altoCifra = Math.max(20, util.h - tamEtiqueta * 2.4 - 6);
  const largo = Math.max(...items.map(largoFicha));
  // Mismo tamaño de cifra en todas las fichas: se ven ordenadas.
  const tamValor = tamParaCaber("x".repeat(Math.ceil(largo)), util.w, altoCifra, 140, 0.6, 18);
  return { gap, filas, anchoFicha, altoFicha, padX, padY, tamEtiqueta, tamValor, util, altoCifra };
}

/**
 * Fichas de cifras. Se prueba una fila y, con cuatro, dos filas de dos: queda
 * la disposición que deja la cifra más grande.
 */
function Fichas({ tema, items, area }: { tema: TemaWidget; items: Ficha[]; area: Area }) {
  const p = usePaleta(tema);
  const opciones = items.length === 4 ? [4, 2] : [items.length];
  const medidas = opciones.map((c) => ({ columnas: c, ...medirFichas(items, area, c) }));
  const { columnas, gap, anchoFicha, altoFicha, padX, padY, tamEtiqueta, tamValor, util, altoCifra } = medidas.reduce((a, b) =>
    b.tamValor > a.tamValor * 1.08 ? b : a
  );
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columnas}, ${anchoFicha}px)`,
        gridAutoRows: `${altoFicha}px`,
        gap,
      }}
    >
      {items.map((it) => {
        const textoVar = textoVariacion(it.extra?.pct);
        const baja = (it.extra?.pct ?? 0) <= 0;
        const IconoVar = baja ? TrendingDown : TrendingUp;
        return (
          <div
            key={it.etiqueta}
            style={{
              boxSizing: "border-box",
              background: p.tarjeta,
              borderRadius: Math.round(Math.min(24, anchoFicha * 0.08)),
              padding: `${padY}px ${padX}px`,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <Ajustado
              ancho={util.w}
              alto={altoCifra}
              max={tamValor}
              min={14}
              unaLinea
              clave={`${it.valor}|${textoVar}`}
              style={{ fontWeight: 800, lineHeight: 1, color: it.color ?? p.texto, fontVariantNumeric: "tabular-nums" }}
            >
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: "0.12em" }}>
                {it.valor}
                {textoVar && (
                  // Para accidentes, bajar es bueno: verde.
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: "0.45em", color: baja ? VERDE : ROJO, fontWeight: 700 }}>
                    <IconoVar style={{ width: "1em", height: "1em" }} />
                    {textoVar}
                  </span>
                )}
              </span>
            </Ajustado>
            {/* La etiqueta se parte en las líneas que necesite y se achica para caber entera. */}
            <Ajustado
              ancho={util.w}
              alto={Math.round(tamEtiqueta * 2.5)}
              max={tamEtiqueta}
              min={10}
              vertical="arriba"
              clave={it.etiqueta}
              style={{ color: p.suave, lineHeight: 1.2, paddingTop: 6 }}
            >
              {it.etiqueta}
            </Ajustado>
          </div>
        );
      })}
    </div>
  );
}

function Reloj({ tema, formato, w, h }: { tema: TemaWidget; formato: "hora" | "fecha_hora"; w: number; h: number }) {
  const [ahora, setAhora] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la hora se pinta solo en el cliente (evita diferencias de hidratación)
    setAhora(new Date());
    const t = window.setInterval(() => setAhora(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const p = usePaleta(tema);
  const hora = ahora
    ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit", hour12: true }).format(ahora)
    : "";
  const fechaCruda = ahora
    ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" }).format(ahora)
    : "";
  // Solo la primera letra: «Lunes, 26 de octubre», no «De Octubre».
  const fecha = fechaCruda.charAt(0).toUpperCase() + fechaCruda.slice(1);
  const conFecha = formato === "fecha_hora";
  const pad = Math.round(Math.max(12, Math.min(40, Math.min(w, h) * 0.08)));
  const util = { w: w - pad * 2, h: h - pad * 2 };
  const altoHora = Math.round(util.h * (conFecha ? 0.64 : 0.95));
  const altoFecha = Math.round(util.h * 0.26);
  return (
    <div
      style={{
        width: w,
        height: h,
        boxSizing: "border-box",
        padding: pad,
        background: p.fondo,
        color: p.texto,
        borderRadius: Math.min(40, pad),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        fontFamily: p.fuente,
      }}
    >
      {/* Se mide con un texto de ancho máximo («12:59 p. m.») para que no salte al cambiar la hora. */}
      <Ajustado alto={altoHora} max={400} min={14} unaLinea alinear="centro" clave="hora" style={{ fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ display: "inline-grid" }}>
          <span style={{ gridArea: "1 / 1", visibility: "hidden" }}>12:59 p. m.</span>
          <span style={{ gridArea: "1 / 1", textAlign: "center" }}>{hora}</span>
        </span>
      </Ajustado>
      {conFecha && (
        <Ajustado alto={altoFecha} max={80} min={12} unaLinea alinear="centro" clave={fecha} style={{ color: p.suave, lineHeight: 1.1 }}>
          {fecha}
        </Ajustado>
      )}
    </div>
  );
}

/**
 * Lista de personas del mes. Las filas se reparten el alto disponible; si no
 * caben todas, se priorizan las de hoy y se reserva una línea para «y N más».
 */
function ListaPersonas({
  tema,
  personas,
  maxFilas,
  area,
  derecha,
  vacio,
}: {
  tema: TemaWidget;
  personas: { nombre: string; dia: number; esHoy: boolean }[];
  maxFilas: number;
  area: Area;
  derecha?: (p: { nombre: string; dia: number }) => string;
  vacio: string;
}) {
  const p = usePaleta(tema);
  if (personas.length === 0) {
    return (
      <Ajustado alto={Math.round(area.h * 0.4)} max={36} min={12} vertical="arriba" clave={vacio} style={{ color: p.suave, lineHeight: 1.25, paddingTop: 8 }}>
        {vacio}
      </Ajustado>
    );
  }
  // Ni más filas de las que permite la persona, ni filas de menos de ~44 px.
  const cabenPorAlto = Math.max(1, Math.floor(area.h / 44));
  let limite = Math.min(maxFilas, cabenPorAlto);
  const sobranSinRecorte = personas.length - limite;
  if (sobranSinRecorte > 0 && limite > 1) limite -= 1; // deja sitio para «y N más»
  const hoy = personas.filter((x) => x.esHoy);
  const resto = personas.filter((x) => !x.esHoy);
  const visibles = [...hoy, ...resto].slice(0, limite).sort((a, b) => a.dia - b.dia || a.nombre.localeCompare(b.nombre));
  const sobran = personas.length - visibles.length;
  // Con pocas personas las filas no se estiran de más: mínimo 5 «huecos».
  const huecos = Math.max(visibles.length + (sobran > 0 ? 1 : 0), Math.min(5, cabenPorAlto));
  const altoFila = Math.floor(area.h / huecos);
  const tam = Math.max(16, Math.min(52, Math.floor(altoFila * 0.48)));
  const anchoDia = Math.round(tam * 1.5);
  const tamDerecha = Math.round(tam * 0.75);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: area.w }}>
      {visibles.map((x) => {
        const textoDerecha = derecha?.(x);
        return (
          <div
            key={`${x.nombre}-${x.dia}`}
            style={{
              height: altoFila,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              gap: Math.round(tam * 0.45),
              fontSize: tam,
              lineHeight: 1.1,
              borderBottom: `2px solid ${p.linea}`,
              color: x.esHoy ? p.destacado : p.texto,
              fontWeight: x.esHoy ? 800 : 500,
            }}
          >
            <span style={{ width: anchoDia, flexShrink: 0, textAlign: "right", fontWeight: 800, color: x.esHoy ? p.destacado : p.azul, fontVariantNumeric: "tabular-nums" }}>
              {x.dia}
            </span>
            {/* Un nombre largo se achica para verse entero en vez de cortarse con «…». */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Ajustado alto={altoFila - 4} max={tam} min={Math.max(12, Math.round(tam * 0.5))} unaLinea clave={x.nombre} style={{ lineHeight: 1.1 }}>
                {x.nombre}
              </Ajustado>
            </div>
            {x.esHoy && <span style={{ flexShrink: 0, fontSize: tamDerecha, fontWeight: 800 }}>¡hoy!</span>}
            {textoDerecha && <span style={{ flexShrink: 0, color: x.esHoy ? p.destacado : p.suave, fontSize: tamDerecha, whiteSpace: "nowrap" }}>{textoDerecha}</span>}
          </div>
        );
      })}
      {sobran > 0 && (
        <div style={{ height: altoFila, display: "flex", alignItems: "center", color: p.suave, fontSize: tamDerecha, paddingLeft: anchoDia + Math.round(tam * 0.45) }}>
          y {sobran} más
        </div>
      )}
    </div>
  );
}

/** Margen de las gráficas: los rótulos de los ejes y de los valores no se cortan. */
function margenGrafica(tam: number) {
  return { top: Math.round(tam * 1.6), right: Math.round(tam * 0.6), left: Math.round(tam * 0.2), bottom: Math.round(tam * 0.4) };
}

/**
 * Relleno a los lados del eje X de la línea: sin él, el primer y el último
 * punto caen sobre el borde, su rótulo choca con el eje Y y el último mes se corta.
 */
const rellenoEjeX = (tam: number) => ({ left: Math.round(tam * 1.4), right: Math.round(tam * 1.6) });

/** Barra horizontal de proporción (verde = la parte buena). */
function Barra({ parte, total, alto, tema }: { parte: number; total: number; alto: number; tema: TemaWidget }) {
  const p = usePaleta(tema);
  const pct = total > 0 ? Math.max(0, Math.min(1, parte / total)) : 0;
  return (
    <div style={{ height: alto, borderRadius: alto, background: p.tarjeta, overflow: "hidden", display: "flex" }}>
      <div style={{ width: `${pct * 100}%`, background: VERDE, borderRadius: alto }} />
    </div>
  );
}

/** Código QR dibujado como SVG (nítido a cualquier tamaño). */
function CodigoQr({ texto, lado, oscuro, claro }: { texto: string; lado: number; oscuro: string; claro: string }) {
  const qr = useMemo(() => {
    try {
      return QRCode.create(texto, { errorCorrectionLevel: "M" }).modules;
    } catch {
      return null;
    }
  }, [texto]);
  if (!qr) return null;
  const margen = 2;
  const n = qr.size + margen * 2;
  let d = "";
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) if (qr.get(r, c)) d += `M${c + margen} ${r + margen}h1v1h-1z`;
  }
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={lado} height={lado} shapeRendering="crispEdges" style={{ display: "block", borderRadius: lado * 0.03 }} aria-label="Código QR">
      <rect width={n} height={n} fill={claro} />
      <path d={d} fill={oscuro} />
    </svg>
  );
}

function WidgetQr({ el }: { el: ElementoWidget & { widget: { tipo: "qr" } } }) {
  const { w, h, widget } = el;
  const p = usePaleta(widget.tema);
  // Las rutas de la app («/reportar-dano») se completan con la dirección del TV.
  const [origen, setOrigen] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la dirección solo existe en el navegador
    setOrigen(window.location.origin);
  }, []);
  const url = widget.destino.startsWith("/") ? (origen ? origen + widget.destino : "") : widget.destino;
  const pad = Math.round(Math.max(16, Math.min(48, Math.min(w, h) * 0.07)));
  const util = { w: w - pad * 2, h: h - pad * 2 };
  // Reparto fijo del alto: el texto (hasta ~3 líneas) y la dirección se
  // achican para caber enteros en su franja; el código se queda con el resto.
  const corta = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const separacion = Math.round(pad * 0.4);
  const altoTexto = widget.texto ? Math.round(util.h * 0.2) : 0;
  const altoUrl = Math.round(Math.max(16, util.h * 0.07));
  const lado = Math.max(40, Math.floor(Math.min(util.w, util.h - altoTexto - altoUrl - separacion * (widget.texto ? 2 : 1))));
  return (
    <div
      style={{
        width: w,
        height: h,
        boxSizing: "border-box",
        padding: pad,
        background: p.fondo,
        color: p.texto,
        borderRadius: Math.min(40, pad),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: separacion,
        overflow: "hidden",
        fontFamily: p.fuente,
        textAlign: "center",
      }}
    >
      {widget.texto && (
        <Ajustado ancho={util.w} alto={altoTexto} max={48} min={11} alinear="centro" clave={widget.texto} style={{ fontWeight: 700, lineHeight: 1.2 }}>
          {widget.texto}
        </Ajustado>
      )}
      <div style={{ width: lado, height: lado, background: "#fff", borderRadius: lado * 0.04, flexShrink: 0 }}>
        {url && <CodigoQr texto={url} lado={lado} oscuro="#0f172a" claro="#ffffff" />}
      </div>
      <Ajustado ancho={util.w} alto={altoUrl} max={26} min={9} unaLinea alinear="centro" clave={corta} style={{ color: p.suave }}>
        {corta}
      </Ajustado>
    </div>
  );
}

/**
 * Emoticono en una caja de ancho FIJO. Un glifo de emoticono es algo más ancho
 * que su tamaño de letra: sin caja fija empujaba el texto de al lado fuera del
 * recuadro, que lo cortaba.
 */
function EmojiFijo({ emoji, lado }: { emoji: string; lado: number }) {
  return (
    <span
      style={{
        width: lado,
        height: lado,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FUENTE_EMOJI,
        fontSize: lado * 0.86,
        lineHeight: 1,
        overflow: "hidden",
      }}
    >
      {emoji}
    </span>
  );
}

const fechaCorta = (iso: string) => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;

/** Confeti que cae detrás del contenido. Posiciones fijas (sin azar) para que servidor y navegador pinten lo mismo. */
const COLORES_CONFETI = [AMARILLO, AZUL, NARANJA, VERDE, "#ec4899", "#a855f7"];
function Confeti({ w, h }: { w: number; h: number }) {
  const piezas = Array.from({ length: 30 }, (_, i) => {
    const lado = Math.round(Math.max(8, Math.min(w, h) * (0.012 + ((i * 7) % 5) * 0.003)));
    return {
      left: ((i * 37) % 100) / 100,
      lado,
      redondo: i % 3 === 0,
      color: COLORES_CONFETI[i % COLORES_CONFETI.length],
      duracion: 7 + ((i * 13) % 7),
      retardo: -((i * 1.7) % 12),
    };
  });
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {piezas.map((pz, i) => (
        <span
          key={i}
          style={
            {
              position: "absolute",
              top: -pz.lado * 3,
              left: pz.left * w,
              width: pz.lado,
              height: pz.redondo ? pz.lado : pz.lado * 1.8,
              borderRadius: pz.redondo ? "50%" : 2,
              background: pz.color,
              opacity: 0.75,
              "--caida": `${h + pz.lado * 6}px`,
              animation: `pantalla-confeti ${pz.duracion}s linear ${pz.retardo}s infinite`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Último mensaje mostrado en este navegador, por clase: el siguiente sale distinto. */
const ultimoMensaje: Record<ClaseCelebracion, number | null> = { cumple: null, aniv: null };

type ClaseCelebracion = "cumple" | "aniv";
type PersonaCelebrada = { nombre: string; dia: number; esHoy: boolean; anios?: number };

const CELEBRACION = {
  cumple: {
    mensajes: MENSAJES_CUMPLEANOS,
    emoji: "🎂",
    emojiEspera: "🎈",
    titulo: "¡Feliz cumpleaños!",
    proximo: ["Próximo cumpleaños", "Próximos cumpleaños"],
    delMes: "Cumpleaños de",
    invitacion: "¡Que nadie se quede sin su felicitación!",
    ninguno: "No quedan cumpleaños este mes.",
    icono: Cake,
  },
  aniv: {
    mensajes: MENSAJES_ANIVERSARIO,
    emoji: "🏆",
    emojiEspera: "🎉",
    titulo: "¡Feliz aniversario!",
    proximo: ["Próximo aniversario", "Próximos aniversarios"],
    delMes: "Aniversarios de",
    invitacion: "¡A celebrar su trayectoria!",
    ninguno: "No quedan aniversarios este mes.",
    icono: PartyPopper,
  },
} as const;

/**
 * Felicitación a pantalla completa (cumpleaños o aniversario en la empresa).
 * A la izquierda, en grande, quienes celebran hoy con un mensaje al azar
 * (cambia cada vez que la diapositiva vuelve a salir y nunca repite el
 * anterior); a la derecha, los que vienen en el mes. Si hoy nadie celebra, el
 * protagonista es el próximo del mes.
 */
function Celebracion({
  clase,
  w,
  h,
  tema,
  maxFilas,
  personas: lista,
  mes,
}: {
  clase: ClaseCelebracion;
  w: number;
  h: number;
  tema: TemaWidget;
  maxFilas: number;
  /** null = no hay datos. */
  personas: PersonaCelebrada[] | null;
  mes: string;
}) {
  const c = CELEBRACION[clase];
  const p = usePaleta(tema);
  const oscuro = tema === "oscuro";
  // Amarillo no se lee sobre fondo claro: ahí la felicitación va en naranja oscuro.
  const acento = p.destacadoPropio || oscuro ? p.destacado : "#c2410c";

  const [indice, setIndice] = useState<number | null>(null);
  useLayoutEffect(() => {
    const i = elegirMensaje(CELEBRACION[clase].mensajes.length, ultimoMensaje[clase]);
    ultimoMensaje[clase] = i;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el azar se resuelve solo en el navegador (no en el render del servidor) y antes de pintar
    setIndice(i);
  }, [clase]);
  const mensaje: string = c.mensajes[indice ?? 0];

  const personas = lista ?? [];
  const deHoy = personas.filter((x) => x.esHoy);
  // Sin nadie hoy, protagoniza el día más cercano que queda en el mes.
  const diaProximo = deHoy.length === 0 && personas.length > 0 ? Math.min(...personas.map((x) => x.dia)) : null;
  const protagonistas = deHoy.length > 0 ? deHoy : personas.filter((x) => x.dia === diaProximo);
  const resto = personas.filter((x) => !protagonistas.includes(x));

  const pad = Math.round(Math.max(24, Math.min(w, h) * 0.06));
  const util = { w: w - pad * 2, h: h - pad * 2 };
  const conLista = resto.length > 0 && w >= 900;
  const gap = Math.round(pad * 0.8);
  const anchoLista = conLista ? Math.round(util.w * 0.34) : 0;
  const anchoHeroe = util.w - (conLista ? anchoLista + gap : 0);

  // Una sola persona de aniversario: los años van en su propia línea, grandes.
  const aniosUna = clase === "aniv" && protagonistas.length === 1 ? protagonistas[0].anios : undefined;
  const altoEmoji = Math.round(util.h * 0.18);
  const altoTitulo = Math.round(util.h * 0.14);
  const altoAnios = aniosUna != null ? Math.round(util.h * 0.1) : 0;
  const altoNombres = Math.round(util.h * (aniosUna != null ? 0.22 : 0.28));
  const altoMensaje = Math.round(util.h * 0.22);
  const hueco = Math.round(util.h * 0.022);

  let emoji: string = c.emoji;
  let titulo: string = c.titulo;
  // Varias personas de aniversario: «Carlos Rojas (10 años) y Diana Mora (3 años)».
  let nombres = unirNombres(
    protagonistas.map((x) => (clase === "aniv" && aniosUna == null && x.anios != null ? `${x.nombre} (${textoAnios(x.anios)})` : x.nombre))
  );
  let texto = mensaje;
  let anios = aniosUna != null ? `¡${textoAnios(aniosUna)} con nosotros!` : "";
  if (lista == null) {
    emoji = c.emojiEspera;
    titulo = `${c.delMes} ${mes}`;
    nombres = "";
    anios = "";
    texto = "Sin datos por ahora";
  } else if (deHoy.length === 0 && diaProximo != null) {
    emoji = c.emojiEspera;
    titulo = c.proximo[protagonistas.length === 1 ? 0 : 1];
    texto = `El ${diaProximo} de ${mes}. ${c.invitacion}`;
    if (aniosUna != null) anios = `${textoAnios(aniosUna)} en la empresa`;
  } else if (personas.length === 0) {
    emoji = c.emojiEspera;
    titulo = `${c.delMes} ${mes}`;
    nombres = "";
    texto = c.ninguno;
  }

  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        boxSizing: "border-box",
        padding: pad,
        background: p.fondoPropio
          ? p.fondo
          : oscuro
            ? "linear-gradient(135deg, #1e1b4b 0%, #0f172a 55%, #3b0764 100%)"
            : "linear-gradient(135deg, #fff7ed 0%, #ffffff 55%, #fdf2f8 100%)",
        color: p.texto,
        // A pantalla completa, sin esquinas redondas (se vería el fondo de la diapositiva).
        borderRadius: w >= LIENZO.ancho - 20 && h >= LIENZO.alto - 20 ? 0 : Math.min(40, pad),
        overflow: "hidden",
        fontFamily: p.fuente,
      }}
    >
      <Confeti w={w} h={h} />
      <div style={{ position: "relative", display: "flex", gap, height: util.h }}>
        <div
          style={{
            width: anchoHeroe,
            height: util.h,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: hueco,
            textAlign: "center",
          }}
        >
          <span style={{ animation: "pantalla-ef-latido 2.4s ease-in-out infinite" }}>
            <EmojiFijo emoji={emoji} lado={altoEmoji} />
          </span>
          <Ajustado ancho={anchoHeroe} alto={altoTitulo} max={180} min={16} unaLinea alinear="centro" clave={titulo} style={{ fontWeight: 900, lineHeight: 1.05, color: acento }}>
            {titulo}
          </Ajustado>
          {nombres && (
            <Ajustado ancho={anchoHeroe} alto={altoNombres} max={150} min={16} alinear="centro" clave={nombres} style={{ fontWeight: 800, lineHeight: 1.1, color: p.titulo }}>
              {nombres}
            </Ajustado>
          )}
          {anios && (
            <Ajustado ancho={anchoHeroe} alto={altoAnios} max={90} min={14} unaLinea alinear="centro" clave={anios} style={{ fontWeight: 800, lineHeight: 1.1, color: acento }}>
              {anios}
            </Ajustado>
          )}
          <Ajustado ancho={Math.round(anchoHeroe * 0.9)} alto={altoMensaje} max={64} min={12} alinear="centro" clave={texto} style={{ color: p.suave, lineHeight: 1.3, fontWeight: 500 }}>
            {texto}
          </Ajustado>
        </div>
        {conLista && (
          <ProximosDelMes clase={clase} tema={tema} ancho={anchoLista} alto={util.h} mes={mes} personas={resto} maxFilas={maxFilas} />
        )}
      </div>
    </div>
  );
}

function ProximosDelMes({
  clase,
  tema,
  ancho,
  alto,
  mes,
  personas,
  maxFilas,
}: {
  clase: ClaseCelebracion;
  tema: TemaWidget;
  ancho: number;
  alto: number;
  mes: string;
  personas: PersonaCelebrada[];
  maxFilas: number;
}) {
  const p = usePaleta(tema);
  const Icono = CELEBRACION[clase].icono;
  const pad = Math.round(Math.max(16, Math.min(40, ancho * 0.07)));
  const tamTitulo = Math.max(18, Math.min(52, Math.round(ancho * 0.075)));
  const altoTitulo = Math.round(tamTitulo * 1.25);
  const sep = Math.round(pad * 0.6);
  const area = { w: ancho - pad * 2, h: alto - pad * 2 - altoTitulo - sep };
  return (
    <div
      style={{
        width: ancho,
        height: alto,
        flexShrink: 0,
        boxSizing: "border-box",
        padding: pad,
        // Sobre un fondo propio sólido, el recuadro se distingue con un velo del color del texto.
        background: p.fondoPropio ? rgba(p.texto, 0.1) : p.fondo,
        borderRadius: Math.min(36, pad),
      }}
    >
      <div style={{ height: altoTitulo, marginBottom: sep, display: "flex", alignItems: "center", gap: Math.round(tamTitulo * 0.35) }}>
        <Ajustado ancho={area.w - Math.round(tamTitulo * 1.35)} alto={altoTitulo} max={tamTitulo} min={14} unaLinea soloLoNecesario clave={mes} style={{ fontWeight: 700, lineHeight: 1.2, color: p.titulo }}>
          {`Próximos en ${mes}`}
        </Ajustado>
        <Icono style={{ width: tamTitulo, height: tamTitulo, flexShrink: 0, color: p.destacadoPropio || tema === "oscuro" ? p.destacado : "#c2410c" }} />
      </div>
      <ListaPersonas
        tema={tema}
        personas={personas}
        maxFilas={maxFilas}
        area={area}
        vacio=""
        derecha={clase === "aniv" ? (x) => textoAnios(personas.find((y) => y.nombre === x.nombre && y.dia === x.dia)?.anios ?? 0) : undefined}
      />
    </div>
  );
}

/** Último mensaje de «cero accidentes» mostrado en este navegador. */
let ultimoMensajeSinAccidentes: number | null = null;

const AMBAR = "#f59e0b";

/** «2 lesionados · 1 fallecido», «Solo daños materiales». */
function textoGravedad(lesionados: number, fallecidos: number): string {
  const partes: string[] = [];
  if (lesionados > 0) partes.push(lesionados === 1 ? "1 lesionado" : `${lesionados} lesionados`);
  if (fallecidos > 0) partes.push(fallecidos === 1 ? "1 fallecido" : `${fallecidos} fallecidos`);
  return partes.length ? partes.join(" · ") : "Solo daños materiales";
}

/**
 * Accidentes del día anterior, a pantalla completa, como CARRUSEL: primero un
 * resumen y después un elemento por accidente (hasta MAX_ACCIDENTES_CARRUSEL),
 * `segPorElemento` segundos cada uno. La diapositiva dura la suma
 * (duracionEfectiva en modelo.ts), así que el carrusel da una vuelta completa.
 *
 * Sin accidentes: un solo elemento, la felicitación al equipo.
 */
function AccidentesAyer({
  w,
  h,
  tema,
  segPorElemento,
  datos,
}: {
  w: number;
  h: number;
  tema: TemaWidget;
  segPorElemento: number;
  datos: DatosWidgets | undefined;
}) {
  const p = usePaleta(tema);
  const oscuro = tema === "oscuro";

  const [indice, setIndice] = useState<number | null>(null);
  useLayoutEffect(() => {
    const i = elegirMensaje(MENSAJES_SIN_ACCIDENTES.length, ultimoMensajeSinAccidentes);
    ultimoMensajeSinAccidentes = i;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el azar se resuelve solo en el navegador (no en el render del servidor) y antes de pintar
    setIndice(i);
  }, []);

  const acc = datos?.accidentabilidad;
  const ayer = acc?.ayer ?? null;
  const sinAccidentes = ayer != null && ayer.total === 0;
  const lista = (ayer?.accidentes ?? []).slice(0, MAX_ACCIDENTES_CARRUSEL);
  // Resumen; por accidente, su ficha y, si tiene fotos aprobadas, sus fotos.
  // La misma lista decide la duración de la diapositiva (Reproductor).
  const orden = panelesCarrusel(ayer);
  const paneles = orden.length;

  // El carrusel arranca en el resumen cada vez que la diapositiva entra (el
  // reproductor la monta al entrar) y avanza cada `segPorElemento` segundos.
  const [panel, setPanel] = useState(0);
  useEffect(() => {
    if (paneles <= 1) return;
    const t = window.setInterval(() => setPanel((x) => (x + 1) % paneles), Math.max(1, segPorElemento) * 1000);
    return () => window.clearInterval(t);
  }, [paneles, segPorElemento]);
  const actual = panel % paneles;

  const pad = Math.round(Math.max(24, Math.min(w, h) * 0.06));
  const altoPuntos = paneles > 1 ? Math.round(Math.max(10, h * 0.02)) : 0;
  const util = { w: w - pad * 2, h: h - pad * 2 - (altoPuntos ? altoPuntos * 2 : 0) };
  const fecha = ayer ? fechaLarga(ayer.fecha) : "";

  const fondo = p.fondoPropio
    ? p.fondo
    : sinAccidentes
      ? oscuro
        ? "linear-gradient(135deg, #052e16 0%, #0f172a 55%, #064e3b 100%)"
        : "linear-gradient(135deg, #f0fdf4 0%, #ffffff 55%, #ecfdf5 100%)"
      : oscuro
        ? "linear-gradient(135deg, #1c1917 0%, #0f172a 60%, #431407 100%)"
        : "linear-gradient(135deg, #fff7ed 0%, #ffffff 60%, #fef2f2 100%)";

  let contenido: React.ReactNode;
  if (!ayer || sinAccidentes) {
    contenido = (
      <Felicitacion
        p={p}
        oscuro={oscuro}
        util={util}
        fecha={fecha}
        sinDatos={!ayer}
        mensaje={MENSAJES_SIN_ACCIDENTES[indice ?? 0]}
        racha={acc?.diasSinAccidentes ?? null}
      />
    );
  } else {
    const el = orden[actual];
    contenido =
      el.tipo === "resumen" ? (
        <ResumenAccidentes p={p} tema={tema} util={util} fecha={fecha} ayer={ayer} />
      ) : el.tipo === "accidente" ? (
        <FichaAccidente p={p} util={util} fecha={fecha} a={lista[el.i]} numero={el.i + 1} de={ayer.total} />
      ) : (
        <FotosDelAccidente p={p} util={util} a={lista[el.i]} numero={el.i + 1} de={ayer.total} />
      );
  }

  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        boxSizing: "border-box",
        padding: pad,
        background: fondo,
        color: p.texto,
        borderRadius: w >= LIENZO.ancho - 20 && h >= LIENZO.alto - 20 ? 0 : Math.min(40, pad),
        overflow: "hidden",
        fontFamily: p.fuente,
      }}
    >
      {sinAccidentes && <Confeti w={w} h={h} />}
      {/* key: cada elemento entra con su animación al cambiar. */}
      <div key={actual} style={{ position: "relative", height: util.h, animation: paneles > 1 ? "pantalla-el-aparecer 600ms ease-out both" : undefined }}>
        {contenido}
      </div>
      {paneles > 1 && (
        <div style={{ position: "relative", height: altoPuntos, marginTop: altoPuntos, display: "flex", justifyContent: "center", gap: altoPuntos }}>
          {Array.from({ length: paneles }, (_, i) => (
            <span
              key={i}
              style={{
                width: i === actual ? altoPuntos * 3 : altoPuntos,
                height: altoPuntos,
                borderRadius: altoPuntos,
                background: i === actual ? NARANJA : rgba(p.fondoPropio ? p.texto : oscuro ? "#ffffff" : "#0f172a", 0.25),
                transition: "width 300ms",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Felicitacion({
  p,
  oscuro,
  util,
  fecha,
  sinDatos,
  mensaje,
  racha,
}: {
  p: Paleta;
  oscuro: boolean;
  util: Area;
  fecha: string;
  sinDatos: boolean;
  mensaje: string;
  racha: number | null;
}) {
  const verdeFuerte = oscuro ? VERDE : "#15803d";
  const acento = p.destacadoPropio ? p.destacado : sinDatos ? NARANJA : verdeFuerte;
  const emoji = sinDatos ? "🛡️" : "🏆";
  const titulo = sinDatos ? "Accidentes de ayer" : "¡Cero accidentes ayer!";
  const texto = sinDatos ? "Sin datos por ahora" : mensaje;
  // La racha solo se muestra si sigue viva hoy (un accidente hoy la pone en 0).
  const textoRacha = !sinDatos && racha != null && racha > 1 ? `${miles(racha)} días seguidos sin accidentes` : "";
  const hueco = Math.round(util.h * 0.025);
  const altoRacha = textoRacha ? Math.round(util.h * 0.1) : 0;
  return (
    <div style={{ height: util.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: hueco, textAlign: "center" }}>
      <span style={{ animation: sinDatos ? undefined : "pantalla-ef-latido 2.4s ease-in-out infinite" }}>
        <EmojiFijo emoji={emoji} lado={Math.round(util.h * 0.2)} />
      </span>
      <Ajustado ancho={util.w} alto={Math.round(util.h * 0.16)} max={190} min={16} unaLinea alinear="centro" clave={titulo} style={{ fontWeight: 900, lineHeight: 1.05, color: acento }}>
        {titulo}
      </Ajustado>
      {fecha && (
        <Ajustado ancho={util.w} alto={Math.round(util.h * 0.07)} max={60} min={12} unaLinea alinear="centro" clave={fecha} style={{ color: p.suave, fontWeight: 600, lineHeight: 1.1 }}>
          {fecha}
        </Ajustado>
      )}
      <Ajustado ancho={Math.round(util.w * 0.8)} alto={Math.round(util.h * 0.2)} max={72} min={12} alinear="centro" clave={texto} style={{ color: p.titulo, lineHeight: 1.3, fontWeight: 600 }}>
        {texto}
      </Ajustado>
      {textoRacha && (
        <div
          style={{
            height: altoRacha,
            maxWidth: util.w,
            boxSizing: "border-box",
            padding: `0 ${Math.round(altoRacha * 0.5)}px`,
            borderRadius: altoRacha,
            background: rgba(p.fondoPropio ? p.texto : oscuro ? "#ffffff" : "#15803d", 0.1),
            display: "flex",
            alignItems: "center",
          }}
        >
          <Ajustado ancho={Math.round(util.w * 0.7)} alto={Math.round(altoRacha * 0.8)} max={56} min={12} unaLinea alinear="centro" soloLoNecesario clave={textoRacha} style={{ fontWeight: 800, color: acento, lineHeight: 1 }}>
            {`🛡️ ${textoRacha}`}
          </Ajustado>
        </div>
      )}
    </div>
  );
}

/** Primer elemento del carrusel con accidentes: cifras del día y la recomendación. */
function ResumenAccidentes({ p, tema, util, fecha, ayer }: { p: Paleta; tema: TemaWidget; util: Area; fecha: string; ayer: AccidentesDelDia }) {
  const lesionados = ayer.lesionados ?? 0;
  const fallecidos = ayer.fallecidos ?? 0;
  const rec = recomendacionDelDia(ayer.accidentes ?? []);
  const titulo = ayer.total === 1 ? "Ayer hubo 1 accidente" : `Ayer hubo ${miles(ayer.total)} accidentes`;
  const acento = p.destacadoPropio ? p.destacado : NARANJA;
  const gap = Math.round(util.h * 0.03);
  const altoTitulo = Math.round(util.h * 0.15);
  const altoFecha = Math.round(util.h * 0.06);
  const altoFichas = Math.round(util.h * 0.36);
  const altoRec = util.h - altoTitulo - altoFecha - altoFichas - gap * 3;
  const padRec = Math.round(Math.max(16, altoRec * 0.12));
  const ladoEmojiRec = Math.round(Math.min(altoRec - padRec * 2, util.w * 0.12));
  return (
    <div style={{ height: util.h, display: "flex", flexDirection: "column", gap }}>
      <div style={{ height: altoTitulo, display: "flex", alignItems: "center", justifyContent: "center", gap: Math.round(altoTitulo * 0.25) }}>
        <EmojiFijo emoji={fallecidos > 0 ? "🕊️" : "⚠️"} lado={Math.round(altoTitulo * 0.95)} />
        <Ajustado ancho={util.w - altoTitulo * 1.3} alto={altoTitulo} max={170} min={16} unaLinea soloLoNecesario clave={titulo} style={{ fontWeight: 900, lineHeight: 1.05, color: acento }}>
          {titulo}
        </Ajustado>
      </div>
      <Ajustado ancho={util.w} alto={altoFecha} max={56} min={12} unaLinea alinear="centro" clave={fecha} style={{ color: p.suave, fontWeight: 600, lineHeight: 1.1 }}>
        {fecha}
      </Ajustado>
      <Fichas
        tema={tema}
        area={{ w: util.w, h: altoFichas }}
        items={[
          { etiqueta: ayer.total === 1 ? "accidente" : "accidentes", valor: miles(ayer.total), color: NARANJA },
          { etiqueta: lesionados === 1 ? "lesionado" : "lesionados", valor: miles(lesionados), color: lesionados > 0 ? AMBAR : undefined },
          { etiqueta: fallecidos === 1 ? "fallecido" : "fallecidos", valor: miles(fallecidos), color: fallecidos > 0 ? ROJO : undefined },
        ]}
      />
      <div
        style={{
          height: altoRec,
          boxSizing: "border-box",
          padding: padRec,
          borderRadius: Math.min(36, padRec),
          background: p.tarjeta,
          borderLeft: `${Math.max(6, Math.round(padRec * 0.3))}px solid ${acento}`,
          display: "flex",
          alignItems: "center",
          gap: padRec,
        }}
      >
        <EmojiFijo emoji={rec.emoji} lado={ladoEmojiRec} />
        <Ajustado ancho={util.w - padRec * 3 - ladoEmojiRec - 12} alto={altoRec - padRec * 2} max={60} min={12} clave={rec.texto}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25em" }}>
            <div style={{ fontSize: "0.6em", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: p.suave }}>Recomendación del día</div>
            <div style={{ fontWeight: 700, lineHeight: 1.25, color: p.titulo }}>{rec.texto}</div>
          </div>
        </Ajustado>
      </div>
    </div>
  );
}

/**
 * Fotos de un accidente, después de su ficha. Solo las aprobadas para la
 * pantalla en el detalle del accidente (nunca documentos). 1 foto ocupa todo;
 * 2, lado a lado; 3 o 4, en cuadrícula de dos por dos.
 */
function FotosDelAccidente({ p, util, a, numero, de }: { p: Paleta; util: Area; a: AccidenteDelDia | undefined; numero: number; de: number }) {
  const fotos = a?.fotosUrls ?? [];
  if (!a || fotos.length === 0) return null;
  const encabezado = [`Accidente ${numero} de ${de} · Fotos`, a.bus ? `Bus ${a.bus}` : "", a.conductor ?? ""].filter(Boolean).join(" · ");
  const altoEnc = Math.round(util.h * 0.07);
  const gap = Math.round(util.h * 0.02);
  const columnas = fotos.length === 1 ? 1 : 2;
  const filas = fotos.length <= 2 ? 1 : 2;
  const radio = Math.min(24, Math.round(util.h * 0.025));
  return (
    <div style={{ height: util.h, display: "flex", flexDirection: "column", gap }}>
      <Ajustado ancho={util.w} alto={altoEnc} max={52} min={12} unaLinea clave={encabezado} style={{ color: p.suave, fontWeight: 700, lineHeight: 1.1 }}>
        {encabezado}
      </Ajustado>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${columnas}, 1fr)`,
          gridTemplateRows: `repeat(${filas}, 1fr)`,
          gap,
        }}
      >
        {fotos.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage dentro del lienzo escalado; next/image no aplica
          <img
            key={url}
            src={url}
            alt={`Foto ${i + 1} del accidente`}
            style={{ width: "100%", height: "100%", minHeight: 0, objectFit: "cover", borderRadius: radio, background: p.tarjeta }}
          />
        ))}
      </div>
    </div>
  );
}

/** Pastilla de color con texto (gravedad, responsabilidad, reincidencia). Mide en em. */
function Pastilla({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.2em 0.65em",
        borderRadius: "1em",
        background: rgba(color, 0.16),
        color,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

const COLOR_RESPONSABILIDAD: Record<NonNullable<AccidenteDelDia["responsabilidad"]>, string> = {
  directo: ROJO,
  compartido: AMBAR,
  tercero: "#38bdf8",
  en_estudio: "#94a3b8",
};

/**
 * Un accidente del día: hora, bus y ruta, conductor, lugar, gravedad,
 * responsabilidad, reincidencia, hipótesis del IPAT y la medida para evitarlo.
 * A la derecha, el croquis si lo hay. Nunca los nombres de las víctimas.
 */
function FichaAccidente({ p, util, fecha, a, numero, de }: { p: Paleta; util: Area; fecha: string; a: AccidenteDelDia | undefined; numero: number; de: number }) {
  if (!a) return null;
  const gravedad = textoGravedad(a.lesionados, a.fallecidos);
  const colorGravedad = a.fallecidos > 0 ? ROJO : a.lesionados > 0 ? AMBAR : "#94a3b8";
  const afectados = [a.pasajeros > 0 ? (a.pasajeros === 1 ? "1 pasajero" : `${a.pasajeros} pasajeros`) : "", a.peatones > 0 ? (a.peatones === 1 ? "1 peatón" : `${a.peatones} peatones`) : ""]
    .filter(Boolean)
    .join(", ");
  const bus = [a.bus ? `Bus ${a.bus}` : "", a.ruta ? `Ruta ${a.ruta}` : ""].filter(Boolean).join(" · ") || "Vehículo sin registrar";
  const hipotesis = a.hipotesis ?? [];
  // Sin hipótesis del IPAT (histórico), los factores de la Política hacen sus veces.
  const politica = a.factores.map((f) => CONSEJOS_FACTOR[f]).filter(Boolean);
  const textoHipotesis = hipotesis.length
    ? hipotesis.map((h) => `${h.codigo} · ${h.texto}`).join("  /  ")
    : politica.length
      ? politica.map((f) => f.titulo).join("  /  ")
      : "En investigación";
  const medida = hipotesis.length ? medidaPreventiva(hipotesis) : (politica[0]?.consejo ?? medidaPreventiva([]));
  const reincidencia = textoReincidencia(a.previos12m);
  const encabezado = `Accidente ${numero} de ${de} · ${fecha}`;

  // A la derecha, el croquis si lo hay (las fotos del accidente no se muestran
  // solas: entre ellas hay documentos de identidad; ver datos.ts).
  const imagen = a.croquisUrl ? { url: a.croquisUrl, titulo: "Croquis", ajuste: "contain" as const } : null;
  const conCroquis = !!imagen;
  const gapCol = Math.round(util.w * 0.025);
  const anchoCroquis = conCroquis ? Math.round(util.w * 0.4) : 0;
  const ancho = util.w - (conCroquis ? anchoCroquis + gapCol : 0);
  const gap = Math.round(util.h * 0.018);
  const alto = (x: number) => Math.round(util.h * x);
  const tope = (px: number, x: number) => Math.round(Math.min(px, util.h * x));
  const altoMedida = alto(0.2);
  const padMedida = Math.round(Math.max(12, altoMedida * 0.12));

  return (
    <div style={{ height: util.h, display: "flex", gap: gapCol }}>
      <div style={{ width: ancho, height: util.h, display: "flex", flexDirection: "column", justifyContent: "center", gap }}>
        <Ajustado ancho={ancho} alto={alto(0.055)} max={46} min={11} unaLinea clave={encabezado} style={{ color: p.suave, fontWeight: 700, lineHeight: 1.1 }}>
          {encabezado}
        </Ajustado>
        <Ajustado ancho={ancho} alto={alto(0.12)} max={140} min={16} unaLinea clave={a.hora ?? "sin hora"} style={{ fontWeight: 900, lineHeight: 1, color: NARANJA }}>
          {a.hora ? `⏰ ${a.hora}` : "Hora sin registrar"}
        </Ajustado>
        <Ajustado ancho={ancho} alto={alto(0.08)} max={90} min={13} unaLinea clave={bus} style={{ fontWeight: 800, lineHeight: 1.1, color: p.titulo }}>
          {bus}
        </Ajustado>
        {a.conductor && (
          <Ajustado ancho={ancho} alto={alto(0.07)} max={tope(70, 0.06)} min={12} unaLinea clave={a.conductor} style={{ fontWeight: 700, lineHeight: 1.1, color: p.texto }}>
            {`👤 ${a.conductor}`}
          </Ajustado>
        )}
        {a.lugar && (
          <Ajustado ancho={ancho} alto={alto(0.065)} max={tope(56, 0.05)} min={11} clave={a.lugar} style={{ fontWeight: 500, lineHeight: 1.2, color: p.texto }}>
            {`📍 ${a.lugar}`}
          </Ajustado>
        )}
        <Ajustado
          ancho={ancho}
          alto={alto(0.14)}
          max={tope(48, 0.05)}
          min={11}
          clave={`${gravedad}|${afectados}|${a.responsabilidad}|${reincidencia}`}
          style={{ lineHeight: 1.2 }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4em 0.5em" }}>
            <Pastilla color={colorGravedad}>{afectados ? `${gravedad} (${afectados})` : gravedad}</Pastilla>
            {a.responsabilidad && <Pastilla color={COLOR_RESPONSABILIDAD[a.responsabilidad]}>{RESPONSABILIDAD_TV[a.responsabilidad]}</Pastilla>}
            {reincidencia && <Pastilla color={(a.previos12m ?? 0) > 0 ? ROJO : "#94a3b8"}>{reincidencia}</Pastilla>}
          </div>
        </Ajustado>
        <Ajustado ancho={ancho} alto={alto(0.1)} max={tope(48, 0.05)} min={11} clave={textoHipotesis} style={{ lineHeight: 1.25 }}>
          <span style={{ color: p.suave, fontWeight: 600 }}>Hipótesis: </span>
          <span style={{ fontWeight: 700, color: p.titulo }}>{textoHipotesis}</span>
        </Ajustado>
        <div
          style={{
            height: altoMedida,
            boxSizing: "border-box",
            padding: padMedida,
            borderRadius: Math.min(28, padMedida),
            background: p.tarjeta,
            borderLeft: `${Math.max(5, Math.round(padMedida * 0.35))}px solid ${VERDE}`,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Ajustado ancho={ancho - padMedida * 2 - 8} alto={altoMedida - padMedida * 2} max={tope(52, 0.05)} min={11} clave={medida}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2em" }}>
              <div style={{ fontSize: "0.62em", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: VERDE }}>🛡️ Para evitarlo</div>
              <div style={{ fontWeight: 700, lineHeight: 1.25, color: p.titulo }}>{medida}</div>
            </div>
          </Ajustado>
        </div>
      </div>
      {conCroquis && (
        <div
          style={{
            width: anchoCroquis,
            height: util.h,
            flexShrink: 0,
            boxSizing: "border-box",
            padding: Math.round(util.h * 0.02),
            borderRadius: Math.min(28, Math.round(util.h * 0.03)),
            background: "#ffffff",
            display: "flex",
            flexDirection: "column",
            gap: Math.round(util.h * 0.01),
          }}
        >
          <div style={{ fontSize: tope(34, 0.035), fontWeight: 800, color: "#334155", textAlign: "center" }}>{imagen!.titulo}</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage dentro del lienzo escalado; next/image no aplica */}
          <img
            src={imagen!.url}
            alt={imagen!.titulo}
            style={{ flex: 1, minHeight: 0, width: "100%", objectFit: imagen!.ajuste, borderRadius: Math.min(20, Math.round(util.h * 0.02)) }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Pinta un widget en su caja (w×h en px del lienzo) con su estilo propio
 * (fuente y colores) disponible para todas sus piezas.
 */
export function WidgetPantalla({ el, datos }: { el: ElementoWidget; datos: DatosWidgets | undefined }) {
  const estilo: EstiloWidget = {};
  for (const k of CAMPOS_ESTILO_WIDGET) if (el.widget[k] !== undefined) (estilo as Record<string, unknown>)[k] = el.widget[k];
  return (
    <EstiloCtx value={estilo}>
      {/* Otra fuente cambia lo que mide cada texto: se vuelve a montar para que <Ajustado> mida de nuevo. */}
      <ContenidoWidget key={estilo.fuente ?? "inter"} el={el} datos={datos} />
    </EstiloCtx>
  );
}

function ContenidoWidget({ el, datos }: { el: ElementoWidget; datos: DatosWidgets | undefined }) {
  const { w, h, widget } = el;
  const tema = widget.tema;
  const p = usePaleta(tema);
  const mes = datos?.hoy ? nombreMes(datos.hoy.slice(0, 7)) : "";

  switch (widget.tipo) {
    case "reloj":
      return <Reloj tema={tema} formato={widget.formato} w={w} h={h} />;

    case "qr":
      return <WidgetQr el={el as ElementoWidget & { widget: { tipo: "qr" } }} />;

    case "acc_factor": {
      const d = datos?.accidentabilidad;
      const f = d?.factor;
      const titulo = f?.periodo === "trimestre" ? "Factor de riesgo · últimos 3 meses" : `Factor de riesgo de ${mes}`;
      return (
        <Marco tema={tema} w={w} h={h} titulo={titulo}>
          {(area) => {
            if (!d) return <SinDatos tema={tema} area={area} />;
            if (!f) {
              const t = "Sin accidentes por estos factores. ¡Sigamos así!";
              const tamEmoji = Math.round(Math.min(area.h * 0.6, area.w * 0.2));
              const hueco = Math.round(area.h * 0.12);
              return (
                <div style={{ height: "100%", display: "flex", alignItems: "center", gap: hueco }}>
                  <EmojiFijo emoji="👏" lado={tamEmoji} />
                  <Ajustado ancho={area.w - tamEmoji - hueco} alto={area.h} max={56} min={12} clave={t} style={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {t}
                  </Ajustado>
                </div>
              );
            }
            const c = CONSEJOS_FACTOR[f.clave];
            const tamEmoji = Math.round(Math.min(area.h * 0.85, area.w * 0.22));
            const hueco = Math.round(area.h * 0.12);
            const anchoTexto = area.w - tamEmoji - hueco;
            const detalle = `En ${f.accidentes} de ${f.total} ${f.total === 1 ? "accidente" : "accidentes"}`;
            // Los tres textos se ajustan como un bloque: el nombre del factor
            // (1,9 em), el detalle y el consejo. Si no caben, se achican juntos
            // y el consejo se parte en las líneas que necesite: nada con «…».
            return (
              <div style={{ height: "100%", display: "flex", alignItems: "center", gap: hueco }}>
                <EmojiFijo emoji={c?.emoji ?? "⚠️"} lado={tamEmoji} />
                <Ajustado ancho={anchoTexto} alto={area.h} max={44} min={10} clave={`${f.etiqueta}|${detalle}|${c?.consejo}`}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3em" }}>
                    <div style={{ fontSize: "1.9em", fontWeight: 800, lineHeight: 1.05, color: NARANJA }}>{f.etiqueta}</div>
                    <div style={{ fontSize: "0.8em", color: p.suave, lineHeight: 1.2 }}>{detalle}</div>
                    {c && <div style={{ fontWeight: 600, lineHeight: 1.25 }}>{c.consejo}</div>}
                  </div>
                </Ajustado>
              </div>
            );
          }}
        </Marco>
      );
    }

    case "vel_semana": {
      const d = datos?.velocidad;
      const enCurso = d?.semanaEnCurso !== false;
      const cual = !d || enCurso ? "esta semana" : `semana del ${fechaCorta(d.actual.desde)} al ${fechaCorta(d.actual.hasta)}`;
      return (
        <Marco tema={tema} w={w} h={h} titulo={`Excesos de velocidad · ${cual}`}>
          {(area) => {
            if (!d) return <SinDatos tema={tema} area={area} />;
            const variacion =
              d.anterior.incidencias > 0 ? ((d.actual.incidencias - d.anterior.incidencias) / d.anterior.incidencias) * 100 : null;
            const sinExcesos = d.activos && d.activos > 0 ? Math.max(0, Math.round((1 - d.actual.conductores / d.activos) * 100)) : null;
            return (
              <Fichas
                tema={tema}
                area={area}
                items={[
                  { etiqueta: `excesos (más de ${d.umbralKmh} km/h)`, valor: miles(d.actual.incidencias), extra: { pct: variacion } },
                  { etiqueta: enCurso ? "la semana pasada" : "la semana anterior", valor: miles(d.anterior.incidencias) },
                  sinExcesos != null
                    ? { etiqueta: "de los conductores, sin excesos", valor: `${sinExcesos}%`, color: VERDE }
                    : { etiqueta: "conductores con excesos", valor: miles(d.actual.conductores) },
                ]}
              />
            );
          }}
        </Marco>
      );
    }

    case "huella_hoy": {
      const d = datos?.marcaciones;
      return (
        <Marco tema={tema} w={w} h={h} titulo="Huella de hoy">
          {(area) => {
            if (!d || d.trabajaronConHuella == null) return <SinDatos tema={tema} area={area} />;
            const con = d.trabajaronConHuella;
            const sin = Math.max(0, d.trabajaron - con);
            const nota = d.trabajaron > 0 ? `De ${miles(d.trabajaron)} conductores que ya salieron a rodar` : "Todavía no ha salido nadie a rodar";
            const altoNota = Math.round(Math.max(18, area.h * 0.13));
            const altoBarra = Math.max(10, Math.round(area.h * 0.07));
            const altoFichas = area.h - altoNota - altoBarra - 16;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
                <Fichas
                  tema={tema}
                  area={{ w: area.w, h: altoFichas }}
                  items={[
                    { etiqueta: "pasaron la huella", valor: miles(con), color: VERDE },
                    { etiqueta: "no la pasaron · ¡recuerde marcar al llegar!", valor: miles(sin), color: sin > 0 ? NARANJA : undefined },
                  ]}
                />
                <Barra parte={con} total={d.trabajaron} alto={altoBarra} tema={tema} />
                <Ajustado alto={altoNota} max={34} min={10} clave={nota} style={{ color: p.suave, lineHeight: 1.2 }}>
                  {nota}
                </Ajustado>
              </div>
            );
          }}
        </Marco>
      );
    }

    case "vacantes": {
      const d = datos?.vacantes;
      return (
        <Marco tema={tema} w={w} h={h} titulo="Estamos contratando">
          {(area) => {
            if (!d) return <SinDatos tema={tema} area={area} />;
            const conPadrino = d.padrinoMaximo != null;
            const gap = 24;
            const anchoLista = conPadrino ? Math.round(area.w * 0.55) : area.w;
            const anchoPadrino = area.w - anchoLista - (conPadrino ? gap : 0);
            const padCaja = 20;
            const monto = d.padrinoMaximo != null ? `$${miles(d.padrinoMaximo)}` : "";
            const referidos =
              d.referidosMes > 0 ? ` · ${d.referidosMes} ${d.referidosMes === 1 ? "referido" : "referidos"} este mes` : "";
            const sobran = Math.max(0, d.total - d.titulos.length);
            return (
              <div style={{ display: "flex", gap, height: "100%" }}>
                {/* Todos los cargos, enteros: se parten en dos líneas si hace falta y la lista se achica para caber. */}
                <Ajustado
                  ancho={anchoLista}
                  alto={area.h}
                  max={48}
                  min={12}
                  clave={`${d.titulos.join("|")}|${sobran}`}
                  style={{ lineHeight: 1.25 }}
                >
                  {d.titulos.length === 0 ? (
                    <span style={{ color: p.suave }}>Pregunte en Recursos Humanos</span>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35em" }}>
                      {d.titulos.map((t) => (
                        <div key={t} style={{ display: "flex", gap: "0.45em", alignItems: "baseline", fontWeight: 600 }}>
                          <span style={{ color: p.azul, flexShrink: 0, fontSize: "0.7em" }}>●</span>
                          <span style={{ minWidth: 0 }}>{t}</span>
                        </div>
                      ))}
                      {sobran > 0 && <div style={{ fontSize: "0.7em", color: p.suave }}>y {sobran} más</div>}
                    </div>
                  )}
                </Ajustado>
                {conPadrino && (
                  <div
                    style={{
                      width: anchoPadrino,
                      height: area.h,
                      background: p.tarjeta,
                      borderRadius: 24,
                      padding: padCaja,
                      boxSizing: "border-box",
                      flexShrink: 0,
                    }}
                  >
                    {/* La caja entera se ajusta como un bloque: el monto (2,4 em) nunca se parte ni se corta. */}
                    <Ajustado ancho={anchoPadrino - padCaja * 2} alto={area.h - padCaja * 2} max={36} min={10} clave={`${monto}|${referidos}`}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.3em" }}>
                        <div style={{ fontWeight: 700, lineHeight: 1.2 }}>Refiera a un conductor y gane hasta</div>
                        <div style={{ fontSize: "2.4em", fontWeight: 900, color: VERDE, lineHeight: 1, whiteSpace: "nowrap" }}>{monto}</div>
                        <div style={{ fontSize: "0.8em", color: p.suave, lineHeight: 1.25 }}>Plan Padrino{referidos}</div>
                      </div>
                    </Ajustado>
                  </div>
                )}
              </div>
            );
          }}
        </Marco>
      );
    }

    case "bienvenida": {
      const d = datos?.bienvenidas;
      return (
        <Marco tema={tema} w={w} h={h} titulo="¡Bienvenidos!" icono={Handshake}>
          {(area) =>
            !d ? (
              <SinDatos tema={tema} area={area} />
            ) : (
              <ListaPersonas
                tema={tema}
                personas={d.personas}
                maxFilas={widget.maxFilas}
                area={area}
                vacio="Este mes todavía no hay ingresos nuevos."
              />
            )
          }
        </Marco>
      );
    }

    case "acc_kpis": {
      const d = datos?.accidentabilidad;
      return (
        <Marco tema={tema} w={w} h={h} titulo={`Accidentes de ${mes}`}>
          {(area) =>
            !d ? (
              <SinDatos tema={tema} area={area} />
            ) : (
              <Fichas
                tema={tema}
                area={area}
                items={[
                  { etiqueta: "en el mes", valor: miles(d.mesActual.total), extra: { pct: d.mesActual.variacion } },
                  { etiqueta: `en ${nombreMes(d.mesAnterior.clave)}`, valor: miles(d.mesAnterior.total) },
                  { etiqueta: "con lesionados", valor: miles(d.mesActual.graves), color: d.mesActual.graves > 0 ? NARANJA : undefined },
                  { etiqueta: "fatales", valor: miles(d.mesActual.fatales), color: d.mesActual.fatales > 0 ? ROJO : undefined },
                ]}
              />
            )
          }
        </Marco>
      );
    }

    case "acc_ayer":
      return <AccidentesAyer w={w} h={h} tema={tema} segPorElemento={widget.segPorElemento} datos={datos} />;

    case "acc_dias_sin": {
      const n = datos?.accidentabilidad?.diasSinAccidentes;
      const pad = Math.round(Math.max(12, Math.min(48, Math.min(w, h) * 0.08)));
      const util = { w: w - pad * 2, h: h - pad * 2 };
      const cifra = n == null ? "Sin datos" : miles(n);
      const etiqueta = n === 1 ? "día sin accidentes" : "días sin accidentes";
      const altoEtiqueta = Math.round(util.h * 0.2);
      const altoCifra = util.h - altoEtiqueta - Math.round(util.h * 0.04);
      return (
        <div
          style={{
            width: w,
            height: h,
            boxSizing: "border-box",
            padding: pad,
            background: p.fondo,
            color: p.texto,
            borderRadius: Math.min(40, pad),
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: Math.round(util.h * 0.04),
            overflow: "hidden",
            fontFamily: p.fuente,
            textAlign: "center",
          }}
        >
          <Ajustado
            ancho={util.w}
            alto={altoCifra}
            max={n == null ? 80 : 420}
            min={14}
            unaLinea
            alinear="centro"
            clave={cifra}
            style={{ fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: n == null ? p.suave : n >= 30 ? VERDE : p.texto }}
          >
            {cifra}
          </Ajustado>
          <Ajustado ancho={util.w} alto={altoEtiqueta} max={64} min={10} alinear="centro" clave={etiqueta} style={{ color: p.suave, lineHeight: 1.1 }}>
            {etiqueta}
          </Ajustado>
        </div>
      );
    }

    case "acc_serie": {
      const d = datos?.accidentabilidad;
      const serie = d?.serie.slice(-widget.meses) ?? [];
      return (
        <Marco tema={tema} w={w} h={h} titulo={`Accidentes por mes · últimos ${widget.meses} meses`}>
          {(area) => {
            if (!d) return <SinDatos tema={tema} area={area} />;
            // «may 26» ≈ 3,4 em; con el espacio entre rótulos, ~4,6 em por mes.
            const tam = Math.max(13, Math.min(30, Math.round(Math.min(area.h * 0.07, area.w / (Math.max(1, serie.length) * 4.6)))));
            const altoLeyenda = Math.round(tam * 1.6);
            return (
              <>
                <LineChart width={area.w} height={area.h - altoLeyenda} data={serie} margin={margenGrafica(tam)}>
                  <CartesianGrid stroke={p.linea} vertical={false} />
                  <XAxis
                    dataKey="etiqueta"
                    tick={{ fill: p.suave, fontSize: tam }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tickMargin={Math.round(tam * 0.4)}
                    padding={rellenoEjeX(tam)}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: p.suave, fontSize: tam }}
                    axisLine={false}
                    tickLine={false}
                    width={Math.round(tam * (String(Math.max(0, ...serie.map((s) => s.total))).length * 0.65 + 0.8))}
                  />
                  <Line dataKey="total" stroke={p.serie} strokeWidth={Math.max(3, tam * 0.25)} dot={{ r: Math.max(4, tam * 0.25), fill: p.serie }} isAnimationActive={false}>
                    <LabelList dataKey="total" position="top" offset={Math.round(tam * 0.5)} fill={p.texto} fontSize={tam} fontWeight={700} />
                  </Line>
                  <Line dataKey="graves" stroke={NARANJA} strokeWidth={Math.max(2, tam * 0.18)} dot={{ r: Math.max(3, tam * 0.2), fill: NARANJA }} isAnimationActive={false} />
                </LineChart>
                <div style={{ height: altoLeyenda, display: "flex", alignItems: "center", gap: tam * 1.5, fontSize: tam, color: p.suave, paddingLeft: Math.round(tam * 2.6) }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: tam * 0.35 }}>
                    <span style={{ width: tam * 0.7, height: tam * 0.7, borderRadius: 999, background: p.serie }} /> Accidentes
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: tam * 0.35 }}>
                    <span style={{ width: tam * 0.7, height: tam * 0.7, borderRadius: 999, background: NARANJA }} /> Con lesionados
                  </span>
                </div>
              </>
            );
          }}
        </Marco>
      );
    }

    case "aus_kpis": {
      const d = datos?.ausentismo;
      return (
        <Marco tema={tema} w={w} h={h} titulo={d ? `Ausentismo ${d.anio}` : "Ausentismo"}>
          {(area) =>
            !d ? (
              <SinDatos tema={tema} area={area} />
            ) : (
              <Fichas
                tema={tema}
                area={area}
                items={[
                  { etiqueta: "incapacidades", valor: miles(d.totales.eventos) },
                  { etiqueta: "días perdidos", valor: miles(d.totales.dias) },
                  { etiqueta: "días por incapacidad", valor: d.totales.promedio.toLocaleString("es-CO", { maximumFractionDigits: 1 }) },
                  d.totales.pctAfectados != null
                    ? { etiqueta: "del personal tuvo incapacidad", valor: `${Math.round(d.totales.pctAfectados)}%` }
                    : { etiqueta: "trabajadores con incapacidad", valor: miles(d.totales.trabajadores) },
                ]}
              />
            )
          }
        </Marco>
      );
    }

    case "aus_serie": {
      const d = datos?.ausentismo;
      return (
        <Marco tema={tema} w={w} h={h} titulo={d ? `Días de incapacidad por mes · ${d.anio}` : "Días de incapacidad por mes"}>
          {(area) => {
            if (!d) return <SinDatos tema={tema} area={area} />;
            const meses = Math.max(1, d.mensual.length);
            const tam = Math.max(13, Math.min(30, Math.round(Math.min(area.h * 0.07, area.w / (meses * 4.4)))));
            const maxValor = Math.max(0, ...d.mensual.map((m) => m.dias));
            return (
              <BarChart width={area.w} height={area.h} data={d.mensual} margin={margenGrafica(tam)} barCategoryGap="18%">
                <CartesianGrid stroke={p.linea} vertical={false} />
                <XAxis dataKey="etiqueta" tick={{ fill: p.suave, fontSize: tam }} axisLine={false} tickLine={false} interval={0} tickMargin={Math.round(tam * 0.4)} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: p.suave, fontSize: tam }}
                  axisLine={false}
                  tickLine={false}
                  width={Math.round(tam * (String(maxValor).length * 0.65 + 0.8))}
                />
                <Bar dataKey="dias" fill={p.serie} radius={[Math.round(tam * 0.4), Math.round(tam * 0.4), 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="dias" position="top" offset={Math.round(tam * 0.4)} fill={p.texto} fontSize={tam} fontWeight={700} />
                </Bar>
              </BarChart>
            );
          }}
        </Marco>
      );
    }

    case "marc_hoy": {
      const d = datos?.marcaciones;
      return (
        <Marco tema={tema} w={w} h={h} titulo="Operación de hoy">
          {(area) =>
            !d ? (
              <SinDatos tema={tema} area={area} />
            ) : (
              <Fichas
                tema={tema}
                area={area}
                items={[
                  { etiqueta: "conductores programados", valor: miles(d.esperados) },
                  { etiqueta: "ya salieron a rodar", valor: miles(d.trabajaron), color: VERDE },
                  { etiqueta: "por salir", valor: miles(d.porSalir), color: p.azul },
                  { etiqueta: "con novedad", valor: miles(d.conNovedad) },
                ]}
              />
            )
          }
        </Marco>
      );
    }

    case "cumple_mes": {
      const d = datos?.cumpleanos;
      return (
        <Marco tema={tema} w={w} h={h} titulo={`Cumpleaños de ${mes}`} icono={Cake}>
          {(area) =>
            !d ? (
              <SinDatos tema={tema} area={area} />
            ) : (
              <ListaPersonas tema={tema} personas={d.personas} maxFilas={widget.maxFilas} area={area} vacio="No quedan cumpleaños este mes." />
            )
          }
        </Marco>
      );
    }

    case "cumple_hoy":
      return (
        <Celebracion clase="cumple" w={w} h={h} tema={tema} maxFilas={widget.maxFilas} personas={datos?.cumpleanos?.personas ?? null} mes={mes} />
      );

    case "aniv_hoy":
      return (
        <Celebracion clase="aniv" w={w} h={h} tema={tema} maxFilas={widget.maxFilas} personas={datos?.aniversarios?.personas ?? null} mes={mes} />
      );

    case "aniv_mes": {
      const d = datos?.aniversarios;
      return (
        <Marco tema={tema} w={w} h={h} titulo={`Aniversarios de ${mes}`} icono={PartyPopper}>
          {(area) =>
            !d ? (
              <SinDatos tema={tema} area={area} />
            ) : (
              <ListaPersonas
                tema={tema}
                personas={d.personas}
                maxFilas={widget.maxFilas}
                area={area}
                derecha={(x) => {
                  const a = d.personas.find((y) => y.nombre === x.nombre && y.dia === x.dia)?.anios ?? 0;
                  return a === 1 ? "1 año" : `${a} años`;
                }}
                vacio="No quedan aniversarios este mes."
              />
            )
          }
        </Marco>
      );
    }
  }
}
