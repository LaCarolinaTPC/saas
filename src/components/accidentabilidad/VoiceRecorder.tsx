"use client";

import { useRef, useState } from "react";
import { Mic, Square, Loader2, AlertCircle } from "lucide-react";

interface VoiceRecorderProps {
  /** Devuelve la ruta del audio guardado y el texto transcrito. */
  onTranscribed: (audioPath: string | null, text: string) => void;
}

export default function VoiceRecorder({ onTranscribed }: VoiceRecorderProps) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await transcribe(new Blob(chunksRef.current, { type: recorder.mimeType }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setState("recording");
    } catch {
      setError("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setState("processing");
  }

  async function transcribe(blob: Blob) {
    try {
      const form = new FormData();
      const ext = (blob.type.split("/")[1] || "webm").split(";")[0];
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
      if (data.error) setError(data.error);
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
            className="inline-flex items-center gap-2 rounded-lg bg-negative px-4 py-2 text-sm font-medium text-white"
          >
            <Square className="h-4 w-4" /> Detener
            <span className="ml-1 h-2 w-2 animate-pulse rounded-full bg-white" />
          </button>
        ) : state === "processing" ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> Transcribiendo…
          </span>
        ) : (
          <button
            type="button"
            onClick={startRecording}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary hover:bg-gold-subtle"
          >
            <Mic className="h-4 w-4 text-gold-dark" /> Grabar nota de voz
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-negative">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
