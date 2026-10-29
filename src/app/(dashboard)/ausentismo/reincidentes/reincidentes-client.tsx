"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paginador, usePaginacion } from "@/components/shared/paginacion";
import {
  BellRing, Check, ChevronDown, ChevronRight, ClipboardList, FileX2, Gavel, Loader2, Phone, Search, Settings2,
  ShieldAlert, TriangleAlert, Undo2, UserX, X,
} from "lucide-react";
import {
  MINIMOS_REINCIDENCIA, VENTANAS_REINCIDENCIA,
  NIVELES_ALERTA, NIVEL_ALERTA_LABEL, NIVEL_ALERTA_COLOR, SOPORTE_LABEL,
  CONCEPTO_EPS, CONCEPTO_INCAPACIDAD, CONCEPTO_NO_JUSTIFICADA,
  accionesNivel, conteoPorNivel, criteriosReincidencia, etiquetaVehiculo, nivelesRequeridos, rangoVentana,
  type Concepto, type DiasNotificacion, type NivelAlerta, type NivelNotificable,
} from "@/lib/ausentismo/constants";
import type { ParametrosReincidencia, Reincidente } from "@/lib/ausentismo/data";
import {
  exportarReincidentes, filtrarReincidentes, textoRacha, categoriaLabel, queSeMideTexto,
  type FiltrosReincidentesUI,
} from "@/lib/ausentismo/exportar";
import {
  VENTANA_RANGO, categoriasReincidencia, errorRangoReincidentes, etiquetaRangoReincidentes, textoRangoReincidentes,
} from "@/lib/ausentismo/reincidentes-filtros";
import { actualizarParametrosReincidencia, anularNotificacion, marcarNotificacion } from "../actions";
import { BotonesExportar } from "../botones-exportar";
import { HistoricoClient } from "./historico-client";
import { EtiquetaSeguimiento, SeguimientoDialog } from "./seguimiento-dialog";

export type { FiltrosReincidentesUI };

const inputCls =
  "h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";

const ICONO_NIVEL: Record<NivelAlerta, React.ComponentType<{ className?: string }>> = {
  terminacion: FileX2,
  descargos: Gavel,
  critica: ShieldAlert,
  alta: TriangleAlert,
};

/** Chip del nivel con su color; `accion` añade debajo qué debe hacer RRHH. */
export function ChipNivel({ nivel, accion = false, dias }: {
  nivel: NivelAlerta | null;
  accion?: boolean;
  /** Días vigentes para el texto de la acción. */
  dias?: DiasNotificacion;
}) {
  if (!nivel) return <span className="text-xs text-gray-400">Sin alerta</span>;
  const Icono = ICONO_NIVEL[nivel];
  const color = NIVEL_ALERTA_COLOR[nivel];
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-white"
        style={{ backgroundColor: color.fuerte }}
      >
        <Icono className="h-3 w-3" />
        {NIVEL_ALERTA_LABEL[nivel]}
      </span>
      {accion && (
        <span className="text-[11px] leading-tight" style={{ color: color.texto }}>
          {accionesNivel(dias)[nivel]}
        </span>
      )}
    </span>
  );
}

/**
 * Reincidentes con alerta escalonada: la regla base (N+ ausencias en la
 * ventana o soportes pendientes, sin los conceptos programados), la
 * categoría por la que se mide (todas, citas EPS, incapacidades o no
 * justificadas) y cuatro niveles de alerta por faltas sin justificar, cada
 * uno con su color: alta, crítica, citación a descargos y
 * terminación de contrato; los días de estas dos los configura RRHH aquí
 * mismo. La tabla se agrupa por nivel para que el informe se lea por
 * segmentos. Ventana, mínimo, categoría y corte vienen del servidor; el
 * criterio y la búsqueda se aplican aquí.
 */
export function ReincidentesClient({ hoy, filtros, reincidentes, labels, conceptos, parametros, puedeEditar, onAplicar }: {
  hoy: string;
  filtros: FiltrosReincidentesUI;
  reincidentes: Reincidente[];
  labels: Record<string, string>;
  conceptos: Concepto[];
  parametros: ParametrosReincidencia;
  puedeEditar: boolean;
  onAplicar: (f: Record<string, string>) => void;
}) {
  const dias = parametros.dias;
  const acciones = accionesNivel(dias);
  const [configurando, setConfigurando] = useState(false);
  const [f, setF] = useState(filtros);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  // Conductor cuyo diálogo de seguimiento está abierto.
  const [seguimientoDe, setSeguimientoDe] = useState<Reincidente | null>(null);
  const set = (k: keyof FiltrosReincidentesUI) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  // La ventana es un atajo: llena Desde a partir de Hasta. Editar Desde a mano
  // la deja en "Personalizado".
  const setVentana = (ventana: string) => setF((p) =>
    ventana === VENTANA_RANGO ? { ...p, ventana } : { ...p, ventana, desde: rangoVentana(p.corte, ventana).desde });
  const setCorte = (corte: string) => setF((p) =>
    p.ventana === VENTANA_RANGO || !corte ? { ...p, corte } : { ...p, corte, desde: rangoVentana(corte, p.ventana).desde });
  const setDesde = (desde: string) => setF((p) => ({ ...p, desde, ventana: VENTANA_RANGO }));

  function aplicar() {
    const error = errorRangoReincidentes(f.desde, f.corte, hoy);
    if (error) {
      toast.error(error);
      return;
    }
    onAplicar({
      tab: "reincidentes", desde: f.desde, corte: f.corte, categoria: f.categoria, ventana: f.ventana,
      minimo: f.minimo, criterio: f.criterio, ret: f.retirados, q: f.q,
    });
  }

  // La búsqueda de persona filtra mientras se escribe (la lista ya está en
  // pantalla); el criterio es el aplicado. "Aplicar" guarda la búsqueda en la URL.
  const visibles = useMemo(
    () => filtrarReincidentes(reincidentes, { criterio: filtros.criterio, q: f.q }),
    [reincidentes, filtros.criterio, f.q]
  );
  const tipos = useMemo(() => categoriasReincidencia(conceptos), [conceptos]);
  const conteos = useMemo(() => conteoPorNivel(reincidentes), [reincidentes]);
  const conSoporte = useMemo(() => reincidentes.filter((r) => r.soportesPendientes > 0).length, [reincidentes]);
  const sinNotificar = useMemo(() => reincidentes.filter((r) => r.pendientes.length > 0).length, [reincidentes]);
  const retiradosListados = useMemo(() => reincidentes.filter((r) => r.retirado).length, [reincidentes]);
  const sinSeguimiento = useMemo(() => reincidentes.filter((r) => !r.seguimiento.ultimo).length, [reincidentes]);
  const ventanaTxt = textoRangoReincidentes(filtros);
  const noCuentan = conceptos.filter((c) => !c.cuenta_reincidencia).map((c) => c.nombre.toLowerCase()).join(", ") || "ninguno";
  const categoria = filtros.categoria;
  const queSeMide = queSeMideTexto(categoria, labels);

  // Filas agrupadas por nivel, en orden de gravedad; "Sin alerta" al final.
  const grupos = useMemo(() => {
    const orden: (NivelAlerta | null)[] = [...NIVELES_ALERTA, null];
    return orden
      .map((n) => ({ nivel: n, filas: visibles.filter((r) => r.alerta === n) }))
      .filter((g) => g.filas.length > 0);
  }, [visibles]);

  // Paginación sobre la lista ya ordenada por nivel; cada página se vuelve a
  // agrupar y la cabecera del segmento conserva el total del nivel.
  const ordenadas = useMemo(() => grupos.flatMap((g) => g.filas), [grupos]);
  const p = usePaginacion(ordenadas, { reiniciar: `${JSON.stringify(filtros)}|${f.q}` });
  const ancla = useRef<HTMLDivElement>(null);
  const enPagina = new Set(p.filas.map((r) => r.cedula));
  const gruposPagina = grupos
    .map((g) => ({ ...g, total: g.filas.length, filas: g.filas.filter((r) => enPagina.has(r.cedula)) }))
    .filter((g) => g.filas.length > 0);

  function alternar(cedula: string) {
    setAbiertos((p) => {
      const s = new Set(p);
      if (s.has(cedula)) s.delete(cedula); else s.add(cedula);
      return s;
    });
  }

  const campo = (label: string, el: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm text-gray-600">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {el}
    </label>
  );

  // Los chips de nivel cambian solo el criterio; el resto del filtro se
  // conserva (con `retirados` traducido al parámetro `ret` de la URL).
  const irCriterio = (criterio: string) => onAplicar({
    tab: "reincidentes", desde: filtros.desde, corte: filtros.corte, categoria: filtros.categoria, ventana: filtros.ventana,
    minimo: filtros.minimo, ret: filtros.retirados, q: f.q, criterio,
  });
  const resaltar = (col: string) => (categoria === col ? "bg-[#EEF2FF]" : "");
  const COLS = 13;

  return (
    <>
      <div className="space-y-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-xs text-[#92400E]">
        <p className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {categoria ? (
              <>
                Solo conductores con {filtros.minimo}+ {queSeMide} en {ventanaTxt}; el detalle muestra solo ese tipo.
                {categoria === CONCEPTO_NO_JUSTIFICADA &&
                  ` También entra quien lleve ${dias.descargos} o más días seguidos sin justificar o dos o más faltas no justificadas.`}
              </>
            ) : (
              <>
                Conductores con {filtros.minimo}+ ausencias en {ventanaTxt} o con soportes pendientes por entregar. Quien
                lleve {dias.descargos} o más días seguidos sin justificar, o dos o más faltas no justificadas, entra siempre.
              </>
            )}{" "}
            No cuentan los conceptos
            programados del catálogo ({noCuentan}). Se calcula del propio registro. Las notificaciones de descargos y
            terminación se marcan como hechas en la fila del conductor y quedan con fecha y quién las marcó.{" "}
            {filtros.retirados === "1"
              ? "Está incluyendo a los conductores retirados del maestro, marcados en la fila."
              : "Los conductores retirados en el maestro no se listan ni cuentan para la alerta; para verlos, marque \"Incluir retirados\"."}
          </span>
        </p>
        <ul className="ml-5 grid gap-1 sm:grid-cols-2">
          {NIVELES_ALERTA.map((n) => (
            <li key={n} className="flex items-center gap-2">
              <ChipNivel nivel={n} />
              <span style={{ color: NIVEL_ALERTA_COLOR[n].texto }}>{acciones[n]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#E2E8F0] bg-white p-4">
        {campo("Desde", <input type="date" value={f.desde} max={f.corte || hoy} onChange={(e) => setDesde(e.target.value)} className={inputCls} />)}
        {campo("Hasta", <input type="date" value={f.corte} min={f.desde} max={hoy} onChange={(e) => setCorte(e.target.value)} className={inputCls} />)}
        {campo("Tipo de ausencia", (
          <select value={f.categoria} onChange={(e) => set("categoria")(e.target.value)} className={inputCls}>
            {tipos.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        ))}
        {campo("Periodo", (
          <select value={f.ventana} onChange={(e) => setVentana(e.target.value)} className={inputCls}>
            {VENTANAS_REINCIDENCIA.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            <option value={VENTANA_RANGO}>Personalizado</option>
          </select>
        ))}
        {campo("Mínimo", (
          <select value={f.minimo} onChange={(e) => set("minimo")(e.target.value)} className={inputCls}>
            {MINIMOS_REINCIDENCIA.map((m) => <option key={m} value={String(m)}>{m} o más</option>)}
          </select>
        ))}
        {campo("Tipo de reincidencia", (
          <div className="flex items-center gap-1">
            <select value={f.criterio} onChange={(e) => set("criterio")(e.target.value)} className={inputCls}>
              {criteriosReincidencia(dias).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setConfigurando((v) => !v)}
              aria-expanded={configurando}
              title="Configurar los días de descargos y terminación"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border ${
                configurando ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4338CA]" : "border-[#E2E8F0] bg-white text-gray-500 hover:text-gray-700"
              }`}
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {campo("Persona", (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={f.q}
              onChange={(e) => set("q")(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aplicar()}
              placeholder="Nombre, cédula o código"
              className={`${inputCls} w-60 pl-8 pr-7`}
            />
            {f.q && (
              <button
                type="button"
                onClick={() => set("q")("")}
                title="Limpiar búsqueda"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        <label
          className="flex h-9 items-center gap-2 text-sm text-gray-600"
          title="Los retirados del maestro no se listan ni cuentan para la alerta; márquelo para revisarlos"
        >
          <input
            type="checkbox"
            checked={f.retirados === "1"}
            onChange={(e) => set("retirados")(e.target.checked ? "1" : "")}
            className="h-4 w-4 rounded border-[#CBD5E1]"
          />
          Incluir retirados
        </label>
        <button
          onClick={aplicar}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA]"
        >
          <Search className="h-4 w-4" /> Aplicar
        </button>
      </div>

      {configurando && (
        <ConfigurarDias parametros={parametros} puedeEditar={puedeEditar} onDone={() => setConfigurando(false)} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span>
            {visibles.length} de {reincidentes.length} reincidente{reincidentes.length === 1 ? "" : "s"}
            {categoria && <span className="text-gray-400"> · {categoriaLabel(categoria, labels)}</span>}
          </span>
          {NIVELES_ALERTA.map((n) => (
            <button
              key={n}
              onClick={() => irCriterio(n)}
              title={acciones[n]}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${conteos[n] > 0 ? "text-white" : "bg-[#F1F5F9] text-gray-500"}`}
              style={conteos[n] > 0 ? { backgroundColor: NIVEL_ALERTA_COLOR[n].fuerte } : undefined}
            >
              {conteos[n]} {NIVEL_ALERTA_LABEL[n].toLowerCase()}{conteos[n] === 1 || n === "terminacion" || n === "descargos" ? "" : "s"}
            </button>
          ))}
          <button
            onClick={() => irCriterio("sin_notificar")}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
              sinNotificar > 0 ? "border border-[#7C3AED] bg-white text-[#5B21B6]" : "bg-[#F1F5F9] text-gray-500"
            }`}
          >
            <BellRing className="h-3 w-3" /> {sinNotificar} pendiente{sinNotificar === 1 ? "" : "s"} de notificar
          </button>
          <button onClick={() => irCriterio("soportes")} className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-gray-600">
            {conSoporte} con soporte pendiente
          </button>
          <span
            className="inline-flex items-center gap-1 rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-gray-600"
            title="Reincidentes a los que RRHH aún no les ha registrado un seguimiento"
          >
            <ClipboardList className="h-3 w-3" /> {sinSeguimiento} sin seguimiento
          </span>
          {retiradosListados > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-[#E5E7EB] px-2.5 py-1 text-xs font-semibold text-gray-700"
              title="Van incluidos porque marcó “Incluir retirados”"
            >
              <UserX className="h-3 w-3" /> {retiradosListados} retirado{retiradosListados === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <BotonesExportar
          formatos={["pdf", "xlsx", "csv"]}
          sinDatos={visibles.length === 0}
          onExportar={(formato) => exportarReincidentes({ formato, filtros: { ...filtros, q: f.q }, reincidentes: visibles, labels, conceptos, dias })}
        />
      </div>

      <div ref={ancla} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2">Alerta</th>
                <th className="px-3 py-2">Seguimiento</th>
                <th className="px-3 py-2">Conductor</th>
                <th className="px-3 py-2">Teléfono</th>
                <th className="px-3 py-2 text-right">Ausencias ({filtros.ventana === VENTANA_RANGO ? "rango" : etiquetaRangoReincidentes(filtros)})</th>
                <th className={`px-3 py-2 text-right ${resaltar(CONCEPTO_NO_JUSTIFICADA)}`}>No justificadas</th>
                <th className="px-3 py-2">Seguidos sin justificar</th>
                <th className={`px-3 py-2 text-right ${resaltar(CONCEPTO_EPS)}`}>Citas EPS</th>
                <th className={`px-3 py-2 text-right ${resaltar(CONCEPTO_INCAPACIDAD)}`}>Incapacidades</th>
                <th className="px-3 py-2 text-right">Soportes pendientes</th>
                <th className="px-3 py-2">Detalle</th>
                <th className="px-3 py-2">Última</th>
              </tr>
            </thead>
            <tbody>
              {gruposPagina.map((g) => (
                <Fragment key={g.nivel ?? "sin"}>
                  {/* Cabecera del segmento: solo cuando hay más de un nivel en pantalla. */}
                  {grupos.length > 1 && (
                    <tr>
                      <td
                        colSpan={COLS}
                        className="border-y border-[#E2E8F0] px-3 py-1.5 text-xs font-semibold"
                        style={{
                          backgroundColor: g.nivel ? NIVEL_ALERTA_COLOR[g.nivel].suave : "#F8FAFC",
                          color: g.nivel ? NIVEL_ALERTA_COLOR[g.nivel].texto : "#64748B",
                        }}
                      >
                        {g.nivel ? `${NIVEL_ALERTA_LABEL[g.nivel]} · ${acciones[g.nivel]}` : "Sin alerta · todas las ausencias justificadas"}
                        {" "}({g.total})
                      </td>
                    </tr>
                  )}
                  {g.filas.map((r) => {
                    const abierto = abiertos.has(r.cedula);
                    const racha = textoRacha(r);
                    return (
                      <Fragment key={r.cedula}>
                        <tr
                          className="border-b border-[#F1F5F9]"
                          style={r.alerta ? { backgroundColor: NIVEL_ALERTA_COLOR[r.alerta].suave } : undefined}
                        >
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => alternar(r.cedula)}
                              aria-expanded={abierto}
                              title={abierto ? "Ocultar ausencias" : "Ver ausencias"}
                              className="rounded p-1 text-gray-500 hover:bg-white"
                            >
                              {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <ChipNivel nivel={r.alerta} accion={r.alerta === "descargos" || r.alerta === "terminacion"} dias={dias} />
                            {r.racha.dias >= dias.descargos && <Notificaciones r={r} hoy={hoy} dias={dias} />}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col items-start gap-1.5">
                              <EtiquetaSeguimiento ultimo={r.seguimiento.ultimo} total={r.seguimiento.total} hoy={hoy} />
                              <button
                                type="button"
                                onClick={() => setSeguimientoDe(r)}
                                className="inline-flex items-center gap-1 rounded-md border border-[#C7D2FE] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#4338CA] hover:bg-[#EEF2FF]"
                              >
                                <ClipboardList className="h-3 w-3" /> Seguimiento
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-900">{r.codigo ? `${r.codigo} · ` : ""}{r.nombre}</p>
                            <p className="text-xs text-gray-500">
                              CC {r.cedula}
                              {r.retirado && (
                                <span
                                  className="ml-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#E5E7EB] px-1.5 py-0.5 text-[11px] font-semibold text-gray-700"
                                  title="Retirado en el maestro de conductores: no se le hace seguimiento"
                                >
                                  <UserX className="h-3 w-3" />
                                  Retirado{r.fechaRetiro ? ` ${r.fechaRetiro}` : ""}
                                </span>
                              )}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {r.telefono ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" /> {r.telefono}</span> : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">{r.total}</td>
                          <td className={`px-3 py-2 text-right ${r.noJustificadas > 0 ? "font-semibold text-red-700" : ""}`}>{r.noJustificadas}</td>
                          <td className="px-3 py-2 text-xs">
                            {racha ? (
                              <span
                                className={r.racha.dias >= dias.descargos ? "font-semibold" : "text-gray-600"}
                                style={r.racha.dias >= dias.descargos && r.alerta ? { color: NIVEL_ALERTA_COLOR[r.alerta].texto } : undefined}
                              >
                                {racha}
                                {r.racha.dias >= dias.terminacion ? " · terminación" : r.racha.dias >= dias.descargos ? " · descargos" : ""}
                              </span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className={`px-3 py-2 text-right ${r.eps > 0 ? "font-medium text-[#4338CA]" : "text-gray-400"}`}>{r.eps}</td>
                          <td className={`px-3 py-2 text-right ${r.incapacidades > 0 ? "font-medium text-[#DC2626]" : "text-gray-400"}`}>
                            {r.incapacidades}
                            {r.incapacidades > 0 && <span className="ml-1 text-xs font-normal text-gray-500">({r.diasIncapacidad} d)</span>}
                          </td>
                          <td className={`px-3 py-2 text-right ${r.soportesPendientes > 0 ? "font-semibold text-amber-700" : ""}`}>{r.soportesPendientes}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {Object.entries(r.tipos).map(([t, n]) => `${labels[t] ?? t}: ${n}`).join(" · ")}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{r.ultimaFecha}</td>
                        </tr>
                        {abierto && (
                          <tr className="border-b border-[#F1F5F9] bg-[#F8FAFC]">
                            <td />
                            <td colSpan={COLS - 1} className="px-3 py-2">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left uppercase tracking-wide text-gray-400">
                                    <th className="py-1 pr-3">Fecha</th>
                                    <th className="py-1 pr-3">Concepto</th>
                                    <th className="py-1 pr-3">Periodo</th>
                                    <th className="py-1 pr-3">Incapacidad</th>
                                    <th className="py-1 pr-3">Vehículo</th>
                                    <th className="py-1 pr-3">Soporte</th>
                                    <th className="py-1">Justificación</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.ausencias.map((a) => (
                                    <tr key={a.id} className="border-t border-[#E2E8F0] text-gray-700">
                                      <td className="py-1 pr-3 font-medium">{a.fecha}</td>
                                      <td className={`py-1 pr-3 ${a.noJustificada ? "font-semibold text-red-700" : ""}`}>{labels[a.tipo] ?? a.tipo}{a.cuenta ? "" : " (programado)"}</td>
                                      <td className="py-1 pr-3">{a.fecha_inicio ? `${a.fecha_inicio} a ${a.fecha_fin ?? "sin fin"}` : "—"}</td>
                                      <td className="py-1 pr-3">{a.incapacidad_inicio ? `${a.incapacidad_inicio} a ${a.incapacidad_fin ?? "sin fin"}` : "—"}</td>
                                      <td className="py-1 pr-3">{a.codigo_vehiculo ? etiquetaVehiculo({ codigo: a.codigo_vehiculo, placa: a.placa }) : "—"}</td>
                                      <td className={`py-1 pr-3 ${a.soporte === "pendiente" ? "font-semibold text-amber-700" : ""}`}>{a.soporte === "no_aplica" ? "—" : SOPORTE_LABEL[a.soporte] ?? a.soporte}</td>
                                      <td className="py-1">{a.justificacion || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={COLS} className="px-4 py-8 text-center text-sm text-gray-500">
                    {reincidentes.length === 0
                      ? `Sin reincidentes por ${queSeMide} en ${ventanaTxt}.`
                      : f.q
                        ? `Nadie que coincida con «${f.q}» es reincidente en ${ventanaTxt} con estos filtros. Pruebe un periodo más largo o «Todas las ausencias».`
                        : "Ningún reincidente cumple el criterio."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Paginador p={p} unidad="conductores" ancla={ancla} />
      </div>

      <HistoricoClient
        corte={filtros.corte}
        desde={filtros.ventana === VENTANA_RANGO ? filtros.desde : undefined}
        labels={labels}
      />
      {seguimientoDe && <SeguimientoDialog r={seguimientoDe} hoy={hoy} onClose={() => setSeguimientoDe(null)} />}
    </>
  );
}

/**
 * Días seguidos sin justificar que piden cada notificación. Es un parámetro
 * global (no un filtro): al guardarlo cambian la alerta, la lista, las
 * notificaciones pendientes y los informes para todos.
 */
function ConfigurarDias({ parametros, puedeEditar, onDone }: {
  parametros: ParametrosReincidencia;
  puedeEditar: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [descargos, setDescargos] = useState(String(parametros.dias.descargos));
  const [terminacion, setTerminacion] = useState(String(parametros.dias.terminacion));
  const [pending, start] = useTransition();

  function guardar() {
    start(async () => {
      const res = await actualizarParametrosReincidencia({
        diasDescargos: Number(descargos), diasTerminacion: Number(terminacion),
      });
      if (!res.success) {
        toast.error(res.error ?? "No se pudieron guardar los días");
        return;
      }
      toast.success("Días guardados. Las alertas y notificaciones se recalculan con la nueva regla.");
      onDone();
      router.refresh();
    });
  }

  const labelCls = "text-xs font-medium uppercase tracking-wide text-gray-500";
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#C7D2FE] bg-[#EEF2FF]/50 p-4">
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Días seguidos para citación a descargos</span>
        <input
          type="number" min={1} max={60} value={descargos} disabled={!puedeEditar}
          onChange={(e) => setDescargos(e.target.value)} className={`${inputCls} w-28`}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Días seguidos para terminación de contrato</span>
        <input
          type="number" min={2} max={60} value={terminacion} disabled={!puedeEditar}
          onChange={(e) => setTerminacion(e.target.value)} className={`${inputCls} w-28`}
        />
      </label>
      {puedeEditar && (
        <button
          onClick={guardar}
          disabled={pending}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
        </button>
      )}
      <p className="basis-full text-[11px] text-gray-500">
        Días calendario seguidos sin justificar. La terminación debe pedir más días que los descargos. Aplica a todos los
        usuarios (alerta, aviso del día, notificaciones e informes) y el cambio queda en la auditoría.
        {parametros.updatedByEmail ? ` Última modificación: ${parametros.updatedByEmail}.` : ""}
        {!puedeEditar ? " Solo quien puede editar Ausentismo puede cambiarlos." : ""}
      </p>
    </div>
  );
}

/**
 * Marca de "ya notificado" por nivel para un conductor cuya racha llegó a los
 * días de descargos. Cada nivel que la racha exige muestra su estado: la
 * marca (fecha, quién y observación) con opción de anular con motivo, o el
 * botón para marcarla, que despliega fecha y observación.
 */
function Notificaciones({ r, hoy, dias }: { r: Reincidente; hoy: string; dias: DiasNotificacion }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [abierto, setAbierto] = useState<NivelNotificable | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [obs, setObs] = useState("");
  const [anulando, setAnulando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const requeridos = nivelesRequeridos(r.racha.dias, dias);

  function marcar(nivel: NivelNotificable) {
    if (!r.racha.desde || !r.racha.hasta) return;
    if (!fecha) {
      toast.error("Indica la fecha de la notificación.");
      return;
    }
    start(async () => {
      const res = await marcarNotificacion({
        cedula: r.cedula, codigo: r.codigo, nombre: r.nombre, nivel,
        rachaDesde: r.racha.desde!, rachaHasta: r.racha.hasta!, dias: r.racha.dias,
        notificadoEn: fecha, observaciones: obs || null,
      });
      if (!res.success) {
        toast.error(res.error ?? "No se pudo marcar la notificación");
        return;
      }
      toast.success(res.existente
        ? `Ya estaba marcada: ${NIVEL_ALERTA_LABEL[nivel].toLowerCase()} notificado el ${res.notificacion?.notificado_en}`
        : `${NIVEL_ALERTA_LABEL[nivel]} marcado como notificado a ${r.nombre}`);
      setAbierto(null);
      setObs("");
      router.refresh();
    });
  }

  function anular(id: string) {
    if (!motivo.trim()) {
      toast.error("Indica el motivo de la anulación.");
      return;
    }
    start(async () => {
      const res = await anularNotificacion(id, motivo);
      if (!res.success) {
        toast.error(res.error ?? "No se pudo anular");
        return;
      }
      toast.success("Notificación anulada; la marca queda como rastro");
      setAnulando(null);
      setMotivo("");
      router.refresh();
    });
  }

  const inputMini =
    "h-7 rounded border border-[#E2E8F0] bg-white px-1.5 text-xs text-gray-800 outline-none focus:border-[#4F46E5]";

  return (
    <div className="mt-1.5 space-y-1">
      {requeridos.map((nivel) => {
        const n = r.notificaciones[nivel];
        const color = NIVEL_ALERTA_COLOR[nivel];
        if (n) {
          return (
            <div key={nivel} className="text-[11px] leading-tight">
              <span className="inline-flex items-center gap-1 font-medium" style={{ color: color.texto }}>
                <Check className="h-3 w-3" /> {NIVEL_ALERTA_LABEL[nivel]} notificado el {n.notificado_en}
              </span>
              <span className="block text-gray-500" title={n.observaciones ?? undefined}>
                {n.created_by_email ? `por ${n.created_by_email}` : ""}
                {n.observaciones ? ` · ${n.observaciones}` : ""}
              </span>
              {anulando === n.id ? (
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  <input
                    type="text" value={motivo} autoFocus maxLength={200}
                    onChange={(e) => setMotivo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && anular(n.id)}
                    placeholder="Motivo de la anulación"
                    className={`${inputMini} w-44`}
                  />
                  <button type="button" onClick={() => anular(n.id)} disabled={pending} title="Anular" className="rounded p-1 text-red-600 hover:bg-white disabled:opacity-50">
                    {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button type="button" onClick={() => { setAnulando(null); setMotivo(""); }} title="Cancelar" className="rounded p-1 text-gray-500 hover:bg-white">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setAnulando(n.id)}
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-gray-500 underline-offset-2 hover:underline"
                >
                  <Undo2 className="h-3 w-3" /> anular
                </button>
              )}
            </div>
          );
        }
        if (abierto === nivel) {
          return (
            <div key={nivel} className="rounded-lg border border-dashed bg-white/80 p-2" style={{ borderColor: color.fuerte }}>
              <p className="mb-1 text-[11px] font-semibold" style={{ color: color.texto }}>
                Marcar {NIVEL_ALERTA_LABEL[nivel].toLowerCase()} como notificado
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={inputMini} title="Fecha de la notificación" />
                <input
                  type="text" value={obs} maxLength={300}
                  onChange={(e) => setObs(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && marcar(nivel)}
                  placeholder="Medio, acta, observación (opcional)"
                  className={`${inputMini} w-48`}
                />
                <button
                  type="button" onClick={() => marcar(nivel)} disabled={pending}
                  className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: color.fuerte }}
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
                </button>
                <button type="button" onClick={() => setAbierto(null)} title="Cancelar" className="rounded p-1 text-gray-500 hover:bg-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        }
        return (
          <button
            key={nivel}
            type="button"
            onClick={() => { setAbierto(nivel); setFecha(hoy); }}
            className="inline-flex items-center gap-1 rounded-md border bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-white/60"
            style={{ borderColor: color.fuerte, color: color.texto }}
          >
            <BellRing className="h-3 w-3" /> Marcar {NIVEL_ALERTA_LABEL[nivel].toLowerCase()} notificado
          </button>
        );
      })}
    </div>
  );
}
