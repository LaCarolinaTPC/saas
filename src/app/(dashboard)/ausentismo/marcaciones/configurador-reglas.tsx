"use client";

/**
 * Configurador de los filtros de pendientes automáticos.
 *
 * Lo que se guarda aquí **manda sobre la tarea real** desde la siguiente
 * pasada: a quién registra, qué días y desde qué hora (ver
 * `src/lib/biometrico/reglas-pendientes.ts`). La «Vista previa» de la página
 * muestra el efecto en cualquier día.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ETIQUETA_ORIGEN,
  ETIQUETA_TIPO_DIA,
  ORIGENES,
  TIPOS_DIA,
  reglasPorOmision,
  validarReglas,
  type ReglasPendientes,
} from "@/lib/biometrico/reglas-pendientes";
import { guardarFiltrosPendientes } from "./actions";

const copia = (r: ReglasPendientes): ReglasPendientes => JSON.parse(JSON.stringify(r));

const CAJA = "rounded-lg border border-[#E2E8F0] bg-white p-3";
const TITULO = "mb-2 text-sm font-semibold text-gray-900";
const AYUDA = "mb-2 text-xs text-gray-500";
const CHECK = "h-3.5 w-3.5 rounded border-gray-300";
const HORA =
  "rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-xs tabular-nums text-gray-700 disabled:opacity-50";

export function ConfiguradorReglas({
  reglas,
  horaReal,
  onGuardado,
}: {
  reglas: ReglasPendientes;
  /** La hora de antes de los filtros: «Restablecer» vuelve a ella en lunes a viernes. */
  horaReal: string;
  /** Después de guardar. */
  onGuardado?: () => void;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<ReglasPendientes>(() => copia(reglas));
  const [guardando, inicioGuardar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function abrir() {
    // Cada vez que se abre arranca de lo guardado: si otra persona cambió las
    // reglas, el refresco ya las trajo.
    setBorrador(copia(reglas));
    setError(null);
    setAbierto(true);
  }

  function cambiar(f: (r: ReglasPendientes) => void) {
    setBorrador((prev) => {
      const r = copia(prev);
      f(r);
      return r;
    });
  }

  function guardar() {
    const e = validarReglas(borrador);
    if (e) {
      setError(e);
      return;
    }
    setError(null);
    inicioGuardar(async () => {
      const r = await guardarFiltrosPendientes(borrador);
      if (!r.ok) {
        setError(r.error ?? "No se pudieron guardar los filtros.");
        return;
      }
      toast.success("Filtros guardados. Gestivo los usa desde la próxima pasada.");
      setAbierto(false);
      router.refresh();
      onGuardado?.();
    });
  }

  const c = borrador.criterio;

  return (
    <>
      <button
        onClick={abrir}
        className="inline-flex items-center gap-1 rounded-lg border border-[#4F46E5] px-2.5 py-1 text-xs font-medium text-[#4F46E5] hover:bg-[#EEF2FF]"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Configurar filtros
      </button>

      <Sheet open={abierto} onOpenChange={(o) => setAbierto(o)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Filtros para registrar pendientes</SheetTitle>
            <SheetDescription>
              Define a quién registra Gestivo como «pendiente por clasificar», qué días y desde qué
              hora. <strong>Se aplica desde la próxima pasada</strong>. Antes de guardar puedes
              revisar el efecto en la «Vista previa de los filtros», con cualquier día del
              calendario. El registro entra como pendiente: no cuenta como falta hasta que
              alguien lo clasifique.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-4 pb-4">
            {/* Criterio */}
            <div className={CAJA}>
              <p className={TITULO}>Criterio</p>
              <p className={AYUDA}>Qué tiene que faltar para que la persona se registre.</p>
              <div className="flex flex-col gap-1.5 text-sm text-gray-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className={CHECK}
                    checked={c.sinHuella}
                    onChange={(e) => cambiar((r) => { r.criterio.sinHuella = e.target.checked; })}
                  />
                  No puso la huella
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className={CHECK}
                    checked={c.sinDespacho}
                    onChange={(e) => cambiar((r) => { r.criterio.sinDespacho = e.target.checked; })}
                  />
                  No recibió el primer despacho (ningún viaje salió)
                </label>
              </div>
              {c.sinHuella && c.sinDespacho && (
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-700">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="combinar"
                      checked={c.combinar === "y"}
                      onChange={() => cambiar((r) => { r.criterio.combinar = "y"; })}
                    />
                    Las dos cosas (Y) — la regla original
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="combinar"
                      checked={c.combinar === "o"}
                      onChange={() => cambiar((r) => { r.criterio.combinar = "o"; })}
                    />
                    Cualquiera de las dos (O)
                  </label>
                </div>
              )}
            </div>

            {/* Horas límite */}
            <div className={CAJA}>
              <p className={TITULO}>Horas límite</p>
              <p className={AYUDA}>
                Opcional. Cuenta como faltante también lo que llegó tarde, no solo lo que no existe.
              </p>
              <HoraLimite
                etiqueta="Huella después de"
                valor={borrador.horaLimiteHuella}
                onChange={(v) => cambiar((r) => { r.horaLimiteHuella = v; })}
                defecto="06:00"
              />
              <HoraLimite
                etiqueta="Primer despacho después de"
                valor={borrador.horaLimiteDespacho}
                onChange={(v) => cambiar((r) => { r.horaLimiteDespacho = v; })}
                defecto="08:00"
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  className={CHECK}
                  checked={borrador.incluirPorSalir}
                  onChange={(e) => cambiar((r) => { r.incluirPorSalir = e.target.checked; })}
                />
                Contar como «sin despacho» a quien tiene un viaje asignado que aún no sale
              </label>
            </div>

            {/* Días */}
            <div className={CAJA}>
              <p className={TITULO}>Días y hora de corte</p>
              <p className={AYUDA}>
                En qué días corre y desde qué hora. Ojo con sábado, domingo y festivo: ahí «sin
                despacho» son casi todos descansos (83–94 personas un domingo). Conviene apagar
                «Solo plantilla» en el origen o limitar los días sin rodar.
              </p>
              <div className="flex flex-col gap-1.5">
                {TIPOS_DIA.map((t) => (
                  <div key={t} className="flex items-center justify-between gap-2 text-sm text-gray-700">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className={CHECK}
                        checked={borrador.dias[t].activo}
                        onChange={(e) => cambiar((r) => { r.dias[t].activo = e.target.checked; })}
                      />
                      {ETIQUETA_TIPO_DIA[t]}
                    </label>
                    <input
                      type="time"
                      className={HORA}
                      value={borrador.dias[t].hora}
                      disabled={!borrador.dias[t].activo}
                      aria-label={"Hora de corte de " + ETIQUETA_TIPO_DIA[t]}
                      onChange={(e) => cambiar((r) => { r.dias[t].hora = e.target.value; })}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Origen */}
            <div className={CAJA}>
              <p className={TITULO}>Origen del esperado</p>
              <p className={AYUDA}>
                Por qué se esperaba a la persona ese día. Apagar «Solo plantilla» evita registrar a
                quien no tenía bus programado (útil en fines de semana).
              </p>
              <div className="flex flex-col gap-1.5 text-sm text-gray-700">
                {ORIGENES.map((o) => (
                  <label key={o} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className={CHECK}
                      checked={borrador.origenes[o]}
                      onChange={(e) => cambiar((r) => { r.origenes[o] = e.target.checked; })}
                    />
                    {ETIQUETA_ORIGEN[o]}
                  </label>
                ))}
              </div>
            </div>

            {/* Días sin rodar */}
            <div className={CAJA}>
              <p className={TITULO}>Días sin rodar</p>
              <p className={AYUDA}>
                Quien lleva mucho sin rodar suele estar de vacaciones, inactivo o es un caso aparte.
              </p>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className={CHECK}
                  checked={borrador.maxDiasSinRodar !== null}
                  onChange={(e) => cambiar((r) => { r.maxDiasSinRodar = e.target.checked ? 7 : null; })}
                />
                Excluir a quien lleva más de
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={HORA + " w-16"}
                  value={borrador.maxDiasSinRodar ?? ""}
                  disabled={borrador.maxDiasSinRodar === null}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    cambiar((r) => { r.maxDiasSinRodar = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; });
                  }}
                />
                días sin rodar
              </label>
              <label className="mt-1.5 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className={CHECK}
                  checked={borrador.incluirNuncaRodo}
                  onChange={(e) => cambiar((r) => { r.incluirNuncaRodo = e.target.checked; })}
                />
                Incluir a quien no ha rodado en los últimos 45 días
              </label>
            </div>

            {error && <p className="text-xs text-[#B91C1C]">{error}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={() => setBorrador(reglasPorOmision(horaReal))}
                disabled={guardando}
                title="Sin huella y sin despacho, lunes a viernes no festivos, a la hora de siempre"
                className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                Restablecer a la regla original
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setAbierto(false)}
                  disabled={guardando}
                  className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-[#F8FAFC] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={guardando}
                  className="rounded-lg bg-[#4F46E5] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
                >
                  {guardando ? "Guardando…" : "Guardar filtros"}
                </button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function HoraLimite({
  etiqueta,
  valor,
  onChange,
  defecto,
}: {
  etiqueta: string;
  valor: string | null;
  onChange: (v: string | null) => void;
  defecto: string;
}) {
  return (
    <div className="mt-1 flex items-center justify-between gap-2 text-sm text-gray-700">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className={CHECK}
          checked={valor !== null}
          onChange={(e) => onChange(e.target.checked ? defecto : null)}
        />
        {etiqueta}
      </label>
      <input
        type="time"
        className={HORA}
        value={valor ?? ""}
        disabled={valor === null}
        aria-label={etiqueta}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}
