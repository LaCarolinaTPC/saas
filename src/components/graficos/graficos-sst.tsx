"use client";

/**
 * Gráficos de la caracterización de accidentes de trabajo (SST), con Recharts,
 * y la figura del cuerpo con las zonas afectadas.
 *
 * Mismas reglas que los de ausentismo (guía de visualización del proyecto):
 * una medida por gráfico (número de accidentes), un solo color —el naranja de
 * «eventos» de la paleta validada—, barras en vez de las líneas del Excel (son
 * categorías, no una serie continua), valor escrito al lado de cada barra,
 * texto en tinta y tooltip por barra.
 *
 * La figura reemplaza el dibujo del Excel: cada zona se colorea en una sola
 * gama (claro → oscuro) según su parte del total, y lleva su etiqueta con el
 * porcentaje y el número, así el color nunca es el único dato.
 */

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Conteo, GrupoParteCuerpo } from "@/lib/sst/reglas";

const COLOR = "#eb6834";
const TINTA = "#0f172a";
const TINTA_SUAVE = "#64748b";
const REJILLA = "#e2e8f0";

const fmt = (n: number) => n.toLocaleString("es-CO");

function TooltipConteo({ active, payload }: { active?: boolean; payload?: { payload: Conteo }[] }) {
  if (!active || !payload?.length) return null;
  const c = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-900">{c.label}</p>
      <p className="text-gray-700">
        {fmt(c.n)} accidente{c.n === 1 ? "" : "s"} · {c.pct}%
      </p>
    </div>
  );
}

/** Ranking horizontal. Sin `incluirCeros` se ocultan las opciones sin casos. */
export function BarrasConteo({ datos, incluirCeros = false, anchoEtiqueta = 210 }: { datos: Conteo[]; incluirCeros?: boolean; anchoEtiqueta?: number }) {
  const filas = incluirCeros ? datos : datos.filter((d) => d.n > 0);
  if (filas.length === 0) return <p className="py-8 text-center text-sm text-gray-500">Sin accidentes en este periodo.</p>;
  const alto = Math.max(110, filas.length * 30 + 20);
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filas} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={REJILLA} strokeDasharray="2 4" />
          <XAxis type="number" hide domain={[0, "dataMax"]} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={anchoEtiqueta}
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 11, fill: TINTA }}
            tickFormatter={(v: string) => (v.length > 36 ? `${v.slice(0, 35)}…` : v)}
          />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={<TooltipConteo />} />
          <Bar dataKey="n" fill={COLOR} barSize={14} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList
              dataKey="n"
              position="right"
              offset={6}
              style={{ fontSize: 11, fill: TINTA, fontWeight: 500 }}
              formatter={(v: unknown) => fmt(Number(v))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Columnas por categoría ordenada (meses, días de la semana): valor sobre cada columna con casos. */
export function ColumnasConteo({ datos, alto = 220, abreviar = 3 }: { datos: Conteo[]; alto?: number; abreviar?: number }) {
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 18, right: 8, bottom: 0, left: -18 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={REJILLA} strokeDasharray="2 4" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 11, fill: TINTA_SUAVE }}
            tickFormatter={(v: string) => v.slice(0, abreviar)}
          />
          <YAxis tickLine={false} axisLine={false} width={40} tick={{ fontSize: 11, fill: TINTA_SUAVE }} allowDecimals={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={<TooltipConteo />} />
          <Bar dataKey="n" fill={COLOR} radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false}>
            <LabelList
              dataKey="n"
              position="top"
              style={{ fontSize: 11, fill: TINTA, fontWeight: 600 }}
              formatter={(v: unknown) => (Number(v) > 0 ? fmt(Number(v)) : "")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Figura del cuerpo ───────────────────────────────────────────────────────

/** Una gama (claro → oscuro) del naranja de la paleta; 0 casos = gris. */
const SIN_CASOS = { relleno: "#f1f5f9", borde: "#cbd5e1" };
const CLARO = [253, 226, 208]; // #fde2d0
const OSCURO = [180, 64, 22]; // #b44016

function tono(fraccion: number): string {
  const t = Math.max(0, Math.min(1, fraccion));
  const c = CLARO.map((a, i) => Math.round(a + (OSCURO[i] - a) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

type Zona = { key: GrupoParteCuerpo; formas: React.ReactNode; ancla: [number, number]; etiqueta: [number, number]; lado: "izq" | "der" };

/** Lado derecho de la figura: el mismo trazo del izquierdo, reflejado. */
const espejo = (d: string) => (
  <>
    <path d={d} />
    <path d={d} transform="translate(460 0) scale(-1 1)" />
  </>
);

/**
 * Silueta de frente, viewBox 0 0 460 470. Cada zona con su ancla para la línea
 * de la etiqueta. Los brazos van primero para que el tórax los tape en el hombro.
 */
const ZONAS: Zona[] = [
  {
    key: "miembros_superiores",
    formas: espejo("M172 114 C158 120 154 136 153 156 L145 250 L163 252 L170 190 C172 176 172 160 172 150 Z"),
    ancla: [156, 200],
    etiqueta: [12, 182],
    lado: "izq",
  },
  {
    key: "manos",
    formas: espejo("M144 254 L164 256 C168 266 166 279 159 286 C153 292 144 290 140 282 C137 272 139 262 144 254 Z"),
    ancla: [148, 272],
    etiqueta: [12, 262],
    lado: "izq",
  },
  {
    key: "cabeza_cara",
    formas: <path d="M230 16 C249 16 261 31 261 51 C261 70 248 84 230 84 C212 84 199 70 199 51 C199 31 211 16 230 16 Z" />,
    ancla: [200, 56],
    etiqueta: [12, 46],
    lado: "izq",
  },
  { key: "ojo", formas: espejo("M216 48 C219 45 224 45 227 48 C224 51 219 51 216 48 Z"), ancla: [239, 48], etiqueta: [448, 40], lado: "der" },
  { key: "cuello", formas: <path d="M218 80 C224 86 236 86 242 80 L245 102 L215 102 Z" />, ancla: [218, 92], etiqueta: [12, 108], lado: "izq" },
  {
    key: "torax",
    formas: <path d="M215 100 L245 100 C258 104 276 106 286 113 C294 119 295 130 292 142 L284 182 L176 182 L168 142 C165 130 166 119 174 113 C184 106 202 104 215 100 Z" />,
    ancla: [286, 140],
    etiqueta: [448, 128],
    lado: "der",
  },
  {
    key: "abdomen",
    formas: <path d="M176 184 L284 184 C281 200 279 214 281 230 L179 230 C181 214 179 200 176 184 Z" />,
    ancla: [280, 208],
    etiqueta: [448, 198],
    lado: "der",
  },
  {
    key: "tronco",
    formas: <path d="M179 232 L281 232 C287 244 289 258 287 272 L232 278 L228 278 L173 272 C171 258 173 244 179 232 Z" />,
    ancla: [287, 256],
    etiqueta: [448, 262],
    lado: "der",
  },
  {
    key: "miembros_inferiores",
    formas: espejo("M173 274 L227 281 C226 310 223 346 219 384 L216 422 L198 422 L192 388 C184 350 174 312 173 274 Z"),
    ancla: [256, 344],
    etiqueta: [448, 338],
    lado: "der",
  },
  {
    key: "pies",
    formas: espejo("M197 424 L217 424 C221 431 221 440 214 444 L186 444 C178 444 178 436 186 432 Z"),
    ancla: [184, 438],
    etiqueta: [12, 424],
    lado: "izq",
  },
];

/**
 * Figura del cuerpo (como la del Excel, sin calcarla): cada zona del cuerpo con su parte de los
 * accidentes. «Ubicaciones múltiples» y «Otro» no tienen zona: van debajo.
 */
export function FiguraCuerpo({ datos }: { datos: Conteo[] }) {
  const por = new Map(datos.map((d) => [d.key, d]));
  const max = Math.max(...datos.map((d) => d.pct), 0);
  const sinZona = datos.filter((d) => (d.key === "ubicaciones_multiples" || d.key === "otro") && d.n > 0);
  return (
    <figure className="w-full">
      <svg viewBox="0 0 460 470" className="mx-auto block h-auto w-full max-w-[520px]" role="img" aria-label="Partes del cuerpo afectadas">
        {ZONAS.map((z) => {
          const c = por.get(z.key);
          const n = c?.n ?? 0;
          const relleno = n > 0 ? tono(max ? c!.pct / max : 0) : SIN_CASOS.relleno;
          const borde = n > 0 ? "#ffffff" : SIN_CASOS.borde;
          return (
            <g key={z.key} fill={relleno} stroke={borde} strokeWidth={2}>
              <title>{`${c?.label ?? z.key}: ${n} accidente${n === 1 ? "" : "s"} (${c?.pct ?? 0}%)`}</title>
              {z.formas}
            </g>
          );
        })}
        {/* Etiquetas con línea guía: el dato siempre escrito, no solo el color. */}
        {ZONAS.map((z) => {
          const c = por.get(z.key);
          const n = c?.n ?? 0;
          const [x, y] = z.etiqueta;
          const [ax, ay] = z.ancla;
          const izq = z.lado === "izq";
          const finLinea = izq ? x + 112 : x - 112;
          return (
            <g key={`e-${z.key}`}>
              <polyline points={`${finLinea},${y + 6} ${ax},${ay}`} fill="none" stroke="#94a3b8" strokeWidth={1} />
              <text x={x} y={y} textAnchor={izq ? "start" : "end"} fontSize={12} fill={TINTA_SUAVE}>
                {c?.label ?? z.key}
              </text>
              <text x={x} y={y + 17} textAnchor={izq ? "start" : "end"} fontSize={15} fontWeight={700} fill={n > 0 ? TINTA : "#94a3b8"}>
                {`${c?.pct ?? 0}%`}
                <tspan fontSize={12} fontWeight={500} fill={TINTA_SUAVE}>{` · ${n}`}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-10 rounded-sm" style={{ background: `linear-gradient(90deg, ${tono(0)}, ${tono(1)})` }} />
          menos → más accidentes
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border border-[#cbd5e1] bg-[#f1f5f9]" /> sin casos
        </span>
        {sinZona.map((d) => (
          <span key={d.key}>
            {d.label}: <strong className="text-gray-700">{d.pct}%</strong> · {d.n}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
