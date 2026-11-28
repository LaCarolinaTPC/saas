"use client";

/**
 * Gráficos de los indicadores de Comunicaciones, con Recharts.
 *
 * Mismas reglas que los de ausentismo (graficos-ausentismo.tsx): una medida
 * por gráfico y un solo eje; azul para la medida, naranja solo para lo que
 * pide atención (sin respuesta, errores) y gris para «otros» o «sin dato»;
 * texto en tinta y tooltip por marca. Las proporciones van en barras
 * horizontales con su etiqueta y porcentaje, no en tortas.
 */

import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const AZUL = "#2a78d6";
const NARANJA = "#eb6834";
const NEUTRO = "#94a3b8";
const TINTA = "#0f172a";
const TINTA_SUAVE = "#64748b";
const REJILLA = "#e2e8f0";

const fmt = (n: number) => n.toLocaleString("es-CO");

export type Tono = "normal" | "alerta" | "neutro";
const COLOR: Record<Tono, string> = { normal: AZUL, alerta: NARANJA, neutro: NEUTRO };

export interface FilaBarra {
  clave: string;
  etiqueta: string;
  n: number;
  tono?: Tono;
  /** Texto extra para el tooltip. */
  detalle?: string;
}

type FilaConPct = FilaBarra & { pct: string | null };

/** Porcentaje legible: «<1%» cuando hay casos pero no alcanzan el 1 %, para no mostrar un 0 % engañoso. */
function pctTexto(n: number, total: number): string {
  if (!total) return "";
  const p = (n / total) * 100;
  return n > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`;
}

/**
 * Etiqueta al final de cada barra, en una sola línea (la de Recharts la parte
 * en dos en las barras largas) y también en las filas en cero.
 */
function EtiquetaBarra(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown; total?: number }) {
  const x = Number(props.x ?? 0) + Number(props.width ?? 0) + 6;
  const y = Number(props.y ?? 0) + Number(props.height ?? 0) / 2;
  const n = Number(props.value ?? 0);
  const texto = props.total ? `${fmt(n)} · ${pctTexto(n, props.total)}` : fmt(n);
  return (
    <text x={x} y={y} dominantBaseline="central" fontSize={11} fontWeight={500} fill={TINTA}>
      {texto}
    </text>
  );
}

function TooltipFila({ active, payload, unidad }: { active?: boolean; payload?: { payload: FilaConPct }[]; unidad: string }) {
  if (!active || !payload?.length) return null;
  const f = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-900">{f.etiqueta}</p>
      {f.detalle && <p className="text-gray-500">{f.detalle}</p>}
      <p className="mt-1 text-gray-700">
        <span className="font-medium">{fmt(f.n)}</span> {unidad}
        {f.pct != null && <span className="text-gray-500"> · {f.pct}</span>}
      </p>
    </div>
  );
}

/**
 * Barras horizontales con el valor y su porcentaje sobre `total` al final de
 * cada barra. La altura crece con las filas para que no se monten.
 */
export function BarrasConPorcentaje({
  filas,
  total,
  unidad = "conversaciones",
  anchoEtiqueta = 190,
}: {
  filas: FilaBarra[];
  /** Base del porcentaje; sin ella solo se muestra el valor. */
  total?: number;
  unidad?: string;
  anchoEtiqueta?: number;
}) {
  if (filas.length === 0 || filas.every((f) => f.n === 0)) {
    return <p className="py-6 text-center text-sm text-gray-500">Sin datos en este periodo.</p>;
  }
  const datos: FilaConPct[] = filas.map((f) => ({ ...f, pct: total ? pctTexto(f.n, total) : null }));
  const alto = Math.max(90, datos.length * 34 + 16);
  return (
    <div style={{ height: alto }} className="relative w-full">
      {/* Los datos del gráfico en una tabla oculta: la usan las exportaciones de Indicadores y los lectores de pantalla. */}
      <table className="sr-only" data-exportar="grafico">
        <thead>
          <tr>
            <th>Concepto</th>
            <th>{unidad.charAt(0).toUpperCase() + unidad.slice(1)}</th>
            {total ? <th>%</th> : null}
          </tr>
        </thead>
        <tbody>
          {datos.map((f) => (
            <tr key={f.clave}>
              <td>{f.etiqueta}</td>
              <td>{f.n}</td>
              {total ? <td>{f.pct}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      <ResponsiveContainer width="100%" height="100%">
        {/* Margen derecho para que la etiqueta de la barra más larga quepa en una línea. */}
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 96, bottom: 4, left: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={REJILLA} strokeDasharray="2 4" />
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="etiqueta"
            width={anchoEtiqueta}
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 11, fill: TINTA }}
            tickFormatter={(v: string) => (v.length > 34 ? `${v.slice(0, 33)}…` : v)}
          />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={<TooltipFila unidad={unidad} />} />
          {/* Recharts descarta las barras en 0 y con ellas su etiqueta: se les da un
              ancho mínimo invisible para que aparezca «0 · 0%» junto al eje. */}
          <Bar
            dataKey="n"
            barSize={14}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
            minPointSize={(v) => (Number(v) === 0 ? 0.001 : 0)}
          >
            {datos.map((f) => (
              <Cell key={f.clave} fill={COLOR[f.tono ?? "normal"]} />
            ))}
            <LabelList dataKey="n" content={(p) => <EtiquetaBarra {...(p as Parameters<typeof EtiquetaBarra>[0])} total={total} />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Un periodo (día o semana) con su etiqueta y una o más cantidades. */
type Dia = { fecha: string; etiqueta: string } & Record<string, string | number>;

function TooltipDia({ active, payload, clave, unidad }: { active?: boolean; payload?: { payload: Dia }[]; clave: string; unidad: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-900">{d.etiqueta}</p>
      <p className="mt-1 text-gray-700">
        <span className="font-medium">{fmt(Number(d[clave]) || 0)}</span> {unidad}
      </p>
    </div>
  );
}

/**
 * Barras por periodo (hora de Bogotá). Por defecto, conversaciones nuevas por
 * día; `clave` y `unidad` lo adaptan (p. ej. aspirantes por semana).
 */
export function BarrasPorDia({
  datos,
  alto = 220,
  clave = "conversaciones",
  unidad = "conversaciones nuevas",
}: {
  datos: Dia[];
  alto?: number;
  clave?: string;
  unidad?: string;
}) {
  const max = Math.max(...datos.map((d) => Number(d[clave]) || 0), 0);
  if (max === 0) return <p className="py-6 text-center text-sm text-gray-500">Sin {unidad} en este periodo.</p>;
  return (
    <div style={{ height: alto }} className="relative w-full">
      <table className="sr-only" data-exportar="grafico">
        <thead>
          <tr>
            <th>Periodo</th>
            <th>{unidad.charAt(0).toUpperCase() + unidad.slice(1)}</th>
          </tr>
        </thead>
        <tbody>
          {datos.map((d) => (
            <tr key={String(d.etiqueta)}>
              <td>{String(d.etiqueta)}</td>
              <td>{Number(d[clave]) || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 18, right: 8, bottom: 0, left: -12 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={REJILLA} strokeDasharray="2 4" />
          <XAxis
            dataKey="etiqueta"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
            tick={{ fontSize: 11, fill: TINTA_SUAVE }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fontSize: 11, fill: TINTA_SUAVE }}
            tickFormatter={(v: number) => fmt(v)}
            allowDecimals={false}
          />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={<TooltipDia clave={clave} unidad={unidad} />} />
          <Bar dataKey={clave} name={unidad} fill={AZUL} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {/* Etiqueta directa solo en el máximo: el resto lo dan el eje y el tooltip. */}
            <LabelList
              dataKey={clave}
              position="top"
              style={{ fontSize: 11, fill: TINTA, fontWeight: 600 }}
              formatter={(v: unknown) => (Number(v) === max ? fmt(Number(v)) : "")}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
