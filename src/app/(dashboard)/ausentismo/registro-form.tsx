"use client";

/**
 * Alta y edición de un registro de ausentismo.
 *
 * Vivía dentro de `ausentismo-client.tsx`; se extrajo para que la pantalla de
 * Marcaciones pueda abrir el MISMO formulario con el conductor y la fecha ya
 * puestos (prop `inicial`). Es importante que sea el mismo y no un alta aparte:
 * así se aplican igual las validaciones de `crearRegistro` —duplicado del día,
 * periodos de vacaciones abiertos y concepto activo— sin duplicarlas.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { Search, Plus, X, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CONTACTOS, SOPORTES,
  CONCEPTO_DEFECTO, CONCEPTO_INCAPACIDAD, CONCEPTO_NO_JUSTIFICADA,
  DIAS_DESCARGOS, DIAS_TERMINACION,
  conceptoLabels, etiquetaVehiculo, diasEntre, sumarDias,
  type AusentismoRegistro, type VehiculoOpcion, type Concepto,
} from "@/lib/ausentismo/constants";
import {
  crearRegistro, actualizarRegistro, crearConcepto, periodosDelConductor,
  type RegistroInput, type Estorbos,
} from "./actions";
import {
  corta, describirPeriodo, finDesdeReintegro, reintegroDesdeFin,
} from "@/lib/ausentismo/periodos";

type ConductorBusqueda = {
  cedula: string;
  nombre: string;
  codigo: string | null;
  estado: string | null;
};

/** Valor del selector que abre el bloque de alta de concepto. */
const OPCION_NUEVO = "__nuevo__";

/** Alto y borde de los campos. Lo comparte `ausentismo-client.tsx`. */
export const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]";

/** Conductor y concepto con que se abre el formulario desde otra pantalla. */
export interface RegistroInicial {
  cedula: string;
  codigo: string | null;
  nombre: string;
  /** Concepto preseleccionado; sigue siendo cambiable. */
  tipo?: string;
}

/** Alta y edición de un registro. Con `registro` es edición. */
export function RegistroForm({
  fecha, hoy, registro, vehiculos, conceptos, puedeEditar, inicial, onConceptoCreado, onDone,
}: {
  fecha: string;
  hoy: string;
  registro: AusentismoRegistro | null;
  vehiculos: VehiculoOpcion[];
  conceptos: Concepto[];
  puedeEditar: boolean;
  /**
   * Conductor y concepto con que se abre desde la pantalla de Marcaciones.
   * Solo aplica al CREAR: en una edición manda el registro.
   */
  inicial?: RegistroInicial | null;
  onConceptoCreado: (c: Concepto) => void;
  onDone: () => void;
}) {
  const [f, setF] = useState(registro?.fecha ?? fecha);
  // Alta de concepto en línea (opción "Agregar concepto nuevo…").
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCuenta, setNuevoCuenta] = useState(true);
  const [nuevoExige, setNuevoExige] = useState(false);
  const [nuevoRango, setNuevoRango] = useState(false);
  const [creando, startCrear] = useTransition();
  // Solo al editar: por qué se modifica el registro.
  const [motivo, setMotivo] = useState("");
  // Rango del reporte: por defecto empieza el día que se registra.
  const [fechaInicio, setFechaInicio] = useState(
    registro?.fecha_inicio ?? registro?.fecha ?? fecha
  );
  const [fechaFin, setFechaFin] = useState(registro?.fecha_fin ?? "");
  // Al abrir desde Marcaciones no se pasa por `elegirConductor`, así que el
  // vehículo del maestro se preselecciona aquí (editable, por si iba en otro).
  const [codigoVehiculo, setCodigoVehiculo] = useState(
    registro?.codigo_vehiculo ??
      (inicial
        ? (vehiculos.find((v) => v.cedula_conductor === inicial.cedula)?.codigo ?? "")
        : "")
  );
  const [soporteObs, setSoporteObs] = useState(registro?.soporte_observaciones ?? "");
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<ConductorBusqueda[]>([]);
  const [conductor, setConductor] = useState<{
    cedula: string;
    codigo: string | null;
    nombre: string;
  } | null>(
    registro
      ? { cedula: registro.cedula, codigo: registro.codigo, nombre: registro.nombre }
      : inicial
        ? { cedula: inicial.cedula, codigo: inicial.codigo, nombre: inicial.nombre }
        : null
  );
  const [tipo, setTipo] = useState(registro?.tipo ?? inicial?.tipo ?? CONCEPTO_DEFECTO);
  const [contacto, setContacto] = useState(registro?.contacto ?? "");
  const [justificacion, setJustificacion] = useState(registro?.justificacion ?? "");
  const [incIni, setIncIni] = useState(registro?.incapacidad_inicio ?? "");
  const [incFin, setIncFin] = useState(registro?.incapacidad_fin ?? "");
  // En unas vacaciones ya guardadas el reintegro se precarga desde su rango
  // (fin + 1 día), para que editar otro campo no lo mueva: los registros viejos
  // de un solo día siguen siendo de un día.
  const [reintegro, setReintegro] = useState(() => {
    const periodico = registro && conceptos.some((c) => c.key === registro.tipo && c.cubre_rango);
    if (periodico) {
      return reintegroDesdeFin(registro.fecha_inicio ?? registro.fecha, registro.fecha_fin);
    }
    return registro?.reintegro ?? "";
  });
  const [soporte, setSoporte] = useState(registro?.soporte ?? "no_aplica");
  const [telefono, setTelefono] = useState(registro?.telefono ?? "");
  const [pending, start] = useTransition();

  // Lo que impide guardar: periodos abiertos del conductor que se cruzan con
  // las fechas del formulario, o novedades que unas vacaciones nuevas taparían.
  const [estorbos, setEstorbos] = useState<Estorbos>({ periodos: [], novedades: [] });
  const bloqueado = estorbos.periodos.length > 0 || estorbos.novedades.length > 0;

  const esIncapacidad = tipo === CONCEPTO_INCAPACIDAD;
  const esNoJustificada = tipo === CONCEPTO_NO_JUSTIFICADA;
  // Concepto que ocupa todos los días del rango (vacaciones): la terminación
  // deja de ser opcional y el día operativo lo manda el inicio.
  const conceptoActual = conceptos.find((c) => c.key === tipo) ?? null;
  const cubreRango = conceptoActual?.cubre_rango === true;
  // En vacaciones la terminación no se digita: es el día antes del reintegro.
  const finPeriodo = cubreRango && fechaInicio && reintegro
    ? finDesdeReintegro(fechaInicio, reintegro)
    : null;
  const fechaFinEfectiva = cubreRango ? finPeriodo ?? "" : fechaFin;
  const labelsConcepto = useMemo(() => conceptoLabels(conceptos), [conceptos]);
  // El campo de observaciones se despliega al elegir un soporte.
  const conSoporte = soporte !== "no_aplica";

  // Selector: activos en el orden del catálogo. Si el registro trae un
  // concepto ya inactivo, se conserva para que la edición no lo pierda.
  const opcionesConcepto = useMemo(() => {
    const activos = conceptos.filter((c) => c.activo);
    const actual = registro?.tipo;
    if (actual && !activos.some((c) => c.key === actual)) {
      const inactivo = conceptos.find((c) => c.key === actual);
      if (inactivo) return [inactivo, ...activos];
    }
    return activos;
  }, [conceptos, registro]);

  function cambiarTipo(valor: string) {
    if (valor === OPCION_NUEVO) {
      setNuevoAbierto(true);
      return;
    }
    setTipo(valor);
    // Si el concepto exige soporte y aún no se marcó ninguno, se sugiere.
    const c = conceptos.find((x) => x.key === valor);
    if (c?.exige_soporte && soporte === "no_aplica") setSoporte("pendiente");
  }

  function guardarConcepto() {
    const nombre = nuevoNombre.trim();
    if (nombre.length < 3) {
      toast.error("Escribe el nombre del concepto (mínimo 3 caracteres).");
      return;
    }
    startCrear(async () => {
      const res = await crearConcepto({
        nombre,
        cuentaReincidencia: nuevoCuenta,
        exigeSoporte: nuevoExige,
        cubreRango: nuevoRango,
      });
      if (!res.success || !res.concepto) {
        toast.error(res.error ?? "No se pudo crear el concepto");
        return;
      }
      onConceptoCreado(res.concepto);
      toast.success(
        res.existente
          ? `Ya existía: se seleccionó "${res.concepto.nombre}"`
          : `Concepto creado: ${res.concepto.nombre}`
      );
      cambiarTipo(res.concepto.key);
      setNuevoAbierto(false);
      setNuevoNombre("");
      setNuevoCuenta(true);
      setNuevoExige(false);
      setNuevoRango(false);
    });
  }

  // Si el vehículo del registro ya no está activo en el maestro, se mantiene
  // como opción para que la edición no lo pierda.
  const opcionesVehiculo = useMemo(() => {
    const actual = registro?.codigo_vehiculo;
    if (!actual || vehiculos.some((v) => v.codigo === actual)) return vehiculos;
    return [
      { codigo: actual, placa: registro?.vehiculos?.placa ?? null, cedula_conductor: null },
      ...vehiculos,
    ];
  }, [vehiculos, registro]);

  function elegirConductor(c: ConductorBusqueda) {
    setConductor({ cedula: c.cedula, codigo: c.codigo, nombre: c.nombre });
    setSugerencias([]);
    // El maestro trae el vehículo asignado al conductor: se preselecciona y
    // queda editable por si ese día iba en otro.
    if (!codigoVehiculo) {
      const suyo = vehiculos.find((v) => v.cedula_conductor === c.cedula);
      if (suyo) setCodigoVehiculo(suyo.codigo);
    }
  }

  // Búsqueda de conductores con debounce contra el maestro.
  useEffect(() => {
    const q = busqueda.trim();
    const timer = setTimeout(async () => {
      if (q.length < 2 || conductor) {
        setSugerencias([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/rotacion/conductores/search?q=${encodeURIComponent(q)}`
        );
        if (res.ok) setSugerencias(((await res.json()) as ConductorBusqueda[]) ?? []);
      } catch {
        setSugerencias([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [busqueda, conductor]);

  // Avisa que el conductor ya está en un periodo (vacaciones), o que las
  // vacaciones taparían otra novedad, antes de que termine de llenar el
  // formulario. Mismo debounce que el buscador.
  const diaOperativo = cubreRango ? fechaInicio : f;
  useEffect(() => {
    const cedula = conductor?.cedula;
    const timer = setTimeout(async () => {
      if (!cedula || !fechaInicio || !diaOperativo) {
        setEstorbos({ periodos: [], novedades: [] });
        return;
      }
      setEstorbos(
        await periodosDelConductor({
          cedula,
          tipo,
          fecha: diaOperativo,
          fechaInicio,
          fechaFin: fechaFinEfectiva || null,
          excluirId: registro?.id ?? null,
        })
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [conductor, tipo, diaOperativo, fechaInicio, fechaFinEfectiva, registro]);

  function submit() {
    if (!conductor) {
      toast.error("Busca y selecciona el conductor.");
      return;
    }
    if (!fechaInicio) {
      toast.error("Indica la fecha de inicio del reporte.");
      return;
    }
    if (!cubreRango && fechaFin && fechaFin < fechaInicio) {
      toast.error("La fecha final no puede ser antes de la inicial.");
      return;
    }
    if (cubreRango && !reintegro) {
      toast.error(
        `${conceptoActual?.nombre ?? "Este concepto"} necesita la fecha de reintegro: sale ausente hasta el día anterior.`
      );
      return;
    }
    if (cubreRango && !finPeriodo) {
      toast.error("El reintegro debe ser posterior al inicio del periodo.");
      return;
    }
    if (registro && !motivo.trim()) {
      toast.error("Indica el motivo de la modificación.");
      return;
    }
    const input: RegistroInput = {
      // En un concepto que cubre rango, el día operativo es el inicio (el
      // servidor lo fuerza igual; aquí se manda ya coherente).
      fecha: cubreRango ? fechaInicio : f,
      cedula: conductor.cedula,
      codigo: conductor.codigo,
      nombre: conductor.nombre,
      telefono: telefono.trim() || null,
      tipo,
      contacto: esNoJustificada && contacto ? contacto : null,
      justificacion: justificacion.trim() || null,
      incapacidadInicio: esIncapacidad && incIni ? incIni : null,
      incapacidadFin: esIncapacidad && incFin ? incFin : null,
      reintegro: reintegro || null,
      soporte,
      soporteObservaciones: conSoporte ? soporteObs.trim() || null : null,
      codigoVehiculo: codigoVehiculo || null,
      fechaInicio,
      fechaFin: fechaFinEfectiva || null,
      motivoModificacion: registro ? motivo.trim() : null,
    };
    start(async () => {
      const res = registro
        ? await actualizarRegistro(registro.id, input)
        : await crearRegistro(input);
      if (res.success) {
        toast.success(
          registro
            ? "Registro actualizado (quedó en la bitácora)"
            : `Ausente registrado: ${conductor.nombre}`
        );
        onDone();
        return;
      }
      toast.error(res.error ?? "No se pudo guardar");
    });
  }

  return (
    <div className="rounded-xl border border-[#C7D2FE] bg-[#EEF2FF]/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          {registro ? `Editar registro · ${registro.nombre}` : "Registrar ausente"}
        </h2>
        <button onClick={onDone} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Fecha</label>
          <input
            type="date"
            value={cubreRango ? fechaInicio : f}
            max={cubreRango ? undefined : hoy}
            disabled={cubreRango}
            onChange={(e) => setF(e.target.value)}
            className={`${inputCls} disabled:bg-[#F1F5F9] disabled:text-gray-500`}
          />
          {cubreRango && (
            <p className="mt-1 text-[11px] leading-tight text-gray-500">
              La lleva el inicio del periodo: el ausente se presenta todos los días hasta el día antes del reintegro.
            </p>
          )}
        </div>

        <div className="relative md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Conductor</label>
          {conductor ? (
            <div className="flex h-9 items-center justify-between rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm">
              <span className="truncate">
                <strong>{conductor.codigo ? `${conductor.codigo} · ` : ""}{conductor.nombre}</strong>{" "}
                <span className="text-xs text-gray-500">CC {conductor.cedula}</span>
              </span>
              {!registro && (
                <button
                  onClick={() => {
                    setConductor(null);
                    setBusqueda("");
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Código, cédula o nombre…"
                  className={`${inputCls} pl-8`}
                />
              </div>
              {sugerencias.length > 0 && (
                <div className="absolute z-40 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white shadow-lg">
                  {sugerencias.map((c) => (
                    <button
                      key={c.cedula}
                      onClick={() => elegirConductor(c)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[#F8FAFC]"
                    >
                      <span className="font-medium text-gray-900">
                        {c.codigo ? `${c.codigo} · ` : ""}
                        {c.nombre}
                      </span>
                      <span className="text-xs text-gray-500">
                        CC {c.cedula}
                        {c.estado && c.estado !== "ACTIVO" ? ` · ${c.estado}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Número de vehículo
          </label>
          <select
            value={codigoVehiculo}
            onChange={(e) => setCodigoVehiculo(e.target.value)}
            className={inputCls}
          >
            <option value="">— Sin vehículo —</option>
            {opcionesVehiculo.map((v) => (
              <option key={v.codigo} value={v.codigo}>{etiquetaVehiculo(v)}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Inicio del reporte
          </label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className={inputCls}
          />
          {esNoJustificada && (
            // La racha de descargos y terminación se cuenta con las fechas,
            // no con lo que diga la justificación: el primer día ausente va aquí.
            <p className="mt-1 text-[11px] leading-tight text-[#92400E]">
              Si lleva varios días sin aparecer, pon aquí el <strong>primer día ausente</strong>: así cuenta la racha
              para descargos ({DIAS_DESCARGOS} días) y terminación ({DIAS_TERMINACION}).
            </p>
          )}
        </div>

        {cubreRango ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Fecha de reintegro
            </label>
            <input
              type="date"
              value={reintegro}
              min={fechaInicio ? sumarDias(fechaInicio, 1) : undefined}
              onChange={(e) => setReintegro(e.target.value)}
              className={inputCls}
            />
            <p className="mt-1 text-[11px] leading-tight text-[#92400E]">
              Obligatoria: el día que vuelve a trabajar. Sale ausente hasta el día anterior, sin volver a registrarlo.
              {finPeriodo
                ? ` Vacaciones hasta el ${corta(finPeriodo)} · ${diasEntre(fechaInicio, finPeriodo) + 1} días.`
                : ""}
            </p>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Fin del reporte (opcional)
            </label>
            <input
              type="date"
              value={fechaFin}
              min={fechaInicio || undefined}
              onChange={(e) => setFechaFin(e.target.value)}
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Tipo de ausencia</label>
          <select value={tipo} onChange={(e) => cambiarTipo(e.target.value)} className={inputCls}>
            {opcionesConcepto.map((c) => (
              <option key={c.key} value={c.key}>
                {c.nombre}{c.activo ? "" : " (inactivo)"}
              </option>
            ))}
            {puedeEditar && (
              <option value={OPCION_NUEVO}>＋ Agregar concepto nuevo…</option>
            )}
          </select>
        </div>

        {bloqueado && (
          <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-xs text-[#991B1B] md:col-span-3">
            {estorbos.periodos.length > 0 ? (
              <>
                <p className="font-semibold">
                  {conductor?.nombre ?? "El conductor"} está en un periodo en esas fechas
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {estorbos.periodos.map((p) => (
                    <li key={p.id}>{describirPeriodo(p, labelsConcepto)}</li>
                  ))}
                </ul>
                <p className="mt-1">
                  {estorbos.periodos.some((p) => p.tipo === tipo)
                    ? "Con el mismo concepto no se puede registrar otra vez: edita el periodo que ya existe."
                    : "No se pueden registrar novedades dentro del periodo. Si volvió antes, corrige la fecha de reintegro de las vacaciones."}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Estas vacaciones taparían otras novedades</p>
                <ul className="mt-1 list-disc pl-4">
                  {estorbos.novedades.map((n) => (
                    <li key={n.id}>{labelsConcepto[n.tipo] ?? n.tipo} el {corta(n.fecha)}</li>
                  ))}
                </ul>
                <p className="mt-1">Ajusta el inicio o el reintegro, o corrige primero esa novedad.</p>
              </>
            )}
          </div>
        )}

        {nuevoAbierto && (
          <div className="rounded-lg border border-dashed border-[#A5B4FC] bg-white p-3 md:col-span-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">Nuevo concepto de ausencia</p>
              <button
                type="button"
                onClick={() => setNuevoAbierto(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Nombre</label>
                <input
                  type="text"
                  value={nuevoNombre}
                  autoFocus
                  maxLength={80}
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && guardarConcepto()}
                  placeholder="Ej. Licencia no remunerada"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col justify-end gap-1.5 text-xs text-gray-600">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={nuevoCuenta}
                    onChange={(e) => setNuevoCuenta(e.target.checked)}
                  />
                  Cuenta para reincidencia
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={nuevoExige}
                    onChange={(e) => setNuevoExige(e.target.checked)}
                  />
                  Exige soporte
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={nuevoRango}
                    onChange={(e) => setNuevoRango(e.target.checked)}
                  />
                  Cubre todos los días entre inicio y fin
                </label>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={guardarConcepto}
                  disabled={creando}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#4F46E5] px-3 text-sm font-medium text-[#4F46E5] hover:bg-[#EEF2FF] disabled:opacity-50"
                >
                  {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Crear y seleccionar
                </button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Queda guardado en el catálogo para todos. Los conceptos no se borran;
              si uno sobra, se desactiva en la base.
            </p>
          </div>
        )}

        {esNoJustificada && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Resultado del contacto
            </label>
            <select
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              className={inputCls}
            >
              <option value="">—</option>
              {CONTACTOS.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className={esNoJustificada ? "" : "md:col-span-2"}>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Justificación / observación
          </label>
          <input
            type="text"
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            placeholder="Lo que hoy escribes en el Excel"
            className={inputCls}
          />
        </div>

        {esIncapacidad && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Inicio de incapacidad
              </label>
              <input type="date" value={incIni} onChange={(e) => setIncIni(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Fin de incapacidad
              </label>
              <input type="date" value={incFin} min={incIni || undefined} onChange={(e) => setIncFin(e.target.value)} className={inputCls} />
            </div>
          </>
        )}

        {!cubreRango && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Reintegro laboral
            </label>
            <input type="date" value={reintegro} onChange={(e) => setReintegro(e.target.value)} className={inputCls} />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Soporte</label>
          <select value={soporte} onChange={(e) => setSoporte(e.target.value)} className={inputCls}>
            {SOPORTES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        {conSoporte && (
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Observaciones del soporte
            </label>
            <input
              type="text"
              value={soporteObs}
              onChange={(e) => setSoporteObs(e.target.value)}
              placeholder={
                soporte === "pendiente"
                  ? "Qué debe traer y para cuándo"
                  : "Qué presentó (incapacidad, cita, certificado…)"
              }
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Teléfono (se completa del maestro si se deja vacío)
          </label>
          <input
            type="text"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className={inputCls}
          />
        </div>

        {registro && (
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Motivo de la modificación <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={motivo}
              maxLength={200}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. trajo la incapacidad · prórroga · corrección de fecha"
              className={inputCls}
            />
            {registro.motivo_modificacion && (
              <p className="mt-1 text-[11px] text-gray-500">
                Última modificación: {registro.motivo_modificacion}
                {registro.modificado_por_email ? ` · ${registro.modificado_por_email}` : ""}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => submit()}
          disabled={pending || !conductor || bloqueado || (!!registro && !motivo.trim())}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {registro ? "Guardar cambios" : "Registrar"}
        </button>
      </div>
    </div>
  );
}
