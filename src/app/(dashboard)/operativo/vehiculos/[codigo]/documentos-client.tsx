"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check, ExternalLink, FileText, Loader2, Paperclip, Plus, TriangleAlert, Undo2, X,
} from "lucide-react";
import {
  ARCHIVO_ACCEPT, ARCHIVO_LIMITE_BYTES, ARCHIVO_MIMES, NIVEL_COLOR, fechaLegible, tamanoLegible, textoDias,
  type DocumentoVehiculo, type TipoDocumento, type Vencimiento,
} from "@/lib/operativo/constants";
import { anularDocumento } from "../../actions";
import { ChipNivel } from "../../ui";

const inputCls =
  "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-800 outline-none focus:border-[#4F46E5]";

/**
 * Gestión documental del vehículo: una tarjeta por tipo con el estado de
 * vencimiento (fecha de GEMA, del documento cargado y la que rige), el
 * formulario de carga y el historial de archivos con "Ver" y "Anular".
 */
export function DocumentosClient({ codigo, activo, hoy, tipos, vencimientos, documentos, puedeEditar }: {
  codigo: string;
  activo: boolean;
  hoy: string;
  tipos: TipoDocumento[];
  vencimientos: Vencimiento[];
  documentos: DocumentoVehiculo[];
  puedeEditar: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-[#4F46E5]" />
        <h2 className="text-base font-semibold text-gray-900">Documentos del vehículo</h2>
      </div>
      <p className="text-xs text-gray-500">
        La fecha que rige es la más reciente entre la de GEMA y la del último documento cargado. Si no coinciden,
        se marca la discrepancia para que Operativo actualice GEMA o revise el documento.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {tipos.map((t) => (
          <TarjetaTipo
            key={t.key}
            codigo={codigo}
            activo={activo}
            hoy={hoy}
            tipo={t}
            vencimiento={vencimientos.find((v) => v.tipo === t.key) ?? null}
            documentos={documentos.filter((d) => d.tipo === t.key)}
            puedeEditar={puedeEditar}
          />
        ))}
      </div>
    </section>
  );
}

function TarjetaTipo({ codigo, activo, hoy, tipo, vencimiento, documentos, puedeEditar }: {
  codigo: string;
  activo: boolean;
  hoy: string;
  tipo: TipoDocumento;
  vencimiento: Vencimiento | null;
  documentos: DocumentoVehiculo[];
  puedeEditar: boolean;
}) {
  const [cargando, setCargando] = useState(false);
  const nivel = vencimiento?.nivel ?? "sin_dato";
  const c = NIVEL_COLOR[nivel];
  const vigentes = documentos.filter((d) => !d.anulado_en);
  const anulados = documentos.filter((d) => d.anulado_en);
  const puedeCargar = puedeEditar && activo;

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: nivel === "al_dia" ? "#E2E8F0" : c.fuerte }}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#F1F5F9] px-4 py-3" style={{ backgroundColor: c.suave }}>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{tipo.nombre}</h3>
          <p className="text-xs" style={{ color: c.texto }}>
            {vencimiento?.fecha_vigente ? `Vigente hasta ${fechaLegible(vencimiento.fecha_vigente)} · ${textoDias(vencimiento.dias)}` : "Sin fecha de vencimiento conocida"}
          </p>
        </div>
        <ChipNivel nivel={nivel} accion />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Fecha GEMA</p>
          <p className="text-gray-800">{fechaLegible(vencimiento?.fecha_gema)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Documento cargado</p>
          <p className="text-gray-800">
            {fechaLegible(vencimiento?.fecha_documento)}
            {vencimiento?.numero && <span className="block text-xs text-gray-500">N.º {vencimiento.numero}{vencimiento.entidad ? ` · ${vencimiento.entidad}` : ""}</span>}
          </p>
        </div>
        {vencimiento?.discrepancia && (
          <p className="col-span-2 flex items-start gap-1.5 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            GEMA ({fechaLegible(vencimiento.fecha_gema)}) y el documento cargado ({fechaLegible(vencimiento.fecha_documento)}) no coinciden.
            Rige la más reciente; revisa cuál está actualizado.
          </p>
        )}
      </div>

      <div className="border-t border-[#F1F5F9] px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Archivos ({vigentes.length}{anulados.length ? ` · ${anulados.length} anulado${anulados.length === 1 ? "" : "s"}` : ""})
          </p>
          {puedeCargar && !cargando && (
            <button
              type="button"
              onClick={() => setCargando(true)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#4F46E5] px-2.5 text-xs font-semibold text-[#4F46E5] hover:bg-[#EEF2FF]"
            >
              <Plus className="h-3.5 w-3.5" /> Cargar documento
            </button>
          )}
        </div>

        {cargando && (
          <FormularioCarga
            codigo={codigo}
            tipo={tipo}
            hoy={hoy}
            onCerrar={() => setCargando(false)}
          />
        )}

        {documentos.length === 0 && !cargando && (
          <p className="py-2 text-xs text-gray-400">Sin documentos cargados. {vencimiento?.fecha_gema ? "La fecha proviene solo de GEMA." : ""}</p>
        )}
        <ul className="divide-y divide-[#F1F5F9]">
          {[...vigentes, ...anulados].map((d, i) => (
            <FilaDocumento key={d.id} d={d} esVigente={!d.anulado_en && i === 0} puedeEditar={puedeEditar} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function FormularioCarga({ codigo, tipo, hoy, onCerrar }: {
  codigo: string;
  tipo: TipoDocumento;
  hoy: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [numero, setNumero] = useState("");
  const [entidad, setEntidad] = useState("");
  const [expedicion, setExpedicion] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);

  function elegirArchivo(f: File | null) {
    if (!f) { setArchivo(null); return; }
    const mime = (f.type || "").split(";")[0].trim().toLowerCase();
    if (!ARCHIVO_MIMES[mime]) {
      toast.error("Solo se aceptan PDF o imágenes JPG, PNG o WebP.");
      if (inputArchivo.current) inputArchivo.current.value = "";
      return;
    }
    if (f.size > ARCHIVO_LIMITE_BYTES) {
      toast.error(`El archivo supera los ${Math.round(ARCHIVO_LIMITE_BYTES / 1024 / 1024)} MB. Comprime el PDF o reduce la foto.`);
      if (inputArchivo.current) inputArchivo.current.value = "";
      return;
    }
    setArchivo(f);
  }

  async function enviar() {
    if (!vencimiento) {
      toast.error("Indica la fecha de vencimiento del documento.");
      return;
    }
    if (expedicion && expedicion > vencimiento) {
      toast.error("La expedición no puede ser después del vencimiento.");
      return;
    }
    setEnviando(true);
    try {
      const form = new FormData();
      form.set("codigo", codigo);
      form.set("tipo", tipo.key);
      form.set("numero", numero);
      form.set("entidad", entidad);
      form.set("fecha_expedicion", expedicion);
      form.set("fecha_vencimiento", vencimiento);
      form.set("observaciones", observaciones);
      if (archivo) form.set("archivo", archivo);
      const r = await fetch("/api/operativo/documentos", { method: "POST", body: form });
      const json = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !json.ok) {
        toast.error(json.error ?? `No se pudo cargar el documento (${r.status})`);
        return;
      }
      toast.success(`${tipo.nombre} cargado${archivo ? " con su archivo" : ""}`);
      onCerrar();
      router.refresh();
    } catch {
      toast.error("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mb-3 rounded-lg border border-dashed border-[#A5B4FC] bg-[#EEF2FF]/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">Nuevo {tipo.nombre}</p>
        <button type="button" onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Fecha de vencimiento <span className="text-red-500">*</span></label>
          <input type="date" value={vencimiento} min={expedicion || undefined} onChange={(e) => setVencimiento(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Fecha de expedición</label>
          <input type="date" value={expedicion} max={hoy} onChange={(e) => setExpedicion(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Número / referencia</label>
          <input type="text" value={numero} maxLength={120} onChange={(e) => setNumero(e.target.value)} placeholder="N.º de póliza, certificado o tarjeta" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Entidad</label>
          <input type="text" value={entidad} maxLength={120} onChange={(e) => setEntidad(e.target.value)} placeholder="Aseguradora, CDA o autoridad" className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Observaciones</label>
          <input type="text" value={observaciones} maxLength={1000} onChange={(e) => setObservaciones(e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-gray-600">Archivo (PDF o imagen, hasta {Math.round(ARCHIVO_LIMITE_BYTES / 1024 / 1024)} MB)</label>
          <input ref={inputArchivo} type="file" accept={ARCHIVO_ACCEPT} className="hidden" onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputArchivo.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-700 hover:bg-[#F8FAFC]"
            >
              <Paperclip className="h-4 w-4" /> {archivo ? "Cambiar archivo" : "Elegir archivo"}
            </button>
            {archivo ? (
              <span className="inline-flex items-center gap-1 text-xs text-gray-700">
                {archivo.name} <span className="text-gray-400">({tamanoLegible(archivo.size)})</span>
                <button type="button" onClick={() => elegirArchivo(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
              </span>
            ) : (
              <span className="text-xs text-gray-400">Opcional: puedes registrar la vigencia y adjuntar el archivo después.</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={enviar}
          disabled={enviando || !vencimiento}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
        </button>
      </div>
    </div>
  );
}

function FilaDocumento({ d, esVigente, puedeEditar }: { d: DocumentoVehiculo; esVigente: boolean; puedeEditar: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const anulado = Boolean(d.anulado_en);

  function anular() {
    if (motivo.trim().length < 5) {
      toast.error("Indica el motivo de la anulación (mínimo 5 caracteres).");
      return;
    }
    start(async () => {
      const res = await anularDocumento(d.id, motivo);
      if (!res.success) {
        toast.error(res.error ?? "No se pudo anular");
        return;
      }
      toast.success("Documento anulado; queda como rastro");
      setAnulando(false);
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <li className={`py-2 text-xs ${anulado ? "text-gray-400" : "text-gray-700"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            {esVigente && <span className="rounded-full bg-[#DCFCE7] px-1.5 py-0 text-[10px] font-semibold text-[#166534]">Vigente</span>}
            {anulado && <span className="rounded-full bg-[#F1F5F9] px-1.5 py-0 text-[10px] font-semibold text-gray-500">Anulado</span>}
            <span className={`font-medium ${anulado ? "line-through" : "text-gray-900"}`}>Vence {fechaLegible(d.fecha_vencimiento)}</span>
            {d.fecha_expedicion && <span>· expedido {fechaLegible(d.fecha_expedicion)}</span>}
            {d.numero && <span>· N.º {d.numero}</span>}
            {d.entidad && <span>· {d.entidad}</span>}
          </p>
          <p className="text-[11px] text-gray-400">
            {d.archivo_nombre ? `${d.archivo_nombre} (${tamanoLegible(d.archivo_tamano)})` : "Sin archivo adjunto"}
            {d.created_by_email ? ` · cargado por ${d.created_by_email}` : ""}
            {d.observaciones ? ` · ${d.observaciones}` : ""}
          </p>
          {anulado && (
            <p className="text-[11px] text-gray-400">
              Anulado{d.anulado_por_email ? ` por ${d.anulado_por_email}` : ""}{d.motivo_anulacion ? `: ${d.motivo_anulacion}` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {d.url && (
            <a href={d.url} target="_blank" rel="noopener noreferrer" title="Ver archivo (enlace válido una hora)"
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-2 text-xs font-medium text-gray-700 hover:bg-[#F8FAFC]">
              <ExternalLink className="h-3.5 w-3.5" /> Ver
            </a>
          )}
          {puedeEditar && !anulado && !anulando && (
            <button type="button" onClick={() => setAnulando(true)} title="Anular con motivo"
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#FECACA] px-2 text-xs font-medium text-red-600 hover:bg-[#FEF2F2]">
              <Undo2 className="h-3.5 w-3.5" /> Anular
            </button>
          )}
        </div>
      </div>
      {anulando && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <input
            type="text" value={motivo} autoFocus maxLength={200}
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && anular()}
            placeholder="Motivo de la anulación"
            className={`${inputCls} h-8 w-64`}
          />
          <button type="button" onClick={anular} disabled={pending} title="Confirmar" className="rounded p-1 text-red-600 hover:bg-[#FEF2F2] disabled:opacity-50">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => { setAnulando(false); setMotivo(""); }} title="Cancelar" className="rounded p-1 text-gray-500 hover:bg-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </li>
  );
}
