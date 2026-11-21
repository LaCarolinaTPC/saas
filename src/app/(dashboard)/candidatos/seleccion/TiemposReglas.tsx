"use client";

/**
 * Pestaña «Tiempos y reglas» de la selección: los ajustes agrupados por etapa
 * del proceso (src/lib/seleccion/secciones-ajustes.ts), con un índice para
 * saltar entre secciones, y arriba la conversación por WhatsApp: horario de
 * los mensajes automáticos y el recordatorio a quien deja de responder.
 */
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { gastoSeleccion } from "../entrega3-actions";
import type { GastoDelMes } from "@/lib/seleccion/consumos-servidor";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, ChevronRight, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { OPCIONES_AJUSTE, mostrarValor, type AjusteSeleccion } from "@/lib/seleccion/ajustes";
import { agruparAjustes, type FilaPresentada } from "@/lib/seleccion/secciones-ajustes";
import { MAX_RECORDATORIOS_TOPE, mensajeDelRecordatorio, textoRecordatorio, type ConfigSeguimiento } from "@/lib/comunicaciones/seguimiento";
import { guardarAjuste, guardarSeguimientoSeleccion, restaurarAjuste } from "./actions";
import { AvisoLinea, Historial, campo, fechaHora, type Aviso } from "./comunes";

export interface SeguimientoPantalla {
  disponible: boolean;
  config: ConfigSeguimiento;
  /** Segundos que espera el asistente antes de responder (Comunicaciones › Agente de IA). */
  esperaAgente: number;
}

/** Clase de los campos cortos: la base sin el ancho completo. */
const campoCorto = campo.replace("w-full ", "");

const LICENCIAS = ["A1", "A2", "B1", "B2", "B3", "C1", "C2", "C3"];

/** Valor del ajuste como texto del campo. */
function aTexto(a: AjusteSeleccion, v: unknown): string {
  if (a.unidad === "lista" && Array.isArray(v)) return v.join(", ");
  if (a.unidad === "pesos" && v !== "" && v != null && Number.isFinite(Number(v))) return Number(v).toLocaleString("es-CO");
  return String(v ?? "");
}

const mismo = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

function Interruptor({ activo, onChange, disabled, etiqueta }: { activo: boolean; onChange: (v: boolean) => void; disabled?: boolean; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onChange(!activo)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${activo ? "bg-primary" : "bg-slate-300"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${activo ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

/** Campo numérico corto con su unidad al lado («24 horas», «$ 3.000.000»). */
function CampoNumero({ valor, onChange, sufijo, prefijo, disabled, etiqueta, onEnter }: {
  valor: string;
  onChange: (v: string) => void;
  sufijo?: string;
  prefijo?: string;
  disabled?: boolean;
  etiqueta: string;
  onEnter?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {prefijo && <span className="text-sm text-text-tertiary">{prefijo}</span>}
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        disabled={disabled}
        inputMode="decimal"
        aria-label={etiqueta}
        className={`${campoCorto} ${prefijo ? "w-36" : "w-20"} text-right tabular-nums`}
      />
      {sufijo && <span className="w-12 text-xs text-text-tertiary">{sufijo}</span>}
    </span>
  );
}

function FilaAjuste({ fila, puedeEditar }: { fila: FilaPresentada; puedeEditar: boolean }) {
  const { ajuste: a, etiqueta, ayuda, sufijo } = fila;
  const router = useRouter();
  const inicial = aTexto(a, a.valor);
  const [valor, setValor] = useState(inicial);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendiente, start] = useTransition();
  const esSugerido = mismo(a.valor, a.valor_sugerido);
  const cambiado = valor !== inicial;
  const ancho = a.unidad === "texto" || (a.unidad === "lista" && a.clave !== "licencias");

  const correr = (fn: () => Promise<{ ok: boolean; error?: string }>, alSalir?: () => void, alFallar?: () => void) =>
    start(async () => {
      setAviso(null);
      try {
        const r = await fn();
        if (r.ok) {
          setAviso({ ok: true, texto: "Guardado." });
          alSalir?.();
          router.refresh();
        } else {
          setAviso({ ok: false, texto: r.error ?? "No se pudo guardar." });
          alFallar?.();
        }
      } catch (e) {
        setAviso({ ok: false, texto: e instanceof Error ? e.message : "Error." });
        alFallar?.();
      }
    });
  const guardar = (v: string = valor) => correr(() => guardarAjuste(a.clave, v));

  let control: ReactNode;
  if (a.unidad === "si_no") {
    const activo = valor === "true";
    control = (
      <Interruptor
        activo={activo}
        etiqueta={etiqueta}
        disabled={!puedeEditar || pendiente}
        onChange={(v) => {
          setValor(String(v));
          // El interruptor se guarda al tocarlo: no hay nada más que escribir.
          correr(() => guardarAjuste(a.clave, v), undefined, () => setValor(inicial));
        }}
      />
    );
  } else if (a.unidad === "opcion") {
    control = (
      <select
        value={valor}
        disabled={!puedeEditar || pendiente}
        aria-label={etiqueta}
        onChange={(e) => {
          const v = e.target.value;
          setValor(v);
          // Como el interruptor: elegir es guardar.
          correr(() => guardarAjuste(a.clave, v), undefined, () => setValor(inicial));
        }}
        className={`${campoCorto} w-56`}
      >
        {Object.entries(OPCIONES_AJUSTE[a.clave] ?? {}).map(([id, texto]) => (
          <option key={id} value={id}>
            {texto}
          </option>
        ))}
      </select>
    );
  } else if (a.clave === "licencias") {
    const elegidas = valor.split(/[,\s]+/).filter(Boolean);
    control = (
      <div className="flex flex-wrap justify-end gap-1">
        {LICENCIAS.map((l) => {
          const on = elegidas.includes(l);
          return (
            <button
              key={l}
              type="button"
              disabled={!puedeEditar || pendiente}
              aria-pressed={on}
              onClick={() => setValor(LICENCIAS.filter((x) => (x === l ? !on : elegidas.includes(x))).join(", "))}
              className={`rounded-lg border px-2 py-1 text-xs font-medium disabled:opacity-60 ${on ? "border-primary bg-primary text-white" : "border-border bg-white text-text-secondary hover:bg-slate-50"}`}
            >
              {l}
            </button>
          );
        })}
      </div>
    );
  } else if (a.unidad === "hora") {
    control = (
      <input
        type="time"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        disabled={!puedeEditar}
        aria-label={etiqueta}
        className={`${campoCorto} w-32`}
      />
    );
  } else if (ancho) {
    control = (
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && cambiado && guardar()}
        disabled={!puedeEditar}
        aria-label={etiqueta}
        className={campo}
      />
    );
  } else {
    control = (
      <CampoNumero
        valor={valor}
        onChange={setValor}
        sufijo={a.unidad === "pesos" ? undefined : sufijo}
        prefijo={a.unidad === "pesos" ? "$" : undefined}
        disabled={!puedeEditar}
        etiqueta={etiqueta}
        onEnter={() => cambiado && guardar()}
      />
    );
  }

  const botones = puedeEditar && a.unidad !== "si_no" && a.unidad !== "opcion" && cambiado && (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => guardar()}
        className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
      >
        {pendiente && <Loader2 className="h-3 w-3 animate-spin" />} Guardar
      </button>
      <button type="button" disabled={pendiente} onClick={() => setValor(inicial)} className="text-xs text-text-tertiary hover:text-text-primary">
        Cancelar
      </button>
    </span>
  );

  return (
    <div className={`border-b border-border py-3 last:border-0 ${ancho ? "space-y-2" : "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"}`}>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm text-text-primary">
          {etiqueta}
          {!esSugerido && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Ajustado</span>}
          {a.entrega > 2 && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-text-tertiary">desde la entrega {a.entrega}</span>}
        </p>
        {ayuda && <p className="text-xs text-text-tertiary">{ayuda}</p>}
        {(!esSugerido || a.actualizado_por) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
            {!esSugerido && (
              <span className="inline-flex items-center gap-1">
                Sugerido: {mostrarValor(a.unidad, a.valor_sugerido)}
                {puedeEditar && (
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => correr(() => restaurarAjuste(a.clave), () => setValor(aTexto(a, a.valor_sugerido)))}
                    className="inline-flex items-center gap-0.5 text-primary hover:underline disabled:opacity-50"
                  >
                    <RotateCcw className="h-3 w-3" /> usarlo
                  </button>
                )}
              </span>
            )}
            {a.actualizado_por && <span>Cambiado por {a.actualizado_por}, {fechaHora(a.updated_at)}</span>}
            {a.actualizado_por && <Historial tipo="ajuste" clave={a.clave} unidad={a.unidad} />}
          </div>
        )}
        <AvisoLinea aviso={aviso} />
      </div>
      <div className={`flex flex-wrap items-center gap-2 ${ancho ? "" : "sm:justify-end"}`}>
        {control}
        {botones}
      </div>
    </div>
  );
}

function Tarjeta({ id, titulo, detalle, children, icono }: { id: string; titulo: string; detalle: string; children: ReactNode; icono?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-2xl border border-border bg-surface-raised p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        {icono}
        {titulo}
      </h2>
      <p className="mb-1 mt-0.5 text-xs text-text-tertiary">{detalle}</p>
      {children}
    </section>
  );
}

const CONCEPTO_GASTO: Record<string, string> = { asistente: "Asistente", extraccion: "Lectura del chat", lectura: "Lectura de documentos", transcripcion: "Audios", antecedentes: "Croma", laboratorio: "Laboratorio", whatsapp: "WhatsApp" };

/** Gasto del mes frente al tope (entrega 3, NF1): aviso al 80 %, se detiene lo automático al 100 %. */
function GastoDelMesLinea() {
  const [g, setG] = useState<GastoDelMes | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    gastoSeleccion()
      .then((r) => vivo && setG(r))
      .catch(() => vivo && setG(null));
    return () => {
      vivo = false;
    };
  }, []);
  if (g === undefined) return null;
  if (g === null) return <p className="mt-2 text-xs text-text-tertiary">El gasto se empieza a medir cuando se aplique la migración de la entrega 3.</p>;
  const color = g.nivel === "alcanzado" ? "bg-red-50 text-red-800" : g.nivel === "aviso" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-text-secondary";
  const detalle = Object.entries(g.porConcepto)
    .map(([k, v]) => `${CONCEPTO_GASTO[k] ?? k}: $${Math.round(v * g.trm).toLocaleString("es-CO")}`)
    .join(" · ");
  return (
    <div className={`mt-2 rounded-xl px-3 py-2 text-xs ${color}`}>
      <p className="font-medium">
        Gasto de este mes: ${g.gastoCop.toLocaleString("es-CO")}
        {g.topeCop > 0 ? ` de $${g.topeCop.toLocaleString("es-CO")} (${String(g.porcentaje).replace(".", ",")} %)` : " (sin tope)"}
        {g.nivel === "alcanzado" ? " · tope alcanzado: el asistente y los envíos automáticos están detenidos" : g.nivel === "aviso" ? " · pasó el 80 % del tope" : ""}
      </p>
      {detalle && <p className="mt-0.5 opacity-80">{detalle}</p>}
      <p className="mt-0.5 opacity-80">Consultas a Croma este mes: {g.consultasCroma.toLocaleString("es-CO")}.</p>
    </div>
  );
}

/** Pasos del recordatorio en una línea: lo que va a pasar con estos tiempos. */
function LineaRecordatorio({ c }: { c: ConfigSeguimiento }) {
  const horas = (h: number) => `${String(h).replace(".", ",")} h`;
  const veces = Math.min(Math.max(Math.round(c.maxRecordatorios) || 1, 1), MAX_RECORDATORIOS_TOPE);
  const pasos: ReactNode[] = [<span key="i">Último mensaje nuestro</span>];
  for (let i = 1; i <= veces; i++) {
    pasos.push(<span key={`e${i}`} className="text-text-tertiary">{horas(c.horasEspera)}</span>);
    pasos.push(<span key={`r${i}`} className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">Recordatorio {veces > 1 ? i : ""}</span>);
  }
  if (c.horasEscalar > 0) {
    pasos.push(<span key="eg" className="text-text-tertiary">{horas(c.horasEscalar)}</span>);
    pasos.push(<span key="gh" className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">Pasa a una persona</span>);
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-text-secondary">
      {pasos.flatMap((p, i) => (i === 0 ? [p] : [<ChevronRight key={`s${i}`} className="h-3 w-3 text-text-muted" />, p]))}
    </div>
  );
}

/** Horario de los mensajes automáticos y recordatorio a quien deja de responder (wa_seguimiento). */
function Conversacion({ seguimiento, puedeEditar }: { seguimiento: SeguimientoPantalla; puedeEditar: boolean }) {
  const router = useRouter();
  const textos = (c: ConfigSeguimiento) => ({
    horasEspera: String(c.horasEspera).replace(".", ","),
    maxRecordatorios: String(c.maxRecordatorios),
    horasEscalar: String(c.horasEscalar),
  });
  const [base, setBase] = useState<ConfigSeguimiento>(seguimiento.config);
  // Los números se editan como texto para poder escribir «1,5».
  const [nums, setNums] = useState(textos(seguimiento.config));
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendiente, start] = useTransition();
  const aNumero = (t: string) => (t.trim() === "" ? NaN : Number(t.replace(",", ".")));
  const f: ConfigSeguimiento = {
    ...base,
    horasEspera: aNumero(nums.horasEspera),
    maxRecordatorios: aNumero(nums.maxRecordatorios),
    horasEscalar: aNumero(nums.horasEscalar),
  };
  // Para la línea de pasos, con los valores guardados mientras el campo esté a medio escribir.
  const vista: ConfigSeguimiento = {
    ...f,
    horasEspera: Number.isFinite(f.horasEspera) ? f.horasEspera : seguimiento.config.horasEspera,
    maxRecordatorios: Number.isFinite(f.maxRecordatorios) ? f.maxRecordatorios : seguimiento.config.maxRecordatorios,
    horasEscalar: Number.isFinite(f.horasEscalar) ? f.horasEscalar : seguimiento.config.horasEscalar,
  };
  const set = <K extends keyof ConfigSeguimiento>(k: K, v: ConfigSeguimiento[K]) => setBase((x) => ({ ...x, [k]: v }));
  const cambiado = !mismo(f, seguimiento.config);
  const editable = puedeEditar && seguimiento.disponible;
  // Los recordatorios solo salen con la ventana de 24 h abierta (desde el último mensaje del aspirante).
  const seCierraVentana = vista.horasEspera * vista.maxRecordatorios >= 23;

  const guardar = () =>
    start(async () => {
      setAviso(null);
      try {
        const r = await guardarSeguimientoSeleccion(f);
        setAviso(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.error });
        if (r.ok) router.refresh();
      } catch (e) {
        setAviso({ ok: false, texto: e instanceof Error ? e.message : "Error." });
      }
    });

  const numero = (k: "horasEspera" | "maxRecordatorios" | "horasEscalar", etiqueta: string, sufijo: string) => (
    <CampoNumero
      valor={nums[k]}
      onChange={(v) => setNums((x) => ({ ...x, [k]: v }))}
      sufijo={sufijo}
      disabled={!editable}
      etiqueta={etiqueta}
    />
  );

  return (
    <Tarjeta
      id="conversacion"
      titulo="Conversación por WhatsApp"
      detalle="Cuándo escribe Gestivo por su cuenta y qué hace si el aspirante deja de responder. Es la misma configuración de Comunicaciones."
    >
      {!seguimiento.disponible && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Falta aplicar la migración <code>20261109221237_comunicaciones_seguimiento_a_quien_no_responde.sql</code>.
        </p>
      )}

      <div className="flex flex-col gap-2 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="text-sm text-text-primary">Horario de los mensajes automáticos</p>
          <p className="text-xs text-text-tertiary">Hora de Colombia. Lo usan el recordatorio y la reactivación; fuera de él esperan.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <input type="time" value={f.horaDesde} onChange={(e) => set("horaDesde", e.target.value)} disabled={!editable} aria-label="Desde" className={`${campoCorto} w-32`} />
          a
          <input type="time" value={f.horaHasta} onChange={(e) => set("horaHasta", e.target.value)} disabled={!editable} aria-label="Hasta" className={`${campoCorto} w-32`} />
        </div>
      </div>

      <div className="space-y-3 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <BellRing className="h-4 w-4 text-primary" /> Si deja de responder, preguntarle si sigue interesado
            </p>
            <p className="text-xs text-text-tertiary">
              Cuando el último mensaje es nuestro y le faltan datos o documentos. A quien ya se vio que no cumple un requisito no se le envía (su proceso se cierra solo). Solo dentro de la ventana de 24 h de WhatsApp; se revisa cada 15 minutos.
            </p>
          </div>
          <Interruptor activo={f.activo} onChange={(v) => set("activo", v)} disabled={!editable} etiqueta="Recordatorio activo" />
        </div>

        <div className={`space-y-2 ${f.activo ? "" : "opacity-50"}`}>
          <div className="grid gap-2 text-sm text-text-secondary sm:grid-cols-[1fr_auto] sm:items-center">
            <span>Primer recordatorio, y entre uno y otro</span>
            {numero("horasEspera", "Horas sin respuesta", "horas")}
            <span>Veces que se le pregunta</span>
            {numero("maxRecordatorios", "Veces", vista.maxRecordatorios === 1 ? "vez" : "veces")}
            <span>
              Si no responde a ninguno, pasar el chat a una persona después de
              <span className="block text-xs text-text-tertiary">0 = no pasarlo</span>
            </span>
            {numero("horasEscalar", "Horas para pasar a una persona", "horas")}
          </div>

          <LineaRecordatorio c={vista} />
          {seCierraVentana && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Con estos tiempos, los últimos recordatorios pueden no salir: WhatsApp solo deja escribirle hasta 24 horas después de su último mensaje.
            </p>
          )}

          <p className="text-xs text-text-tertiary">
            Cada recordatorio tiene su texto. Use {"{nombre}"} para el primer nombre. Uno vacío repite el anterior. No necesitan aprobación de Meta:
            salen dentro de la ventana de 24 horas.
          </p>
          {Array.from({ length: Math.min(Math.max(Math.round(vista.maxRecordatorios) || 1, 1), MAX_RECORDATORIOS_TOPE) }, (_, i) => {
            const valor = i === 0 ? f.mensaje : f.mensajesSiguientes[i - 1] ?? "";
            const cambiar = (t: string) =>
              i === 0
                ? set("mensaje", t)
                : set(
                    "mensajesSiguientes",
                    Array.from({ length: Math.max(f.mensajesSiguientes.length, i) }, (_, j) => (j === i - 1 ? t : f.mensajesSiguientes[j] ?? ""))
                  );
            return (
              <div key={i} className="grid gap-2 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-text-secondary">Recordatorio {i + 1}</span>
                  <textarea
                    value={valor}
                    onChange={(e) => cambiar(e.target.value)}
                    disabled={!editable}
                    maxLength={1000}
                    rows={Math.min(Math.max(valor.split(/\n/).length, 3), 10)}
                    placeholder={i === 0 ? "" : "Vacío: repite el anterior"}
                    className={`${campo} resize-y`}
                  />
                </label>
                <div className="whitespace-pre-line rounded-xl bg-[#E7FFDB] px-3 py-2 text-sm text-gray-800">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Así llega</p>
                  {textoRecordatorio(mensajeDelRecordatorio(f, i + 1), "CARLOS PÉREZ")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-xs text-text-tertiary">
          El asistente espera {seguimiento.esperaAgente} s antes de responder ·{" "}
          <Link href="/comunicaciones/agente" className="text-primary hover:underline">
            Agente de IA
          </Link>
        </p>
        {editable && (
          <div className="flex items-center gap-2">
            {cambiado && (
              <button
                type="button"
                disabled={pendiente}
                onClick={() => {
                  setBase(seguimiento.config);
                  setNums(textos(seguimiento.config));
                }}
                className="text-xs text-text-tertiary hover:text-text-primary"
              >
                Cancelar
              </button>
            )}
            <button
              type="button"
              disabled={!cambiado || pendiente}
              onClick={guardar}
              className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {pendiente && <Loader2 className="h-3 w-3 animate-spin" />} Guardar
            </button>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between gap-2">
        <AvisoLinea aviso={aviso} />
        <Historial tipo="ajuste" clave="seguimiento" />
      </div>
    </Tarjeta>
  );
}

export default function TiemposReglas({ ajustes, seguimiento, puedeEditar }: { ajustes: AjusteSeleccion[]; seguimiento: SeguimientoPantalla; puedeEditar: boolean }) {
  const secciones = agruparAjustes(ajustes);
  const indice = [
    { id: "conversacion", titulo: "Conversación por WhatsApp", ajustados: 0 },
    ...secciones.map((s) => ({ id: s.id, titulo: s.titulo, ajustados: s.filas.filter((f) => !mismo(f.ajuste.valor, f.ajuste.valor_sugerido)).length })),
  ];

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
      <nav aria-label="Secciones" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0">
        {indice.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs text-text-secondary hover:bg-slate-50 hover:text-text-primary lg:border-0 lg:bg-transparent"
          >
            {s.titulo}
            {s.ajustados > 0 && (
              <span title="Ajustes distintos del sugerido" className="rounded-full bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700">
                {s.ajustados}
              </span>
            )}
          </a>
        ))}
      </nav>

      <div className="min-w-0 space-y-4">
        <Conversacion seguimiento={seguimiento} puedeEditar={puedeEditar} />
        {secciones.map((s) => (
          <Tarjeta key={s.id} id={s.id} titulo={s.titulo} detalle={s.detalle}>
            {s.id === "costo" && <GastoDelMesLinea />}
            {s.filas.map((fila) => (
              <FilaAjuste key={`${fila.ajuste.clave}:${fila.ajuste.updated_at}`} fila={fila} puedeEditar={puedeEditar} />
            ))}
          </Tarjeta>
        ))}
      </div>
    </div>
  );
}
