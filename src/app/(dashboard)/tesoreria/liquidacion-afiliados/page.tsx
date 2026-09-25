import { requireTesoreriaSub } from "@/lib/devengados/guard";
import { canAccessSub } from "@/lib/permissions";
import {
  fechaPagoDe, estadoPago, periodoDe, periodosRecientes, ultimoPeriodoCerrado,
} from "@/lib/tesoreria/calendario-pago";
import { liquidar, resumenPorAfiliado } from "@/lib/tesoreria/liquidacion-afiliados";
import {
  armarPagos, fechaPagoPorDefecto, opcionesFechaPago, periodosQuePaganEl, rangoDe,
} from "@/lib/tesoreria/pagos-afiliados";
import {
  getFilasAfiliados, getPropietarios, getReglasPago, getUltimoDiaSincronizado,
} from "@/lib/tesoreria/liquidacion-afiliados-data";
import { LiquidacionAfiliadosClient } from "./liquidacion-client";
import { DetalleAfiliadoClient } from "./detalle-client";

export const dynamic = "force-dynamic";

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

/**
 * Liquidación de afiliados (Tesorería): el reporte GEMA GAF-R-12 por
 * propietario, calculado desde ingreso_tercero, y el calendario de pagos según
 * propietarios.plazo_pago. Solo afiliados: cierre AFILIADO en GEMA y vehículo
 * AFILIADO en la operación.
 */
export default async function LiquidacionAfiliadosPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; pago?: string; desde?: string; hasta?: string; cedula?: string }>;
}) {
  const perms = await requireTesoreriaSub("liq_afiliados");
  const sp = await searchParams;
  const hoy = hoyBogota();
  const valida = (f?: string) => (f && FECHA_RE.test(f) ? f : null);
  const [{ reglas, desdeTabla }, ultimoSincronizado] = await Promise.all([getReglasPago(), getUltimoDiaSincronizado()]);
  const comun = {
    hoy,
    reglas,
    reglasDesdeTabla: desdeTabla,
    ultimoSincronizado,
    puedeConfigurar: canAccessSub(perms, "tesoreria", "parametros"),
  };

  // ── Detalle de un afiliado ────────────────────────────────────────────────
  const cedula = sp.cedula && /^[\w.-]{3,20}$/.test(sp.cedula) ? sp.cedula : null;
  if (cedula) {
    const fichas = await getPropietarios([cedula]);
    const ficha = fichas.get(cedula) ?? null;
    const regla = reglas[ficha?.plazo ?? "SEMANAL"];
    const periodos = periodosRecientes(regla, hoy, 16).map((periodo) => {
      const pago = fechaPagoDe(regla, periodo);
      return { periodo, pago, estado: estadoPago(periodo, pago, hoy) };
    });
    const defecto = ultimoPeriodoCerrado(regla, hoy);
    const desde = valida(sp.desde) ?? defecto.desde;
    const hasta = valida(sp.hasta) ?? defecto.hasta;
    const filas = desde <= hasta ? await getFilasAfiliados({ desde, hasta, cedula }) : [];
    // Si el rango coincide con un periodo del plazo, se muestra su fecha de pago.
    const delPlazo = periodoDe(regla, desde);
    const esPeriodo = delPlazo.desde === desde && delPlazo.hasta === hasta;
    return (
      <DetalleAfiliadoClient
        {...comun}
        cedula={cedula}
        ficha={ficha}
        desde={desde}
        hasta={hasta}
        periodos={periodos}
        periodoActual={esPeriodo ? { periodo: delPlazo, pago: fechaPagoDe(regla, delPlazo) } : null}
        liquidacion={liquidar(cedula, filas)}
        volverA={sp.vista === "rango" ? "rango" : "pagos"}
      />
    );
  }

  // ── Rango libre: todos los afiliados en un rango ──────────────────────────
  if (sp.vista === "rango") {
    const defecto = ultimoPeriodoCerrado(reglas.SEMANAL, hoy);
    const desde = valida(sp.desde) ?? `${hoy.slice(0, 7)}-01`;
    const hasta = valida(sp.hasta) ?? (defecto.hasta >= desde ? defecto.hasta : hoy);
    const filas = desde <= hasta ? await getFilasAfiliados({ desde, hasta }) : [];
    const resumen = resumenPorAfiliado(filas);
    const fichas = await getPropietarios(resumen.map((r) => r.cedula));
    return (
      <LiquidacionAfiliadosClient
        {...comun}
        vista="rango"
        desde={desde}
        hasta={hasta}
        filasRango={resumen.map((r) => ({
          ...r,
          codigo: fichas.get(r.cedula)?.codigo ?? null,
          plazo: fichas.get(r.cedula)?.plazo ?? "SEMANAL",
        }))}
        opcionesPago={[]}
        fechaPago={null}
        periodosPago={{}}
        filasPago={[]}
      />
    );
  }

  // ── Calendario de pagos (vista por defecto) ───────────────────────────────
  const opcionesPago = opcionesFechaPago(reglas, hoy);
  const pedida = valida(sp.pago);
  const fechaPago = pedida ?? fechaPagoPorDefecto(opcionesPago, hoy);
  const periodosPago = fechaPago ? periodosQuePaganEl(reglas, fechaPago) : {};
  const rango = rangoDe(periodosPago);
  const filas = rango ? await getFilasAfiliados(rango) : [];
  const fichas = await getPropietarios([...new Set(filas.map((f) => f.cedula_propietario))]);
  const filasPago = armarPagos({ periodos: periodosPago, filas, propietarios: fichas, hoy, ultimoSincronizado });
  return (
    <LiquidacionAfiliadosClient
      {...comun}
      vista="pagos"
      desde={rango?.desde ?? hoy}
      hasta={rango?.hasta ?? hoy}
      filasRango={[]}
      opcionesPago={pedida && !opcionesPago.includes(pedida) ? [pedida, ...opcionesPago] : opcionesPago}
      fechaPago={fechaPago}
      periodosPago={periodosPago}
      filasPago={filasPago}
      sinPlazo={[...fichas.values()].filter((f) => !f.plazoReconocido).map((f) => f.cedula)}
    />
  );
}
