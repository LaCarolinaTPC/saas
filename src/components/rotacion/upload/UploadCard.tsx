"use client";

import { useState, useRef, useCallback } from "react";
import {
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Users,
  TrendingUp,
  FileSpreadsheet,
  AlertTriangle,
  Calendar,
  Heart,
  UserCheck,
  Gift,
} from "lucide-react";
import { FILE_TYPE_CONFIG, type FileType, type UploadResult } from "@/lib/rotacion/upload/types";

const ICONS: Record<FileType, React.ReactNode> = {
  conductores_activos: <Users className="w-5 h-5" />,
  conductores_retirados: <Users className="w-5 h-5" />,
  cierres_diarios: <TrendingUp className="w-5 h-5" />,
  viajes_perdidos: <AlertTriangle className="w-5 h-5" />,
  ausentismo: <Calendar className="w-5 h-5" />,
  familia: <Heart className="w-5 h-5" />,
  reingresos: <UserCheck className="w-5 h-5" />,
  incentivos: <Gift className="w-5 h-5" />,
};

interface Props {
  fileType: FileType;
  lastUpload?: { date: string; rows: number; by: string | null } | null;
  onComplete?: () => void;
}

export default function UploadCard({ fileType, lastUpload, onComplete }: Props) {
  const config = FILE_TYPE_CONFIG[fileType];
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "dragging" | "uploading" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const arr = Array.from(newFiles).filter((f) =>
        f.name.endsWith(".xlsx") || (fileType === "reingresos" && f.name.endsWith(".csv"))
      );
      if (!config.multiple && arr.length > 1) {
        setFiles([arr[0]]);
      } else {
        setFiles(arr);
      }
      setStatus("idle");
      setResults(null);
    },
    [config.multiple]
  );

  function removeFile(idx: number) {
    setFiles((f) => f.filter((_, i) => i !== idx));
  }

  async function postJSON(body: Record<string, unknown>) {
    const res = await fetch("/api/rotacion/upload-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const text = await res.text();
      throw new Error(`Error del servidor (${res.status}): ${text.slice(0, 120)}`);
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error del servidor");
    return data;
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setStatus("uploading");
    setProgress(5);

    try {
      const {
        processConductores,
        processCierres,
        processViajesPerdidos,
        processAusentismo,
        processFamilia,
        processReingresos,
        processIncentivos,
      } = await import("@/lib/rotacion/upload/processors");

      setProgress(10);
      const allResults: UploadResult[] = [];
      const CHUNK_SIZE = 500;

      for (const file of files) {
        setProgress(15);
        const arrayBuffer = await file.arrayBuffer();
        let processed;

        switch (fileType) {
          case "conductores_activos":
            processed = processConductores(arrayBuffer, "ACTIVO");
            break;
          case "conductores_retirados":
            processed = processConductores(arrayBuffer, "RETIRADO");
            break;
          case "cierres_diarios":
            processed = processCierres(arrayBuffer, file.name);
            break;
          case "viajes_perdidos":
            processed = processViajesPerdidos(arrayBuffer, file.name);
            break;
          case "ausentismo":
            processed = processAusentismo(arrayBuffer, file.name);
            break;
          case "familia":
            processed = processFamilia(arrayBuffer);
            break;
          case "reingresos":
            processed = processReingresos(arrayBuffer);
            break;
          case "incentivos":
            processed = processIncentivos(arrayBuffer, file.name);
            break;
        }

        setProgress(30);

        // Step 1: Prepare (delete if needed)
        await postJSON({
          action: "prepare",
          fileType,
          fileName: file.name,
          periodos: processed.periodos,
        });

        // Step 2: Send records in chunks
        let rowsProcessed = 0;
        let rowsErrors = 0;
        const errors: string[] = [...processed.errors];
        const total = processed.records.length;

        for (let i = 0; i < total; i += CHUNK_SIZE) {
          const chunk = processed.records.slice(i, i + CHUNK_SIZE);
          const pct = 30 + Math.round(((i + chunk.length) / total) * 55);
          setProgress(pct);

          const res = await postJSON({
            action: "chunk",
            fileType,
            fileName: file.name,
            records: chunk,
          });

          if (res.ok) {
            rowsProcessed += chunk.length;
          } else {
            rowsErrors += res.failed || chunk.length;
            errors.push(res.error || `Error en lote ${i}`);
          }
        }

        // Step 3: Finish (log upload)
        setProgress(90);
        const finishRes = await postJSON({
          action: "finish",
          fileType,
          fileName: file.name,
          rowsProcessed,
          rowsErrors,
          errors,
          periodos: processed.periodos,
        });

        allResults.push(...finishRes.results);
      }

      setResults(allResults);
      const hasErrors = allResults.some((r) => r.rowsErrors > 0);
      setStatus(hasErrors ? "error" : "success");
      setProgress(100);
      onComplete?.();
    } catch (e) {
      setStatus("error");
      setErrorMsg((e as Error).message);
    }
  }

  function reset() {
    setFiles([]);
    setStatus("idle");
    setResults(null);
    setProgress(0);
    setErrorMsg("");
  }

  const totalRows = results?.reduce((s, r) => s + r.rowsProcessed, 0) || 0;
  const totalErrors = results?.reduce((s, r) => s + r.rowsErrors, 0) || 0;

  return (
    <div className="bg-surface-raised rounded-2xl border border-border shadow-sm p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{config.label}</h3>
          <p className="text-xs text-text-tertiary mt-0.5">{config.description}</p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-gold-subtle text-gold-dark flex items-center justify-center shrink-0 ml-3">
          {ICONS[fileType]}
        </div>
      </div>

      {/* Last upload */}
      {lastUpload && (
        <p className="text-[11px] text-text-muted mb-3">
          Ultima carga: {new Date(lastUpload.date).toLocaleDateString("es-CO")} — {lastUpload.rows} registros
          {lastUpload.by && ` por ${lastUpload.by}`}
        </p>
      )}

      {/* Drop zone */}
      {status !== "success" && (
        <div
          className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
            status === "dragging"
              ? "border-amber-400 bg-amber-50"
              : "border-border hover:border-amber-300 hover:bg-slate-50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setStatus("dragging"); }}
          onDragLeave={() => setStatus("idle")}
          onDrop={(e) => {
            e.preventDefault();
            setStatus("idle");
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={fileType === "reingresos" ? ".xlsx,.csv" : ".xlsx"}
            multiple={config.multiple}
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <Upload className="w-6 h-6 text-text-muted mx-auto mb-2" />
          <p className="text-xs text-text-secondary">
            Arrastra {config.multiple ? "archivo(s)" : "el archivo"} aqui o haz clic
          </p>
          <p className="text-[10px] text-text-muted mt-1">
            {fileType === "reingresos" ? "Archivos .csv o .xlsx" : "Solo archivos .xlsx"}
          </p>
        </div>
      )}

      {/* Selected files */}
      {files.length > 0 && status !== "success" && (
        <ul className="mt-3 space-y-1">
          {files.map((f, i) => (
            <li
              key={f.name}
              className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2"
            >
              <span className="text-text-secondary truncate flex-1">
                <FileSpreadsheet className="w-3.5 h-3.5 inline mr-1.5 text-text-muted" />
                {f.name}
                <span className="text-text-muted ml-1">({(f.size / 1024).toFixed(0)} KB)</span>
              </span>
              {status !== "uploading" && (
                <button onClick={() => removeFile(i)} className="text-text-muted hover:text-negative ml-2 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Upload button */}
      {files.length > 0 && status !== "uploading" && status !== "success" && (
        <button
          onClick={handleUpload}
          className="mt-3 w-full bg-slate-900 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-slate-800 transition-colors cursor-pointer"
        >
          Subir {config.multiple && files.length > 1 ? `${files.length} archivos` : "archivo"}
        </button>
      )}

      {/* Progress */}
      {status === "uploading" && (
        <div className="mt-3">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-text-tertiary mt-1.5 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" />
            Procesando...
          </p>
        </div>
      )}

      {/* Success */}
      {status === "success" && results && (
        <div className="mt-1">
          <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl text-sm text-emerald-700">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">
              {totalRows.toLocaleString("es-CO")} registros procesados
              {results.length > 1 && ` en ${results.length} archivos`}
            </span>
          </div>
          <button
            onClick={reset}
            className="mt-2 w-full text-xs text-text-tertiary hover:text-text-primary py-1.5 cursor-pointer"
          >
            Subir otro archivo
          </button>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="mt-3">
          <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              {errorMsg && <p className="font-medium">{errorMsg}</p>}
              {results && (
                <p>
                  {totalRows} procesados, {totalErrors} errores
                </p>
              )}
              {results?.[0]?.errors?.slice(0, 3).map((e, i) => (
                <p key={i} className="text-red-500 mt-0.5 truncate">{e}</p>
              ))}
            </div>
          </div>
          <button
            onClick={reset}
            className="mt-2 w-full text-xs text-text-tertiary hover:text-text-primary py-1.5 cursor-pointer"
          >
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
