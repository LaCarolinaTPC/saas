"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, MonitorSmartphone, Plus, ShieldAlert, Trash2, Tv } from "lucide-react";
import { toast } from "sonner";
import {
  asignarPresentacion,
  eliminarDispositivo,
  renombrarDispositivo,
  revocarDispositivo,
  vincularTv,
} from "@/lib/pantalla/actions";
import type { DispositivoFila, PresentacionResumen } from "@/lib/pantalla/consultas";
import { normalizarCodigo } from "@/lib/pantalla/vinculacion-reglas";
import { Modal, claseBotonPeligro, claseBotonPrimario, claseBotonSecundario, claseInput, fechaHora, haceCuanto } from "./modal";

const CHIP: Record<DispositivoFila["estado"], { texto: string; clase: string }> = {
  esperando_tv: { texto: "Esperando al TV", clase: "bg-amber-50 text-amber-700" },
  activa: { texto: "Activa", clase: "bg-[#DCFCE7] text-[#166534]" },
  revocada: { texto: "Revocada", clase: "bg-[#FEE2E2] text-[#991B1B]" },
};

/** «048213» → «048 213» mientras se escribe. */
function formatearCodigo(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 6);
  return d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
}

export function PantallasClient({
  dispositivos,
  presentaciones,
  urlDisplay,
}: {
  dispositivos: DispositivoFila[];
  presentaciones: PresentacionResumen[];
  urlDisplay: string;
}) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [vincular, setVincular] = useState(false);
  const [listo, setListo] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [presentacionId, setPresentacionId] = useState("");
  const [revocar, setRevocar] = useState<DispositivoFila | null>(null);
  const [renombrar, setRenombrar] = useState<DispositivoFila | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Mientras haya un TV «esperando», se refresca para verlo pasar a «Activa».
  const hayEsperando = dispositivos.some((d) => d.estado === "esperando_tv");
  useEffect(() => {
    if (!hayEsperando) return;
    const t = window.setInterval(() => router.refresh(), 5000);
    const fin = window.setTimeout(() => window.clearInterval(t), 120_000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(fin);
    };
  }, [hayEsperando, router]);

  const publicadas = presentaciones.filter((p) => p.publicada);

  const cerrar = () => {
    setVincular(false);
    setListo(false);
    setCodigo("");
    setNombre("");
    setPresentacionId("");
    setRevocar(null);
    setRenombrar(null);
    setError(null);
  };

  const onVincular = () =>
    start(async () => {
      setError(null);
      const r = await vincularTv(codigo, nombre, presentacionId || null);
      if (!r.ok) return setError(r.error);
      setListo(true);
      router.refresh();
    });

  const onRevocar = () =>
    start(async () => {
      if (!revocar) return;
      const r = await revocarDispositivo(revocar.id);
      if (!r.ok) return setError(r.error);
      toast.success(`«${revocar.nombre}» revocado. El TV volverá a pedir un código en menos de un minuto.`);
      cerrar();
      router.refresh();
    });

  const onRenombrar = () =>
    start(async () => {
      if (!renombrar) return;
      const r = await renombrarDispositivo(renombrar.id, nombre);
      if (!r.ok) return setError(r.error);
      cerrar();
      router.refresh();
    });

  const onAsignar = (d: DispositivoFila, id: string) =>
    start(async () => {
      const r = await asignarPresentacion(d.id, id || null);
      if (!r.ok) return void toast.error(r.error);
      toast.success(`«${d.nombre}» cambiará en menos de un minuto.`);
      router.refresh();
    });

  const onEliminar = (d: DispositivoFila) =>
    start(async () => {
      const r = await eliminarDispositivo(d.id);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });

  const copiarUrl = async () => {
    await navigator.clipboard.writeText(urlDisplay);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-2xl items-start gap-3">
          <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-[#4F46E5]" />
          <div className="text-sm text-gray-600">
            <p>
              En el navegador del televisor abra{" "}
              <button onClick={copiarUrl} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-800 hover:bg-gray-200">
                {urlDisplay} {copiado ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              </button>
              . Mostrará un código de 6 dígitos: tecléelo aquí con «Vincular TV».
            </p>
            <p className="mt-1 text-xs text-gray-400">
              El TV queda recordado en su navegador; no hay que escribir usuario ni contraseña en él. Si revoca un TV,
              vuelve a mostrar un código y se puede vincular de nuevo.
            </p>
          </div>
        </div>
        <button onClick={() => setVincular(true)} className={claseBotonPrimario}>
          <Plus className="h-4 w-4" /> Vincular TV
        </button>
      </div>

      {dispositivos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-400">
          <Tv className="h-10 w-10 text-gray-300" />
          Ningún televisor vinculado todavía.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-4">Televisor</th>
                <th className="py-2 pr-4">Presentación</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="whitespace-nowrap py-2 pr-4">Vinculado</th>
                <th className="whitespace-nowrap py-2 pr-4">Último contacto</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {dispositivos.map((d) => (
                <tr key={d.id} className="border-b border-[#F1F5F9] last:border-0" title={d.keyPrefix ? `Clave ${d.keyPrefix}…` : undefined}>
                  <td className="py-3 pr-4 font-medium text-gray-900">{d.nombre}</td>
                  <td className="py-3 pr-4">
                    {d.estado !== "revocada" ? (
                      <select
                        value={d.presentacionId ?? ""}
                        disabled={pendiente}
                        onChange={(e) => onAsignar(d, e.target.value)}
                        aria-label={`Presentación de ${d.nombre}`}
                        className="max-w-[240px] rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-[#4F46E5]"
                      >
                        <option value="">Sin presentación</option>
                        {presentaciones.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre}
                            {p.publicada ? "" : " (sin publicar)"}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${CHIP[d.estado].clase}`}>{CHIP[d.estado].texto}</span>
                  </td>
                  <td className="whitespace-nowrap py-3 pr-4 text-gray-500">{fechaHora(d.vinculadoAt)}</td>
                  <td className="whitespace-nowrap py-3 pr-4 text-gray-500">
                    {d.estado === "revocada" ? `revocado ${fechaHora(d.revokedAt)}` : haceCuanto(d.lastSeenAt)}
                  </td>
                  <td className="whitespace-nowrap py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {d.estado !== "revocada" && (
                        <button
                          onClick={() => {
                            setRenombrar(d);
                            setNombre(d.nombre);
                          }}
                          className={claseBotonSecundario}
                        >
                          Renombrar
                        </button>
                      )}
                      {d.estado === "activa" && (
                        <button onClick={() => setRevocar(d)} className={claseBotonPeligro}>
                          Revocar
                        </button>
                      )}
                      {d.estado !== "activa" && (
                        <button onClick={() => onEliminar(d)} disabled={pendiente} className={claseBotonPeligro} title="Quitar de la lista">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vincular && (
        <Modal titulo={listo ? "Listo" : "Vincular TV"} onCerrar={cerrar}>
          {listo ? (
            <>
              <p className="text-sm text-gray-600">
                «{nombre}» se conectará en unos segundos. Si no aparece la presentación, revise que esté publicada.
              </p>
              <div className="mt-6 flex justify-end">
                <button onClick={cerrar} className={claseBotonPrimario}>
                  Cerrar
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="codigo-tv">
                Código que muestra el TV
              </label>
              <input
                id="codigo-tv"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                className={`${claseInput} text-center font-mono text-2xl tracking-[0.3em]`}
                placeholder="000 000"
                value={codigo}
                onChange={(e) => setCodigo(formatearCodigo(e.target.value))}
              />
              <label className="mt-4 mb-1 block text-sm font-medium text-gray-700" htmlFor="nombre-tv">
                Nombre del TV
              </label>
              <input
                id="nombre-tv"
                className={claseInput}
                maxLength={80}
                placeholder="Ej: Recepción, Patio, Comedor"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
              <label className="mt-4 mb-1 block text-sm font-medium text-gray-700" htmlFor="pres-tv">
                Presentación
              </label>
              <select id="pres-tv" className={claseInput} value={presentacionId} onChange={(e) => setPresentacionId(e.target.value)}>
                <option value="">Sin presentación por ahora</option>
                {presentaciones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.publicada ? "" : " (sin publicar)"}
                  </option>
                ))}
              </select>
              {publicadas.length === 0 && presentaciones.length > 0 && (
                <p className="mt-1.5 text-xs text-amber-600">Ninguna presentación está publicada: el TV mostrará «sin presentación».</p>
              )}
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <div className="mt-6 flex justify-end gap-3">
                <button onClick={cerrar} className={claseBotonSecundario}>
                  Cancelar
                </button>
                <button onClick={onVincular} disabled={pendiente || !normalizarCodigo(codigo) || !nombre.trim()} className={claseBotonPrimario}>
                  {pendiente ? "Vinculando…" : "Vincular"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {renombrar && (
        <Modal titulo="Renombrar TV" onCerrar={cerrar}>
          <input className={claseInput} value={nombre} maxLength={80} autoFocus onChange={(e) => setNombre(e.target.value)} />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={cerrar} className={claseBotonSecundario}>
              Cancelar
            </button>
            <button onClick={onRenombrar} disabled={pendiente || !nombre.trim()} className={claseBotonPrimario}>
              Guardar
            </button>
          </div>
        </Modal>
      )}

      {revocar && (
        <Modal
          titulo={
            <span className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-600" /> ¿Revocar «{revocar.nombre}»?
            </span>
          }
          onCerrar={cerrar}
        >
          <p className="text-sm text-gray-600">
            El TV deja de mostrar la presentación en menos de un minuto y vuelve a la pantalla del código. Si fue un error,
            vincúlelo de nuevo con el código nuevo que aparezca.
          </p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={cerrar} className={claseBotonSecundario}>
              Cancelar
            </button>
            <button onClick={onRevocar} disabled={pendiente} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {pendiente ? "Revocando…" : "Revocar"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
