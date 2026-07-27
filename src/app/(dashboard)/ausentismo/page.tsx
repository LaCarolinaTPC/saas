import { getCurrentPermissions, canAccess } from "@/lib/permissions";
import { getRegistrosDia, getHistorial, getReincidentes } from "@/lib/ausentismo/data";
import { AusentismoClient } from "./ausentismo-client";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Hoy en Bogotá (los registros son del día operativo local). */
function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
}

/**
 * Ausentismo de conductores (RRHH): reemplaza el Excel "AUSENTES DE 2026".
 * Tres vistas: registro del día, historial por rango y reincidentes
 * (calculados, ya no a mano). Registro manual en ausentismo_registros —
 * independiente de la matriz EPS `ausentismo` que se carga por Excel.
 */
export default async function AusentismoPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    fecha?: string;
    desde?: string;
    hasta?: string;
    tipo?: string;
    q?: string;
  }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <div className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-900">Ausentismo</h1>
        </div>
        <div className="mx-auto max-w-md px-6 py-16 text-center text-sm text-gray-500">
          No tienes acceso al módulo de Ausentismo.
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const hoy = hoyBogota();
  const valida = (f?: string) => (f && FECHA_RE.test(f) ? f : null);

  const tab =
    sp.tab === "historial" || sp.tab === "reincidentes" ? sp.tab : "dia";
  const fecha = valida(sp.fecha) ?? hoy;
  // Historial: por defecto los últimos 30 días.
  const hasta = valida(sp.hasta) ?? hoy;
  const desdeDefecto = new Date(
    new Date(`${hasta}T12:00:00-05:00`).getTime() - 29 * 24 * 3600 * 1000
  )
    .toISOString()
    .slice(0, 10);
  const desde = valida(sp.desde) ?? desdeDefecto;

  const [registrosDia, historial, reincidentes] = await Promise.all([
    tab === "dia" ? getRegistrosDia(fecha) : Promise.resolve([]),
    tab === "historial"
      ? getHistorial({ desde, hasta, tipo: sp.tipo || null, q: sp.q || null })
      : Promise.resolve([]),
    tab === "reincidentes" ? getReincidentes(hoy) : Promise.resolve([]),
  ]);

  return (
    <AusentismoClient
      tab={tab}
      hoy={hoy}
      fecha={fecha}
      desde={desde}
      hasta={hasta}
      tipoFiltro={sp.tipo ?? ""}
      query={sp.q ?? ""}
      registrosDia={registrosDia}
      historial={historial}
      reincidentes={reincidentes}
    />
  );
}
