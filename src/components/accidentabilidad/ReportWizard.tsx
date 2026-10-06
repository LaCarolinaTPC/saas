"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Loader2, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import SignaturePad from "./SignaturePad";
import VoiceRecorder from "./VoiceRecorder";
import Link from "next/link";
import { buscarConductorBasic } from "@/lib/actions";
import {
  LESIONADOS,
  DANOS,
  RESPONSABILIDAD,
  GRAVEDAD,
  clasificarGravedad,
  type Lesionados,
  type Danos,
  type Responsabilidad,
} from "@/lib/accidentabilidad/policy";
import {
  CLASE_ACCIDENTE,
  claseDesdeLesionados,
  vehiculoPropioVacio,
  type Catalogos,
  type Tercero,
  type Victima,
} from "@/lib/accidentabilidad/formato";
import {
  AgenteSection,
  CiudadSelect,
  HipotesisSection,
  TercerosSection,
  VehiculoPropioSection,
  VictimasSection,
  inputCls,
  labelCls,
} from "./FormatoSecciones";

type Conductor = {
  id?: string;
  cedula: string;
  nombre: string;
  codigo?: string | null;
  licencia?: string | null;
  celular?: string | null;
  correo?: string | null;
};

const STEPS = [
  "Conductor",
  "Confirmar",
  "Datos del accidente",
  "Factores e hipótesis",
  "Información de los hechos",
  "Terceros y lesionados",
  "Arreglo, aseguradora y agente",
  "Firmas",
  "Guardar",
];

export default function ReportWizard({ catalogos }: { catalogos: Catalogos }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Conductor
  const [cedula, setCedula] = useState("");
  const [conductor, setConductor] = useState<Conductor | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Autocompletado de conductor (en vivo desde GEMA → conductores_con_grupo)
  type Sugerencia = {
    cedula: string;
    nombre: string;
    estado?: string | null;
    grupo_antiguedad?: string | null;
  };
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [showSug, setShowSug] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = cedula.trim();
    if (conductor || q.length < 2) {
      setSugerencias([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/rotacion/conductores/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSugerencias(Array.isArray(data) ? data.slice(0, 8) : []);
        setShowSug(true);
      } catch {
        setSugerencias([]);
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cedula, conductor]);

  function seleccionarConductor(ced: string) {
    setShowSug(false);
    setSugerencias([]);
    setError(null);
    setNotFound(false);
    startTransition(async () => {
      const { conductor: c } = await buscarConductorBasic(ced.trim());
      if (c) {
        setCedula(c.cedula);
        setConductor(c);
        setStep(1);
      } else {
        setNotFound(true);
      }
    });
  }

  // 1. Datos del accidente
  const [fecha, setFecha] = useState("");
  const [direccion, setDireccion] = useState("");
  // Con una sola ciudad configurada se preselecciona.
  const [ciudad, setCiudad] = useState(catalogos.ciudad.length === 1 ? catalogos.ciudad[0].label : "");
  const [vehiculoPropio, setVehiculoPropio] = useState(vehiculoPropioVacio());
  const [lesionados, setLesionados] = useState("");
  const [danos, setDanos] = useState("");
  const [responsabilidad, setResponsabilidad] = useState("");

  // Factores e hipótesis (códigos de tránsito)
  const [factoresCodigos, setFactoresCodigos] = useState<string[]>([]);
  const [usoCelular, setUsoCelular] = useState(false);

  // 2. Información de los hechos (declaración del conductor)
  const [resumen, setResumen] = useState("");
  const [transcripcion, setTranscripcion] = useState("");
  const [audioPath, setAudioPath] = useState<string | null>(null);

  // 3 y 4. Terceros y lesionados
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [victimas, setVictimas] = useState<Victima[]>([]);

  // Arreglo / aseguradora / agente
  const [huboArreglo, setHuboArreglo] = useState(false);
  const [arregloMonto, setArregloMonto] = useState("");
  const [arregloReceptor, setArregloReceptor] = useState("");
  const [arregloReceptorCedula, setArregloReceptorCedula] = useState("");
  const [arregloFirma, setArregloFirma] = useState<string | null>(null);
  const [solicitoAseguradora, setSolicitoAseguradora] = useState(false);
  const [aseguradora, setAseguradora] = useState("");
  const [abogado, setAbogado] = useState({ nombre: "", apellidos: "", cedula: "", celular: "" });
  const [agente, setAgente] = useState({ nombre: "", placa: "", celular: "" });

  // Firmas
  const [firmaConductor, setFirmaConductor] = useState<string | null>(null);
  const [firmaTercero, setFirmaTercero] = useState<string | null>(null);

  // Validación
  const [missing, setMissing] = useState<string[]>([]);
  const [done, setDone] = useState<{ id: string; consecutivo: number } | null>(null);

  const hayLesionados = Boolean(lesionados) && lesionados !== "ninguno";
  const clase = claseDesdeLesionados((lesionados || null) as Lesionados | null);

  function buscar() {
    setError(null);
    setNotFound(false);
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
        setNotFound(true);
      }
    });
  }

  function avanzar(validar: () => string[], siguiente: number) {
    const m = validar();
    setMissing(m);
    if (m.length === 0) {
      setError(null);
      setStep(siguiente);
    } else {
      setError("Faltan campos por completar (resaltados en rojo).");
    }
  }

  function validateAccidente(): string[] {
    const m: string[] = [];
    if (!direccion.trim()) m.push("Dirección del accidente");
    if (!fecha) m.push("Fecha del accidente");
    if (!ciudad.trim()) m.push("Ciudad");
    if (!lesionados) m.push("Lesionados");
    if (!danos) m.push("Daños");
    return m;
  }

  function validateHechos(): string[] {
    return !resumen.trim() && !transcripcion.trim() ? ["Declaración del conductor"] : [];
  }

  function validateTerceros(): string[] {
    if (victimas.some((v) => !v.nombre.trim())) return ["Nombre del lesionado"];
    if (hayLesionados && victimas.length === 0) return ["Lesionados registrados"];
    return [];
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
        ciudad,
        lesionados: lesionados || null,
        danos_materiales: danos || null,
        responsabilidad_reportada: responsabilidad || null,
        resumen_hechos: resumen,
        nota_voz_path: audioPath,
        nota_voz_transcripcion: transcripcion,
        hubo_arreglo: huboArreglo,
        arreglo: huboArreglo
          ? { monto: arregloMonto, receptor_nombre: arregloReceptor, receptor_cedula: arregloReceptorCedula, firma: arregloFirma }
          : {},
        solicito_aseguradora: solicitoAseguradora,
        aseguradora_nombre: aseguradora,
        abogado: solicitoAseguradora ? abogado : {},
        firma_conductor: firmaConductor,
        firma_tercero: firmaTercero,
        formato: {
          vehiculo_propio: vehiculoPropio,
          factores_codigos: factoresCodigos,
          uso_celular: usoCelular,
          terceros,
          victimas: hayLesionados ? victimas : [],
          agente,
        },
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
        <CheckCircle2 className="mx-auto h-14 w-14 text-[#059669]" />
        <h2 className="mt-4 text-xl font-semibold text-gray-900">Reporte guardado</h2>
        <p className="mt-1 text-sm text-gray-500">
          Reporte <strong>#{done.consecutivo}</strong> registrado y marcado como pendiente de revisión.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => router.push(`/accidentabilidad/consultar/${done.id}`)}
            className="rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white"
          >
            Ver reporte
          </button>
          <button
            onClick={() => router.push("/accidentabilidad/consultar")}
            className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-600"
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
      <div className="mb-6 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-1 last:flex-none">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                i === step
                  ? "bg-[#4F46E5] text-white"
                  : i < step
                  ? "bg-[#059669] text-white"
                  : "bg-slate-100 text-gray-400"
              }`}
            >
              {i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 ${i < step ? "bg-[#059669]" : "bg-slate-100"}`} />
            )}
          </div>
        ))}
      </div>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{STEPS[step]}</h2>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-[#FEE2E2] px-3 py-2 text-sm text-[#EF4444]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* ── Paso 1: Conductor ── */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Cédula o nombre del conductor</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  className={inputCls}
                  value={cedula}
                  onChange={(e) => {
                    setCedula(e.target.value);
                    setConductor(null);
                    setNotFound(false);
                  }}
                  onFocus={() => sugerencias.length > 0 && setShowSug(true)}
                  placeholder="Escribe la cédula o el nombre…"
                  autoComplete="off"
                />
                {buscando && (
                  <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-400" />
                )}

                {showSug && sugerencias.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-[#E2E8F0] bg-white py-1 shadow-lg">
                    {sugerencias.map((s) => (
                      <li key={s.cedula}>
                        <button
                          type="button"
                          onClick={() => seleccionarConductor(s.cedula)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#F8FAFC]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-gray-900">{s.nombre}</span>
                            <span className="block text-xs text-gray-500">CC {s.cedula}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {s.grupo_antiguedad && (
                              <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[11px] text-[#4F46E5]">{s.grupo_antiguedad}</span>
                            )}
                            {s.estado && (
                              <span className={`rounded-full px-2 py-0.5 text-[11px] ${s.estado === "ACTIVO" ? "bg-[#DCFCE7] text-[#059669]" : "bg-[#F1F5F9] text-gray-500"}`}>{s.estado}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={buscar}
                disabled={pending}
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </button>
            </div>
            {cedula.trim().length >= 2 && !buscando && sugerencias.length === 0 && !conductor && !notFound && (
              <p className="mt-1.5 text-xs text-gray-400">Sin coincidencias en GEMA para “{cedula.trim()}”.</p>
            )}
          </div>

          {notFound && (
            <div className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-[#991B1B]">
                <AlertCircle className="h-4 w-4 shrink-0" /> Conductor no registrado en Rotación
              </p>
              <p className="mt-1 text-sm text-gray-600">
                La cédula <strong>{cedula}</strong> no existe en el módulo de Rotación. Para reportar un
                accidente, el conductor debe estar cargado allí primero.
              </p>
              <Link
                href="/rotacion/datos"
                className="mt-3 inline-block rounded-lg border border-[#E2E8F0] bg-white px-4 py-2 text-sm font-medium text-[#4F46E5] hover:bg-[#EEF2FF]"
              >
                Ir a Rotación → Datos
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Paso 2: Confirmar conductor ── */}
      {step === 1 && conductor && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4">
            <Row label="Nombre" value={conductor.nombre} />
            <Row label="Cédula" value={conductor.cedula} />
            <Row label="Código" value={conductor.codigo || "—"} />
            <Row label="Licencia" value={conductor.licencia || "—"} />
          </div>
          <p className="text-sm text-gray-500">Verifica que los datos del conductor sean correctos.</p>
          <NavButtons onBack={() => setStep(0)} onNext={() => setStep(2)} backLabel="Cambiar conductor" />
        </div>
      )}

      {/* ── Paso 3: Datos del accidente ── */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Fecha y hora {miss("Fecha del accidente") && <span className="text-[#EF4444]">*</span>}</label>
              <input type="datetime-local" className={`${inputCls} ${miss("Fecha del accidente") ? "border-[#EF4444]" : ""}`} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Ciudad donde ocurrió {miss("Ciudad") && <span className="text-[#EF4444]">*</span>}</label>
              <CiudadSelect ciudades={catalogos.ciudad} value={ciudad} onChange={setCiudad} invalid={miss("Ciudad")} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Dirección del accidente {miss("Dirección del accidente") && <span className="text-[#EF4444]">*</span>}</label>
              <input className={`${inputCls} ${miss("Dirección del accidente") ? "border-[#EF4444]" : ""}`} value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ej: Cra 50 # 10-20" />
            </div>
          </div>

          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <p className="mb-3 text-sm font-semibold text-gray-900">Vehículo de la empresa</p>
            <VehiculoPropioSection value={vehiculoPropio} onChange={setVehiculoPropio} />
          </div>

          {/* Clasificación inicial — alimenta la evaluación automática */}
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <p className="mb-3 text-sm font-semibold text-gray-900">Clase de accidente</p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>¿Hubo lesionados? {miss("Lesionados") && <span className="text-[#EF4444]">*</span>}</label>
                <select className={`${inputCls} ${miss("Lesionados") ? "border-[#EF4444]" : ""}`} value={lesionados} onChange={(e) => setLesionados(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {(Object.keys(LESIONADOS) as Lesionados[]).map((k) => (
                    <option key={k} value={k}>{LESIONADOS[k].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Daños materiales {miss("Daños") && <span className="text-[#EF4444]">*</span>}</label>
                <select className={`${inputCls} ${miss("Daños") ? "border-[#EF4444]" : ""}`} value={danos} onChange={(e) => setDanos(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {(Object.keys(DANOS) as Danos[]).map((k) => (
                    <option key={k} value={k}>{DANOS[k].label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className={labelCls}>Responsabilidad</label>
              <select className={inputCls} value={responsabilidad} onChange={(e) => setResponsabilidad(e.target.value)}>
                <option value="">En estudio</option>
                {(Object.keys(RESPONSABILIDAD) as Responsabilidad[]).filter((r) => r !== "en_estudio").map((r) => (
                  <option key={r} value={r}>{RESPONSABILIDAD[r].label}</option>
                ))}
              </select>
            </div>

            {(() => {
              const g = clasificarGravedad((lesionados || null) as Lesionados | null, (danos || null) as Danos | null);
              if (!g && !clase) return null;
              return (
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
                  {clase && (
                    <>
                      Clase:{" "}
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold text-gray-900 ring-1 ring-[#E2E8F0]">
                        {CLASE_ACCIDENTE[clase]}
                      </span>
                    </>
                  )}
                  {g && (
                    <>
                      Gravedad estimada:{" "}
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-sm font-semibold text-gray-900 ring-1 ring-[#E2E8F0]">
                        {GRAVEDAD[g].label}
                      </span>
                    </>
                  )}
                  <span className="text-xs text-gray-400">— se calculan solas; el revisor puede ajustar la gravedad.</span>
                </p>
              );
            })()}
          </div>

          <NavButtons onBack={() => setStep(1)} onNext={() => avanzar(validateAccidente, 3)} />
        </div>
      )}

      {/* ── Paso 4: Factores e hipótesis ── */}
      {step === 3 && (
        <div className="space-y-4">
          <HipotesisSection
            factores={catalogos.factor}
            value={factoresCodigos}
            onChange={setFactoresCodigos}
            usoCelular={usoCelular}
            onUsoCelular={setUsoCelular}
          />
          <NavButtons onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </div>
      )}

      {/* ── Paso 5: Declaración del conductor ── */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Declaración del conductor {miss("Declaración del conductor") && <span className="text-[#EF4444]">*</span>}</label>
            <p className="mb-2 text-xs text-gray-500">Versión detallada del conductor sobre cómo ocurrieron los hechos. Puedes escribirla o grabar una nota de voz.</p>
            <textarea
              className={`${inputCls} min-h-40 ${miss("Declaración del conductor") ? "border-[#EF4444]" : ""}`}
              value={resumen}
              onChange={(e) => setResumen(e.target.value)}
              placeholder="Describe lo ocurrido…"
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
          <NavButtons onBack={() => setStep(3)} onNext={() => avanzar(validateHechos, 5)} />
        </div>
      )}

      {/* ── Paso 6: Terceros y lesionados ── */}
      {step === 5 && (
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Datos del tercero</h3>
            <TercerosSection
              value={terceros}
              onChange={setTerceros}
              tiposVehiculo={catalogos.tipo_vehiculo}
              aseguradoras={catalogos.aseguradora}
            />
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold text-gray-900">
              Lesionados o víctimas fatales {miss("Lesionados registrados") && <span className="text-[#EF4444]">*</span>}
            </h3>
            {hayLesionados ? (
              <>
                <p className="mb-3 text-xs text-gray-500">Registra a cada persona lesionada o fallecida.</p>
                <VictimasSection value={victimas} onChange={setVictimas} missingNombre={miss("Nombre del lesionado")} />
              </>
            ) : (
              <p className="text-sm text-gray-500">El reporte indica que no hubo lesionados.</p>
            )}
          </section>

          <NavButtons onBack={() => setStep(4)} onNext={() => avanzar(validateTerceros, 6)} />
        </div>
      )}

      {/* ── Paso 7: Arreglo / Aseguradora / Agente ── */}
      {step === 6 && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <input type="checkbox" checked={huboArreglo} onChange={(e) => { setHuboArreglo(e.target.checked); if (e.target.checked) setSolicitoAseguradora(false); }} />
            ¿Se llegó a un arreglo inmediato?
          </label>
          {huboArreglo && (
            <div className="space-y-3 rounded-lg border border-[#E2E8F0] p-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Monto del arreglo</label><input className={inputCls} inputMode="decimal" value={arregloMonto} onChange={(e) => setArregloMonto(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))} placeholder="$" /></div>
                <div><label className={labelCls}>Quién recibe</label><input className={inputCls} value={arregloReceptor} onChange={(e) => setArregloReceptor(e.target.value)} /></div>
                <div><label className={labelCls}>Cédula de quien recibe</label><input className={inputCls} value={arregloReceptorCedula} onChange={(e) => setArregloReceptorCedula(e.target.value)} /></div>
              </div>
              <SignaturePad label="Firma de quien recibe el dinero" onChange={setArregloFirma} />
            </div>
          )}

          {!huboArreglo && (
            <>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
                <input type="checkbox" checked={solicitoAseguradora} onChange={(e) => setSolicitoAseguradora(e.target.checked)} />
                ¿Se solicitó presencia de la aseguradora?
              </label>
              {solicitoAseguradora && (
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#E2E8F0] p-3">
                  <div className="col-span-2">
                    <label className={labelCls}>Aseguradora</label>
                    <input className={inputCls} list="aseguradoras-propias" value={aseguradora} onChange={(e) => setAseguradora(e.target.value)} />
                    <datalist id="aseguradoras-propias">
                      {catalogos.aseguradora.map((a) => <option key={a.id} value={a.label} />)}
                    </datalist>
                  </div>
                  <div><label className={labelCls}>Nombre del abogado</label><input className={inputCls} value={abogado.nombre} onChange={(e) => setAbogado({ ...abogado, nombre: e.target.value })} /></div>
                  <div><label className={labelCls}>Apellidos</label><input className={inputCls} value={abogado.apellidos} onChange={(e) => setAbogado({ ...abogado, apellidos: e.target.value })} /></div>
                  <div><label className={labelCls}>Cédula</label><input className={inputCls} value={abogado.cedula} onChange={(e) => setAbogado({ ...abogado, cedula: e.target.value })} /></div>
                  <div><label className={labelCls}>Celular del abogado</label><input className={inputCls} value={abogado.celular} onChange={(e) => setAbogado({ ...abogado, celular: e.target.value })} /></div>
                </div>
              )}
            </>
          )}

          <div className="rounded-lg border border-[#E2E8F0] p-3">
            <p className="mb-3 text-sm font-semibold text-gray-900">Agente de tránsito</p>
            <AgenteSection value={agente} onChange={setAgente} />
          </div>

          <NavButtons onBack={() => setStep(5)} onNext={() => setStep(7)} />
        </div>
      )}

      {/* ── Paso 8: Firmas ── */}
      {step === 7 && (
        <div className="space-y-5">
          <SignaturePad label="Firma del conductor (nuestra empresa)" required onChange={setFirmaConductor} />
          <SignaturePad label="Firma de la otra parte (tercero / peatón)" onChange={setFirmaTercero} />
          <NavButtons onBack={() => setStep(6)} onNext={() => setStep(8)} nextDisabled={!firmaConductor} />
        </div>
      )}

      {/* ── Paso 9: Guardar ── */}
      {step === 8 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 text-sm">
            <Row label="Conductor" value={`${conductor?.nombre} (${conductor?.cedula})`} />
            <Row label="Fecha" value={fecha || "—"} />
            <Row label="Lugar" value={[direccion, ciudad].filter(Boolean).join(", ")} />
            <Row label="Vehículo" value={[vehiculoPropio.codigo && `N.º ${vehiculoPropio.codigo}`, vehiculoPropio.placa].filter(Boolean).join(" · ") || "—"} />
            <Row label="Clase" value={clase ? CLASE_ACCIDENTE[clase] : "—"} />
            <Row label="Códigos de tránsito" value={factoresCodigos.length ? factoresCodigos.join(", ") : "Ninguno"} />
            <Row label="Terceros" value={`${terceros.length}`} />
            <Row label="Lesionados" value={hayLesionados ? `${victimas.length}` : "No"} />
            <Row label="Arreglo" value={huboArreglo ? `Sí — $${arregloMonto}` : solicitoAseguradora ? `Aseguradora: ${aseguradora}` : "No"} />
            <Row label="Firma conductor" value={firmaConductor ? "✓" : "Falta"} />
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => setStep(7)} className="inline-flex items-center gap-1 text-sm text-gray-600">
              <ChevronLeft className="h-4 w-4" /> Atrás
            </button>
            <button onClick={guardar} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Guardar reporte
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#F1F5F9] py-1.5 last:border-0">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-900">{value}</span>
    </div>
  );
}

function NavButtons({
  onBack, onNext, backLabel = "Atrás", nextDisabled,
}: { onBack: () => void; onNext: () => void; backLabel?: string; nextDisabled?: boolean }) {
  return (
    <div className="flex items-center justify-between pt-2">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-600">
        <ChevronLeft className="h-4 w-4" /> {backLabel}
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="inline-flex items-center gap-1 rounded-lg bg-[#4F46E5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Siguiente <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
