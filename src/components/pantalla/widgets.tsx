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

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";
import { Cake, Handshake, PartyPopper, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { ElementoWidget, TemaWidget } from "@/lib/pantalla/modelo";
import { CONSEJOS_FACTOR, nombreMes, type DatosWidgets } from "@/lib/pantalla/datos-reglas";
import { FUENTE_EMOJI } from "@/lib/pantalla/emojis";

const AZUL = "#2a78d6";
const NARANJA = "#eb6834";
const VERDE = "#22c55e";
const ROJO = "#ef4444";
const AMARILLO = "#facc15";
const FUENTE = "var(--font-inter), sans-serif";

function paleta(tema: TemaWidget) {
  return tema === "claro"
    ? { fondo: "rgba(255,255,255,0.94)", texto: "#0f172a", suave: "#475569", linea: "#e2e8f0", tarjeta: "#f1f5f9", azul: AZUL }
    : { fondo: "rgba(15,23,42,0.82)", texto: "#ffffff", suave: "#cbd5e1", linea: "rgba(255,255,255,0.15)", tarjeta: "rgba(255,255,255,0.08)", azul: "#60a5fa" };
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
  const p = paleta(tema);
  const pad = Math.round(Math.max(16, Math.min(56, Math.min(w, h) * 0.07)));
  const anchoTitulo = w - pad * 2;
  // El icono ocupa su tamaño más el espacio: se descuenta antes de calcular la letra.
  const ems = titulo.length * 0.6 + (Icono ? 1.4 : 0);
  const tamTitulo = Math.max(18, Math.floor(Math.min(56, h * 0.12, anchoTitulo / ems)));
  const altoTitulo = Math.round(tamTitulo * 1.2);
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
        fontFamily: FUENTE,
      }}
    >
      <div style={{ height: altoTitulo, display: "flex", alignItems: "center", gap: Math.round(tamTitulo * 0.35), marginBottom: separacion }}>
        <div style={{ fontSize: tamTitulo, fontWeight: 700, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
          {titulo}
        </div>
        {Icono && <Icono style={{ width: tamTitulo, height: tamTitulo, flexShrink: 0, color: AMARILLO }} />}
      </div>
      <div style={{ width: area.w, height: area.h, position: "relative", overflow: "hidden" }}>{children(area)}</div>
    </div>
  );
}

function SinDatos({ tema, area }: { tema: TemaWidget; area: Area }) {
  const texto = "Sin datos por ahora";
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        color: paleta(tema).suave,
        fontSize: tamParaCaber(texto, area.w * 0.9, area.h * 0.3, 40, 0.55),
      }}
    >
      {texto}
    </div>
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
  return { gap, filas, anchoFicha, altoFicha, padX, padY, tamEtiqueta, tamValor };
}

/**
 * Fichas de cifras. Se prueba una fila y, con cuatro, dos filas de dos: queda
 * la disposición que deja la cifra más grande.
 */
function Fichas({ tema, items, area }: { tema: TemaWidget; items: Ficha[]; area: Area }) {
  const p = paleta(tema);
  const opciones = items.length === 4 ? [4, 2] : [items.length];
  const medidas = opciones.map((c) => ({ columnas: c, ...medirFichas(items, area, c) }));
  const { columnas, gap, anchoFicha, altoFicha, padX, padY, tamEtiqueta, tamValor } = medidas.reduce((a, b) => (b.tamValor > a.tamValor * 1.08 ? b : a));
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
        const tamVar = Math.round(tamValor * 0.45);
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
            <div
              style={{
                fontSize: tamValor,
                fontWeight: 800,
                lineHeight: 1,
                color: it.color ?? p.texto,
                display: "flex",
                alignItems: "baseline",
                gap: Math.round(tamValor * 0.12),
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {it.valor}
              {textoVar && (
                // Para accidentes, bajar es bueno: verde.
                <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: tamVar, color: baja ? VERDE : ROJO, fontWeight: 700 }}>
                  <IconoVar style={{ width: tamVar, height: tamVar }} />
                  {textoVar}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: tamEtiqueta,
                color: p.suave,
                marginTop: 6,
                lineHeight: 1.2,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {it.etiqueta}
            </div>
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
  const p = paleta(tema);
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
  // Se dimensiona con el texto más largo posible para que no salte al cambiar la hora.
  const tamHora = tamParaCaber("12:59 p. m.", util.w, util.h * (conFecha ? 0.62 : 0.9), 400, 0.56);
  const tamFecha = tamParaCaber("miércoles, 30 de septiembre", util.w, util.h * 0.22, 80, 0.5);
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
        gap: Math.round(tamFecha * 0.3),
        overflow: "hidden",
        fontFamily: FUENTE,
      }}
    >
      <div style={{ fontSize: tamHora, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{hora}</div>
      {conFecha && (
        <div style={{ fontSize: tamFecha, color: p.suave, lineHeight: 1.1, whiteSpace: "nowrap" }}>{fecha}</div>
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
  const p = paleta(tema);
  if (personas.length === 0) {
    return (
      <div style={{ color: p.suave, fontSize: tamParaCaber(vacio, area.w, area.h * 0.15, 36, 0.5), paddingTop: 8 }}>{vacio}</div>
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
              color: x.esHoy ? AMARILLO : p.texto,
              fontWeight: x.esHoy ? 800 : 500,
            }}
          >
            <span style={{ width: anchoDia, flexShrink: 0, textAlign: "right", fontWeight: 800, color: x.esHoy ? AMARILLO : p.azul, fontVariantNumeric: "tabular-nums" }}>
              {x.dia}
            </span>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.nombre}</span>
            {x.esHoy && <span style={{ flexShrink: 0, fontSize: tamDerecha, fontWeight: 800 }}>¡hoy!</span>}
            {textoDerecha && <span style={{ flexShrink: 0, color: x.esHoy ? AMARILLO : p.suave, fontSize: tamDerecha, whiteSpace: "nowrap" }}>{textoDerecha}</span>}
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
  const p = paleta(tema);
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
  const p = paleta(widget.tema);
  // Las rutas de la app («/reportar-dano») se completan con la dirección del TV.
  const [origen, setOrigen] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la dirección solo existe en el navegador
    setOrigen(window.location.origin);
  }, []);
  const url = widget.destino.startsWith("/") ? (origen ? origen + widget.destino : "") : widget.destino;
  const pad = Math.round(Math.max(16, Math.min(48, Math.min(w, h) * 0.07)));
  const util = { w: w - pad * 2, h: h - pad * 2 };
  // El texto puede ir en dos líneas: se reserva el alto que de verdad ocupa.
  const tamTexto = widget.texto ? Math.max(12, Math.min(44, Math.floor(Math.min(util.h * 0.09, (util.w * 2) / (widget.texto.length * 0.52))))) : 0;
  const lineasTexto = widget.texto ? (widget.texto.length * 0.52 * tamTexto > util.w ? 2 : 1) : 0;
  const corta = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const tamUrl = tamParaCaber(corta || "x", util.w, util.h * 0.05, 26, 0.55, 12);
  const separacion = Math.round(pad * 0.4);
  const altoTexto = lineasTexto * tamTexto * 1.2;
  const lado = Math.max(40, Math.floor(Math.min(util.w, util.h - altoTexto - tamUrl * 1.3 - separacion * (lineasTexto ? 2 : 1))));
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
        fontFamily: FUENTE,
        textAlign: "center",
      }}
    >
      {widget.texto && (
        <div
          style={{
            fontSize: tamTexto,
            fontWeight: 700,
            lineHeight: 1.2,
            flexShrink: 0,
            maxWidth: util.w,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {widget.texto}
        </div>
      )}
      <div style={{ width: lado, height: lado, background: "#fff", borderRadius: lado * 0.04 }}>
        {url && <CodigoQr texto={url} lado={lado} oscuro="#0f172a" claro="#ffffff" />}
      </div>
      <div style={{ fontSize: tamUrl, color: p.suave, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: util.w }}>{corta}</div>
    </div>
  );
}

const fechaCorta = (iso: string) => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;

/** Pinta un widget en su caja (w×h en px del lienzo). */
export function WidgetPantalla({ el, datos }: { el: ElementoWidget; datos: DatosWidgets | undefined }) {
  const { w, h, widget } = el;
  const tema = widget.tema;
  const p = paleta(tema);
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
              return (
                <div style={{ height: "100%", display: "flex", alignItems: "center", gap: area.h * 0.12 }}>
                  <span style={{ fontFamily: FUENTE_EMOJI, fontSize: area.h * 0.6, lineHeight: 1 }}>👏</span>
                  <span style={{ fontSize: tamParaCaber(t, area.w * 0.7, area.h * 0.22, 56, 0.5), fontWeight: 700 }}>{t}</span>
                </div>
              );
            }
            const c = CONSEJOS_FACTOR[f.clave];
            const tamEmoji = Math.min(area.h * 0.85, area.w * 0.22);
            const anchoTexto = area.w - tamEmoji - area.h * 0.12;
            const tamTitulo = tamParaCaber(f.etiqueta, anchoTexto, area.h * 0.3, 96, 0.58);
            const detalle = `En ${f.accidentes} de ${f.total} ${f.total === 1 ? "accidente" : "accidentes"}`;
            const tamDetalle = tamParaCaber(detalle, anchoTexto, area.h * 0.13, 36, 0.5);
            const tamConsejo = Math.max(16, Math.min(44, Math.floor(Math.min(area.h * 0.13, anchoTexto / 26))));
            return (
              <div style={{ height: "100%", display: "flex", alignItems: "center", gap: area.h * 0.12 }}>
                <span style={{ fontFamily: FUENTE_EMOJI, fontSize: tamEmoji, lineHeight: 1, flexShrink: 0 }}>{c?.emoji ?? "⚠️"}</span>
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: area.h * 0.04 }}>
                  <div style={{ fontSize: tamTitulo, fontWeight: 800, lineHeight: 1.05, color: NARANJA, whiteSpace: "nowrap" }}>{f.etiqueta}</div>
                  <div style={{ fontSize: tamDetalle, color: p.suave }}>{detalle}</div>
                  {c && (
                    <div
                      style={{
                        fontSize: tamConsejo,
                        fontWeight: 600,
                        lineHeight: 1.2,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {c.consejo}
                    </div>
                  )}
                </div>
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
            const tamNota = tamParaCaber(nota, area.w, area.h * 0.1, 34, 0.5);
            const altoBarra = Math.max(10, Math.round(area.h * 0.07));
            const altoFichas = area.h - tamNota * 1.5 - altoBarra - 16;
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
                <div style={{ fontSize: tamNota, color: p.suave, lineHeight: 1.2 }}>{nota}</div>
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
            const anchoLista = conPadrino ? area.w * 0.55 : area.w;
            const anchoPadrino = area.w - anchoLista - (conPadrino ? 24 : 0);
            const filas = Math.max(1, Math.min(d.titulos.length, Math.floor(area.h / 56)));
            const tamFila = Math.max(18, Math.min(48, Math.floor((area.h / Math.max(filas, 3)) * 0.55)));
            const monto = d.padrinoMaximo != null ? `$${miles(d.padrinoMaximo)}` : "";
            // Cifras y «$» en negrita 900 son más anchos que el promedio: 0,7 em por carácter.
            const tamMonto = tamParaCaber(monto, anchoPadrino - 32, area.h * 0.26, 96, 0.7);
            const tamPadrino = Math.max(16, Math.min(36, Math.floor(Math.min(area.h * 0.09, (anchoPadrino - 32) / 14))));
            return (
              <div style={{ display: "flex", gap: 24, height: "100%" }}>
                <div style={{ width: anchoLista, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  {d.titulos.length === 0 ? (
                    <div style={{ fontSize: tamParaCaber("Pregunte en Recursos Humanos", anchoLista, area.h * 0.14, 44, 0.5), color: p.suave }}>
                      Pregunte en Recursos Humanos
                    </div>
                  ) : (
                    <>
                      {d.titulos.slice(0, filas).map((t) => (
                        <div
                          key={t}
                          style={{
                            fontSize: tamFila,
                            lineHeight: 1.3,
                            fontWeight: 600,
                            display: "flex",
                            gap: tamFila * 0.4,
                            alignItems: "center",
                          }}
                        >
                          <span style={{ color: p.azul, flexShrink: 0 }}>●</span>
                          <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t}</span>
                        </div>
                      ))}
                      {d.titulos.length > filas && <div style={{ fontSize: tamFila * 0.7, color: p.suave, marginTop: 4 }}>y {d.total - filas} más</div>}
                    </>
                  )}
                </div>
                {conPadrino && (
                  <div
                    style={{
                      width: anchoPadrino,
                      background: p.tarjeta,
                      borderRadius: 24,
                      padding: 16,
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: tamPadrino, fontWeight: 700, lineHeight: 1.2 }}>Refiera a un conductor y gane hasta</div>
                    <div style={{ fontSize: tamMonto, fontWeight: 900, color: VERDE, lineHeight: 1, whiteSpace: "nowrap" }}>{monto}</div>
                    <div style={{ fontSize: tamPadrino * 0.8, color: p.suave, lineHeight: 1.2 }}>
                      Plan Padrino{d.referidosMes > 0 ? ` · ${d.referidosMes} ${d.referidosMes === 1 ? "referido" : "referidos"} este mes` : ""}
                    </div>
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

    case "acc_dias_sin": {
      const n = datos?.accidentabilidad?.diasSinAccidentes;
      const pad = Math.round(Math.max(12, Math.min(48, Math.min(w, h) * 0.08)));
      const util = { w: w - pad * 2, h: h - pad * 2 };
      const cifra = n == null ? "Sin datos" : miles(n);
      const etiqueta = n === 1 ? "día sin accidentes" : "días sin accidentes";
      const tamEtiqueta = tamParaCaber(etiqueta, util.w, util.h * 0.16, 64, 0.52);
      const tamCifra = n == null ? tamEtiqueta * 1.4 : tamParaCaber(cifra, util.w, util.h - tamEtiqueta * 1.6, 420, 0.62);
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
            gap: Math.round(tamEtiqueta * 0.4),
            overflow: "hidden",
            fontFamily: FUENTE,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: tamCifra,
              fontWeight: 900,
              lineHeight: 1,
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
              color: n == null ? p.suave : n >= 30 ? VERDE : p.texto,
            }}
          >
            {cifra}
          </div>
          <div style={{ fontSize: tamEtiqueta, color: p.suave, lineHeight: 1.1, whiteSpace: "nowrap" }}>{etiqueta}</div>
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
                  <Line dataKey="total" stroke={AZUL} strokeWidth={Math.max(3, tam * 0.25)} dot={{ r: Math.max(4, tam * 0.25), fill: AZUL }} isAnimationActive={false}>
                    <LabelList dataKey="total" position="top" offset={Math.round(tam * 0.5)} fill={p.texto} fontSize={tam} fontWeight={700} />
                  </Line>
                  <Line dataKey="graves" stroke={NARANJA} strokeWidth={Math.max(2, tam * 0.18)} dot={{ r: Math.max(3, tam * 0.2), fill: NARANJA }} isAnimationActive={false} />
                </LineChart>
                <div style={{ height: altoLeyenda, display: "flex", alignItems: "center", gap: tam * 1.5, fontSize: tam, color: p.suave, paddingLeft: Math.round(tam * 2.6) }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: tam * 0.35 }}>
                    <span style={{ width: tam * 0.7, height: tam * 0.7, borderRadius: 999, background: AZUL }} /> Accidentes
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
                <Bar dataKey="dias" fill={AZUL} radius={[Math.round(tam * 0.4), Math.round(tam * 0.4), 0, 0]} isAnimationActive={false}>
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
