"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X, AlertCircle } from "lucide-react";

export type FotoSubida = { path: string; preview: string };

const LADO_MAX = 1600;
const CALIDAD = 0.82;

/**
 * Reduce la foto a 1.600 px de lado mayor en JPEG antes de subirla: las del
 * celular pesan 3-8 MB y Vercel corta el cuerpo en 4,5 MB. Si el navegador no
 * puede decodificarla, se envía tal cual y la ruta decide.
 */
async function comprimir(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", CALIDAD));
    return blob ?? file;
  } catch {
    return file;
  }
}

async function subirFoto(file: File): Promise<string> {
  const blob = await comprimir(file);
  const form = new FormData();
  form.append("foto", blob, blob === file ? file.name : "foto.jpg");
  const res = await fetch("/api/rotacion/accidentes/fotos", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !data.path) throw new Error(data.error || `No se pudo subir ${file.name}.`);
  return data.path;
}

/**
 * Carga de fotos del accidente: desde la cámara o la galería, varias a la vez.
 * Cada foto se sube al elegirla; el padre recibe las rutas ya guardadas.
 */
export default function FotosAccidente({
  value,
  onChange,
}: {
  value: FotoSubida[];
  onChange: (v: FotoSubida[]) => void;
}) {
  const [subiendo, setSubiendo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  // Las subidas terminan en desorden; se acumula sobre la lista más reciente.
  const actual = useRef(value);
  actual.current = value;

  async function elegir(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const lista = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (lista.length < files.length) setError("Solo se aceptan imágenes.");
    setSubiendo((n) => n + lista.length);
    await Promise.all(
      lista.map(async (f) => {
        try {
          const path = await subirFoto(f);
          const nueva = { path, preview: URL.createObjectURL(f) };
          actual.current = [...actual.current, nueva];
          onChange(actual.current);
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo subir una foto.");
        } finally {
          setSubiendo((n) => n - 1);
        }
      })
    );
  }

  function quitar(path: string) {
    onChange(value.filter((f) => f.path !== path));
  }

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-60";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => camaraRef.current?.click()}>
          <Camera className="h-4 w-4" /> Tomar foto
        </button>
        <button type="button" className={btn} onClick={() => galeriaRef.current?.click()}>
          <ImagePlus className="h-4 w-4" /> Elegir de la galería
        </button>
        {subiendo > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo {subiendo} foto{subiendo > 1 ? "s" : ""}…
          </span>
        )}
        <input
          ref={camaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { elegir(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={galeriaRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { elegir(e.target.files); e.target.value = ""; }}
        />
      </div>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[#EF4444]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}

      {value.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((f) => (
            <li key={f.path} className="relative">
              <button type="button" onClick={() => setAmpliada(f.preview)} className="block w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.preview} alt="Foto del accidente" className="aspect-square w-full rounded-lg border border-[#E2E8F0] object-cover" />
              </button>
              <button
                type="button"
                onClick={() => quitar(f.path)}
                aria-label="Quitar foto"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {ampliada && <VisorFoto url={ampliada} onClose={() => setAmpliada(null)} />}
    </div>
  );
}

/** Foto a pantalla completa; cierra con clic fuera o Escape. */
export function VisorFoto({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      ref={(el) => el?.focus()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 outline-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Foto del accidente" className="max-h-full max-w-full rounded-lg object-contain" />
      <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-gray-800">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
