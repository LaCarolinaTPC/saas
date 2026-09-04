// Piezas visuales compartidas por las pantallas de Operativo. Sin hooks ni
// "use client": sirven igual en Server Components y en los clientes.
import Link from "next/link";
import { Bus } from "lucide-react";
import { NIVEL_ACCION, NIVEL_COLOR, NIVEL_LABEL, type NivelVencimiento } from "@/lib/operativo/constants";

/** Chip del nivel con su color; `accion` añade debajo qué debe hacer Operativo. */
export function ChipNivel({ nivel, accion = false, pequeno = false }: {
  nivel: NivelVencimiento;
  accion?: boolean;
  pequeno?: boolean;
}) {
  const c = NIVEL_COLOR[nivel];
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold text-white ${pequeno ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs"}`}
        style={{ backgroundColor: c.fuerte }}
        title={NIVEL_ACCION[nivel]}
      >
        {NIVEL_LABEL[nivel]}
      </span>
      {accion && <span className="text-[11px] leading-tight" style={{ color: c.texto }}>{NIVEL_ACCION[nivel]}</span>}
    </span>
  );
}

/** Tarjeta de indicador del tablero, como las de Mantenimiento. */
export function Indicador({ nivel, valor, activo, onClick }: {
  nivel: NivelVencimiento;
  valor: number;
  activo?: boolean;
  onClick?: () => void;
}) {
  const c = NIVEL_COLOR[nivel];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border bg-white p-4 text-left transition hover:bg-[#F8FAFC] ${activo ? "ring-2" : "border-[#E2E8F0]"}`}
      style={activo ? { borderColor: c.fuerte, boxShadow: `0 0 0 2px ${c.fuerte}` } : undefined}
    >
      <div className="flex items-center gap-2 text-sm font-medium" style={{ color: c.texto }}>
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.fuerte }} />
        {NIVEL_LABEL[nivel]}
      </div>
      <div className="mt-2 text-3xl font-bold text-gray-900">{valor}</div>
    </button>
  );
}

/** Encabezado pegajoso del módulo, igual al de Mantenimiento y Ausentismo. */
export function EncabezadoOperativo({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Bus className="h-5 w-5 text-[#4F46E5]" />
          <h1 className="text-xl font-semibold text-gray-900">{titulo}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Pestañas del módulo (Vencimientos · Vehículos · Exceso velocidad). */
export function PestanasOperativo({ activa }: { activa: "vencimientos" | "vehiculos" | "velocidad" }) {
  const cls = (a: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${a ? "bg-[#4F46E5] text-white" : "bg-white text-gray-600 hover:bg-[#F8FAFC]"}`;
  return (
    <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
      <Link href="/operativo" className={cls(activa === "vencimientos")}>Vencimientos</Link>
      <Link href="/operativo/vehiculos" className={cls(activa === "vehiculos")}>Vehículos</Link>
      <Link href="/operativo/velocidad" className={cls(activa === "velocidad")}>Exceso velocidad</Link>
    </div>
  );
}
