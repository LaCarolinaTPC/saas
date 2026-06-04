"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Loader2, Plus, Trash2, ChevronLeft, ChevronRight,
  CheckCircle2, UserPlus, AlertCircle,
} from "lucide-react";
import SignaturePad from "./SignaturePad";
import VoiceRecorder from "./VoiceRecorder";
import { buscarConductorBasic, createConductorBasic } from "@/lib/actions";

type Conductor = {
  id?: string;
  cedula: string;
  nombre: string;
  licencia?: string | null;
  celular?: string | null;
  correo?: string | null;
};

type Vehiculo = { placa: string; descripcion: string; es_propio: boolean };

const STEPS = ["Conductor", "Confirmar", "Accidente", "Arreglo", "Firmas", "Guardar"];

const inputCls =
  "w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-gold focus:ring-2 focus:ring-gold/20";
const labelCls = "mb-1 block text-sm font-medium text-text-primary";

export default function ReportWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Conductor
  const [cedula, setCedula] = useState("");
  const [conductor, setConductor] = useState<Conductor | null>(null);
  const [needsCreate, setNeedsCreate] = useState(false);
  const [newCond, setNewCond] = useState<Conductor>({ cedula: "", nombre: "", licencia: "", celular: "", correo: "" });

  // Accidente
  const [fecha, setFecha] = useState("");
  const [direccion, setDireccion] = useState("");
  const [resumen, setResumen] = useState("");
  const [transcripcion, setTranscripcion] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([{ placa: "", descripcion: "", es_propio: true }]);
  const [tienePeaton, setTienePeaton] = useState(false);
  const [peaton, setPeaton] = useState({ nombre: "", cedula: "", telefono: "", direccion: "", correo: "" });

  // Arreglo / aseguradora
  const [huboArreglo, setHuboArreglo] = useState(false);
  const [arregloMonto, setArregloMonto] = useState("");
  const [arregloReceptor, setArregloReceptor] = useState("");
  const [arregloReceptorCedula, setArregloReceptorCedula] = useState("");
  const [arregloFirma, setArregloFirma] = useState<string | null>(null);
  const [solicitoAseguradora, setSolicitoAseguradora] = useState(false);
  const [aseguradora, setAseguradora] = useState("");
  const [abogado, setAbogado] = useState({ nombre: "", apellidos: "", cedula: "", celular: "" });

  // Firmas
  const [firmaConductor, setFirmaConductor] = useState<string | null>(null);
  const [firmaTercero, setFirmaTercero] = useState<string | null>(null);

  // Validación
  const [missing, setMissing] = useState<string[]>([]);
  const [done, setDone] = useState<{ id: string; consecutivo: number } | null>(null);

  function buscar() {
    setError(null);
    setNeedsCreate(false);
    if (cedula.trim().length < 4) {
      setError("Ingresa una cédula válida.");
      return;
    }
    startTransition(async () => {
      const { conductor: c } = await buscarConductorBasic(cedula.trim());
      if (c) {
        setConductor(c);
        setStep(1);
      } else {
        setNewCond({ cedula: cedula.trim(), nombre: "", licencia: "", celular: "", correo: "" });
        setNeedsCreate(true);
      }
    });
  }

  function crearConductor() {
    setError(null);
    if (!newCond.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    startTransition(async () => {
      const res = await createConductorBasic({
        cedula: newCond.cedula,
        nombre: newCond.nombre,
        licencia: newCond.licencia || undefined,
        celular: newCond.celular || undefined,
        correo: newCond.correo || undefined,
      });
      if (!res.success) {
        setError(res.error || "No se pudo crear el conductor.");
        return;
      }
      setConductor(res.conductor as Conductor);
      setNeedsCreate(false);
      setStep(1);
    });
  }

  function validateAccidente(): string[] {
    const m: string[] = [];
    if (!direccion.trim()) m.push("Dirección del accidente");
    if (!fecha) m.push("Fecha del accidente");
    if (!resumen.trim() && !transcripcion.trim()) m.push("Resumen de los hechos");
    if (tienePeaton && !peaton.nombre.trim()) m.push("Nombre del peatón");
    return m;
  }

  function nextFromAccidente() {
    const m = validateAccidente();
    setMissing(m);
    if (m.length === 0) {
      setError(null);
      setStep(3);
    } else {
      setError("Faltan campos por completar (resaltados en rojo).");
    }
  }

  function guardar() {
    setError(null);
    if (!firmaConductor) {
      setError("La firma del conductor es obligatoria.");
      return;
    }
    startTransition(async () => {
      const payload = {
        conductor,
        fecha_accidente: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
        direccion_accidente: direccion,
        resumen_hechos: resumen,
        nota_voz_path: audioPath,
        nota_voz_transcripcion: transcripcion,
        vehiculos,
        tiene_peaton: tienePeaton,
        peaton,
        hubo_arreglo: huboArreglo,
        arreglo: huboArreglo
          ? { monto: arregloMonto, receptor_nombre: arregloReceptor, receptor_cedula: arregloReceptorCedula, firma: arregloFirma }
          : {},
        solicito_aseguradora: solicitoAseguradora,
        aseguradora_nombre: aseguradora,
        abogado: solicitoAseguradora ? abogado : {},
        firma_conductor: firmaConductor,
        firma_tercero: firmaTercero,
      };
      const res = await fetch("/api/rotacion/accidentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo guardar el reporte.");
        return;
      }
      setDone({ id: data.id, consecutivo: data.consecutivo });
    });
  }

  // ── Pantalla de éxito ──
  if (done) {
    return (
      <div className="mx-auto max-w-lg pt-16 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-positive" />
        <h2 className="mt-4 text-xl font-semibold text-text-primary">Reporte guardado</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Reporte <strong>#{done.consecutivo}</strong> registrado y marcado como pendiente de revisión.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => router.push(`/accidentabilidad/consultar/${done.id}`)}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-white"
          >
            Ver reporte
          </button>
          <button
            onClick={() => router.push("/accidentabilidad/consultar")}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary"
          >
            Ir a consultas
          </button>
        </div>
      </div>
    );
  }

  const miss = (label: string) => missing.includes(label);

  return (
    <div className="mx-auto max-w-2xl pb-20">
      {/* Stepper */}
      <div className="mb-6 flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-1.5">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                i === step
                  ? "bg-gold text-white"
                  : i < step
                  ? "bg-positive text-white"
                  : "bg-slate-100 text-text-muted"
              }`}
            >
              {i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 ${i < step ? "bg-positive" : "bg-slate-100"}`} />
            )}
          </div>
        ))}
      </div>
      <h2 className="mb-4 text-lg font-semibold text-text-primary">{STEPS[step]}</h2>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-negative-bg px-3 py-2 text-sm text-negative">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── Paso 1: Conductor ── */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Cédula del conductor</label>
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="Número de cédula"
                inputMode="numeric"
              />
              <button
                onClick={buscar}
                disabled={pending}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </button>
            </div>
          </div>

          {needsCreate && (
            <div className="rounded-lg border border-border bg-gold-subtle p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
                <UserPlus className="h-4 w-4 text-gold-dark" /> No existe. Crea el conductor:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>Nombre completo *</label>
                  <input className={inputCls} value={newCond.nombre} onChange={(e) => setNewCond({ ...newCond, nombre: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Cédula</label>
                  <input className={inputCls} value={newCond.cedula} onChange={(e) => setNewCond({ ...newCond, cedula: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Licencia</label>
                  <input className={inputCls} value={newCond.licencia ?? ""} onChange={(e) => setNewCond({ ...newCond, licencia: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Celular</label>
                  <input className={inputCls} value={newCond.celular ?? ""} onChange={(e) => setNewCond({ ...newCond, celular: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Correo</label>
                  <input className={inputCls} value={newCond.correo ?? ""} onChange={(e) => setNewCond({ ...newCond, correo: e.target.value })} />
                </div>
              </div>
              <button onClick={crearConductor} disabled={pending} className="mt-3 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {pending ? "Creando…" : "Crear y continuar"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Paso 2: Confirmar conductor ── */}
      {step === 1 && conductor && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-raised p-4">
            <Row label="Nombre" value={conductor.nombre} />
            <Row label="Cédula" value={conductor.cedula} />
            <Row label="Licencia" value={conductor.licencia || "—"} />
          </div>
          <p className="text-sm text-text-tertiary">Verifica que los datos del conductor sean correctos.</p>
          <NavButtons onBack={() => setStep(0)} onNext={() => setStep(2)} backLabel="Cambiar conductor" />
        </div>
      )}

      {/* ── Paso 3: Datos del accidente ── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Fecha y hora {miss("Fecha del accidente") && <span className="text-negative">*</span>}</label>
              <input type="datetime-local" className={`${inputCls} ${miss("Fecha del accidente") ? "border-negative" : ""}`} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Dirección del accidente {miss("Dirección del accidente") && <span className="text-negative">*</span>}</label>
              <input className={`${inputCls} ${miss("Dirección del accidente") ? "border-negative" : ""}`} value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ej: Cra 50 # 10-20" />
            </div>
          </div>

          {/* Vehículos */}
          <div>
            <label className={labelCls}>Vehículos implicados</label>
            <div className="space-y-2">
              {vehiculos.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className={inputCls} value={v.placa} placeholder="Placa" onChange={(e) => updateVeh(i, { placa: e.target.value })} />
                  <input className={inputCls} value={v.descripcion} placeholder="Descripción (ej: el que nos chocó)" onChange={(e) => updateVeh(i, { descripcion: e.target.value })} />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-text-secondary">
                    <input type="checkbox" checked={v.es_propio} onChange={(e) => updateVeh(i, { es_propio: e.target.checked })} /> propio
                  </label>
                  <button onClick={() => setVehiculos(vehiculos.filter((_, j) => j !== i))} className="shrink-0 text-text-muted hover:text-negative">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setVehiculos([...vehiculos, { placa: "", descripcion: "", es_propio: false }])} className="mt-2 inline-flex items-center gap-1 text-sm text-gold-dark">
              <Plus className="h-4 w-4" /> Agregar vehículo
            </button>
          </div>

          {/* Peatón */}
          <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <input type="checkbox" checked={tienePeaton} onChange={(e) => setTienePeaton(e.target.checked)} /> ¿Hubo un peatón involucrado?
          </label>
          {tienePeaton && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
              <div className="col-span-2">
                <label className={labelCls}>Nombre {miss("Nombre del peatón") && <span className="text-negative">*</span>}</label>
                <input className={`${inputCls} ${miss("Nombre del peatón") ? "border-negative" : ""}`} value={peaton.nombre} onChange={(e) => setPeaton({ ...peaton, nombre: e.target.value })} />
              </div>
              <div><label className={labelCls}>Cédula</label><input className={inputCls} value={peaton.cedula} onChange={(e) => setPeaton({ ...peaton, cedula: e.target.value })} /></div>
              <div><label className={labelCls}>Teléfono</label><input className={inputCls} value={peaton.telefono} onChange={(e) => setPeaton({ ...peaton, telefono: e.target.value })} /></div>
              <div><label className={labelCls}>Dirección</label><input className={inputCls} value={peaton.direccion} onChange={(e) => setPeaton({ ...peaton, direccion: e.target.value })} /></div>
              <div><label className={labelCls}>Correo</label><input className={inputCls} value={peaton.correo} onChange={(e) => setPeaton({ ...peaton, correo: e.target.value })} /></div>
            </div>
          )}

          {/* Resumen + voz */}
          <div>
            <label className={labelCls}>Resumen de los hechos {miss("Resumen de los hechos") && <span className="text-negative">*</span>}</label>
            <textarea
              className={`${inputCls} min-h-28 ${miss("Resumen de los hechos") ? "border-negative" : ""}`}
              value={resumen}
              onChange={(e) => setResumen(e.target.value)}
              placeholder="Describe lo ocurrido o graba una nota de voz."
            />
            <div className="mt-2">
              <VoiceRecorder
                onTranscribed={(path, text) => {
                  setAudioPath(path);
                  setTranscripcion(text);
                  if (text) setResumen((prev) => (prev ? prev + "\n" + text : text));
                }}
              />
            </div>
          </div>

          <NavButtons onBack={() => setStep(1)} onNext={nextFromAccidente} />
        </div>
      )}

      {/* ── Paso 4: Arreglo / Aseguradora ── */}
      {step === 3 && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <input type="checkbox" checked={huboArreglo} onChange={(e) => { setHuboArreglo(e.target.checked); if (e.target.checked) setSolicitoAseguradora(false); }} />
            ¿Se llegó a un arreglo inmediato?
          </label>
          {huboArreglo && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Monto del arreglo</label><input className={inputCls} inputMode="decimal" value={arregloMonto} onChange={(e) => setArregloMonto(e.target.value)} placeholder="$" /></div>
                <div><label className={labelCls}>Quién recibe</label><input className={inputCls} value={arregloReceptor} onChange={(e) => setArregloReceptor(e.target.value)} /></div>
                <div><label className={labelCls}>Cédula de quien recibe</label><input className={inputCls} value={arregloReceptorCedula} onChange={(e) => setArregloReceptorCedula(e.target.value)} /></div>
              </div>
              <SignaturePad label="Firma de quien recibe el dinero" onChange={setArregloFirma} />
            </div>
          )}

          {!huboArreglo && (
            <>
              <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <input type="checkbox" checked={solicitoAseguradora} onChange={(e) => setSolicitoAseguradora(e.target.checked)} />
                ¿Se solicitó presencia de la aseguradora?
              </label>
              {solicitoAseguradora && (
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
                  <div className="col-span-2"><label className={labelCls}>Aseguradora</label><input className={inputCls} value={aseguradora} onChange={(e) => setAseguradora(e.target.value)} /></div>
                  <div><label className={labelCls}>Nombre del abogado</label><input className={inputCls} value={abogado.nombre} onChange={(e) => setAbogado({ ...abogado, nombre: e.target.value })} /></div>
                  <div><label className={labelCls}>Apellidos</label><input className={inputCls} value={abogado.apellidos} onChange={(e) => setAbogado({ ...abogado, apellidos: e.target.value })} /></div>
                  <div><label className={labelCls}>Cédula</label><input className={inputCls} value={abogado.cedula} onChange={(e) => setAbogado({ ...abogado, cedula: e.target.value })} /></div>
                  <div><label className={labelCls}>Celular de contacto</label><input className={inputCls} value={abogado.celular} onChange={(e) => setAbogado({ ...abogado, celular: e.target.value })} /></div>
                </div>
              )}
            </>
          )}

          <NavButtons onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </div>
      )}

      {/* ── Paso 5: Firmas ── */}
      {step === 4 && (
        <div className="space-y-5">
          <SignaturePad label="Firma del conductor (nuestra empresa)" required onChange={setFirmaConductor} />
          <SignaturePad label="Firma de la otra parte (tercero / peatón)" onChange={setFirmaTercero} />
          <NavButtons onBack={() => setStep(3)} onNext={() => setStep(5)} nextDisabled={!firmaConductor} />
        </div>
      )}

      {/* ── Paso 6: Guardar ── */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-raised p-4 text-sm">
            <Row label="Conductor" value={`${conductor?.nombre} (${conductor?.cedula})`} />
            <Row label="Fecha" value={fecha || "—"} />
            <Row label="Dirección" value={direccion} />
            <Row label="Vehículos" value={`${vehiculos.filter((v) => v.placa || v.descripcion).length}`} />
            <Row label="Peatón" value={tienePeaton ? peaton.nombre : "No"} />
            <Row label="Arreglo" value={huboArreglo ? `Sí — $${arregloMonto}` : solicitoAseguradora ? `Aseguradora: ${aseguradora}` : "No"} />
            <Row label="Firma conductor" value={firmaConductor ? "✓" : "Falta"} />
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => setStep(4)} className="inline-flex items-center gap-1 text-sm text-text-secondary">
              <ChevronLeft className="h-4 w-4" /> Atrás
            </button>
            <button onClick={guardar} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Guardar reporte
            </button>
          </div>
        </div>
      )}
    </div>
  );

  function updateVeh(i: number, patch: Partial<Vehiculo>) {
    setVehiculos((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border-subtle py-1.5 last:border-0">
      <span className="text-text-tertiary">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </div>
  );
}

function NavButtons({
  onBack, onNext, backLabel = "Atrás", nextDisabled,
}: { onBack: () => void; onNext: () => void; backLabel?: string; nextDisabled?: boolean }) {
  return (
    <div className="flex items-center justify-between pt-2">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-text-secondary">
        <ChevronLeft className="h-4 w-4" /> {backLabel}
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="inline-flex items-center gap-1 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Siguiente <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
