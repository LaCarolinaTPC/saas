"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, AlertCircle } from "lucide-react";
import { actualizarAccidente } from "@/lib/actions";
import type { Catalogos, FormatoPayload } from "@/lib/accidentabilidad/formato";
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

type Initial = {
  id: string;
  fecha_accidente: string;
  direccion_accidente: string;
  ciudad: string | null;
  resumen_hechos: string | null;
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
  formato: FormatoPayload;
};

function toLocalInput(iso: string) {
  // yyyy-MM-ddThh:mm para datetime-local
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function AccidenteEditForm({ initial, catalogos }: { initial: Initial; catalogos: Catalogos }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [fecha, setFecha] = useState(initial.fecha_accidente ? toLocalInput(initial.fecha_accidente) : "");
  const [direccion, setDireccion] = useState(initial.direccion_accidente ?? "");
  const [ciudad, setCiudad] = useState(initial.ciudad ?? "");
  const [resumen, setResumen] = useState(initial.resumen_hechos ?? "");
  const [vehiculoPropio, setVehiculoPropio] = useState(initial.formato.vehiculo_propio);
  const [factoresCodigos, setFactoresCodigos] = useState(initial.formato.factores_codigos);
  const [usoCelular, setUsoCelular] = useState(initial.formato.uso_celular);
  const [terceros, setTerceros] = useState(initial.formato.terceros);
  const [victimas, setVictimas] = useState(initial.formato.victimas);
  const [agente, setAgente] = useState(initial.formato.agente);
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

  function guardar() {
    setError(null);
    if (!direccion.trim()) {
      setError("La dirección del accidente es obligatoria.");
      return;
    }
    if (victimas.some((v) => !v.nombre.trim())) {
      setError("Cada lesionado o víctima necesita nombre.");
      return;
    }
    startTransition(async () => {
      const res = await actualizarAccidente(initial.id, {
        fecha_accidente: fecha ? new Date(fecha).toISOString() : undefined,
        direccion_accidente: direccion,
        ciudad,
        resumen_hechos: resumen,
        hubo_arreglo: huboArreglo,
        arreglo: { monto: arregloMonto, receptor_nombre: arregloReceptor, receptor_cedula: arregloReceptorCedula },
        solicito_aseguradora: solicitoAseguradora,
        aseguradora_nombre: aseguradora,
        abogado,
        formato: {
          vehiculo_propio: vehiculoPropio,
          factores_codigos: factoresCodigos,
          uso_celular: usoCelular,
          terceros,
          victimas,
          agente,
        },
      });
      if (!res.success) setError(res.error || "No se pudo guardar.");
      else router.push(`/accidentabilidad/consultar/${initial.id}`);
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-[#FEE2E2] px-3 py-2 text-sm text-[#EF4444]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <Seccion titulo="1. Datos del accidente">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Fecha y hora</label>
            <input type="datetime-local" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Ciudad donde ocurrió</label>
            <CiudadSelect ciudades={catalogos.ciudad} value={ciudad} onChange={setCiudad} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Dirección del accidente *</label>
            <input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <VehiculoPropioSection value={vehiculoPropio} onChange={setVehiculoPropio} />
        </div>
      </Seccion>

      <Seccion titulo="Factores e hipótesis">
        <HipotesisSection
          factores={catalogos.factor}
          value={factoresCodigos}
          onChange={setFactoresCodigos}
          usoCelular={usoCelular}
          onUsoCelular={setUsoCelular}
        />
      </Seccion>

      <Seccion titulo="2. Información de los hechos">
        <label className={labelCls}>Declaración del conductor</label>
        <textarea className={`${inputCls} min-h-32`} value={resumen} onChange={(e) => setResumen(e.target.value)} />
      </Seccion>

      <Seccion titulo="3. Datos del tercero">
        <TercerosSection value={terceros} onChange={setTerceros} tiposVehiculo={catalogos.tipo_vehiculo} aseguradoras={catalogos.aseguradora} />
      </Seccion>

      <Seccion titulo="4. Lesionados o víctimas fatales">
        <VictimasSection value={victimas} onChange={setVictimas} />
      </Seccion>

      <Seccion titulo="5. Arreglo, aseguradora y agente">
        <div className="space-y-4">
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

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-900">Agente de tránsito</p>
            <AgenteSection value={agente} onChange={setAgente} />
          </div>
        </div>
      </Seccion>

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

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">{titulo}</h2>
      {children}
    </section>
  );
}
