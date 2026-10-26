"use client";

/**
 * Biblioteca de imágenes y videos de la pantalla. La usan la pestaña «Imágenes
 * y videos» (gestionar) y el selector del editor (elegir). Sube varios a la vez
 * directo a Storage (`subida-cliente.ts`) y muestra el estado de cada uno.
 */

import { useRef, useState } from "react";
import { AlertCircle, Film, ImageIcon, Loader2, Play, Trash2, Upload } from "lucide-react";
import { eliminarMedio } from "@/lib/pantalla/actions";
import type { MedioBiblioteca } from "@/lib/pantalla/consultas";
import { ACEPTA_INPUT, formatoBytes, formatoDuracion } from "@/lib/pantalla/medios-reglas";
import { subirMedio, type EstadoSubida } from "@/lib/pantalla/subida-cliente";

type Subida = { id: string; nombre: string; estado: EstadoSubida | "error"; error?: string; bytes: number };

const TEXTO_ESTADO: Record<EstadoSubida, string> = {
  midiendo: "Preparando…",
  subiendo: "Subiendo…",
  registrando: "Guardando…",
  listo: "Listo",
};

export function BibliotecaMedios({
  medios,
  onCambio,
  onElegir,
  filtro = "todos",
  gestionar = false,
  enUsoAqui,
}: {
  /** En el editor: ¿lo usa la presentación abierta (aunque no se haya guardado todavía)? */
  enUsoAqui?: (m: MedioBiblioteca) => boolean;
  medios: MedioBiblioteca[];
  /** Recibe una función de actualización (como `setState`): las subidas terminan en desorden. */
  onCambio: (fn: (lista: MedioBiblioteca[]) => MedioBiblioteca[]) => void;
  onElegir?: (m: MedioBiblioteca) => void;
  filtro?: "todos" | "imagen" | "video";
  gestionar?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ver, setVer] = useState<"todos" | "imagen" | "video">(filtro);

  const elegir = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const lista = Array.from(files);
    const nuevas = lista.map((f) => ({ id: `${f.name}-${f.size}-${Math.random()}`, nombre: f.name, estado: "midiendo" as const, bytes: f.size }));
    setSubidas((s) => [...nuevas, ...s]);
    // De a una: varios videos grandes en paralelo saturan la red de la oficina.
    for (let i = 0; i < lista.length; i++) {
      const id = nuevas[i].id;
      const set = (cambio: Partial<Subida>) => setSubidas((s) => s.map((x) => (x.id === id ? { ...x, ...cambio } : x)));
      try {
        const m = await subirMedio(lista[i], (estado) => set({ estado }));
        onCambio((l) => [m, ...l]);
        setSubidas((s) => s.filter((x) => x.id !== id));
      } catch (e) {
        set({ estado: "error", error: e instanceof Error ? e.message : "No se pudo subir." });
      }
    }
    if (input.current) input.current.value = "";
  };

  const [aBorrar, setABorrar] = useState<MedioBiblioteca | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);

  const confirmarBorrado = async () => {
    if (!aBorrar) return;
    if (enUsoAqui?.(aBorrar)) {
      return setErrorBorrar("Está en uso en esta presentación. Quítelo de las diapositivas primero.");
    }
    setBorrando(true);
    setErrorBorrar(null);
    const r = await eliminarMedio(aBorrar.id);
    setBorrando(false);
    if (!r.ok) return setErrorBorrar(r.error);
    const id = aBorrar.id;
    onCambio((l) => l.filter((x) => x.id !== id));
    setABorrar(null);
  };

  const visibles = medios.filter((m) => ver === "todos" || m.tipo === ver);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {filtro === "todos" ? (
          <div className="inline-flex rounded-lg border border-[#E2E8F0] p-0.5 text-sm">
            {(["todos", "imagen", "video"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVer(v)}
                className={`rounded-md px-3 py-1 ${ver === v ? "bg-[#EEF2FF] font-medium text-[#4F46E5]" : "text-gray-600 hover:bg-gray-50"}`}
              >
                {v === "todos" ? "Todo" : v === "imagen" ? "Imágenes" : "Videos"}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-sm text-gray-500">{filtro === "video" ? "Videos" : "Imágenes"} de la biblioteca</span>
        )}
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-gray-400 sm:inline">JPG, PNG, WebP hasta 4 MB · MP4 (H.264) o WebM hasta 150 MB</span>
          <button
            onClick={() => input.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA]"
          >
            <Upload className="h-4 w-4" /> Subir
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept={filtro === "imagen" ? "image/jpeg,image/png,image/webp" : filtro === "video" ? "video/mp4,video/webm" : ACEPTA_INPUT}
            className="hidden"
            onChange={(e) => void elegir(e.target.files)}
          />
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {subidas.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {subidas.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
              {s.estado === "error" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#4F46E5]" />
              )}
              <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
              <span className="text-xs text-gray-400">{formatoBytes(s.bytes)}</span>
              <span className={`text-xs ${s.estado === "error" ? "text-red-600" : "text-gray-500"}`}>
                {s.estado === "error" ? s.error : TEXTO_ESTADO[s.estado]}
              </span>
              {s.estado === "error" && (
                <button onClick={() => setSubidas((x) => x.filter((y) => y.id !== s.id))} className="text-xs text-gray-400 hover:text-gray-600">
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[#E2E8F0] py-12 text-center text-sm text-gray-400">
          <ImageIcon className="h-8 w-8 text-gray-300" />
          {ver === "video" ? "No hay videos todavía." : ver === "imagen" ? "No hay imágenes todavía." : "La biblioteca está vacía. Suba imágenes o videos."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visibles.map((m) => {
            const miniatura = m.tipo === "video" ? m.posterUrl : m.url;
            const contenido = (
              <>
                <div className="relative aspect-video w-full overflow-hidden rounded-md bg-gray-100">
                  {miniatura ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={miniatura} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300">
                      {m.tipo === "video" ? <Film className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
                    </div>
                  )}
                  {m.tipo === "video" && (
                    <span className="absolute right-1.5 bottom-1.5 inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
                      <Play className="h-3 w-3 fill-white" /> {formatoDuracion(m.duracionSeg)}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 truncate text-left text-xs font-medium text-gray-700">{m.nombre}</div>
              </>
            );
            return (
              <div key={m.id} className="relative rounded-lg border border-[#E2E8F0] p-1.5 hover:border-[#4F46E5]">
                {onElegir ? (
                  <button className="block w-full" onClick={() => onElegir(m)}>
                    {contenido}
                  </button>
                ) : (
                  contenido
                )}
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-left text-[11px] text-gray-400">
                    {formatoBytes(m.bytes)}
                    {m.ancho && m.alto ? ` · ${m.ancho}×${m.alto}` : ""}
                  </span>
                  {gestionar && (
                    <button
                      onClick={() => {
                        setErrorBorrar(null);
                        setABorrar(m);
                      }}
                      title={`Eliminar ${m.nombre}`}
                      aria-label={`Eliminar ${m.nombre}`}
                      className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {aBorrar && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && !borrando && setABorrar(null)}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" role="dialog" aria-modal>
            <div className="flex items-start gap-3">
              <div className="h-14 w-24 shrink-0 overflow-hidden rounded-md bg-gray-100">
                {(aBorrar.tipo === "video" ? aBorrar.posterUrl : aBorrar.url) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(aBorrar.tipo === "video" ? aBorrar.posterUrl : aBorrar.url) ?? ""} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900">¿Eliminar {aBorrar.tipo === "video" ? "el video" : "la imagen"}?</h3>
                <p className="mt-0.5 truncate text-sm text-gray-600">{aBorrar.nombre}</p>
                <p className="mt-1 text-xs text-gray-400">Se borra el archivo. No se puede deshacer.</p>
              </div>
            </div>
            {errorBorrar && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{errorBorrar}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setABorrar(null)}
                disabled={borrando}
                className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {errorBorrar ? "Cerrar" : "Cancelar"}
              </button>
              {!errorBorrar && (
                <button
                  onClick={() => void confirmarBorrado()}
                  disabled={borrando}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {borrando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Eliminar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
