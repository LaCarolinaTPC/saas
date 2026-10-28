"use client";

/**
 * Formulario de un proceso disciplinario (nuevo o edición): trabajador,
 * tipo, hechos y motivo, citación y asistencia a descargos (solo citación) y
 * la medida tomada. Reglas en src/lib/disciplinarios/reglas.ts.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gavel, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BuscadorOpciones, type OpcionBuscable } from "@/components/ui/buscador-opciones";
import type { OpcionConductor } from "@/lib/disciplinarios/data";
import {
  MAX_TEXTO_PROCESO,
  MEDIDAS_PROCESO,
  MOTIVOS_PROCESO,
  RESPONSABLES_PROCESO,
  TIPOS_PROCESO,
  type Proceso,
} from "@/lib/disciplinarios/reglas";
import { actualizarProceso, crearProceso } from "./actions";

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
};

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
  onClose,
}: {
  /** null = proceso nuevo. */
  proceso: Proceso | null;
  conductores: OpcionConductor[];
  hoy: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<Formulario>(() => formularioDe(proceso, hoy));
  const set = (k: keyof Formulario) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  // Trabajador: del maestro de conductores o, si no está, escrito a mano.
  const [cedula, setCedula] = useState(proceso?.cedula ?? "");
  const [manual, setManual] = useState(false);
  const [manualNombre, setManualNombre] = useState("");
  const [manualCedula, setManualCedula] = useState("");
  const opciones: OpcionBuscable[] = useMemo(
    () =>
      conductores.map((c) => ({
        valor: c.cedula,
        etiqueta: `${c.codigo ? `${c.codigo} · ` : ""}${c.nombre}`,
        secundario: `CC ${c.cedula}${c.retirado ? " · retirado" : ""}`,
        claves: [c.codigo ?? "", c.cedula, c.nombre],
      })),
    [conductores]
  );
  const elegido = conductores.find((c) => c.cedula === cedula) ?? null;
  const esCitacion = f.tipo === "citacion_descargos";

  function guardar() {
    const datos = { ...f, asistio: f.asistio === "si" ? true : f.asistio === "no" ? false : null };
    start(async () => {
      let res;
      if (proceso) res = await actualizarProceso(proceso.id, datos);
      else {
        const persona = manual
          ? { cedula: manualCedula, codigo: null, nombre: manualNombre }
          : elegido
            ? { cedula: elegido.cedula, codigo: elegido.codigo, nombre: elegido.nombre }
            : null;
        if (!persona || !persona.cedula.trim() || !persona.nombre.trim()) {
          toast.error("Elija el conductor (o escriba cédula y nombre si no está en el maestro).");
          return;
        }
        res = await crearProceso({ ...persona, datos });
      }
      if (!res.success) {
        toast.error(res.error ?? "No se pudo guardar el proceso.");
        return;
      }
      toast.success(proceso ? `Proceso N.º ${res.proceso?.consecutivo} actualizado.` : `Proceso N.º ${res.proceso?.consecutivo} registrado.`);
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
            {proceso ? `${proceso.codigo ? `${proceso.codigo} · ` : ""}${proceso.nombre} · CC ${proceso.cedula}` : "Llamado de atención o citación a descargos, con su medida."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {!proceso && (
            <Seccion titulo="Trabajador">
              <div className="sm:col-span-2">
                {manual ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo etiqueta="Cédula">
                      <input className={inputCls} inputMode="numeric" value={manualCedula} onChange={(e) => setManualCedula(e.target.value)} />
                    </Campo>
                    <Campo etiqueta="Nombre completo">
                      <input className={inputCls} value={manualNombre} onChange={(e) => setManualNombre(e.target.value)} />
                    </Campo>
                  </div>
                ) : (
                  <BuscadorOpciones
                    id="disciplinario-conductor"
                    opciones={opciones}
                    value={cedula}
                    onChange={setCedula}
                    placeholder="Código, cédula o nombre del conductor"
                    vacio={(q) => `Ningún conductor coincide con «${q}».`}
                  />
                )}
                <button type="button" onClick={() => setManual((m) => !m)} className="mt-1.5 text-xs text-[#4F46E5] hover:underline">
                  {manual ? "Buscar en el maestro de conductores" : "No está en el maestro (otro trabajador): escribir cédula y nombre"}
                </button>
              </div>
            </Seccion>
          )}

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
                {MEDIDAS_PROCESO.map((m) => (
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
              {proceso ? "Guardar cambios" : "Registrar proceso"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
