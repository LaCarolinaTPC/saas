"use client";

/**
 * Gráficos de Financiera · Gestión de flota, con Recharts.
 *
 * Siguen las reglas de visualización del proyecto (ver graficos-riesgo):
 * una medida por gráfico y un solo eje; el color sigue al significado (verde
 * excelente, ámbar aceptable, rojo crítico o pérdida, índigo para la serie
 * principal); marcas finas con extremo redondeado; texto en tinta; tooltip
 * por marca. Nada de dos escalas en el mismo plano.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MARCA = "#4F46E5";
const TINTA_SUAVE = "#64748b";
const REJILLA = "#e2e8f0";
export const VERDE = "#059669";
export const AMBAR = "#D97706";
export const ROJO = "#DC2626";

/** "2026-02" → "feb 26". El eje siempre recibe el período crudo, nunca el nombre largo. */
const mesCorto = (periodo: string) => {
  const m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const mes = m[Number(periodo.slice(5, 7)) - 1];
  return mes ? `${mes} ${periodo.slice(2, 4)}` : periodo;
};

const millones = (v: number) => `${(v / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 0 })} M`;
const pct = (v: number) => `${v.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
const miles = (v: number) => v.toLocaleString("es-CO", { maximumFractionDigits: 0 });

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
  return <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs shadow-md">{children}</div>;
}

export interface PuntoMes {
  /** Período crudo AAAA-MM: el eje lo abrevia y el tooltip usa `nombre`. */
  periodo: string;
  /** Nombre largo para el tooltip ("febrero 2026"). */
  nombre?: string;
  valor: number;
  /** Solo para el tooltip. */
  detalle?: string;
  /** Marca los meses sin archivo contable: la cifra es un techo. */
  techo?: boolean;
}

function TooltipMes({ active, payload, formato, titulo }: { active?: boolean; payload?: { payload: PuntoMes }[]; formato: (v: number) => string; titulo: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <Caja>
      <p className="font-semibold capitalize text-gray-900">{p.nombre ?? p.periodo}</p>
      <p className="mt-0.5 text-gray-700">
        {titulo} <span className="font-medium">{p.techo ? "≤ " : ""}{formato(p.valor)}</span>
      </p>
      {p.detalle && <p className="text-gray-500">{p.detalle}</p>}
      {p.techo && <p className="mt-0.5 text-amber-700">Falta el archivo contable: es un techo.</p>}
    </Caja>
  );
}

/** Serie mensual de una medida en pesos (utilidad, ingresos, gasto). */
export function BarrasMes({
  datos, titulo, formato = "cop", alto = 220, referencia,
}: {
  datos: PuntoMes[];
  titulo: string;
  formato?: "cop" | "pct" | "num";
  alto?: number;
  /** Línea horizontal, p. ej. el umbral de excelente. */
  referencia?: { valor: number; etiqueta: string };
}) {
  const fmt = formato === "cop" ? millones : formato === "pct" ? pct : miles;
  return (
    <Contenedor alto={alto}>
      <BarChart data={datos} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={REJILLA} vertical={false} />
        <XAxis dataKey="periodo" tickFormatter={mesCorto} tick={{ fontSize: 11, fill: TINTA_SUAVE }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: TINTA_SUAVE }} axisLine={false} tickLine={false} width={64} />
        <Tooltip content={<TooltipMes formato={fmt} titulo={titulo} />} cursor={{ fill: "rgba(79,70,229,0.06)" }} />
        {referencia && (
          <ReferenceLine
            y={referencia.valor}
            stroke={VERDE}
            strokeDasharray="4 4"
            label={{ value: referencia.etiqueta, position: "right", fontSize: 10, fill: VERDE }}
          />
        )}
        <ReferenceLine y={0} stroke={TINTA_SUAVE} />
        <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={28}>
          {datos.map((d, i) => (
            <Cell key={i} fill={d.valor < 0 ? ROJO : MARCA} fillOpacity={d.techo ? 0.45 : 1} />
          ))}
        </Bar>
      </BarChart>
    </Contenedor>
  );
}

/** Serie mensual de un porcentaje o una tasa, con las bandas del semáforo. */
export function LineaMes({
  datos, titulo, formato = "pct", alto = 220, bandas,
}: {
  datos: PuntoMes[];
  titulo: string;
  formato?: "pct" | "cop" | "num";
  alto?: number;
  /** Umbrales del semáforo: excelente y aceptable. */
  bandas?: { excelente: number; aceptable: number };
}) {
  const fmt = formato === "pct" ? pct : formato === "cop" ? miles : miles;
  return (
    <Contenedor alto={alto}>
      <LineChart data={datos} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={REJILLA} vertical={false} />
        <XAxis dataKey="periodo" tickFormatter={mesCorto} tick={{ fontSize: 11, fill: TINTA_SUAVE }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: TINTA_SUAVE }} axisLine={false} tickLine={false} width={56} />
        <Tooltip content={<TooltipMes formato={fmt} titulo={titulo} />} />
        {bandas && (
          <>
            <ReferenceLine y={bandas.excelente} stroke={VERDE} strokeDasharray="4 4" label={{ value: "excelente", position: "right", fontSize: 10, fill: VERDE }} />
            <ReferenceLine y={bandas.aceptable} stroke={AMBAR} strokeDasharray="4 4" label={{ value: "aceptable", position: "right", fontSize: 10, fill: AMBAR }} />
          </>
        )}
        <Line type="monotone" dataKey="valor" stroke={MARCA} strokeWidth={2} dot={{ r: 3, fill: MARCA }} activeDot={{ r: 5 }} />
      </LineChart>
    </Contenedor>
  );
}

export interface BarraVehiculo {
  codigo: string;
  etiqueta: string;
  valor: number;
  nivel?: "excelente" | "aceptable" | "critico";
  detalle?: string;
}

function TooltipVehiculo({ active, payload, formato, titulo }: { active?: boolean; payload?: { payload: BarraVehiculo }[]; formato: (v: number) => string; titulo: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <Caja>
      <p className="font-semibold text-gray-900">{p.etiqueta}</p>
      <p className="mt-0.5 text-gray-700">
        {titulo} <span className="font-medium">{formato(p.valor)}</span>
      </p>
      {p.detalle && <p className="text-gray-500">{p.detalle}</p>}
    </Caja>
  );
}

const COLOR_NIVEL = { excelente: VERDE, aceptable: AMBAR, critico: ROJO } as const;

/** Barras horizontales por vehículo (peores o mejores de una medida). */
export function BarrasVehiculo({
  datos, titulo, formato = "cop", alto,
}: {
  datos: BarraVehiculo[];
  titulo: string;
  formato?: "cop" | "pct" | "num";
  alto?: number;
}) {
  const fmt = formato === "cop" ? millones : formato === "pct" ? pct : miles;
  return (
    <Contenedor alto={alto ?? Math.max(160, datos.length * 26 + 40)}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={REJILLA} horizontal={false} />
        <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 11, fill: TINTA_SUAVE }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="etiqueta" tick={{ fontSize: 11, fill: TINTA_SUAVE }} axisLine={false} tickLine={false} width={96} />
        <Tooltip content={<TooltipVehiculo formato={fmt} titulo={titulo} />} cursor={{ fill: "rgba(79,70,229,0.06)" }} />
        <ReferenceLine x={0} stroke={TINTA_SUAVE} />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {datos.map((d, i) => (
            <Cell key={i} fill={d.nivel ? COLOR_NIVEL[d.nivel] : d.valor < 0 ? ROJO : MARCA} />
          ))}
        </Bar>
      </BarChart>
    </Contenedor>
  );
}

/** Repuestos vs mano de obra por vehículo: dos medidas del mismo concepto, apiladas. */
export function BarrasMantenimiento({
  datos, alto,
}: {
  datos: { etiqueta: string; repuestos: number; manoDeObra: number }[];
  alto?: number;
}) {
  return (
    <Contenedor alto={alto ?? Math.max(160, datos.length * 26 + 40)}>
      <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={REJILLA} horizontal={false} />
        <XAxis type="number" tickFormatter={millones} tick={{ fontSize: 11, fill: TINTA_SUAVE }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="etiqueta" tick={{ fontSize: 11, fill: TINTA_SUAVE }} axisLine={false} tickLine={false} width={96} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { etiqueta: string; repuestos: number; manoDeObra: number };
            const total = p.repuestos + p.manoDeObra;
            return (
              <Caja>
                <p className="font-semibold text-gray-900">{p.etiqueta}</p>
                <p className="mt-0.5 text-gray-700">Repuestos netos <span className="font-medium">{millones(p.repuestos)}</span></p>
                <p className="text-gray-700">Mano de obra <span className="font-medium">{millones(p.manoDeObra)}</span></p>
                <p className="mt-0.5 text-gray-500">Total {millones(total)}</p>
              </Caja>
            );
          }}
          cursor={{ fill: "rgba(79,70,229,0.06)" }}
        />
        <Bar dataKey="repuestos" stackId="m" fill={MARCA} radius={[0, 0, 0, 0]} maxBarSize={18} />
        <Bar dataKey="manoDeObra" stackId="m" fill="#94A3B8" radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </Contenedor>
  );
}
