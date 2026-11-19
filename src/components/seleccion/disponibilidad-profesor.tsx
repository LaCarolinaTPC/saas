"use client";

/**
 * Días en que el profesor no puede o puede a otra hora (entrega 2). Lo marca
 * el profesor desde su pantalla o Gestión Humana desde la Agenda (si se
 * enfermó y no puede entrar). Si ese día ya tiene citas, ofrece moverlas al
 * siguiente cupo y avisar a cada aspirante; no les cuenta como reprogramación.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Loader2, Trash2 } from "lucide-react";
import { fechaEnTexto, horaEnTexto, type ExcepcionProfesor } from "@/lib/seleccion/agenda";
import { avisarPrueba, textoEnvio, type AccionesDisponibilidad } from "./profesor-tipos";

const MOTIVOS = [
  ["enfermedad", "Enfermedad"],
  ["permiso", "Permiso"],
  ["otro", "Otro motivo"],
] as const;
const MOTIVO: Record<string, string> = { enfermedad: "Enfermedad", permiso: "Permiso", otra_hora: "Otra hora", otro: "Otro motivo" };

const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
const enDias = (fecha: string, n: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function DisponibilidadProfesor({
  acciones,
  puedeEditar,
  fechaInicial,
  aviso,
  onCambio,
}: {
  acciones: AccionesDisponibilidad;
  puedeEditar: boolean;
  fechaInicial?: string;
  /** Nota bajo el título (por ejemplo, en el modo de prueba). */
  aviso?: string;
  onCambio?: () => void;
}) {
  const [lista, setLista] = useState<ExcepcionProfesor[] | null>(null);
  const [fecha, setFecha] = useState(fechaInicial ?? hoyBogota());
  const [tipo, setTipo] = useState<"no_puede" | "otra_hora">("no_puede");
  const [motivo, setMotivo] = useState<string>("enfermedad");
  const [hora, setHora] = useState("15:00");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [afectadas, setAfectadas] = useState<{ fecha: string; citas: { id: string; nombre: string; hora: string }[] } | null>(null);

  const cargar = useCallback(() => {
    const h = hoyBogota();
    acciones
      .listar(h, enDias(h, 90))
      .then(setLista)
      .catch(() => setLista([]));
  }, [acciones]);
  useEffect(cargar, [cargar]);

  async function guardar() {
    if (ocupado) return;
    setOcupado("guardar");
    setError(null);
    setResultado(null);
    const r = await acciones
      .guardar({ fecha, disponible: tipo === "otra_hora", hora: tipo === "otra_hora" ? hora : null, motivo: tipo === "otra_hora" ? "otra_hora" : motivo, nota })
      .catch((e: Error) => ({ ok: false as const, error: e.message, afectadas: [] }));
    setOcupado(null);
    if (!r.ok) return setError(r.error ?? "No se pudo guardar.");
    setNota("");
    setAfectadas(r.afectadas.length ? { fecha, citas: r.afectadas } : null);
    setResultado(r.afectadas.length ? null : "Guardado. Ese día no tenía citas por mover.");
    cargar();
    onCambio?.();
  }

  async function quitar(f: string) {
    if (ocupado) return;
    setOcupado(`quitar-${f}`);
    setError(null);
    const r = await acciones.quitar(f).catch((e: Error) => ({ ok: false as const, error: e.message }));
    setOcupado(null);
    if (!r.ok) return setError(r.error ?? "No se pudo quitar.");
    if (afectadas?.fecha === f) setAfectadas(null);
    cargar();
    onCambio?.();
  }

  async function reprogramarDia(f: string) {
    if (ocupado) return;
    setOcupado("mover");
    setError(null);
    const r = await acciones.reprogramarDia(f).catch((e: Error) => ({ ok: false as const, error: e.message, movidas: [] }));
    setOcupado(null);
    if (!r.ok) return setError(r.error ?? "No se pudo reprogramar.");
    setAfectadas(null);
    setResultado(
      r.movidas.length
        ? r.movidas.map((m) => `${m.nombre}: ${fechaEnTexto(m.fecha)} a las ${horaEnTexto(m.hora)}. ${textoEnvio(m.envio)}`).join("\n")
        : "No había citas por mover."
    );
    for (const m of r.movidas) if (m.envio === "prueba" && m.texto) avisarPrueba({ texto: m.texto, procesoId: m.procesoId, etiqueta: "Cita reprogramada (el profesor no puede)", clave: "cita_reprogramada" });
    onCambio?.();
  }

  const boton = (activo: boolean) =>
    `min-h-12 rounded-lg border px-3 py-2 text-left text-base font-medium ${activo ? "border-[#4F46E5] bg-[#EEF2FF] text-[#4338CA]" : "border-[#E2E8F0] bg-white text-gray-700"}`;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
          <CalendarOff className="h-5 w-5 text-gray-500" /> Días en que el profesor no puede
        </h3>
        <p className="text-sm text-gray-500">{aviso ?? "Sin nada marcado, hay prueba todos los días hábiles a la hora normal."}</p>
      </div>

      {puedeEditar && (
        <div className="space-y-3 rounded-xl border border-[#E2E8F0] bg-white p-3">
          <label className="block text-sm font-medium text-gray-700">
            Día
            <input
              type="date"
              value={fecha}
              min={hoyBogota()}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 h-12 w-full rounded-lg border border-[#E2E8F0] px-3 text-base outline-none focus:border-[#4F46E5]"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTipo("no_puede")} className={boton(tipo === "no_puede")}>
              No puede
            </button>
            <button type="button" onClick={() => setTipo("otra_hora")} className={boton(tipo === "otra_hora")}>
              Puede a otra hora
            </button>
          </div>
          {tipo === "no_puede" ? (
            <div className="grid grid-cols-3 gap-2">
              {MOTIVOS.map(([v, t]) => (
                <button key={v} type="button" onClick={() => setMotivo(v)} className={`${boton(motivo === v)} text-center text-sm`}>
                  {t}
                </button>
              ))}
            </div>
          ) : (
            <label className="block text-sm font-medium text-gray-700">
              Hora a la que puede
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="mt-1 h-12 w-full rounded-lg border border-[#E2E8F0] px-3 text-base outline-none focus:border-[#4F46E5]"
              />
            </label>
          )}
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={300}
            placeholder="Nota (opcional)"
            className="h-12 w-full rounded-lg border border-[#E2E8F0] px-3 text-base outline-none focus:border-[#4F46E5]"
          />
          <button
            type="button"
            onClick={guardar}
            disabled={!!ocupado || !fecha}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-base font-semibold text-white disabled:opacity-50"
          >
            {ocupado === "guardar" && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </div>
      )}

      {afectadas && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">
            {afectadas.citas.length === 1 ? "Hay 1 cita" : `Hay ${afectadas.citas.length} citas`} el {fechaEnTexto(afectadas.fecha)} que ya no {afectadas.citas.length === 1 ? "cabe" : "caben"}:
          </p>
          <ul className="text-sm text-amber-900">
            {afectadas.citas.map((c) => (
              <li key={c.id}>
                {c.nombre} · {horaEnTexto(c.hora)}
              </li>
            ))}
          </ul>
          {puedeEditar && (
            <button
              type="button"
              onClick={() => reprogramarDia(afectadas.fecha)}
              disabled={!!ocupado}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-base font-semibold text-white disabled:opacity-50"
            >
              {ocupado === "mover" && <Loader2 className="h-4 w-4 animate-spin" />}
              Reprogramar {afectadas.citas.length === 1 ? "la cita" : `las ${afectadas.citas.length} citas`} y avisar
            </button>
          )}
          <p className="text-xs text-amber-800">Pasan al siguiente día con prueba (o a la hora nueva) y no le cuentan al aspirante como reprogramación.</p>
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {resultado && <p className="whitespace-pre-wrap rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultado}</p>}

      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">Marcados</p>
        {lista === null ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-gray-500">Ningún día marcado.</p>
        ) : (
          <ul className="space-y-2">
            {lista.map((e) => (
              <li key={e.fecha} className="flex items-center justify-between gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 py-2">
                <div className="min-w-0 text-sm">
                  <p className="font-medium first-letter:uppercase text-gray-900">{fechaEnTexto(e.fecha)}</p>
                  <p className="text-gray-600">
                    {e.disponible && e.hora ? `Puede a las ${horaEnTexto(e.hora)}` : `No puede · ${MOTIVO[e.motivo ?? "otro"] ?? "Otro motivo"}`}
                    {e.nota ? ` · ${e.nota}` : ""}
                  </p>
                </div>
                {puedeEditar && (
                  <button
                    type="button"
                    onClick={() => quitar(e.fecha)}
                    disabled={!!ocupado}
                    aria-label={`Quitar el ${fechaEnTexto(e.fecha)}`}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                  >
                    {ocupado === `quitar-${e.fecha}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
