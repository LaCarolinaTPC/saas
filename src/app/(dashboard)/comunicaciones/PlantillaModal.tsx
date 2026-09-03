"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutTemplate, Loader2, Send, X } from "lucide-react";
import type { Plantilla } from "@/lib/comunicaciones/whatsapp";
import { enviarMensajePlantilla, obtenerPlantillas } from "@/lib/comunicaciones/actions";

function contarVariables(texto: string | undefined): number {
  if (!texto) return 0;
  let max = 0;
  for (const m of texto.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

function renderizar(texto: string, valores: string[]): string {
  return texto.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] || `{{${n}}}`);
}

const CATEGORIA: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidad",
  AUTHENTICATION: "Autenticación",
};

/**
 * Selector y envío de plantillas aprobadas de Meta. Con `conversacionId`
 * escribe en un hilo existente; sin él pide un teléfono y abre uno nuevo.
 */
export default function PlantillaModal({
  conversacionId,
  destinatario,
  onCerrar,
  onEnviado,
}: {
  conversacionId?: string;
  destinatario?: string;
  onCerrar: () => void;
  onEnviado: (conversacionId: string) => void;
}) {
  const [cargando, setCargando] = useState(true);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [seleccionada, setSeleccionada] = useState<Plantilla | null>(null);
  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [encabezado, setEncabezado] = useState<string[]>([]);
  const [cuerpo, setCuerpo] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    obtenerPlantillas().then((r) => {
      if (!vivo) return;
      setCargando(false);
      if (r.ok) setPlantillas(r.plantillas);
      else setErrorCarga(r.error);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const cabecera = seleccionada?.componentes.find((c) => c.type === "HEADER");
  const cuerpoComp = seleccionada?.componentes.find((c) => c.type === "BODY");
  const pie = seleccionada?.componentes.find((c) => c.type === "FOOTER");
  const botones = seleccionada?.componentes.find((c) => c.type === "BUTTONS")?.buttons ?? [];
  const cabeceraConArchivo = !!cabecera?.format && cabecera.format !== "TEXT";

  const nEncabezado = useMemo(() => contarVariables(cabecera?.text), [cabecera]);
  const nCuerpo = useMemo(() => contarVariables(cuerpoComp?.text), [cuerpoComp]);

  function seleccionar(p: Plantilla) {
    setSeleccionada(p);
    setError(null);
    const h = p.componentes.find((c) => c.type === "HEADER");
    const b = p.componentes.find((c) => c.type === "BODY");
    setEncabezado(Array.from({ length: contarVariables(h?.text) }, () => ""));
    setCuerpo(Array.from({ length: contarVariables(b?.text) }, () => ""));
  }

  const completa =
    !!seleccionada &&
    !cabeceraConArchivo &&
    encabezado.every((v) => v.trim()) &&
    cuerpo.every((v) => v.trim()) &&
    (!!conversacionId || telefono.replace(/\D/g, "").length >= 10);

  async function onEnviar() {
    if (!seleccionada || !completa || enviando) return;
    setEnviando(true);
    setError(null);
    const r = await enviarMensajePlantilla({
      conversacionId,
      telefono: conversacionId ? undefined : telefono,
      nombreContacto: conversacionId ? undefined : nombre,
      plantilla: seleccionada,
      encabezado,
      cuerpo,
    });
    setEnviando(false);
    if (!r.ok) {
      setError(r.error ?? "No se pudo enviar.");
      if (r.conversacionId && !conversacionId) onEnviado(r.conversacionId);
      return;
    }
    onEnviado(r.conversacionId ?? conversacionId ?? "");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
      role="dialog"
      aria-modal="true"
      aria-label="Enviar plantilla"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <LayoutTemplate className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-text-primary">
              {conversacionId ? "Enviar plantilla" : "Nueva conversación"}
            </h2>
            <p className="truncate text-xs text-text-tertiary">
              {conversacionId
                ? `Para ${destinatario ?? "el contacto"} · las plantillas se envían aunque la ventana de 24 h esté cerrada`
                : "Solo se puede iniciar un chat con una plantilla aprobada por Meta"}
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-text-muted hover:bg-slate-100 cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[260px_1fr]">
          {/* Lista de plantillas */}
          <div className="min-h-0 overflow-y-auto border-b border-border md:border-b-0 md:border-r">
            {cargando ? (
              <div className="flex items-center gap-2 p-4 text-xs text-text-tertiary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo plantillas de Meta…
              </div>
            ) : errorCarga ? (
              <p className="p-4 text-xs text-red-700">{errorCarga}</p>
            ) : plantillas.length === 0 ? (
              <p className="p-4 text-xs text-text-tertiary">
                No hay plantillas aprobadas. Se crean en el Business Manager de Meta y tardan unas horas en aprobarse.
              </p>
            ) : (
              plantillas.map((p) => (
                <button
                  key={p.id}
                  onClick={() => seleccionar(p)}
                  className={`block w-full border-b border-border/60 px-4 py-2.5 text-left cursor-pointer ${
                    seleccionada?.id === p.id ? "bg-primary/5" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="truncate text-sm font-medium text-text-primary">{p.nombre}</div>
                  <div className="text-[11px] text-text-tertiary">
                    {CATEGORIA[p.categoria] ?? p.categoria} · {p.idioma}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Detalle */}
          <div className="min-h-0 space-y-4 overflow-y-auto p-5">
            {!conversacionId && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-text-secondary">Teléfono</span>
                  <input
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="3001234567 o +57…"
                    inputMode="tel"
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-text-secondary">Nombre (opcional)</span>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Como aparecerá en la bandeja"
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  />
                </label>
              </div>
            )}

            {!seleccionada ? (
              <p className="text-xs text-text-tertiary">Elige una plantilla de la lista.</p>
            ) : (
              <>
                {cabeceraConArchivo && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Esta plantilla lleva un encabezado con {cabecera?.format?.toLowerCase()}; por ahora solo se envían plantillas de texto.
                  </p>
                )}

                {(nEncabezado > 0 || nCuerpo > 0) && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-text-secondary">Variables</span>
                    {encabezado.map((v, i) => (
                      <input
                        key={`h${i}`}
                        value={v}
                        onChange={(e) =>
                          setEncabezado((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                        }
                        placeholder={`Encabezado {{${i + 1}}}`}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      />
                    ))}
                    {cuerpo.map((v, i) => (
                      <input
                        key={`b${i}`}
                        value={v}
                        onChange={(e) =>
                          setCuerpo((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                        }
                        placeholder={`Variable {{${i + 1}}}`}
                        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      />
                    ))}
                  </div>
                )}

                <div>
                  <span className="text-xs font-medium text-text-secondary">Vista previa</span>
                  <div className="mt-1 max-w-md rounded-2xl rounded-bl-md border border-border bg-slate-50 px-3 py-2 text-sm text-text-primary shadow-sm">
                    {cabecera?.text && (
                      <p className="mb-1 font-semibold">{renderizar(cabecera.text, encabezado)}</p>
                    )}
                    {cuerpoComp?.text && (
                      <p className="whitespace-pre-wrap break-words">{renderizar(cuerpoComp.text, cuerpo)}</p>
                    )}
                    {pie?.text && <p className="mt-1 text-xs text-text-tertiary">{pie.text}</p>}
                    {botones.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2">
                        {botones.map((b, i) => (
                          <div key={i} className="rounded-lg bg-white py-1 text-center text-xs font-medium text-sky-600">
                            {b.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            onClick={onCerrar}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-slate-50 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={onEnviar}
            disabled={!completa || enviando}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
          >
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar plantilla
          </button>
        </div>
      </div>
    </div>
  );
}
