"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  CAMPO_CORRECCION_LABEL, CONCEPTOS_LIQUIDACION, ESTADOS_CAJERO, registraPago, RESULTADO_REVISION_LABEL, tarifaDelDia,
  type CampoCorreccion, type ConceptoLiquidacion, type ResultadoCatalogo, type RolRecobros,
} from "@/lib/tesoreria/recobros";
import type { CorreccionVista, FilaBandeja } from "@/lib/tesoreria/recobros-vista";
import {
  cerrarLiquidacionRecobro, decidirCorreccionRecobro, decidirIncobrableRecobro, decidirSubgerenciaRecobro,
  marcarLiquidacionRecobro, reabrirIncobrableRecobro, registrarCargueOtroViaje, registrarGestionRecobro, solicitarCorreccionRecobro,
  solicitarIncobrableRecobro,
} from "./actions";

const nf = new Intl.NumberFormat("es-CO");
const pesos = (n: number | null | undefined) => (n == null ? "—" : `$${nf.format(n)}`);
const input = "w-full rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-sm";
const etiqueta = "flex flex-col gap-1 text-xs font-medium text-gray-600";
const entero = (s: string) => (s.trim() === "" ? null : Number(s));

type Respuesta = { ok: boolean; error?: string; mensaje?: string };

/** Corre una acción del servidor con su aviso y recarga los datos de la página. */
function useAccion() {
  const router = useRouter();
  const [ocupado, start] = useTransition();
  const correr = (fn: () => Promise<Respuesta>, alTerminar?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.mensaje ?? "Guardado.");
        alTerminar?.();
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo guardar.");
      }
    });
  return { ocupado, correr };
}

function Boton({ children, onClick, ocupado, tono = "primario", disabled }: {
  children: React.ReactNode; onClick: () => void; ocupado: boolean; tono?: "primario" | "peligro" | "suave"; disabled?: boolean;
}) {
  const cls = {
    primario: "bg-[#4F46E5] text-white hover:bg-[#4338CA]",
    peligro: "bg-red-600 text-white hover:bg-red-700",
    suave: "border border-[#E2E8F0] bg-white text-gray-700 hover:bg-[#F8FAFC]",
  }[tono];
  return (
    <button type="button" onClick={onClick} disabled={ocupado || disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${cls}`}>
      {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  );
}

function Bloque({ titulo, children, tono = "neutro" }: { titulo: string; children: React.ReactNode; tono?: "neutro" | "alerta" }) {
  return (
    <div className={`space-y-2 rounded-lg border p-3 ${tono === "alerta" ? "border-amber-200 bg-amber-50" : "border-[#E2E8F0] bg-white"}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</h3>
      {children}
    </div>
  );
}

/**
 * Lo que cada rol puede hacer sobre el recobro abierto. Las reglas son las
 * mismas del servidor (`motivoNoPermitido`); aquí solo deciden qué se muestra.
 */
export function AccionesRecobro({ f, acciones, catalogo, retirado, hoy }: {
  f: FilaBandeja; acciones: RolRecobros; catalogo: ResultadoCatalogo[]; retirado: boolean; hoy: string;
}) {
  const e = f.estado;
  const porCobrar = ESTADOS_CAJERO.has(e.estado);
  const pideCorreccion = (acciones.auxiliar || acciones.caja || acciones.directora || acciones.directorMantenimiento)
    && !["anulada", "liquidado", "solicitud_creada", "en_revision"].includes(e.estado);
  return (
    <div className="space-y-3">
      {retirado && porCobrar && (
        <p className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-900">
          El conductor figura como <strong>retirado</strong>: el saldo se descuenta en su liquidación definitiva.
          {acciones.directora ? " Páselo a liquidación definitiva abajo." : " La directora de Tesorería debe pasarlo a liquidación definitiva."}
        </p>
      )}
      {acciones.caja && porCobrar && e.estado !== "incobrable_por_autorizar" && f.gemaAbono == null && <CargueOtroViaje f={f} hoy={hoy} />}
      {acciones.caja && porCobrar && e.estado !== "incobrable_por_autorizar" && <GestionDeHoy f={f} catalogo={catalogo} hoy={hoy} />}
      {acciones.operativo && e.estado === "plazo_vencido" && <InstruccionOperativo f={f} />}
      {acciones.subgerencia && e.estado === "decide_subgerencia" && <DecisionSubgerencia f={f} />}
      {acciones.caja && porCobrar && e.estado !== "incobrable_por_autorizar" && <SolicitarIncobrable f={f} />}
      {acciones.directora && e.estado === "incobrable_por_autorizar" && <RegistrarIncobrable f={f} hoy={hoy} />}
      {acciones.directora && e.estado === "cerrado_sin_cobro" && e.motivoCierre === "incobrable" && <ReabrirIncobrable f={f} />}
      {acciones.directora && porCobrar && <MarcarLiquidacion f={f} retirado={retirado} />}
      {acciones.directora && e.estado === "para_liquidacion" && <CerrarLiquidacion f={f} />}
      <Correcciones f={f} valida={acciones.directorMantenimiento} pide={pideCorreccion} />
    </div>
  );
}

// ── Caja ─────────────────────────────────────────────────────────────────────

function GestionDeHoy({ f, catalogo, hoy }: { f: FilaBandeja; catalogo: ResultadoCatalogo[]; hoy: string }) {
  const { ocupado, correr } = useAccion();
  // Sin «Pagó completo» ni «Abono parcial»: el recaudo se hace solo en GEMA.
  const opciones = catalogo.filter((c) => c.activo && c.registra === "caja" && !registraPago(c));
  const [resultado, setResultado] = useState("");
  const [compromiso, setCompromiso] = useState("");
  const [autorizo, setAutorizo] = useState("");
  const [obs, setObs] = useState("");
  const def = opciones.find((c) => c.clave === resultado);
  const yaHoy = f.gestiones.some((g) => g.fecha === hoy);
  const limpiar = () => { setResultado(""); setCompromiso(""); setAutorizo(""); setObs(""); };
  return (
    <Bloque titulo="Registrar gestión de hoy" tono={yaHoy ? "neutro" : "alerta"}>
      <p className="text-xs text-gray-600">
        Saldo {pesos(f.saldo)}{f.estado.plazoHasta ? ` · plazo de pago ${f.estado.plazoHasta}` : ""}
        {yaHoy ? " · ya tiene gestión hoy" : " · sin gestión hoy"}
      </p>
      <p className="text-xs text-gray-500">
        El recaudo se hace en GEMA: cuando allá se gestiona el abono, el recobro se cierra solo aquí (en máximo 15 minutos).
      </p>
      <select
        value={resultado}
        onChange={(ev) => setResultado(ev.target.value)}
        className={input}
        aria-label="Resultado de la gestión"
      >
        <option value="">Resultado de la gestión…</option>
        {opciones.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
      </select>
      {resultado === "no_vino" && f.viajesDelDia?.[hoy] != null && (
        <p className={`text-xs ${f.viajesDelDia[hoy] > 0 ? "font-medium text-amber-800" : "text-gray-600"}`}>
          {f.viajesDelDia[hoy] > 0
            ? `En GEMA el conductor ya tiene ${f.viajesDelDia[hoy]} ${f.viajesDelDia[hoy] === 1 ? "viaje" : "viajes"} hoy: sí vino a trabajar.`
            : "En GEMA el conductor no tiene viajes hoy, hasta ahora."}
        </p>
      )}
      {def?.exigeCompromiso && (
        <label className={etiqueta}>{def.clave === "acuerdo_operativo" ? "Nueva fecha de pago autorizada" : "Fecha de compromiso de pago"}
          <input type="date" value={compromiso} min={hoy} onChange={(ev) => setCompromiso(ev.target.value)} className={input} />
        </label>
      )}
      {def?.exigeAutorizadoPor && (
        <label className={etiqueta}>Quién autorizó en Operativo
          <input value={autorizo} onChange={(ev) => setAutorizo(ev.target.value)} maxLength={120} className={input} />
        </label>
      )}
      <textarea value={obs} onChange={(ev) => setObs(ev.target.value)} maxLength={500} rows={2} className={input}
        placeholder={def?.exigeObservacion === false ? "Observación (opcional)" : "Observación (obligatoria)"} />
      <Boton ocupado={ocupado} disabled={!resultado} onClick={() => correr(() => registrarGestionRecobro(f.id, {
        resultado, compromisoFecha: compromiso || null, autorizadoPor: autorizo || null, observacion: obs || null,
      }), limpiar)}>Guardar gestión</Boton>
    </Bloque>
  );
}

/**
 * Sin abono en GEMA (reporte de cartulina): el recobro se cobra cargándolo a
 * otro viaje en un día posterior. El cajero registra la fecha y el viaje.
 */
function CargueOtroViaje({ f, hoy }: { f: FilaBandeja; hoy: string }) {
  const { ocupado, correr } = useAccion();
  const [fecha, setFecha] = useState("");
  const [viaje, setViaje] = useState("");
  const [timbradas, setTimbradas] = useState("");
  const [obs, setObs] = useState("");
  const sinValor = f.saldo <= 0;
  return (
    <Bloque titulo="Cargado a otro viaje" tono="alerta">
      <p className="text-xs text-gray-600">
        Este recobro no tiene abono en GEMA. Cuando lo cargue a otro viaje del conductor, registre la fecha y el número del viaje
        (despacho) en GEMA. El recobro queda cerrado.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className={etiqueta}>Fecha del viaje
          <input type="date" value={fecha} min={f.fechaViaje} max={hoy} onChange={(ev) => setFecha(ev.target.value)} className={input} />
        </label>
        <label className={etiqueta}>N.º de viaje (despacho)
          <input type="number" inputMode="numeric" min={1} value={viaje} onChange={(ev) => setViaje(ev.target.value)} className={input} />
        </label>
      </div>
      {sinValor ? (
        <label className={etiqueta}>Timbradas cargadas (el recobro no tiene valor)
          <input type="number" inputMode="numeric" min={1} max={500} value={timbradas} onChange={(ev) => setTimbradas(ev.target.value)} className={input} />
        </label>
      ) : (
        <p className="text-xs text-gray-600">Se cobra el saldo: {pesos(f.saldo)}{f.diferencia ? ` (${f.diferencia} timbradas)` : ""}.</p>
      )}
      <textarea value={obs} onChange={(ev) => setObs(ev.target.value)} maxLength={500} rows={2} className={input} placeholder="Observación (opcional)" />
      <Boton ocupado={ocupado} disabled={!fecha || !viaje || (sinValor && !timbradas)} onClick={() => correr(() => registrarCargueOtroViaje(f.id, {
        fecha, viaje: entero(viaje), timbradas: sinValor ? entero(timbradas) : null, observacion: obs || null,
      }), () => { setFecha(""); setViaje(""); setTimbradas(""); setObs(""); })}>Registrar cargue</Boton>
    </Bloque>
  );
}

function SolicitarIncobrable({ f }: { f: FilaBandeja }) {
  const { ocupado, correr } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  if (!abierto) {
    return <button type="button" onClick={() => setAbierto(true)} className="text-xs font-medium text-gray-500 hover:underline">Solicitar incobrable…</button>;
  }
  return (
    <Bloque titulo="Solicitar incobrable">
      <p className="text-xs text-gray-600">Lo autoriza subgerencia; la directora de Tesorería registra la autorización.</p>
      <textarea value={motivo} onChange={(ev) => setMotivo(ev.target.value)} maxLength={500} rows={2} className={input} placeholder="Por qué no se puede cobrar" />
      <div className="flex gap-2">
        <Boton ocupado={ocupado} onClick={() => correr(() => solicitarIncobrableRecobro(f.id, motivo), () => setAbierto(false))}>Solicitar</Boton>
        <Boton ocupado={ocupado} tono="suave" onClick={() => setAbierto(false)}>Cancelar</Boton>
      </div>
    </Bloque>
  );
}

// ── Operativo y subgerencia ──────────────────────────────────────────────────

function InstruccionOperativo({ f }: { f: FilaBandeja }) {
  const { ocupado, correr } = useAccion();
  const [obs, setObs] = useState("");
  return (
    <Bloque titulo="Instrucción de Operativo" tono="alerta">
      <p className="text-xs text-gray-600">El plazo de pago venció. Indique cómo actuar; queda en el historial del recobro.</p>
      <textarea value={obs} onChange={(ev) => setObs(ev.target.value)} maxLength={500} rows={2} className={input} placeholder="Instrucción" />
      <Boton ocupado={ocupado} onClick={() => correr(() => registrarGestionRecobro(f.id, { resultado: "instruccion_operativo", observacion: obs }), () => setObs(""))}>
        Registrar instrucción
      </Boton>
    </Bloque>
  );
}

function DecisionSubgerencia({ f }: { f: FilaBandeja }) {
  const { ocupado, correr } = useAccion();
  const [timbradas, setTimbradas] = useState("");
  const [nota, setNota] = useState("");
  const t = entero(timbradas);
  const valor = t && t > 0 ? t * (f.pasaje ?? tarifaDelDia(f.fechaViaje)) : null;
  return (
    <Bloque titulo="Decisión de subgerencia" tono="alerta">
      <p className="text-xs text-gray-600">La cámara no tiene conteo. Para cobrar, indique las timbradas que se cobran.</p>
      <label className={etiqueta}>Timbradas a cobrar
        <input type="number" inputMode="numeric" min={1} max={500} value={timbradas} onChange={(ev) => setTimbradas(ev.target.value)} className={input} />
      </label>
      {valor != null && <p className="text-xs text-gray-600">Valor aproximado {pesos(valor)}</p>}
      <textarea value={nota} onChange={(ev) => setNota(ev.target.value)} maxLength={500} rows={2} className={input} placeholder="Observación (obligatoria)" />
      <div className="flex gap-2">
        <Boton ocupado={ocupado} onClick={() => correr(() => decidirSubgerenciaRecobro(f.id, { decision: "cobrar", timbradas: t, nota }))}>Cobrar</Boton>
        <Boton ocupado={ocupado} tono="suave" onClick={() => correr(() => decidirSubgerenciaRecobro(f.id, { decision: "no_cobrar", nota }))}>No cobrar</Boton>
      </div>
    </Bloque>
  );
}

// ── Directora ────────────────────────────────────────────────────────────────

function RegistrarIncobrable({ f, hoy }: { f: FilaBandeja; hoy: string }) {
  const { ocupado, correr } = useAccion();
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [soporte, setSoporte] = useState("");
  const [nota, setNota] = useState("");
  return (
    <Bloque titulo="Incobrable por autorizar" tono="alerta">
      <p className="text-xs text-gray-600">Motivo de caja: {f.incobrable.motivo ?? "—"} · saldo {pesos(f.saldo)}</p>
      <label className={etiqueta}>Autorizó en subgerencia
        <input value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={120} className={input} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={etiqueta}>Fecha de la autorización
          <input type="date" value={fecha} max={hoy} onChange={(ev) => setFecha(ev.target.value)} className={input} />
        </label>
        <label className={etiqueta}>Soporte (correo, acta…)
          <input value={soporte} onChange={(ev) => setSoporte(ev.target.value)} maxLength={200} className={input} />
        </label>
      </div>
      <Boton ocupado={ocupado} onClick={() => correr(() => decidirIncobrableRecobro(f.id, { autorizar: true, nombre, fecha, soporte }))}>
        Registrar autorización
      </Boton>
      <div className="flex gap-2 border-t border-amber-200 pt-2">
        <input value={nota} onChange={(ev) => setNota(ev.target.value)} maxLength={500} className={input} placeholder="Si subgerencia no lo autorizó: por qué" />
        <Boton ocupado={ocupado} tono="suave" onClick={() => correr(() => decidirIncobrableRecobro(f.id, { autorizar: false, nota }))}>Rechazar</Boton>
      </div>
    </Bloque>
  );
}

function ReabrirIncobrable({ f }: { f: FilaBandeja }) {
  const { ocupado, correr } = useAccion();
  const [nota, setNota] = useState("");
  return (
    <Bloque titulo="Incobrable">
      <p className="text-xs text-gray-600">
        Autorizó {f.incobrable.autorizaNombre ?? "—"} el {f.incobrable.autorizaFecha ?? "—"} · soporte {f.incobrable.soporte ?? "—"}
      </p>
      <div className="flex gap-2">
        <input value={nota} onChange={(ev) => setNota(ev.target.value)} maxLength={500} className={input} placeholder="Por qué se reabre" />
        <Boton ocupado={ocupado} tono="suave" onClick={() => correr(() => reabrirIncobrableRecobro(f.id, nota))}>Reabrir</Boton>
      </div>
    </Bloque>
  );
}

function MarcarLiquidacion({ f, retirado }: { f: FilaBandeja; retirado: boolean }) {
  const { ocupado, correr } = useAccion();
  const [abierto, setAbierto] = useState(retirado);
  const [nota, setNota] = useState("");
  if (!abierto) {
    return <button type="button" onClick={() => setAbierto(true)} className="text-xs font-medium text-gray-500 hover:underline">Pasar a liquidación definitiva…</button>;
  }
  return (
    <Bloque titulo="Pasar a liquidación definitiva">
      <p className="text-xs text-gray-600">El saldo de {pesos(f.saldo)} se anota para descontarlo en la liquidación definitiva del conductor.</p>
      <input value={nota} onChange={(ev) => setNota(ev.target.value)} maxLength={500} className={input} placeholder="Nota (opcional)" />
      <Boton ocupado={ocupado} onClick={() => correr(() => marcarLiquidacionRecobro(f.id, nota || null))}>Pasar a liquidación</Boton>
    </Bloque>
  );
}

function CerrarLiquidacion({ f }: { f: FilaBandeja }) {
  const { ocupado, correr } = useAccion();
  const [concepto, setConcepto] = useState<ConceptoLiquidacion | "">("");
  const [valor, setValor] = useState("");
  const [soporte, setSoporte] = useState("");
  const [nota, setNota] = useState("");
  return (
    <Bloque titulo="Cerrar por liquidación definitiva" tono="alerta">
      <p className="text-xs text-gray-600">Saldo para la liquidación: {pesos(f.saldo)}</p>
      <select value={concepto} onChange={(ev) => setConcepto(ev.target.value as ConceptoLiquidacion)} className={input} aria-label="Concepto">
        <option value="">Concepto de la liquidación…</option>
        {(Object.keys(CONCEPTOS_LIQUIDACION) as ConceptoLiquidacion[]).map((c) => <option key={c} value={c}>{CONCEPTOS_LIQUIDACION[c]}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        {concepto !== "no_descontable" && (
          <label className={etiqueta}>Valor descontado
            <input type="number" inputMode="numeric" min={0} value={valor} onChange={(ev) => setValor(ev.target.value)} className={input} />
          </label>
        )}
        <label className={etiqueta}>Soporte
          <input value={soporte} onChange={(ev) => setSoporte(ev.target.value)} maxLength={100} className={input} />
        </label>
      </div>
      <input value={nota} onChange={(ev) => setNota(ev.target.value)} maxLength={500} className={input} placeholder="Nota (obligatoria con «Otro»)" />
      <Boton ocupado={ocupado} disabled={!concepto} onClick={() => correr(() => cerrarLiquidacionRecobro(f.id, {
        concepto, valorDescontado: entero(valor), soporte, nota: nota || null,
      }))}>Cerrar recobro</Boton>
    </Bloque>
  );
}

// ── Correcciones ─────────────────────────────────────────────────────────────

function Correcciones({ f, valida, pide }: { f: FilaBandeja; valida: boolean; pide: boolean }) {
  const lista = [...f.correcciones].reverse();
  if (!lista.length && !pide) return null;
  return (
    <Bloque titulo="Correcciones">
      {lista.length === 0 && <p className="text-xs text-gray-400">Sin correcciones.</p>}
      <ul className="space-y-2">
        {lista.map((c) => <ItemCorreccion key={c.id ?? `${c.campo}-${c.solicitadoAt}`} c={c} valida={valida} f={f} />)}
      </ul>
      {pide && <PedirCorreccion f={f} />}
    </Bloque>
  );
}

const textoValor = (campo: string, v: string | null | undefined) =>
  v == null ? "—" : campo === "resultado" ? RESULTADO_REVISION_LABEL[v as keyof typeof RESULTADO_REVISION_LABEL] ?? v
    : campo === "valor_recibido" ? pesos(Number(v)) : v;

function ItemCorreccion({ c, valida, f }: { c: CorreccionVista; valida: boolean; f: FilaBandeja }) {
  const { ocupado, correr } = useAccion();
  const [nota, setNota] = useState("");
  const campo = CAMPO_CORRECCION_LABEL[c.campo as CampoCorreccion] ?? c.campo;
  const gestion = c.gestionId ? f.gestiones.find((g) => g.id === c.gestionId) : null;
  return (
    <li className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs">
      <div className="font-medium text-gray-800">
        {campo}{gestion ? ` (gestión del ${gestion.fecha})` : ""}: {textoValor(c.campo, c.valorAnterior)} → {textoValor(c.campo, c.valorNuevo)}
      </div>
      <div className="text-gray-500">{c.motivo} · {c.solicitadoPorEmail}</div>
      {c.decision ? (
        <div className={c.decision === "aprobada" ? "text-emerald-700" : "text-red-700"}>
          {c.decision === "aprobada" ? "Aprobada" : "Rechazada"} por {c.decididoPorEmail ?? "—"}{c.decisionNota ? ` · ${c.decisionNota}` : ""}
        </div>
      ) : valida && c.id ? (
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input value={nota} onChange={(ev) => setNota(ev.target.value)} maxLength={500} className={`${input} flex-1`} placeholder="Nota (obligatoria para rechazar)" />
          <Boton ocupado={ocupado} onClick={() => correr(() => decidirCorreccionRecobro(c.id!, true, nota || null))}>Aprobar</Boton>
          <Boton ocupado={ocupado} tono="suave" onClick={() => correr(() => decidirCorreccionRecobro(c.id!, false, nota || null))}>Rechazar</Boton>
        </div>
      ) : (
        <div className="text-violet-700">Por validar · director de Mantenimiento</div>
      )}
    </li>
  );
}

function PedirCorreccion({ f }: { f: FilaBandeja }) {
  const { ocupado, correr } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const campos: CampoCorreccion[] = f.tipo === "camara" ? ["conteo_camara", "resultado", "valor_recibido"] : ["diferencia", "resultado", "valor_recibido"];
  const conDinero = f.gestiones.filter((g) => (g.valorRecibido ?? 0) > 0);
  const [campo, setCampo] = useState<CampoCorreccion>(campos[0]);
  const [valor, setValor] = useState("");
  const [gestionId, setGestionId] = useState("");
  const [motivo, setMotivo] = useState("");
  if (!abierto) {
    return <button type="button" onClick={() => setAbierto(true)} className="text-xs font-medium text-[#4F46E5] hover:underline">+ Pedir corrección</button>;
  }
  return (
    <div className="space-y-2 border-t border-[#F1F5F9] pt-2">
      <select value={campo} onChange={(ev) => { setCampo(ev.target.value as CampoCorreccion); setValor(""); }} className={input} aria-label="Dato a corregir">
        {campos.filter((c) => c !== "valor_recibido" || conDinero.length).map((c) => <option key={c} value={c}>{CAMPO_CORRECCION_LABEL[c]}</option>)}
      </select>
      {campo === "valor_recibido" && (
        <select value={gestionId} onChange={(ev) => setGestionId(ev.target.value)} className={input} aria-label="Gestión">
          <option value="">Gestión con el valor a corregir…</option>
          {conDinero.map((g) => <option key={g.id} value={g.id}>{g.fecha} · {pesos(g.valorRecibido)} · {g.usuarioEmail ?? "—"}</option>)}
        </select>
      )}
      {campo === "resultado" ? (
        <select value={valor} onChange={(ev) => setValor(ev.target.value)} className={input} aria-label="Resultado correcto">
          <option value="">Resultado correcto…</option>
          {(Object.keys(RESULTADO_REVISION_LABEL) as (keyof typeof RESULTADO_REVISION_LABEL)[])
            .filter((r) => r !== f.resultado).map((r) => <option key={r} value={r}>{RESULTADO_REVISION_LABEL[r]}</option>)}
        </select>
      ) : (
        <input type="number" inputMode="numeric" min={0} value={valor} onChange={(ev) => setValor(ev.target.value)} className={input}
          placeholder={campo === "valor_recibido" ? "Valor correcto" : "Número correcto"} />
      )}
      <textarea value={motivo} onChange={(ev) => setMotivo(ev.target.value)} maxLength={500} rows={2} className={input} placeholder="Motivo (obligatorio)" />
      <div className="flex gap-2">
        <Boton ocupado={ocupado} disabled={!valor} onClick={() => correr(() => solicitarCorreccionRecobro(f.id, {
          campo, valorNuevo: valor, gestionId: gestionId || null, motivo,
        }), () => { setAbierto(false); setValor(""); setMotivo(""); })}>Enviar al director de Mantenimiento</Boton>
        <Boton ocupado={ocupado} tono="suave" onClick={() => setAbierto(false)}>Cancelar</Boton>
      </div>
    </div>
  );
}
