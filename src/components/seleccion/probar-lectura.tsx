"use client";

/**
 * Chat de prueba › «Así se vería» / «Candidato»: probar cómo se leería un
 * documento, una foto o un audio sin enviarlo al chat ni guardarlo en la ficha.
 * El documento lo lee la IA de «Documentos» y el audio lo transcriben los dos
 * modelos de «Voz», igual que lo que llega por WhatsApp. Cada prueba cuenta en
 * el gasto del mes.
 */
import { useRef, useState } from "react";
import { FileSearch, Loader2, Mic, Paperclip, X } from "lucide-react";
import type { ResultadoProbarAudio, ResultadoProbarDocumento } from "@/lib/seleccion/prueba-actions";
import { ACEPTA_ARCHIVOS, MAX_BYTES_DOCUMENTO_PRUEBA } from "@/lib/seleccion/lectura/formatos-aceptados";

const ACEPTA_AUDIO = "audio/*,.ogg,.opus,.oga,.mp3,.m4a,.aac,.wav,.webm,.amr,.flac";
const CLASE: Record<string, string> = { hoja_vida: "Hoja de vida", carta_laboral: "Carta laboral", cedula: "Cédula", licencia: "Licencia", otro: "Otro documento" };
const CALIDAD: Record<string, { texto: string; color: string }> = {
  buena: { texto: "Buena: los dos modelos coinciden", color: "bg-emerald-50 text-emerald-800" },
  dudosa: { texto: "Dudosa: los modelos no coinciden (el asistente pide repetirlo)", color: "bg-amber-50 text-amber-800" },
  sin_voz: { texto: "Sin voz: no se entendió nada", color: "bg-red-50 text-red-700" },
};
const CONFIANZA: Record<string, string> = { alta: "text-emerald-700", media: "text-amber-700", baja: "text-red-600" };

type Prueba =
  | { id: number; tipo: "documento"; nombre: string; estado: "leyendo" }
  | { id: number; tipo: "audio"; nombre: string; estado: "leyendo" }
  | { id: number; tipo: "documento"; nombre: string; estado: "listo"; r: ResultadoProbarDocumento }
  | { id: number; tipo: "audio"; nombre: string; estado: "listo"; r: ResultadoProbarAudio };

const usd = (n: number) => `US$${n.toFixed(4)}`;

export function ProbarLectura() {
  const [pruebas, setPruebas] = useState<Prueba[]>([]);
  const idRef = useRef(0);
  const docRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const ocupado = pruebas.some((p) => p.estado === "leyendo");

  async function probar(tipo: "documento" | "audio", archivo: File) {
    const id = ++idRef.current;
    if (archivo.size > MAX_BYTES_DOCUMENTO_PRUEBA) {
      const r = { ok: false as const, error: "El archivo pesa más de 4 MB: en la prueba ese es el tope." };
      setPruebas((ps) => [(tipo === "documento" ? { id, tipo, nombre: archivo.name, estado: "listo", r } : { id, tipo, nombre: archivo.name, estado: "listo", r }) as Prueba, ...ps].slice(0, 6));
      return;
    }
    setPruebas((ps) => [{ id, tipo, nombre: archivo.name, estado: "leyendo" } as Prueba, ...ps].slice(0, 6));
    const datos = new FormData();
    datos.set("tipo", tipo);
    datos.set("archivo", archivo);
    // Por ruta y no por server action: no espera la fila de actions de los demás chats de prueba.
    const r = (await fetch("/api/seleccion/probar-lectura", { method: "POST", body: datos })
      .then((res) => res.json())
      .catch((e: Error) => ({ ok: false, error: `No se pudo enviar: ${e.message}` }))) as ResultadoProbarDocumento | ResultadoProbarAudio;
    setPruebas((ps) => ps.map((p) => (p.id === id ? ({ id, tipo, nombre: archivo.name, estado: "listo", r } as Prueba) : p)));
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-white p-3">
      <div className="flex items-center gap-1.5">
        <FileSearch className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-text-primary">Probar lectura</p>
      </div>
      <p className="text-xs text-text-tertiary">Sube un documento, una foto o un audio para ver cómo lo leería Gestivo. No entra al chat ni se guarda en la ficha.</p>
      <div className="flex flex-wrap gap-2">
        <input
          ref={docRef}
          type="file"
          accept={ACEPTA_ARCHIVOS}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void probar("documento", f);
          }}
        />
        <input
          ref={audioRef}
          type="file"
          accept={ACEPTA_AUDIO}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void probar("audio", f);
          }}
        />
        <button
          type="button"
          disabled={ocupado}
          onClick={() => docRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-50"
          title="PDF, Word (.docx), OpenDocument (.odt), RTF, texto o foto (JPG, PNG, WebP), hasta 4 MB"
        >
          <Paperclip className="h-3.5 w-3.5" /> Documento o foto
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => audioRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-50"
          title="OGG/Opus de WhatsApp, MP3, M4A, WAV o WebM, hasta 4 MB"
        >
          <Mic className="h-3.5 w-3.5" /> Audio
        </button>
      </div>

      {pruebas.map((p) => (
        <div key={p.id} className="space-y-1.5 rounded-lg border border-border bg-slate-50/60 p-2 text-xs">
          <div className="flex items-start gap-1.5">
            {p.tipo === "audio" ? <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" /> : <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />}
            <span className="min-w-0 flex-1 truncate font-medium text-text-primary" title={p.nombre}>
              {p.nombre}
            </span>
            {p.estado === "leyendo" ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            ) : (
              <button type="button" onClick={() => setPruebas((ps) => ps.filter((x) => x.id !== p.id))} className="shrink-0 text-text-muted hover:text-text-primary" aria-label="Quitar esta prueba">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {p.estado === "leyendo" ? (
            <p className="text-text-tertiary">{p.tipo === "audio" ? "Transcribiendo con los dos modelos…" : "Leyendo con la IA de documentos…"}</p>
          ) : !p.r.ok ? (
            <p className="rounded-md bg-red-50 px-2 py-1 text-red-700">{p.r.error}</p>
          ) : p.tipo === "documento" && "clase" in p.r ? (
            <ResultadoDocumento r={p.r} />
          ) : "calidad" in p.r ? (
            <ResultadoAudio r={p.r} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ResultadoDocumento({ r }: { r: Extract<ResultadoProbarDocumento, { ok: true }> }) {
  return (
    <>
      <p>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{CLASE[r.clase] ?? r.clase}</span>
        {r.estado === "ilegible" && <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-red-700">No se pudo leer</span>}
        <span className="ml-1.5 text-text-muted">
          {r.modelo} · {(r.ms / 1000).toFixed(1)} s · {usd(r.costoUsd)}
        </span>
      </p>
      {r.resumen && <p className="text-text-secondary">{r.resumen}</p>}
      {r.campos.length > 0 && (
        <table className="w-full table-fixed border-collapse">
          <tbody>
            {r.campos.map((c, i) => (
              <tr key={`${c.campo}-${i}`} className="border-t border-border/60 align-top">
                <td className="w-[38%] py-0.5 pr-2 text-text-tertiary">
                  {c.campo.replace(/_/g, " ")}
                  {c.calculado && <span className="ml-1 text-[10px] text-text-muted">(calculado)</span>}
                </td>
                <td className="whitespace-pre-line break-words py-0.5 text-text-primary">
                  {c.valor} <span className={`text-[10px] ${CONFIANZA[c.confianza] ?? "text-text-muted"}`}>· {c.confianza}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="rounded-md bg-violet-50 px-2 py-1 text-violet-900">
        <span className="font-medium">El asistente recibiría:</span> {r.paraAsistente}
      </p>
    </>
  );
}

function ResultadoAudio({ r }: { r: Extract<ResultadoProbarAudio, { ok: true }> }) {
  const c = CALIDAD[r.calidad];
  return (
    <>
      <p className={`rounded-md px-2 py-1 font-medium ${c?.color ?? ""}`}>
        {c?.texto ?? r.calidad}
        <span className="ml-1.5 font-normal opacity-70">
          {(r.ms / 1000).toFixed(1)} s · {usd(r.costoUsd)}
        </span>
      </p>
      <p>
        <span className="text-text-tertiary">{r.principal.modelo}:</span> {r.principal.texto || <em className="text-text-muted">(nada)</em>}
      </p>
      {r.control && (
        <p>
          <span className="text-text-tertiary">{r.control.modelo} (control):</span> {r.control.texto || <em className="text-text-muted">(nada)</em>}
        </p>
      )}
      <p className="rounded-md bg-violet-50 px-2 py-1 text-violet-900">
        <span className="font-medium">El asistente recibiría:</span> {r.paraAsistente}
      </p>
    </>
  );
}
