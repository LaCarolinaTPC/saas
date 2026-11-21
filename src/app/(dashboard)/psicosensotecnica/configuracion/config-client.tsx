"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { NOMBRE_PRUEBA, PRUEBAS } from "@/lib/psicosensotecnica/bateria";
import { CAMPOS_UMBRAL, CONFIG_POR_DEFECTO, INTENTOS_MAX, INTENTOS_MIN, type ConfigPsico } from "@/lib/psicosensotecnica/config";
import type { Equipo } from "@/lib/psicosensotecnica/tipos";
import { ESCALAS_CON_PERFIL, NOMBRE_GRUPO } from "@/lib/psicosensotecnica/cuestionarios";
import { useEnlacePublico } from "@/components/psicosensotecnica/comun";
import { codigoLegible } from "@/lib/pantalla/vinculacion-reglas";
import { codigoDeEquipo, guardarConfig, revocarEquipo } from "../actions";

const campo = "rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-50";
const boton = "rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E2E8F0] bg-white p-5">
      <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
      {ayuda && <p className="mt-1 text-sm text-gray-500">{ayuda}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Opcion({ marcada, titulo, detalle, onElegir, disabled }: { marcada: boolean; titulo: string; detalle: string; onElegir: () => void; disabled: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${marcada ? "border-primary bg-primary/5" : "border-border"}`}>
      <input type="radio" className="mt-1" checked={marcada} disabled={disabled} onChange={onElegir} />
      <span>
        <span className="block text-sm font-medium text-gray-900">{titulo}</span>
        <span className="block text-sm text-gray-500">{detalle}</span>
      </span>
    </label>
  );
}

export function ConfigClient({ config, equipos, puedeEditar }: { config: ConfigPsico; equipos: Equipo[]; puedeEditar: boolean }) {
  const router = useRouter();
  const [c, setC] = useState<ConfigPsico>(config);
  const enlace = useEnlacePublico();
  const [nombreEquipo, setNombreEquipo] = useState("");
  const [ocupado, enTransicion] = useTransition();
  const bloqueado = !puedeEditar || ocupado;

  const guardar = () =>
    enTransicion(async () => {
      const r = await guardarConfig(c);
      if (!r.success) return void toast.error(r.error);
      toast.success("Configuración guardada");
      router.refresh();
    });

  const pedirCodigo = (entrada: { id?: string; nombre?: string }) =>
    enTransicion(async () => {
      const r = await codigoDeEquipo(entrada);
      if (!r.success) return void toast.error(r.error);
      toast.success(`Código ${codigoLegible(r.codigo)}: escríbalo en el equipo antes de 10 minutos`);
      setNombreEquipo("");
      router.refresh();
    });

  const revocar = (id: string) =>
    enTransicion(async () => {
      const r = await revocarEquipo(id);
      if (!r.success) return void toast.error(r.error);
      toast.success("Equipo desvinculado");
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <Seccion titulo="Enlace de la prueba" ayuda="Es el mismo para todos: la persona entra y se identifica con su cédula.">
        <div className="flex gap-2">
          <input className={`${campo} flex-1`} readOnly value={enlace} onFocus={(e) => e.target.select()} />
          <button
            type="button"
            className={`${boton} inline-flex items-center gap-1.5`}
            onClick={() => navigator.clipboard.writeText(enlace).then(() => toast.success("Enlace copiado"), () => toast.error("No se pudo copiar"))}
          >
            <Copy className="h-4 w-4" /> Copiar
          </button>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={c.activo} disabled={bloqueado} onChange={(e) => setC({ ...c, activo: e.target.checked })} />
          La prueba está abierta (sin marcar, el enlace no recibe a nadie)
        </label>
      </Seccion>

      <Seccion titulo="Quién puede presentarla" ayuda="En los dos casos se pide la cédula. Una prueba asignada a una cédula siempre se puede presentar.">
        <div className="space-y-2">
          <Opcion
            marcada={c.acceso === "solo_candidatos"}
            disabled={bloqueado}
            onElegir={() => setC({ ...c, acceso: "solo_candidatos" })}
            titulo="Solo candidatos"
            detalle="La cédula debe tener la prueba asignada, un proceso de selección abierto o una ficha en Candidatos."
          />
          <Opcion
            marcada={c.acceso === "libre"}
            disabled={bloqueado}
            onElegir={() => setC({ ...c, acceso: "libre" })}
            titulo="Libre"
            detalle="Cualquier cédula. A quien no esté en Gestivo se le pide el nombre, y su prueba queda en la bandeja sin candidato."
          />
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm text-gray-700">
          Pruebas que puede presentar cada cédula sin una asignación nueva
          <input
            type="number"
            className={`${campo} w-20`}
            min={INTENTOS_MIN}
            max={INTENTOS_MAX}
            disabled={bloqueado}
            value={c.intentosMaximos}
            onChange={(e) => setC({ ...c, intentosMaximos: Number(e.target.value) })}
          />
        </label>
      </Seccion>

      <Seccion titulo="Dónde se presenta">
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-1" checked={c.exigirEquipoVinculado} disabled={bloqueado} onChange={(e) => setC({ ...c, exigirEquipoVinculado: e.target.checked })} />
          <span>
            Solo en equipos de la empresa
            <span className="block text-gray-500">Sin marcar, se puede presentar desde cualquier celular, tableta o computador.</span>
          </span>
        </label>

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Equipos vinculados</h3>
        <ul className="mt-2 divide-y divide-[#F1F5F9]">
          {equipos.filter((e) => e.activo).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{e.nombre}</p>
                <p className="text-xs text-gray-500">
                  {e.codigo ? (
                    <>
                      Código <span className="font-mono text-sm font-semibold text-gray-900">{codigoLegible(e.codigo)}</span> · ábralo en el equipo, en el enlace de la prueba
                    </>
                  ) : e.vinculado ? (
                    `Vinculado${e.ultimoUso ? ` · último uso ${new Date(e.ultimoUso).toLocaleDateString("es-CO")}` : ""}`
                  ) : (
                    "Sin vincular: el código venció"
                  )}
                </p>
              </div>
              {puedeEditar && (
                <div className="flex gap-2">
                  <button type="button" className={boton} disabled={ocupado} onClick={() => pedirCodigo({ id: e.id })}>
                    {e.vinculado ? "Vincular otro equipo" : "Código nuevo"}
                  </button>
                  <button type="button" className={boton} disabled={ocupado} onClick={() => revocar(e.id)}>
                    Quitar
                  </button>
                </div>
              )}
            </li>
          ))}
          {!equipos.some((e) => e.activo) && <li className="py-2.5 text-sm text-gray-500">Ningún equipo vinculado.</li>}
        </ul>
        {puedeEditar && (
          <div className="mt-3 flex gap-2">
            <input className={`${campo} flex-1`} placeholder="Nombre del equipo (p. ej. Tableta de selección)" value={nombreEquipo} onChange={(e) => setNombreEquipo(e.target.value)} />
            <button type="button" className={boton} disabled={ocupado || nombreEquipo.trim().length < 3} onClick={() => pedirCodigo({ nombre: nombreEquipo })}>
              Agregar equipo
            </button>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Pruebas de la batería">
        <div className="grid gap-2 sm:grid-cols-2">
          {PRUEBAS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={c.pruebas[p]} disabled={bloqueado} onChange={(e) => setC({ ...c, pruebas: { ...c.pruebas, [p]: e.target.checked } })} />
              {NOMBRE_PRUEBA[p]}
            </label>
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo="Umbrales de alerta"
        ayuda="Por encima de estos valores el sistema le resalta la métrica a la psicóloga. Son provisionales: no hay baremos validados para esta batería, así que solo orientan y nunca deciden el concepto. Cambiarlos no recalcula las pruebas ya presentadas."
      >
        <div className="space-y-2">
          {CAMPOS_UMBRAL.map((u) => (
            <label key={u.clave} className="flex items-center justify-between gap-3 text-sm text-gray-700">
              <span>{u.nombre}</span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  className={`${campo} w-24 text-right`}
                  min={u.min}
                  max={u.max}
                  step={u.unidad === "de 1 a 5" ? 0.1 : 1}
                  disabled={bloqueado}
                  value={c.umbrales[u.clave]}
                  onChange={(e) => setC({ ...c, umbrales: { ...c.umbrales, [u.clave]: Number(e.target.value) } })}
                />
                <span className="w-16 text-xs text-gray-500">{u.unidad}</span>
              </span>
            </label>
          ))}
        </div>
        {puedeEditar && (
          <button type="button" className="mt-3 text-xs text-gray-500 underline hover:text-gray-700" onClick={() => setC({ ...c, umbrales: { ...CONFIG_POR_DEFECTO.umbrales } })}>
            Volver a los valores sugeridos
          </button>
        )}
      </Seccion>

      <Seccion
        titulo="Perfil del cargo"
        ayuda="Lo que se espera de un conductor en cada escala de la prueba «Perfil del cargo», de 0 a 100. Dentro del rango la escala se ajusta al 100 %; fuera, baja según la distancia. Son valores de prueba propuestos por Gestivo: la psicóloga debe revisarlos."
      >
        {(["rasgo", "competencia", "riesgo"] as const).map((grupo) => (
          <div key={grupo} className="mb-4 last:mb-0">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{NOMBRE_GRUPO[grupo]}</h3>
            <div className="space-y-1.5">
              {ESCALAS_CON_PERFIL.filter((e) => e.grupo === grupo).map((e) => {
                const [min, max] = c.perfil[e.id] ?? [0, 100];
                const cambiar = (i: 0 | 1, v: number) => {
                  const r: [number, number] = [min, max];
                  r[i] = v;
                  setC({ ...c, perfil: { ...c.perfil, [e.id]: r } });
                };
                return (
                  <div key={e.id} className="flex items-center justify-between gap-3 text-sm text-gray-700">
                    <span title={e.descripcion}>{e.nombre}</span>
                    <span className="flex items-center gap-1.5">
                      <input type="number" aria-label={`${e.nombre}: mínimo`} className={`${campo} w-20 text-right`} min={0} max={100} disabled={bloqueado} value={min} onChange={(ev) => cambiar(0, Number(ev.target.value))} />
                      <span className="text-xs text-gray-400">a</span>
                      <input type="number" aria-label={`${e.nombre}: máximo`} className={`${campo} w-20 text-right`} min={0} max={100} disabled={bloqueado} value={max} onChange={(ev) => cambiar(1, Number(ev.target.value))} />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {puedeEditar && (
          <button type="button" className="mt-3 text-xs text-gray-500 underline hover:text-gray-700" onClick={() => setC({ ...c, perfil: { ...CONFIG_POR_DEFECTO.perfil } })}>
            Volver al perfil sugerido
          </button>
        )}
      </Seccion>

      {puedeEditar && (
        <div className="flex justify-end">
          <button type="button" disabled={ocupado} onClick={guardar} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {ocupado ? "Guardando…" : "Guardar la configuración"}
          </button>
        </div>
      )}
    </div>
  );
}
