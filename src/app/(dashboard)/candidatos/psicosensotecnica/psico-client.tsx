"use client";

/**
 * Prueba psicosensotécnica en PsicoAlianza (24-nov-2026):
 * 1. Por inscribir → plantilla de carga masiva llena y «marcar inscritos».
 * 2. Esperando el resultado.
 * 3. Subir resultados (Excel/CSV o informes PDF) con vista previa.
 * 4. Resultados de los últimos 60 días.
 */
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileUp, Send, TriangleAlert } from "lucide-react";
import type { AspirantePsico, FilaVista, ListasPsico } from "@/lib/seleccion/psico-servidor";
import { RESULTADOS_PSICO_EXTERNA, type ResultadoPsicoExterna } from "@/lib/seleccion/dia-contratacion";
import { estadoInfo } from "@/lib/contratacion/constants";
import { ETIQUETA_ESTADO_PRUEBA, textoCortes, type EstadoPrueba } from "@/lib/seleccion/psico-resultados";
import { descargarPlantilla, guardarResultadosAccion, leerResultadosAccion, marcarInscritosAccion, reprogramarAccion } from "./actions";

const BOTON = "inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-50";
const PRIMARIO = "inline-flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50";
const CAMPO = "h-8 rounded-md border border-[#E2E8F0] bg-white px-2 text-xs text-[#0F172A] outline-none focus:border-[#4F46E5]";

const fecha = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00-05:00` : iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" }) : "—";
const diasDesde = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null);
const TONO: Record<ResultadoPsicoExterna, string> = {
  apto: "bg-emerald-50 text-emerald-700",
  apto_con_observaciones: "bg-amber-50 text-amber-800",
  no_apto: "bg-red-50 text-red-700",
};

function Seccion({ titulo, ayuda, children, acciones }: { titulo: string; ayuda?: string; children: React.ReactNode; acciones?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{titulo}</h2>
          {ayuda && <p className="mt-0.5 text-xs text-text-tertiary">{ayuda}</p>}
        </div>
        {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Prueba() {
  return <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">prueba</span>;
}

function Etapa({ estado }: { estado: string }) {
  const e = estadoInfo(estado);
  return e ? (
    <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: e.bg, color: e.color }}>
      {e.label}
    </span>
  ) : (
    <span>{estado}</span>
  );
}

export function PsicoClient({ datos }: { datos: ListasPsico & { puedeEditar: boolean } }) {
  const router = useRouter();
  const editar = datos.puedeEditar;
  const [ocupado, enTransicion] = useTransition();
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  // Por defecto, todos menos los del chat de prueba.
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(datos.porInscribir.filter((a) => !a.prueba).map((a) => a.procesoId)));
  const inputArchivos = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [vista, setVista] = useState<(FilaVista & { incluir: boolean })[] | null>(null);
  const [erroresLectura, setErroresLectura] = useState<string[]>([]);

  const avisar = (texto: string, error = false) => setMensaje({ texto, error });
  const correr = (f: () => Promise<void>) => {
    setMensaje(null);
    enTransicion(async () => {
      try {
        await f();
      } catch (e) {
        avisar(e instanceof Error ? e.message : "No se pudo completar.", true);
      }
    });
  };

  const alternar = (id: string) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todos = datos.porInscribir.length > 0 && datos.porInscribir.every((a) => elegidos.has(a.procesoId));

  const descargar = () =>
    correr(async () => {
      const r = await descargarPlantilla([...elegidos]);
      if (!r.ok || !r.base64) return avisar(r.error ?? "No se pudo armar la plantilla.", true);
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nombre ?? "PsicoAlianza_Carga_Masiva_Candidatos.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      avisar(`Plantilla descargada con ${r.filas} aspirantes. Súbala en PsicoAlianza y después pulse «Ya los subí: marcar inscritos».`);
    });

  const marcar = () =>
    correr(async () => {
      if (!confirm(`¿Marcar ${elegidos.size} como inscritos en la plataforma? A cada uno se le avisa por WhatsApp que le llega la información por correo.`)) return;
      const r = await marcarInscritosAccion([...elegidos]);
      if (!r.ok) return avisar(r.error ?? "No se pudo marcar.", true);
      avisar(`${r.marcados} marcados como inscritos.${r.errores?.length ? ` ${r.errores.length} no: ${r.errores.map((e) => e.error).join("; ")}` : ""}`, !!r.errores?.length);
      setElegidos(new Set());
      router.refresh();
    });

  const leer = () =>
    correr(async () => {
      const fd = new FormData();
      for (const f of archivos) fd.append("archivos", f);
      const r = await leerResultadosAccion(fd);
      if (!r.ok) return avisar(r.error ?? "No se pudieron leer los archivos.", true);
      setErroresLectura(r.errores ?? []);
      setVista((r.filas ?? []).map((f) => ({ ...f, incluir: !!f.procesoId && (!!f.estadoPrueba || (!!f.resultado && !f.deducido)) })));
      if (!r.filas?.length) avisar("No se encontró ningún resultado en los archivos.", true);
    });

  const cambiar = (clave: string, cambio: Partial<FilaVista & { incluir: boolean }>) =>
    setVista(
      (v) =>
        v?.map((f) => {
          if (f.clave !== clave) return f;
          const n = { ...f, ...cambio };
          return { ...n, incluir: cambio.incluir ?? (f.incluir || (!!n.procesoId && (!!n.resultado || !!n.estadoPrueba))) };
        }) ?? null
    );

  const aGuardar = useMemo(() => (vista ?? []).filter((f) => f.incluir && f.procesoId && f.resultado && !f.estadoPrueba), [vista]);
  const aReprogramar = useMemo(() => (vista ?? []).filter((f) => f.incluir && f.procesoId && f.estadoPrueba), [vista]);

  /** No la presentó o no la terminó: vuelve a «Por inscribir». */
  const reprogramar = (ids: string[], razon: EstadoPrueba) =>
    correr(async () => {
      if (!confirm(`¿${ETIQUETA_ESTADO_PRUEBA[razon]}? Vuelve a «Por inscribir» para subirlo otra vez en la plantilla de la plataforma.`)) return;
      const r = await reprogramarAccion(ids, razon);
      if (!r.ok) return avisar(r.error ?? "No se pudo.", true);
      avisar(`${r.hechos} vuelven a «Por inscribir».${r.errores?.length ? ` ${r.errores.join("; ")}` : ""}`, !!r.errores?.length);
      router.refresh();
    });

  const guardar = () =>
    correr(async () => {
      const fd = new FormData();
      for (const f of archivos) fd.append("archivos", f);
      fd.append(
        "filas",
        JSON.stringify(aGuardar.map((f) => ({ clave: f.clave, procesoId: f.procesoId, resultado: f.resultado, fecha: f.fecha, puntaje: f.puntaje, archivos: f.archivos, detalle: f.detalle })))
      );
      fd.append("reprogramar", JSON.stringify(aReprogramar.map((f) => ({ procesoId: f.procesoId, razon: f.estadoPrueba }))));
      const r = await guardarResultadosAccion(fd);
      if (!r.ok) return avisar(r.error ?? "No se pudieron guardar.", true);
      avisar(`${r.guardados} resultados guardados en el proceso de cada aspirante.${r.reprogramados ? ` ${r.reprogramados} vuelven a «Por inscribir» (no la presentaron o no la terminaron).` : ""}${r.errores?.length ? ` Con problemas: ${r.errores.map((e) => e.error).join("; ")}` : ""}`, !!r.errores?.length);
      setVista(null);
      setArchivos([]);
      if (inputArchivos.current) inputArchivos.current.value = "";
      router.refresh();
    });

  // Para asignar a mano un resultado sin cédula: los que esperan.
  const opcionesAspirante = [...datos.esperando, ...datos.porInscribir];

  return (
    <div className="space-y-6">
      {datos.error && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">{datos.error}</p>}
      {mensaje && (
        <p className={`rounded-xl border px-4 py-2.5 text-sm ${mensaje.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{mensaje.texto}</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { t: "Por inscribir", n: datos.porInscribir.length, nota: "Correo confirmado" },
          { t: "Esperando resultado", n: datos.esperando.length, nota: "Inscritos en la plataforma" },
          { t: "Con resultado (60 días)", n: datos.conResultado.length, nota: `${datos.conResultado.filter((a) => a.resultado === "no_apto").length} no aptos` },
        ].map((c) => (
          <div key={c.t} className="rounded-xl border border-[#F1F5F9] bg-white p-4">
            <p className="text-[12px] font-medium text-[#64748B]">{c.t}</p>
            <p className="mt-1.5 text-[24px] font-bold leading-none text-[#0F172A]">{c.n}</p>
            <p className="mt-1.5 text-[11px] text-[#64748B]">{c.nota}</p>
          </div>
        ))}
      </div>

      <Seccion
        titulo={`1. Por inscribir (${datos.porInscribir.length})`}
        ayuda="Aspirantes en curso con el correo confirmado. Descargue la plantilla de carga masiva (Documento y Email), súbala en PsicoAlianza y marque los inscritos: a cada uno le llega un WhatsApp avisando que recibirá la información por correo."
        acciones={
          editar && (
            <>
              <button type="button" className={BOTON} disabled={ocupado || !elegidos.size} onClick={descargar}>
                <Download className="h-4 w-4" /> Descargar plantilla ({elegidos.size})
              </button>
              <button type="button" className={PRIMARIO} disabled={ocupado || !elegidos.size} onClick={marcar}>
                <Send className="h-4 w-4" /> Ya los subí: marcar inscritos
              </button>
            </>
          )
        }
      >
        {datos.porInscribir.length === 0 ? (
          <p className="text-sm text-text-tertiary">— Nadie por inscribir: cuando un aspirante confirme su correo aparece aquí.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-tertiary">
                  <th className="w-8 py-2 pr-2">
                    {editar && (
                      <input
                        type="checkbox"
                        checked={todos}
                        onChange={() => setElegidos(todos ? new Set() : new Set(datos.porInscribir.map((a) => a.procesoId)))}
                        aria-label="Elegir todos"
                        className="accent-[#4F46E5]"
                      />
                    )}
                  </th>
                  <th className="py-2 pr-3 font-medium">Aspirante</th>
                  <th className="py-2 pr-3 font-medium">Documento</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Confirmó el correo</th>
                  <th className="py-2 font-medium">Etapa</th>
                </tr>
              </thead>
              <tbody>
                {datos.porInscribir.map((a) => (
                  <tr key={a.procesoId} className="border-b border-[#F1F5F9] last:border-0">
                    <td className="py-2 pr-2">
                      {editar && <input type="checkbox" checked={elegidos.has(a.procesoId)} onChange={() => alternar(a.procesoId)} className="accent-[#4F46E5]" aria-label={`Elegir a ${a.nombre}`} />}
                    </td>
                    <td className="py-2 pr-3 text-text-primary">
                      {a.nombre}
                      {a.prueba && <Prueba />}
                      {a.reprogramaciones > 0 && (
                        <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          {a.reprogramaciones + 1}.ª vez{a.ultimaRazon ? ` · ${ETIQUETA_ESTADO_PRUEBA[a.ultimaRazon].toLowerCase()}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-text-secondary">{a.cedula}</td>
                    <td className="py-2 pr-3 break-all text-text-secondary">{a.correo}</td>
                    <td className="py-2 pr-3 text-text-secondary">{fecha(a.validadoAt)}</td>
                    <td className="py-2">
                      <Etapa estado={a.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion
        titulo={`2. Esperando resultado (${datos.esperando.length})`}
        ayuda={`Inscritos en la plataforma que todavía no tienen concepto. En rojo, los que llevan más de ${datos.diasParaPresentar} días. Si no la presentó o no la terminó, vuelve a «Por inscribir» para subirlo otra vez.`}
      >
        {datos.esperando.length === 0 ? (
          <p className="text-sm text-text-tertiary">— Nadie esperando resultado.</p>
        ) : (
          <TablaAspirantes
            filas={datos.esperando}
            tituloExtra="Inscrito"
            extra={(a) => (
              <span className={a.demorado ? "font-medium text-red-700" : undefined}>
                {fecha(a.inscritoAt)} (hace {diasDesde(a.inscritoAt)} días){a.reprogramaciones > 0 ? ` · ${a.reprogramaciones + 1}.ª vez` : ""}
              </span>
            )}
            acciones={
              editar
                ? (a) => (
                    <span className="flex flex-wrap gap-1">
                      <button type="button" className={`${BOTON} px-2 py-1 text-xs`} disabled={ocupado} onClick={() => reprogramar([a.procesoId], "no_presento")}>
                        No la presentó
                      </button>
                      <button type="button" className={`${BOTON} px-2 py-1 text-xs`} disabled={ocupado} onClick={() => reprogramar([a.procesoId], "incompleta")}>
                        No la terminó
                      </button>
                    </span>
                  )
                : undefined
            }
          />
        )}
      </Seccion>

      <Seccion
        titulo="3. Subir resultados"
        ayuda={`Los informes PDF de PsicoAlianza (Ethikos, Ten DISC…; se pueden subir todos juntos) o un Excel/CSV con documento y concepto. Si el informe no trae el concepto escrito, sale del porcentaje: ${textoCortes(datos.cortes)} (se cambia en Selección › Tiempos y reglas). Revise la vista previa antes de guardar.`}
      >
        {editar ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputArchivos}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.pdf,application/pdf"
                onChange={(e) => {
                  setArchivos(Array.from(e.target.files ?? []));
                  setVista(null);
                  setErroresLectura([]);
                }}
                className="text-sm"
              />
              <button type="button" className={BOTON} disabled={ocupado || !archivos.length} onClick={leer}>
                <FileUp className="h-4 w-4" /> Leer resultados
              </button>
            </div>
            {erroresLectura.map((e) => (
              <p key={e} className="flex items-center gap-1.5 text-xs text-amber-800">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {e}
              </p>
            ))}
            {vista && vista.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-text-tertiary">
                        <th className="w-8 py-2 pr-2">Guardar</th>
                        <th className="py-2 pr-3 font-medium">Archivo</th>
                        <th className="py-2 pr-3 font-medium">Aspirante</th>
                        <th className="py-2 pr-3 font-medium">Concepto leído</th>
                        <th className="py-2 pr-3 font-medium">Resultado</th>
                        <th className="py-2 pr-3 font-medium">Fecha</th>
                        <th className="py-2 font-medium">Puntaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vista.map((f) => (
                        <tr key={f.clave} className="border-b border-[#F1F5F9] align-top last:border-0">
                          <td className="py-2 pr-2">
                            <input
                              type="checkbox"
                              checked={f.incluir}
                              disabled={!f.procesoId || (!f.resultado && !f.estadoPrueba)}
                              onChange={(e) => cambiar(f.clave, { incluir: e.target.checked })}
                              className="accent-[#4F46E5]"
                            />
                          </td>
                          <td className="py-2 pr-3 text-xs text-text-secondary">
                            {f.nombreArchivo}
                            {!f.esPdf && <span className="block text-text-tertiary">fila {f.fila}</span>}
                          </td>
                          <td className="py-2 pr-3">
                            {f.procesoId ? (
                              <span className="text-text-primary">
                                {f.nombreProceso}
                                {f.prueba && <Prueba />}
                                <span className="block text-xs text-text-tertiary">CC {f.cedula}</span>
                              </span>
                            ) : (
                              <select
                                className={CAMPO}
                                value=""
                                onChange={(e) => {
                                  const a = opcionesAspirante.find((x) => x.procesoId === e.target.value);
                                  if (a) cambiar(f.clave, { procesoId: a.procesoId, nombreProceso: a.nombre, cedula: a.cedula, prueba: a.prueba });
                                }}
                              >
                                <option value="">{f.cedula ? `CC ${f.cedula}: ¿quién es?` : "¿A quién corresponde?"}</option>
                                {opcionesAspirante.map((a) => (
                                  <option key={a.procesoId} value={a.procesoId}>
                                    {a.nombre} · {a.cedula}
                                  </option>
                                ))}
                              </select>
                            )}
                            {f.aviso && <span className="mt-1 block text-[11px] text-amber-800">{f.aviso}</span>}
                          </td>
                          <td className="py-2 pr-3 text-xs text-text-secondary">{f.concepto ?? "—"}</td>
                          <td className="py-2 pr-3">
                            <select
                              className={CAMPO}
                              value={f.estadoPrueba ? `r:${f.estadoPrueba}` : (f.resultado ?? "")}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v.startsWith("r:")) cambiar(f.clave, { estadoPrueba: v.slice(2) as EstadoPrueba, resultado: null });
                                else cambiar(f.clave, { estadoPrueba: null, resultado: (v || null) as ResultadoPsicoExterna | null });
                              }}
                            >
                              <option value="">Elegir…</option>
                              {Object.entries(RESULTADOS_PSICO_EXTERNA).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                              <option value="r:no_presento">No la presentó: volver a inscribir</option>
                              <option value="r:incompleta">No la terminó: volver a inscribir</option>
                            </select>
                          </td>
                          <td className="py-2 pr-3">
                            <input type="date" className={CAMPO} value={f.fecha ?? ""} onChange={(e) => cambiar(f.clave, { fecha: e.target.value || null })} />
                          </td>
                          <td className="py-2">
                            <input
                              className={`${CAMPO} w-20`}
                              inputMode="decimal"
                              value={f.puntaje ?? ""}
                              onChange={(e) => cambiar(f.clave, { puntaje: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className={PRIMARIO} disabled={ocupado || (!aGuardar.length && !aReprogramar.length)} onClick={guardar}>
                    <CheckCircle2 className="h-4 w-4" /> Guardar {aGuardar.length} resultados
                    {aReprogramar.length ? ` y volver a inscribir ${aReprogramar.length}` : ""}
                  </button>
                  <span className="text-xs text-text-tertiary">Sin fecha, queda la de hoy. Lo que no tenga aspirante o resultado no se guarda.</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">Para subir resultados hace falta el permiso de editar candidatos.</p>
        )}
      </Seccion>

      <Seccion titulo={`4. Resultados de los últimos 60 días (${datos.conResultado.length})`} ayuda="El concepto que quedó en cada proceso. Para contratar, si así está en Tiempos y reglas, tiene que ser apto.">
        {datos.conResultado.length === 0 ? (
          <p className="text-sm text-text-tertiary">— Ninguno todavía.</p>
        ) : (
          <TablaAspirantes
            filas={datos.conResultado}
            tituloExtra="Resultado"
            extra={(a) => (
              <span className="flex flex-wrap items-center gap-2">
                {a.resultado && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONO[a.resultado]}`}>{RESULTADOS_PSICO_EXTERNA[a.resultado]}</span>}
                <span className="text-xs text-text-tertiary">
                  {fecha(a.fecha)}
                  {a.puntaje != null ? ` · ${a.puntaje} pts` : ""}
                  {a.entidad ? ` · ${a.entidad}` : ""}
                </span>
              </span>
            )}
          />
        )}
      </Seccion>
    </div>
  );
}

function TablaAspirantes({
  filas,
  extra,
  tituloExtra,
  acciones,
}: {
  filas: AspirantePsico[];
  extra: (a: AspirantePsico) => React.ReactNode;
  tituloExtra: string;
  acciones?: (a: AspirantePsico) => React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-tertiary">
            <th className="py-2 pr-3 font-medium">Aspirante</th>
            <th className="py-2 pr-3 font-medium">Documento</th>
            <th className="py-2 pr-3 font-medium">Email</th>
            <th className="py-2 pr-3 font-medium">{tituloExtra}</th>
            <th className="py-2 font-medium">Etapa</th>
            {acciones && <th className="py-2 pl-3 font-medium" />}
          </tr>
        </thead>
        <tbody>
          {filas.map((a) => (
            <tr key={a.procesoId} className="border-b border-[#F1F5F9] last:border-0">
              <td className="py-2 pr-3 text-text-primary">
                {a.nombre}
                {a.prueba && <Prueba />}
              </td>
              <td className="py-2 pr-3 text-text-secondary">{a.cedula}</td>
              <td className="py-2 pr-3 break-all text-text-secondary">{a.correo ?? "—"}</td>
              <td className="py-2 pr-3 text-text-secondary">{extra(a)}</td>
              <td className="py-2">
                <Etapa estado={a.estado} />
              </td>
              {acciones && <td className="py-2 pl-3">{acciones(a)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
