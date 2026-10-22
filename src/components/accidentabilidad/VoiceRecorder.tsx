"use client";

import { useRef, useState } from "react";
import { Mic, Square, Loader2, AlertCircle } from "lucide-react";

interface VoiceRecorderProps {
  /** Devuelve la ruta del audio guardado y el texto transcrito. */
  onTranscribed: (audioPath: string | null, text: string) => void;
}

/**
 * Candidatos de formato en orden de preferencia. El primero que el navegador
 * soporte se usa para grabar. En móvil importa: iOS Safari solo graba `audio/mp4`
 * y Android Chrome `audio/webm`; sin elegirlo a mano el Blob podía quedar con
 * `type` vacío y se subía con extensión equivocada (OpenAI lo rechazaba).
 */
const MIME_CANDIDATOS = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/aac",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

/** Primer formato soportado por MediaRecorder, o "" si hay que usar el de por defecto. */
function elegirMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return MIME_CANDIDATOS.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Extensión de archivo a partir del mimeType (sin parámetros de códec). */
function extDeMime(mime: string): string {
  const base = (mime.split("/")[1] || "webm").split(";")[0].trim().toLowerCase();
  if (base === "mpeg") return "mp3";
  if (base === "x-m4a" || base === "m4a") return "m4a";
  if (base === "mp4") return "mp4";
  return base || "webm";
}

export default function VoiceRecorder({ onTranscribed }: VoiceRecorderProps) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>("");

  async function startRecording() {
    setError(null);

    // Soporte: sin estas APIs (navegador viejo o contexto no seguro) no se puede grabar.
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined") {
      setError(
        "Este navegador no permite grabar audio. Actualízalo o escribe el resumen a mano. " +
          "En iPhone requiere Safari actualizado y conexión segura (https)."
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Permiso de micrófono denegado. Actívalo en los ajustes del navegador y vuelve a intentar.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("No se encontró un micrófono en el dispositivo.");
      } else if (name === "NotReadableError") {
        setError("El micrófono está en uso por otra aplicación. Ciérrala e intenta de nuevo.");
      } else {
        setError("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
      }
      return;
    }

    try {
      const mimeType = elegirMimeType();
      mimeRef.current = mimeType;
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        setError("Falló la grabación. Intenta de nuevo.");
        setState("idle");
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const tipo = recorder.mimeType || mimeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: tipo });
        if (blob.size === 0) {
          setError("La grabación quedó vacía. Habla un poco más antes de detener.");
          setState("idle");
          return;
        }
        await transcribe(blob, tipo);
      };
      // Con timeslice algunos móviles emiten los chunks durante la grabación y no
      // solo al parar, evitando el Blob vacío en grabaciones cortas.
      recorder.start(1000);
      recorderRef.current = recorder;
      setState("recording");
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("Este dispositivo no permite grabar en un formato compatible. Escribe el resumen a mano.");
      setState("idle");
    }
  }

  function stopRecording() {
    try {
      recorderRef.current?.stop();
      setState("processing");
    } catch {
      setError("No se pudo detener la grabación.");
      setState("idle");
    }
  }

  async function transcribe(blob: Blob, tipo: string) {
    try {
      const form = new FormData();
      const ext = extDeMime(tipo);
      form.append("audio", blob, `nota.${ext}`);
      const res = await fetch("/api/rotacion/accidentes/transcribe", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo transcribir.");
        setState("idle");
        return;
      }
      if (data.warning || data.error) setError(data.warning || data.error);
      onTranscribed(data.audioPath ?? null, data.text ?? "");
      setState("idle");
    } catch {
      setError("Error de red al transcribir.");
      setState("idle");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        {state === "recording" ? (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 rounded-lg bg-[#EF4444] px-4 py-2 text-sm font-medium text-white"
          >
            <Square className="h-4 w-4" /> Detener
            <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-white" />
          </button>
        ) : state === "processing" ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Transcribiendo…
          </span>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="inline-flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-[#EEF2FF]"
          >
            <Mic className="h-4 w-4 text-[#4F46E5]" /> Grabar nota de voz
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-[#EF4444]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
