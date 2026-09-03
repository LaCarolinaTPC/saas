"use client";

/**
 * Gráficos de los indicadores de ausentismo, con Recharts.
 *
 * Reglas que siguen (guía de visualización del proyecto): una medida por
 * gráfico y un solo eje, nunca dos escalas en el mismo plano; el color sigue a
 * la medida y no al puesto en el ranking (días perdidos siempre azul,
 * incapacidades siempre naranja); "Otros" y "Sin dato" en gris porque no son
 * entidades; marcas finas con extremo redondeado; texto en tinta, no en el
 * color de la serie; tooltip por marca.
 */

import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Grupo, GrupoMensual } from "@/lib/ausentismo/indicadores";
import { SIN_DATO } from "@/lib/ausentismo/indicadores";

export type Medida = "dias" | "eventos";

/** Paleta validada del proyecto: azul = días perdidos, naranja = incapacidades. */
export const COLOR_MEDIDA: Record<Medida, string> = { dias: "#2a78d6", eventos: "#eb6834" };
const COLOR_NEUTRO = "#94a3b8";
const TINTA = "#0f172a";
const TINTA_SUAVE = "#64748b";
const REJILLA = "#e2e8f0";

export const ETIQUETA_MEDIDA: Record<Medida, string> = { dias: "Días perdidos", eventos: "Incapacidades" };

const fmt = (n: number) => n.toLocaleString("es-CO");

function esNeutro(g: Grupo) {
  return g.clave === SIN_DATO || g.clave === "__otros__";
}

function TooltipGrupo({ active, payload }: { active?: boolean; payload?: { payload: Grupo }[] }) {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-900">{g.etiqueta}</p>
      {g.detalle && <p className="text-gray-500">{g.detalle}</p>}
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-gray-700">
        <dt>Días perdidos</dt><dd className="text-right font-medium">{fmt(g.dias)}</dd>
        <dt>Incapacidades</dt><dd className="text-right font-medium">{fmt(g.eventos)}</dd>
        <dt>Promedio</dt><dd className="text-right">{g.promedio} d</dd>
        <dt>% de los días</dt><dd className="text-right">{g.pctDias}%</dd>
        {g.clave !== "__otros__" && (
          <><dt>Trabajadores</dt><dd className="text-right">{fmt(g.trabajadores)}</dd></>
        )}
      </dl>
    </div>
  );
}

/**
 * Con `ancho` el gráfico se dibuja a ese ancho sin medir el contenedor: sirve
 * para renderizarlo fuera del navegador (pruebas, capturas).
 */
function Contenedor({ ancho, alto, children }: { ancho?: number; alto: number; children: React.ReactElement }) {
  if (ancho) return <div style={{ width: ancho, height: alto }}>{children}</div>;
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}

/**
 * Ranking horizontal de una medida. La altura crece con las filas para que
 * cada barra conserve el mismo grosor y las etiquetas no se monten.
 */
export function BarrasHorizontales({ datos, medida, anchoEtiqueta = 190, anchoFijo }: {
  datos: Grupo[];
  medida: Medida;
  anchoEtiqueta?: number;
  anchoFijo?: number;
}) {
  if (datos.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">Sin datos para este corte.</p>;
  }
  // 30 px por fila: los nombres largos se partan en dos líneas sin montarse.
  const alto = Math.max(120, datos.length * 30 + 24);
  const color = COLOR_MEDIDA[medida];
  return (
    <Contenedor ancho={anchoFijo} alto={alto}>
        <BarChart width={anchoFijo} height={anchoFijo ? alto : undefined} data={datos} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={6}>
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
            tickFormatter={(v: string) => (v.length > 32 ? `${v.slice(0, 31)}…` : v)}
          />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={<TooltipGrupo />} />
          <Bar dataKey={medida} name={ETIQUETA_MEDIDA[medida]} barSize={14} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {datos.map((g) => (
              <Cell key={g.clave} fill={esNeutro(g) ? COLOR_NEUTRO : color} />
            ))}
            <LabelList
              dataKey={medida}
              position="right"
              offset={6}
              style={{ fontSize: 11, fill: TINTA, fontWeight: 500 }}
              formatter={(v: unknown) => fmt(Number(v))}
            />
          </Bar>
        </BarChart>
    </Contenedor>
  );
}

function TooltipMes({ active, payload }: { active?: boolean; payload?: { payload: GrupoMensual }[] }) {
  if (!active || !payload?.length) return null;
  const g = payload[0].payload;
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-900">{g.etiqueta}</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-gray-700">
        <dt>Días perdidos</dt><dd className="text-right font-medium">{fmt(g.dias)}</dd>
        <dt>Incapacidades</dt><dd className="text-right font-medium">{fmt(g.eventos)}</dd>
        <dt>Prórrogas</dt><dd className="text-right">{fmt(g.prorrogas)}</dd>
        <dt>Trabajadores</dt><dd className="text-right">{fmt(g.trabajadores)}</dd>
        {g.tasa != null && (<><dt>Tasa</dt><dd className="text-right">{g.tasa}%</dd></>)}
      </dl>
    </div>
  );
}

/** "mar 2026" → "mar 26"; el mes en curso lleva asterisco. */
function tickMes(etiqueta: string): string {
  const parcial = etiqueta.endsWith(" (parcial)");
  const base = etiqueta.replace(" (parcial)", "");
  const [mes, anio] = base.split(" ");
  return `${mes} ${(anio ?? "").slice(2)}${parcial ? "*" : ""}`;
}

/** Serie mensual de una medida. Dos medidas = dos gráficos lado a lado, no dos ejes. */
export function BarrasMensuales({ datos, medida, alto = 220, anchoFijo }: {
  datos: GrupoMensual[];
  medida: Medida;
  alto?: number;
  anchoFijo?: number;
}) {
  const color = COLOR_MEDIDA[medida];
  const max = Math.max(...datos.map((d) => d[medida]), 0);
  return (
    <Contenedor ancho={anchoFijo} alto={alto}>
        <BarChart width={anchoFijo} height={anchoFijo ? alto : undefined} data={datos} margin={{ top: 18, right: 8, bottom: 0, left: -12 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={REJILLA} strokeDasharray="2 4" />
          <XAxis
            dataKey="etiqueta"
            tickLine={false}
            axisLine={false}
            interval={datos.length > 12 ? "preserveStartEnd" : 0}
            tick={{ fontSize: 11, fill: TINTA_SUAVE }}
            tickFormatter={tickMes}
          />
          <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: TINTA_SUAVE }} tickFormatter={(v: number) => fmt(v)} allowDecimals={false} />
          <Tooltip cursor={{ fill: "#f1f5f9" }} content={<TooltipMes />} />
          <Bar dataKey={medida} name={ETIQUETA_MEDIDA[medida]} fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
            {/* Etiqueta directa solo en el máximo: el resto lo dan el eje y el tooltip. */}
            <LabelList
              dataKey={medida}
              position="top"
              style={{ fontSize: 11, fill: TINTA, fontWeight: 600 }}
              formatter={(v: unknown) => (Number(v) === max && max > 0 ? fmt(Number(v)) : "")}
            />
          </Bar>
        </BarChart>
    </Contenedor>
  );
}
