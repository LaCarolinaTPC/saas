export type AccidenteEstado =
  | "pendiente_revision"
  | "falta_informacion"
  | "completada"
  | "aprobado";

const CONFIG: Record<AccidenteEstado, { label: string; bg: string; text: string }> = {
  pendiente_revision: { label: "Pendiente de revisión", bg: "bg-info-bg", text: "text-info" },
  falta_informacion: { label: "Falta información", bg: "bg-negative-bg", text: "text-negative" },
  completada: { label: "Completada", bg: "bg-gold-subtle", text: "text-gold-dark" },
  aprobado: { label: "Aprobado", bg: "bg-positive-bg", text: "text-positive" },
};

export default function AccidenteStatusBadge({ estado }: { estado: AccidenteEstado }) {
  const c = CONFIG[estado] ?? CONFIG.pendiente_revision;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}
