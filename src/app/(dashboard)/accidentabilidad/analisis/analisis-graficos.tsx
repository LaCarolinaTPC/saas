"use client";

/**
 * Gráficos del panel de Análisis de accidentabilidad (Recharts). Siguen la guía
 * de visualización del proyecto: una medida por gráfico, color por significado
 * (gris para "Otros"/"Sin dato"), texto en tinta y tooltip por marca.
 */

import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, Cell as PieCell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { PuntoSerie } from "@/lib/accidentabilidad/analisis";

const AZUL = "#2a78d6";
const NARANJA = "#eb6834";
const NEUTRO = "#94a3b8";
const REJILLA = "#e2e8f0";
const TINTA = "#0f172a";
const PALETA = ["#2a78d6", "#eb6834", "#16a34a", "#9333ea", "#0891b2", "#ca8a04"];

const fmt = (n: number) => n.toLocaleString("es-CO");
const esNeutro = (clave: string) => clave === "__otros__" || clave === "__sin__";

function TT({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs shadow-md">
      {label && <p className="font-semibold text-gray-900">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="text-gray-700">
          {p.name}: <span className="font-medium">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function LineaMensual({ datos }: { datos: PuntoSerie[] }) {
  return (
    <div style={{ height: 240 }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={datos} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid stroke={REJILLA} vertical={false} />
          <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={{ stroke: REJILLA }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={false} />
          <Tooltip content={<TT />} />
          <Line type="monotone" dataKey="count" name="Accidentes" stroke={AZUL} strokeWidth={2} dot={{ r: 2 }} />
          <Line type="monotone" dataKey="graves" name="Graves" stroke={NARANJA} strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Barras({ datos, color = AZUL, horizontal = false }: { datos: PuntoSerie[]; color?: string; horizontal?: boolean }) {
  const alto = horizontal ? Math.max(120, datos.length * 34 + 20) : 240;
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={datos}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 16, left: horizontal ? 8 : -16, bottom: 0 }}
        >
          <CartesianGrid stroke={REJILLA} horizontal={!horizontal} vertical={horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="etiqueta" width={130} tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={false} />
            </>
          ) : (
            <>
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={{ stroke: REJILLA }} interval={0} angle={datos.length > 8 ? -35 : 0} textAnchor={datos.length > 8 ? "end" : "middle"} height={datos.length > 8 ? 56 : 24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: TINTA }} tickLine={false} axisLine={false} />
            </>
          )}
          <Tooltip content={<TT />} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey="count" name="Accidentes" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
            {datos.map((d) => (
              <Cell key={d.clave} fill={esNeutro(d.clave) ? NEUTRO : color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Dona({ datos }: { datos: PuntoSerie[] }) {
  return (
    <div style={{ height: 240 }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<TT />} />
          <Pie data={datos} dataKey="count" nameKey="etiqueta" innerRadius={52} outerRadius={82} paddingAngle={2}>
            {datos.map((d, i) => (
              <PieCell key={d.clave} fill={esNeutro(d.clave) ? NEUTRO : PALETA[i % PALETA.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-600">
        {datos.map((d, i) => (
          <li key={d.clave} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: esNeutro(d.clave) ? NEUTRO : PALETA[i % PALETA.length] }} />
            {d.etiqueta} <span className="font-medium text-gray-900">{fmt(d.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
