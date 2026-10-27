"use client";

/**
 * Seguimiento de RRHH a un conductor reincidente: la etiqueta de la columna
 * «Seguimiento» y el diálogo con el historial y el formulario (nuevo o
 * edición). Reglas y catálogos en src/lib/ausentismo/seguimiento-reglas.ts.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, ClipboardList, Loader2, Pencil, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Reincidente } from "@/lib/ausentismo/data";
import {
  EJEMPLO_COMPROMISO_EMPRESA,
  ESTADOS_SEGUIMIENTO,
  MAX_TEXTO_SEGUIMIENTO,
  MOTIVOS_SEGUIMIENTO,
  RESPONSABLES_SEGUIMIENTO,
  TIPOS_SEGUIMIENTO,
  etiquetaEstado,
  etiquetaMotivo,
  etiquetaResponsable,
  etiquetaSeguimiento,
  etiquetaTipo,
  sugeridos,
  type ClaveEtiqueta,
  type EstadoSeguimiento,
  type Seguimiento,
  type SeguimientoResumen,
} from "@/lib/ausentismo/seguimiento-reglas";
import { actualizarSeguimiento, crearSeguimiento, listarSeguimientos } from "../actions";

const COLOR: Record<ClaveEtiqueta, { fondo: string; texto: string }> = {
  sin: { fondo: "#F1F5F9", texto: "#475569" },
  en_seguimiento: { fondo: "#DBEAFE", texto: "#1E40AF" },
  cumplido: { fondo: "#DCFCE7", texto: "#166534" },
  incumplido: { fondo: "#FEE2E2", texto: "#991B1B" },
};

const COLOR_ESTADO: Record<EstadoSeguimiento, ClaveEtiqueta> = {
  abierto: "en_seguimiento",
  cumplido: "cumplido",
  incumplido: "incumplido",
};

/** Etiqueta de la columna «Seguimiento» con el aviso de vencido o revisión. */
export function EtiquetaSeguimiento({ ultimo, total, hoy }: { ultimo: SeguimientoResumen | null; total: number; hoy: string }) {
  const e = etiquetaSeguimiento(ultimo, hoy);
  const c = COLOR[e.clave];
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: c.fondo, color: c.texto }}>
        {e.texto}
      </span>
      {e.textoAviso && (
        <span className={`text-[11px] leading-tight ${e.aviso === "revisar_hoy" ? "text-amber-700" : "font-semibold text-red-700"}`}>{e.textoAviso}</span>
      )}
      {total > 1 && <span className="text-[11px] leading-tight text-gray-500">{total} seguimientos</span>}
    </span>
  );
}

type Formulario = {
  tipo: string;
  fecha: string;
  responsable: string;
  motivo: string;
  accion: string;
  compromisoConductor: string;
  compromisoEmpresa: string;
  fechaLimite: string;
  estado: EstadoSeguimiento;
  proximaRevision: string;
};

function formularioNuevo(r: Reincidente, hoy: string): Formulario {
  const s = sugeridos(r);
  return {
    tipo: s.tipo,
    fecha: hoy,
    responsable: "",
    motivo: s.motivo,
    accion: "",
    compromisoConductor: "",
    compromisoEmpresa: "",
    fechaLimite: "",
    estado: "abierto",
    proximaRevision: "",
  };
}

function formularioDe(s: Seguimiento): Formulario {
  return {
    tipo: s.tipo,
    fecha: s.fecha,
    responsable: s.responsable,
    motivo: s.motivo,
    accion: s.accion ?? "",
    compromisoConductor: s.compromisoConductor ?? "",
    compromisoEmpresa: s.compromisoEmpresa ?? "",
    fechaLimite: s.fechaLimite ?? "",
    estado: s.estado,
    proximaRevision: s.proximaRevision ?? "",
  };
}

const inputCls = "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const textareaCls = "min-h-[64px] w-full resize-y rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";

function Campo({ etiqueta, children, ancho = false }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${ancho ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{etiqueta}</span>
      {children}
    </label>
  );
}

/**
 * Diálogo de seguimiento de un reincidente. Carga el historial al abrir y
 * permite registrar uno nuevo o editar uno existente (p. ej. para cerrarlo).
 */
export function SeguimientoDialog({ r, hoy, onClose }: { r: Reincidente; hoy: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [historial, setHistorial] = useState<Seguimiento[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // null = mostrando el historial; si no, el formulario (nuevo o edición).
  const [editando, setEditando] = useState<{ id: string | null; f: Formulario } | null>(null);

  useEffect(() => {
    let vivo = true;
    void listarSeguimientos(r.cedula).then((res) => {
      if (!vivo) return;
      if (!res.success) setErrorCarga(res.error ?? "No se pudo cargar el historial.");
      else {
        setHistorial(res.seguimientos ?? []);
        // Sin seguimientos todavía: se abre directo el formulario.
        if ((res.seguimientos ?? []).length === 0) setEditando({ id: null, f: formularioNuevo(r, hoy) });
      }
    });
    return () => {
      vivo = false;
    };
  }, [r, hoy]);

  const cambiar = (k: keyof Formulario) => (v: string) => setEditando((e) => (e ? { ...e, f: { ...e.f, [k]: v } } : e));

  function guardar() {
    if (!editando) return;
    const { id, f } = editando;
    start(async () => {
      const res = id
        ? await actualizarSeguimiento(id, f)
        : await crearSeguimiento({ cedula: r.cedula, codigo: r.codigo, nombre: r.nombre, datos: f });
      if (!res.success || !res.seguimiento) {
        toast.error(res.error ?? "No se pudo guardar el seguimiento.");
        return;
      }
      toast.success(id ? "Seguimiento actualizado." : "Seguimiento registrado.");
      const nuevo = res.seguimiento;
      setHistorial((h) => {
        const resto = (h ?? []).filter((s) => s.id !== nuevo.id);
        return [nuevo, ...resto].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt));
      });
      setEditando(null);
      router.refresh();
    });
  }

  const resumen = [
    r.noJustificadas ? `${r.noJustificadas} sin justificar` : "",
    r.incapacidades ? `${r.incapacidades} incapacidades (${r.diasIncapacidad} d)` : "",
    r.eps ? `${r.eps} citas EPS` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-[#4F46E5]" /> Seguimiento · {r.codigo ? `${r.codigo} · ` : ""}
            {r.nombre}
          </DialogTitle>
          <DialogDescription>
            CC {r.cedula}
            {resumen ? ` · ${resumen}` : ""}
          </DialogDescription>
        </DialogHeader>

        {errorCarga && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorCarga}</p>}
        {!historial && !errorCarga && (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando historial…
          </p>
        )}

        {editando ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Tipo">
                <select className={inputCls} value={editando.f.tipo} onChange={(e) => cambiar("tipo")(e.target.value)}>
                  {TIPOS_SEGUIMIENTO.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Motivo / hallazgo">
                <select className={inputCls} value={editando.f.motivo} onChange={(e) => cambiar("motivo")(e.target.value)}>
                  {MOTIVOS_SEGUIMIENTO.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Fecha">
                <input type="date" className={inputCls} value={editando.f.fecha} max={hoy} onChange={(e) => cambiar("fecha")(e.target.value)} />
              </Campo>
              <Campo etiqueta="Responsable">
                <select className={inputCls} value={editando.f.responsable} onChange={(e) => cambiar("responsable")(e.target.value)}>
                  <option value="">Elija…</option>
                  {RESPONSABLES_SEGUIMIENTO.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Acción realizada" ancho>
                <textarea
                  className={textareaCls}
                  maxLength={MAX_TEXTO_SEGUIMIENTO}
                  value={editando.f.accion}
                  placeholder="Ej: llamada, reunión, visita, remisión a SST…"
                  onChange={(e) => cambiar("accion")(e.target.value)}
                />
              </Campo>
              <Campo etiqueta="Compromiso del conductor">
                <textarea
                  className={textareaCls}
                  maxLength={MAX_TEXTO_SEGUIMIENTO}
                  value={editando.f.compromisoConductor}
                  onChange={(e) => cambiar("compromisoConductor")(e.target.value)}
                />
              </Campo>
              <Campo etiqueta="Compromiso de la empresa">
                <textarea
                  className={textareaCls}
                  maxLength={MAX_TEXTO_SEGUIMIENTO}
                  value={editando.f.compromisoEmpresa}
                  placeholder={`Ej: ${EJEMPLO_COMPROMISO_EMPRESA}`}
                  onChange={(e) => cambiar("compromisoEmpresa")(e.target.value)}
                />
              </Campo>
              <Campo etiqueta="Fecha límite">
                <input type="date" className={inputCls} value={editando.f.fechaLimite} min={editando.f.fecha} onChange={(e) => cambiar("fechaLimite")(e.target.value)} />
              </Campo>
              <Campo etiqueta="Próxima revisión">
                <input type="date" className={inputCls} value={editando.f.proximaRevision} onChange={(e) => cambiar("proximaRevision")(e.target.value)} />
              </Campo>
              <Campo etiqueta="Estado" ancho>
                <div className="grid grid-cols-3 rounded-lg border border-[#E2E8F0] p-0.5">
                  {ESTADOS_SEGUIMIENTO.map((e) => {
                    const activo = editando.f.estado === e.key;
                    const c = COLOR[COLOR_ESTADO[e.key]];
                    return (
                      <button
                        key={e.key}
                        type="button"
                        onClick={() => cambiar("estado")(e.key)}
                        className="rounded-md px-2 py-1.5 text-sm font-medium"
                        style={activo ? { backgroundColor: c.fondo, color: c.texto } : { color: "#64748B" }}
                      >
                        {e.label}
                      </button>
                    );
                  })}
                </div>
              </Campo>
            </div>
            <div className="flex justify-end gap-2">
              {(historial?.length ?? 0) > 0 && (
                <button type="button" onClick={() => setEditando(null)} className="h-9 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100">
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={guardar}
                disabled={pending}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-60"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editando.id ? "Guardar cambios" : "Registrar seguimiento"}
              </button>
            </div>
          </div>
        ) : (
          historial && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setEditando({ id: null, f: formularioNuevo(r, hoy) })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 text-sm font-medium text-white hover:bg-[#4338CA]"
                >
                  <Plus className="h-4 w-4" /> Nuevo seguimiento
                </button>
              </div>
              <ul className="space-y-3">
                {historial.map((s) => {
                  const c = COLOR[COLOR_ESTADO[s.estado]];
                  const vencido = s.estado === "abierto" && s.fechaLimite && s.fechaLimite < hoy;
                  return (
                    <li key={s.id} className="rounded-xl border border-[#E2E8F0] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold text-gray-900">{s.fecha}</span>
                          <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: c.fondo, color: c.texto }}>
                            {etiquetaEstado(s.estado)}
                          </span>
                          <span className="text-gray-600">
                            {etiquetaTipo(s.tipo)} · {etiquetaMotivo(s.motivo)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditando({ id: s.id, f: formularioDe(s) })}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[#4F46E5] hover:bg-[#EEF2FF]"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                      </div>
                      <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                        {[
                          ["Acción realizada", s.accion],
                          ["Compromiso del conductor", s.compromisoConductor],
                          ["Compromiso de la empresa", s.compromisoEmpresa],
                        ]
                          .filter(([, v]) => v)
                          .map(([k, v]) => (
                            <div key={k} className="sm:col-span-2">
                              <dt className="text-xs text-gray-500">{k}</dt>
                              <dd className="whitespace-pre-line text-gray-800">{v}</dd>
                            </div>
                          ))}
                      </dl>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span>Responsable: {etiquetaResponsable(s.responsable)}</span>
                        {s.fechaLimite && <span className={vencido ? "font-semibold text-red-700" : ""}>Fecha límite: {s.fechaLimite}{vencido ? " (vencida)" : ""}</span>}
                        {s.proximaRevision && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" /> Próxima revisión: {s.proximaRevision}
                          </span>
                        )}
                        <span>
                          Registró {s.createdByEmail ?? "—"}
                          {s.updatedByEmail ? ` · modificó ${s.updatedByEmail} el ${s.updatedAt?.slice(0, 10)}` : ""}
                        </span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
