"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, ExternalLink, Plus, TriangleAlert, X } from "lucide-react";
import { DetalleIntento, colorEstado, fechaHora } from "@/components/psicosensotecnica/detalle-intento";
import { PESTANAS, estadoLegible, type Concepto, type Intento, type IntentoDetalle, type Pestana } from "@/lib/psicosensotecnica/tipos";
import { anularIntento, asignarPrueba, darConcepto, obtenerDetalle } from "./actions";

const ETIQUETA: Record<Pestana, string> = { por_revisar: "Por revisar", pendientes: "Por presentar", revisadas: "Revisadas", todas: "Todas" };

const FILTRO: Record<Pestana, (i: Intento) => boolean> = {
  por_revisar: (i) => i.estado === "terminado" && !i.concepto,
  pendientes: (i) => i.estado === "asignado" || i.estado === "en_curso",
  revisadas: (i) => i.estado === "terminado" && !!i.concepto,
  todas: () => true,
};

const dias = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);
const boton = "inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const campo = "w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary";

function descargarCsv(filas: Intento[]) {
  const celda = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lineas = [
    ["Cédula", "Nombre", "Origen", "Estado", "Asignada", "Presentada", "Puntaje", "Sugerencia", "Concepto", "Concepto por", "Fecha del concepto", "Observación"],
    ...filas.map((i) => [
      i.cedula, i.nombre, i.origen, estadoLegible(i), fechaHora(i.asignadoEn), fechaHora(i.terminadoEn), i.puntajeGlobal,
      i.sugerencia === "revisar" ? "Revisar" : i.sugerencia === "sin_alertas" ? "Sin alertas" : "", i.concepto === "apto" ? "Apto" : i.concepto === "no_apto" ? "No apto" : "",
      i.conceptoPorEmail, fechaHora(i.conceptoEn), i.conceptoObservacion,
    ]),
  ].map((l) => l.map(celda).join(";"));
  const url = URL.createObjectURL(new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "pruebas-psicosensotecnicas.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function PsicoClient({
  tabInicial, intentos, puedeEditar, puedeConcepto, puedeExportar,
}: {
  tabInicial: Pestana;
  intentos: Intento[];
  puedeEditar: boolean;
  puedeConcepto: boolean;
  puedeExportar: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Pestana>(tabInicial);
  const [buscar, setBuscar] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [asignando, setAsignando] = useState(false);

  const cuentas = useMemo(() => Object.fromEntries(PESTANAS.map((p) => [p, intentos.filter(FILTRO[p]).length])) as Record<Pestana, number>, [intentos]);

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const lista = intentos.filter(FILTRO[tab]).filter((i) => !q || i.cedula.includes(q) || (i.nombre ?? "").toLowerCase().includes(q));
    // Por revisar: primero lo que lleva más tiempo esperando.
    if (tab === "por_revisar") return [...lista].sort((a, b) => (a.terminadoEn ?? "").localeCompare(b.terminadoEn ?? ""));
    return lista;
  }, [intentos, tab, buscar]);

  const cambiarTab = (p: Pestana) => {
    setTab(p);
    window.history.replaceState(null, "", `?tab=${p}`);
  };

  /** Al guardar el concepto pasa sola a la siguiente por revisar. */
  const alResolver = (id: string) => {
    const cola = filas.filter((f) => f.id !== id && FILTRO.por_revisar(f));
    setAbierto(tab === "por_revisar" && cola.length ? cola[0].id : null);
    router.refresh();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
          {PESTANAS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => cambiarTab(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
            >
              {ETIQUETA[p]}
              <span className={`ml-1.5 rounded-full px-1.5 text-xs ${p === "por_revisar" && cuentas[p] ? "bg-amber-100 text-amber-800" : "bg-gray-200 text-gray-600"}`}>{cuentas[p]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${campo} w-56`} placeholder="Buscar cédula o nombre" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          {puedeExportar && (
            <button type="button" className={boton} disabled={!filas.length} onClick={() => descargarCsv(filas)}>
              <Download className="h-4 w-4" /> CSV
            </button>
          )}
          {puedeEditar && (
            <button type="button" className={boton} onClick={() => setAsignando(true)}>
              <Plus className="h-4 w-4" /> Asignar prueba
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-[#E2E8F0] text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Persona</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 font-medium">{tab === "pendientes" ? "Asignada" : "Presentada"}</th>
              <th className="px-4 py-2.5 font-medium">Sistema</th>
              <th className="px-4 py-2.5 text-right font-medium">Puntaje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {filas.map((i) => {
              const espera = tab === "pendientes" ? dias(i.asignadoEn ?? i.iniciadoEn) : null;
              return (
                <tr key={i.id} tabIndex={0} onClick={() => setAbierto(i.id)} onKeyDown={(e) => e.key === "Enter" && setAbierto(i.id)} className="cursor-pointer hover:bg-gray-50 focus:bg-gray-50 focus:outline-none">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-900">{i.nombre ?? "Sin nombre"}</p>
                    <p className="text-xs text-gray-500">
                      C.C. {i.cedula} · {i.origen === "candidato" ? "Candidato" : "Libre"}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorEstado(i)}`}>{estadoLegible(i)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {tab === "pendientes" ? fechaHora(i.asignadoEn ?? i.iniciadoEn) : fechaHora(i.terminadoEn)}
                    {espera != null && espera > 0 && <span className="ml-1 text-xs text-gray-400">· hace {espera} {espera === 1 ? "día" : "días"}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {i.sugerencia === "revisar" ? (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <TriangleAlert className="h-3.5 w-3.5" /> {i.alertas.length} {i.alertas.length === 1 ? "alerta" : "alertas"}
                      </span>
                    ) : i.sugerencia === "sin_alertas" ? (
                      <span className="text-green-700">Sin alertas</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{i.puntajeGlobal ?? "—"}</td>
                </tr>
              );
            })}
            {!filas.length && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  {buscar ? "Nada coincide con la búsqueda." : tab === "por_revisar" ? "No hay pruebas por revisar." : tab === "pendientes" ? "No hay pruebas asignadas sin presentar." : "Todavía no hay pruebas."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {abierto && (
        <PanelRevision key={abierto} id={abierto} puedeEditar={puedeEditar} puedeConcepto={puedeConcepto} onCerrar={() => setAbierto(null)} onResuelto={alResolver} />
      )}
      {asignando && (
        <DialogoAsignar
          onCerrar={() => setAsignando(false)}
          onAsignada={() => {
            setAsignando(false);
            cambiarTab("pendientes");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function PanelRevision({
  id, puedeEditar, puedeConcepto, onCerrar, onResuelto,
}: {
  id: string;
  puedeEditar: boolean;
  puedeConcepto: boolean;
  onCerrar: () => void;
  onResuelto: (id: string) => void;
}) {
  const [detalle, setDetalle] = useState<IntentoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [observacion, setObservacion] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, enTransicion] = useTransition();

  useEffect(() => {
    let vigente = true;
    obtenerDetalle(id).then((r) => {
      if (!vigente) return;
      if (r.success) {
        setDetalle(r.detalle);
        setObservacion(r.detalle.conceptoObservacion ?? "");
      } else setError(r.error);
    });
    return () => {
      vigente = false;
    };
  }, [id]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  const concepto = (c: Concepto) =>
    enTransicion(async () => {
      const r = await darConcepto(id, c, observacion);
      if (!r.success) return void toast.error(r.error);
      toast.success(c === "apto" ? "Concepto: apto" : "Concepto: no apto");
      onResuelto(id);
    });

  const anular = () =>
    enTransicion(async () => {
      const r = await anularIntento(id, motivo);
      if (!r.success) return void toast.error(r.error);
      toast.success("Prueba anulada");
      onResuelto(id);
    });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/30" onClick={onCerrar} />
      <aside role="dialog" aria-modal="true" className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="truncate text-base font-semibold text-gray-900">{detalle?.nombre ?? "Prueba psicosensotécnica"}</h2>
          <div className="flex items-center gap-1">
            {detalle?.candidateId && (
              <Link href={`/candidatos/${detalle.candidateId}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">
                <ExternalLink className="h-3.5 w-3.5" /> Ficha
              </Link>
            )}
            <button type="button" aria-label="Cerrar" onClick={onCerrar} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? <p className="text-sm text-red-600">{error}</p> : detalle ? <DetalleIntento intento={detalle} /> : <p className="text-sm text-gray-500">Cargando…</p>}
        </div>

        {detalle && (
          <footer className="space-y-3 border-t border-border px-5 py-4">
            {detalle.estado === "terminado" && puedeConcepto && !anulando && (
              <>
                <textarea
                  className={campo}
                  rows={2}
                  placeholder="Observación (obligatoria si es «no apto»)"
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                />
                <div className="flex gap-2">
                  <button type="button" disabled={ocupado} onClick={() => concepto("apto")} className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                    Apto
                  </button>
                  <button type="button" disabled={ocupado} onClick={() => concepto("no_apto")} className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                    No apto
                  </button>
                </div>
              </>
            )}
            {detalle.estado === "terminado" && !puedeConcepto && !detalle.concepto && (
              <p className="text-sm text-gray-500">El concepto lo da quien tiene el permiso de psicología.</p>
            )}
            {puedeEditar && detalle.estado !== "anulado" && (
              anulando ? (
                <div className="space-y-2">
                  <input className={campo} placeholder="Motivo de la anulación" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  <div className="flex gap-2">
                    <button type="button" className={boton} disabled={ocupado} onClick={() => setAnulando(false)}>
                      Cancelar
                    </button>
                    <button type="button" disabled={ocupado || motivo.trim().length < 5} onClick={anular} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                      Anular la prueba
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="text-xs text-gray-500 underline hover:text-gray-700" onClick={() => setAnulando(true)}>
                  {detalle.estado === "asignado" ? "Quitar la asignación" : "Anular esta prueba (deja repetirla con una asignación nueva)"}
                </button>
              )
            )}
          </footer>
        )}
      </aside>
    </div>
  );
}

function DialogoAsignar({ onCerrar, onAsignada }: { onCerrar: () => void; onAsignada: () => void }) {
  const [cedula, setCedula] = useState("");
  const [nombre, setNombre] = useState("");
  const [ocupado, enTransicion] = useTransition();

  const asignar = () =>
    enTransicion(async () => {
      const r = await asignarPrueba({ cedula, nombre });
      if (!r.success) return void toast.error(r.error);
      toast.success("Prueba asignada");
      onAsignada();
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/30" onClick={onCerrar} />
      <form
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          asignar();
        }}
      >
        <h2 className="text-base font-semibold text-gray-900">Asignar la prueba</h2>
        <p className="text-sm text-gray-600">
          La persona la presenta entrando con su cédula. Una asignación vale aunque ya haya gastado sus intentos: sirve para dejarla repetir.
        </p>
        <input className={campo} placeholder="Cédula" inputMode="numeric" autoFocus value={cedula} onChange={(e) => setCedula(e.target.value)} />
        <input className={campo} placeholder="Nombre (solo si la cédula no está en Gestivo)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={boton} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" disabled={ocupado || cedula.replace(/\D/g, "").length < 5} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {ocupado ? "Asignando…" : "Asignar"}
          </button>
        </div>
      </form>
    </div>
  );
}
