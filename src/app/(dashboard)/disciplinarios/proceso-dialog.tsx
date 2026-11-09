"use client";

/**
 * Formulario de un proceso disciplinario (nuevo o edición): trabajador,
 * tipo, hechos y motivo, citación y asistencia a descargos (solo citación) y
 * la medida tomada. Reglas en src/lib/disciplinarios/reglas.ts.
 *
 * Al crear se pueden agregar varios trabajadores del mismo asunto (buscador,
 * lista pegada o a mano): se crea un proceso independiente por persona.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Gavel, Loader2, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BuscadorOpciones, type OpcionBuscable } from "@/components/ui/buscador-opciones";
import type { OpcionConductor } from "@/lib/disciplinarios/data";
import {
  AREAS_PROCESO,
  MAX_PROCESOS_LOTE,
  MAX_TEXTO_CORTO,
  MAX_TEXTO_PROCESO,
  MEDIDAS_PROCESO,
  MOTIVOS_PROCESO,
  NORMAS_INCUMPLIDAS,
  RESPONSABLES_PROCESO,
  TIPOS_PROCESO,
  interpretarListaPegada,
  type Proceso,
} from "@/lib/disciplinarios/reglas";
import { actualizarProceso, crearProcesos } from "./actions";

type Formulario = {
  tipo: string;
  fechaHecho: string;
  motivo: string;
  motivoDetalle: string;
  descripcion: string;
  fechaCitacion: string;
  fechaDescargos: string;
  /** "si" | "no" | "" (sin dato todavía) */
  asistio: string;
  resumenDescargos: string;
  medida: string;
  diasSuspension: string;
  fechaMedida: string;
  medidaDetalle: string;
  responsable: string;
  normaIncumplida: string;
  cargo: string;
  area: string;
  realizadoPor: string;
};

/** Cargo con el que llega quien se elige del maestro de conductores (como en el Excel). */
const CARGO_CONDUCTOR = "Conductor-cobrador";

type Trabajador = { cedula: string; codigo: string | null; nombre: string; retirado?: boolean };

function formularioDe(p: Proceso | null, hoy: string): Formulario {
  if (!p) {
    return {
      tipo: "llamado_atencion",
      fechaHecho: hoy,
      motivo: "",
      motivoDetalle: "",
      descripcion: "",
      fechaCitacion: "",
      fechaDescargos: "",
      asistio: "",
      resumenDescargos: "",
      medida: "pendiente",
      diasSuspension: "",
      fechaMedida: "",
      medidaDetalle: "",
      responsable: "",
      normaIncumplida: "",
      cargo: "",
      area: "",
      realizadoPor: "",
    };
  }
  return {
    tipo: p.tipo,
    fechaHecho: p.fechaHecho,
    motivo: p.motivo,
    motivoDetalle: p.motivoDetalle ?? "",
    descripcion: p.descripcion ?? "",
    fechaCitacion: p.fechaCitacion ?? "",
    fechaDescargos: p.fechaDescargos ?? "",
    asistio: p.asistio === true ? "si" : p.asistio === false ? "no" : "",
    resumenDescargos: p.resumenDescargos ?? "",
    medida: p.medida,
    diasSuspension: p.diasSuspension ? String(p.diasSuspension) : "",
    fechaMedida: p.fechaMedida ?? "",
    medidaDetalle: p.medidaDetalle ?? "",
    responsable: p.responsable ?? "",
    normaIncumplida: p.normaIncumplida ?? "",
    cargo: p.cargo ?? "",
    area: p.area ?? "",
    realizadoPor: p.realizadoPor ?? "",
  };
}

const inputCls = "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const textareaCls = "min-h-[72px] w-full resize-y rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";

function Campo({ etiqueta, children, ancho = false }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${ancho ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{etiqueta}</span>
      {children}
    </label>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-[#F1F5F9] pb-1 text-sm font-semibold text-gray-800">{titulo}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function ProcesoDialog({
  proceso,
  conductores,
  hoy,
  sugerencias,
  onClose,
}: {
  /** null = proceso nuevo. */
  proceso: Proceso | null;
  conductores: OpcionConductor[];
  hoy: string;
  /** Cargos y personas ya usados, para autocompletar. */
  sugerencias: { cargos: string[]; realizadoPor: string[] };
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<Formulario>(() => formularioDe(proceso, hoy));
  const set = (k: keyof Formulario) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  // Trabajadores (solo al crear): del maestro de conductores o, si no están,
  // escritos a mano. Con varios se crea un proceso independiente por persona.
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [manual, setManual] = useState(false);
  const [manualNombre, setManualNombre] = useState("");
  const [manualCedula, setManualCedula] = useState("");
  const [pegado, setPegado] = useState("");
  const [noEncontrados, setNoEncontrados] = useState<string[]>([]);
  const elegidas = useMemo(() => new Set(trabajadores.map((t) => t.cedula)), [trabajadores]);
  const opciones: OpcionBuscable[] = useMemo(
    () =>
      conductores
        .filter((c) => !elegidas.has(c.cedula))
        .map((c) => ({
          valor: c.cedula,
          etiqueta: `${c.codigo ? `${c.codigo} · ` : ""}${c.nombre}`,
          secundario: `CC ${c.cedula}${c.retirado ? " · retirado" : ""}`,
          claves: [c.codigo ?? "", c.cedula, c.nombre],
        })),
    [conductores, elegidas]
  );
  const esCitacion = f.tipo === "citacion_descargos";

  /** Agrega sin repetir cédulas ni pasar el tope. */
  function agregar(nuevos: Trabajador[], delMaestro: boolean) {
    const libres = nuevos.filter((t) => !elegidas.has(t.cedula));
    const cupo = MAX_PROCESOS_LOTE - trabajadores.length;
    if (libres.length > cupo) toast.error(`Se pueden registrar máximo ${MAX_PROCESOS_LOTE} trabajadores a la vez.`);
    const entran = libres.slice(0, Math.max(0, cupo));
    if (entran.length === 0) return;
    setTrabajadores((prev) => [...prev, ...entran]);
    // Del maestro de conductores: cargo y área operativos, si no se han escrito.
    if (delMaestro) setF((x) => ({ ...x, cargo: x.cargo || CARGO_CONDUCTOR, area: x.area || "operativa" }));
  }

  function agregarManual() {
    const cedula = manualCedula.replace(/\D/g, "");
    const nombre = manualNombre.trim();
    if (!cedula || !nombre) {
      toast.error("Escriba la cédula y el nombre del trabajador.");
      return;
    }
    if (elegidas.has(cedula)) {
      toast.error(`La cédula ${cedula} ya está en la lista.`);
      return;
    }
    agregar([{ cedula, codigo: null, nombre: nombre.toUpperCase() }], false);
    setManualCedula("");
    setManualNombre("");
  }

  function agregarPegados() {
    const { encontrados, noEncontrados: faltan } = interpretarListaPegada(pegado, conductores);
    agregar(encontrados, true);
    setNoEncontrados(faltan);
    // Quedan escritos solo los que no se encontraron, para corregirlos.
    setPegado(faltan.join(", "));
  }

  /** Al pegar una columna de Excel o una lista, cada línea queda separada por coma. */
  function alPegar(e: React.ClipboardEvent<HTMLInputElement>) {
    const texto = e.clipboardData.getData("text");
    if (!/[\r\n\t]/.test(texto)) return;
    e.preventDefault();
    const limpio = texto.split(/[\r\n\t]+/).map((s) => s.trim()).filter(Boolean).join(", ");
    const el = e.currentTarget;
    const ini = el.selectionStart ?? pegado.length;
    const fin = el.selectionEnd ?? pegado.length;
    const antes = pegado.slice(0, ini);
    const sep = antes.trim() && !/[,;\s]$/.test(antes) ? ", " : "";
    setPegado(antes + sep + limpio + pegado.slice(fin));
  }

  function guardar() {
    const datos = { ...f, asistio: f.asistio === "si" ? true : f.asistio === "no" ? false : null };
    if (!proceso && trabajadores.length === 0) {
      toast.error("Agregue al menos un trabajador (del maestro o escribiendo cédula y nombre).");
      return;
    }
    start(async () => {
      if (proceso) {
        const res = await actualizarProceso(proceso.id, datos);
        if (!res.success) {
          toast.error(res.error ?? "No se pudo guardar el proceso.");
          return;
        }
        toast.success(`Proceso N.º ${res.proceso?.consecutivo} actualizado.`);
      } else {
        const res = await crearProcesos({
          personas: trabajadores.map(({ cedula, codigo, nombre }) => ({ cedula, codigo, nombre })),
          datos,
        });
        if (!res.success || !res.procesos?.length) {
          toast.error(res.error ?? "No se pudo registrar el proceso.");
          return;
        }
        const nums = res.procesos.map((p) => p.consecutivo);
        toast.success(
          nums.length === 1
            ? `Proceso N.º ${nums[0]} registrado.`
            : `${nums.length} procesos registrados (N.º ${nums[0]} a ${nums[nums.length - 1]}).`
        );
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-[#4F46E5]" />
            {proceso ? `Proceso N.º ${proceso.consecutivo}` : "Nuevo proceso disciplinario"}
          </DialogTitle>
          <DialogDescription>
            {proceso ? `${proceso.codigo ? `${proceso.codigo} · ` : ""}${proceso.nombre} · CC ${proceso.cedula}` : "Llamado de atención o citación a descargos, con su medida. Puede agregar varios trabajadores del mismo asunto."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {!proceso && (
            <Seccion titulo={trabajadores.length > 1 ? `Trabajadores (${trabajadores.length})` : "Trabajadores"}>
              <div className="space-y-2 sm:col-span-2">
                {manual ? (
                  <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                    <Campo etiqueta="Cédula">
                      <input className={inputCls} inputMode="numeric" value={manualCedula} onChange={(e) => setManualCedula(e.target.value)} />
                    </Campo>
                    <Campo etiqueta="Nombre completo">
                      <input
                        className={inputCls}
                        value={manualNombre}
                        onChange={(e) => setManualNombre(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregarManual())}
                      />
                    </Campo>
                    <button
                      type="button"
                      onClick={agregarManual}
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] px-3 text-sm font-medium text-[#4338CA] hover:bg-[#E0E7FF]"
                    >
                      <Plus className="h-4 w-4" /> Agregar
                    </button>
                  </div>
                ) : (
                  <BuscadorOpciones
                    id="disciplinario-conductor"
                    opciones={opciones}
                    // Siempre vacío: elegir agrega a la lista y deja el buscador listo para el siguiente.
                    value=""
                    onChange={(v) => {
                      const c = conductores.find((x) => x.cedula === v);
                      if (c) agregar([{ cedula: c.cedula, codigo: c.codigo, nombre: c.nombre, retirado: c.retirado }], true);
                    }}
                    placeholder={trabajadores.length ? "Agregar otro conductor: código, cédula o nombre" : "Código, cédula o nombre del conductor"}
                    vacio={(q) => `Ningún conductor coincide con «${q}».`}
                  />
                )}
                {!manual && (
                  <div className="space-y-1">
                    <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                      <ClipboardList className="h-3.5 w-3.5" /> Varios a la vez
                    </span>
                    <div className="flex gap-2">
                      <input
                        className={inputCls}
                        value={pegado}
                        placeholder="Códigos o cédulas separados por coma: 250, 31, 72345678"
                        onChange={(e) => setPegado(e.target.value)}
                        onPaste={alPegar}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (pegado.trim()) agregarPegados();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={agregarPegados}
                        disabled={!pegado.trim()}
                        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-[#C7D2FE] bg-[#EEF2FF] px-3 text-sm font-medium text-[#4338CA] hover:bg-[#E0E7FF] disabled:opacity-60"
                      >
                        <Plus className="h-4 w-4" /> Agregar
                      </button>
                    </div>
                    <p className="text-xs text-gray-400">
                      Separe con coma, punto y coma o espacio, y pulse Enter. También puede pegar una columna de Excel.
                    </p>
                    {noEncontrados.length > 0 && (
                      <p className="text-xs text-red-600">
                        No están en el maestro ({noEncontrados.length}): {noEncontrados.join(", ")}. Corríjalos arriba o agréguelos escribiendo
                        cédula y nombre.
                      </p>
                    )}
                  </div>
                )}

                <button type="button" onClick={() => setManual((m) => !m)} className="text-xs text-[#4F46E5] hover:underline">
                  {manual ? "Buscar en el maestro de conductores" : "No está en el maestro (otro trabajador): escribir cédula y nombre"}
                </button>

                {trabajadores.length > 0 && (
                  <div className="space-y-1.5">
                    <ul className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                      {trabajadores.map((t) => (
                        <li
                          key={t.cedula}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white py-0.5 pl-2.5 pr-1 text-xs text-gray-700"
                        >
                          <span>
                            {t.codigo ? <span className="font-semibold">{t.codigo} · </span> : null}
                            {t.nombre}
                            <span className="text-gray-400"> · CC {t.cedula}{t.retirado ? " · retirado" : ""}</span>
                          </span>
                          <button
                            type="button"
                            aria-label={`Quitar a ${t.nombre}`}
                            onClick={() => setTrabajadores((prev) => prev.filter((x) => x.cedula !== t.cedula))}
                            className="rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {trabajadores.length > 1 && (
                      <p className="flex items-center justify-between text-xs text-gray-500">
                        <span>Se creará un proceso independiente para cada uno, con los mismos datos.</span>
                        <button type="button" onClick={() => setTrabajadores([])} className="text-gray-500 hover:text-red-600 hover:underline">
                          Quitar todos
                        </button>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Seccion>
          )}

          <Seccion titulo="Cargo y área">
            <Campo etiqueta="Cargo">
              <input
                className={inputCls}
                list="disciplinario-cargos"
                maxLength={MAX_TEXTO_CORTO}
                value={f.cargo}
                placeholder="Conductor-cobrador, auxiliar operativo…"
                onChange={(e) => set("cargo")(e.target.value)}
              />
              <datalist id="disciplinario-cargos">
                {sugerencias.cargos.map((c) => <option key={c} value={c} />)}
              </datalist>
            </Campo>
            <Campo etiqueta="Área">
              <select className={inputCls} value={f.area} onChange={(e) => set("area")(e.target.value)}>
                <option value="">Sin indicar</option>
                {AREAS_PROCESO.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Campo>
          </Seccion>

          <Seccion titulo="Proceso">
            <Campo etiqueta="Tipo" ancho>
              <div className="grid grid-cols-2 rounded-lg border border-[#E2E8F0] p-0.5">
                {TIPOS_PROCESO.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => set("tipo")(t.key)}
                    className={`rounded-md px-2 py-1.5 text-sm font-medium ${f.tipo === t.key ? "bg-[#EEF2FF] text-[#4338CA]" : "text-gray-500"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Campo>
            <Campo etiqueta="Fecha de los hechos">
              <input type="date" className={inputCls} value={f.fechaHecho} max={hoy} onChange={(e) => set("fechaHecho")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Motivo">
              <select className={inputCls} value={f.motivo} onChange={(e) => set("motivo")(e.target.value)}>
                <option value="">Elija…</option>
                {MOTIVOS_PROCESO.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Campo>
            {f.motivo === "otro" && (
              <Campo etiqueta="¿Cuál motivo?" ancho>
                <input className={inputCls} maxLength={120} value={f.motivoDetalle} onChange={(e) => set("motivoDetalle")(e.target.value)} />
              </Campo>
            )}
            <Campo etiqueta="Norma incumplida">
              <select className={inputCls} value={f.normaIncumplida} onChange={(e) => set("normaIncumplida")(e.target.value)}>
                <option value="">Sin indicar</option>
                {NORMAS_INCUMPLIDAS.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Realizado por">
              <input
                className={inputCls}
                list="disciplinario-realizado-por"
                maxLength={MAX_TEXTO_CORTO}
                value={f.realizadoPor}
                placeholder="Quién hizo el proceso"
                onChange={(e) => set("realizadoPor")(e.target.value)}
              />
              <datalist id="disciplinario-realizado-por">
                {sugerencias.realizadoPor.map((r) => <option key={r} value={r} />)}
              </datalist>
            </Campo>
            <Campo etiqueta="Descripción de los hechos" ancho>
              <textarea className={textareaCls} maxLength={MAX_TEXTO_PROCESO} value={f.descripcion} onChange={(e) => set("descripcion")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Responsable">
              <select className={inputCls} value={f.responsable} onChange={(e) => set("responsable")(e.target.value)}>
                <option value="">Sin indicar</option>
                {RESPONSABLES_PROCESO.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Campo>
          </Seccion>

          {esCitacion && (
            <Seccion titulo="Descargos">
              <Campo etiqueta="Fecha de la citación">
                <input type="date" className={inputCls} value={f.fechaCitacion} min={f.fechaHecho} onChange={(e) => set("fechaCitacion")(e.target.value)} />
              </Campo>
              <Campo etiqueta="Fecha de la diligencia de descargos">
                <input
                  type="date"
                  className={inputCls}
                  value={f.fechaDescargos}
                  min={f.fechaCitacion || f.fechaHecho}
                  onChange={(e) => set("fechaDescargos")(e.target.value)}
                />
              </Campo>
              <Campo etiqueta="¿Asistió a descargos?" ancho>
                <div className="grid grid-cols-3 rounded-lg border border-[#E2E8F0] p-0.5">
                  {[
                    ["si", "Sí asistió", "bg-[#DCFCE7] text-[#166534]"],
                    ["no", "No asistió", "bg-[#FEE2E2] text-[#991B1B]"],
                    ["", "Aún no se sabe", "bg-[#F1F5F9] text-gray-700"],
                  ].map(([v, t, activo]) => (
                    <button
                      key={v || "pendiente"}
                      type="button"
                      onClick={() => set("asistio")(v)}
                      className={`rounded-md px-2 py-1.5 text-sm font-medium ${f.asistio === v ? activo : "text-gray-500"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Campo>
              <Campo etiqueta="Resumen de los descargos" ancho>
                <textarea
                  className={textareaCls}
                  maxLength={MAX_TEXTO_PROCESO}
                  value={f.resumenDescargos}
                  placeholder="Qué dijo el trabajador, pruebas presentadas…"
                  onChange={(e) => set("resumenDescargos")(e.target.value)}
                />
              </Campo>
            </Seccion>
          )}

          <Seccion titulo="Medida ejecutada">
            <Campo etiqueta="Medida">
              <select className={inputCls} value={f.medida} onChange={(e) => set("medida")(e.target.value)}>
                {/* «No registrada» solo existe en el histórico; se muestra si el proceso ya la tiene. */}
                {MEDIDAS_PROCESO.filter((m) => m.key !== "no_registrada" || proceso?.medida === "no_registrada").map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Fecha de la medida">
              <input type="date" className={inputCls} value={f.fechaMedida} min={f.fechaHecho} onChange={(e) => set("fechaMedida")(e.target.value)} />
            </Campo>
            {f.medida === "suspension" && (
              <Campo etiqueta="Días de suspensión">
                <input type="number" min={1} max={60} className={inputCls} value={f.diasSuspension} onChange={(e) => set("diasSuspension")(e.target.value)} />
              </Campo>
            )}
            <Campo etiqueta={f.medida === "otra" ? "¿Cuál medida?" : "Detalle de la medida (opcional)"} ancho>
              <textarea className={textareaCls} maxLength={MAX_TEXTO_PROCESO} value={f.medidaDetalle} onChange={(e) => set("medidaDetalle")(e.target.value)} />
            </Campo>
          </Seccion>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {proceso ? "Guardar cambios" : trabajadores.length > 1 ? `Registrar ${trabajadores.length} procesos` : "Registrar proceso"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
