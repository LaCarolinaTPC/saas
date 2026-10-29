import { getCurrentPermissions, canAccess, puedeEditarEn } from "@/lib/permissions";
import {
  getRegistrosDia, getHistorial, getReincidentes, getVehiculosActivos, getConceptos, getParametrosReincidencia,
} from "@/lib/ausentismo/data";
import {
  CRITERIO_KEYS, VENTANA_DEFECTO, conteoPorNivel,
} from "@/lib/ausentismo/constants";
import { esCategoriaReincidencia, resolverRangoReincidentes } from "@/lib/ausentismo/reincidentes-filtros";
import {
  esSegmentoCobro, esCondicionMaestro, parseTiposConductor, tasaTieneBase,
} from "@/lib/ausentismo/matriz-reglas";
import {
  getMatriz, getCatalogosMatriz, getResumenMatriz, getParesProfesionalIps,
  getFilasIndicadores, getConductoresActivos,
} from "@/lib/ausentismo/matriz";
import { limpiarPendientesAutoHuerfanos } from "@/lib/biometrico/pendientes-auto";
import { AusentismoClient } from "./ausentismo-client";
import { PageHeader } from "@/components/layout/page-header";

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
    // Matriz EPS
    eps?: string;
    ips?: string;
    origen?: string;
    estado?: string;
    rev?: string;
    /** "1": ver solo las incapacidades eliminadas lógicamente. */
    elim?: string;
    /** Segmento de cobro: eps | arl. */
    cobro?: string;
    /** Días mínimos de incapacidad. */
    dmin?: string;
    /** Condición en el maestro de conductores: activo | inactivo | sin. */
    cond?: string;
    // Indicadores
    top?: string;
    // Reincidentes
    corte?: string;
    ventana?: string;
    minimo?: string;
    categoria?: string;
    criterio?: string;
    /** "1": listar también a los conductores retirados del maestro. */
    ret?: string;
  }>;
}) {
  const perms = await getCurrentPermissions();
  if (!canAccess(perms, "ausentismo")) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <PageHeader titulo="Ausentismo" />
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
    sp.tab === "historial" || sp.tab === "reincidentes" || sp.tab === "matriz" || sp.tab === "indicadores"
      ? sp.tab
      : "dia";
  const fecha = valida(sp.fecha) ?? hoy;
  // Historial: por defecto los últimos 30 días. Matriz e indicadores: el año en curso.
  const hasta = valida(sp.hasta) ?? hoy;
  const desdeDefecto =
    tab === "matriz" || tab === "indicadores"
      ? `${hasta.slice(0, 4)}-01-01`
      : new Date(new Date(`${hasta}T12:00:00-05:00`).getTime() - 29 * 24 * 3600 * 1000)
          .toISOString()
          .slice(0, 10);
  const desde = valida(sp.desde) ?? desdeDefecto;
  const filtrosMatriz = {
    desde,
    hasta,
    eps: sp.eps ?? "",
    ips: sp.ips ?? "",
    origen: sp.origen ?? "",
    estado: sp.estado === "pendiente" || sp.estado === "cerrado" ? sp.estado : "",
    revision: sp.rev === "1",
    q: sp.q ?? "",
    eliminadas: sp.elim === "1",
    cobro: esSegmentoCobro(sp.cobro) ? sp.cobro : "",
    diasMin: sp.dmin && /^\d{1,3}$/.test(sp.dmin) && Number(sp.dmin) > 0 ? sp.dmin : "",
    condicion: esCondicionMaestro(sp.cond) ? sp.cond : "",
  };

  // El catálogo hace falta en las tres pestañas: etiqueta los registros,
  // llena el selector y decide qué cuenta como reincidencia.
  // Los días de descargos y terminación los usan el aviso del día y Reincidentes.
  const [conceptos, parametrosReincidencia] = await Promise.all([getConceptos(), getParametrosReincidencia()]);
  const dias = parametrosReincidencia.dias;
  const esMatriz = tab === "matriz";
  // Reincidentes: Desde (de la URL solo en esta pestaña) y corte = Hasta.
  const filtrosReincidentes = {
    ...resolverRangoReincidentes(
      { desde: tab === "reincidentes" ? sp.desde : null, corte: sp.corte, ventana: sp.ventana },
      hoy
    ),
    minimo: sp.minimo === "2" || sp.minimo === "4" ? sp.minimo : "3",
    // Cualquier concepto del catálogo que cuente como reincidencia.
    categoria: sp.categoria && esCategoriaReincidencia(sp.categoria, conceptos) ? sp.categoria : "",
    criterio: sp.criterio && CRITERIO_KEYS.has(sp.criterio) ? sp.criterio : "",
    retirados: sp.ret === "1" ? "1" : "",
    q: tab === "reincidentes" ? (sp.q ?? "") : "",
  };
  const esIndicadores = tab === "indicadores";
  const filtrosIndicadores = {
    desde,
    hasta,
    origen: sp.origen ?? "",
    eps: sp.eps ?? "",
    // Varios tipos separados por coma; en Historial `tipo` es otra cosa (el concepto).
    tipo: parseTiposConductor(sp.tipo).join(","),
    estado: sp.estado === "pendiente" || sp.estado === "cerrado" ? sp.estado : "",
    condicion: esCondicionMaestro(sp.cond) ? sp.cond : "",
    top: sp.top === "20" || sp.top === "" ? sp.top : "10",
  };
  // ANTES de leer el día: retira los pendientes que escribió Gestivo y ya no
  // deberían estar —quien salió de la plantilla, y quien SÍ rodó porque su
  // despacho llegó después de la hora de corte—.
  //
  // Se llama también aquí, y no solo desde Marcaciones, porque ESTA es la
  // pantalla donde se ve el registro fantasma: si la limpieza dependiera de
  // que alguien abra Marcaciones de ese día, el registro de una persona que
  // trabajó seguiría a la vista indefinidamente. Nunca lanza, y en el caso
  // normal no borra nada.
  if (tab === "dia") await limpiarPendientesAutoHuerfanos({ fecha });

  const [
    registrosDia, historial, reincidentes, vehiculos, matriz, catalogosMatriz, resumenMatriz, paresMatriz,
    filasIndicadores, activos,
  ] =
    await Promise.all([
      tab === "dia" ? getRegistrosDia(fecha, conceptos) : Promise.resolve([]),
      tab === "historial"
        ? getHistorial({ desde, hasta, tipo: sp.tipo || null, q: sp.q || null, conceptos })
        : Promise.resolve([]),
      // En "día" se calcula con los valores por defecto (mes en curso y sin
      // retirados) solo para el aviso de alertas.
      tab === "reincidentes"
        ? getReincidentes(filtrosReincidentes.corte, conceptos, {
            desde: filtrosReincidentes.desde,
            minimo: Number(filtrosReincidentes.minimo),
            categoria: filtrosReincidentes.categoria,
            incluirRetirados: filtrosReincidentes.retirados === "1",
            dias,
          })
        : tab === "dia"
          ? getReincidentes(hoy, conceptos, { dias })
          : Promise.resolve([]),
      // El formulario (alta y edición) vive en "día" e "historial".
      tab === "dia" || tab === "historial" ? getVehiculosActivos() : Promise.resolve([]),
      esMatriz
        ? getMatriz({
            ...filtrosMatriz,
            eps: filtrosMatriz.eps || null,
            ips: filtrosMatriz.ips || null,
            origen: filtrosMatriz.origen || null,
            estado: filtrosMatriz.estado || null,
            q: filtrosMatriz.q || null,
            cobro: esSegmentoCobro(filtrosMatriz.cobro) ? filtrosMatriz.cobro : null,
            diasMin: filtrosMatriz.diasMin ? Number(filtrosMatriz.diasMin) : null,
            condicion: esCondicionMaestro(filtrosMatriz.condicion) ? filtrosMatriz.condicion : null,
          })
        : Promise.resolve([]),
      // El catálogo también llena los filtros de origen y EPS de Indicadores.
      esMatriz || esIndicadores ? getCatalogosMatriz() : Promise.resolve(null),
      esMatriz ? getResumenMatriz() : Promise.resolve(null),
      esMatriz ? getParesProfesionalIps() : Promise.resolve({}),
      esIndicadores
        ? getFilasIndicadores({
            desde,
            hasta,
            origen: filtrosIndicadores.origen || null,
            eps: filtrosIndicadores.eps || null,
            tiposConductor: parseTiposConductor(filtrosIndicadores.tipo),
            estado: filtrosIndicadores.estado || null,
            condicion: esCondicionMaestro(filtrosIndicadores.condicion) ? filtrosIndicadores.condicion : null,
          })
        : Promise.resolve([]),
      // Sin base comparable (retirados, fuera del maestro o por tipo) no hay tasa.
      esIndicadores &&
      tasaTieneBase(esCondicionMaestro(filtrosIndicadores.condicion) ? filtrosIndicadores.condicion : null, parseTiposConductor(filtrosIndicadores.tipo))
        ? getConductoresActivos()
        : Promise.resolve(null),
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
      reincidentes={tab === "reincidentes" ? reincidentes : []}
      filtrosReincidentes={filtrosReincidentes}
      alertasReincidentes={{
        total: reincidentes.filter((r) => r.alerta).length,
        porNivel: conteoPorNivel(reincidentes),
        sinNotificar: reincidentes.filter((r) => r.pendientes.length > 0).length,
        // El aviso del día siempre va con los valores por defecto, sin
        // importar cómo esté filtrada la pestaña de reincidentes.
        ventana: VENTANA_DEFECTO,
        corte: hoy,
      }}
      parametrosReincidencia={parametrosReincidencia}
      vehiculos={vehiculos}
      conceptos={conceptos}
      puedeEditar={puedeEditarEn(perms, "ausentismo")}
      matriz={
        esMatriz && catalogosMatriz && resumenMatriz
          ? { filtros: filtrosMatriz, filas: matriz, catalogos: catalogosMatriz, resumen: resumenMatriz, pares: paresMatriz }
          : null
      }
      indicadores={
        esIndicadores && catalogosMatriz
          ? {
              filtros: filtrosIndicadores,
              filas: filasIndicadores,
              activos,
              origenes: catalogosMatriz.ORIGEN.filter((o) => o.activo),
              pagadores: [...catalogosMatriz.EPS, ...catalogosMatriz.ARL].filter((p) => p.activo),
            }
          : null
      }
    />
  );
}
