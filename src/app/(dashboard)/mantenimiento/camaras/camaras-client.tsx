"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, Trash2 } from "lucide-react";
import { BuscadorOpciones, type OpcionBuscable } from "@/components/ui/buscador-opciones";
import type {
  ConductorCamaras, RevisionCamaras, VehiculoCamaras, ViajeDespacho,
} from "@/lib/mantenimiento/camaras-data";
import {
  CONDUCTOR_ORIGEN_LABEL, ELEMENTO_LABEL, MAX_OBSERVACIONES, NIVEL_COLOR, NIVEL_LABEL, compararConAforo,
  type Elemento, type TipoNovedad,
} from "@/lib/mantenimiento/camaras-reglas";
import { consultarViajes, eliminarRevision, registrarRevision } from "./actions";

const OTRO = "otro";

function hora(h: string | null): string {
  return h ? h.slice(0, 5) : "—";
}

/** Chip con el semáforo de un conteo frente al aforo. */
export function ChipDiferencia({ conteo, aforo, etiqueta }: {
  conteo: number | null | undefined;
  aforo: number | null | undefined;
  etiqueta?: string;
}) {
  const d = compararConAforo(conteo, aforo);
  const c = NIVEL_COLOR[d.nivel];
  const signo = d.diferencia != null && d.diferencia > 0 ? "+" : "";
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: c.suave, color: c.texto }}
      title={d.porcentaje != null ? `${d.porcentaje} % del aforo` : undefined}
    >
      {etiqueta && <span className="opacity-70">{etiqueta}</span>}
      {d.diferencia == null ? NIVEL_LABEL[d.nivel] : `${signo}${d.diferencia} · ${NIVEL_LABEL[d.nivel]}`}
    </span>
  );
}

export function CamarasClient({
  hoy, tipos, vehiculos, conductores, ultimas, recaudo, puedeEditar, error, consultar = consultarViajes,
}: {
  hoy: string;
  tipos: TipoNovedad[];
  vehiculos: VehiculoCamaras[];
  conductores: ConductorCamaras[];
  ultimas: RevisionCamaras[];
  recaudo: Record<number, number | null>;
  puedeEditar: boolean;
  error: string | null;
  /** Lectura de los viajes del día; se reemplaza solo en la vista previa sin sesión. */
  consultar?: typeof consultarViajes;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fecha, setFecha] = useState(hoy);
  const [codigo, setCodigo] = useState("");
  const [viajes, setViajes] = useState<ViajeDespacho[] | null>(null);
  const [revisadas, setRevisadas] = useState<RevisionCamaras[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorViajes, setErrorViajes] = useState<string | null>(null);
  /** número de despacho elegido, OTRO para digitarlo, "" sin elegir. */
  const [eleccion, setEleccion] = useState("");
  const [viajeManual, setViajeManual] = useState("");
  const [cedulaManual, setCedulaManual] = useState("");
  const [elemento, setElemento] = useState<Elemento>("camara");
  const [tipo, setTipo] = useState("");
  const [dfs, setDfs] = useState("");
  const [aforo, setAforo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [crearReporte, setCrearReporte] = useState(false);
  const [confirmarRepetida, setConfirmarRepetida] = useState(false);

  const opcionesVehiculo = useMemo<OpcionBuscable[]>(() => vehiculos.map((v) => ({
    valor: v.codigo,
    etiqueta: v.codigo,
    secundario: [v.placa, v.ruta].filter(Boolean).join(" · "),
    claves: [v.codigo, v.placa ?? ""].filter(Boolean),
  })), [vehiculos]);

  const opcionesConductor = useMemo<OpcionBuscable[]>(() => conductores.map((c) => ({
    valor: c.cedula,
    etiqueta: c.nombre,
    secundario: `CC ${c.cedula}`,
    claves: [c.cedula, c.nombre, c.codigo ?? ""].filter(Boolean),
  })), [conductores]);

  // Al cambiar el bus o la fecha se traen sus viajes del despacho de GEMA.
  // La consulta más reciente gana si el técnico cambia rápido.
  const ultimaConsulta = useRef(0);
  function cargarViajes(nuevaFecha: string, nuevoCodigo: string) {
    setFecha(nuevaFecha);
    setCodigo(nuevoCodigo);
    setEleccion("");
    setViajes(null);
    setRevisadas([]);
    setErrorViajes(null);
    setConfirmarRepetida(false);
    if (!nuevoCodigo || !nuevaFecha) return;
    const id = ++ultimaConsulta.current;
    setCargando(true);
    consultar(nuevaFecha, nuevoCodigo).then((r) => {
      if (id !== ultimaConsulta.current) return;
      setCargando(false);
      if (!r.success) { setErrorViajes(r.error ?? "No se pudieron leer los viajes."); return; }
      setViajes(r.viajes ?? []);
      setRevisadas(r.revisiones ?? []);
      // Sin viajes en GEMA se pasa directo a digitarlo.
      if ((r.viajes ?? []).length === 0) setEleccion(OTRO);
    });
  }

  const tiposElemento = tipos.filter((t) => t.elemento === elemento && t.activo);
  const tipoSel = tipos.find((t) => t.clave === tipo) ?? null;
  const viajeSel = viajes?.find((v) => String(v.numero) === eleccion) ?? null;
  const numeroViaje = viajeSel ? String(viajeSel.viaje) : viajeManual.trim().toUpperCase();
  const pideConteos = !tipoSel?.sin_conteo;
  const conteosObligatorios = elemento === "camara" && pideConteos;
  const dfsN = dfs === "" ? null : Number(dfs);
  const aforoN = aforo === "" ? null : Number(aforo);
  const yaRevisado = (numero: string, el: Elemento) =>
    revisadas.some((r) => r.viaje === numero && r.elemento === el);

  function limpiarViaje() {
    setEleccion(viajes && viajes.length > 0 ? "" : OTRO);
    setViajeManual("");
    setCedulaManual("");
    setTipo("");
    setDfs("");
    setAforo("");
    setObservaciones("");
    setCrearReporte(false);
    setConfirmarRepetida(false);
  }

  function guardar() {
    startTransition(async () => {
      const r = await registrarRevision({
        fechaViaje: fecha,
        vehiculoCodigo: codigo,
        viaje: numeroViaje,
        elemento,
        tipoNovedad: tipo,
        dfsOptocontrol: pideConteos ? dfs : null,
        aforo: pideConteos ? aforo : null,
        observaciones,
        despachoNumero: viajeSel ? viajeSel.numero : null,
        conductorCedula: viajeSel ? null : cedulaManual,
        confirmarRepetida,
        crearReporte,
      });
      if (r.requiereConfirmar) {
        setConfirmarRepetida(true);
        toast.warning("Ese viaje ya tiene revisión de " + ELEMENTO_LABEL[elemento].toLowerCase()
          + ". Guarde otra vez para registrarla como revisión repetida.");
        return;
      }
      if (!r.success) { toast.error(r.error ?? "No se pudo guardar."); return; }
      toast.success(`Viaje ${numeroViaje} del ${codigo} guardado.`);
      for (const a of r.avisos ?? []) toast.warning(a);
      // Se queda en el mismo bus y fecha: lo normal es revisar el siguiente viaje.
      const rv = await consultar(fecha, codigo);
      if (rv.success) setRevisadas(rv.revisiones ?? []);
      limpiarViaje();
      router.refresh();
    });
  }

  function eliminar(id: string) {
    if (!confirm("¿Eliminar esta revisión? Deja de contar en el historial y los indicadores.")) return;
    startTransition(async () => {
      const r = await eliminarRevision(id);
      if (!r.success) { toast.error(r.error ?? "No se pudo eliminar."); return; }
      toast.success("Revisión eliminada.");
      setRevisadas((prev) => prev.filter((x) => x.id !== id));
      router.refresh();
    });
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No se pudo cargar el control de cámaras: {error}. Si es la primera vez, falta correr la migración
          <code className="mx-1">20261007205927_control_de_camaras_y_sensores.sql</code>.
        </div>
      </div>
    );
  }

  const listoViaje = !!codigo && !!numeroViaje && (viajeSel != null || !!cedulaManual);
  const listo = listoViaje && !!tipo
    && (!conteosObligatorios || (dfs !== "" && aforo !== ""));

  const etiqueta = "mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500";
  const campo = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]";

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">Revisión de un viaje</h2>

        <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div>
            <label className={etiqueta} htmlFor="cam-fecha">Fecha del viaje</label>
            <input
              id="cam-fecha" type="date" className={campo} value={fecha} max={hoy}
              onChange={(e) => cargarViajes(e.target.value, codigo)} disabled={!puedeEditar}
            />
          </div>
          <div>
            <label className={etiqueta} htmlFor="cam-vehiculo">Vehículo</label>
            <BuscadorOpciones
              id="cam-vehiculo" opciones={opcionesVehiculo} value={codigo} onChange={(c) => cargarViajes(fecha, c)}
              placeholder="Número interno o placa" disabled={!puedeEditar}
            />
          </div>
        </div>

        {codigo && (
          <div>
            <span className={etiqueta}>Viaje (despacho de GEMA)</span>
            {cargando && <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Buscando viajes…</p>}
            {errorViajes && <p className="text-sm text-red-700">{errorViajes}</p>}
            {viajes && viajes.length === 0 && (
              <p className="mb-2 flex items-start gap-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                GEMA no tiene viajes del {codigo} ese día. Digite el número de viaje y el conductor.
              </p>
            )}
            {viajes && viajes.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {viajes.map((v) => {
                  const sel = eleccion === String(v.numero);
                  const hechoCam = yaRevisado(String(v.viaje), "camara");
                  const hechoSen = yaRevisado(String(v.viaje), "sensor");
                  return (
                    <button
                      key={v.numero} type="button" disabled={!puedeEditar}
                      onClick={() => { setEleccion(String(v.numero)); setConfirmarRepetida(false); }}
                      className={`rounded-lg border p-2 text-left text-sm transition ${sel ? "border-[#4F46E5] bg-[#EEF2FF] ring-1 ring-[#4F46E5]" : "border-gray-200 hover:border-gray-300"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">Viaje {v.viaje}</span>
                        <span className="text-xs text-gray-500">{hora(v.horaDespacho)} – {hora(v.horaLlegada)}</span>
                      </div>
                      <div className="truncate text-xs text-gray-600">{v.conductorNombre ?? "Sin conductor"}</div>
                      <div className="flex flex-wrap items-center gap-1 pt-1 text-xs text-gray-500">
                        <span>Caja: {v.recaudoCaja ?? "—"}</span>
                        {hechoCam && <span className="rounded bg-emerald-100 px-1 text-emerald-800">Cámara ✓</span>}
                        {hechoSen && <span className="rounded bg-emerald-100 px-1 text-emerald-800">Sensor ✓</span>}
                      </div>
                    </button>
                  );
                })}
                <button
                  type="button" disabled={!puedeEditar}
                  onClick={() => { setEleccion(OTRO); setConfirmarRepetida(false); }}
                  className={`rounded-lg border border-dashed p-2 text-left text-sm ${eleccion === OTRO ? "border-[#4F46E5] bg-[#EEF2FF]" : "border-gray-300 text-gray-600 hover:border-gray-400"}`}
                >
                  <div className="font-semibold">Otro viaje</div>
                  <div className="text-xs">C.U o un viaje que GEMA no muestra</div>
                </button>
              </div>
            )}
            {eleccion === OTRO && viajes && (
              <div className="mt-2 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <div>
                  <label className={etiqueta} htmlFor="cam-viaje">N.º de viaje</label>
                  <input
                    id="cam-viaje" className={campo} value={viajeManual} placeholder="1, 2… o C.U"
                    onChange={(e) => setViajeManual(e.target.value)} disabled={!puedeEditar}
                  />
                </div>
                <div>
                  <label className={etiqueta} htmlFor="cam-conductor">Conductor</label>
                  <BuscadorOpciones
                    id="cam-conductor" opciones={opcionesConductor} value={cedulaManual} onChange={setCedulaManual}
                    placeholder="Nombre o cédula" disabled={!puedeEditar}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {listoViaje && (
          <>
            <div>
              <span className={etiqueta}>Qué revisó</span>
              <div className="inline-flex gap-1 rounded-lg bg-gray-100 p-1">
                {(["camara", "sensor"] as Elemento[]).map((el) => (
                  <button
                    key={el} type="button" disabled={!puedeEditar}
                    onClick={() => { setElemento(el); setTipo(""); setCrearReporte(false); setConfirmarRepetida(false); }}
                    className={`rounded-md px-4 py-1.5 text-sm font-medium ${elemento === el ? "bg-white text-[#4F46E5] shadow-sm" : "text-gray-600"}`}
                  >
                    {ELEMENTO_LABEL[el]}
                    {yaRevisado(numeroViaje, el) && <Check className="ml-1 inline h-3.5 w-3.5 text-emerald-600" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className={etiqueta}>Resultado</span>
              <div className="flex flex-wrap gap-2">
                {tiposElemento.map((t) => (
                  <button
                    key={t.clave} type="button" disabled={!puedeEditar}
                    onClick={() => { setTipo(t.clave); if (!t.es_falla) setCrearReporte(false); }}
                    className={`rounded-full border px-3 py-1 text-sm ${tipo === t.clave
                      ? (t.es_falla ? "border-red-500 bg-red-50 text-red-800" : "border-emerald-500 bg-emerald-50 text-emerald-800")
                      : "border-gray-300 text-gray-700 hover:border-gray-400"}`}
                  >
                    {t.nombre}
                  </button>
                ))}
              </div>
            </div>

            {tipo && pideConteos && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={etiqueta} htmlFor="cam-dfs">DFS Optocontrol{!conteosObligatorios && " (opcional)"}</label>
                  <input
                    id="cam-dfs" type="number" inputMode="numeric" min={0} className={campo} value={dfs}
                    onChange={(e) => setDfs(e.target.value)} disabled={!puedeEditar}
                  />
                </div>
                <div>
                  <label className={etiqueta} htmlFor="cam-aforo">Aforo (video){!conteosObligatorios && " (opcional)"}</label>
                  <input
                    id="cam-aforo" type="number" inputMode="numeric" min={0} className={campo} value={aforo}
                    onChange={(e) => setAforo(e.target.value)} disabled={!puedeEditar}
                  />
                </div>
                <div>
                  <span className={etiqueta}>Caja (GEMA)</span>
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    {viajeSel?.recaudoCaja ?? "—"}
                  </div>
                </div>
                {aforoN != null && (
                  <div className="flex flex-wrap gap-2 sm:col-span-3">
                    <ChipDiferencia etiqueta="DFS vs aforo" conteo={dfsN} aforo={aforoN} />
                    {viajeSel?.recaudoCaja != null && (
                      <ChipDiferencia etiqueta="Caja vs aforo" conteo={viajeSel.recaudoCaja} aforo={aforoN} />
                    )}
                  </div>
                )}
              </div>
            )}

            {tipo && (
              <div>
                <label className={etiqueta} htmlFor="cam-obs">Observaciones</label>
                <textarea
                  id="cam-obs" rows={2} maxLength={MAX_OBSERVACIONES} className={campo} value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)} disabled={!puedeEditar}
                />
              </div>
            )}

            {tipoSel?.es_falla && (
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox" className="mt-0.5" checked={crearReporte}
                  onChange={(e) => setCrearReporte(e.target.checked)} disabled={!puedeEditar}
                />
                Abrir reporte de daño en Mantenimiento (concepto Eléctrico) para que cuente en las alertas del bus.
              </label>
            )}

            {confirmarRepetida && (
              <p className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Este viaje ya tiene revisión de {ELEMENTO_LABEL[elemento].toLowerCase()}. Al guardar queda como revisión repetida.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button" onClick={limpiarViaje} disabled={pending}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Limpiar
              </button>
              <button
                type="button" onClick={guardar} disabled={!puedeEditar || !listo || pending}
                className="inline-flex items-center gap-2 rounded-md bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirmarRepetida ? "Guardar como repetida" : "Guardar revisión"}
              </button>
            </div>
          </>
        )}

        {revisadas.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <span className={etiqueta}>Ya revisado del {codigo} ese día</span>
            <ul className="space-y-1 text-sm">
              {revisadas.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>
                    Viaje {r.viaje} · {ELEMENTO_LABEL[r.elemento]} · {tipos.find((t) => t.clave === r.tipo_novedad)?.nombre ?? r.tipo_novedad}
                    {r.revision_repetida && <span className="ml-1 text-xs text-amber-700">(repetida)</span>}
                  </span>
                  {puedeEditar && (
                    <button type="button" onClick={() => eliminar(r.id)} className="text-gray-400 hover:text-red-600" title="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <h2 className="border-b border-gray-100 px-4 py-3 text-base font-semibold text-gray-900">Últimas revisiones</h2>
        {ultimas.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">Todavía no hay revisiones registradas desde Gestivo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Viaje</th>
                  <th className="px-3 py-2">Resultado</th>
                  <th className="px-3 py-2 text-right">DFS / aforo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ultimas.map((r) => {
                  const t = tipos.find((x) => x.clave === r.tipo_novedad);
                  const caja = r.despacho_numero != null ? recaudo[r.despacho_numero] : null;
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.vehiculo_codigo} · viaje {r.viaje}</div>
                        <div className="text-xs text-gray-500">{r.fecha_viaje} · {r.conductor_nombre ?? "—"}</div>
                        {r.conductor_origen !== "gema_viaje" && (
                          <div className="text-xs text-amber-700">{CONDUCTOR_ORIGEN_LABEL[r.conductor_origen]}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div>{ELEMENTO_LABEL[r.elemento]}</div>
                        <div className={`text-xs ${r.con_falla ? "text-red-700" : "text-emerald-700"}`}>{t?.nombre ?? r.tipo_novedad}</div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div>{r.dfs_optocontrol ?? "—"} / {r.aforo ?? "—"}</div>
                        {r.aforo != null && (
                          <div className="mt-1 flex flex-col items-end gap-1">
                            <ChipDiferencia conteo={r.dfs_optocontrol} aforo={r.aforo} />
                            {caja != null && <ChipDiferencia etiqueta="Caja" conteo={caja} aforo={r.aforo} />}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
