import { Fingerprint } from "lucide-react";
import { getCurrentPermissions, canAccess, puedeEditarEn } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { hoyBogota } from "@/lib/operativo/constants";
import { getConceptos, getVehiculosActivos } from "@/lib/ausentismo/data";
import type { Concepto, VehiculoOpcion } from "@/lib/ausentismo/constants";
import { getDatosMarcaciones, type DatosMarcaciones } from "@/lib/biometrico/data";
import { PestanasAusentismo } from "../pestanas";
import { MarcacionesClient } from "./marcaciones-client";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ausentismo · Marcaciones. Cruza las huellas del biométrico (ZKAccess) con
 * quien debía trabajar según la programación de GEMA, para que RRHH vea quién
 * no apareció y registre la novedad desde ahí.
 *
 * Nada se crea solo: las rachas de descargos y terminación cuentan días
 * calendario, así que convertir «no marcó» en falta automática inventaría
 * ausencias cada descanso. Ver docs/biometrico-marcaciones.md.
 */
export default async function MarcacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <PageHeader titulo="Marcaciones" icono={Fingerprint} />
        <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-gray-500">
          No tienes acceso al módulo de Ausentismo.
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const hoy = hoyBogota();
  const fecha = sp.fecha && FECHA_RE.test(sp.fecha) ? sp.fecha : hoy;

  let conceptos: Concepto[] = [];
  let vehiculos: VehiculoOpcion[] = [];
  let datos: DatosMarcaciones | null = null;
  let error: string | null = null;
  try {
    [conceptos, vehiculos] = await Promise.all([getConceptos(), getVehiculosActivos()]);
    datos = await getDatosMarcaciones(fecha, conceptos, hoy);
  } catch (e) {
    // Sin la migración aplicada las tablas del biométrico no existen: la
    // pantalla lo dice en vez de caerse (igual que Combustible).
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Recursos Humanos · Marcaciones" icono={Fingerprint}>
        <PestanasAusentismo activa="marcaciones" />
      </PageHeader>
      <MarcacionesClient
        fecha={fecha}
        hoy={hoy}
        datos={datos}
        conceptos={conceptos}
        vehiculos={vehiculos}
        puedeEditar={puedeEditarEn(perms, "ausentismo")}
        error={error}
      />
    </div>
  );
}
