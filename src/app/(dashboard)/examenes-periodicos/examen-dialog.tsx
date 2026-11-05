"use client";

/**
 * Formulario de un examen periódico (nuevo o edición): la persona, la atención
 * (fecha, entrega, periodicidad y el próximo examen calculado en vivo) y las
 * recomendaciones. Reglas en src/lib/sst/examenes.ts.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Stethoscope } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BuscadorOpciones, type OpcionBuscable } from "@/components/ui/buscador-opciones";
import type { OpcionTrabajador } from "@/lib/sst/data";
import {
  GRUPOS_EXAMEN, MAX_TEXTO, PERIODICIDAD_DEFECTO, PERIODICIDAD_MAX, PERIODICIDAD_MIN, PERIODICIDADES, etiquetaGrupo, proximoExamen,
  type ExamenPeriodico, type GrupoExamen, type PersonaExamen,
} from "@/lib/sst/examenes";
import { actualizarExamen, registrarExamen } from "./actions";

export type ExamenInicial = { examen: ExamenPeriodico | null; persona: PersonaExamen | null };

const inputCls = "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5] disabled:bg-gray-50 disabled:text-gray-500";
const textareaCls = "min-h-[96px] w-full resize-y rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";

function Campo({ etiqueta, children, ancho = false, ayuda }: { etiqueta: string; children: React.ReactNode; ancho?: boolean; ayuda?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${ancho ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{etiqueta}</span>
      {children}
      {ayuda && <span className="text-[11px] text-gray-500">{ayuda}</span>}
    </label>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-[#F1F5F9] pb-1 text-sm font-semibold text-gray-800">{titulo}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Grupo sugerido para alguien del maestro que todavía no está en el control. */
const grupoSugerido = (cargo: string | null | undefined): GrupoExamen => {
  const c = (cargo ?? "").toUpperCase();
  if (c.includes("REUBICAD")) return "reubicados";
  if (c.startsWith("CONDUCTOR")) return "conductores";
  return "administrativos";
};

export function ExamenDialog({ inicial, personas, trabajadores, hoy, onClose }: {
  inicial: ExamenInicial;
  personas: Map<string, PersonaExamen>;
  trabajadores: OpcionTrabajador[];
  hoy: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { examen, persona } = inicial;
  const [f, setF] = useState(() => ({
    cedula: examen?.cedula ?? persona?.cedula ?? "",
    nombre: examen?.nombre ?? persona?.nombre ?? "",
    cargo: examen?.cargo ?? persona?.cargo ?? "",
    grupo: (persona?.grupo ?? "") as GrupoExamen | "",
    fechaAtencion: examen?.fechaAtencion ?? hoy,
    fechaEntrega: examen?.fechaEntrega ?? "",
    periodicidadMeses: String(examen?.periodicidadMeses ?? persona?.periodicidadMeses ?? PERIODICIDAD_DEFECTO),
    recomendaciones: examen?.recomendaciones ?? "",
    observaciones: examen?.observaciones ?? "",
  }));
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const enControl = personas.get(f.cedula.replace(/\D/g, "")) ?? null;
  const otra = !(PERIODICIDADES as readonly number[]).includes(Number(f.periodicidadMeses));
  const [periodicidadOtra, setPeriodicidadOtra] = useState(otra);

  // Personas del control (también las que salieron) + el maestro activo.
  const opciones: OpcionBuscable[] = useMemo(() => {
    const vistos = new Set<string>();
    const salida: OpcionBuscable[] = [];
    for (const p of personas.values()) {
      vistos.add(p.cedula);
      salida.push({ valor: p.cedula, etiqueta: p.nombre, secundario: `CC ${p.cedula} · ${etiquetaGrupo(p.grupo)}${p.activo ? "" : " · fuera del control"}`, claves: [p.cedula, p.nombre] });
    }
    for (const t of trabajadores) {
      if (vistos.has(t.cedula)) continue;
      salida.push({ valor: t.cedula, etiqueta: t.nombre, secundario: `CC ${t.cedula}${t.cargo ? ` · ${t.cargo}` : ""} · no está en el control`, claves: [t.cedula, t.nombre] });
    }
    return salida;
  }, [personas, trabajadores]);

  function elegir(cedula: string) {
    const p = personas.get(cedula);
    const t = trabajadores.find((x) => x.cedula === cedula);
    setF((x) => ({
      ...x,
      cedula,
      nombre: p?.nombre ?? t?.nombre ?? x.nombre,
      cargo: p?.cargo ?? t?.cargo ?? x.cargo,
      grupo: p?.grupo ?? (x.grupo || grupoSugerido(t?.cargo)),
      periodicidadMeses: examen ? x.periodicidadMeses : String(p?.periodicidadMeses ?? PERIODICIDAD_DEFECTO),
    }));
    setPeriodicidadOtra(!(PERIODICIDADES as readonly number[]).includes(p?.periodicidadMeses ?? PERIODICIDAD_DEFECTO));
  }

  const meses = Number(f.periodicidadMeses);
  const proximo =
    /^\d{4}-\d{2}-\d{2}$/.test(f.fechaAtencion) && Number.isInteger(meses) && meses >= PERIODICIDAD_MIN && meses <= PERIODICIDAD_MAX
      ? proximoExamen(f.fechaAtencion, meses)
      : null;

  function guardar() {
    const datos = { ...f, grupo: enControl?.grupo ?? f.grupo };
    start(async () => {
      const r = examen ? await actualizarExamen(examen.id, datos) : await registrarExamen(datos);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(examen ? "Examen actualizado." : `Examen registrado; el próximo es el ${fechaLarga(r.dato.proximoExamen)}.`);
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-[#4F46E5]" />
            {examen ? "Editar examen periódico" : "Registrar examen periódico"}
          </DialogTitle>
          <DialogDescription>
            {examen ? `${examen.nombre} · CC ${examen.cedula}` : "La atención, la entrega de resultados y las recomendaciones del médico."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Seccion titulo="Trabajador">
            {!examen && !persona && (
              <div className="sm:col-span-2">
                <BuscadorOpciones
                  id="examen-trabajador"
                  opciones={opciones}
                  value={f.cedula}
                  onChange={elegir}
                  placeholder="Buscar en el control o en el maestro (nombre o cédula)"
                  vacio={(q) => `Nadie coincide con «${q}»: escriba cédula y nombre abajo.`}
                />
              </div>
            )}
            <Campo etiqueta="Cédula">
              <input className={inputCls} inputMode="numeric" value={f.cedula} disabled={Boolean(examen || persona)} onChange={(e) => set("cedula")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Nombre">
              <input className={inputCls} value={f.nombre} onChange={(e) => set("nombre")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Cargo o área">
              <input className={inputCls} value={f.cargo} onChange={(e) => set("cargo")(e.target.value)} placeholder="Conductor - cobrador" />
            </Campo>
            <Campo etiqueta="Grupo de control" ayuda={enControl ? "Ya está en el control; el grupo se cambia desde «Editar persona»." : "Entra al control con este grupo."}>
              <select className={inputCls} value={enControl?.grupo ?? f.grupo} disabled={Boolean(enControl)} onChange={(e) => set("grupo")(e.target.value)}>
                <option value="">Elija…</option>
                {GRUPOS_EXAMEN.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Campo>
          </Seccion>

          <Seccion titulo="Examen">
            <Campo etiqueta="Fecha de atención">
              <input type="date" className={inputCls} value={f.fechaAtencion} max={hoy} onChange={(e) => set("fechaAtencion")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Fecha de entrega de resultados" ayuda="Déjela vacía mientras el resultado esté pendiente.">
              <input type="date" className={inputCls} value={f.fechaEntrega} min={f.fechaAtencion} max={hoy} onChange={(e) => set("fechaEntrega")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Periodicidad" ayuda="Lo que indique el concepto médico; por defecto un año.">
              <div className="flex gap-2">
                <select
                  className={inputCls}
                  value={periodicidadOtra ? "otra" : f.periodicidadMeses}
                  onChange={(e) => {
                    if (e.target.value === "otra") setPeriodicidadOtra(true);
                    else {
                      setPeriodicidadOtra(false);
                      set("periodicidadMeses")(e.target.value);
                    }
                  }}
                >
                  {PERIODICIDADES.map((m) => (
                    <option key={m} value={String(m)}>
                      {m} meses{m === PERIODICIDAD_DEFECTO ? " (anual)" : ""}
                    </option>
                  ))}
                  <option value="otra">Otra…</option>
                </select>
                {periodicidadOtra && (
                  <input
                    type="number"
                    min={PERIODICIDAD_MIN}
                    max={PERIODICIDAD_MAX}
                    className={`${inputCls} w-24`}
                    value={f.periodicidadMeses}
                    onChange={(e) => set("periodicidadMeses")(e.target.value)}
                    aria-label="Meses"
                  />
                )}
              </div>
            </Campo>
            <div className="flex flex-col justify-end rounded-lg border border-[#E0E7FF] bg-[#EEF2FF] px-3 py-2 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-[#4338CA]">Próximo examen</span>
              <span className="font-semibold text-[#312E81]">{proximo ? fechaLarga(proximo) : "—"}</span>
            </div>
            <Campo etiqueta="Recomendaciones" ancho ayuda="Datos de salud: solo se ven en esta pantalla (no llegan al MCP ni a la API).">
              <textarea className={textareaCls} maxLength={MAX_TEXTO} value={f.recomendaciones} onChange={(e) => set("recomendaciones")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Observaciones" ancho>
              <textarea className={`${textareaCls} min-h-[60px]`} maxLength={MAX_TEXTO} value={f.observaciones} onChange={(e) => set("observaciones")(e.target.value)} placeholder="Repetir optometría, pendiente historia clínica…" />
            </Campo>
          </Seccion>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {examen ? "Guardar cambios" : "Registrar examen"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
