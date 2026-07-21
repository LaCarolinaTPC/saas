import { getTesoreriaAudit } from "@/lib/devengados/audit";
import { requireTesoreriaSub } from "@/lib/devengados/guard";

export const dynamic = "force-dynamic";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const ACCION_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  entrega_registrada: { label: "Pago registrado", bg: "#D1FAE5", color: "#059669" },
  segundo_pago_autorizado: { label: "Segundo pago autorizado", bg: "#EEF2FF", color: "#4F46E5" },
  entrega_extemporanea: { label: "Pago de día cerrado", bg: "#FEF3C7", color: "#B45309" },
  // Cambio de la fecha contable de una entrega ya registrada. La columna
  // "Valor ant. → nuevo" muestra de qué día a qué día se movió.
  correccion_fecha: { label: "Corrección de fecha contable", bg: "#F1F5F9", color: "#475569" },
  devolucion: { label: "Devolución", bg: "#FEE2E2", color: "#DC2626" },
  bloqueo_conductor: { label: "Bloqueo de conductor", bg: "#FEE2E2", color: "#B91C1C" },
  desbloqueo_conductor: { label: "Desbloqueo de conductor", bg: "#D1FAE5", color: "#047857" },
  traslado_gema: { label: "Traslado a GEMA", bg: "#DBEAFE", color: "#2563EB" },
  base_diaria: { label: "Cambio base diaria", bg: "#FEF3C7", color: "#D97706" },
  fecha_operativa: { label: "Cambio fecha operativa", bg: "#FEE2E2", color: "#DC2626" },
  login_exitoso: { label: "Inicio de sesión", bg: "#F1F5F9", color: "#475569" },
  login_fallido: { label: "Intento fallido de ingreso", bg: "#FEE2E2", color: "#DC2626" },
  cierre_sesion: { label: "Cierre de sesión", bg: "#F1F5F9", color: "#475569" },
  cambio_password: { label: "Cambio de contraseña", bg: "#FEF3C7", color: "#D97706" },
  usuario_creado: { label: "Usuario creado", bg: "#DBEAFE", color: "#2563EB" },
  cambio_rol: { label: "Cambio de rol", bg: "#FEF3C7", color: "#B45309" },
  cambio_permisos: { label: "Cambio de permisos", bg: "#FEF3C7", color: "#B45309" },
  reporte_generado: { label: "Reporte generado", bg: "#F1F5F9", color: "#64748B" },
  exportacion: { label: "Exportación", bg: "#F1F5F9", color: "#64748B" },
  sincronizacion_gema: { label: "Sincronización GEMA", bg: "#DBEAFE", color: "#2563EB" },
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

      <div className="p-6">
        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          {filas.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              Sin movimientos registrados todavía.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[72rem] text-sm">
                <thead>
                  <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2">Fecha y hora</th>
                    <th className="px-4 py-2">Usuario / Rol</th>
                    <th className="px-4 py-2">Acción</th>
                    <th className="px-4 py-2">Módulo</th>
                    <th className="px-4 py-2">Resultado</th>
                    <th className="px-4 py-2">Conductor</th>
                    <th className="px-4 py-2 text-right">Valor</th>
                    <th className="px-4 py-2">Valor ant. → nuevo</th>
                    <th className="px-4 py-2">IP / Equipo</th>
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
                        <td className="max-w-[14rem] truncate px-4 py-2 font-medium text-gray-900" title={f.user_email ?? undefined}>
                          {f.user_email ?? "—"}
                          {f.rol && (
                            <span className="block text-xs font-normal text-gray-400">{f.rol}</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: acc.bg, color: acc.color }}
                          >
                            {acc.label}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">{f.modulo ?? "tesoreria"}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`text-xs font-medium ${
                              (f.resultado ?? "exitoso") === "exitoso"
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {f.resultado ?? "exitoso"}
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
                          {f.valor_anterior || f.valor_nuevo
                            ? `${f.valor_anterior ?? "—"} → ${f.valor_nuevo ?? "—"}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          <span className="whitespace-nowrap">{f.ip ?? "—"}</span>
                          {f.equipo && (
                            <span className="block max-w-[10rem] truncate" title={f.equipo}>
                              {f.equipo}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          <code
                            className="block max-w-[18rem] truncate"
                            title={JSON.stringify(f.detalle, null, 2)}
                          >
                            {JSON.stringify(f.detalle)}
                          </code>
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
