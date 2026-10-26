"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Eye, Pencil, Plus, Presentation, Trash2, Tv } from "lucide-react";
import { toast } from "sonner";
import {
  crearPresentacion,
  duplicarPresentacion,
  eliminarPresentacion,
  renombrarPresentacion,
} from "@/lib/pantalla/actions";
import type { PresentacionResumen } from "@/lib/pantalla/consultas";
import { Modal, claseBotonPeligro, claseBotonPrimario, claseBotonSecundario, claseInput, haceCuanto } from "./modal";

const duracion = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim());

export function PresentacionesClient({ presentaciones }: { presentaciones: PresentacionResumen[] }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();
  const [crear, setCrear] = useState(false);
  const [renombrar, setRenombrar] = useState<PresentacionResumen | null>(null);
  const [borrar, setBorrar] = useState<PresentacionResumen | null>(null);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cerrar = () => {
    setCrear(false);
    setRenombrar(null);
    setBorrar(null);
    setNombre("");
    setError(null);
  };

  const onCrear = () =>
    start(async () => {
      const r = await crearPresentacion(nombre);
      if (!r.ok) return setError(r.error);
      cerrar();
      router.push(`/pantalla/${r.id}`);
    });

  const onRenombrar = () =>
    start(async () => {
      if (!renombrar) return;
      const r = await renombrarPresentacion(renombrar.id, nombre);
      if (!r.ok) return setError(r.error);
      cerrar();
      router.refresh();
    });

  const onBorrar = () =>
    start(async () => {
      if (!borrar) return;
      const r = await eliminarPresentacion(borrar.id);
      if (!r.ok) return setError(r.error);
      cerrar();
      toast.success("Presentación eliminada");
      router.refresh();
    });

  const onDuplicar = (p: PresentacionResumen) =>
    start(async () => {
      const r = await duplicarPresentacion(p.id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Copia creada");
      router.refresh();
    });

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-500">
          Cada presentación es una lista de diapositivas. Lo que se edita es un <b>borrador</b>: los televisores solo
          cambian cuando se <b>publica</b>.
        </p>
        <button onClick={() => setCrear(true)} className={claseBotonPrimario}>
          <Plus className="h-4 w-4" /> Nueva presentación
        </button>
      </div>

      {presentaciones.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-sm text-gray-400">
          <Presentation className="h-10 w-10 text-gray-300" />
          Aún no hay presentaciones. Cree la primera para empezar.
        </div>
      ) : (
        <div className="divide-y divide-[#F1F5F9]">
          {presentaciones.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
              <div className="min-w-[220px] flex-1">
                <Link href={`/pantalla/${p.id}`} className="font-medium text-gray-900 hover:text-[#4F46E5]">
                  {p.nombre}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>
                    {p.diapositivas} {p.diapositivas === 1 ? "diapositiva" : "diapositivas"} · {duracion(p.duracionSeg)}
                  </span>
                  <span>· editada {haceCuanto(p.updatedAt)}</span>
                  {p.dispositivos > 0 && (
                    <span className="inline-flex items-center gap-1">
                      · <Tv className="h-3 w-3" /> {p.dispositivos} {p.dispositivos === 1 ? "TV" : "TV"}
                    </span>
                  )}
                </div>
              </div>
              <div>
                {p.publicada ? (
                  <span className="inline-flex rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-xs font-medium text-[#166534]">
                    Publicada v{p.version}
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Borrador</span>
                )}
                {p.publicada && p.cambiosSinPublicar && (
                  <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    Cambios sin publicar
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/pantalla/${p.id}`} className={claseBotonSecundario}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Link>
                <a href={`/pantalla/${p.id}/vista-previa?de=borrador`} target="_blank" rel="noreferrer" className={claseBotonSecundario}>
                  <Eye className="h-3.5 w-3.5" /> Vista previa
                </a>
                <button onClick={() => onDuplicar(p)} disabled={pendiente} className={claseBotonSecundario} title="Duplicar">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    setRenombrar(p);
                    setNombre(p.nombre);
                  }}
                  className={claseBotonSecundario}
                >
                  Renombrar
                </button>
                <button onClick={() => setBorrar(p)} className={claseBotonPeligro} title="Eliminar">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(crear || renombrar) && (
        <Modal titulo={crear ? "Nueva presentación" : "Renombrar"} onCerrar={cerrar}>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="nombre-presentacion">
            Nombre
          </label>
          <input
            id="nombre-presentacion"
            className={claseInput}
            value={nombre}
            maxLength={80}
            autoFocus
            placeholder="Ej: Patio · octubre"
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nombre.trim() && (crear ? onCrear() : onRenombrar())}
          />
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={cerrar} className={claseBotonSecundario}>
              Cancelar
            </button>
            <button onClick={crear ? onCrear : onRenombrar} disabled={pendiente || !nombre.trim()} className={claseBotonPrimario}>
              {crear ? "Crear y editar" : "Guardar"}
            </button>
          </div>
        </Modal>
      )}

      {borrar && (
        <Modal titulo={`¿Eliminar «${borrar.nombre}»?`} onCerrar={cerrar}>
          <p className="text-sm text-gray-600">Se borran el borrador y la versión publicada. No se puede deshacer.</p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={cerrar} className={claseBotonSecundario}>
              Cancelar
            </button>
            <button onClick={onBorrar} disabled={pendiente} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              Eliminar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
