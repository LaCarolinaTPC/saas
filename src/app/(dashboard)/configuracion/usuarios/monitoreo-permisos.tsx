"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { coincideTexto } from "@/lib/tabla/filtros";
import { ETIQUETA_TIPO, LISTO_DIAS, type EstadoIncidencia, type ResumenMetricas, type TipoIncidencia } from "@/lib/permisos/incidencias";
import type { IncidenciaFila, Monitoreo } from "./datos-roles";
import { revisarIncidenciaPermisos } from "./roles-actions";

const campo = "h-9 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm";

const ESTADOS: { valor: EstadoIncidencia; etiqueta: string }[] = [
  { valor: "abierta", etiqueta: "Abierta" },
  { valor: "revisada", etiqueta: "Revisada" },
  { valor: "resuelta", etiqueta: "Resuelta" },
  { valor: "ignorada", etiqueta: "Ignorada" },
];

const ORIGEN: Record<string, string> = {
  proxy: "Ruta (proxy)",
  server: "Servidor",
  api: "API interna",
  api_externa: "MCP / Data API",
  sombra: "Comparación periódica",
};

const SEVERIDAD_CLASE = {
  alta: "bg-red-50 text-red-700",
  media: "bg-amber-50 text-amber-800",
  baja: "bg-[#F1F5F9] text-gray-600",
};

const pct = (r: ResumenMetricas) => (r.coincidencia === null ? "—" : `${(r.coincidencia * 100).toFixed(2)} %`);
const num = (n: number) => n.toLocaleString("es-CO");
const fecha = (iso: string) => new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

/**
 * Métricas del sistema viejo y el nuevo corriendo en paralelo, y la bitácora
 * de incidencias de permisos para revisarlas (src/lib/permisos/incidencias.ts).
 */
export function MonitoreoPermisos({ m }: { m: Monitoreo | null }) {
  if (!m) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 text-sm text-gray-600">
        Falta aplicar la migración <span className="font-mono">20261028183002_metricas_e_incidencias_de_permisos.sql</span> para ver métricas e
        incidencias.
      </div>
    );
  }
  return (
    <>
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
        <h3 className="font-semibold text-gray-900">Viejo vs. nuevo en los chequeos reales</h3>
        <p className="mt-1 text-sm text-gray-600">
          Cada vez que la aplicación pregunta por un permiso se evalúa con los dos sistemas. Decide uno; el otro solo se anota.
        </p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi titulo="Chequeos (7 días)" valor={num(m.dias7.chequeos)} />
          <Kpi titulo="Coincidencia (7 días)" valor={pct(m.dias7)} />
          <Kpi titulo="Coincidencia (30 días)" valor={pct(m.dias30)} />
          <Kpi titulo="Perdería acceso (7 días)" valor={num(m.dias7.perdidos)} alerta={m.dias7.perdidos > 0} />
          <Kpi titulo="Ganaría acceso (7 días)" valor={num(m.dias7.ganados)} />
          <Kpi titulo="Denegados (7 días)" valor={num(m.dias7.denegados)} />
        </dl>
        <p className={cn("mt-3 flex items-center gap-1.5 text-sm", m.listo.listo ? "text-green-700" : "text-amber-800")}>
          {m.listo.listo ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {m.listo.listo
            ? `Listo para pasar al sistema nuevo según los últimos ${LISTO_DIAS} días.`
            : `Aún no se recomienda pasar al sistema nuevo: ${m.listo.motivo}`}
        </p>
        <Tendencia dias={m.porDia} />
      </div>

      {m.dondeFalla.length > 0 && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
          <h3 className="font-semibold text-gray-900">Dónde no coincide o se deniega (30 días)</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Permiso / ruta</th>
                  <th className="py-1.5 pr-3 font-medium">Origen</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Perdería</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Ganaría</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Denegados</th>
                  <th className="py-1.5 text-right font-medium">Chequeos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {m.dondeFalla.map((f) => (
                  <tr key={`${f.origen}|${f.clave}`}>
                    <td className="py-1.5 pr-3 font-mono text-xs">{f.clave}</td>
                    <td className="py-1.5 pr-3 text-gray-600">{ORIGEN[f.origen] ?? f.origen}</td>
                    <td className={cn("py-1.5 pr-3 text-right tabular-nums", f.perdidos && "font-semibold text-red-600")}>{num(f.perdidos)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{num(f.ganados)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{num(f.denegados)}</td>
                    <td className="py-1.5 text-right tabular-nums text-gray-500">{num(f.chequeos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Incidencias lista={m.incidencias} abiertas={m.abiertas} />
    </>
  );
}

function Kpi({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg bg-[#F8FAFC] p-3">
      <dt className="text-xs text-gray-500">{titulo}</dt>
      <dd className={cn("text-2xl font-semibold tabular-nums", alerta ? "text-red-600" : "text-gray-900")}>{valor}</dd>
    </div>
  );
}

/** Chequeos con divergencia por día (una sola serie; el detalle va en la tabla de arriba). */
function Tendencia({ dias }: { dias: Monitoreo["porDia"] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!dias.length) return <p className="mt-4 text-sm text-gray-500">Todavía no hay chequeos registrados.</p>;
  const valores = dias.map((d) => d.perdidos + d.ganados);
  const max = Math.max(1, ...valores);
  const ancho = 100 / dias.length;
  const h = hover !== null ? dias[hover] : null;
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-700">Chequeos con divergencia por día (30 días)</h4>
        <span className="text-xs text-gray-500">
          {h
            ? `${h.dia}: ${num(h.perdidos)} perdería · ${num(h.ganados)} ganaría · ${num(h.chequeos)} chequeos · coincidencia ${pct(h)}`
            : `máximo ${num(max)} en un día`}
        </span>
      </div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-24 w-full" role="img" aria-label="Divergencias por día">
        <line x1="0" y1="40" x2="100" y2="40" stroke="#E2E8F0" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        {dias.map((d, i) => {
          const alto = (valores[i] / max) * 38;
          return (
            <g key={d.dia} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * ancho} y="0" width={ancho} height="40" fill="transparent" />
              <rect
                x={i * ancho + ancho * 0.15}
                y={40 - alto}
                width={ancho * 0.7}
                height={alto}
                fill={d.perdidos ? "#DC2626" : "#4F46E5"}
                opacity={hover === null || hover === i ? 1 : 0.4}
              />
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-gray-500">En rojo, los días con al menos un acceso que se perdería.</p>
    </div>
  );
}

function Incidencias({ lista, abiertas }: { lista: IncidenciaFila[]; abiertas: Monitoreo["abiertas"] }) {
  const [estado, setEstado] = useState<EstadoIncidencia | "todas">("abierta");
  const [tipo, setTipo] = useState<TipoIncidencia | "todos">("todos");
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const filtradas = useMemo(
    () =>
      lista.filter(
        (i) =>
          (estado === "todas" || i.estado === estado) &&
          (tipo === "todos" || i.tipo === tipo) &&
          coincideTexto(texto, i.email, i.clave, i.ruta, i.rolViejo, ...i.rolesNuevos)
      ),
    [lista, estado, tipo, texto]
  );
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <h3 className="font-semibold text-gray-900">Incidencias de roles y permisos</h3>
      <p className="mt-1 text-sm text-gray-600">
        {abiertas.total} abierta(s): {abiertas.perdidos} de acceso perdido, {abiertas.ganados} de acceso ganado, {abiertas.errores} error(es). Cada
        problema distinto aparece una vez con cuántas veces pasó; si uno resuelto vuelve a pasar, se reabre.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <select className={campo} value={estado} onChange={(e) => setEstado(e.target.value as EstadoIncidencia | "todas")}>
          <option value="todas">Todos los estados</option>
          {ESTADOS.filter((e) => e.valor !== "ignorada").map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.etiqueta}
            </option>
          ))}
        </select>
        <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value as TipoIncidencia | "todos")}>
          <option value="todos">Todos los tipos</option>
          {Object.entries(ETIQUETA_TIPO).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input className={cn(campo, "min-w-56 flex-1")} placeholder="Buscar persona, permiso, ruta o rol" value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
      {filtradas.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Sin incidencias con estos filtros.</p>
      ) : (
        <ul className="mt-3 divide-y divide-[#F1F5F9]">
          {filtradas.map((i) => (
            <li key={i.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", SEVERIDAD_CLASE[i.severidad])}>{ETIQUETA_TIPO[i.tipo]}</span>
                <span className="font-medium text-gray-900">{i.email ?? (i.userId ? i.userId : `Credencial ${i.rolViejo ?? ""}`)}</span>
                <span className="font-mono text-xs text-gray-700">{i.clave}</span>
                <span className="text-xs text-gray-500">
                  {ORIGEN[i.origen] ?? i.origen}
                  {i.ruta ? ` · ${i.ruta}` : ""}
                </span>
                <span className="ml-auto text-xs text-gray-500">
                  {num(i.veces)} vez/veces · última {fecha(i.ultimaVez)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                {i.viejo !== null && <span>Viejo: {i.viejo ? "sí" : "no"}</span>}
                {i.nuevo !== null && <span>Nuevo: {i.nuevo ? "sí" : "no"}</span>}
                {i.rolViejo && <span>Rol viejo: {i.rolViejo}</span>}
                {i.rolesNuevos.length > 0 && <span>Roles nuevos: {i.rolesNuevos.join(", ")}</span>}
                <span>Decide: {i.motor ?? "—"}</span>
                <span>Desde {fecha(i.primeraVez)}</span>
                <span className="font-medium text-gray-700">{ESTADOS.find((e) => e.valor === i.estado)?.etiqueta}</span>
                {i.revisadoPor && (
                  <span>
                    por {i.revisadoPor}
                    {i.revisadoAt ? ` (${fecha(i.revisadoAt)})` : ""}
                  </span>
                )}
                <button type="button" className="text-[#4F46E5] hover:underline" onClick={() => setEditando(editando === i.id ? null : i.id)}>
                  {editando === i.id ? "Cerrar" : "Revisar"}
                </button>
              </div>
              {i.nota && editando !== i.id && <p className="mt-1 text-xs text-gray-600">Nota: {i.nota}</p>}
              {editando === i.id && <Revisar incidencia={i} alTerminar={() => setEditando(null)} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Revisar({ incidencia, alTerminar }: { incidencia: IncidenciaFila; alTerminar: () => void }) {
  const [estado, setEstado] = useState<EstadoIncidencia>(incidencia.estado === "abierta" ? "revisada" : incidencia.estado);
  const [nota, setNota] = useState(incidencia.nota ?? "");
  const [pending, start] = useTransition();
  const guardar = () =>
    start(async () => {
      const r = await revisarIncidenciaPermisos(incidencia.id, estado, nota);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Incidencia actualizada.");
        alTerminar();
      }
    });
  return (
    <div className="mt-2 flex flex-wrap items-start gap-2 rounded-lg bg-[#F8FAFC] p-3">
      <select className={campo} value={estado} onChange={(e) => setEstado(e.target.value as EstadoIncidencia)}>
        {ESTADOS.map((e) => (
          <option key={e.valor} value={e.valor}>
            {e.etiqueta}
          </option>
        ))}
      </select>
      <textarea
        className="min-h-9 min-w-64 flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-sm"
        placeholder="Qué se revisó o por qué se ignora"
        value={nota}
        maxLength={1000}
        onChange={(e) => setNota(e.target.value)}
      />
      <button
        type="button"
        disabled={pending}
        onClick={guardar}
        className="inline-flex items-center rounded-lg bg-[#4F46E5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
      >
        Guardar
      </button>
    </div>
  );
}
