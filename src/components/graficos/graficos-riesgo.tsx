"use client";

/**
 * Gráficos del módulo Riesgo, con Recharts. Son los mismos que trae el PDF y
 * que traía el informe HTML original: los pesos de cada modelo, la tasa de
 * retiro por mes y las tasas observadas por tramo.
 *
 * Siguen las reglas de visualización del proyecto (ver graficos-ausentismo):
 * una medida por gráfico y un solo eje — el HTML tenía barras de retiros y
 * línea de tasa en el mismo plano, aquí va solo la tasa y el conteo en la
 * etiqueta —; el color sigue al significado, no al puesto (rojo suma riesgo,
 * verde lo resta, índigo para las tasas observadas); marcas finas con extremo
 * redondeado; texto en tinta; tooltip por marca.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Coeficiente } from "@/lib/riesgo/corrida";

export const MAS_RIESGO = "#DC2626";
export const MENOS_RIESGO = "#059669";
const MARCA = "#4F46E5";
const TINTA = "#0f172a";
const TINTA_SUAVE = "#64748b";
const REJILLA = "#e2e8f0";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;
const signo = (x: number, d = 2) => `${x > 0 ? "+" : "-"}${Math.abs(x).toFixed(d).replace(".", ",")}`;

function Contenedor({ alto, children }: { alto: number; children: React.ReactElement }) {
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function Caja({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs shadow-md">
      {children}
    </div>
  );
}

// ── Pesos de un modelo ───────────────────────────────────────────────────────

function TooltipPeso({ active, payload }: { active?: boolean; payload?: { payload: Coeficiente }[] }) {
  if (!active || !payload?.length) return null;
  const c = payload[0].payload;
  return (
    <Caja>
      <p className="font-semibold text-gray-900">{c.etiqueta}</p>
      <p className="mt-0.5 text-gray-700">
        Peso estandarizado <span className="font-medium">{signo(c.peso, 3)}</span>
      </p>
      <p className="text-gray-500">
        {c.peso > 0 ? "A más valor, más riesgo" : "A más valor, menos riesgo"}
      </p>
    </Caja>
  );
}

/**
 * Barras divergentes desde una línea de cero: a la derecha en rojo lo que suma
 * riesgo, a la izquierda en verde lo que lo resta. El dominio es simétrico para
 * que el cero quede en el centro y las dos direcciones se comparen a ojo.
 */
export function BarrasPesos({ coeficientes, maximo = 10 }: { coeficientes: Coeficiente[]; maximo?: number }) {
  const datos = coeficientes.slice(0, maximo);
  if (datos.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">Sin pesos para este corte.</p>;
  }
  const tope = Math.max(...datos.map((c) => Math.abs(c.peso)), 0.01) * 1.25;
  const alto = Math.max(140, datos.length * 30 + 24);
  return (
    <Contenedor alto={alto}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={REJILLA} strokeDasharray="2 4" />
        <XAxis type="number" hide domain={[-tope, tope]} />
        <YAxis
          type="category"
          dataKey="etiqueta"
          width={200}
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: TINTA }}
          tickFormatter={(v: string) => (v.length > 34 ? `${v.slice(0, 33)}…` : v)}
        />
        <ReferenceLine x={0} stroke={TINTA_SUAVE} strokeWidth={1} />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={<TooltipPeso />} />
        <Bar dataKey="peso" barSize={14} radius={4} isAnimationActive={false}>
          {datos.map((c) => (
            <Cell key={c.key} fill={c.peso > 0 ? MAS_RIESGO : MENOS_RIESGO} />
          ))}
          <LabelList
            dataKey="peso"
            position="right"
            offset={6}
            style={{ fontSize: 11, fill: TINTA, fontWeight: 500 }}
            formatter={(v: unknown) => signo(Number(v))}
          />
        </Bar>
      </BarChart>
    </Contenedor>
  );
}

// ── Retiros observados por mes ───────────────────────────────────────────────

export interface RetiroMes {
  mes: string;
  plantilla: number;
  retiros: number;
  tasa: number;
}

function TooltipMes({ active, payload }: { active?: boolean; payload?: { payload: RetiroMes }[] }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <Caja>
      <p className="font-semibold text-gray-900">{m.mes}</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-gray-700">
        <dt>Tasa mensual</dt>
        <dd className="text-right font-medium">{pct(m.tasa)}</dd>
        <dt>Retiros</dt>
        <dd className="text-right">{m.retiros}</dd>
        <dt>En plantilla</dt>
        <dd className="text-right">{m.plantilla}</dd>
      </dl>
    </Caja>
  );
}

/** Tasa mensual de retiro. Una sola medida: el conteo va en la etiqueta y el tooltip. */
export function BarrasRetirosMes({ datos, alto = 220 }: { datos: RetiroMes[]; alto?: number }) {
  if (datos.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">Aún no hay meses con 30 días observados.</p>;
  }
  return (
    <Contenedor alto={alto}>
      <BarChart data={datos} margin={{ top: 22, right: 8, bottom: 0, left: -8 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={REJILLA} strokeDasharray="2 4" />
        <XAxis dataKey="mes" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11, fill: TINTA_SUAVE }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fontSize: 11, fill: TINTA_SUAVE }}
          tickFormatter={(v: number) => pct(v, 0)}
        />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={<TooltipMes />} />
        <Bar dataKey="tasa" fill={MARCA} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
          <LabelList
            dataKey="tasa"
            position="top"
            style={{ fontSize: 11, fill: TINTA, fontWeight: 600 }}
            formatter={(v: unknown) => pct(Number(v))}
          />
        </Bar>
      </BarChart>
    </Contenedor>
  );
}

// ── Tasas observadas por tramo ───────────────────────────────────────────────

export interface Tramo {
  etiqueta: string;
  n: number;
  tasa: number;
}

function TooltipTramo({ active, payload }: { active?: boolean; payload?: { payload: Tramo }[] }) {
  if (!active || !payload?.length) return null;
  const t = payload[0].payload;
  return (
    <Caja>
      <p className="font-semibold text-gray-900">{t.etiqueta}</p>
      <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-gray-700">
        <dt>Tasa observada</dt>
        <dd className="text-right font-medium">{pct(t.tasa)}</dd>
        <dt>Conductor-mes</dt>
        <dd className="text-right">{t.n.toLocaleString("es-CO")}</dd>
      </dl>
    </Caja>
  );
}

/** Tasa del resultado en cada tramo de una variable. Compacto: va en rejilla de a tres. */
export function BarrasTramo({ datos }: { datos: Tramo[] }) {
  const alto = Math.max(90, datos.length * 26 + 16);
  return (
    <Contenedor alto={alto}>
      <BarChart data={datos} layout="vertical" margin={{ top: 2, right: 44, bottom: 2, left: 0 }} barCategoryGap={5}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="etiqueta"
          width={96}
          tickLine={false}
          axisLine={false}
          interval={0}
          tick={{ fontSize: 11, fill: TINTA }}
        />
        <Tooltip cursor={{ fill: "#f1f5f9" }} content={<TooltipTramo />} />
        <Bar dataKey="tasa" fill={MARCA} barSize={12} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="tasa"
            position="right"
            offset={6}
            style={{ fontSize: 11, fill: TINTA, fontWeight: 500 }}
            formatter={(v: unknown) => pct(Number(v))}
          />
        </Bar>
      </BarChart>
    </Contenedor>
  );
}
