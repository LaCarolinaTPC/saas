"use client";

/**
 * Formulario de un accidente de trabajo (nuevo o edición): trabajador, el
 * accidente (fecha, hora, lesión, parte del cuerpo, mecanismo, agente,
 * descripción) y su seguimiento (incapacidad, notificación ARL, investigación,
 * cierre). Reglas en src/lib/sst/reglas.ts.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HardHat, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BuscadorOpciones, type OpcionBuscable } from "@/components/ui/buscador-opciones";
import type { OpcionTrabajador } from "@/lib/sst/data";
import { grupoParteCuerpoDe } from "@/lib/sst/historico";
import {
  AGENTES, ESTADOS_INVESTIGACION, GRUPOS_PARTE_CUERPO, MAX_TEXTO, MECANISMOS, TIPOS_LESION, type AccidenteTrabajo,
} from "@/lib/sst/reglas";
import { actualizarAccidenteTrabajo, crearAccidenteTrabajo } from "./actions";

type Formulario = Record<
  | "fechaAt" | "hora" | "fechaNotificacion" | "cedula" | "nombre" | "cargo" | "empresaUsuaria" | "ciudad" | "sexo"
  | "tipoLesion" | "parteCuerpo" | "parteCuerpoGrupo" | "mecanismo" | "agente" | "descripcion" | "diasIncapacidad"
  | "estadoInvestigacion" | "cierreAdministrativoArl" | "observaciones",
  string
> & { accidenteTransito: boolean };

function formularioDe(a: AccidenteTrabajo | null, hoy: string): Formulario {
  return {
    fechaAt: a?.fechaAt ?? hoy,
    hora: a?.hora ?? "",
    fechaNotificacion: a?.fechaNotificacion ?? "",
    cedula: a?.cedula ?? "",
    nombre: a?.nombre ?? "",
    cargo: a?.cargo ?? "",
    empresaUsuaria: a?.empresaUsuaria ?? "MTLC",
    ciudad: a?.ciudad ?? "Soledad",
    sexo: a?.sexo ?? "",
    tipoLesion: a?.tipoLesion ?? "",
    parteCuerpo: a?.parteCuerpo ?? "",
    parteCuerpoGrupo: a?.parteCuerpoGrupo ?? "",
    mecanismo: a?.mecanismo ?? "",
    agente: a?.agente ?? "",
    descripcion: a?.descripcion ?? "",
    accidenteTransito: a?.accidenteTransito ?? false,
    diasIncapacidad: String(a?.diasIncapacidad ?? 0),
    estadoInvestigacion: a?.estadoInvestigacion ?? "pendiente",
    cierreAdministrativoArl: a?.cierreAdministrativoArl == null ? "" : a.cierreAdministrativoArl ? "si" : "no",
    observaciones: a?.observaciones ?? "",
  };
}

const inputCls = "h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";
const textareaCls = "min-h-[84px] w-full resize-y rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-[#4F46E5]";

function Campo({ etiqueta, children, ancho = false }: { etiqueta: string; children: React.ReactNode; ancho?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${ancho ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{etiqueta}</span>
      {children}
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

const opciones = (lista: readonly { key: string; label: string }[], vacio = "Elija…") => (
  <>
    <option value="">{vacio}</option>
    {lista.map((o) => (
      <option key={o.key} value={o.key}>
        {o.label}
      </option>
    ))}
  </>
);

export function AccidenteTrabajoDialog({ accidente, trabajadores, hoy, onClose }: {
  /** null = nuevo. */
  accidente: AccidenteTrabajo | null;
  trabajadores: OpcionTrabajador[];
  hoy: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<Formulario>(() => formularioDe(accidente, hoy));
  const set = (k: keyof Formulario) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  // El grupo se propone a partir de lo escrito hasta que alguien lo elija a mano.
  const [grupoAMano, setGrupoAMano] = useState(Boolean(accidente));

  const opcionesTrabajador: OpcionBuscable[] = useMemo(
    () => trabajadores.map((t) => ({ valor: t.cedula, etiqueta: t.nombre, secundario: `CC ${t.cedula}${t.cargo ? ` · ${t.cargo}` : ""}`, claves: [t.cedula, t.nombre] })),
    [trabajadores]
  );

  function elegirTrabajador(cedula: string) {
    const t = trabajadores.find((x) => x.cedula === cedula);
    setF((x) => ({ ...x, cedula, nombre: t?.nombre ?? x.nombre, cargo: x.cargo || t?.cargo || "" }));
  }

  function escribirParte(v: string) {
    setF((x) => ({ ...x, parteCuerpo: v, parteCuerpoGrupo: grupoAMano ? x.parteCuerpoGrupo : v.trim() ? grupoParteCuerpoDe(v) : "" }));
  }

  function guardar() {
    const datos = {
      ...f,
      accidenteTransito: f.accidenteTransito,
      cierreAdministrativoArl: f.cierreAdministrativoArl === "si" ? true : f.cierreAdministrativoArl === "no" ? false : null,
    };
    start(async () => {
      const r = accidente ? await actualizarAccidenteTrabajo(accidente.id, datos) : await crearAccidenteTrabajo(datos);
      if (!r.success) {
        toast.error(r.error ?? "No se pudo guardar el accidente.");
        return;
      }
      toast.success(accidente ? `Caso ${r.accidente?.anio}-${r.accidente?.caso} actualizado.` : `Caso ${r.accidente?.anio}-${r.accidente?.caso} registrado.`);
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="h-5 w-5 text-[#4F46E5]" />
            {accidente ? `Accidente de trabajo · caso ${accidente.anio}-${accidente.caso}` : "Nuevo accidente de trabajo"}
          </DialogTitle>
          <DialogDescription>
            {accidente ? `${accidente.nombre}${accidente.cedula ? ` · CC ${accidente.cedula}` : ""}` : "El trabajador lesionado, cómo ocurrió y su seguimiento con la ARL."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Seccion titulo="Trabajador">
            <div className="sm:col-span-2">
              <BuscadorOpciones
                id="at-trabajador"
                opciones={opcionesTrabajador}
                value={f.cedula}
                onChange={elegirTrabajador}
                placeholder="Buscar en el maestro (nombre o cédula)"
                vacio={(q) => `Nadie coincide con «${q}»: escriba cédula y nombre abajo.`}
              />
            </div>
            <Campo etiqueta="Cédula">
              <input className={inputCls} inputMode="numeric" value={f.cedula} onChange={(e) => set("cedula")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Nombres y apellidos">
              <input className={inputCls} value={f.nombre} onChange={(e) => set("nombre")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Cargo">
              <input className={inputCls} value={f.cargo} onChange={(e) => set("cargo")(e.target.value)} placeholder="Conductor - cobrador" />
            </Campo>
            <Campo etiqueta="Sexo">
              <select className={inputCls} value={f.sexo} onChange={(e) => set("sexo")(e.target.value)}>
                {opciones([{ key: "M", label: "Masculino" }, { key: "F", label: "Femenino" }], "Sin indicar")}
              </select>
            </Campo>
            <Campo etiqueta="Empresa usuaria">
              <input className={inputCls} value={f.empresaUsuaria} onChange={(e) => set("empresaUsuaria")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Ciudad">
              <input className={inputCls} value={f.ciudad} onChange={(e) => set("ciudad")(e.target.value)} />
            </Campo>
          </Seccion>

          <Seccion titulo="Accidente">
            <Campo etiqueta="Fecha del accidente">
              <input type="date" className={inputCls} value={f.fechaAt} max={hoy} onChange={(e) => set("fechaAt")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Hora">
              <input type="time" className={inputCls} value={f.hora} onChange={(e) => set("hora")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Tipo de lesión">
              <select className={inputCls} value={f.tipoLesion} onChange={(e) => set("tipoLesion")(e.target.value)}>
                {opciones(TIPOS_LESION)}
              </select>
            </Campo>
            <Campo etiqueta="Parte del cuerpo (como se describe)">
              <input className={inputCls} value={f.parteCuerpo} onChange={(e) => escribirParte(e.target.value)} placeholder="Mano izquierda" />
            </Campo>
            <Campo etiqueta="Grupo de la parte del cuerpo">
              <select
                className={inputCls}
                value={f.parteCuerpoGrupo}
                onChange={(e) => {
                  setGrupoAMano(true);
                  set("parteCuerpoGrupo")(e.target.value);
                }}
              >
                {opciones(GRUPOS_PARTE_CUERPO)}
              </select>
            </Campo>
            <Campo etiqueta="Mecanismo">
              <select className={inputCls} value={f.mecanismo} onChange={(e) => set("mecanismo")(e.target.value)}>
                {opciones(MECANISMOS)}
              </select>
            </Campo>
            <Campo etiqueta="Agente">
              <select className={inputCls} value={f.agente} onChange={(e) => set("agente")(e.target.value)}>
                {opciones(AGENTES)}
              </select>
            </Campo>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={f.accidenteTransito}
                onChange={(e) => setF((x) => ({ ...x, accidenteTransito: e.target.checked }))}
                className="h-4 w-4 rounded border-[#CBD5E1]"
              />
              Fue un accidente de tránsito
            </label>
            <Campo etiqueta="Descripción del accidente" ancho>
              <textarea className={textareaCls} maxLength={MAX_TEXTO} value={f.descripcion} onChange={(e) => set("descripcion")(e.target.value)} />
            </Campo>
          </Seccion>

          <Seccion titulo="Seguimiento">
            <Campo etiqueta="Días de incapacidad">
              <input type="number" min={0} max={540} className={inputCls} value={f.diasIncapacidad} onChange={(e) => set("diasIncapacidad")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Fecha de notificación a la ARL">
              <input type="date" className={inputCls} value={f.fechaNotificacion} min={f.fechaAt} max={hoy} onChange={(e) => set("fechaNotificacion")(e.target.value)} />
            </Campo>
            <Campo etiqueta="Estado de la investigación">
              <select className={inputCls} value={f.estadoInvestigacion} onChange={(e) => set("estadoInvestigacion")(e.target.value)}>
                {opciones(ESTADOS_INVESTIGACION, "Sin registrar")}
              </select>
            </Campo>
            <Campo etiqueta="Cierre administrativo ARL">
              <select className={inputCls} value={f.cierreAdministrativoArl} onChange={(e) => set("cierreAdministrativoArl")(e.target.value)}>
                {opciones([{ key: "si", label: "Sí" }, { key: "no", label: "No" }], "Sin dato")}
              </select>
            </Campo>
            <Campo etiqueta="Observaciones" ancho>
              <textarea className={textareaCls} maxLength={MAX_TEXTO} value={f.observaciones} onChange={(e) => set("observaciones")(e.target.value)} />
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
              {accidente ? "Guardar cambios" : "Registrar accidente"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
