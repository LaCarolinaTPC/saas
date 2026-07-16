import { getTesoreriaAudit } from "@/lib/devengados/audit";
import { requireTesoreriaSub } from "@/lib/devengados/guard";

export const dynamic = "force-dynamic";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const ACCION_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  entrega_registrada: { label: "Entrega registrada", bg: "#D1FAE5", color: "#059669" },
  traslado_gema: { label: "Traslado a GEMA", bg: "#DBEAFE", color: "#2563EB" },
  base_diaria: { label: "Cambio base diaria", bg: "#FEF3C7", color: "#D97706" },
  fecha_operativa: { label: "Cambio fecha operativa", bg: "#FEE2E2", color: "#DC2626" },
};

function fechaBogota(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export default async function AuditoriaTesoreriaPage() {
  await requireTesoreriaSub("auditoria");
  const filas = await getTesoreriaAudit();

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Tesorería · Auditoría</h1>
        <p className="text-xs text-gray-500">
          Registro inmutable de las transacciones y cambios de parámetros del módulo:
          quién, qué, cuándo y con qué valores.
        </p>
      </div>

      <div className="mx-auto max-w-6xl p-6">
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          {filas.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              Sin movimientos registrados todavía.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2">Fecha y hora</th>
                    <th className="px-4 py-2">Usuario</th>
                    <th className="px-4 py-2">Acción</th>
                    <th className="px-4 py-2">Conductor</th>
                    <th className="px-4 py-2 text-right">Valor</th>
                    <th className="px-4 py-2">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const acc = ACCION_LABELS[f.accion] ?? {
                      label: f.accion,
                      bg: "#F1F5F9",
                      color: "#64748B",
                    };
                    return (
                      <tr key={f.id} className="border-b border-[#F1F5F9] align-top">
                        <td className="whitespace-nowrap px-4 py-2 text-gray-600">
                          {fechaBogota(f.created_at)}
                        </td>
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {f.user_email ?? "—"}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: acc.bg, color: acc.color }}
                          >
                            {acc.label}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {f.conductor_nombre ?? f.cedula_conductor ?? "—"}
                          {f.conductor_nombre && f.cedula_conductor && (
                            <span className="block text-xs text-gray-400">
                              CC {f.cedula_conductor}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {f.valor != null ? cop.format(f.valor) : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          <code className="break-all">{JSON.stringify(f.detalle)}</code>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
