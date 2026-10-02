import { RESULTADO_COLOR, RESULTADO_LABEL, type EstadoDia } from "@/lib/operativo/preoperacional-reglas";

// Piezas compartidas por el tablero, el formulario y el historial.

export function horaBogota(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" });
}

export function ChipResultado({ estado, pequeno = false }: { estado: EstadoDia; pequeno?: boolean }) {
  const c = RESULTADO_COLOR[estado];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ${pequeno ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs"}`}
      style={{ backgroundColor: c.suave, color: c.texto }}
    >
      {RESULTADO_LABEL[estado]}
    </span>
  );
}

