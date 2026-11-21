"use client";

/**
 * Selección, entrega 3, en la ficha del candidato: exámenes médicos y rutas
 * (pestaña «Citas y profesor»), carpeta y referencias (pestaña «Carpeta») y
 * las condiciones para contratar (Resumen).
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ExternalLink, FileUp, FolderOpen, Route, Stethoscope, TriangleAlert, UserCheck } from "lucide-react";
import {
  agregarReferenciaFicha, anularAdjuntoFicha, aprobarContratacionFicha, cerrarPorExamenesFicha, contratarFicha, datosEntrega3, marcarItemCarpetaFicha,
  registrarExamenFicha, registrarRutaFicha, rutasDisponibles, validarReferenciaFicha, type DatosEntrega3,
} from "@/app/(dashboard)/candidatos/entrega3-actions";
import type { AdjuntoVista } from "@/lib/seleccion/carpeta-servidor";
import type { EstadoCarpeta } from "@/lib/seleccion/contratacion";

export const fechaHora = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso)) : "—";
export const campo = "w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm outline-none focus:border-[#4F46E5]";
export const botonSec = "rounded-md border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";
export const botonPri = "rounded-md bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50";

const SIN_MIGRACION = "Falta aplicar la migración de la entrega 3 de selección (20261120195812).";

/** Lee los datos de la entrega 3 y los vuelve a leer al cambiar `version` o al guardar algo aquí. */
export function useEntrega3(procesoId: string, version: number) {
  const [datos, setDatos] = useState<DatosEntrega3 | null>(null);
  const [propia, setPropia] = useState(0);
  useEffect(() => {
    let vivo = true;
    datosEntrega3(procesoId)
      .then((d) => vivo && setDatos(d))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [procesoId, version, propia]);
  const recargar = useCallback(() => setPropia((n) => n + 1), []);
  return { datos, recargar };
}

/** Corre una acción, muestra el resultado y refresca. */
export function useAccion(recargar: () => void) {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const correr = (accion: () => Promise<{ ok: boolean; error?: string }>, exito: string, despues?: () => void) => {
    setMensaje(null);
    enTransicion(async () => {
      const r = await accion();
      setMensaje(r.ok ? exito : (r.error ?? "No se pudo completar."));
      if (r.ok) {
        despues?.();
        recargar();
        router.refresh();
      }
    });
  };
  return { mensaje, ocupado, correr };
}

async function subirArchivo(procesoId: string, tipo: string, archivo: File): Promise<{ ok: boolean; error?: string }> {
  const form = new FormData();
  form.set("proceso_id", procesoId);
  form.set("tipo", tipo);
  form.set("archivo", archivo);
  try {
    const r = await fetch("/api/seleccion/adjuntos", { method: "POST", body: form });
    return (await r.json()) as { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: "No hay conexión con el servidor." };
  }
}

export function BotonSubir({ procesoId, tipo, onSubido, texto = "Subir archivo" }: { procesoId: string; tipo: string; onSubido: (r: { ok: boolean; error?: string }) => void; texto?: string }) {
  const [subiendo, setSubiendo] = useState(false);
  return (
    <label className={`${botonSec} inline-flex cursor-pointer items-center gap-1.5 ${subiendo ? "pointer-events-none opacity-50" : ""}`}>
      <FileUp className="h-4 w-4" /> {subiendo ? "Subiendo…" : texto}
      <input
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setSubiendo(true);
          onSubido(await subirArchivo(procesoId, tipo, f));
          setSubiendo(false);
        }}
      />
    </label>
  );
}

export function ListaArchivos({ archivos, puedeEditar, onAnular }: { archivos: AdjuntoVista[]; puedeEditar: boolean; onAnular: (id: string, motivo: string) => void }) {
  if (!archivos.length) return null;
  return (
    <ul className="mt-1.5 space-y-1 text-xs">
      {archivos.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2 text-gray-600">
          {a.url ? (
            <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#4F46E5] hover:underline">
              {a.nombre} <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span>{a.nombre}</span>
          )}
          <span className="text-gray-400">{fechaHora(a.createdAt)}</span>
          {puedeEditar && (
            <button
              type="button"
              className="text-gray-400 underline hover:text-gray-600"
              onClick={() => {
                const motivo = prompt("¿Por qué anula este archivo?");
                if (motivo) onAnular(a.id, motivo);
              }}
            >
              anular
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Exámenes y rutas ───────────────────────────────────────────────────────

export function SeccionExamenesRutas({ procesoId, abierto, version }: { procesoId: string; abierto: boolean; version: number }) {
  const { datos, recargar } = useEntrega3(procesoId, version);
  const { mensaje, ocupado, correr } = useAccion(recargar);
  const [fase, setFase] = useState<1 | 2>(1);
  const [observacion, setObservacion] = useState("");
  const [rutas, setRutas] = useState<string[] | null>(null);
  const [ruta, setRuta] = useState("");
  const [obsRuta, setObsRuta] = useState("");

  if (!datos) return null;
  if (!datos.examenes) return <p className="text-sm text-gray-500">{SIN_MIGRACION}</p>;
  const ex = (f: 1 | 2) => datos.examenes!.find((e) => e.fase === f);
  const noApto = datos.examenes.find((e) => e.resultado === "no_apto");
  const editar = datos.puede.editar && abierto;
  const sugerida: 1 | 2 = ex(1)?.resultado === "apto" ? 2 : 1;
  const faseForm = ex(1)?.resultado === "apto" ? fase : 1;
  const rutasCond = datos.condiciones.condiciones.find((c) => c.id === "rutas");
  const otros = datos.carpeta?.otros ?? [];

  return (
    <div className="space-y-5">
      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Stethoscope className="h-4 w-4" /> Exámenes médicos
        </h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {([1, 2] as const).map((f) => {
            const e = ex(f);
            return (
              <div key={f} className="rounded-lg border border-[#F1F5F9] p-3 text-sm">
                <p className="font-medium text-gray-900">Fase {f}</p>
                <p className={e?.resultado === "apto" ? "text-emerald-700" : e?.resultado === "no_apto" ? "text-red-700" : "text-gray-500"}>
                  {e?.resultado === "apto" ? "Apto" : e?.resultado === "no_apto" ? "No apto" : "Sin resultado"}
                </p>
                {e?.observacion && <p className="mt-1 text-xs text-gray-600">{e.observacion}</p>}
                {e?.confirmadoPor && <p className="mt-1 text-xs text-gray-400">{e.confirmadoPor} · {fechaHora(e.confirmadoAt)}</p>}
                <ListaArchivos archivos={otros.filter((a) => a.tipo === `examen_f${f}`)} puedeEditar={datos.puede.editar} onAnular={(id, m) => correr(() => anularAdjuntoFicha(id, m), "Archivo anulado.")} />
                {datos.puede.editar && (
                  <div className="mt-2">
                    <BotonSubir procesoId={procesoId} tipo={`examen_f${f}`} texto="Subir resultado" onSubido={(r) => correr(async () => r, "Archivo subido.")} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {noApto && abierto && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="flex items-center gap-2 text-sm text-red-700">
              <TriangleAlert className="h-4 w-4 shrink-0" /> Fase {noApto.fase} no apta: se propone cerrar con «Exámenes médicos».
            </p>
            {editar && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => confirm("¿Cerrar el proceso por exámenes médicos?") && correr(() => cerrarPorExamenesFicha(procesoId), "Proceso cerrado por exámenes médicos.")}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Cerrar el proceso
              </button>
            )}
          </div>
        )}

        {editar && !(ex(1)?.resultado === "apto" && ex(2)?.resultado === "apto") && (
          <div className="mt-3 space-y-2 rounded-lg border border-[#E2E8F0] p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-gray-900">Registrar resultado:</span>
              <select className={`${campo} w-auto`} value={faseForm} onChange={(e) => setFase(Number(e.target.value) as 1 | 2)} disabled={sugerida === 1}>
                <option value={1}>Fase 1</option>
                {sugerida === 2 && <option value={2}>Fase 2</option>}
              </select>
            </div>
            <input className={campo} placeholder="Observación (obligatoria si es no apto; p. ej. «apto con restricciones»)" value={observacion} onChange={(e) => setObservacion(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={ocupado}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                onClick={() => correr(() => registrarExamenFicha(procesoId, faseForm, "apto", observacion), faseForm === 1 ? "Fase 1 apta: queda citado a la fase 2." : "Fase 2 apta: pasa a reconocimiento de ruta.", () => setObservacion(""))}
              >
                Apto
              </button>
              <button
                type="button"
                disabled={ocupado}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                onClick={() => correr(() => registrarExamenFicha(procesoId, faseForm, "no_apto", observacion), "Registrado como no apto.", () => setObservacion(""))}
              >
                No apto
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Route className="h-4 w-4" /> Reconocimiento de ruta
        </h4>
        <p className={`text-sm ${rutasCond?.cumple ? "text-emerald-700" : "text-gray-700"}`}>Rutas aprendidas: {rutasCond?.detalle ?? "—"}</p>
        {editar && (
          <div className="mt-2 space-y-2 rounded-lg border border-[#E2E8F0] p-3">
            {rutas == null ? (
              <button type="button" className={botonSec} onClick={() => rutasDisponibles().then(setRutas).catch(() => setRutas([]))}>
                Registrar una salida de ruta
              </button>
            ) : (
              <>
                {rutas.length ? (
                  <select className={campo} value={ruta} onChange={(e) => setRuta(e.target.value)}>
                    <option value="">Elija la ruta</option>
                    {rutas.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className={campo} placeholder="Ruta" value={ruta} onChange={(e) => setRuta(e.target.value)} />
                )}
                <input className={campo} placeholder="Observación (obligatoria si no continúa)" value={obsRuta} onChange={(e) => setObsRuta(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {(["aprendida", "repetir", "no_continua"] as const).map((res) => (
                    <button
                      key={res}
                      type="button"
                      disabled={ocupado || !ruta}
                      className={res === "no_continua" ? "rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" : res === "aprendida" ? botonPri : botonSec}
                      onClick={() => correr(() => registrarRutaFicha(procesoId, ruta, res, obsRuta), "Salida registrada.", () => { setRuta(""); setObsRuta(""); })}
                    >
                      {res === "aprendida" ? "La aprendió" : res === "repetir" ? "Debe repetirla" : "No continúa"}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>
      {mensaje && <p className="text-sm text-gray-700">{mensaje}</p>}
    </div>
  );
}

// ── Carpeta y referencias ──────────────────────────────────────────────────

const ESTADO_CARPETA: Record<EstadoCarpeta, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-gray-100 text-gray-600" },
  recibido: { texto: "Recibido", clase: "bg-amber-50 text-amber-800" },
  validado: { texto: "Validado", clase: "bg-emerald-50 text-emerald-700" },
};

export function SeccionCarpeta({ procesoId, version }: { procesoId: string; version: number }) {
  const { datos, recargar } = useEntrega3(procesoId, version);
  const { mensaje, ocupado, correr } = useAccion(recargar);
  const [ref, setRef] = useState({ tipo: "laboral" as "laboral" | "personal", nombre: "", telefono: "", empresa: "", origen: "" });
  const [validando, setValidando] = useState<string | null>(null);
  const [val, setVal] = useState({ habloCon: "", resultado: "" });

  if (!datos) return null;
  if (!datos.carpeta) return <p className="text-sm text-gray-500">{SIN_MIGRACION}</p>;
  const c = datos.carpeta;
  const editar = datos.puede.editar;
  const completos = c.items.filter((i) => i.estado === "validado").length;

  return (
    <div className="space-y-5">
      <section>
        <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <FolderOpen className="h-4 w-4" /> Carpeta · {completos} de {c.items.length} validados
        </h4>
        <p className="mb-2 text-xs text-gray-500">La lista se define en Selección › Tiempos y reglas › «Documentos de la carpeta». Para contratar deben estar todos validados.</p>
        <ul className="divide-y divide-[#F1F5F9] rounded-lg border border-[#F1F5F9]">
          {c.items.map((i) => (
            <li key={i.item} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  {i.estado === "validado" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-gray-300" />}
                  {i.item}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_CARPETA[i.estado].clase}`}>{ESTADO_CARPETA[i.estado].texto}</span>
                </span>
                {editar && (
                  <span className="flex flex-wrap gap-1.5">
                    <BotonSubir procesoId={procesoId} tipo={i.tipo} texto="Subir" onSubido={(r) => correr(async () => r, "Archivo subido.")} />
                    {i.estado !== "validado" && (
                      <button type="button" disabled={ocupado} className={botonPri} onClick={() => correr(() => marcarItemCarpetaFicha(procesoId, i.item, "validado", null), `${i.item}: validado.`)}>
                        Validar
                      </button>
                    )}
                    {i.estado === "pendiente" && (
                      <button type="button" disabled={ocupado} className={botonSec} onClick={() => correr(() => marcarItemCarpetaFicha(procesoId, i.item, "recibido", null), `${i.item}: recibido.`)}>
                        Recibido en físico
                      </button>
                    )}
                    {i.estado !== "pendiente" && (
                      <button type="button" disabled={ocupado} className="px-2 text-xs text-gray-500 underline" onClick={() => correr(() => marcarItemCarpetaFicha(procesoId, i.item, "pendiente", null), `${i.item}: pendiente.`)}>
                        Volver a pendiente
                      </button>
                    )}
                  </span>
                )}
              </div>
              {i.validadoPor && <p className="mt-0.5 text-xs text-gray-400">Validado por {i.validadoPor} · {fechaHora(i.validadoAt)}</p>}
              <ListaArchivos archivos={i.archivos} puedeEditar={editar} onAnular={(id, m) => correr(() => anularAdjuntoFicha(id, m), "Archivo anulado.")} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <UserCheck className="h-4 w-4" /> Referencias
        </h4>
        {c.referencias.length === 0 && <p className="text-sm text-gray-500">Sin referencias registradas.</p>}
        <ul className="space-y-2">
          {c.referencias.map((r) => (
            <li key={r.id} className="rounded-lg border border-[#F1F5F9] p-3 text-sm">
              <p className="font-medium text-gray-900">
                {r.nombre} <span className="font-normal text-gray-500">· {r.tipo === "laboral" ? "laboral" : "personal"}{r.empresa ? ` · ${r.empresa}` : ""}</span>
              </p>
              <p className="text-xs text-gray-500">
                {r.telefono ?? "Sin teléfono"}
                {r.origen ? ` · ${r.origen}` : ""}
              </p>
              {r.validadaAt ? (
                <p className="mt-1 text-xs text-emerald-700">
                  Validada por {r.validadaPor} · {fechaHora(r.validadaAt)} · habló con {r.habloCon}: {r.resultado}
                </p>
              ) : validando === r.id ? (
                <div className="mt-2 space-y-1.5">
                  <input className={campo} placeholder="¿Con quién habló?" value={val.habloCon} onChange={(e) => setVal({ ...val, habloCon: e.target.value })} />
                  <input className={campo} placeholder="¿Qué le dijeron?" value={val.resultado} onChange={(e) => setVal({ ...val, resultado: e.target.value })} />
                  <div className="flex gap-2">
                    <button type="button" className={botonPri} disabled={ocupado} onClick={() => correr(() => validarReferenciaFicha(r.id, val), "Referencia validada.", () => { setValidando(null); setVal({ habloCon: "", resultado: "" }); })}>
                      Guardar
                    </button>
                    <button type="button" className={botonSec} onClick={() => setValidando(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                editar && (
                  <button type="button" className="mt-1 text-xs text-[#4F46E5] underline" onClick={() => setValidando(r.id)}>
                    Registrar la llamada
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
        {editar && (
          <div className="mt-3 grid gap-2 rounded-lg border border-[#E2E8F0] p-3 sm:grid-cols-2">
            <select className={campo} value={ref.tipo} onChange={(e) => setRef({ ...ref, tipo: e.target.value as "laboral" | "personal" })}>
              <option value="laboral">Laboral</option>
              <option value="personal">Personal</option>
            </select>
            <input className={campo} placeholder="Nombre" value={ref.nombre} onChange={(e) => setRef({ ...ref, nombre: e.target.value })} />
            <input className={campo} placeholder="Teléfono" value={ref.telefono} onChange={(e) => setRef({ ...ref, telefono: e.target.value })} />
            <input className={campo} placeholder="Empresa (si es laboral)" value={ref.empresa} onChange={(e) => setRef({ ...ref, empresa: e.target.value })} />
            <input className={`${campo} sm:col-span-2`} placeholder="De dónde salió (hoja de vida, carta laboral…)" value={ref.origen} onChange={(e) => setRef({ ...ref, origen: e.target.value })} />
            <div className="sm:col-span-2">
              <button
                type="button"
                className={botonPri}
                disabled={ocupado || ref.nombre.trim().length < 3}
                onClick={() => correr(() => agregarReferenciaFicha(procesoId, ref), "Referencia agregada.", () => setRef({ tipo: ref.tipo, nombre: "", telefono: "", empresa: "", origen: "" }))}
              >
                Agregar referencia
              </button>
            </div>
          </div>
        )}
      </section>

      {c.otros.filter((a) => a.tipo === "otro").length > 0 && (
        <section>
          <h4 className="mb-1 text-sm font-semibold text-gray-900">Otros archivos</h4>
          <ListaArchivos archivos={c.otros.filter((a) => a.tipo === "otro")} puedeEditar={editar} onAnular={(id, m) => correr(() => anularAdjuntoFicha(id, m), "Archivo anulado.")} />
        </section>
      )}
      {editar && <BotonSubir procesoId={procesoId} tipo="otro" texto="Subir otro archivo" onSubido={(r) => correr(async () => r, "Archivo subido.")} />}
      {mensaje && <p className="text-sm text-gray-700">{mensaje}</p>}
    </div>
  );
}

// ── Contratación ───────────────────────────────────────────────────────────

/** Estados desde los que tiene sentido mostrar las condiciones para contratar. */
const ETAPAS_FINALES = new Set(["en_examenes", "en_examenes_fase2", "reconocimiento_ruta"]);

export function SeccionContratacion({ procesoId, estado, version, onCambio }: { procesoId: string; estado: string; version: number; onCambio: () => void }) {
  const { datos, recargar } = useEntrega3(procesoId, version);
  const { mensaje, ocupado, correr } = useAccion(() => {
    recargar();
    onCambio();
  });
  const [excepcion, setExcepcion] = useState(false);
  const [justificacion, setJustificacion] = useState("");

  if (!datos || !ETAPAS_FINALES.has(estado)) return null;
  const c = datos.condiciones;
  if (!c.exigir) return null;

  return (
    <section className="rounded-lg border border-[#E2E8F0] p-3">
      <h4 className="mb-2 text-sm font-semibold text-gray-900">Condiciones para contratar</h4>
      <ul className="space-y-1 text-sm">
        {c.condiciones.map((x) => (
          <li key={x.id} className="flex items-start gap-2">
            {x.cumple ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />}
            <span>
              <span className={x.cumple ? "text-gray-900" : "text-gray-700"}>{x.nombre}</span>
              <span className="block text-xs text-gray-500">{x.detalle}</span>
            </span>
          </li>
        ))}
      </ul>
      {c.aprobadaPor && <p className="mt-2 text-xs text-gray-400">Visto bueno de {c.aprobadaPor} · {fechaHora(c.aprobadaAt)}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {datos.puede.aprobar && (
          <button type="button" disabled={ocupado} className={c.aprobadaAt ? botonSec : botonPri} onClick={() => correr(() => aprobarContratacionFicha(procesoId, !c.aprobadaAt), c.aprobadaAt ? "Visto bueno retirado." : "Visto bueno registrado.")}>
            {c.aprobadaAt ? "Quitar el visto bueno" : "Dar el visto bueno para contratar"}
          </button>
        )}
        {datos.puede.editar && c.ok && (
          <button
            type="button"
            disabled={ocupado}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={() => confirm("¿Pasar el proceso a «Contratado»? Se crea el conductor en Gestivo.") && correr(() => contratarFicha(procesoId), "Contratado.")}
          >
            Contratar
          </button>
        )}
        {datos.puede.editar && !c.ok && datos.puede.excepcion && !excepcion && (
          <button type="button" className={botonSec} onClick={() => setExcepcion(true)}>
            Contratar con excepción
          </button>
        )}
      </div>
      {excepcion && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">Falta: {c.faltan.join("; ")}. La justificación queda en el historial.</p>
          <textarea className={campo} rows={2} value={justificacion} onChange={(e) => setJustificacion(e.target.value)} placeholder="Por qué se contrata sin cumplir todo" />
          <div className="flex gap-2">
            <button type="button" className={botonPri} disabled={ocupado || justificacion.trim().length < 15} onClick={() => correr(() => contratarFicha(procesoId, justificacion), "Contratado con excepción.", () => setExcepcion(false))}>
              Contratar con excepción
            </button>
            <button type="button" className={botonSec} onClick={() => setExcepcion(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {mensaje && <p className="mt-2 text-sm text-gray-700">{mensaje}</p>}
    </section>
  );
}
