"use client";

/**
 * Persona en el control de exámenes periódicos (nueva o edición): grupo,
 * cargo, fecha de ingreso y si sigue en control. Sacarla (retiro u otro
 * motivo) la quita de los vencimientos sin borrar su historial.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserRoundCog } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BuscadorOpciones, type OpcionBuscable } from "@/components/ui/buscador-opciones";
import type { OpcionTrabajador } from "@/lib/sst/data";
import {
  GRUPOS_EXAMEN, MAX_TEXTO, MOTIVOS_INACTIVO, PERIODICIDAD_DEFECTO, PERIODICIDAD_MAX, PERIODICIDAD_MIN, esGrupo, sumarMeses, type PersonaExamen,
} from "@/lib/sst/examenes";
import { periodicidadPorCargo, type TablaProfesiograma } from "@/lib/sst/profesiograma";
import { guardarPersona } from "./actions";

const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

const inputCls = "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5] disabled:bg-gray-50 disabled:text-gray-500";

function Campo({ etiqueta, children, ancho = false }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${ancho ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{etiqueta}</span>
      {children}
    </label>
  );
}

export function PersonaDialog({ persona, personas, trabajadores, profesiograma, hoy, onClose }: {
  /** null = agregar al control. */
  persona: PersonaExamen | null;
  personas: Map<string, PersonaExamen>;
  trabajadores: OpcionTrabajador[];
  /** Profesiograma vigente: sugiere la periodicidad por cargo. */
  profesiograma: TablaProfesiograma;
  hoy: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState(() => ({
    cedula: persona?.cedula ?? "",
    nombre: persona?.nombre ?? "",
    cargo: persona?.cargo ?? "",
    grupo: persona?.grupo ?? "",
    fechaIngreso: persona?.fechaIngreso ?? "",
    periodicidadMeses: String(persona?.periodicidadMeses ?? PERIODICIDAD_DEFECTO),
    activo: persona?.activo ?? true,
    motivoInactivo: persona?.motivoInactivo ?? "",
    inactivoDesde: persona?.inactivoDesde ?? "",
    observaciones: persona?.observaciones ?? "",
  }));
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  // Periodicidad según el profesiograma. Al agregar se aplica sola mientras no
  // la escriban a mano; al editar solo se sugiere (puede venir del concepto médico).
  const [periodicidadTocada, setPeriodicidadTocada] = useState(Boolean(persona));
  const sugerida = esGrupo(f.grupo) ? periodicidadPorCargo(f.cargo, f.grupo, profesiograma) : null;
  /** Cambia cargo/grupo (y lo demás) y, si corresponde, la periodicidad sugerida. */
  const cambiar = (cambios: Partial<typeof f>) =>
    setF((x) => {
      const n = { ...x, ...cambios };
      if (!periodicidadTocada && esGrupo(n.grupo)) n.periodicidadMeses = String(periodicidadPorCargo(n.cargo, n.grupo, profesiograma).meses);
      return n;
    });
  const meses = Number(f.periodicidadMeses);
  const proximo = f.fechaIngreso && Number.isInteger(meses) && meses >= PERIODICIDAD_MIN ? sumarMeses(f.fechaIngreso, meses) : null;

  // Para agregar: el maestro activo que todavía no está en el control.
  const opciones: OpcionBuscable[] = useMemo(
    () =>
      trabajadores
        .filter((t) => !personas.has(t.cedula))
        .map((t) => ({ valor: t.cedula, etiqueta: t.nombre, secundario: `CC ${t.cedula}${t.cargo ? ` · ${t.cargo}` : ""}`, claves: [t.cedula, t.nombre] })),
    [personas, trabajadores]
  );
  const yaEsta = !persona && personas.has(f.cedula.replace(/\D/g, ""));

  function guardar() {
    start(async () => {
      const r = await guardarPersona(f, !persona);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(persona ? "Persona actualizada." : `${r.dato.nombre} entró al control.`);
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRoundCog className="h-5 w-5 text-[#4F46E5]" />
            {persona ? "Persona en control" : "Agregar al control"}
          </DialogTitle>
          <DialogDescription>
            {persona ? `${persona.nombre} · CC ${persona.cedula}` : "Quien entra al control aparece como «Sin examen» hasta que se le registre uno."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!persona && (
            <BuscadorOpciones
              id="persona-trabajador"
              opciones={opciones}
              value={f.cedula}
              onChange={(cedula) => {
                const t = trabajadores.find((x) => x.cedula === cedula);
                const esConductor = /conductor/i.test(t?.cargo ?? "");
                cambiar({
                  cedula,
                  nombre: t?.nombre ?? f.nombre,
                  cargo: t?.cargo ?? f.cargo,
                  // Del maestro: el grupo sale del cargo si todavía no lo eligieron.
                  grupo: f.grupo || (t ? (esConductor ? "conductores" : "administrativos") : ""),
                });
              }}
              placeholder="Buscar en el maestro (nombre o cédula)"
              vacio={(q) => `Nadie coincide con «${q}»: escriba cédula y nombre abajo.`}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Cédula">
              <input className={inputCls} inputMode="numeric" value={f.cedula} disabled={Boolean(persona)} onChange={(e) => set("cedula")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Nombre">
              <input className={inputCls} value={f.nombre} onChange={(e) => set("nombre")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Cargo o área">
              <input className={inputCls} value={f.cargo} onChange={(e) => cambiar({ cargo: e.target.value })} />
            </Campo>
            <Campo etiqueta="Grupo de control">
              <select className={inputCls} value={f.grupo} onChange={(e) => cambiar({ grupo: e.target.value })}>
                <option value="">Elija…</option>
                {GRUPOS_EXAMEN.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Fecha de ingreso">
              <input type="date" className={inputCls} value={f.fechaIngreso} max={hoy} onChange={(e) => set("fechaIngreso")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Periodicidad (meses)">
              <input
                type="number"
                min={PERIODICIDAD_MIN}
                max={PERIODICIDAD_MAX}
                className={inputCls}
                value={f.periodicidadMeses}
                onChange={(e) => {
                  setPeriodicidadTocada(true);
                  set("periodicidadMeses")(e.target.value);
                }}
                title="Sin exámenes periódicos, el primero vence a la fecha de ingreso + esta periodicidad; es también la que se propone al registrar un examen."
              />
            </Campo>
            {sugerida && (
              <p className="-mt-1 text-xs text-gray-500 sm:col-span-2">
                {sugerida.cargo
                  ? `Profesiograma: «${sugerida.cargo.cargo}», cada ${sugerida.meses} meses.`
                  : `El cargo no está en el profesiograma: se sugieren ${sugerida.meses} meses.`}
                {String(sugerida.meses) !== f.periodicidadMeses && (
                  <button type="button" onClick={() => set("periodicidadMeses")(String(sugerida.meses))} className="ml-1 font-medium text-[#4F46E5] hover:underline">
                    Usar {sugerida.meses} meses
                  </button>
                )}
                {proximo && (
                  <span className="block">
                    Sin exámenes registrados, el primero periódico vence el <strong className="text-gray-700">{fechaCorta(proximo)}</strong> (ingreso + {meses} meses).
                  </span>
                )}
              </p>
            )}
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
              <input type="checkbox" checked={f.activo} onChange={(e) => set("activo")(e.target.checked)} className="h-4 w-4 rounded border-[#CBD5E1]" />
              Sigue en control
            </label>
            {!f.activo && (
              <>
                <Campo etiqueta="Motivo de la salida">
                  <select className={inputCls} value={f.motivoInactivo} onChange={(e) => set("motivoInactivo")(e.target.value)}>
                    <option value="">Elija…</option>
                    {MOTIVOS_INACTIVO.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Desde">
                  <input type="date" className={inputCls} value={f.inactivoDesde || hoy} max={hoy} onChange={(e) => set("inactivoDesde")(e.target.value)} />
                </Campo>
              </>
            )}
            <Campo etiqueta="Observaciones" ancho>
              <textarea
                className="min-h-[60px] w-full resize-y rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-[#4F46E5]"
                maxLength={MAX_TEXTO}
                value={f.observaciones}
                onChange={(e) => set("observaciones")(e.target.value)}
              />
            </Campo>
          </div>
          {yaEsta && <p className="text-sm text-[#B45309]">Esa cédula ya está en el control: edítela desde la tabla.</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={pending || yaEsta}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {persona ? "Guardar cambios" : "Agregar"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
