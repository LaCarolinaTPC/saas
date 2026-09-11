import Link from "next/link";
import { Scale } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarConsultaBandeja } from "@/lib/incapacidades/auditoria";
import { listarExpedientes, type ExpedienteVista } from "@/lib/incapacidades/expedientes";
import { cop, fechaCorta } from "@/lib/incapacidades/formato";
import { ESTADOS_CONCILIACION, type EstadoConciliacion } from "@/lib/incapacidades/recaudo-reglas";
import { leerTolerancia, saldoDe } from "@/lib/incapacidades/recaudos";
import { ChipEstado } from "../bandeja-tabla";
import { ExportarBoton } from "../exportar-boton";
import { hoyArchivo, type DatosExport } from "@/lib/incapacidades/exportar";
import { etiquetaEstado } from "@/lib/incapacidades/formato";
import { ChipConciliacion } from "../[id]/saldo-panel";
import { Fallo, SinAcceso } from "../sin-acceso";

export const dynamic = "force-dynamic";

const VISTAS: { key: EstadoConciliacion | "cerrados" | "todos"; label: string }[] = [
  { key: "todos", label: "Radicados en cobro" },
  { key: "sin_recaudo", label: "Sin recaudo" },
  { key: "parcial", label: "Abono parcial" },
  { key: "diferencia", label: "Diferencia por ajustes" },
  { key: "sobrepago", label: "Sobrepago" },
  { key: "completo", label: "Conciliados sin cerrar" },
  { key: "cerrados", label: "Cerrados" },
];

/**
 * Conciliación (plan, pantalla 6): reclamado, abonos, ajustes y saldo por
 * expediente y por entidad, con el estado de conciliación derivado.
 */
export default async function ConciliacionPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) return <SinAcceso titulo="Conciliación" />;
  const sp = await searchParams;
  const vista = VISTAS.some((v) => v.key === sp.vista) ? (sp.vista as (typeof VISTAS)[number]["key"]) : "todos";

  let filas: ExpedienteVista[] = [];
  let tolerancia = 0;
  let fallo: string | null = null;
  try {
    [filas, tolerancia] = await Promise.all([listarExpedientes(), leerTolerancia()]);
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }
  if (!fallo) {
    await auditarConsultaBandeja({ filtros: { bandeja: "conciliacion", vista }, filas: filas.length, rol: perms.userType, userEmail: perms.userEmail });
  }

  const enCobro = filas.filter((f) => ["radicado", "con_recaudo", "conciliado", "cerrado"].includes(f.estado));
  const conSaldo = enCobro.map((f) => ({ f, s: saldoDe(f, tolerancia) }));
  const seleccion = conSaldo.filter(({ f, s }) =>
    vista === "todos" ? f.estado !== "cerrado" : vista === "cerrados" ? f.estado === "cerrado" : f.estado !== "cerrado" && s.estado === vista
  );
  const conteo = (k: (typeof VISTAS)[number]["key"]) =>
    conSaldo.filter(({ f, s }) => (k === "todos" ? f.estado !== "cerrado" : k === "cerrados" ? f.estado === "cerrado" : f.estado !== "cerrado" && s.estado === k)).length;
  const tot = seleccion.reduce(
    (a, { f, s }) => ({ reclamado: a.reclamado + Number(f.valor_reclamado ?? 0), abonos: a.abonos + Number(f.abonos_aplicados ?? 0), ajustes: a.ajustes + Number(f.ajustes_saldo ?? 0), saldo: a.saldo + s.saldo }),
    { reclamado: 0, abonos: 0, ajustes: 0, saldo: 0 }
  );

  // Por entidad.
  const porEntidad = new Map<string, { entidad: string; n: number; reclamado: number; abonos: number; ajustes: number; saldo: number }>();
  for (const { f, s } of seleccion) {
    const k = f.entidad_nombre ?? f.pagador_recibido ?? "Sin entidad";
    const g = porEntidad.get(k) ?? { entidad: k, n: 0, reclamado: 0, abonos: 0, ajustes: 0, saldo: 0 };
    g.n++; g.reclamado += Number(f.valor_reclamado ?? 0); g.abonos += Number(f.abonos_aplicados ?? 0); g.ajustes += Number(f.ajustes_saldo ?? 0); g.saldo += s.saldo;
    porEntidad.set(k, g);
  }

  const etiquetaVista = VISTAS.find((v) => v.key === vista)?.label ?? vista;
  const exportacion: DatosExport = {
    archivo: `incapacidades_conciliacion_${vista}_${hoyArchivo()}`,
    titulo: `Conciliación · ${etiquetaVista}`,
    contexto: [`Saldo operativo = reclamado − abonos − ajustes · tolerancia ${cop(tolerancia)} · ${seleccion.length} expediente(s) · generado ${hoyArchivo()}`],
    columnas: [
      { titulo: "Trabajador", ancho: 50 }, { titulo: "Cédula", ancho: 22 }, { titulo: "Entidad", ancho: 40 }, { titulo: "Radicado", ancho: 30 },
      { titulo: "Último giro", ancho: 18, alinear: "center" }, { titulo: "Reclamado", ancho: 22, alinear: "right" }, { titulo: "Abonos", ancho: 22, alinear: "right" },
      { titulo: "Ajustes", ancho: 20, alinear: "right" }, { titulo: "Saldo", ancho: 22, alinear: "right" }, { titulo: "Conciliación", ancho: 26 }, { titulo: "Expediente", ancho: 22 },
    ],
    filas: seleccion.map(({ f, s }) => [
      f.nombre ?? "", f.cedula, f.entidad_nombre ?? f.pagador_recibido ?? "", f.radicacion_codigo ?? "", f.ultimo_giro ?? "",
      Math.round(Number(f.valor_reclamado ?? 0)), Math.round(Number(f.abonos_aplicados ?? 0)), Math.round(Number(f.ajustes_saldo ?? 0)), Math.round(s.saldo),
      ESTADOS_CONCILIACION[s.estado].label, `${etiquetaEstado(f.estado)}${f.cierre_por_excepcion ? " (por excepción)" : ""}`,
    ]),
    resumen: [`reclamado ${cop(tot.reclamado)}`, `abonos ${cop(tot.abonos)}`, `ajustes ${cop(tot.ajustes)}`, `saldo ${cop(tot.saldo)}`],
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo="Conciliación"
        icono={Scale}
        volver={{ href: "/incapacidades", label: "Recuperación de incapacidades" }}
        descripcion={`Saldo operativo = reclamado − abonos − ajustes. Tolerancia vigente: ${cop(tolerancia)}. La base exigible sigue por confirmar (12.5): los componentes van siempre separados.`}
      >
        <ExportarBoton datos={exportacion} pantalla={`conciliacion:${vista}`} />
      </PageHeader>
      <div className="space-y-4 p-6">
        {fallo && <Fallo mensaje={fallo} />}

        <nav className="flex flex-wrap gap-2">
          {VISTAS.map((v) => (
            <Link key={v.key} href={`/incapacidades/conciliacion?vista=${v.key}`}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm ${v.key === vista ? "border-gray-900 bg-gray-900 text-white" : "border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC]"}`}>
              {v.label}<span className={`rounded-full px-1.5 text-xs tabular-nums ${v.key === vista ? "bg-white/20" : "bg-[#F1F5F9] text-gray-600"}`}>{conteo(v.key)}</span>
            </Link>
          ))}
        </nav>

        <div className="grid gap-3 sm:grid-cols-4">
          {[["Reclamado", tot.reclamado], ["Abonos aplicados", tot.abonos], ["Ajustes que extinguen", tot.ajustes], ["Saldo operativo", tot.saldo]].map(([l, v]) => (
            <div key={String(l)} className="rounded-xl border border-[#E2E8F0] bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{l}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{cop(Number(v))}</p>
            </div>
          ))}
        </div>

        {porEntidad.size > 0 && (
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">Entidad</th>
                  <th className="px-3 py-2 text-right">Expedientes</th>
                  <th className="px-3 py-2 text-right">Reclamado</th>
                  <th className="px-3 py-2 text-right">Abonos</th>
                  <th className="px-3 py-2 text-right">Ajustes</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {[...porEntidad.values()].sort((a, b) => b.saldo - a.saldo).map((g) => (
                  <tr key={g.entidad} className="border-t border-[#F1F5F9]">
                    <td className="px-4 py-2 font-medium text-gray-900">{g.entidad}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.n}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(g.reclamado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(g.abonos)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(g.ajustes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: g.saldo > 0 ? "#B45309" : g.saldo < 0 ? "#7C3AED" : "#059669" }}>{cop(g.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {seleccion.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-white p-8 text-center text-sm text-gray-500">Nada en esta vista.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">Trabajador</th>
                  <th className="px-3 py-2">Entidad · radicado</th>
                  <th className="px-3 py-2 text-right">Reclamado</th>
                  <th className="px-3 py-2 text-right">Abonos</th>
                  <th className="px-3 py-2 text-right">Ajustes</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                  <th className="px-3 py-2">Conciliación</th>
                  <th className="px-3 py-2">Expediente</th>
                </tr>
              </thead>
              <tbody>
                {seleccion.map(({ f, s }) => (
                  <tr key={f.id} className="border-t border-[#F1F5F9] align-top hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2">
                      <Link href={`/incapacidades/${f.id}`} className="font-medium text-gray-900 hover:underline">{f.nombre ?? "Sin nombre"}</Link>
                      <div className="text-xs tabular-nums text-gray-500">{f.cedula} · {fechaCorta(f.fecha_inicio)} → {fechaCorta(f.fecha_fin)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-gray-900">{f.entidad_nombre ?? f.pagador_recibido ?? "—"}</div>
                      <div className="font-mono text-xs text-gray-500">{f.radicacion_codigo ?? "—"}{f.ultimo_giro ? ` · último giro ${fechaCorta(f.ultimo_giro)}` : ""}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(f.valor_reclamado)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(f.abonos_aplicados)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{cop(f.ajustes_saldo)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: ESTADOS_CONCILIACION[s.estado].color }}>{cop(s.saldo)}</td>
                    <td className="px-3 py-2"><ChipConciliacion estado={s.estado} /></td>
                    <td className="px-3 py-2">
                      <ChipEstado estado={f.estado} />
                      {f.cierre_por_excepcion && <div className="mt-0.5 text-xs text-amber-700">cierre por excepción</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
