// Piezas visuales compartidas por las pantallas de Gestión de flota. Sin
// hooks ni "use client": sirven igual en Server Components y en los clientes.
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { cop, decimal, entero, porcentaje } from "@/lib/financiera/formato";
import { SEMAFORO_ETIQUETAS, type NivelSemaforo, type VistaRentabilidad } from "@/lib/financiera/motor";
import type { Cobertura } from "@/lib/financiera/analisis";

// ── Semáforo ─────────────────────────────────────────────────────────────────

export const COLOR_SEMAFORO: Record<NivelSemaforo, { fuerte: string; suave: string; texto: string; clase: string }> = {
  excelente: { fuerte: "#059669", suave: "#D1FAE5", texto: "#065F46", clase: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  aceptable: { fuerte: "#D97706", suave: "#FEF3C7", texto: "#92400E", clase: "border-amber-200 bg-amber-50 text-amber-800" },
  critico: { fuerte: "#DC2626", suave: "#FEE2E2", texto: "#991B1B", clase: "border-red-200 bg-red-50 text-red-700" },
};

export function ChipSemaforo({ nivel, pequeno = false }: { nivel: NivelSemaforo; pequeno?: boolean }) {
  const c = COLOR_SEMAFORO[nivel];
  const e = SEMAFORO_ETIQUETAS[nivel];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium ${c.clase} ${pequeno ? "px-1.5 py-0 text-[11px]" : "px-2 py-0.5 text-xs"}`}>
      {e.emoji} {e.etiqueta}
    </span>
  );
}

// ── Tarjetas ─────────────────────────────────────────────────────────────────

export function Tarjeta({
  titulo, valor, pie, nivel, ayuda, tono = "neutro",
}: {
  titulo: string;
  valor: string;
  pie?: React.ReactNode;
  nivel?: NivelSemaforo;
  ayuda?: string;
  tono?: "neutro" | "amber" | "ok";
}) {
  const borde = nivel
    ? COLOR_SEMAFORO[nivel].clase.replace(/text-\S+/, "")
    : tono === "amber"
      ? "border-amber-200 bg-amber-50"
      : tono === "ok"
        ? "border-emerald-200 bg-emerald-50"
        : "border-[#E2E8F0] bg-white";
  return (
    <div className={`rounded-xl border p-4 ${borde}`} title={ayuda}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900 xl:text-2xl">{valor}</p>
      {pie && <div className="mt-0.5 truncate text-xs text-gray-500">{pie}</div>}
    </div>
  );
}

/** Reparto Excelente / Aceptable / Crítico de un indicador. */
export function TarjetasSemaforo({
  grupos, formato, total,
}: {
  grupos: { nivel: NivelSemaforo; vehiculos: { codigoVehiculo: string }[]; porcentaje: number; promedio: number; brecha: number }[];
  formato: (n: number) => string;
  total: number;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {grupos.map((g) => {
        const c = COLOR_SEMAFORO[g.nivel];
        const e = SEMAFORO_ETIQUETAS[g.nivel];
        return (
          <div key={g.nivel} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: c.texto }}>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.fuerte }} />
                {e.etiqueta}
              </span>
              <span className="text-xs text-gray-500">{decimal(g.porcentaje, 0)} %</span>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">{entero(g.vehiculos.length)}</p>
            <p className="text-xs text-gray-500">de {entero(total)} vehículos</p>
            {g.vehiculos.length > 0 && (
              <p className="mt-1 text-xs text-gray-600">
                promedio {formato(g.promedio)} · brecha {g.brecha >= 0 ? "+" : ""}
                {formato(g.brecha)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Avisos ───────────────────────────────────────────────────────────────────

/**
 * El aviso más importante del módulo: sin el archivo contable del mes, la
 * utilidad y la rentabilidad son un techo y el gasto por timbrada un piso.
 */
export function AvisoCobertura({ cobertura, vehiculoMes }: { cobertura: Cobertura["estado"]; vehiculoMes: number }) {
  if (cobertura === "completo") return null;
  const total = vehiculoMes;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">
          {cobertura === "sin_dato"
            ? "Ningún vehículo del rango tiene cargado el archivo contable."
            : "Parte del rango no tiene cargado el archivo contable."}
        </p>
        <p className="mt-0.5">
          Faltan seis rubros de costo que no existen en GEMA (despacho, intereses, otros gastos, repuestos, mano de obra y
          descuento fondo-conductor). Mientras falten, la <strong>utilidad y la rentabilidad son un techo</strong> y el gasto por
          timbrada un piso. Cárgalo en{" "}
          <Link href="/financiera/flota/datos" className="font-medium underline">
            Datos de flota
          </Link>
          . {entero(total)} vehículo-mes en el rango.
        </p>
      </div>
    </div>
  );
}

export function AvisoVacio({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-gray-600">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <p>{mensaje}</p>
    </div>
  );
}

// ── Vista de rentabilidad ────────────────────────────────────────────────────

export function NotaVista({ vista }: { vista: VistaRentabilidad }) {
  const texto =
    vista === "financiero"
      ? "Después de financiero: los intereses entran en el gasto, como en el histórico del aplicativo."
      : vista === "operativa"
        ? "Operativa: el gasto excluye los intereses, el único rubro tratado como financiero."
        : "Ambas: la cifra principal es la operativa (sin intereses) y al lado va la de después de financiero.";
  return <p className="text-xs text-gray-500">{texto}</p>;
}

// ── Celdas de tabla ──────────────────────────────────────────────────────────

/** Importe en pesos; negativo siempre en rojo (regla del aplicativo). */
export function Pesos({ valor, techo = false }: { valor: number; techo?: boolean }) {
  return (
    <span
      className={`tabular-nums ${valor < 0 ? "text-red-600" : ""} ${techo ? "text-gray-400" : ""}`}
      title={techo ? "Falta el archivo contable: es un techo, no una cifra." : undefined}
    >
      {techo ? "≤ " : ""}
      {cop(valor)}
    </span>
  );
}

export function Pct({ valor, techo = false }: { valor: number; techo?: boolean }) {
  return (
    <span
      className={`tabular-nums ${valor < 0 ? "text-red-600" : ""} ${techo ? "text-gray-400" : ""}`}
      title={techo ? "Falta el archivo contable: es un techo, no una cifra." : undefined}
    >
      {techo ? "≤ " : ""}
      {porcentaje(valor)}
    </span>
  );
}
