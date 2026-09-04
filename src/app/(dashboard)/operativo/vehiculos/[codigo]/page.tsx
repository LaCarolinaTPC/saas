import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Bus, IdCard, TriangleAlert, User, UserCog } from "lucide-react";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { MODULE_HOME } from "@/lib/permissions-shared";
import { getDocumentosVehiculo, getTipos, getVehiculoFicha, getVencimientos } from "@/lib/operativo/data";
import {
  NIVELES_ALERTA, NIVEL_COLOR, NIVEL_LABEL, conteoPorNivel, fechaLegible, hoyBogota, nivelMasGrave,
} from "@/lib/operativo/constants";
import { formatDateTimeBogota } from "@/lib/utils";
import { DocumentosClient } from "./documentos-client";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-gray-800">{value ?? "—"}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-[#4F46E5]" />
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

/**
 * Consulta del vehículo: datos del maestro GEMA, conductor y propietario, y
 * la gestión de sus documentos (SOAT, técnico-mecánica, pólizas, tarjeta de
 * operación) con el estado de vencimiento de cada uno.
 */
export default async function VehiculoFichaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const perms = await getCurrentPermissions();
  if (!perms.isAdmin && !canAccess(perms, "operativo")) {
    redirect(perms.modules[0] ? (MODULE_HOME[perms.modules[0]] ?? "/login") : "/login");
  }
  const { codigo } = await params;
  if (!/^[A-Za-z0-9-]{1,20}$/.test(codigo)) notFound();
  const hoy = hoyBogota();
  const [vehiculo, tipos, documentos, vencimientos] = await Promise.all([
    getVehiculoFicha(codigo),
    getTipos(),
    getDocumentosVehiculo(codigo),
    getVencimientos(hoy, codigo),
  ]);
  if (!vehiculo) notFound();

  const activo = vehiculo.estado === 1;
  const conteos = conteoPorNivel(vencimientos);
  const grave = nivelMasGrave(conteos);
  const si = (v: boolean | null) => (v === null ? null : v ? "Sí" : "No");

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/operativo/vehiculos" className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-[#4F46E5]">
            <ArrowLeft className="h-4 w-4" /> Vehículos
          </Link>
          <Link href="/operativo" className="text-sm font-medium text-gray-500 hover:text-[#4F46E5]">Tablero de vencimientos</Link>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[#E2E8F0] bg-white p-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#4F46E5]/10 text-[#4F46E5]">
            <Bus className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-gray-900">
              Vehículo {vehiculo.codigo}{vehiculo.placa ? ` · ${vehiculo.placa}` : ""}
            </h1>
            <p className="text-sm text-gray-500">
              {[vehiculo.marca, vehiculo.clase, vehiculo.modelo, vehiculo.ruta ? `Ruta ${vehiculo.ruta}` : null].filter(Boolean).join(" · ") || "Sin datos del maestro"}
            </p>
          </div>
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
            style={activo ? { backgroundColor: "#DCFCE7", color: "#166534" } : { backgroundColor: "#F1F5F9", color: "#64748B" }}
          >
            {activo ? "Activo" : `Inactivo (estado ${vehiculo.estado ?? "—"})`}
          </span>
        </div>

        {grave && activo && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: NIVEL_COLOR[grave].fuerte, backgroundColor: NIVEL_COLOR[grave].suave, color: NIVEL_COLOR[grave].texto }}
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Documentos por atender:{" "}
              {NIVELES_ALERTA.filter((n) => conteos[n] > 0).map((n) => `${conteos[n]} ${NIVEL_LABEL[n].toLowerCase()}`).join(" · ")}.
              {" "}El detalle está más abajo, en cada documento.
            </span>
          </div>
        )}

        {!activo && (
          <p className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-gray-600">
            Este vehículo no está activo en el maestro: no aparece en el tablero de vencimientos y no se le pueden cargar documentos.
          </p>
        )}

        <DocumentosClient
          codigo={vehiculo.codigo}
          activo={activo}
          hoy={hoy}
          tipos={tipos}
          vencimientos={vencimientos}
          documentos={documentos}
          puedeEditar={perms.isAdmin || perms.puedeEditar}
        />

        <Section icon={IdCard} title="Datos del maestro (GEMA)">
          <Field label="Placa" value={vehiculo.placa} />
          <Field label="Marca" value={vehiculo.marca} />
          <Field label="Clase" value={vehiculo.clase} />
          <Field label="Modelo" value={vehiculo.modelo} />
          <Field label="Color" value={vehiculo.color} />
          <Field label="Carrocería" value={vehiculo.tipo_carroceria} />
          <Field label="Motor" value={vehiculo.motor} />
          <Field label="Chasis" value={vehiculo.chasis} />
          <Field label="Capacidad" value={vehiculo.capacidad_sentado !== null ? `${vehiculo.capacidad_sentado} sentados${vehiculo.capacidad_en_pie ? ` · ${vehiculo.capacidad_en_pie} de pie` : ""}` : null} />
          <Field label="Ruta" value={vehiculo.ruta} />
          <Field label="Tarjeta de operación N.º" value={vehiculo.numero_tarjeta_op} />
          <Field label="Tarjeta de propiedad" value={vehiculo.tarjeta_propiedad} />
          <Field label="Póliza activa (GEMA)" value={si(vehiculo.activo_poliza)} />
          <Field label="Cartulina activa (GEMA)" value={si(vehiculo.activo_cartulina)} />
          <Field label="Fecha contrato" value={fechaLegible(vehiculo.fecha_contrato)} />
          <Field label="Fecha full amparo" value={fechaLegible(vehiculo.fecha_full_amparo)} />
          <Field label="Última sincronización" value={formatDateTimeBogota(vehiculo.updated_at)} />
        </Section>

        <Section icon={User} title="Conductor asignado">
          <Field
            label="Conductor"
            value={vehiculo.conductor_nombre ? (
              vehiculo.cedula_conductor
                ? <Link href={`/conductores/${vehiculo.cedula_conductor}`} className="text-[#4F46E5] hover:underline">{vehiculo.conductor_nombre}</Link>
                : vehiculo.conductor_nombre
            ) : null}
          />
          <Field label="Cédula" value={vehiculo.cedula_conductor} />
        </Section>

        <Section icon={UserCog} title="Propietario">
          <Field label="Propietario" value={vehiculo.propietario_nombre} />
          <Field label="Cédula" value={vehiculo.cedula_propietario} />
          <Field label="Administrador" value={vehiculo.propietario_admin} />
        </Section>
      </div>
    </div>
  );
}
