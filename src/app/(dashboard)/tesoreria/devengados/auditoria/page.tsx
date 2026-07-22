import Link from "next/link";
import { AUDIT_PAGE_SIZE, getTesoreriaAudit, type AuditFiltros } from "@/lib/devengados/audit";
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

const MODULOS = ["tesoreria", "seguridad", "sincronizacion"];

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]";
const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500";
/* Encabezado fijo mientras se recorre la tabla; el fondo es obligatorio o las filas
   se transparentan por debajo al hacer scroll. */
const thCls = "sticky top-0 z-10 border-b border-[#E2E8F0] bg-white px-4 py-2";

type Params = AuditFiltros & { page?: string };

export default async function AuditoriaTesoreriaPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requireTesoreriaSub("auditoria");
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const filtros: AuditFiltros = {
    desde: params.desde || undefined,
    hasta: params.hasta || undefined,
    accion: params.accion || undefined,
    modulo: params.modulo || undefined,
    resultado: params.resultado || undefined,
    usuario: params.usuario?.trim() || undefined,
    conductor: params.conductor?.trim() || undefined,
  };
  const hayFiltros = Object.values(filtros).some(Boolean);

  const { rows: filas, total } = await getTesoreriaAudit(filtros, page);
  const totalPaginas = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  // Enlace de paginación que conserva los filtros vigentes.
  const linkPagina = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) if (v) qs.set(k, String(v));
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `?${s}` : "?";
  };

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
        <form
          method="get"
          className="mb-4 rounded-xl border border-[#E2E8F0] bg-white p-4"
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <div>
              <label className={labelCls} htmlFor="desde">Desde</label>
              <input id="desde" type="date" name="desde" defaultValue={params.desde ?? ""} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="hasta">Hasta</label>
              <input id="hasta" type="date" name="hasta" defaultValue={params.hasta ?? ""} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="accion">Acción</label>
              <select id="accion" name="accion" defaultValue={params.accion ?? ""} className={inputCls}>
                <option value="">Todas</option>
                {Object.entries(ACCION_LABELS).map(([valor, { label }]) => (
                  <option key={valor} value={valor}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="modulo">Módulo</label>
              <select id="modulo" name="modulo" defaultValue={params.modulo ?? ""} className={inputCls}>
                <option value="">Todos</option>
                {MODULOS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="resultado">Resultado</label>
              <select id="resultado" name="resultado" defaultValue={params.resultado ?? ""} className={inputCls}>
                <option value="">Todos</option>
                <option value="exitoso">Exitoso</option>
                <option value="fallido">Fallido</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="usuario">Usuario</label>
              <input id="usuario" name="usuario" placeholder="correo" defaultValue={params.usuario ?? ""} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="conductor">Conductor</label>
              <input id="conductor" name="conductor" placeholder="nombre o cédula" defaultValue={params.conductor ?? ""} className={inputCls} />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="submit"
              className="h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
            >
              Filtrar
            </button>
            {hayFiltros && (
              <Link href="?" className="text-sm text-gray-500 underline hover:text-gray-700">
                Limpiar filtros
              </Link>
            )}
            <span className="ml-auto text-xs text-gray-500">
              {total} {total === 1 ? "movimiento" : "movimientos"}
              {totalPaginas > 1 && ` · página ${page} de ${totalPaginas}`}
            </span>
          </div>
        </form>

        <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
          {filas.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">
              {hayFiltros
                ? "Ningún movimiento coincide con los filtros aplicados."
                : "Sin movimientos registrados todavía."}
            </p>
          ) : (
            /* El scroll vive en este contenedor (no al final de la página) para que
               la barra horizontal quede siempre a la vista con muchas filas. */
            <div className="max-h-[calc(100vh-19rem)] overflow-auto">
              <table className="w-full min-w-[72rem] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className={thCls}>Fecha y hora</th>
                    <th className={thCls}>Usuario / Rol</th>
                    <th className={thCls}>Acción</th>
                    <th className={thCls}>Módulo</th>
                    <th className={thCls}>Resultado</th>
                    <th className={thCls}>Conductor</th>
                    <th className={`${thCls} text-right`}>Valor</th>
                    <th className={thCls}>Valor ant. → nuevo</th>
                    <th className={thCls}>IP / Equipo</th>
                    <th className={thCls}>Detalle</th>
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

        {totalPaginas > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={linkPagina(page - 1)} className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50">
                ← Anteriores
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-gray-500">
              Página {page} de {totalPaginas}
            </span>
            {page < totalPaginas ? (
              <Link href={linkPagina(page + 1)} className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50">
                Siguientes →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
