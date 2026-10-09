"use client";

import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  ArrowUpRight, Asterisk, Compass, Minus, Plus, RotateCw, Trash2, Type, Undo2, X,
} from "lucide-react";
import {
  ALTO, ANCHO, CARRIL, CUADRO, FIGURAS, PLANTILLAS, PX_POR_METRO, SENALES,
  leyenda, siguienteEtiqueta,
  type Croquis, type Elemento, type Figura, type Plantilla, type Senal, type VehiculoCroquis,
} from "@/lib/accidentabilidad/croquis";

// ── Dibujo (compartido por el editor y la lámina que se exporta) ────────────

const TINTA = "#334155";
const VIA = "#E5E7EB";
const VERDE = "#BBF7D0";
const COLORES = ["#1D4ED8", "#DC2626", "#059669", "#D97706", "#7C3AED", "#0891B2", "#BE185D"];
const colorDe = (etiqueta: string) =>
  etiqueta.startsWith("P") ? "#0F172A" : COLORES[(parseInt(etiqueta.slice(1), 10) - 1) % COLORES.length] ?? "#475569";
const pequeno = (f: Figura) => f === "moto" || f === "bicicleta" || f === "peaton";

type Calle = { d: string; w: number };

/** Geometría de cada plantilla, centrada en (0,0); se gira con rotVia. */
function geometria(p: Plantilla): { calles: Calle[]; centros: string[]; separador?: string; isla?: number } {
  const w = 2 * CARRIL;
  switch (p) {
    case "recta2":
      return { calles: [{ d: "M-700 0 H700", w }], centros: ["M-700 0 H700"] };
    case "recta4":
      return {
        calles: [{ d: "M-700 -90 H700", w }, { d: "M-700 90 H700", w }],
        centros: ["M-700 -90 H700", "M-700 90 H700"],
        separador: "M-700 0 H700",
      };
    case "cruce":
      return {
        calles: [{ d: "M-700 0 H700", w }, { d: "M0 -700 V700", w }],
        centros: ["M-700 0 H-70 M70 0 H700", "M0 -700 V-70 M0 70 V700"],
      };
    case "t":
      return {
        calles: [{ d: "M-700 0 H700", w }, { d: "M0 0 V700", w }],
        centros: ["M-700 0 H700", "M0 70 V700"],
      };
    case "glorieta":
      return {
        calles: [
          { d: "M-140 0 a140 140 0 1 0 280 0 a140 140 0 1 0 -280 0", w },
          { d: "M-700 0 H-140 M140 0 H700", w },
          { d: "M0 -700 V-140 M0 140 V700", w },
        ],
        centros: ["M-700 0 H-210 M210 0 H700", "M0 -700 V-210 M0 210 V700"],
        isla: 70,
      };
    case "curva":
      return {
        calles: [{ d: "M-700 120 H-120 A240 240 0 0 0 120 -120 V-700", w }],
        centros: ["M-700 120 H-120 A240 240 0 0 0 120 -120 V-700"],
      };
    default:
      return { calles: [], centros: [] };
  }
}

function Via({ plantilla, rot }: { plantilla: Plantilla; rot: number }) {
  const g = geometria(plantilla);
  if (g.calles.length === 0) return null;
  return (
    <g transform={`translate(${ANCHO / 2} ${ALTO / 2}) rotate(${rot})`}>
      {g.calles.map((c, i) => <path key={`b${i}`} d={c.d} fill="none" stroke={TINTA} strokeWidth={c.w + 4} />)}
      {g.calles.map((c, i) => <path key={`f${i}`} d={c.d} fill="none" stroke={VIA} strokeWidth={c.w} />)}
      {g.separador && (
        <>
          <path d={g.separador} stroke={TINTA} strokeWidth={44} fill="none" />
          <path d={g.separador} stroke={VERDE} strokeWidth={40} fill="none" />
        </>
      )}
      {g.isla && <circle r={g.isla} fill={VERDE} stroke={TINTA} strokeWidth={2} />}
      {g.centros.map((d, i) => (
        <path key={`c${i}`} d={d} fill="none" stroke="#64748B" strokeWidth={2} strokeDasharray="14 10" />
      ))}
    </g>
  );
}

function Cuadricula() {
  return (
    <>
      <defs>
        <pattern id="croquis-m" width={CUADRO} height={CUADRO} patternUnits="userSpaceOnUse">
          <path d={`M${CUADRO} 0 H0 V${CUADRO}`} fill="none" stroke="#E2E8F0" strokeWidth={1} />
        </pattern>
        <pattern id="croquis-5m" width={CUADRO * 5} height={CUADRO * 5} patternUnits="userSpaceOnUse">
          <rect width={CUADRO * 5} height={CUADRO * 5} fill="url(#croquis-m)" />
          <path d={`M${CUADRO * 5} 0 H0 V${CUADRO * 5}`} fill="none" stroke="#CBD5E1" strokeWidth={1} />
        </pattern>
        <marker id="croquis-punta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#0F172A" />
        </marker>
      </defs>
      <rect width={ANCHO} height={ALTO} fill="white" />
      <rect width={ANCHO} height={ALTO} fill="url(#croquis-5m)" />
    </>
  );
}

const ROSA: [string, number, number][] = [["N", 0, -30 + 0], ["S", 0, 30], ["E", 29, 0], ["O", -29, 0]];

/** Rosa de los vientos del formato (N, S, E, O), girable para alinear el norte. */
function Rosa({ norte }: { norte: number }) {
  return (
    <g transform={`translate(${ANCHO - 50} 50)`}>
      <circle r={38} fill="white" stroke={TINTA} strokeWidth={1.5} />
      <g transform={`rotate(${norte})`}>
        <path d="M0 -22 L5 0 L0 -3 L-5 0 z" fill="#DC2626" />
        <path d="M0 22 L5 0 L0 3 L-5 0 z" fill={TINTA} />
        <path d="M-20 0 H20" stroke={TINTA} strokeWidth={1} />
        {ROSA.map(([t, x, y]) => (
          <text key={t} x={x} y={y} fontSize={9} fontWeight={700} textAnchor="middle" dominantBaseline="central"
            fill={t === "N" ? "#DC2626" : TINTA} fontFamily="Arial, sans-serif">
            {t}
          </text>
        ))}
      </g>
    </g>
  );
}

function Estrella({ x, y }: { x: number; y: number }) {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const r = i % 2 === 0 ? 14 : 6;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`;
  }).join(" ");
  return <polygon points={pts} fill="#DC2626" stroke="white" strokeWidth={1.5} />;
}

function SenalSvg({ senal }: { senal: Senal }) {
  if (senal === "pare") {
    const pts = Array.from({ length: 8 }, (_, i) => {
      const a = (Math.PI / 4) * i + Math.PI / 8;
      return `${13 * Math.cos(a)},${13 * Math.sin(a)}`;
    }).join(" ");
    return (
      <>
        <polygon points={pts} fill="#DC2626" stroke="white" strokeWidth={1.5} />
        <text y={3} fontSize={6.5} fontWeight={700} fill="white" textAnchor="middle" fontFamily="Arial, sans-serif">PARE</text>
      </>
    );
  }
  if (senal === "semaforo") {
    return (
      <>
        <rect x={-6} y={-15} width={12} height={30} rx={3} fill="#0F172A" />
        <circle cy={-8} r={3.2} fill="#EF4444" />
        <circle cy={0} r={3.2} fill="#F59E0B" />
        <circle cy={8} r={3.2} fill="#22C55E" />
      </>
    );
  }
  // Paso de cebra: franjas a lo ancho de la vía (2 carriles).
  return (
    <>
      <rect x={-20} y={-CARRIL} width={40} height={2 * CARRIL} fill="white" fillOpacity={0.4} />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={-20} y={-CARRIL + 4 + i * 20} width={40} height={10} fill="#0F172A" fillOpacity={0.85} />
      ))}
    </>
  );
}

function VehiculoSvg({ e }: { e: Extract<Elemento, { tipo: "vehiculo" }> }) {
  const f = FIGURAS[e.figura];
  const L = f.largo * PX_POR_METRO;
  const A = f.ancho * PX_POR_METRO;
  const color = colorDe(e.etiqueta);
  const previa = e.posicion === "previa";
  const cuerpo =
    e.figura === "peaton" ? (
      <circle r={8} fill={previa ? "white" : color} stroke={color} strokeWidth={2} strokeDasharray={previa ? "4 3" : undefined} />
    ) : (
      <>
        <rect x={-L / 2} y={-A / 2} width={L} height={A} rx={Math.min(5, A / 4)}
          fill={previa ? "white" : color} fillOpacity={previa ? 0.7 : 1}
          stroke={previa ? color : "#0F172A"} strokeWidth={previa ? 2 : 1} strokeDasharray={previa ? "6 4" : undefined} />
        {/* Frente del vehículo */}
        <polygon points={`${L / 2 - Math.min(10, L / 4)},${-A / 2 + 2} ${L / 2},0 ${L / 2 - Math.min(10, L / 4)},${A / 2 - 2}`}
          fill={previa ? color : "#0F172A"} fillOpacity={previa ? 0.5 : 0.45} />
      </>
    );
  const chico = pequeno(e.figura);
  return (
    <>
      <g transform={`translate(${e.x} ${e.y}) rotate(${e.rot})`}>{cuerpo}</g>
      <text x={e.x} y={chico ? e.y - 14 : e.y + 5} fontSize={chico ? 12 : 14} fontWeight={700} textAnchor="middle"
        fill={chico || previa ? color : "white"} fontFamily="Arial, sans-serif"
        stroke={chico ? "white" : undefined} strokeWidth={chico ? 3 : undefined} paintOrder="stroke">
        {e.etiqueta}
      </text>
    </>
  );
}

function ElementoSvg({ e }: { e: Elemento }) {
  switch (e.tipo) {
    case "vehiculo":
      return <VehiculoSvg e={e} />;
    case "flecha":
      return <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#0F172A" strokeWidth={3} markerEnd="url(#croquis-punta)" />;
    case "impacto":
      return <Estrella x={e.x} y={e.y} />;
    case "texto":
      return (
        <text x={e.x} y={e.y} fontSize={15} fontWeight={600} textAnchor="middle" dominantBaseline="middle" fill="#0F172A"
          stroke="white" strokeWidth={4} paintOrder="stroke" fontFamily="Arial, sans-serif"
          transform={`rotate(${e.rot} ${e.x} ${e.y})`}>
          {e.texto}
        </text>
      );
    case "senal":
      return <g transform={`translate(${e.x} ${e.y}) rotate(${e.rot})`}><SenalSvg senal={e.senal} /></g>;
  }
}

/** El dibujo completo (0..ANCHO × 0..ALTO), sin controles. */
function Dibujo({ croquis }: { croquis: Croquis }) {
  return (
    <>
      <Cuadricula />
      <Via plantilla={croquis.plantilla} rot={croquis.rotVia} />
      {croquis.elementos.map((e) => <ElementoSvg key={e.id} e={e} />)}
      <Rosa norte={croquis.norte} />
    </>
  );
}

// ── Lámina GO-R-16 y exportación a PNG ──────────────────────────────────────

export type EncabezadoCroquis = { fecha: string; lugar: string; vehiculo: string };

const MARGEN = 20;
const ALTO_ENCABEZADO = 92;

function Lamina({ croquis, vehiculos, encabezado }: { croquis: Croquis; vehiculos: VehiculoCroquis[]; encabezado: EncabezadoCroquis }) {
  const lineas = leyenda(croquis, vehiculos);
  const simbolos = "✱ Punto de impacto   ·   → Dirección   ·   Contorno punteado: posición antes del choque";
  const altoLeyenda = 28 + Math.ceil(lineas.length / 2) * 20 + 26;
  const W = ANCHO + 2 * MARGEN;
  const H = ALTO_ENCABEZADO + ALTO + altoLeyenda + MARGEN;
  const f = "Arial, sans-serif";
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect width={W} height={H} fill="white" />
      <text x={MARGEN} y={26} fontSize={15} fontWeight={700} fill="#0F172A" fontFamily={f}>INVESTIGACIÓN DE ACCIDENTES DE TRÁFICO · REPORTE GRÁFICO (IPAT)</text>
      <text x={MARGEN} y={44} fontSize={11} fill="#475569" fontFamily={f}>Metropolitana de Transporte La Carolina SAS · Código GO-R-16 · Página 2</text>
      <text x={MARGEN} y={66} fontSize={12} fill="#334155" fontFamily={f}>
        {[encabezado.fecha && `Fecha: ${encabezado.fecha}`, encabezado.lugar && `Lugar: ${encabezado.lugar}`, encabezado.vehiculo && `Vehículo: ${encabezado.vehiculo}`].filter(Boolean).join("   ·   ")}
      </text>
      <text x={MARGEN} y={82} fontSize={10} fill="#64748B" fontFamily={f}>Escala: cada cuadro = 1 m · lámina de 40 × 30 m</text>
      <g transform={`translate(${MARGEN} ${ALTO_ENCABEZADO})`}>
        <svg width={ANCHO} height={ALTO} viewBox={`0 0 ${ANCHO} ${ALTO}`}>
          <Dibujo croquis={croquis} />
        </svg>
        <rect width={ANCHO} height={ALTO} fill="none" stroke={TINTA} strokeWidth={1.5} />
      </g>
      <g transform={`translate(${MARGEN} ${ALTO_ENCABEZADO + ALTO + 24})`} fontFamily={f}>
        <text fontSize={12} fontWeight={700} fill="#0F172A">Convenciones</text>
        {lineas.map((l, i) => (
          <text key={l} x={(i % 2) * (ANCHO / 2)} y={22 + Math.floor(i / 2) * 20} fontSize={12} fill={colorDe(l.split(" ")[0])} fontWeight={600}>{l}</text>
        ))}
        <text y={22 + Math.ceil(lineas.length / 2) * 20 + 4} fontSize={11} fill="#475569">{simbolos}</text>
      </g>
    </svg>
  );
}

/**
 * Genera el PNG de la lámina (encabezado GO-R-16, dibujo y convenciones) en
 * el navegador: se arma el SVG fuera de pantalla, se dibuja en un canvas al
 * doble de resolución y se devuelve el PNG.
 */
export async function croquisAPng(
  croquis: Croquis,
  vehiculos: VehiculoCroquis[],
  encabezado: EncabezadoCroquis,
): Promise<Blob> {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(<Lamina croquis={croquis} vehiculos={vehiculos} encabezado={encabezado} />));
  const svg = host.querySelector("svg")!;
  const W = Number(svg.getAttribute("width"));
  const H = Number(svg.getAttribute("height"));
  const markup = new XMLSerializer().serializeToString(svg);
  root.unmount();

  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error("No se pudo dibujar el croquis."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, W, H);
    const png = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
    if (!png) throw new Error("No se pudo generar la imagen del croquis.");
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Sube el PNG del croquis y devuelve su ruta en el bucket. */
export async function subirCroquisPng(png: Blob): Promise<string> {
  const form = new FormData();
  form.append("foto", png, "croquis.png");
  form.append("destino", "croquis");
  const res = await fetch("/api/rotacion/accidentes/fotos", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !data.path) throw new Error(data.error || "No se pudo guardar el croquis.");
  return data.path;
}

// ── Editor ──────────────────────────────────────────────────────────────────

type Arrastre =
  | { modo: "mover"; id: string; dx: number; dy: number }
  | { modo: "rotar"; id: string }
  | { modo: "extremo"; id: string; cual: 1 | 2 }
  | { modo: "pan"; x0: number; y0: number; cx0: number; cy0: number };

const snap = (v: number, paso: number) => Math.round(v / paso) * paso;
const nuevoId = () => crypto.randomUUID().slice(0, 13);

/** Medio largo y medio ancho de la caja de selección, en los ejes del elemento. */
function caja(e: Elemento): { hx: number; hy: number } {
  if (e.tipo === "vehiculo" && !pequeno(e.figura)) {
    const f = FIGURAS[e.figura];
    return { hx: (f.largo * PX_POR_METRO) / 2 + 5, hy: (f.ancho * PX_POR_METRO) / 2 + 5 };
  }
  if (e.tipo === "senal" && e.senal === "cebra") return { hx: 25, hy: CARRIL + 5 };
  if (e.tipo === "texto") return { hx: Math.max(20, e.texto.length * 4.5 + 6), hy: 13 };
  return { hx: 18, hy: 18 };
}

export default function CroquisEditor({
  value,
  onChange,
  vehiculos,
}: {
  value: Croquis;
  onChange: (c: Croquis) => void;
  vehiculos: VehiculoCroquis[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  const historial = useRef<Croquis[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [centro, setCentro] = useState({ x: ANCHO / 2, y: ALTO / 2 });
  // Cuántos pasos se pueden deshacer (el historial vive en un ref).
  const [pasos, setPasos] = useState(0);

  const vw = ANCHO / zoom;
  const vh = ALTO / zoom;
  const vx = Math.min(ANCHO - vw, Math.max(0, centro.x - vw / 2));
  const vy = Math.min(ALTO - vh, Math.max(0, centro.y - vh / 2));
  const seleccionado = value.elementos.find((e) => e.id === sel) ?? null;

  function guardarHistorial() {
    historial.current = [...historial.current.slice(-49), value];
    setPasos(historial.current.length);
  }
  function cambiar(c: Croquis, conHistorial = true) {
    if (conHistorial) guardarHistorial();
    onChange(c);
  }
  function deshacer() {
    const prev = historial.current.pop();
    if (prev) {
      onChange(prev);
      setSel(null);
      setPasos(historial.current.length);
    }
  }
  function actualizar(id: string, cambio: Partial<Elemento>) {
    onChange({ ...value, elementos: value.elementos.map((e) => (e.id === id ? ({ ...e, ...cambio } as Elemento) : e)) });
  }
  function agregar(e: Elemento) {
    cambiar({ ...value, elementos: [...value.elementos, e] });
    setSel(e.id);
  }
  // Lo nuevo aparece en el centro de lo que se está viendo, un poco corrido
  // para no quedar encima del anterior.
  const corrimiento = (value.elementos.length % 5) * 12;
  const px = vx + vw / 2 + corrimiento;
  const py = vy + vh / 2 + corrimiento;

  function agregarVehiculo(v: { etiqueta: string; figura: Figura }) {
    const ya = value.elementos.some((e) => e.tipo === "vehiculo" && e.etiqueta === v.etiqueta && e.posicion === "final");
    agregar({
      id: nuevoId(), tipo: "vehiculo", figura: v.figura, etiqueta: v.etiqueta, x: px, y: py, rot: 0,
      // La segunda vez que se pone el mismo vehículo es su posición antes del choque.
      posicion: ya ? "previa" : "final",
    });
  }
  function agregarTexto() {
    const t = window.prompt("Texto (nombre de la calle, referencia…)")?.trim();
    if (t) agregar({ id: nuevoId(), tipo: "texto", x: px, y: py, rot: 0, texto: t.slice(0, 40) });
  }
  function borrar() {
    if (!sel) return;
    cambiar({ ...value, elementos: value.elementos.filter((e) => e.id !== sel) });
    setSel(null);
  }

  function punto(ev: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const p = svg.createSVGPoint();
    p.x = ev.clientX;
    p.y = ev.clientY;
    const r = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: r.x, y: r.y };
  }

  function iniciar(ev: React.PointerEvent, a: Arrastre) {
    ev.stopPropagation();
    svgRef.current?.setPointerCapture(ev.pointerId);
    if (a.modo !== "pan") guardarHistorial();
    arrastre.current = a;
  }

  function alTocarElemento(ev: React.PointerEvent, e: Elemento) {
    setSel(e.id);
    const p = punto(ev);
    const ox = e.tipo === "flecha" ? (e.x1 + e.x2) / 2 : e.x;
    const oy = e.tipo === "flecha" ? (e.y1 + e.y2) / 2 : e.y;
    iniciar(ev, { modo: "mover", id: e.id, dx: p.x - ox, dy: p.y - oy });
  }

  function alMover(ev: React.PointerEvent) {
    const a = arrastre.current;
    if (!a) return;
    if (a.modo === "pan") {
      const r = svgRef.current!.getBoundingClientRect();
      const escala = vw / r.width;
      setCentro({ x: a.cx0 - (ev.clientX - a.x0) * escala, y: a.cy0 - (ev.clientY - a.y0) * escala });
      return;
    }
    const e = value.elementos.find((x) => x.id === a.id);
    if (!e) return;
    const p = punto(ev);
    if (a.modo === "mover") {
      const nx = p.x - a.dx;
      const ny = p.y - a.dy;
      if (e.tipo === "flecha") {
        const mx = (e.x1 + e.x2) / 2;
        const my = (e.y1 + e.y2) / 2;
        actualizar(e.id, { x1: e.x1 + nx - mx, y1: e.y1 + ny - my, x2: e.x2 + nx - mx, y2: e.y2 + ny - my });
      } else {
        actualizar(e.id, { x: nx, y: ny });
      }
    } else if (a.modo === "rotar" && e.tipo !== "flecha" && e.tipo !== "impacto") {
      const ang = (Math.atan2(p.y - e.y, p.x - e.x) * 180) / Math.PI + 90;
      actualizar(e.id, { rot: ((snap(ang, 5) % 360) + 360) % 360 });
    } else if (a.modo === "extremo" && e.tipo === "flecha") {
      actualizar(e.id, a.cual === 1 ? { x1: p.x, y1: p.y } : { x2: p.x, y2: p.y });
    }
  }

  function alSoltar() {
    arrastre.current = null;
  }

  function alTocarFondo(ev: React.PointerEvent) {
    setSel(null);
    if (zoom > 1) {
      svgRef.current?.setPointerCapture(ev.pointerId);
      arrastre.current = { modo: "pan", x0: ev.clientX, y0: ev.clientY, cx0: vx + vw / 2, cy0: vy + vh / 2 };
    }
  }

  function cambiarZoom(z: number) {
    const nz = Math.min(3, Math.max(1, z));
    setCentro({ x: vx + vw / 2, y: vy + vh / 2 });
    setZoom(nz);
  }

  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-40";
  const chip = "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium";

  return (
    <div
      className="space-y-3 outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Delete" || e.key === "Backspace") && sel && !(e.target instanceof HTMLInputElement)) borrar();
        if (e.key === "z" && (e.ctrlKey || e.metaKey)) deshacer();
      }}
    >
      {/* Vía y orientación */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900"
          value={value.plantilla}
          onChange={(e) => cambiar({ ...value, plantilla: e.target.value as Plantilla })}
          aria-label="Plantilla de vía"
        >
          {(Object.keys(PLANTILLAS) as Plantilla[]).map((p) => <option key={p} value={p}>{PLANTILLAS[p]}</option>)}
        </select>
        <button type="button" className={btn} disabled={value.plantilla === "vacia"}
          onClick={() => cambiar({ ...value, rotVia: (value.rotVia + 15) % 360 })} title="Girar la vía 15°">
          <RotateCw className="h-4 w-4" /> Vía
        </button>
        <button type="button" className={btn} onClick={() => cambiar({ ...value, norte: (value.norte + 45) % 360 })} title="Girar el norte 45°">
          <Compass className="h-4 w-4" /> Norte
        </button>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className={btn} onClick={() => cambiarZoom(zoom - 0.5)} disabled={zoom <= 1} aria-label="Alejar"><Minus className="h-4 w-4" /></button>
          <span className="w-10 text-center text-xs text-gray-500">{Math.round(zoom * 100)}%</span>
          <button type="button" className={btn} onClick={() => cambiarZoom(zoom + 0.5)} disabled={zoom >= 3} aria-label="Acercar"><Plus className="h-4 w-4" /></button>
        </span>
      </div>

      {/* Vehículos del reporte y figuras */}
      <div className="flex flex-wrap gap-2">
        {vehiculos.map((v) => (
          <button key={v.etiqueta} type="button" onClick={() => agregarVehiculo(v)}
            className={chip} style={{ borderColor: colorDe(v.etiqueta), color: colorDe(v.etiqueta) }} title={v.descripcion}>
            <span className="font-bold">{v.etiqueta}</span>
            <span className="max-w-36 truncate font-normal text-gray-600">{v.descripcion}</span>
          </button>
        ))}
        <select
          className="h-9 rounded-full border border-[#E2E8F0] bg-white px-3 text-sm text-gray-700"
          value=""
          onChange={(e) => {
            const figura = e.target.value as Figura;
            if (figura) agregarVehiculo({ figura, etiqueta: siguienteEtiqueta(value.elementos, figura) });
          }}
          aria-label="Agregar otra figura"
        >
          <option value="">+ Otra figura…</option>
          {(Object.keys(FIGURAS) as Figura[]).map((f) => <option key={f} value={f}>{FIGURAS[f].label}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn}
          onClick={() => agregar({ id: nuevoId(), tipo: "flecha", x1: px - 60, y1: py, x2: px + 60, y2: py })}>
          <ArrowUpRight className="h-4 w-4" /> Dirección
        </button>
        <button type="button" className={btn} onClick={() => agregar({ id: nuevoId(), tipo: "impacto", x: px, y: py })}>
          <Asterisk className="h-4 w-4 text-[#DC2626]" /> Impacto
        </button>
        <button type="button" className={btn} onClick={agregarTexto}>
          <Type className="h-4 w-4" /> Texto
        </button>
        <select
          className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700"
          value=""
          onChange={(e) => {
            const senal = e.target.value as Senal;
            if (senal) agregar({ id: nuevoId(), tipo: "senal", senal, x: px, y: py, rot: 0 });
          }}
          aria-label="Agregar señal"
        >
          <option value="">+ Señal…</option>
          {(Object.keys(SENALES) as Senal[]).map((s) => <option key={s} value={s}>{SENALES[s]}</option>)}
        </select>
        <span className="ml-auto flex gap-2">
          <button type="button" className={btn} onClick={deshacer} disabled={pasos === 0}>
            <Undo2 className="h-4 w-4" /> Deshacer
          </button>
        </span>
      </div>

      {/* Lienzo */}
      <div className="relative overflow-hidden rounded-lg border border-[#334155] bg-white">
        <svg
          ref={svgRef}
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          className="block h-auto w-full select-none"
          style={{ touchAction: "none", aspectRatio: `${ANCHO} / ${ALTO}` }}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          role="application"
          aria-label="Croquis del accidente"
        >
          <g onPointerDown={alTocarFondo}>
            <Cuadricula />
            <Via plantilla={value.plantilla} rot={value.rotVia} />
          </g>
          {value.elementos.map((e) => (
            <g key={e.id} onPointerDown={(ev) => alTocarElemento(ev, e)} style={{ cursor: "move" }}>
              <ElementoSvg e={e} />
              {/* Zona de toque generosa para figuras pequeñas */}
              {e.tipo === "flecha" ? (
                <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="transparent" strokeWidth={22} />
              ) : (
                <circle cx={e.x} cy={e.y} r={18} fill="transparent" />
              )}
            </g>
          ))}
          <g pointerEvents="none"><Rosa norte={value.norte} /></g>

          {seleccionado && <Seleccion e={seleccionado} iniciar={iniciar} zoom={zoom} />}
        </svg>
        <p className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-gray-400">Cada cuadro = 1 m</p>
      </div>

      {/* Acciones sobre lo seleccionado */}
      {seleccionado && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[#EEF2FF] px-3 py-2 text-sm">
          <span className="font-medium text-[#4338CA]">{descripcionDe(seleccionado)}</span>
          {seleccionado.tipo === "vehiculo" && (
            <button type="button" className={btn}
              onClick={() => { guardarHistorial(); actualizar(seleccionado.id, { posicion: seleccionado.posicion === "final" ? "previa" : "final" }); }}>
              {seleccionado.posicion === "final" ? "Marcar antes del choque" : "Marcar posición final"}
            </button>
          )}
          {seleccionado.tipo !== "flecha" && seleccionado.tipo !== "impacto" && (
            <button type="button" className={btn}
              onClick={() => { guardarHistorial(); actualizar(seleccionado.id, { rot: ((seleccionado.rot + 45) % 360) }); }}>
              <RotateCw className="h-4 w-4" /> 45°
            </button>
          )}
          <button type="button" className={`${btn} text-[#DC2626]`} onClick={borrar}>
            <Trash2 className="h-4 w-4" /> Quitar
          </button>
          <button type="button" onClick={() => setSel(null)} className="ml-auto text-gray-500" aria-label="Cerrar selección">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <p className="text-xs text-gray-500">
        Toca un vehículo de arriba para ponerlo; tócalo otra vez para su posición antes del choque. Arrastra para mover
        y usa el punto azul para girar. Con zoom, arrastra el fondo para desplazarte.
      </p>
    </div>
  );
}

function descripcionDe(e: Elemento): string {
  switch (e.tipo) {
    case "vehiculo": return `${e.etiqueta} · ${FIGURAS[e.figura].label}${e.posicion === "previa" ? " (antes del choque)" : ""}`;
    case "flecha": return "Dirección";
    case "impacto": return "Punto de impacto";
    case "texto": return `Texto: ${e.texto}`;
    case "senal": return SENALES[e.senal];
  }
}

/** Marco de selección con el asa de giro (o los extremos de la flecha). */
function Seleccion({
  e, iniciar, zoom,
}: {
  e: Elemento;
  iniciar: (ev: React.PointerEvent, a: Arrastre) => void;
  zoom: number;
}) {
  const r = 11 / Math.sqrt(zoom);
  const asa = "#4F46E5";
  if (e.tipo === "flecha") {
    return (
      <>
        {([1, 2] as const).map((cual) => (
          <circle key={cual} cx={cual === 1 ? e.x1 : e.x2} cy={cual === 1 ? e.y1 : e.y2} r={r}
            fill="white" stroke={asa} strokeWidth={2.5} style={{ cursor: "crosshair" }}
            onPointerDown={(ev) => iniciar(ev, { modo: "extremo", id: e.id, cual })} />
        ))}
      </>
    );
  }
  if (e.tipo === "impacto") {
    return <circle cx={e.x} cy={e.y} r={20} fill="none" stroke={asa} strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />;
  }
  const { hx, hy } = caja(e);
  const d = hy + 24;
  return (
    <g transform={`translate(${e.x} ${e.y}) rotate(${e.rot})`}>
      <rect x={-hx} y={-hy} width={2 * hx} height={2 * hy} rx={4} fill="none" stroke={asa} strokeWidth={1.5} strokeDasharray="5 4" pointerEvents="none" />
      <line y1={-hy} y2={-d} stroke={asa} strokeWidth={2} pointerEvents="none" />
      <circle cy={-d} r={r} fill={asa} stroke="white" strokeWidth={2} style={{ cursor: "grab" }}
        onPointerDown={(ev) => iniciar(ev, { modo: "rotar", id: e.id })} />
    </g>
  );
}
