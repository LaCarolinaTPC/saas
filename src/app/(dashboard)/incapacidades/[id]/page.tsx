import { notFound } from "next/navigation";
import { HeartPulse } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { canAccess, getCurrentPermissions } from "@/lib/permissions";
import { auditarConsultaExpediente } from "@/lib/incapacidades/auditoria";
import { leerExpediente, listarEntidades, type EntidadCatalogo } from "@/lib/incapacidades/expedientes";
import { listarTiposOrigen, sugerenciaSalario, type SugerenciaSalario, type TipoOrigen } from "@/lib/incapacidades/liquidacion";
import { ESTADOS_EDITABLES, faltantesParaLiquidar } from "@/lib/incapacidades/liquidacion-reglas";
import { ChipEstado } from "../bandeja-tabla";
import { ExpedienteFicha } from "../expediente-ficha";
import { Fallo, SinAcceso } from "../sin-acceso";
import { GestionExpediente } from "./gestion";
import { RadicacionPanel } from "./radicacion-panel";
import { SaldoPanel } from "./saldo-panel";
import { leerTolerancia, movimientosDeExpediente, saldoDe, type AjusteMonetarioFila, type AplicacionFila } from "@/lib/incapacidades/recaudos";

/** Hoy en Bogotá, para la fecha de solicitud por defecto. */
function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function ExpedientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; aviso?: string }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "incapacidades")) return <SinAcceso />;

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;

  let detalle: Awaited<ReturnType<typeof leerExpediente>> = null;
  let fallo: string | null = null;
  let sugerencia: SugerenciaSalario | null = null;
  let entidades: EntidadCatalogo[] = [];
  let tipos: TipoOrigen[] = [];
  let tolerancia = 0;
  let movimientos: { aplicaciones: AplicacionFila[]; ajustes: AjusteMonetarioFila[] } = { aplicaciones: [], ajustes: [] };
  try {
    detalle = await leerExpediente(id);
    if (detalle && ["radicado", "con_recaudo", "conciliado", "cerrado"].includes(detalle.vista.estado)) {
      [tolerancia, movimientos] = await Promise.all([leerTolerancia(), movimientosDeExpediente(id)]);
    }
    if (detalle && perms.puedeEditar && ESTADOS_EDITABLES.has(detalle.vista.estado) && !detalle.vista.matriz_eliminada_at) {
      [sugerencia, entidades, tipos] = await Promise.all([
        sugerenciaSalario(detalle.vista.cedula).catch(() => null),
        listarEntidades(),
        listarTiposOrigen(),
      ]);
    }
  } catch (e) {
    fallo = e instanceof Error ? e.message : String(e);
  }
  if (!fallo && !detalle) notFound();

  if (detalle) {
    await auditarConsultaExpediente({
      expedienteId: detalle.vista.id,
      cedula: detalle.vista.cedula,
      nombre: detalle.vista.nombre,
      estado: detalle.vista.estado,
      rol: perms.userType,
      userEmail: perms.userEmail,
    });
  }

  const puedeGestionar =
    !!detalle && perms.puedeEditar && ESTADOS_EDITABLES.has(detalle.vista.estado) && !detalle.vista.matriz_eliminada_at;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader
        titulo={detalle ? `Expediente · ${detalle.vista.nombre ?? detalle.vista.cedula}` : "Expediente"}
        icono={HeartPulse}
        volver={{ href: "/incapacidades", label: "Recuperación de incapacidades" }}
        junto={detalle ? <ChipEstado estado={detalle.vista.estado} /> : undefined}
      />
      <div className="space-y-6 p-6">
        {fallo && <Fallo mensaje={fallo} />}
        {detalle && <ExpedienteFicha d={detalle} />}
        {detalle && puedeGestionar && (
          <GestionExpediente
            d={detalle}
            sugerencia={sugerencia}
            entidades={entidades}
            tipos={tipos}
            faltantes={faltantesParaLiquidar(detalle.vista)}
            mensajes={{ ok: sp.ok, error: sp.error, aviso: sp.aviso }}
          />
        )}
        {detalle && !detalle.vista.matriz_eliminada_at && (
          <RadicacionPanel d={detalle} hoy={hoyBogota()} puedeEditar={perms.puedeEditar} />
        )}
        {detalle && ["radicado", "con_recaudo", "conciliado", "cerrado"].includes(detalle.vista.estado) && (
          <SaldoPanel
            v={detalle.vista}
            saldo={saldoDe(detalle.vista, tolerancia)}
            tolerancia={tolerancia}
            aplicaciones={movimientos.aplicaciones}
            ajustes={movimientos.ajustes}
            puedeEditar={perms.puedeEditar}
          />
        )}
        {detalle && !puedeGestionar && (
          <p className="text-xs text-gray-500">
            {perms.puedeEditar
              ? `El expediente está en estado «${detalle.vista.estado}» y no admite cambios de la etapa 2.`
              : "Tu tipo de usuario consulta el expediente; completar, ajustar y liquidar lo hace RRHH."}
          </p>
        )}
      </div>
    </div>
  );
}
