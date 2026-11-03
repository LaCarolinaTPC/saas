"use client";

/**
 * Editor del borrador de la política (solo administradores): esquemas y
 * montos por beneficiario, condiciones del padrino, del referido y de los
 * reintegros, y qué requisitos aplican, si bloquean y cuándo se verifican.
 * Se valida en el servidor con el mismo esquema zod que al leer
 * (`politica.ts`); muestra en vivo qué cambia frente a la versión vigente.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CAUSAS_RETIRO } from "@/lib/conductores/retiro";
import {
  CATALOGO_REQUISITOS, LETRAS_ESQUEMA, diferencias, requisito,
  type EsquemaParametros, type LetraEsquema, type ParametrosPolitica,
} from "@/lib/padrino/politica";
import { descartarBorrador, guardarBorrador } from "@/lib/padrino/actions";
import { inputCls } from "./buscadores";

const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const entero = (v: string) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

const APLICA_A: Record<LetraEsquema, EsquemaParametros["aplica_a"]> = { A: "nuevo_con_experiencia", B: "nuevo_sin_experiencia", C: "reintegro" };
const APLICA_LABEL: Record<EsquemaParametros["aplica_a"], string> = {
  nuevo_con_experiencia: "Ingreso nuevo con experiencia certificada",
  nuevo_sin_experiencia: "Ingreso nuevo sin experiencia",
  reintegro: "Reintegro",
};
const RESPONSABILIDADES = ["directo", "compartido", "tercero", "en_estudio"];
const NIVELES = ["I", "II", "III", "IV"];
const TIPOS_RETIRO = [
  { v: "voluntario", l: "Decisión del conductor" },
  { v: "empresa", l: "Decisión de la empresa" },
  { v: "otro", l: "Otras causas" },
] as const;

function nuevoEsquema(l: LetraEsquema): EsquemaParametros {
  return {
    nombre: l === "A" ? "Con experiencia" : l === "B" ? "Sin experiencia" : "Reintegro",
    condicion: "",
    aplica_a: APLICA_A[l],
    requiere_certificado: l === "A",
    hitos: [{ numero: 1, meses: 1, descripcion: "Cumplido mes 1", pagos: { padrino: 0, referido: 0 }, requiere_desempeno: false }],
  };
}

const alternar = (xs: string[], v: string, on: boolean) => (on ? [...new Set([...xs, v])] : xs.filter((x) => x !== v));

export function EditorBorrador({
  borrador,
  vigente,
  catalogos,
}: {
  borrador: { id: string; version: string; parametros: ParametrosPolitica };
  vigente: { version: string; parametros: ParametrosPolitica } | null;
  catalogos: { areas: string[]; cargos: string[] };
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [p, setP] = useState<ParametrosPolitica>(() => copia(borrador.parametros));
  const [error, setError] = useState<string | null>(null);
  const [nuevoCargo, setNuevoCargo] = useState("");
  const [pendiente, start] = useTransition();
  const sucio = JSON.stringify(p) !== JSON.stringify(borrador.parametros);
  const cambios = useMemo(() => (vigente ? diferencias(vigente.parametros, p) : []), [vigente, p]);

  function cambiar(fn: (x: ParametrosPolitica) => void) {
    setP((prev) => {
      const x = copia(prev);
      fn(x);
      return x;
    });
  }

  function guardar() {
    setError(null);
    // Los hitos se numeran en orden: el número es la clave de cada pago.
    const limpio = copia(p);
    for (const l of LETRAS_ESQUEMA) limpio.esquemas[l]?.hitos.forEach((h, i) => (h.numero = i + 1));
    start(async () => {
      const r = await guardarBorrador({ id: borrador.id, parametros: limpio });
      if (r.ok) {
        toast.success(`Borrador ${borrador.version} guardado.`);
        router.refresh();
      } else setError(r.error);
    });
  }

  function descartar() {
    if (!window.confirm(`¿Descartar el borrador ${borrador.version}? Se borra y no se puede recuperar.`)) return;
    start(async () => {
      const r = await descartarBorrador(borrador.id);
      if (r.ok) {
        toast.success(`Borrador ${borrador.version} descartado.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  if (!abierto) {
    return (
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={descartar} disabled={pendiente} className="text-red-600 hover:text-red-700">
          <Trash2 className="h-4 w-4" /> Descartar borrador
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setP(copia(borrador.parametros));
            setAbierto(true);
          }}
        >
          <Pencil className="h-4 w-4" /> Editar parámetros
        </Button>
      </div>
    );
  }

  const areas = [...new Set([...catalogos.areas, ...p.padrino.excluidos.areas])].sort((a, b) => a.localeCompare(b, "es"));
  const areaMarcada = (a: string) => p.padrino.excluidos.areas.some((x) => normal(x) === normal(a));

  return (
    <section className="mt-4 rounded-xl border border-[#C7D2FE] bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Editar el borrador {borrador.version}</h3>
        <span className={`text-xs ${sucio ? "text-amber-700" : "text-gray-400"}`}>{sucio ? "Hay cambios sin guardar" : "Sin cambios"}</span>
      </div>

      {/* ── Esquemas ── */}
      <Bloque titulo="Esquemas y pagos">
        <div className="space-y-4">
          {LETRAS_ESQUEMA.map((l) => {
            const e = p.esquemas[l];
            return (
              <div key={l} className="rounded-lg border border-[#E2E8F0] p-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <input
                    type="checkbox"
                    checked={Boolean(e)}
                    onChange={(ev) => cambiar((x) => { x.esquemas[l] = ev.target.checked ? (vigente?.parametros.esquemas[l] ? copia(vigente.parametros.esquemas[l]!) : nuevoEsquema(l)) : undefined; })}
                    className="h-4 w-4 accent-[#4F46E5]"
                  />
                  Esquema {l}
                </label>
                {e && (
                  <div className="mt-2 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Campo etiqueta="Nombre">
                        <input value={e.nombre} onChange={(ev) => cambiar((x) => { x.esquemas[l]!.nombre = ev.target.value; })} className={`${inputCls} w-full`} />
                      </Campo>
                      <Campo etiqueta="Aplica a">
                        <select value={e.aplica_a} onChange={(ev) => cambiar((x) => { x.esquemas[l]!.aplica_a = ev.target.value as EsquemaParametros["aplica_a"]; })} className={`${inputCls} w-full`}>
                          {Object.entries(APLICA_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                        </select>
                      </Campo>
                      <Campo etiqueta="Condición (texto que ve el usuario)" ancho>
                        <input value={e.condicion} onChange={(ev) => cambiar((x) => { x.esquemas[l]!.condicion = ev.target.value; })} className={`${inputCls} w-full`} />
                      </Campo>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input type="checkbox" checked={e.requiere_certificado} onChange={(ev) => cambiar((x) => { x.esquemas[l]!.requiere_certificado = ev.target.checked; })} className="h-4 w-4 accent-[#4F46E5]" />
                      Exige certificado de experiencia validado
                    </label>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                            <th className="py-1 pr-2">#</th>
                            <th className="py-1 pr-2">Mes</th>
                            <th className="py-1 pr-2">Descripción</th>
                            <th className="py-1 pr-2">Padrino $</th>
                            <th className="py-1 pr-2">Referido $</th>
                            <th className="py-1 pr-2">Desempeño</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {e.hitos.map((h, i) => (
                            <tr key={i}>
                              <td className="py-1 pr-2 text-gray-500">{i + 1}</td>
                              <td className="py-1 pr-2">
                                <input type="number" min={1} max={36} value={h.meses} onChange={(ev) => cambiar((x) => { x.esquemas[l]!.hitos[i].meses = Math.max(1, entero(ev.target.value)); })} className={`${inputCls} w-16`} />
                              </td>
                              <td className="py-1 pr-2">
                                <input value={h.descripcion} onChange={(ev) => cambiar((x) => { x.esquemas[l]!.hitos[i].descripcion = ev.target.value; })} className={`${inputCls} w-full min-w-[160px]`} />
                              </td>
                              <td className="py-1 pr-2">
                                <input type="number" min={0} step={10000} value={h.pagos.padrino} onChange={(ev) => cambiar((x) => { x.esquemas[l]!.hitos[i].pagos.padrino = entero(ev.target.value); })} className={`${inputCls} w-28`} />
                              </td>
                              <td className="py-1 pr-2">
                                <input type="number" min={0} step={10000} value={h.pagos.referido} onChange={(ev) => cambiar((x) => { x.esquemas[l]!.hitos[i].pagos.referido = entero(ev.target.value); })} className={`${inputCls} w-28`} />
                              </td>
                              <td className="py-1 pr-2 text-center">
                                <input type="checkbox" checked={h.requiere_desempeno} onChange={(ev) => cambiar((x) => { x.esquemas[l]!.hitos[i].requiere_desempeno = ev.target.checked; })} className="h-4 w-4 accent-[#4F46E5]" title="Exige marcar desempeño satisfactorio al aprobar" />
                              </td>
                              <td className="py-1">
                                <button
                                  onClick={() => cambiar((x) => { x.esquemas[l]!.hitos.splice(i, 1); })}
                                  disabled={e.hitos.length === 1}
                                  className="text-gray-400 hover:text-red-600 disabled:opacity-30"
                                  aria-label="Quitar hito"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={() => cambiar((x) => { const hs = x.esquemas[l]!.hitos; hs.push({ numero: hs.length + 1, meses: (hs.at(-1)?.meses ?? 0) + 1, descripcion: `Cumplido mes ${(hs.at(-1)?.meses ?? 0) + 1}`, pagos: { padrino: 0, referido: 0 }, requiere_desempeno: false }); })}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#4F46E5] hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" /> Agregar hito
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Bloque>

      {/* ── Padrino ── */}
      <Bloque titulo="Padrino">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Quién puede ser padrino">
            <select value={p.padrino.modo_empleados} onChange={(ev) => cambiar((x) => { x.padrino.modo_empleados = ev.target.value as ParametrosPolitica["padrino"]["modo_empleados"]; })} className={`${inputCls} w-full`}>
              <option value="excluidos">Cualquier empleado, salvo excluidos</option>
              <option value="lista_blanca">Conductores y empleados autorizados</option>
            </select>
          </Campo>
          <Campo etiqueta="Antigüedad mínima (meses)">
            <input type="number" min={0} value={p.padrino.antiguedad_minima_meses} onChange={(ev) => cambiar((x) => { x.padrino.antiguedad_minima_meses = entero(ev.target.value); })} className={`${inputCls} w-full`} />
          </Campo>
          <Campo etiqueta="Ventana de faltas graves (meses)">
            <input type="number" min={0} value={p.padrino.ventana_faltas_graves_meses} onChange={(ev) => cambiar((x) => { x.padrino.ventana_faltas_graves_meses = entero(ev.target.value); })} className={`${inputCls} w-full`} />
          </Campo>
          <Campo etiqueta="Ventana de sanciones, P3 (meses)">
            <input type="number" min={0} value={p.padrino.ventana_sanciones_meses} onChange={(ev) => cambiar((x) => { x.padrino.ventana_sanciones_meses = entero(ev.target.value); })} className={`${inputCls} w-full`} />
          </Campo>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Campo etiqueta="Accidente grave: responsabilidad">
            <Marcas opciones={RESPONSABILIDADES.map((v) => ({ v, l: v === "en_estudio" ? "en estudio" : v }))} valores={p.padrino.accidente_grave.responsabilidad} onCambio={(v, on) => cambiar((x) => { x.padrino.accidente_grave.responsabilidad = alternar(x.padrino.accidente_grave.responsabilidad, v, on); })} />
          </Campo>
          <Campo etiqueta="Accidente grave: nivel de correctivo">
            <Marcas opciones={NIVELES.map((v) => ({ v, l: `Nivel ${v}` }))} valores={p.padrino.accidente_grave.niveles} onCambio={(v, on) => cambiar((x) => { x.padrino.accidente_grave.niveles = alternar(x.padrino.accidente_grave.niveles, v, on); })} />
          </Campo>
        </div>
        <div className="mt-3 space-y-1.5 text-xs text-gray-700">
          <Check valor={p.padrino.revisar_faltas_sin_fuente} onCambio={(b) => cambiar((x) => { x.padrino.revisar_faltas_sin_fuente = b; })}>
            Dejar P6 en «revisar» cuando no hay accidente grave (Gestivo no registra alcohol ni fraude en el recaudo)
          </Check>
          <Check valor={p.padrino.debe_seguir_activo_para_cobrar} onCambio={(b) => cambiar((x) => { x.padrino.debe_seguir_activo_para_cobrar = b; })}>
            El padrino debe seguir con contrato vigente en cada fecha de pago
          </Check>
          <Check valor={p.padrino.referido_conserva_si_padrino_se_retira} onCambio={(b) => cambiar((x) => { x.padrino.referido_conserva_si_padrino_se_retira = b; })}>
            Si el padrino se retira, el referido conserva sus pagos
          </Check>
        </div>
        {p.padrino.modo_empleados === "excluidos" && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Campo etiqueta="Áreas excluidas (participan en la selección o aprueban el ingreso)">
              <Marcas opciones={areas.map((a) => ({ v: a, l: a }))} valores={areas.filter(areaMarcada)} onCambio={(v, on) => cambiar((x) => { x.padrino.excluidos.areas = on ? [...x.padrino.excluidos.areas.filter((y) => normal(y) !== normal(v)), v] : x.padrino.excluidos.areas.filter((y) => normal(y) !== normal(v)); })} />
            </Campo>
            <Campo etiqueta="Cargos excluidos (jefes que aprueban la contratación)">
              <div className="flex flex-wrap gap-1.5">
                {p.padrino.excluidos.cargos.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2 py-0.5 text-xs text-[#3730A3]">
                    {c}
                    <button onClick={() => cambiar((x) => { x.padrino.excluidos.cargos = x.padrino.excluidos.cargos.filter((y) => y !== c); })} aria-label={`Quitar ${c}`} className="text-[#6366F1] hover:text-red-600">×</button>
                  </span>
                ))}
                {!p.padrino.excluidos.cargos.length && <span className="text-xs text-amber-700">Ninguno todavía.</span>}
              </div>
              <div className="mt-1.5 flex gap-2">
                <input list="cargos-padrino" value={nuevoCargo} onChange={(ev) => setNuevoCargo(ev.target.value)} placeholder="Escriba o elija un cargo" className={`${inputCls} w-full`} />
                <datalist id="cargos-padrino">{catalogos.cargos.map((c) => <option key={c} value={c} />)}</datalist>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!nuevoCargo.trim()}
                  onClick={() => {
                    const c = nuevoCargo.trim().toUpperCase();
                    cambiar((x) => { if (!x.padrino.excluidos.cargos.some((y) => normal(y) === normal(c))) x.padrino.excluidos.cargos.push(c); });
                    setNuevoCargo("");
                  }}
                >
                  Agregar
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">El instructor de conducción u otra excepción avalada por la gerencia va en la lista de empleados autorizados.</p>
            </Campo>
          </div>
        )}
      </Bloque>

      {/* ── Referido y reintegro ── */}
      <Bloque titulo="Referido y reintegros">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo etiqueta="Categorías de licencia (separadas por coma)">
            <input
              value={p.referido.categorias_licencia.join(", ")}
              onChange={(ev) => cambiar((x) => { x.referido.categorias_licencia = ev.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean); })}
              className={`${inputCls} w-full`}
            />
          </Campo>
          <Campo etiqueta="Ventana de hoja de vida previa (meses)">
            <input type="number" min={0} value={p.referido.ventana_hoja_vida_meses} onChange={(ev) => cambiar((x) => { x.referido.ventana_hoja_vida_meses = entero(ev.target.value); })} className={`${inputCls} w-full`} />
          </Campo>
          <Campo etiqueta="Días de gracia para registrar después de iniciar la selección (R13)">
            <input type="number" min={0} max={365} value={p.referido.tolerancia_registro_dias} onChange={(ev) => cambiar((x) => { x.referido.tolerancia_registro_dias = Math.min(365, entero(ev.target.value)); })} className={`${inputCls} w-full`} />
          </Campo>
          <Campo etiqueta="Meses mínimos por fuera (reintegro)">
            <input type="number" min={0} value={p.referido.reintegro.meses_minimos_fuera} disabled={!p.referido.reintegro.activo} onChange={(ev) => cambiar((x) => { x.referido.reintegro.meses_minimos_fuera = entero(ev.target.value); })} className={`${inputCls} w-full disabled:opacity-50`} />
          </Campo>
        </div>
        <div className="mt-3 text-xs text-gray-700">
          <Check valor={p.referido.reintegro.activo} onCambio={(b) => cambiar((x) => { x.referido.reintegro.activo = b; })}>
            Los reintegros tienen reglas propias (esquema de reintegro, meses mínimos y causa del retiro anterior)
          </Check>
        </div>
        {p.referido.reintegro.activo && (
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Campo etiqueta="Retiro anterior permitido">
              <Marcas opciones={TIPOS_RETIRO.map((t) => ({ v: t.v, l: t.l }))} valores={p.referido.reintegro.tipos_causa_permitidos} onCambio={(v, on) => cambiar((x) => { x.referido.reintegro.tipos_causa_permitidos = alternar(x.referido.reintegro.tipos_causa_permitidos, v, on) as typeof x.referido.reintegro.tipos_causa_permitidos; })} />
            </Campo>
            <Campo etiqueta="Causas que siempre excluyen">
              <Marcas opciones={CAUSAS_RETIRO.map((c) => ({ v: c.clave, l: c.label }))} valores={p.referido.reintegro.causas_que_excluyen} onCambio={(v, on) => cambiar((x) => { x.referido.reintegro.causas_que_excluyen = alternar(x.referido.reintegro.causas_que_excluyen, v, on); })} />
            </Campo>
            <Campo etiqueta="Un reintegro nunca va por el esquema">
              <Marcas opciones={LETRAS_ESQUEMA.map((v) => ({ v, l: `Esquema ${v}` }))} valores={p.referido.reintegro.nunca_esquema} onCambio={(v, on) => cambiar((x) => { x.referido.reintegro.nunca_esquema = alternar(x.referido.reintegro.nunca_esquema, v, on) as LetraEsquema[]; })} />
            </Campo>
          </div>
        )}
      </Bloque>

      {/* ── Requisitos ── */}
      <Bloque titulo="Requisitos">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-1 pr-2">Requisito</th>
                <th className="py-1 pr-2 text-center">Activo</th>
                <th className="py-1 pr-2 text-center">Bloquea</th>
                <th className="py-1">Se verifica</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F8FAFC]">
              {CATALOGO_REQUISITOS.map(({ codigo, titulo, sujeto }) => {
                const r = requisito(p, codigo);
                const fijar = (cambio: Partial<typeof r>) => cambiar((x) => { x.requisitos[codigo] = { ...requisito(x, codigo), ...cambio }; });
                return (
                  <tr key={codigo} className={r.activo ? "" : "text-gray-400"}>
                    <td className="py-1.5 pr-2">
                      <span className="font-medium">{codigo}</span> · {titulo}
                      <span className="ml-1 text-[10px] text-gray-400">({sujeto})</span>
                    </td>
                    <td className="py-1.5 pr-2 text-center"><input type="checkbox" checked={r.activo} onChange={(ev) => fijar({ activo: ev.target.checked })} className="h-4 w-4 accent-[#4F46E5]" /></td>
                    <td className="py-1.5 pr-2 text-center"><input type="checkbox" checked={r.bloquea} disabled={!r.activo} onChange={(ev) => fijar({ bloquea: ev.target.checked })} className="h-4 w-4 accent-[#4F46E5]" /></td>
                    <td className="py-1.5">
                      <select value={r.momento} disabled={!r.activo} onChange={(ev) => fijar({ momento: ev.target.value as typeof r.momento })} className={`${inputCls} h-7 text-xs`}>
                        <option value="registro">Al registrar</option>
                        <option value="contratacion">Al contratar</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">
          Un requisito que bloquea y no se cumple solo se aprueba como excepción documentada; uno que no bloquea pide observación. Los que se verifican al contratar no cuentan al decidir la elegibilidad: si uno que bloquea falla al contratar, no se crean los hitos.
        </p>
      </Bloque>

      {vigente && (
        <Bloque titulo={`Cambios frente a la ${vigente.version}`}>
          {cambios.length ? (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-600">
              {cambios.map((c) => <li key={c}>{c}</li>)}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">Igual a la {vigente.version}.</p>
          )}
        </Bloque>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => { setP(copia(borrador.parametros)); setError(null); }} disabled={pendiente || !sucio}>Deshacer cambios</Button>
        <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>Cerrar</Button>
        <Button onClick={guardar} disabled={pendiente || !sucio} className="bg-[#4F46E5] text-white hover:bg-[#4338CA]">
          {pendiente ? "Guardando…" : "Guardar borrador"}
        </Button>
      </div>
    </section>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-[#F1F5F9] pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      {children}
    </div>
  );
}

function Campo({ etiqueta, children, ancho }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={ancho ? "sm:col-span-2" : undefined}>
      <p className="mb-1 text-xs font-medium text-gray-600">{etiqueta}</p>
      {children}
    </div>
  );
}

function Check({ valor, onCambio, children }: { valor: boolean; onCambio: (b: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={valor} onChange={(e) => onCambio(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#4F46E5]" />
      <span>{children}</span>
    </label>
  );
}

function Marcas({ opciones, valores, onCambio }: { opciones: { v: string; l: string }[]; valores: string[]; onCambio: (v: string, on: boolean) => void }) {
  return (
    <div className="flex max-h-40 flex-wrap gap-x-3 gap-y-1 overflow-y-auto text-xs text-gray-700">
      {opciones.map((o) => (
        <label key={o.v} className="flex items-center gap-1.5">
          <input type="checkbox" checked={valores.includes(o.v)} onChange={(e) => onCambio(o.v, e.target.checked)} className="h-3.5 w-3.5 accent-[#4F46E5]" />
          {o.l}
        </label>
      ))}
    </div>
  );
}
