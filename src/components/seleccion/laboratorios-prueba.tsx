"use client";

/**
 * Chat de prueba › pestaña «Laboratorios»: la conversación con cada
 * laboratorio, como si fuera su WhatsApp o su correo. Muestra las órdenes que
 * Gestivo le habría enviado (con sus adjuntos) y lo que el laboratorio
 * responde. Desde aquí se escribe como el laboratorio: la respuesta entra por
 * la misma lectura que un mensaje real y se confirma aquí mismo, con lo que el
 * aspirante pasa a la fase 2 (y el mensaje le llega al chat). La orden sale de
 * verdad solo si el laboratorio tiene un destino de prueba (24-nov-2026); si
 * no, queda simulada. Las respuestas rápidas usan la frase acordada con el
 * laboratorio: con ella el resultado se registra solo. Todo queda guardado.
 */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Download, Mail, MessageCircle, Paperclip, RefreshCw, Send } from "lucide-react";
import { confirmarAvisoLaboratorio, descartarAvisoLaboratorio } from "@/app/(dashboard)/candidatos/entrega3-actions";
import {
  datosLaboratorios, documentosAspiranteAccion, enviarOrdenPruebaAccion, hiloLaboratorioPruebaAccion, pendientesPruebaAccion,
  simularRespuestaLaboratorioAccion, type DocumentoDescarga,
} from "@/app/(dashboard)/candidatos/seleccion/laboratorios-actions";
import type { Laboratorio } from "@/lib/seleccion/laboratorios";
import { FRASE_APTO_POR_DEFECTO } from "@/lib/seleccion/laboratorio";
import type { MensajeHiloLaboratorio } from "@/lib/seleccion/laboratorios-servidor";
import { ETIQUETA_MENSAJE, avisarPrueba } from "./profesor-tipos";

const campo = "rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-primary";
const hora = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const fechaCorta = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const RESULTADOS: Record<string, string> = { apto: "Apto", no_apto: "No apto", aplazado: "Aplazado" };

type AspiranteOrdenHilo = NonNullable<MensajeHiloLaboratorio["aspirantes"]>[number];
type ResultadoRapido = "apto" | "no_apto" | "aplazado";

type FrasesLab = Pick<Laboratorio, "frase_apto" | "frase_no_apto" | "frase_aplazado">;

/**
 * Lo que escribiría el laboratorio para ese resultado (pasa por la misma
 * lectura que un WhatsApp real). Con la frase acordada, esa frase.
 */
export function textoRespuestaLaboratorio(a: Pick<AspiranteOrdenHilo, "nombre" | "cedula" | "fase">, r: ResultadoRapido, frases?: FrasesLab | null): string {
  const fase = a.fase === 1 ? "primera" : "segunda";
  const quien = `${a.nombre} CC ${a.cedula}`;
  const acordada = (r === "apto" ? frases?.frase_apto || (a.fase === 1 ? FRASE_APTO_POR_DEFECTO : null) : r === "no_apto" ? frases?.frase_no_apto : frases?.frase_aplazado)?.trim();
  if (acordada) return `${quien}: ${acordada}`;
  if (r === "apto") return a.fase === 1 ? `${quien}: APTO en la primera fase, puede continuar a la segunda fase.` : `${quien}: APTO en la segunda fase, concepto definitivo apto.`;
  if (r === "no_apto") return `${quien}: NO APTO en la ${fase} fase.`;
  return `${quien}: APLAZADO en la ${fase} fase, debe repetir el hemograma.`;
}

function descargar(d: DocumentoDescarga) {
  const bytes = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: d.mime ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = d.nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function Saliente({ m, onResponder, ocupado, frases }: { m: MensajeHiloLaboratorio; onResponder?: (texto: string) => void; ocupado: boolean; frases?: FrasesLab | null }) {
  const [bajando, enTransicion] = useTransition();
  const esperando = (m.aspirantes ?? []).filter((a) => a.esperando);
  const destino = m.para?.join(", ") || "—";
  const estado = m.resultado === "simulado" ? "simulado (no salió)" : m.resultado === "fallido" ? `falló: ${m.error ?? ""}` : "enviado";
  return (
    <div className="ml-6 rounded-xl rounded-tr-sm bg-[#DCF8C6] p-2.5 text-xs text-slate-800 shadow-sm">
      <p className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-700">
        {m.canal === "correo" ? <Mail className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
        <span className="font-medium">{m.canal === "correo" ? "Correo" : "WhatsApp"} a {destino}</span>
        <span className="text-slate-500">· {estado}</span>
        {m.canal === "correo" && m.copia?.length ? <span className="text-slate-500">· CC {m.copia.join(", ")}</span> : null}
      </p>
      {!!m.aspirantes?.length && (
        <p className="text-[11px] text-slate-600">
          {m.aspirantes.map((a) => `${a.nombre} · fase ${a.fase}`).join(" · ")}
        </p>
      )}
      <details className="mt-1">
        <summary className="cursor-pointer text-[11px] text-slate-500">{m.canal === "correo" ? `Ver el correo${m.asunto ? ` («${m.asunto}»)` : ""}` : "Ver el mensaje"}</summary>
        <p className="mt-1 whitespace-pre-wrap">{m.texto}</p>
      </details>
      {!!m.adjuntos?.length && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {m.adjuntos.map((a) => (
            <button
              key={a.nombre}
              type="button"
              disabled={bajando || !a.procesoId}
              onClick={() =>
                enTransicion(async () => {
                  const r = await documentosAspiranteAccion(a.procesoId);
                  const orden = r.ok ? r.documentos.find((d) => d.tipo === "orden") : null;
                  if (orden) descargar(orden);
                })
              }
              className="inline-flex items-center gap-1 rounded-md bg-white/70 px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-white disabled:opacity-50"
              title="Descargar la orden (se genera de nuevo con los datos de hoy)"
            >
              <Paperclip className="h-3 w-3" /> {a.nombre}
            </button>
          ))}
        </div>
      )}
      {onResponder && esperando.length > 0 && (
        <div className="mt-2 space-y-1 rounded-md bg-white/70 p-1.5">
          <p className="text-[10px] font-medium text-slate-500">
            Responder como el laboratorio (con la frase acordada: se registra solo)
          </p>
          {esperando.map((a) => (
            <div key={`${a.procesoId}-${a.fase}`} className="flex flex-wrap items-center gap-1">
              <span className="mr-auto text-[11px] text-slate-700">
                {a.nombre} · fase {a.fase}
              </span>
              {(["apto", "no_apto", "aplazado"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={ocupado}
                  onClick={() => onResponder(textoRespuestaLaboratorio(a, r, frases))}
                  title={textoRespuestaLaboratorio(a, r, frases)}
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium disabled:opacity-50 ${
                    r === "apto" ? "bg-emerald-600 text-white hover:bg-emerald-700" : r === "no_apto" ? "bg-red-600 text-white hover:bg-red-700" : "bg-amber-500 text-white hover:bg-amber-600"
                  }`}
                >
                  {RESULTADOS[r]}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <p className="mt-1 text-right text-[10px] text-slate-500">{hora(m.at)}</p>
    </div>
  );
}

function Entrante({ m, onListo }: { m: MensajeHiloLaboratorio; onListo: () => void }) {
  const a = m.aviso!;
  const [fase, setFase] = useState<1 | 2>(a.fase ?? 1);
  const [resultado, setResultado] = useState<string>(a.resultado ?? "");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, enTransicion] = useTransition();
  return (
    <div className="mr-6 rounded-xl rounded-tl-sm bg-white p-2.5 text-xs text-slate-800 shadow-sm">
      <p className="mb-1 text-[10px] font-medium text-slate-500">Laboratorio{a.simulado ? " · simulado" : ""}</p>
      <p className="whitespace-pre-wrap">{m.texto || "(archivo)"}</p>
      <p className="mt-1.5 rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
        Gestivo leyó: {a.nombre ?? "sin nombre"}
        {a.cedula ? ` · CC ${a.cedula}` : ""} · {a.fase ? `fase ${a.fase}` : "fase sin dato"} · {a.resultado ? RESULTADOS[a.resultado] ?? a.resultado : "sin resultado"}
        {a.procesoNombre ? ` → ${a.procesoNombre}` : " → no se asoció a un aspirante"}
      </p>
      {a.estado === "pendiente" ? (
        a.procesoId ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <select className={`${campo} py-1 text-xs`} value={fase} onChange={(e) => setFase(Number(e.target.value) as 1 | 2)}>
              <option value={1}>Fase 1</option>
              <option value={2}>Fase 2</option>
            </select>
            <select className={`${campo} py-1 text-xs`} value={resultado} onChange={(e) => setResultado(e.target.value)}>
              <option value="">Resultado</option>
              <option value="apto">Apto</option>
              <option value="no_apto">No apto</option>
              <option value="aplazado">Aplazado</option>
            </select>
            <button
              type="button"
              disabled={ocupado || !resultado}
              className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
              onClick={() =>
                enTransicion(async () => {
                  setError(null);
                  const r = await confirmarAvisoLaboratorio(m.id.replace(/^a-/, ""), a.procesoId!, fase, resultado as "apto" | "no_apto" | "aplazado");
                  if (!r.ok) return setError(r.error ?? "No se pudo confirmar.");
                  // El mensaje que sale (cita de la fase 2, o reconocimiento de ruta si la fase 2 es apta) le llega en su chat de prueba.
                  const clave = fase === 1 ? "examenes_fase2" : "reconocimiento_ruta";
                  if (r.texto) avisarPrueba({ texto: r.texto, procesoId: a.procesoId!, etiqueta: ETIQUETA_MENSAJE[clave], clave });
                  else avisarPrueba({ procesoId: a.procesoId! });
                  onListo();
                })
              }
            >
              Confirmar
            </button>
            <button
              type="button"
              disabled={ocupado}
              className="text-[11px] text-slate-500 underline"
              onClick={() =>
                enTransicion(async () => {
                  await descartarAvisoLaboratorio(m.id.replace(/^a-/, ""));
                  onListo();
                })
              }
            >
              Descartar
            </button>
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-amber-700">No se asoció a ningún aspirante en exámenes: confírmelo desde la Agenda eligiendo el aspirante.</p>
        )
      ) : (
        <p className="mt-1 text-[11px] text-emerald-700">{a.estado === "confirmado" ? "Confirmado" : "Descartado"}</p>
      )}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      <p className="mt-1 text-right text-[10px] text-slate-500">{hora(m.at)}</p>
    </div>
  );
}

export function LaboratoriosPrueba({ puedeEditar }: { puedeEditar: boolean }) {
  const [labs, setLabs] = useState<Laboratorio[]>([]);
  /** Entorno de pruebas: a dónde sale de verdad la orden de cada laboratorio (null = simulada). */
  const [destinos, setDestinos] = useState<Record<string, string | null>>({});
  const [labId, setLabId] = useState("");
  const [hilo, setHilo] = useState<MensajeHiloLaboratorio[]>([]);
  const [pendientes, setPendientes] = useState<{ fecha: string; citaIds: string[]; nombres: string[] }[]>([]);
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const finRef = useRef<HTMLDivElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    datosLaboratorios()
      .then((r) => {
        if (!r.ok) return;
        const activos = r.laboratorios.filter((l) => l.activo);
        setLabs(activos);
        setDestinos(r.destinosPrueba ?? {});
        setLabId((id) => id || activos[0]?.id || "");
      })
      .catch(() => undefined);
  }, []);

  const [version, setVersion] = useState(0);
  const cargar = useCallback(async () => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!labId) return;
    let vivo = true;
    Promise.all([hiloLaboratorioPruebaAccion(labId).catch(() => []), pendientesPruebaAccion(labId).catch(() => [])]).then(([h, p]) => {
      if (!vivo) return;
      setHilo(h);
      setPendientes(p);
    });
    return () => {
      vivo = false;
    };
  }, [labId, version]);
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [hilo.length]);
  // Cuando el profesor aprueba en el chat de prueba aparecen citas nuevas: se vuelve a leer.
  useEffect(() => {
    const alAviso = () => void cargar();
    window.addEventListener("seleccion-prueba", alAviso);
    return () => window.removeEventListener("seleccion-prueba", alAviso);
  }, [cargar]);

  /** Lo registrado solo por la frase acordada: el mensaje que le sale al aspirante llega a su chat de prueba. */
  const avisarConfirmados = (confirmados: { procesoId: string; fase: 1 | 2; texto?: string }[]) => {
    for (const c of confirmados) {
      const clave = c.fase === 1 ? "examenes_fase2" : "reconocimiento_ruta";
      if (c.texto) avisarPrueba({ texto: c.texto, procesoId: c.procesoId, etiqueta: ETIQUETA_MENSAJE[clave], clave });
      else avisarPrueba({ procesoId: c.procesoId });
    }
  };

  /** Un botón de respuesta rápida: el texto entra como un mensaje del laboratorio (misma lectura que uno real). */
  const responderRapido = (texto: string) =>
    enTransicion(async () => {
      const fd = new FormData();
      fd.set("texto", texto);
      const r = await simularRespuestaLaboratorioAccion(labId, fd);
      if (!r.ok) return setAviso({ ok: false, texto: r.error });
      avisarConfirmados(r.confirmados ?? []);
      setAviso(
        r.confirmados?.length
          ? { ok: true, texto: "Respuesta con la frase acordada: el resultado quedó registrado y el aspirante siguió (el mensaje le llegó a su chat)." }
          : r.avisos
            ? { ok: true, texto: "Respuesta del laboratorio leída: confírmela abajo para que el aspirante siga." }
            : { ok: false, texto: "No se leyó ningún resultado en la respuesta." }
      );
      await cargar();
    });

  const lab = labs.find((l) => l.id === labId);
  const destino = labId ? (destinos[labId] ?? null) : null;
  if (!labs.length) return <p className="text-xs text-text-tertiary">No hay laboratorios activos (Candidatos › Selección › Laboratorios).</p>;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-muted">
        Lo que Gestivo le manda a cada laboratorio y lo que el laboratorio responde, solo con los candidatos de prueba. Queda guardado. La respuesta del laboratorio se escribe aquí abajo.
      </p>
      {destino ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-800">
          Este laboratorio tiene un destino de prueba: la orden sale de verdad a <strong>{destino}</strong>. Lo que responda allí no llega a este entorno: escríbalo aquí.
        </p>
      ) : (
        <p className="text-[11px] text-text-muted">
          La orden no sale: queda simulada. Para recibirla de verdad, ponga al laboratorio un correo o número de prueba y agréguelo en Tiempos y reglas › Entorno de pruebas.
        </p>
      )}
      <div className="flex items-center gap-2">
        <select className={`${campo} min-w-0 flex-1`} value={labId} onChange={(e) => setLabId(e.target.value)}>
          {labs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre} ({l.canal === "correo" ? "correo" : "WhatsApp"})
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void cargar()} className="rounded-lg border border-border bg-white p-1.5 text-text-secondary hover:bg-slate-50" title="Actualizar">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {pendientes.length > 0 && puedeEditar && (
        <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <p className="font-medium">Citados sin la orden enviada</p>
          {pendientes.map((p) => (
            <div key={p.fecha} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {fechaCorta(p.fecha)}: {p.nombres.join(", ")}
              </span>
              <button
                type="button"
                disabled={ocupado}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                onClick={() =>
                  enTransicion(async () => {
                    const r = await enviarOrdenPruebaAccion(labId, p.fecha, p.citaIds);
                    setAviso(r.ok ? { ok: true, texto: destino ? `Orden enviada de verdad a ${destino}: quedó en la conversación.` : "Orden simulada: quedó en la conversación." } : { ok: false, texto: r.error });
                    await cargar();
                  })
                }
              >
                <Send className="h-3 w-3" /> Enviar la orden {lab?.canal === "correo" ? "(correo)" : "(WhatsApp)"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="max-h-[52vh] min-h-[200px] space-y-2 overflow-y-auto rounded-xl bg-[#EFEAE2] p-2.5">
        {!hilo.length && <p className="py-6 text-center text-xs text-slate-500">Todavía no hay mensajes con este laboratorio.</p>}
        {hilo.map((m) =>
          m.direccion === "saliente" ? (
            <Saliente key={m.id} m={m} ocupado={ocupado} frases={lab} onResponder={puedeEditar ? responderRapido : undefined} />
          ) : (
            <Entrante key={m.id} m={m} onListo={() => void cargar()} />
          )
        )}
        <div ref={finRef} />
      </div>

      {puedeEditar && (
        <div className="space-y-1.5 rounded-xl border border-border bg-white p-2">
          <p className="text-[11px] font-medium text-text-secondary">Responder como {lab?.nombre ?? "el laboratorio"}</p>
          <textarea
            className={`${campo} min-h-[56px] w-full`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej.: NOMBRE APELLIDO CC 123456 puede continuar a segunda fase · o «… aplazado por hemograma»"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => archivoRef.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-slate-50">
              <Paperclip className="h-3.5 w-3.5" /> {archivo ? archivo.name : "PDF o foto"}
            </button>
            <input ref={archivoRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
            <button
              type="button"
              disabled={ocupado || (!texto.trim() && !archivo)}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              onClick={() =>
                enTransicion(async () => {
                  const fd = new FormData();
                  fd.set("texto", texto);
                  if (archivo) fd.set("archivo", archivo);
                  const r = await simularRespuestaLaboratorioAccion(labId, fd);
                  if (!r.ok) return setAviso({ ok: false, texto: r.error });
                  setTexto("");
                  setArchivo(null);
                  avisarConfirmados(r.confirmados ?? []);
                  setAviso(
                    r.confirmados?.length
                      ? { ok: true, texto: "Traía la frase acordada: el resultado quedó registrado." }
                      : r.avisos
                        ? null
                        : { ok: false, texto: "No se leyó ningún resultado (un saludo o una pregunta no deja aviso)." }
                  );
                  await cargar();
                })
              }
            >
              <Send className="h-3.5 w-3.5" /> {ocupado ? "Leyendo…" : "Enviar"}
            </button>
          </div>
        </div>
      )}
      {aviso && <p className={`text-xs ${aviso.ok ? "text-emerald-700" : "text-red-600"}`}>{aviso.texto}</p>}
      <p className="flex items-center gap-1 text-[10px] text-text-muted">
        <Download className="h-3 w-3" /> Los adjuntos se generan de nuevo al descargarlos, con la plantilla actual.
      </p>
    </div>
  );
}
