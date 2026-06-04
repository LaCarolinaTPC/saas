"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Save, AlertCircle } from "lucide-react";
import { actualizarAccidente } from "@/lib/actions";

type Vehiculo = { placa: string; descripcion: string; es_propio: boolean };

const inputCls =
  "w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";
const labelCls = "mb-1 block text-sm font-medium text-gray-900";

type Initial = {
  id: string;
  fecha_accidente: string;
  direccion_accidente: string;
  resumen_hechos: string | null;
  tiene_peaton: boolean;
  peaton_nombre: string | null;
  peaton_cedula: string | null;
  peaton_telefono: string | null;
  peaton_direccion: string | null;
  peaton_correo: string | null;
  hubo_arreglo: boolean;
  arreglo_monto: number | null;
  arreglo_receptor_nombre: string | null;
  arreglo_receptor_cedula: string | null;
  solicito_aseguradora: boolean;
  aseguradora_nombre: string | null;
  abogado_nombre: string | null;
  abogado_apellidos: string | null;
  abogado_cedula: string | null;
  abogado_celular: string | null;
  vehiculos: Vehiculo[];
};

function toLocalInput(iso: string) {
  // yyyy-MM-ddThh:mm para datetime-local
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function AccidenteEditForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [fecha, setFecha] = useState(initial.fecha_accidente ? toLocalInput(initial.fecha_accidente) : "");
  const [direccion, setDireccion] = useState(initial.direccion_accidente ?? "");
  const [resumen, setResumen] = useState(initial.resumen_hechos ?? "");
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>(
    initial.vehiculos.length ? initial.vehiculos : [{ placa: "", descripcion: "", es_propio: true }]
  );
  const [tienePeaton, setTienePeaton] = useState(initial.tiene_peaton);
  const [peaton, setPeaton] = useState({
    nombre: initial.peaton_nombre ?? "",
    cedula: initial.peaton_cedula ?? "",
    telefono: initial.peaton_telefono ?? "",
    direccion: initial.peaton_direccion ?? "",
    correo: initial.peaton_correo ?? "",
  });
  const [huboArreglo, setHuboArreglo] = useState(initial.hubo_arreglo);
  const [arregloMonto, setArregloMonto] = useState(initial.arreglo_monto != null ? String(initial.arreglo_monto) : "");
  const [arregloReceptor, setArregloReceptor] = useState(initial.arreglo_receptor_nombre ?? "");
  const [arregloReceptorCedula, setArregloReceptorCedula] = useState(initial.arreglo_receptor_cedula ?? "");
  const [solicitoAseguradora, setSolicitoAseguradora] = useState(initial.solicito_aseguradora);
  const [aseguradora, setAseguradora] = useState(initial.aseguradora_nombre ?? "");
  const [abogado, setAbogado] = useState({
    nombre: initial.abogado_nombre ?? "",
    apellidos: initial.abogado_apellidos ?? "",
    cedula: initial.abogado_cedula ?? "",
    celular: initial.abogado_celular ?? "",
  });

  function updateVeh(i: number, patch: Partial<Vehiculo>) {
    setVehiculos((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  function guardar() {
    setError(null);
    if (!direccion.trim()) {
      setError("La dirección del accidente es obligatoria.");
      return;
    }
    startTransition(async () => {
      const res = await actualizarAccidente(initial.id, {
        fecha_accidente: fecha ? new Date(fecha).toISOString() : undefined,
        direccion_accidente: direccion,
        resumen_hechos: resumen,
        tiene_peaton: tienePeaton,
        peaton,
        hubo_arreglo: huboArreglo,
        arreglo: { monto: arregloMonto, receptor_nombre: arregloReceptor, receptor_cedula: arregloReceptorCedula },
        solicito_aseguradora: solicitoAseguradora,
        aseguradora_nombre: aseguradora,
        abogado,
        vehiculos,
      });
      if (!res.success) setError(res.error || "No se pudo guardar.");
      else router.push(`/accidentabilidad/consultar/${initial.id}`);
    });
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-[#FEE2E2] px-3 py-2 text-sm text-[#EF4444]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Fecha y hora</label>
          <input type="datetime-local" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Dirección del accidente *</label>
          <input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Vehículos implicados</label>
        <div className="space-y-2">
          {vehiculos.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={inputCls} value={v.placa} placeholder="Placa" onChange={(e) => updateVeh(i, { placa: e.target.value })} />
              <input className={inputCls} value={v.descripcion} placeholder="Descripción" onChange={(e) => updateVeh(i, { descripcion: e.target.value })} />
              <label className="flex shrink-0 items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" checked={v.es_propio} onChange={(e) => updateVeh(i, { es_propio: e.target.checked })} /> propio
              </label>
              <button onClick={() => setVehiculos(vehiculos.filter((_, j) => j !== i))} className="shrink-0 text-gray-400 hover:text-[#EF4444]">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => setVehiculos([...vehiculos, { placa: "", descripcion: "", es_propio: false }])} className="mt-2 inline-flex items-center gap-1 text-sm text-[#4F46E5]">
          <Plus className="h-4 w-4" /> Agregar vehículo
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
        <input type="checkbox" checked={tienePeaton} onChange={(e) => setTienePeaton(e.target.checked)} /> ¿Hubo un peatón involucrado?
      </label>
      {tienePeaton && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#E2E8F0] p-3">
          <div className="col-span-2"><label className={labelCls}>Nombre</label><input className={inputCls} value={peaton.nombre} onChange={(e) => setPeaton({ ...peaton, nombre: e.target.value })} /></div>
          <div><label className={labelCls}>Cédula</label><input className={inputCls} value={peaton.cedula} onChange={(e) => setPeaton({ ...peaton, cedula: e.target.value })} /></div>
          <div><label className={labelCls}>Teléfono</label><input className={inputCls} value={peaton.telefono} onChange={(e) => setPeaton({ ...peaton, telefono: e.target.value })} /></div>
          <div><label className={labelCls}>Dirección</label><input className={inputCls} value={peaton.direccion} onChange={(e) => setPeaton({ ...peaton, direccion: e.target.value })} /></div>
          <div><label className={labelCls}>Correo</label><input className={inputCls} value={peaton.correo} onChange={(e) => setPeaton({ ...peaton, correo: e.target.value })} /></div>
        </div>
      )}

      <div>
        <label className={labelCls}>Resumen de los hechos</label>
        <textarea className={`${inputCls} min-h-28`} value={resumen} onChange={(e) => setResumen(e.target.value)} />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
        <input type="checkbox" checked={huboArreglo} onChange={(e) => { setHuboArreglo(e.target.checked); if (e.target.checked) setSolicitoAseguradora(false); }} /> ¿Se llegó a un arreglo inmediato?
      </label>
      {huboArreglo && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#E2E8F0] p-3">
          <div><label className={labelCls}>Monto</label><input className={inputCls} inputMode="decimal" value={arregloMonto} onChange={(e) => setArregloMonto(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))} placeholder="$" /></div>
          <div><label className={labelCls}>Quién recibe</label><input className={inputCls} value={arregloReceptor} onChange={(e) => setArregloReceptor(e.target.value)} /></div>
          <div><label className={labelCls}>Cédula de quien recibe</label><input className={inputCls} value={arregloReceptorCedula} onChange={(e) => setArregloReceptorCedula(e.target.value)} /></div>
        </div>
      )}

      {!huboArreglo && (
        <>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <input type="checkbox" checked={solicitoAseguradora} onChange={(e) => setSolicitoAseguradora(e.target.checked)} /> ¿Se solicitó presencia de la aseguradora?
          </label>
          {solicitoAseguradora && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#E2E8F0] p-3">
              <div className="col-span-2"><label className={labelCls}>Aseguradora</label><input className={inputCls} value={aseguradora} onChange={(e) => setAseguradora(e.target.value)} /></div>
              <div><label className={labelCls}>Nombre del abogado</label><input className={inputCls} value={abogado.nombre} onChange={(e) => setAbogado({ ...abogado, nombre: e.target.value })} /></div>
              <div><label className={labelCls}>Apellidos</label><input className={inputCls} value={abogado.apellidos} onChange={(e) => setAbogado({ ...abogado, apellidos: e.target.value })} /></div>
              <div><label className={labelCls}>Cédula</label><input className={inputCls} value={abogado.cedula} onChange={(e) => setAbogado({ ...abogado, cedula: e.target.value })} /></div>
              <div><label className={labelCls}>Celular de contacto</label><input className={inputCls} value={abogado.celular} onChange={(e) => setAbogado({ ...abogado, celular: e.target.value })} /></div>
            </div>
          )}
        </>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button onClick={() => router.back()} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-medium text-gray-600">
          Cancelar
        </button>
        <button onClick={guardar} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </button>
      </div>
      <p className="text-xs text-gray-500">Al guardar, el reporte vuelve a quedar <strong>pendiente de revisión</strong>.</p>
    </div>
  );
}
