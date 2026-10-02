"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronDown, Loader2, X } from "lucide-react";
import { BuscadorOpciones, type OpcionBuscable } from "@/components/ui/buscador-opciones";
import { fechaLegible, textoDias } from "@/lib/operativo/constants";
import type { ConductorPreop, RevisionPreop, VehiculoPreop } from "@/lib/operativo/preoperacional-data";
import { GRUPOS_PREOP, PUNTOS_PREOP, type GrupoPreop, type PuntoPreop } from "@/lib/operativo/preoperacional-lista";
import {
  MAX_NOTA_FALLA, MAX_OBSERVACIONES, RESULTADO_COLOR, RESULTADO_LABEL, calcularResultado, documentosSinDato,
  documentosVencidos, textoGuardar, type DocumentoPreop,
} from "@/lib/operativo/preoperacional-reglas";
import { ChipNivel } from "../ui";
import { registrarPreoperacional } from "./actions";
import { ChipResultado, horaBogota } from "./comunes";

type Marca = { nota: string; concepto: string | null };

/** Etiqueta corta del concepto para los botones: «LUCES TRASERAS» → «Traseras». */
function conceptoCorto(concepto: string): string {
  const sinPrefijo = concepto.replace(/^LUCES\s+/i, "");
  return sinPrefijo.charAt(0) + sinPrefijo.slice(1).toLowerCase();
}

/**
 * Formulario de un bus: todo arranca en «cumple» y el inspector solo toca lo
 * que falla. Si el bus ya se revisó hoy, arranca con las fallas de esa
 * revisión para que se desmarque lo que ya se reparó.
 */
export function FormularioBus({ vehiculo, conductores, documentos, ultima, puedeEditar, onCerrar, onGuardado }: {
  vehiculo: VehiculoPreop;
  conductores: ConductorPreop[];
  documentos: DocumentoPreop[];
  ultima: RevisionPreop | null;
  puedeEditar: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [pending, startTransition] = useTransition();
  // Momento en que se abrió el formulario, para medir el tiempo por bus.
  const [inicio] = useState(() => Date.now());
  const [fallas, setFallas] = useState<Map<string, Marca>>(
    () => new Map((ultima?.detalle ?? []).map((f) => [f.item_key, { nota: f.nota ?? "", concepto: f.concepto }])),
  );
  const [abiertos, setAbiertos] = useState<Set<GrupoPreop>>(
    () => new Set((ultima?.detalle ?? []).flatMap((f) => {
      const g = PUNTOS_PREOP.find((p) => p.key === f.item_key)?.grupo;
      return g ? [g] : [];
    })),
  );
  const [cedula, setCedula] = useState(ultima?.cedula_conductor ?? vehiculo.cedula_conductor ?? "");
  const [observaciones, setObservaciones] = useState("");
  const [confirmarNoApto, setConfirmarNoApto] = useState(false);

  // Escape cierra; el fondo no se desplaza mientras el formulario está abierto.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previo; window.removeEventListener("keydown", onKey); };
  }, [onCerrar]);

  // El conductor que GEMA tiene asignado puede estar inactivo en el maestro:
  // se agrega a las opciones para que siga apareciendo seleccionado.
  const opcionesConductor = useMemo<OpcionBuscable[]>(() => {
    const ops = conductores.map((c) => ({
      valor: c.cedula,
      etiqueta: c.nombre,
      secundario: `CC ${c.cedula}`,
      claves: [c.cedula, c.nombre, c.codigo ?? ""].filter(Boolean),
    }));
    if (vehiculo.cedula_conductor && !conductores.some((c) => c.cedula === vehiculo.cedula_conductor)) {
      ops.unshift({
        valor: vehiculo.cedula_conductor,
        etiqueta: vehiculo.conductor_nombre ?? vehiculo.cedula_conductor,
        secundario: `CC ${vehiculo.cedula_conductor}`,
        claves: [vehiculo.cedula_conductor, vehiculo.conductor_nombre ?? ""].filter(Boolean),
      });
    }
    return ops;
  }, [conductores, vehiculo]);

  const marcadas = useMemo(
    () => PUNTOS_PREOP.filter((p) => fallas.has(p.key)).map((p) => ({ key: p.key, critico: p.critico })),
    [fallas],
  );
  const calc = calcularResultado(marcadas, documentos);
  const vencidos = documentosVencidos(documentos);
  const sinDato = documentosSinDato(documentos);
  const color = RESULTADO_COLOR[calc.resultado];

  function alternar(p: PuntoPreop) {
    if (!puedeEditar) return;
    setConfirmarNoApto(false);
    setFallas((prev) => {
      const m = new Map(prev);
      if (m.has(p.key)) m.delete(p.key);
      else m.set(p.key, { nota: "", concepto: p.conceptos[0] ?? null });
      return m;
    });
  }

  function editar(key: string, cambio: Partial<Marca>) {
    setFallas((prev) => {
      const m = new Map(prev);
      const actual = m.get(key);
      if (actual) m.set(key, { ...actual, ...cambio });
      return m;
    });
  }

  function alternarGrupo(g: GrupoPreop) {
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(g)) s.delete(g); else s.add(g);
      return s;
    });
  }

  function guardar() {
    if (!cedula) {
      toast.error("Indica el conductor que va a salir con el vehículo.");
      return;
    }
    // NO APTO pide un segundo toque: deja el bus fuera del despacho.
    if (calc.resultado === "no_apto" && !confirmarNoApto) {
      setConfirmarNoApto(true);
      return;
    }
    startTransition(async () => {
      const res = await registrarPreoperacional({
        codigoVehiculo: vehiculo.codigo,
        cedulaConductor: cedula,
        fallas: [...fallas].map(([key, m]) => ({ key, nota: m.nota, concepto: m.concepto })),
        observaciones,
        duracionSeg: Math.round((Date.now() - inicio) / 1000),
      });
      if (!res.success || !res.resultado) {
        setConfirmarNoApto(false);
        toast.error(res.error ?? "No se pudo guardar la revisión.");
        return;
      }
      toast.success(`Bus ${vehiculo.codigo}: ${RESULTADO_LABEL[res.resultado]}`);
      for (const aviso of res.avisos ?? []) toast.warning(aviso, { duration: 8000 });
      onGuardado();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Revisión preoperacional del bus ${vehiculo.codigo}`}
        className="flex h-full w-full flex-col bg-[#F8FAFC] shadow-xl md:max-w-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start gap-3 border-b border-[#E2E8F0] bg-white px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold leading-tight text-gray-900">Bus {vehiculo.codigo}</p>
            <p className="truncate text-sm text-gray-600">{[vehiculo.placa, vehiculo.marca, vehiculo.clase, vehiculo.modelo].filter(Boolean).join(" · ")}</p>
            {ultima && (
              <p className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                Revisado hoy a las {horaBogota(ultima.created_at)} <ChipResultado estado={ultima.resultado} pequeno />
              </p>
            )}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-2 text-gray-500 hover:bg-[#F1F5F9]">
            <X className="h-6 w-6" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="text-sm text-gray-700">
            <label htmlFor="preop-conductor" className="font-medium">Conductor</label>
            <BuscadorOpciones
              id="preop-conductor"
              opciones={opcionesConductor}
              value={cedula}
              onChange={setCedula}
              placeholder="Nombre o cédula del conductor…"
              vacio={(q) => `Ningún conductor activo coincide con «${q}».`}
              disabled={!puedeEditar}
            />
          </div>

          {vencidos.length > 0 && (
            <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p><strong>No puede salir:</strong> {vencidos.map((d) => `${d.nombre} vencido ${d.fecha ? `el ${fechaLegible(d.fecha)}` : ""}`).join(" · ")}.</p>
            </div>
          )}

          {GRUPOS_PREOP.map((g) => {
            const puntos = PUNTOS_PREOP.filter((p) => p.grupo === g.key);
            const nFallas = puntos.filter((p) => fallas.has(p.key)).length;
            const abierto = abiertos.has(g.key);
            const esDocs = g.key === "documentos";
            return (
              <section key={g.key} className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white">
                <button
                  type="button"
                  onClick={() => alternarGrupo(g.key)}
                  aria-expanded={abierto}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span className="flex-1">
                    <span className="block font-semibold text-gray-900">{g.nombre}</span>
                    <span className="text-xs text-gray-500">{puntos.length} puntos</span>
                  </span>
                  {nFallas > 0 ? (
                    <span className="rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-semibold text-[#991B1B]">{nFallas} falla{nFallas === 1 ? "" : "s"}</span>
                  ) : esDocs && vencidos.length > 0 ? (
                    <span className="rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-semibold text-[#991B1B]">{vencidos.length} vencido{vencidos.length === 1 ? "" : "s"}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-[#059669]"><Check className="h-4 w-4" />Todo cumple</span>
                  )}
                  <ChevronDown className={`h-5 w-5 text-gray-400 transition ${abierto ? "rotate-180" : ""}`} />
                </button>

                {abierto && (
                  <div className="space-y-2 border-t border-[#F1F5F9] p-3">
                    {esDocs && documentos.length > 0 && (
                      <div className="rounded-lg bg-[#F8FAFC] p-3">
                        <p className="mb-2 text-xs font-medium text-gray-500">Vigencias (GEMA y documentos cargados en Operativo)</p>
                        <ul className="space-y-1.5">
                          {documentos.map((d) => (
                            <li key={d.tipo} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-gray-700">{d.nombre}</span>
                              <span className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">{d.fecha ? `${fechaLegible(d.fecha)} · ${textoDias(d.dias)}` : ""}</span>
                                <ChipNivel nivel={d.nivel} pequeno />
                              </span>
                            </li>
                          ))}
                        </ul>
                        {sinDato.length > 0 && (
                          <p className="mt-2 text-xs text-gray-500">«Sin dato» no detiene el bus; conviene cargar la fecha en Operativo › Vehículos.</p>
                        )}
                        <p className="mt-2 text-xs text-gray-500">Abajo marque solo si el documento físico <strong>no</strong> va en el bus.</p>
                      </div>
                    )}
                    {puntos.map((p) => {
                      const marca = fallas.get(p.key);
                      const falla = Boolean(marca);
                      return (
                        <div key={p.key} className={`rounded-lg border ${falla ? "border-[#FCA5A5] bg-[#FEF2F2]" : "border-[#E2E8F0]"}`}>
                          <button
                            type="button"
                            onClick={() => alternar(p)}
                            aria-pressed={falla}
                            disabled={!puedeEditar}
                            className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left disabled:cursor-default"
                          >
                            <span className="flex-1 text-[15px] text-gray-900">
                              {p.nombre}
                              {p.critico && <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide text-[#B91C1C]">Crítico</span>}
                            </span>
                            <span
                              className={`inline-flex w-24 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-sm font-semibold ${falla ? "bg-[#DC2626] text-white" : "bg-[#D1FAE5] text-[#065F46]"}`}
                            >
                              {falla ? <><X className="h-4 w-4" />Falla</> : <><Check className="h-4 w-4" />Cumple</>}
                            </span>
                          </button>
                          {marca && (
                            <div className="space-y-2 px-3 pb-3">
                              {p.conceptos.length > 1 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {p.conceptos.map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => editar(p.key, { concepto: c })}
                                      aria-pressed={marca.concepto === c}
                                      className={`rounded-full border px-3 py-1 text-sm ${marca.concepto === c ? "border-[#DC2626] bg-white font-semibold text-[#991B1B]" : "border-[#E2E8F0] bg-white text-gray-600"}`}
                                    >
                                      {conceptoCorto(c)}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input
                                value={marca.nota}
                                onChange={(e) => editar(p.key, { nota: e.target.value })}
                                maxLength={MAX_NOTA_FALLA}
                                placeholder="Nota (opcional): qué se encontró"
                                className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm text-gray-900 outline-none focus:border-[#94A3B8]"
                              />
                              {p.conceptos.length > 0 && (
                                <p className="text-xs text-gray-500">Se abrirá un reporte de daño en Mantenimiento ({marca.concepto}).</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}

          <label className="block text-sm text-gray-700">
            <span className="font-medium">Observaciones</span> <span className="text-gray-400">(opcional)</span>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              maxLength={MAX_OBSERVACIONES}
              rows={2}
              disabled={!puedeEditar}
              className="mt-1 w-full rounded-lg border border-[#E2E8F0] bg-white p-2 text-sm text-gray-900 outline-none focus:border-[#94A3B8]"
            />
          </label>
        </div>

        <footer className="border-t border-[#E2E8F0] bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {!puedeEditar ? (
            <p className="text-center text-sm text-gray-600">Tu perfil es de solo consulta: no puede registrar revisiones.</p>
          ) : (
            <>
              {confirmarNoApto && (
                <p className="mb-2 text-center text-sm font-medium text-[#991B1B]">
                  El bus quedará fuera del despacho de hoy. Toque otra vez para confirmar.
                </p>
              )}
              <button
                type="button"
                onClick={guardar}
                disabled={pending}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl text-lg font-bold text-white transition disabled:opacity-60"
                style={{ backgroundColor: color.fuerte }}
              >
                {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {pending ? "Guardando…" : confirmarNoApto ? "Confirmar · NO APTO" : textoGuardar(calc.resultado)}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
