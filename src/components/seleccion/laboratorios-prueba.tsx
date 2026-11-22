"use client";

/**
 * Chat de prueba › pestaña «Laboratorios»: la conversación con cada
 * laboratorio, como si fuera su WhatsApp o su correo. Muestra las órdenes que
 * Gestivo le habría enviado (con sus adjuntos) y lo que el laboratorio
 * responde. Desde aquí se escribe como el laboratorio: la respuesta entra por
 * la misma lectura que un mensaje real y se confirma aquí mismo, con lo que el
 * aspirante pasa a la fase 2 (y el mensaje le llega al chat). Nada sale por
 * WhatsApp ni por correo. Todo queda guardado: al volver, sigue ahí.
 */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Download, Mail, MessageCircle, Paperclip, RefreshCw, Send } from "lucide-react";
import { confirmarAvisoLaboratorio, descartarAvisoLaboratorio } from "@/app/(dashboard)/candidatos/entrega3-actions";
import {
  datosLaboratorios, documentosAspiranteAccion, enviarOrdenPruebaAccion, hiloLaboratorioPruebaAccion, pendientesPruebaAccion,
  simularRespuestaLaboratorioAccion, type DocumentoDescarga,
} from "@/app/(dashboard)/candidatos/seleccion/laboratorios-actions";
import type { Laboratorio } from "@/lib/seleccion/laboratorios";
import type { MensajeHiloLaboratorio } from "@/lib/seleccion/laboratorios-servidor";
import { ETIQUETA_MENSAJE, avisarPrueba } from "./profesor-tipos";

const campo = "rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-primary";
const hora = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const fechaCorta = (f: string) => new Date(`${f}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const RESULTADOS: Record<string, string> = { apto: "Apto", no_apto: "No apto", aplazado: "Aplazado" };

function descargar(d: DocumentoDescarga) {
  const bytes = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = d.nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function Saliente({ m }: { m: MensajeHiloLaboratorio }) {
  const [bajando, enTransicion] = useTransition();
  return (
    <div className="ml-6 rounded-xl rounded-tr-sm bg-[#DCF8C6] p-2.5 text-xs text-slate-800 shadow-sm">
      <p className="mb-1 flex items-center gap-1 text-[10px] font-medium text-slate-500">
        {m.canal === "correo" ? <Mail className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
        {m.canal === "correo" ? "Correo" : "WhatsApp"} de Gestivo · {m.resultado === "simulado" ? "simulado (no salió)" : m.resultado === "fallido" ? `falló: ${m.error ?? ""}` : "enviado"}
      </p>
      {m.canal === "correo" && (
        <p className="mb-1 text-[11px] text-slate-600">
          Para: {m.para?.join(", ") || "—"}
          {m.copia?.length ? ` · CC: ${m.copia.join(", ")}` : ""}
          <br />
          Asunto: <span className="font-medium">{m.asunto}</span>
        </p>
      )}
      <p className="whitespace-pre-wrap">{m.texto}</p>
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

  const lab = labs.find((l) => l.id === labId);
  if (!labs.length) return <p className="text-xs text-text-tertiary">No hay laboratorios activos (Candidatos › Selección › Laboratorios).</p>;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-muted">
        Lo que Gestivo le manda a cada laboratorio y lo que el laboratorio responde, solo con los candidatos de prueba. Nada sale por WhatsApp ni por correo, y queda guardado.
      </p>
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
                    setAviso(r.ok ? { ok: true, texto: "Orden simulada: quedó en la conversación." } : { ok: false, texto: r.error });
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
        {hilo.map((m) => (m.direccion === "saliente" ? <Saliente key={m.id} m={m} /> : <Entrante key={m.id} m={m} onListo={() => void cargar()} />))}
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
                  setAviso(r.avisos ? null : { ok: false, texto: "No se leyó ningún resultado (un saludo o una pregunta no deja aviso)." });
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
