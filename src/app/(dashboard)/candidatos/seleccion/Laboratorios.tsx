"use client";

/**
 * Candidatos › Selección › Laboratorios (Salud Ocupacional, 21-nov-2026):
 * los laboratorios y su canal, las plantillas en Word (orden y carta del
 * banco), la orden del día con vista previa, y el simulador: documentos al
 * aspirante, envío al laboratorio y respuesta del laboratorio, sin que salga
 * nada de verdad.
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Download, FileText, Mail, MessageCircle, Plus, Send, TriangleAlert, Upload } from "lucide-react";
import { DIAS_CORTOS, DIAS_SEMANA, type Laboratorio, type ModoReparto } from "@/lib/seleccion/laboratorios";
import { fechaEnTexto } from "@/lib/seleccion/agenda";
import type { VistaOrden } from "@/lib/seleccion/laboratorios-servidor";
import { FRASE_APTO_POR_DEFECTO, type LecturaLaboratorio } from "@/lib/seleccion/laboratorio";
import {
  asignarLaboratorioAccion, datosLaboratorios, documentosAspiranteAccion, enviarDocumentosAccion, enviarOrdenAccion, guardarLaboratorioAccion,
  guardarLaboratorioFechaProfesorAccion, guardarRepartoAccion, procesosEnExamenesAccion, simularRepartoAccion, simularRespuestaLaboratorioAccion, subirPlantillaCartaAccion,
  subirPlantillaOrdenAccion, vistaOrdenAccion, datosFirmaCartaAccion, guardarFirmanteAccion, quitarImagenCartaAccion, subirImagenCartaAccion,
  type DocumentoDescarga, type PantallaLaboratorios, type ProcesoSimulador,
} from "./laboratorios-actions";

const campo = "w-full rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary disabled:bg-slate-50";
const boton = "inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50 disabled:opacity-50";
const botonPrimario = "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

function descargar(d: DocumentoDescarga) {
  const bytes = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: d.mime ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = d.nombre;
  a.click();
  URL.revokeObjectURL(url);
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-text-primary">{titulo}</h2>
      {ayuda && <p className="mt-0.5 text-xs text-text-tertiary">{ayuda}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Mensaje({ ok, texto }: { ok: boolean; texto: string }) {
  return <p className={`text-xs ${ok ? "text-emerald-700" : "text-red-600"}`}>{texto}</p>;
}

function Marcas({ marcas }: { marcas: string[] | null | undefined }) {
  if (!marcas) return <span className="text-xs text-amber-700">Sin plantilla subida</span>;
  return <span className="text-xs text-text-tertiary">Marcas: {marcas.map((m) => `{${m}}`).join(" ")}</span>;
}

function SubirWord({ etiqueta, disabled, onSubir, aceptaPdf = false }: { etiqueta: string; disabled: boolean; onSubir: (f: FormData) => Promise<void>; aceptaPdf?: boolean }) {
  return (
    <label className={`${boton} cursor-pointer ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <Upload className="h-4 w-4" /> {etiqueta}
      <input
        type="file"
        accept={`.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document${aceptaPdf ? ",.pdf,application/pdf" : ""}`}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.set("archivo", f);
          e.target.value = "";
          void onSubir(fd);
        }}
      />
    </label>
  );
}

// ── Configuración de un laboratorio ─────────────────────────────────────────

/** Casillas de los días de la semana (lunes primero). */
function Dias({ valor, onCambio, disabled, permitidos }: { valor: number[]; onCambio: (v: number[]) => void; disabled: boolean; permitidos?: number[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => {
        const on = valor.includes(d);
        const bloqueado = disabled || (permitidos ? !permitidos.includes(d) : false);
        return (
          <button
            key={d}
            type="button"
            title={DIAS_SEMANA[d]}
            disabled={bloqueado}
            onClick={() => onCambio(on ? valor.filter((x) => x !== d) : [...valor, d])}
            className={`h-7 w-7 rounded-md border text-xs font-medium ${on ? "border-primary bg-primary text-white" : "border-border bg-white text-text-secondary"} disabled:opacity-40`}
          >
            {DIAS_CORTOS[d]}
          </button>
        );
      })}
    </div>
  );
}

function TarjetaLaboratorio({ lab, marcas, smtp, puedeEditar, onCambio, reparto, asignados }: { lab: Partial<Laboratorio> | null; marcas: string[] | null | undefined; smtp: boolean; puedeEditar: boolean; onCambio: () => void; reparto: ModoReparto; asignados: number }) {
  const [f, setF] = useState({
    nombre: lab?.nombre ?? "",
    direccion: lab?.direccion ?? "",
    telefono_contacto: lab?.telefono_contacto ?? "",
    canal: (lab?.canal ?? "correo") as "whatsapp" | "correo",
    whatsapp: lab?.whatsapp ?? "",
    correos: (lab?.correos ?? []).join(", "),
    correos_copia: (lab?.correos_copia ?? []).join(", "),
    asunto: lab?.asunto ?? "",
    activo: lab?.activo ?? true,
    predeterminado: lab?.predeterminado ?? false,
    dias_atencion: lab?.dias_atencion?.length ? lab.dias_atencion : [1, 2, 3, 4, 5, 6],
    dias_preferidos: lab?.dias_preferidos ?? [],
    porcentaje: lab?.porcentaje ?? 0,
    frase_apto: lab?.frase_apto || FRASE_APTO_POR_DEFECTO,
    frase_no_apto: lab?.frase_no_apto ?? "",
    frase_aplazado: lab?.frase_aplazado ?? "",
    fechas_sin_atencion: (lab?.fechas_sin_atencion ?? []).filter((x) => x >= hoyBogota()),
  });
  const [fechaNueva, setFechaNueva] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="rounded-xl border border-[#E2E8F0] p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-text-secondary">
          Nombre
          <input className={campo} value={f.nombre} disabled={!puedeEditar} onChange={(e) => set("nombre", e.target.value)} />
        </label>
        <label className="text-xs text-text-secondary">
          Canal de la orden
          <select className={campo} value={f.canal} disabled={!puedeEditar} onChange={(e) => set("canal", e.target.value as "whatsapp" | "correo")}>
            <option value="correo">Correo electrónico</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </label>
        <label className="text-xs text-text-secondary">
          Dirección (sale en el mensaje al aspirante y en la orden)
          <input className={campo} value={f.direccion} disabled={!puedeEditar} onChange={(e) => set("direccion", e.target.value)} />
        </label>
        <label className="text-xs text-text-secondary">
          Teléfono que va en la orden
          <input className={campo} value={f.telefono_contacto} disabled={!puedeEditar} onChange={(e) => set("telefono_contacto", e.target.value)} />
        </label>
        <label className="text-xs text-text-secondary">
          WhatsApp del laboratorio {f.canal === "whatsapp" ? "(recibe la orden y responde los resultados)" : "(si responde resultados por WhatsApp)"}
          <input className={campo} value={f.whatsapp} disabled={!puedeEditar} placeholder="3001234567" onChange={(e) => set("whatsapp", e.target.value)} />
        </label>
        {f.canal === "correo" && (
          <>
            <label className="text-xs text-text-secondary">
              Correos de destino (separados por coma)
              <input className={campo} value={f.correos} disabled={!puedeEditar} onChange={(e) => set("correos", e.target.value)} />
            </label>
            <label className="text-xs text-text-secondary">
              Con copia a
              <input className={campo} value={f.correos_copia} disabled={!puedeEditar} placeholder="Por ejemplo, la Directora de Recursos Humanos" onChange={(e) => set("correos_copia", e.target.value)} />
            </label>
            <label className="text-xs text-text-secondary">
              Asunto
              <input className={campo} value={f.asunto} disabled={!puedeEditar} onChange={(e) => set("asunto", e.target.value)} />
            </label>
          </>
        )}
      </div>
      <div className="mt-2 rounded-lg bg-slate-50 p-2">
        <p className="text-xs font-medium text-text-secondary">Cómo responde el resultado</p>
        <p className="text-[11px] text-text-tertiary">
          La frase que el laboratorio escribe para cada resultado (acordada con él; la IA reconoce también sus variantes). Si la respuesta la trae y se reconoce al aspirante por
          la cédula o el nombre, el resultado se registra solo y pasa a la fase 2. En la fase 1, cualquier otro resultado cuenta como no apto, salvo que diga «aplazado». Lo
          que no es un resultado (un saludo, «pendiente») queda en «Avisos del laboratorio» para confirmarlo.
        </p>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-text-secondary">
            Apto
            <input className={campo} value={f.frase_apto} disabled={!puedeEditar} placeholder={FRASE_APTO_POR_DEFECTO} onChange={(e) => set("frase_apto", e.target.value)} />
          </label>
          <label className="text-xs text-text-secondary">
            No apto
            <input className={campo} value={f.frase_no_apto} disabled={!puedeEditar} placeholder="NO PUEDE CONTINUAR" onChange={(e) => set("frase_no_apto", e.target.value)} />
          </label>
          <label className="text-xs text-text-secondary">
            Aplazado
            <input className={campo} value={f.frase_aplazado} disabled={!puedeEditar} placeholder="APLAZADO" onChange={(e) => set("frase_aplazado", e.target.value)} />
          </label>
        </div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div className="text-xs text-text-secondary">
          Días que atiende
          <Dias valor={f.dias_atencion} disabled={!puedeEditar} onCambio={(v) => setF((x) => ({ ...x, dias_atencion: v, dias_preferidos: x.dias_preferidos.filter((d) => v.includes(d)) }))} />
        </div>
        <div className="text-xs text-text-secondary">
          Preferido estos días (manda sobre el reparto)
          <Dias valor={f.dias_preferidos} disabled={!puedeEditar} permitidos={f.dias_atencion} onCambio={(v) => set("dias_preferidos", v)} />
        </div>
        <label className="text-xs text-text-secondary">
          Porcentaje {reparto === "porcentaje" ? "" : "(si el reparto es por porcentaje)"}
          <input type="number" min={0} max={100} className={campo} value={f.porcentaje} disabled={!puedeEditar} onChange={(e) => set("porcentaje", Number(e.target.value))} />
          <span className="text-[11px] text-text-tertiary">Últimos 30 días: {asignados} aspirante{asignados === 1 ? "" : "s"}</span>
        </label>
      </div>
      <div className="mt-2 text-xs text-text-secondary">
        Fechas en que no atiende (además de los festivos, que nunca atiende)
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {f.fechas_sin_atencion.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
              {fechaEnTexto(d)}
              {puedeEditar && (
                <button type="button" aria-label={`Quitar ${fechaEnTexto(d)}`} onClick={() => set("fechas_sin_atencion", f.fechas_sin_atencion.filter((x) => x !== d))}>
                  ×
                </button>
              )}
            </span>
          ))}
          {!f.fechas_sin_atencion.length && <span className="text-text-tertiary">Ninguna.</span>}
          {puedeEditar && (
            <>
              <input type="date" min={hoyBogota()} value={fechaNueva} onChange={(e) => setFechaNueva(e.target.value)} className={`${campo} w-auto`} />
              <button
                type="button"
                disabled={!fechaNueva}
                className="rounded-lg border border-[#E2E8F0] px-2 py-1 disabled:opacity-50"
                onClick={() => {
                  if (fechaNueva && !f.fechas_sin_atencion.includes(fechaNueva)) set("fechas_sin_atencion", [...f.fechas_sin_atencion, fechaNueva].sort());
                  setFechaNueva("");
                }}
              >
                Agregar
              </button>
            </>
          )}
        </div>
        <span className="text-[11px] text-text-tertiary">Esos días no se le cita a nadie en este laboratorio: el reparto y el profesor eligen otro día u otro laboratorio. Pulse «Guardar» para que cuente.</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-text-secondary">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.activo} disabled={!puedeEditar} onChange={(e) => set("activo", e.target.checked)} /> Activo
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.predeterminado} disabled={!puedeEditar} onChange={(e) => set("predeterminado", e.target.checked)} /> Predeterminado (se asigna al citar la fase 1)
        </label>
      </div>
      {f.canal === "correo" && !smtp && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> El correo de salida no está configurado en el servidor (SMTP_*): por ahora se puede ver la vista previa y simular, pero no enviar.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {puedeEditar && (
          <button
            className={botonPrimario}
            disabled={ocupado}
            onClick={() =>
              enTransicion(async () => {
                const r = await guardarLaboratorioAccion({ id: lab?.id ?? null, ...f });
                setAviso(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.error });
                if (r.ok) onCambio();
              })
            }
          >
            Guardar
          </button>
        )}
        {lab?.id && (
          <>
            <SubirWord
              etiqueta="Subir orden en Word"
              disabled={!puedeEditar || ocupado}
              onSubir={async (fd) => {
                const r = await subirPlantillaOrdenAccion(lab.id!, fd);
                setAviso(r.ok ? { ok: true, texto: `Plantilla de la orden subida. Marcas: ${r.marcas.join(", ")}` } : { ok: false, texto: r.error });
                if (r.ok) onCambio();
              }}
            />
            <Marcas marcas={marcas} />
          </>
        )}
      </div>
      {aviso && <div className="mt-2"><Mensaje {...aviso} /></div>}
    </div>
  );
}

// ── Vista previa de la orden ────────────────────────────────────────────────

function VistaPrevia({ v }: { v: VistaOrden }) {
  return (
    <div className="space-y-2 rounded-xl border border-[#E2E8F0] bg-slate-50 p-3 text-sm">
      {v.faltantes.length > 0 && <Mensaje ok={false} texto={`Al laboratorio le falta ${v.faltantes.join(" y ")}.`} />}
      {!v.aspirantes.length && <p className="text-xs text-text-tertiary">No hay aspirantes citados ese día en este laboratorio.</p>}
      {v.correo && v.aspirantes.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 font-medium text-text-primary"><Mail className="h-4 w-4" /> Correo</p>
          <p className="text-xs text-text-secondary">Para: {v.correo.para.join(", ") || "—"}{v.correo.copia.length ? ` · CC: ${v.correo.copia.join(", ")}` : ""}</p>
          <p className="text-xs text-text-secondary">Asunto: {v.correo.asunto}</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-white p-2 font-sans text-xs text-text-primary">{v.correo.texto}</pre>
          <p className="text-xs text-text-secondary">Adjuntos: {v.correo.adjuntos.join(" · ")}</p>
        </div>
      )}
      {v.whatsapp && v.aspirantes.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 font-medium text-text-primary"><MessageCircle className="h-4 w-4" /> WhatsApp a {v.whatsapp.telefono ?? "(sin número)"}</p>
          {!v.whatsapp.plantillaAprobada && (
            <p className="text-xs text-amber-700">La plantilla «sel_orden_laboratorio» no está aprobada por Meta: con la ventana de 24 h cerrada no saldría (envíela a aprobación en la pestaña Mensajes).</p>
          )}
          {v.whatsapp.mensajes.map((m, i) => (
            <p key={i} className="rounded-lg bg-white p-2 text-xs text-text-primary">{m}</p>
          ))}
        </div>
      )}
      {v.aspirantes.some((a) => a.prueba) && <p className="text-xs text-text-tertiary">Los marcados «prueba» son del chat de prueba: nunca se les envía nada de verdad.</p>}
      <ul className="text-xs text-text-secondary">
        {v.aspirantes.map((a) => (
          <li key={a.citaId}>
            {a.nombre} · CC {a.cedula} · fase {a.fase} · {a.fecha} {a.hora}
            {a.prueba ? " · prueba" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrdenDelDia({ labs, puedeEnviar }: { labs: Laboratorio[]; puedeEnviar: boolean }) {
  const activos = labs.filter((l) => l.activo);
  const [labId, setLabId] = useState(activos[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoyBogota());
  const [incluirPrueba, setIncluirPrueba] = useState(true);
  const [vista, setVista] = useState<VistaOrden | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const ver = () =>
    enTransicion(async () => {
      setAviso(null);
      setVista(labId ? await vistaOrdenAccion(labId, fecha, incluirPrueba) : null);
    });
  const enviar = (simular: boolean) =>
    enTransicion(async () => {
      const r = await enviarOrdenAccion(labId, fecha, simular);
      if (!r.ok) setAviso({ ok: false, texto: r.error });
      else {
        setVista(r.resultado.vista);
        setAviso({ ok: true, texto: r.resultado.simulado ? "Simulación: esto es lo que habría salido. No se envió nada." : r.resultado.detalle.join(" ") || `Enviado (${r.resultado.enviados}).` });
      }
    });
  return (
    <Seccion titulo="Orden del día al laboratorio" ayuda="Un correo por laboratorio con todos los citados del día (con su orden en Word adjunta) o un WhatsApp por aspirante. La fase 2 va al mismo laboratorio de la fase 1. Cada orden se envía una sola vez.">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-text-secondary">
          Laboratorio
          <select className={campo} value={labId} onChange={(e) => setLabId(e.target.value)}>
            {activos.map((l) => (
              <option key={l.id} value={l.id}>{l.nombre} ({l.canal === "correo" ? "correo" : "WhatsApp"})</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-text-secondary">
          Día de la cita
          <input type="date" className={campo} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-xs text-text-secondary">
          <input type="checkbox" checked={incluirPrueba} onChange={(e) => setIncluirPrueba(e.target.checked)} /> Incluir candidatos de prueba
        </label>
        <button className={boton} disabled={ocupado || !labId} onClick={ver}><FileText className="h-4 w-4" /> Vista previa</button>
        {puedeEnviar && (
          <>
            <button className={boton} disabled={ocupado || !labId} onClick={() => enviar(true)}>Simular envío</button>
            <button className={botonPrimario} disabled={ocupado || !labId} onClick={() => confirm("¿Enviar la orden al laboratorio? Los candidatos de prueba no se envían.") && enviar(false)}>
              <Send className="h-4 w-4" /> Enviar
            </button>
          </>
        )}
      </div>
      {aviso && <Mensaje {...aviso} />}
      {vista && <VistaPrevia v={vista} />}
    </Seccion>
  );
}

// ── Simulador ───────────────────────────────────────────────────────────────

function SimuladorAspirante({ labs }: { labs: Laboratorio[] }) {
  const [procesos, setProcesos] = useState<ProcesoSimulador[]>([]);
  const [procesoId, setProcesoId] = useState("");
  const [docs, setDocs] = useState<DocumentoDescarga[]>([]);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const cargar = useCallback(() => procesosEnExamenesAccion().then(setProcesos).catch(() => setProcesos([])), []);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  const p = procesos.find((x) => x.id === procesoId);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text-primary">Documentos al aspirante</p>
      <p className="text-xs text-text-tertiary">
        Aspirantes en exámenes (los del chat de prueba llegan aquí cuando el profesor aprueba la prueba de manejo en «Probar el asistente»). Genera la orden y la carta del banco con sus datos.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <select className={`${campo} max-w-sm`} value={procesoId} onChange={(e) => { setProcesoId(e.target.value); setDocs([]); setAviso(null); }}>
          <option value="">Elija el aspirante</option>
          {procesos.map((x) => (
            <option key={x.id} value={x.id}>{x.nombre} · {x.cedula} · {x.estado === "en_examenes" ? "fase 1" : "fase 2"}{x.prueba ? " · prueba" : ""}</option>
          ))}
        </select>
        <button className={boton} onClick={() => void cargar()}>Actualizar</button>
      </div>
      {p && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-text-secondary">
            Laboratorio
            <select
              className={campo}
              value={p.laboratorioId ?? ""}
              onChange={(e) =>
                enTransicion(async () => {
                  const r = await asignarLaboratorioAccion(p.id, e.target.value || null);
                  setAviso(r.ok ? { ok: true, texto: "Laboratorio guardado." } : { ok: false, texto: r.error });
                  await cargar();
                })
              }
            >
              <option value="">El predeterminado</option>
              {labs.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          </label>
          <button
            className={boton}
            disabled={ocupado}
            onClick={() =>
              enTransicion(async () => {
                const r = await documentosAspiranteAccion(p.id);
                if (!r.ok) return setAviso({ ok: false, texto: r.error });
                setDocs(r.documentos);
                const faltan = r.documentos.flatMap((d) => d.faltan);
                setAviso({ ok: r.avisos.length === 0, texto: [...r.avisos, ...(faltan.length ? [`Marcas sin dato: ${[...new Set(faltan)].join(", ")}`] : []), r.documentos.length ? "Documentos generados." : ""].filter(Boolean).join(" ") });
              })
            }
          >
            <FileText className="h-4 w-4" /> Generar documentos
          </button>
          <button
            className={boton}
            disabled={ocupado}
            onClick={() =>
              enTransicion(async () => {
                const r = await enviarDocumentosAccion(p.id, true);
                setAviso(r.ok ? { ok: true, texto: `Simulación del envío por WhatsApp: ${r.documentos.join(" y ") || "sin documentos"}. ${r.avisos.join(" ")}` } : { ok: false, texto: r.error });
              })
            }
          >
            <MessageCircle className="h-4 w-4" /> Simular envío al aspirante
          </button>
          {p.candidateId && <Link href={`/candidatos/${p.candidateId}`} className="pb-2 text-xs text-primary hover:underline">Ver la ficha</Link>}
        </div>
      )}
      {aviso && <Mensaje {...aviso} />}
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {docs.map((d) => (
            <button key={d.nombre} className={boton} onClick={() => descargar(d)}>
              <Download className="h-4 w-4" /> {d.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SimuladorRespuesta({ labs }: { labs: Laboratorio[] }) {
  const [labId, setLabId] = useState(labs[0]?.id ?? "");
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lecturas, setLecturas] = useState<LecturaLaboratorio[] | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text-primary">Respuesta del laboratorio</p>
      <p className="text-xs text-text-tertiary">
        Escriba lo que mandaría el laboratorio (por ejemplo, «NIXON LEAL CC 13175742 puede continuar a segunda fase» o «aplazado por hemograma») y, si quiere, adjunte el PDF o la foto. Pasa por la misma lectura que un WhatsApp real y queda en «Avisos del laboratorio» de la Agenda para confirmarlo.
      </p>
      <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
        <select className={campo} value={labId} onChange={(e) => setLabId(e.target.value)}>
          {labs.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
        <textarea className={`${campo} min-h-[70px]`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensaje del laboratorio" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-xs" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
        <button
          className={botonPrimario}
          disabled={ocupado || (!texto.trim() && !archivo)}
          onClick={() =>
            enTransicion(async () => {
              const fd = new FormData();
              fd.set("texto", texto);
              if (archivo) fd.set("archivo", archivo);
              const r = await simularRespuestaLaboratorioAccion(labId, fd);
              if (!r.ok) return setAviso({ ok: false, texto: r.error });
              setLecturas(r.lecturas);
              const solos = r.confirmados?.length ?? 0;
              setAviso({
                ok: true,
                texto: solos
                  ? `Traía la frase acordada: ${solos} resultado${solos === 1 ? "" : "s"} quedó registrado sin confirmar.${r.avisos > solos ? ` Los demás quedan en la Agenda para confirmar.` : ""}`
                  : r.avisos
                    ? `Quedó${r.avisos === 1 ? "" : "aron"} ${r.avisos} aviso${r.avisos === 1 ? "" : "s"} para confirmar en la Agenda.`
                    : "No se leyó ningún resultado (un saludo o una pregunta no deja aviso).",
              });
            })
          }
        >
          Simular llegada
        </button>
        <Link href="/candidatos?vista=agenda" className="text-xs text-primary hover:underline">Ir a la Agenda</Link>
      </div>
      {aviso && <Mensaje {...aviso} />}
      {lecturas && lecturas.length > 0 && (
        <ul className="rounded-lg bg-slate-50 p-2 text-xs text-text-secondary">
          {lecturas.map((l, i) => (
            <li key={i}>
              {l.nombre ?? "Sin nombre"} · CC {l.cedula ?? "—"} · fase {l.fase ?? "—"} · {l.resultado ?? "sin resultado"}
              {l.observacion ? ` · ${l.observacion}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Reparto ─────────────────────────────────────────────────────────────────

function Reparto({ modo, puedeEditar, onCambio }: { modo: ModoReparto; puedeEditar: boolean; onCambio: () => void }) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-slate-50 p-3 text-sm">
      <label className="text-xs text-text-secondary">
        Cómo se reparten los aspirantes al citarlos a la fase 1
        <select
          className={`${campo} mt-1 max-w-md`}
          value={modo}
          disabled={!puedeEditar || ocupado}
          onChange={(e) =>
            enTransicion(async () => {
              const r = await guardarRepartoAccion(e.target.value as ModoReparto);
              setAviso(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.error });
              if (r.ok) onCambio();
            })
          }
        >
          <option value="predeterminado">Siempre al predeterminado</option>
          <option value="porcentaje">Por porcentaje entre los laboratorios</option>
        </select>
      </label>
      <p className="mt-1 text-xs text-text-tertiary">
        Nunca se cita a un laboratorio un día que no atiende: si ese día no atiende ninguno, la cita pasa al siguiente día que alguno atienda. Los días
        preferidos mandan sobre el reparto (por ejemplo, Rescate los sábados porque entrega más rápido). La fase 2 va al mismo laboratorio, en un día que atienda.
        Los aspirantes de prueba (chat de prueba) no siguen el reparto: van uno a cada laboratorio, por turnos.
      </p>
      {aviso && <Mensaje {...aviso} />}
    </div>
  );
}

/** Laboratorio que se le propone al profesor cuando elige la fecha y la hora de la fase 1 (27-nov-2026). */
function LaboratorioFechaProfesor({ valor, labs, puedeEditar, onCambio }: { valor: string | null; labs: Laboratorio[]; puedeEditar: boolean; onCambio: () => void }) {
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-slate-50 p-3 text-sm">
      <label className="text-xs text-text-secondary">
        Cuando el profesor elige la fecha y la hora de exámenes, proponer
        <select
          className={`${campo} mt-1 max-w-md`}
          value={valor ?? ""}
          disabled={!puedeEditar || ocupado}
          onChange={(e) =>
            enTransicion(async () => {
              const r = await guardarLaboratorioFechaProfesorAccion(e.target.value || null);
              setAviso(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.error });
              if (r.ok) onCambio();
            })
          }
        >
          <option value="">El que diga el reparto</option>
          {labs
            .filter((l) => l.activo)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
        </select>
      </label>
      <p className="mt-1 text-xs text-text-tertiary">
        En «Listo para exámenes» el profesor puede tocar «Elegir otra fecha y hora» (nunca antes de ese momento; puede ser el mismo día) y el laboratorio. Este es el que le sale
        marcado; él puede cambiarlo. La orden le sale a ese laboratorio enseguida.
      </p>
      {aviso && <Mensaje {...aviso} />}
    </div>
  );
}

function SimuladorReparto() {
  const [fecha, setFecha] = useState(hoyBogota());
  const [r, setR] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text-primary">¿A qué laboratorio iría?</p>
      <p className="text-xs text-text-tertiary">Elija el día en que le tocaría la fase 1 (el siguiente día hábil después de aprobar la prueba de manejo). No asigna nada.</p>
      <div className="flex flex-wrap items-end gap-2">
        <input type="date" className={`${campo} max-w-[180px]`} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <button
          className={boton}
          disabled={ocupado}
          onClick={() =>
            enTransicion(async () => {
              const x = await simularRepartoAccion(fecha);
              setR(x.ok ? { ok: Boolean(x.laboratorio), texto: `${x.laboratorio ?? "Ninguno"} · ${x.motivo}` } : { ok: false, texto: x.error });
            })
          }
        >
          Ver
        </button>
      </div>
      {r && <Mensaje {...r} />}
    </div>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────

export default function Laboratorios() {
  const [datos, setDatos] = useState<PantallaLaboratorios | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [version, setVersion] = useState(0);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => {
    datosLaboratorios()
      .then((r) => (r.ok ? setDatos(r) : setError(r.error)))
      .catch((e: Error) => setError(e.message));
  }, [version]);
  const refrescar = useCallback(() => {
    setNuevo(false);
    setVersion((v) => v + 1);
  }, []);
  const labs = useMemo(() => datos?.laboratorios ?? [], [datos]);

  if (error) return <p className="mt-4 text-sm text-red-600">{error}</p>;
  if (!datos) return <p className="mt-4 text-sm text-text-tertiary">Cargando…</p>;
  if (!labs.length && !nuevo)
    return (
      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Falta aplicar la migración <code>20261121194842_seleccion_laboratorios_ordenes_y_aplazado.sql</code>.
      </p>
    );

  return (
    <div className="mt-4 gap-4 xl:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
      <Seccion titulo="Laboratorios" ayuda="A dónde van los aspirantes a los exámenes de ingreso y por dónde se le manda la orden a cada laboratorio. Lo que escriba un laboratorio desde su WhatsApp se lee como resultados.">
        <Reparto modo={datos.reparto} puedeEditar={datos.puedeEditar} onCambio={refrescar} />
        <LaboratorioFechaProfesor valor={datos.laboratorioFechaProfesor} labs={labs} puedeEditar={datos.puedeEditar} onCambio={refrescar} />
        {labs.map((l) => (
          <TarjetaLaboratorio key={`${l.id}:${version}`} lab={l} marcas={datos.plantillas.ordenes[l.id]} smtp={datos.smtp} puedeEditar={datos.puedeEditar} onCambio={refrescar} reparto={datos.reparto} asignados={datos.asignados[l.id] ?? 0} />
        ))}
        {nuevo && <TarjetaLaboratorio lab={null} marcas={null} smtp={datos.smtp} puedeEditar={datos.puedeEditar} onCambio={refrescar} reparto={datos.reparto} asignados={0} />}
        {datos.puedeEditar && !nuevo && (
          <button className={boton} onClick={() => setNuevo(true)}><Plus className="h-4 w-4" /> Agregar laboratorio</button>
        )}
      </Seccion>

      <Seccion titulo="Carta del banco" ayuda="Se le envía al aspirante por WhatsApp cuando responde que no tiene cuenta de ahorros en el Banco de Bogotá (lo pregunta el mensaje de la fase 1), para que la imprima; si ya tiene cuenta, se le pide el certificado bancario. Escriba en el Word las marcas {nombre}, {cedula}, {cargo} y {fecha_larga}, guárdelo como PDF y súbalo: la carta sale en PDF con el mismo diseño. También se acepta el Word.">
        <div className="flex flex-wrap items-center gap-2">
          <SubirWord
            etiqueta="Subir carta (PDF o Word)"
            aceptaPdf
            disabled={!datos.puedeEditar}
            onSubir={async (fd) => {
              const r = await subirPlantillaCartaAccion(fd);
              setAviso(r.ok ? { ok: true, texto: `Carta subida. Marcas: ${r.marcas.join(", ")}` } : { ok: false, texto: r.error });
              if (r.ok) refrescar();
            }}
          />
          <Marcas marcas={datos.plantillas.carta} />
        </div>
        {aviso && <Mensaje {...aviso} />}
        <FirmaCarta puedeEditar={datos.puedeEditar} />
      </Seccion>

      <OrdenDelDia labs={labs} puedeEnviar={datos.puedeEnviar} />

      <Seccion titulo="Simulador" ayuda="Para probar sin que salga nada por WhatsApp ni por correo.">
        <SimuladorReparto />
        <hr className="border-[#F1F5F9]" />
        <SimuladorAspirante labs={labs} />
        <hr className="border-[#F1F5F9]" />
        <SimuladorRespuesta labs={labs} />
      </Seccion>
    </div>
  );
}

// ── Firma de la carta del banco (24-nov-2026) ──────────────────────────────

/**
 * Quién firma la carta (nombre y cargo) y las imágenes de la firma y el sello.
 * Sin marcas en la plantilla, Gestivo cambia el nombre y el cargo que están
 * debajo de «Atentamente» y pone la firma y el sello en el espacio de arriba.
 */
function FirmaCarta({ puedeEditar }: { puedeEditar: boolean }) {
  const [d, setD] = useState<{ nombre: string; cargo: string; firma: string | null; sello: string | null } | null>(null);
  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, enTransicion] = useTransition();
  const cargar = useCallback(() => {
    datosFirmaCartaAccion()
      .then((r) => {
        if (!r.ok) return setAviso({ ok: false, texto: r.error });
        setD(r);
        setNombre(r.nombre);
        setCargo(r.cargo);
      })
      .catch(() => undefined);
  }, []);
  useEffect(cargar, [cargar]);
  if (!d) return null;
  const subir = (tipo: "firma" | "sello", fd: FormData) =>
    enTransicion(async () => {
      const r = await subirImagenCartaAccion(tipo, fd);
      setAviso(r.ok ? { ok: true, texto: tipo === "firma" ? "Firma guardada." : "Sello guardado." } : { ok: false, texto: r.error });
      cargar();
    });
  const quitar = (tipo: "firma" | "sello") =>
    enTransicion(async () => {
      const r = await quitarImagenCartaAccion(tipo);
      setAviso(r.ok ? { ok: true, texto: "Imagen quitada." } : { ok: false, texto: r.error });
      cargar();
    });
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
      <p className="text-sm font-medium text-text-primary">Quién firma la carta</p>
      <p className="text-[11px] text-text-tertiary">
        Se cambia el nombre y el cargo que están debajo de «Atentamente» en la plantilla, y la firma y el sello van en el espacio de arriba. Si prefiere ubicarlos usted, escriba en el
        Word las marcas {"{firmante}"}, {"{firmante_cargo}"}, {"{firma}"} y {"{sello}"}. La firma y el sello van mejor en PNG con fondo transparente. Vacío: queda lo de la plantilla.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-text-secondary">
          Nombre de quien firma
          <input className={campo} value={nombre} disabled={!puedeEditar} placeholder="Como está en la plantilla" onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="text-xs text-text-secondary">
          Cargo
          <input className={campo} value={cargo} disabled={!puedeEditar} placeholder="Auxiliar de Gestión Humana" onChange={(e) => setCargo(e.target.value)} />
        </label>
      </div>
      {puedeEditar && (
        <button
          type="button"
          className={botonPrimario}
          disabled={ocupado || (nombre === d.nombre && cargo === d.cargo)}
          onClick={() =>
            enTransicion(async () => {
              const r = await guardarFirmanteAccion(nombre, cargo);
              setAviso(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.error });
              cargar();
            })
          }
        >
          Guardar quien firma
        </button>
      )}
      <div className="flex flex-wrap gap-3">
        <ImagenCarta tipo="firma" url={d.firma} puedeEditar={puedeEditar} ocupado={ocupado} onSubir={subir} onQuitar={quitar} />
        <ImagenCarta tipo="sello" url={d.sello} puedeEditar={puedeEditar} ocupado={ocupado} onSubir={subir} onQuitar={quitar} />
      </div>
      {aviso && <Mensaje {...aviso} />}
    </div>
  );
}

/** La firma o el sello de la carta: vista previa, subir y quitar. */
function ImagenCarta({
  tipo,
  url,
  puedeEditar,
  ocupado,
  onSubir,
  onQuitar,
}: {
  tipo: "firma" | "sello";
  url: string | null;
  puedeEditar: boolean;
  ocupado: boolean;
  onSubir: (tipo: "firma" | "sello", fd: FormData) => void;
  onQuitar: (tipo: "firma" | "sello") => void;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5 rounded-lg border border-[#E2E8F0] p-2">
      <span className="text-xs font-medium text-text-secondary">{tipo === "firma" ? "Firma" : "Sello de la empresa"}</span>
      <div className="flex h-20 w-40 items-center justify-center rounded bg-slate-50">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={tipo === "firma" ? "Firma" : "Sello"} className="max-h-20 max-w-40 object-contain" />
        ) : (
          <span className="text-[11px] text-text-tertiary">Sin imagen</span>
        )}
      </div>
      {puedeEditar && (
        <div className="flex items-center gap-2">
          <label className={`${boton} cursor-pointer px-2 py-1 text-xs ${ocupado ? "pointer-events-none opacity-50" : ""}`}>
            <Upload className="h-3.5 w-3.5" /> {url ? "Cambiar" : "Subir"}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const fd = new FormData();
                fd.set("archivo", f);
                onSubir(tipo, fd);
              }}
            />
          </label>
          {url && (
            <button type="button" disabled={ocupado} className="text-xs text-text-tertiary underline" onClick={() => onQuitar(tipo)}>
              Quitar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
