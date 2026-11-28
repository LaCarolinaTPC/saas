"use client";

/**
 * Reporte diario por correo (24-nov-2026): a quién le llega, verlo como llega
 * y enviarlo ya. Las cifras son las mismas de esta pantalla (ayer y los
 * últimos 30 días hasta ayer).
 */
import { useState, useTransition } from "react";
import { Eye, Mail, Send, X } from "lucide-react";
import { enviarReporteAhora, guardarConfigReporte, vistaReporteDiario } from "./reporte-actions";

const CAMPO = "mt-1 h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#4F46E5] disabled:bg-[#F8FAFC]";
const BOTON = "inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50";

export function ReporteDiarioConfig({ inicial }: { inicial: { activo: boolean; para: string[]; copia: string[]; puedeEditar: boolean } }) {
  const [activo, setActivo] = useState(inicial.activo);
  const [para, setPara] = useState(inicial.para.join(", "));
  const [copia, setCopia] = useState(inicial.copia.join(", "));
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const [vista, setVista] = useState<{ html: string; asunto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const editar = inicial.puedeEditar;
  const cambio = activo !== inicial.activo || para !== inicial.para.join(", ") || copia !== inicial.copia.join(", ");

  const correr = (f: () => Promise<void>) => {
    setMensaje(null);
    enTransicion(async () => {
      try {
        await f();
      } catch (e) {
        setMensaje({ texto: e instanceof Error ? e.message : "No se pudo completar.", error: true });
      }
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
        <Mail className="h-4 w-4" /> Reporte diario por correo
      </h2>
      <p className="mt-0.5 text-xs text-text-tertiary">
        Todos los días a las 7:00 llega lo de ayer y los últimos 30 días (hasta ayer), con las mismas cifras de esta pantalla: embudo, dónde están, por qué se
        cerraron, por qué canal llegaron y los mensajes.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-[auto_1fr_1fr] md:items-end">
        <label className="flex h-9 items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={activo} disabled={!editar} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4 accent-[#4F46E5]" />
          Enviarlo cada día
        </label>
        <label className="text-xs text-text-tertiary">
          Para (separados por comas)
          <input className={CAMPO} value={para} disabled={!editar} onChange={(e) => setPara(e.target.value)} placeholder="gestionhumana@empresa.com" />
        </label>
        <label className="text-xs text-text-tertiary">
          Con copia a
          <input className={CAMPO} value={copia} disabled={!editar} onChange={(e) => setCopia(e.target.value)} placeholder="soporte@empresa.com" />
        </label>
      </div>
      {editar ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${BOTON} border-[#4F46E5] bg-[#4F46E5] text-white hover:bg-[#4338CA]`}
            disabled={ocupado || !cambio}
            onClick={() =>
              correr(async () => {
                const r = await guardarConfigReporte({ activo, para, copia });
                setMensaje(r.ok ? { texto: "Guardado.", error: false } : { texto: r.error ?? "No se pudo guardar.", error: true });
              })
            }
          >
            Guardar
          </button>
          <button
            type="button"
            className={BOTON}
            disabled={ocupado}
            onClick={() =>
              correr(async () => {
                const r = await vistaReporteDiario();
                if (r.ok && r.html) setVista({ html: r.html, asunto: r.asunto ?? "" });
                else setMensaje({ texto: r.error ?? "No se pudo armar el reporte.", error: true });
              })
            }
          >
            <Eye className="h-4 w-4" /> Ver cómo llega
          </button>
          <button
            type="button"
            className={BOTON}
            disabled={ocupado || cambio}
            title={cambio ? "Guarde primero los cambios" : undefined}
            onClick={() =>
              correr(async () => {
                const r = await enviarReporteAhora();
                setMensaje(
                  r.ok
                    ? { texto: `Enviado a ${(r.para ?? []).join(", ")}${r.copia?.length ? `, con copia a ${r.copia.join(", ")}` : ""}.`, error: false }
                    : { texto: r.error ?? "No se pudo enviar.", error: true }
                );
              })
            }
          >
            <Send className="h-4 w-4" /> Enviar ahora
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-text-tertiary">Para cambiarlo hace falta el permiso de configuración de la selección.</p>
      )}
      {ocupado && <p className="mt-2 text-xs text-text-tertiary">Un momento…</p>}
      {mensaje && <p className={`mt-2 text-xs ${mensaje.error ? "text-red-700" : "text-emerald-700"}`}>{mensaje.texto}</p>}

      {vista && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setVista(null)}>
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-[#F1F5F9] px-4 py-3">
              <p className="truncate text-sm font-semibold text-text-primary">{vista.asunto}</p>
              <button type="button" onClick={() => setVista(null)} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe title="Vista del reporte diario" srcDoc={vista.html} sandbox="" className="h-[75vh] w-full rounded-b-xl" />
          </div>
        </div>
      )}
    </section>
  );
}
