"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Film, Loader2, X } from "lucide-react";
import { listarFotosAccidentes, type FotoAccidente } from "@/lib/pantalla/actions";
import type { MedioBiblioteca } from "@/lib/pantalla/consultas";
import { NOMBRE_PROVEEDOR, interpretarEnlace, miniaturaDe, type RefVideoWeb } from "@/lib/pantalla/enlaces-video";
import { formatoDuracion } from "@/lib/pantalla/medios-reglas";
import { BibliotecaMedios } from "../BibliotecaMedios";
import { medirVideoWeb, type InfoVideoWeb } from "./medir-video-web";

export type MedioElegido =
  | { origen: "biblioteca"; medio: MedioBiblioteca }
  | { origen: "accidente"; path: string; url: string }
  | { origen: "enlace"; web: RefVideoWeb; titulo: string; miniatura: string | null; duracionSeg: number | null };

/** Pegar un enlace de YouTube, Vimeo o un MP4, revisarlo y elegirlo. */
function DesdeEnlace({ onElegir }: { onElegir: (m: MedioElegido) => void }) {
  const [texto, setTexto] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [resultado, setResultado] = useState<{ web: RefVideoWeb; info: InfoVideoWeb } | null>(null);
  const ref = texto.trim() ? interpretarEnlace(texto) : null;
  const noReconocido = texto.trim().length > 8 && !ref;

  const revisar = async () => {
    if (!ref) return;
    setRevisando(true);
    setResultado(null);
    const info = await medirVideoWeb(ref);
    setResultado({ web: ref, info });
    setRevisando(false);
  };

  const listo = resultado?.info.ok ? resultado : null;
  const miniatura = listo ? miniaturaDe(listo.web, listo.info.ok ? listo.info.miniatura : null) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <label htmlFor="enlace-video" className="mb-1 block text-sm font-medium text-gray-700">
        Enlace del video
      </label>
      <div className="flex gap-2">
        <input
          id="enlace-video"
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setResultado(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && ref && void revisar()}
          placeholder="https://www.youtube.com/watch?v=…  ·  https://vimeo.com/…  ·  https://…/video.mp4"
          className="min-w-0 flex-1 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20"
        />
        <button
          onClick={() => void revisar()}
          disabled={!ref || revisando}
          className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          {revisando && <Loader2 className="h-4 w-4 animate-spin" />} Revisar
        </button>
      </div>
      {ref && !resultado && !revisando && (
        <p className="mt-1.5 text-xs text-gray-500">Reconocido: {NOMBRE_PROVEEDOR[ref.proveedor]}. Pulse «Revisar» para comprobar que se puede mostrar.</p>
      )}
      {noReconocido && (
        <p className="mt-1.5 text-xs text-red-600">
          Solo se pueden usar enlaces de YouTube, Vimeo o de un archivo MP4/WebM. TikTok, Instagram, Facebook o Drive no dejan
          reproducir el video solo en un TV.
        </p>
      )}

      {resultado && !resultado.info.ok && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{resultado.info.error}</p>}

      {listo && listo.info.ok && (
        <div className="mt-4 flex flex-col gap-4 rounded-lg border border-[#E2E8F0] p-3 sm:flex-row">
          <div className="aspect-video w-full shrink-0 overflow-hidden rounded-md bg-gray-900 sm:w-56">
            {miniatura ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={miniatura} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500">
                <Film className="h-8 w-8" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{NOMBRE_PROVEEDOR[listo.web.proveedor]}</div>
            <div className="mt-0.5 font-medium text-gray-900">{listo.info.titulo || "Sin título"}</div>
            <div className="mt-0.5 text-gray-500">Duración: {formatoDuracion(listo.info.duracionSeg)}</div>
            {listo.info.aviso && <p className="mt-2 text-xs text-amber-700">{listo.info.aviso}</p>}
            {listo.web.proveedor === "youtube" && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Si el dueño del video lo monetiza, YouTube puede mostrar anuncios en el TV. Para videos importantes, mejor súbalos a la
                biblioteca.
              </p>
            )}
            <button
              onClick={() =>
                onElegir({
                  origen: "enlace",
                  web: listo.web,
                  titulo: listo.info.ok ? listo.info.titulo : "",
                  miniatura: listo.info.ok ? listo.info.miniatura : null,
                  duracionSeg: listo.info.ok ? listo.info.duracionSeg : null,
                })
              }
              className="mt-3 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white hover:bg-[#4338CA]"
            >
              Insertar video
            </button>
          </div>
        </div>
      )}
      <p className="mt-6 text-xs text-gray-400">
        El TV descarga el video de internet cada vez que lo muestra. Si el dueño lo borra o lo hace privado, el TV mostrará la
        miniatura y pasará a la siguiente diapositiva.
      </p>
    </div>
  );
}

/**
 * Elegir una imagen o un video para la diapositiva. Las imágenes pueden venir
 * de la biblioteca propia o de las fotos de accidentes (con aviso: son
 * siniestros reales y se van a ver en un pasillo).
 */
export function SelectorMedio({
  tipo,
  biblioteca,
  onBiblioteca,
  onElegir,
  onCerrar,
  enUsoAqui,
}: {
  enUsoAqui?: (m: MedioBiblioteca) => boolean;
  tipo: "imagen" | "video";
  biblioteca: MedioBiblioteca[];
  onBiblioteca: (fn: (l: MedioBiblioteca[]) => MedioBiblioteca[]) => void;
  onElegir: (m: MedioElegido) => void;
  onCerrar: () => void;
}) {
  const [pestana, setPestana] = useState<"biblioteca" | "accidentes" | "enlace">("biblioteca");
  const [fotos, setFotos] = useState<FotoAccidente[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pestana !== "accidentes" || fotos) return;
    void listarFotosAccidentes(60).then((r) => (r.ok ? setFotos(r.fotos) : setError(r.error)));
  }, [pestana, fotos]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-3">
          <div className="flex items-center gap-4">
            <h3 className="text-base font-semibold text-gray-900">{tipo === "video" ? "Elegir video" : "Elegir imagen"}</h3>
            <div className="inline-flex rounded-lg border border-[#E2E8F0] p-0.5 text-sm">
              {(tipo === "imagen" ? (["biblioteca", "accidentes"] as const) : (["biblioteca", "enlace"] as const)).map((p) => (
                <button
                  key={p}
                  onClick={() => setPestana(p)}
                  className={`rounded-md px-3 py-1 ${pestana === p ? "bg-[#EEF2FF] font-medium text-[#4F46E5]" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {p === "biblioteca" ? "Biblioteca" : p === "accidentes" ? "Fotos de accidentes" : "Desde enlace (YouTube, Vimeo…)"}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {pestana === "enlace" ? (
            <DesdeEnlace onElegir={onElegir} />
          ) : pestana === "biblioteca" ? (
            <BibliotecaMedios
              medios={biblioteca}
              onCambio={onBiblioteca}
              filtro={tipo}
              gestionar
              enUsoAqui={enUsoAqui}
              onElegir={(m) => onElegir({ origen: "biblioteca", medio: m })}
            />
          ) : (
            <>
              <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Son fotos de siniestros reales reportados en Gestivo. Pueden mostrar placas, personas o lesionados: elíjalas
                con criterio, porque se verán en un lugar público de la empresa.
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              {!fotos && !error && (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando fotos…
                </div>
              )}
              {fotos && fotos.length === 0 && <p className="py-12 text-center text-sm text-gray-400">No hay fotos de accidentes.</p>}
              {fotos && fotos.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {fotos.map((f) => (
                    <button
                      key={f.path}
                      onClick={() => onElegir({ origen: "accidente", path: f.path, url: f.url })}
                      className="rounded-lg border border-[#E2E8F0] p-1.5 text-left hover:border-[#4F46E5]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt="" loading="lazy" className="aspect-video w-full rounded-md object-cover" />
                      <div className="mt-1 text-[11px] text-gray-500">
                        Accidente {f.consecutivo ?? "—"} · {f.fecha ?? ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
