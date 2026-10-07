"use client";

/**
 * Gráficos del Análisis de liquidación, con Recharts y las mismas reglas que
 * los de Riesgo: una medida por gráfico y un solo eje, color con significado
 * (rojo = los que se fueron, índigo = la plantilla activa), texto en tinta y
 * tooltip por punto.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MesFlota, PuntoTrayectoria } from "@/lib/analisis-liquidacion/analisis";
import { MAS_RIESGO } from "./graficos-riesgo";

const MARCA = "#4F46E5";
const TINTA = "#0f172a";
const TINTA_SUAVE = "#64748b";
const REJILLA = "#e2e8f0";

const pesos = (v: number) => `$${Math.round(v).toLocaleString("es-CO")}`;
const dec = (v: number) => v.toFixed(1).replace(".", ",");

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

type Medida = "dias" | "neto";

/**
 * Cómo venían los que se retiraron en los seis meses antes de irse, frente a
 * la plantilla activa en los últimos seis meses. El eje va de izquierda a
 * derecha hacia el retiro.
 */
export function LineasTrayectoria({ datos, medida }: { datos: PuntoTrayectoria[]; medida: Medida }) {
  const filas = [...datos]
    .sort((a, b) => b.mesesAntes - a.mesesAntes)
    .map((p) => ({
      etiqueta: `${p.mesesAntes} ${p.mesesAntes === 1 ? "mes" : "meses"} antes`,
      retirados: medida === "dias" ? p.retiradosDias : p.retiradosNeto,
      activos: medida === "dias" ? p.activosDias : p.activosNeto,
      n: p.nRetirados,
    }));
  const fmt = medida === "dias" ? dec : pesos;
  return (
    <Contenedor alto={240}>
      <LineChart data={filas} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={REJILLA} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: TINTA_SUAVE }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: TINTA_SUAVE }}
          tickLine={false}
          axisLine={false}
          width={medida === "dias" ? 28 : 72}
          tickFormatter={(v: number) => (medida === "dias" ? String(Math.round(v)) : pesos(v))}
          domain={medida === "dias" ? [0, "auto"] : ["auto", "auto"]}
        />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Caja>
                <p className="font-semibold text-gray-900">{label}</p>
                {payload.map((p) => (
                  <p key={String(p.dataKey)} style={{ color: p.color }}>
                    {p.dataKey === "retirados" ? "Se retiraron" : "Activos hoy"}:{" "}
                    <span className="font-medium">{p.value == null ? "sin dato" : fmt(Number(p.value))}</span>
                  </p>
                ))}
              </Caja>
            ) : null
          }
        />
        <Legend
          verticalAlign="top"
          height={24}
          iconType="plainline"
          formatter={(v: string) => (
            <span style={{ color: TINTA, fontSize: 12 }}>{v === "retirados" ? "Se retiraron" : "Activos hoy"}</span>
          )}
        />
        <Line type="monotone" dataKey="retirados" stroke={MAS_RIESGO} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey="activos" stroke={MARCA} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
      </LineChart>
    </Contenedor>
  );
}

/** Mediana del neto por día de la flota, mes a mes; los meses sin valores quedan en blanco. */
export function LineaNetoFlota({ datos }: { datos: MesFlota[] }) {
  return (
    <Contenedor alto={220}>
      <LineChart data={datos} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke={REJILLA} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: TINTA_SUAVE }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: TINTA_SUAVE }}
          tickLine={false}
          axisLine={false}
          width={72}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => pesos(v)}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const m = payload[0].payload as MesFlota;
            return (
              <Caja>
                <p className="font-semibold text-gray-900">{m.mes}</p>
                <p className="text-gray-700">
                  Neto por día (mediana): <span className="font-medium">{m.netoDia == null ? "sin valores de GEMA" : pesos(m.netoDia)}</span>
                </p>
                <p className="text-gray-500">
                  {m.conductores} conductores · {dec(m.diasPromedio)} días en promedio
                </p>
              </Caja>
            );
          }}
        />
        <Line type="monotone" dataKey="netoDia" stroke={MARCA} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
    </Contenedor>
  );
}
