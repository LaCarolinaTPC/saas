"use client";

import { usePermisos } from "@/components/permisos/permisos-provider";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarOff, CalendarDays, Search, Plus, X, Pencil,
  Trash2, TriangleAlert, Bus, History,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import {
  CONTACTO_LABEL, SOPORTE_LABEL,
  HISTORIAL_LIMITE, HISTORIAL_PAGINA,
  NIVELES_ALERTA, NIVEL_ALERTA_LABEL, NIVEL_ALERTA_ACCION, NIVEL_ALERTA_COLOR, nivelMasGrave, textoVentana,
  conceptoLabels, etiquetaVehiculo,
  type AusentismoRegistro, type VehiculoOpcion, type Concepto, type NivelAlerta,
} from "@/lib/ausentismo/constants";
import type { Reincidente } from "@/lib/ausentismo/data";
import { exportarRegistroDia, exportarHistorial } from "@/lib/ausentismo/exportar";
import type { FormatoExport } from "@/lib/exportar/formatos";
import { BotonesExportar } from "./botones-exportar";
import { ChipNivel, ReincidentesClient, type FiltrosReincidentesUI } from "./reincidentes/reincidentes-client";
import type { Catalogos, MatrizFila, ResumenMatriz, ParesProfesionalIps } from "@/lib/ausentismo/matriz";
import { eliminarRegistro } from "./actions";
// El formulario vive aparte: lo comparte la pantalla de Marcaciones, que lo
// abre con el conductor y la fecha ya puestos.
import { RegistroForm, inputCls } from "./registro-form";
import { clavesPeriodicas, empiezaEn, posicionEnPeriodo } from "@/lib/ausentismo/periodos";
import { MatrizClient, type FiltrosMatrizUI } from "./matriz/matriz-client";
import { IndicadoresClient, type FiltrosIndicadoresUI } from "./indicadores/indicadores-client";
import type { FilaIndicador } from "@/lib/ausentismo/indicadores";
import type { CatalogoItem } from "@/lib/ausentismo/matriz";

/** Colores de los conceptos sembrados; los creados después salen neutros. */
const TIPO_COLOR: Record<string, { bg: string; color: string }> = {
  incapacidad: { bg: "#FEE2E2", color: "#DC2626" },
  no_justificada: { bg: "#FEF3C7", color: "#B45309" },
  suspension: { bg: "#FEE2E2", color: "#DC2626" },
  renuncia: { bg: "#F1F5F9", color: "#64748B" },
  vacaciones: { bg: "#D1FAE5", color: "#059669" },
  descanso: { bg: "#D1FAE5", color: "#059669" },
};

function tipoBadge(tipo: string, labels: Record<string, string>) {
  const c = TIPO_COLOR[tipo] ?? { bg: "#E0E7FF", color: "#4338CA" };
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: c.bg, color: c.color }}
    >
      {labels[tipo] ?? tipo}
    </span>
  );
}

export function AusentismoClient({
  tab, hoy, fecha, desde, hasta, tipoFiltro, query,
  registrosDia, historial, reincidentes, filtrosReincidentes, alertasReincidentes,
  vehiculos, conceptos, puedeEditar, matriz, indicadores,
}: {
  tab: "dia" | "historial" | "reincidentes" | "matriz" | "indicadores";
  hoy: string;
  fecha: string;
  desde: string;
  hasta: string;
  tipoFiltro: string;
  query: string;
  registrosDia: AusentismoRegistro[];
  historial: AusentismoRegistro[];
  reincidentes: Reincidente[];
  filtrosReincidentes: FiltrosReincidentesUI;
  /** Reincidentes con alerta a hoy (valores por defecto), para el aviso y el contador. */
  alertasReincidentes: {
    total: number;
    porNivel: Record<NivelAlerta, number>;
    sinNotificar: number;
    /** Ventana y corte del aviso: siempre los de por defecto, sin retirados. */
    ventana: string;
    corte: string;
  };
  vehiculos: VehiculoOpcion[];
  conceptos: Concepto[];
  puedeEditar: boolean;
  /** Solo viene cargado en la pestaña Matriz EPS. */
  matriz: {
    filtros: FiltrosMatrizUI;
    filas: MatrizFila[];
    catalogos: Catalogos;
    resumen: ResumenMatriz;
    pares: ParesProfesionalIps;
  } | null;
  /** Solo viene cargado en la pestaña Indicadores. */
  indicadores: {
    filtros: FiltrosIndicadoresUI;
    filas: FilaIndicador[];
    activos: number | null;
    origenes: CatalogoItem[];
    pagadores: CatalogoItem[];
  } | null;
}) {
  // Registrar exige `ausentismo.crear` (también en el servidor).
  const puede = usePermisos();
  const router = useRouter();
  const [editando, setEditando] = useState<AusentismoRegistro | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  // Conceptos creados desde el formulario en esta sesión: aparecen de
  // inmediato y, cuando el servidor los devuelve tras el refresh, se
  // descartan del extra para no duplicarlos.
  const [extras, setExtras] = useState<Concepto[]>([]);
  const catalogo = useMemo(() => {
    const yaEstan = new Set(conceptos.map((c) => c.key));
    return [...conceptos, ...extras.filter((e) => !yaEstan.has(e.key))];
  }, [conceptos, extras]);
  const labels = useMemo(() => conceptoLabels(catalogo), [catalogo]);
  function onConceptoCreado(c: Concepto) {
    setExtras((prev) => (prev.some((x) => x.key === c.key) ? prev : [...prev, c]));
  }

  function irA(params: Record<string, string>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    router.push(`/ausentismo?${sp.toString()}`);
  }

  const totalesDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of registrosDia) m.set(r.tipo, (m.get(r.tipo) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [registrosDia]);
  // El aviso y el contador toman el color del nivel más grave presente.
  const nivelGrave = nivelMasGrave(alertasReincidentes.porNivel);
  const colorGrave = nivelGrave ? NIVEL_ALERTA_COLOR[nivelGrave] : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <PageHeader titulo="Recursos Humanos · Ausentismo" icono={CalendarOff}>
        <div className="flex overflow-hidden rounded-lg border border-[#E2E8F0]">
          {(
            [
              { v: "dia", l: "Registro del día" },
              { v: "historial", l: "Historial" },
              { v: "reincidentes", l: "Reincidentes" },
              { v: "matriz", l: "Matriz EPS" },
              { v: "indicadores", l: "Indicadores" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              onClick={() => irA({ tab: o.v })}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium ${
                tab === o.v
                  ? "bg-[#4F46E5] text-white"
                  : "bg-white text-gray-600 hover:bg-[#F8FAFC]"
              }`}
            >
              {o.l}
              {o.v === "reincidentes" && alertasReincidentes.total > 0 && colorGrave && (
                <span
                  title={
                    `${alertasReincidentes.total} reincidente(s) con alerta de no justificado\n` +
                    NIVELES_ALERTA.filter((n) => alertasReincidentes.porNivel[n] > 0)
                      .map((n) => `${NIVEL_ALERTA_LABEL[n]}: ${alertasReincidentes.porNivel[n]}`).join(" · ")
                  }
                  className="rounded-full px-1.5 text-[11px] font-semibold leading-4 text-white"
                  style={{ backgroundColor: colorGrave.fuerte }}
                >
                  {alertasReincidentes.total}
                </span>
              )}
            </button>
          ))}
          {/* Ruta propia, no una pestaña con ?tab=: carga el biométrico y la
              programación de GEMA, y no tiene por qué pesar sobre las demás. */}
          <Link
            href="/ausentismo/marcaciones"
            className="inline-flex items-center gap-1.5 whitespace-nowrap bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-[#F8FAFC]"
          >
            Marcaciones
          </Link>
        </div>
      </PageHeader>

      {/* Ancho completo: la tabla de registros tiene nueve columnas y con el
          contenedor angosto quedaban Soporte y Acciones fuera de la vista. */}
      <div className="space-y-4 p-4 sm:p-6">
        {tab === "dia" && (
          <>
            {alertasReincidentes.total > 0 && colorGrave && (
              <div
                role="alert"
                className="space-y-2 rounded-xl border px-4 py-3 text-sm"
                style={{ borderColor: colorGrave.fuerte, backgroundColor: colorGrave.suave, color: colorGrave.texto }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <strong>{alertasReincidentes.total}</strong> conductor{alertasReincidentes.total === 1 ? "" : "es"}{" "}
                      reincidente{alertasReincidentes.total === 1 ? "" : "s"} con faltas no justificadas o soportes pendientes
                      en {textoVentana(alertasReincidentes.ventana, alertasReincidentes.corte)}.
                      No incluye a los conductores retirados.
                    </span>
                  </span>
                  <button
                    onClick={() => irA({ tab: "reincidentes", ventana: alertasReincidentes.ventana, criterio: "alerta" })}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-current px-3 py-1.5 text-xs font-semibold hover:bg-white/60"
                  >
                    Ver reincidentes en alerta
                  </button>
                </div>
                {/* Un chip por nivel presente; cada uno lleva a su segmento. */}
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  {NIVELES_ALERTA.filter((n) => alertasReincidentes.porNivel[n] > 0).map((n) => (
                    <button
                      key={n}
                      onClick={() => irA({ tab: "reincidentes", ventana: alertasReincidentes.ventana, criterio: n })}
                      title={NIVEL_ALERTA_ACCION[n]}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1 text-xs hover:bg-white"
                    >
                      <ChipNivel nivel={n} />
                      <strong>{alertasReincidentes.porNivel[n]}</strong>
                      {(n === "descargos" || n === "terminacion") && (
                        <span className="text-gray-700">· {NIVEL_ALERTA_ACCION[n]}</span>
                      )}
                    </button>
                  ))}
                  {alertasReincidentes.sinNotificar > 0 && (
                    <button
                      onClick={() => irA({ tab: "reincidentes", ventana: alertasReincidentes.ventana, criterio: "sin_notificar" })}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-current px-2 py-1 text-xs font-semibold hover:bg-white"
                    >
                      <TriangleAlert className="h-3.5 w-3.5" />
                      {alertasReincidentes.sinNotificar} pendiente{alertasReincidentes.sinNotificar === 1 ? "" : "s"} de notificar
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-600">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Fecha
                </span>
                <span className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="date"
                    value={fecha}
                    max={hoy}
                    onChange={(e) =>
                      e.target.value && irA({ tab: "dia", fecha: e.target.value })
                    }
                    className="border-0 bg-transparent text-sm outline-none"
                  />
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <BotonesExportar
                  sinDatos={registrosDia.length === 0}
                  onExportar={(formato) =>
                    exportarRegistroDia({ formato, fecha, registros: registrosDia, labels })
                  }
                />
                {puede("ausentismo.crear") && (
                  <button
                    onClick={() => {
                      setEditando(null);
                      setMostrarForm((v) => !v);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-2 text-sm font-medium text-white hover:bg-[#4338CA]"
                  >
                    {mostrarForm && !editando ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {mostrarForm && !editando ? "Cancelar" : "Registrar ausente"}
                  </button>
                )}
              </div>
            </div>

            {(mostrarForm || editando) && (
              <RegistroForm
                key={editando?.id ?? "nuevo"}
                fecha={fecha}
                hoy={hoy}
                registro={editando}
                vehiculos={vehiculos}
                conceptos={catalogo}
                puedeEditar={puedeEditar}
                onConceptoCreado={onConceptoCreado}
                onDone={() => {
                  setMostrarForm(false);
                  setEditando(null);
                  router.refresh();
                }}
              />
            )}

            {totalesDia.length > 0 && <ResumenTipos totales={totalesDia} total={registrosDia.length} labels={labels} />}

            <TablaRegistros
              registros={registrosDia}
              labels={labels}
              conFecha={false}
              onEditar={(r) => {
                setEditando(r);
                setMostrarForm(false);
              }}
              vacio={`Sin ausentes registrados el ${fecha}.`}
              conceptos={catalogo}
              dia={fecha}
            />
          </>
        )}

        {tab === "historial" && (
          <>
            <HistorialFiltros
              desde={desde}
              hasta={hasta}
              hoy={hoy}
              tipoFiltro={tipoFiltro}
              query={query}
              conceptos={catalogo}
              onAplicar={(f) => irA({ tab: "historial", ...f })}
            />
            {/* Con clave por filtros: al cambiar la búsqueda la paginación vuelve a la primera página. */}
            <HistorialVista
              key={`${desde}|${hasta}|${tipoFiltro}|${query}`}
              historial={historial}
              labels={labels}
              conceptos={catalogo}
              onEditar={(r) => setEditando(r)}
              onExportar={(formato) =>
                exportarHistorial({ formato, desde, hasta, tipoFiltro, query, registros: historial, labels })
              }
            />
            {editando && tab === "historial" && (
              <RegistroForm
                key={editando.id}
                fecha={editando.fecha}
                hoy={hoy}
                registro={editando}
                vehiculos={vehiculos}
                conceptos={catalogo}
                puedeEditar={puedeEditar}
                onConceptoCreado={onConceptoCreado}
                onDone={() => {
                  setEditando(null);
                  router.refresh();
                }}
              />
            )}
          </>
        )}

        {tab === "matriz" && matriz && (
          <MatrizClient
            hoy={hoy}
            filtros={matriz.filtros}
            filas={matriz.filas}
            catalogos={matriz.catalogos}
            resumen={matriz.resumen}
            pares={matriz.pares}
            puedeEditar={puedeEditar}
          />
        )}

        {tab === "indicadores" && indicadores && (
          <IndicadoresClient
            hoy={hoy}
            filtros={indicadores.filtros}
            filas={indicadores.filas}
            activos={indicadores.activos}
            origenes={indicadores.origenes}
            pagadores={indicadores.pagadores}
          />
        )}

        {tab === "reincidentes" && (
          <ReincidentesClient
            // Al navegar (Aplicar o un chip) el formulario vuelve a tomar los
            // filtros de la URL; sin la llave seguía mostrando los anteriores.
            key={JSON.stringify(filtrosReincidentes)}
            hoy={hoy}
            filtros={filtrosReincidentes}
            reincidentes={reincidentes}
            labels={labels}
            conceptos={catalogo}
            onAplicar={irA}
          />
        )}
      </div>
    </div>
  );
}

/** Chips con el conteo por concepto y el total, para el día y el historial. */
function ResumenTipos({ totales, total, labels }: {
  totales: [string, number][];
  total: number;
  labels: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {totales.map(([tipo, n]) => (
        <span
          key={tipo}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs text-gray-600"
        >
          {tipoBadge(tipo, labels)} <strong>{n}</strong>
        </span>
      ))}
      <span className="inline-flex items-center rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
        Total: {total}
      </span>
    </div>
  );
}

/**
 * Historial: resumen por concepto, exportación y tabla paginada. Con el
 * histórico migrado un rango largo trae miles de filas; se muestran de a
 * HISTORIAL_PAGINA para que la pantalla siga siendo legible, y la exportación
 * y los totales llevan el conjunto completo.
 */
function HistorialVista({ historial, labels, conceptos, onEditar, onExportar }: {
  historial: AusentismoRegistro[];
  labels: Record<string, string>;
  conceptos: Concepto[];
  onEditar: (r: AusentismoRegistro) => void;
  onExportar: (formato: FormatoExport) => Promise<void>;
}) {
  const totales = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of historial) m.set(r.tipo, (m.get(r.tipo) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [historial]);
  const conductores = useMemo(() => new Set(historial.map((r) => r.cedula)).size, [historial]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          <strong className="text-gray-900">{historial.length}</strong> registro{historial.length === 1 ? "" : "s"}
          {historial.length > 0 && <> · {conductores} conductor{conductores === 1 ? "" : "es"}</>}
          {historial.length >= HISTORIAL_LIMITE && (
            <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
              <TriangleAlert className="h-3.5 w-3.5" />
              El historial se corta en {HISTORIAL_LIMITE}. Acota el rango o el tipo para ver el resto.
            </span>
          )}
        </p>
        <BotonesExportar sinDatos={historial.length === 0} onExportar={onExportar} />
      </div>
      {totales.length > 0 && <ResumenTipos totales={totales} total={historial.length} labels={labels} />}
      <TablaRegistros
        registros={historial}
        labels={labels}
        conFecha
        onEditar={onEditar}
        vacio="Sin registros en el rango elegido."
        conceptos={conceptos}
        porPagina={HISTORIAL_PAGINA}
      />
    </>
  );
}

function HistorialFiltros({
  desde, hasta, hoy, tipoFiltro, query, conceptos, onAplicar,
}: {
  desde: string;
  hasta: string;
  hoy: string;
  tipoFiltro: string;
  query: string;
  conceptos: Concepto[];
  onAplicar: (f: Record<string, string>) => void;
}) {
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);
  const [t, setT] = useState(tipoFiltro);
  const [q, setQ] = useState(query);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Desde</span>
        <input type="date" value={d} max={hoy} onChange={(e) => setD(e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Hasta</span>
        <input type="date" value={h} min={d} max={hoy} onChange={(e) => setH(e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Tipo</span>
        <select value={t} onChange={(e) => setT(e.target.value)} className={inputCls}>
          <option value="">Todos</option>
          {/* Se listan también los inactivos: el historial puede tenerlos. */}
          {conceptos.map((x) => (
            <option key={x.key} value={x.key}>
              {x.nombre}{x.activo ? "" : " (inactivo)"}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-gray-600">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Conductor
        </span>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, cédula o código"
            className={`${inputCls} w-52 pl-8`}
          />
        </div>
      </label>
      <button
        onClick={() => onAplicar({ desde: d, hasta: h, tipo: t, q })}
        className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
      >
        <Search className="h-4 w-4" /> Buscar
      </button>
    </div>
  );
}

function TablaRegistros({
  registros, labels, conFecha, onEditar, vacio, conceptos, dia, porPagina,
}: {
  registros: AusentismoRegistro[];
  labels: Record<string, string>;
  conFecha: boolean;
  onEditar: (r: AusentismoRegistro) => void;
  vacio: string;
  conceptos: Concepto[];
  /** Día que se está viendo; con él se marca "día 3 de 16". Solo en la vista del día. */
  dia?: string;
  porPagina?: number;
}) {
  const [pending, start] = useTransition();
  const periodicas = useMemo(() => clavesPeriodicas(conceptos), [conceptos]);
  // Editar y eliminar, cada uno con su permiso (también en el servidor).
  const puede = usePermisos();
  // Paginación: al cambiar de día vuelve a la primera página aunque el conteo coincida.
  const p = usePaginacion(registros, { porPagina, reiniciar: dia });
  const ancla = useRef<HTMLDivElement>(null);

  function eliminar(r: AusentismoRegistro) {
    // Un periodo se borra entero: no hay filas por día que quitar sueltas.
    const esPeriodo = periodicas.has(r.tipo) && !!r.fecha_fin;
    const ok = window.confirm(
      esPeriodo
        ? `¿Eliminar ${labels[r.tipo] ?? r.tipo} de ${r.nombre}, del ${r.fecha_inicio ?? r.fecha} al ${r.fecha_fin}?\n\n` +
            "Se borra el periodo completo, no solo el día que estás viendo. " +
            "La eliminación queda registrada en la bitácora del módulo."
        : `¿Eliminar el registro de ${r.nombre} del ${r.fecha}?\n\n` +
            "La eliminación queda registrada en la bitácora del módulo."
    );
    if (!ok) return;
    start(async () => {
      const res = await eliminarRegistro(r.id);
      if (res.success) toast.success("Registro eliminado (quedó en la bitácora)");
      else toast.error(res.error ?? "No se pudo eliminar");
    });
  }

  return (
    <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
              {conFecha && <th className="whitespace-nowrap px-4 py-2">Fecha</th>}
              <th className="min-w-56 px-4 py-2">Conductor</th>
              <th className="px-4 py-2">Vehículo</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Periodo</th>
              <th className="min-w-64 px-4 py-2">Justificación</th>
              <th className="px-4 py-2">Incapacidad · reintegro</th>
              <th className="px-4 py-2">Soporte</th>
              <th className="px-4 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {p.filas.map((r) => (
              <tr key={r.id} className="border-b border-[#F1F5F9] align-top hover:bg-[#FAFAFF]">
                {conFecha && <td className="whitespace-nowrap px-4 py-2 font-medium">{r.fecha}</td>}
                <td className="px-4 py-2">
                  <p className="font-medium text-gray-900">
                    {r.codigo ? `${r.codigo} · ` : ""}
                    {r.nombre}
                  </p>
                  {/* Cédula y teléfono en la misma línea: una columna menos y la tabla cabe en pantalla. */}
                  <p className="text-xs text-gray-500">
                    CC {r.cedula}
                    {r.telefono ? ` · ${r.telefono}` : ""}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600">
                  {r.codigo_vehiculo ? (
                    <span className="inline-flex items-center gap-1">
                      <Bus className="h-3 w-3 text-gray-400" />
                      {etiquetaVehiculo({
                        codigo: r.codigo_vehiculo,
                        placa: r.vehiculos?.placa ?? null,
                      })}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className="inline-flex flex-wrap items-center gap-1">
                    {tipoBadge(r.tipo, labels)}
                    {dia && !empiezaEn(r, dia, periodicas) && (
                      // No empezó hoy: viene corriendo de un periodo anterior.
                      <span
                        title={`Viene del periodo que empezó el ${r.fecha_inicio ?? r.fecha}`}
                        className="whitespace-nowrap rounded-full bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] font-medium text-gray-500"
                      >
                        continúa
                      </span>
                    )}
                    {r.origen === "automatico" && (
                      // Lo escribió Gestivo, no una persona: hay que decir que
                      // es así, porque a diferencia de todo lo demás en este
                      // módulo nadie lo decidió todavía.
                      <span
                        title={
                          "Lo registró Gestivo automáticamente porque no tuvo despacho ni huella" +
                          " ese día. No cuenta como falta: queda por clasificar." +
                          (r.created_by_email ? `\nFirmado: ${r.created_by_email}` : "")
                        }
                        className="whitespace-nowrap rounded-full bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-medium text-[#4F46E5]"
                      >
                        automático
                      </span>
                    )}
                    {r.tipo !== r.tipo_inicial && (
                      // Marca discreta de reclasificación. El concepto inicial
                      // no se edita: lo sella la base para validarlo después.
                      <span
                        title={
                          `Inicialmente: ${labels[r.tipo_inicial] ?? r.tipo_inicial}` +
                          (r.motivo_modificacion ? `\nMotivo: ${r.motivo_modificacion}` : "") +
                          (r.modificado_por_email ? `\nPor: ${r.modificado_por_email}` : "")
                        }
                        className="inline-flex text-amber-500"
                      >
                        <History className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                  {r.contacto && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      {CONTACTO_LABEL[r.contacto] ?? r.contacto}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600">
                  {r.fecha_inicio
                    ? `${r.fecha_inicio} → ${r.fecha_fin ?? "…"}`
                    : "—"}
                  {dia &&
                    (() => {
                      const pos = posicionEnPeriodo(r, dia, periodicas);
                      return pos ? (
                        <p className="text-gray-500">
                          día {pos.dia} de {pos.total}
                        </p>
                      ) : null;
                    })()}
                </td>
                {/* Recortada a tres líneas; el texto completo va en el título y en la edición. */}
                <td className="max-w-80 px-4 py-2 text-xs text-gray-600">
                  {r.justificacion ? (
                    <p className="line-clamp-3 whitespace-pre-line" title={r.justificacion}>{r.justificacion}</p>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600">
                  {r.incapacidad_inicio ? `${r.incapacidad_inicio} → ${r.incapacidad_fin ?? "…"}` : "—"}
                  {r.reintegro && <p className="text-gray-500">Reintegro {r.reintegro}</p>}
                </td>
                <td className="px-4 py-2">
                  {r.soporte === "pendiente" ? (
                    <span className="inline-flex whitespace-nowrap rounded-full bg-[#FEE2E2] px-2 py-0.5 text-xs font-medium text-[#DC2626]">
                      {SOPORTE_LABEL.pendiente}
                    </span>
                  ) : r.soporte === "presentado" ? (
                    <span className="inline-flex whitespace-nowrap rounded-full bg-[#D1FAE5] px-2 py-0.5 text-xs font-medium text-[#059669]">
                      {SOPORTE_LABEL.presentado}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                  {r.soporte_observaciones && (
                    <p
                      className="mt-0.5 max-w-48 truncate text-xs text-gray-500"
                      title={r.soporte_observaciones}
                    >
                      {r.soporte_observaciones}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    {puede("ausentismo.editar") && (
                      <button
                        onClick={() => onEditar(r)}
                        disabled={pending}
                        title="Editar (queda en la bitácora)"
                        className="rounded-lg border border-[#E2E8F0] p-1.5 text-gray-500 hover:bg-[#F8FAFC] disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {puede("ausentismo.eliminar") && (
                      <button
                        onClick={() => eliminar(r)}
                        disabled={pending}
                        title="Eliminar (queda en la bitácora)"
                        className="rounded-lg border border-[#FECACA] p-1.5 text-red-500 hover:bg-[#FEF2F2] disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {registros.length === 0 && (
              <tr>
                <td
                  colSpan={conFecha ? 9 : 8}
                  className="px-4 py-8 text-center text-sm text-gray-500"
                >
                  {vacio}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Paginador p={p} unidad="registros" ancla={ancla} />
    </div>
  );
}

