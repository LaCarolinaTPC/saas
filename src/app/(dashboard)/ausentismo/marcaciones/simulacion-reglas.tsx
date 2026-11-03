"use client";

/**
 * «Vista previa de los filtros»: a quién registra (o registraría) Gestivo con
 * los filtros guardados, en el día de la página o en cualquier otro del
 * calendario. Solo muestra; lo que escribe es la tarea `ausentismo.pendientes`
 * con estos mismos filtros. La lógica vive en
 * `src/lib/biometrico/reglas-pendientes.ts`.
 */
import { useState, useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import {
  ETIQUETA_TIPO_DIA,
  sumarDiasIso,
  tipoDeDia,
  ultimoDeTipo,
  type ExcluidoPrueba,
  type ReglasPendientes,
  type ResultadoPrueba,
  type TipoDia,
} from "@/lib/biometrico/reglas-pendientes";
import { fechaLarga } from "@/lib/biometrico/formato";
import { simularReglasEnFecha } from "./actions";

const COLOR_TIPO: Record<TipoDia, string> = {
  habil: "bg-[#F1F5F9] text-gray-700",
  sabado: "bg-[#E0F2FE] text-[#075985]",
  domingo: "bg-[#EDE9FE] text-[#5B21B6]",
  festivo: "bg-[#FCE7F3] text-[#9D174D]",
};

const ATAJOS: { tipo: TipoDia; texto: string }[] = [
  { tipo: "sabado", texto: "Último sábado" },
  { tipo: "domingo", texto: "Último domingo" },
  { tipo: "festivo", texto: "Último festivo" },
];

const ORIGEN_CHIP: Record<ExcluidoPrueba["origen"], string> = {
  despacho: "Despacho",
  historico: "Habitual",
  vehiculo: "Maestro bus",
  maestro: "Plantilla",
};

function describirReglas(r: ReglasPendientes): string {
  const partes: string[] = [];
  const crit = [r.criterio.sinHuella && "sin huella", r.criterio.sinDespacho && "sin despacho"].filter(Boolean);
  partes.push(crit.join(r.criterio.combinar === "y" ? " y " : " o "));
  if (r.horaLimiteHuella) partes.push("huella después de " + r.horaLimiteHuella + " cuenta como faltante");
  if (r.horaLimiteDespacho) partes.push("primer despacho después de " + r.horaLimiteDespacho + " cuenta como faltante");
  if (r.incluirPorSalir) partes.push("incluye viajes por salir");
  const apagados = (Object.keys(r.origenes) as ExcluidoPrueba["origen"][]).filter((o) => !r.origenes[o]);
  if (apagados.length) partes.push("sin origen " + apagados.map((o) => ORIGEN_CHIP[o]).join(", "));
  if (r.maxDiasSinRodar !== null) partes.push("máximo " + r.maxDiasSinRodar + " días sin rodar");
  if (!r.incluirNuncaRodo) partes.push("excluye a quien no ha rodado en 45 días");
  return partes.join(" · ");
}

export function SimulacionReglas({
  reglas,
  resultado: delDia,
  fecha,
  hoy,
}: {
  /**
   * Los filtros guardados. Quien usa el componente le pone `key` con ellos:
   * al guardar filtros nuevos se reinicia y vuelve al día de la página.
   */
  reglas: ReglasPendientes;
  /** La vista previa del día que muestra la página (viene con el servidor). */
  resultado: ResultadoPrueba;
  fecha: string;
  hoy: string;
}) {
  const [verExcluidos, setVerExcluidos] = useState(false);

  // El calendario propio de la sección: prueba otro día SIN mover la página.
  // `null` = seguir el día de la página, que se refresca solo con el servidor.
  const [elegida, setElegida] = useState<string | null>(null);
  const [cargado, setCargado] = useState<{ fecha: string; resultado: ResultadoPrueba } | null>(null);
  const [errorFecha, setErrorFecha] = useState<string | null>(null);
  const [cargando, inicioCarga] = useTransition();
  const fechaPrueba = elegida ?? fecha;

  function cargar(f: string) {
    setErrorFecha(null);
    inicioCarga(async () => {
      const r = await simularReglasEnFecha(f);
      if (!r.ok || !r.resultado) {
        setErrorFecha(r.error ?? "No se pudo simular ese día.");
        return;
      }
      setCargado({ fecha: f, resultado: r.resultado });
    });
  }

  function elegir(f: string) {
    if (!f || f > hoy) return;
    if (f === fecha) {
      setElegida(null);
      setErrorFecha(null);
      return;
    }
    setElegida(f);
    cargar(f);
  }

  const resultado: ResultadoPrueba | null =
    fechaPrueba === fecha ? delDia : cargado?.fecha === fechaPrueba ? cargado.resultado : null;
  const tipoPrueba = tipoDeDia(fechaPrueba);

  const dias = (Object.keys(reglas.dias) as (keyof ReglasPendientes["dias"])[])
    .filter((t) => reglas.dias[t].activo)
    .map((t) => ETIQUETA_TIPO_DIA[t] + " " + reglas.dias[t].hora);

  return (
    <section className="rounded-xl border border-[#C7D2FE] bg-white">
      <div className="border-b border-[#F1F5F9] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <ListChecks className="h-5 w-5 text-[#4F46E5]" />
            Vista previa de los filtros{resultado ? ` (${resultado.conteos.candidatos})` : ""}
          </h2>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          A quién registra Gestivo como «pendiente por clasificar» con los filtros guardados (se
          cambian en «Configurar filtros», en la sección «Sin despacho»). Elige otro día para ver
          cómo quedaría: mirar no registra nada.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          <strong>Filtros:</strong> {describirReglas(reglas)}.{" "}
          <strong>Días:</strong> {dias.length ? dias.join(", ") : "ninguno"}.
        </p>

        {/* Calendario de la prueba */}
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          <span className="font-medium text-gray-600">Probar en:</span>
          <button
            onClick={() => elegir(sumarDiasIso(fechaPrueba, -1))}
            disabled={cargando}
            aria-label="Día anterior"
            className="rounded-md border border-[#E2E8F0] bg-white p-1 text-gray-600 hover:bg-[#EEF2FF] disabled:opacity-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <input
            type="date"
            value={fechaPrueba}
            max={hoy}
            onChange={(e) => elegir(e.target.value)}
            aria-label="Día para probar los filtros"
            className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-[#4F46E5]"
          />
          <button
            onClick={() => elegir(sumarDiasIso(fechaPrueba, 1))}
            disabled={cargando || fechaPrueba >= hoy}
            aria-label="Día siguiente"
            className="rounded-md border border-[#E2E8F0] bg-white p-1 text-gray-600 hover:bg-[#EEF2FF] disabled:opacity-50"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <span className={`rounded-full px-2 py-0.5 font-medium ${COLOR_TIPO[tipoPrueba]}`}>
            {ETIQUETA_TIPO_DIA[tipoPrueba]}
          </span>
          <span className="text-gray-500">{fechaLarga(fechaPrueba)}</span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            {ATAJOS.map((a) => {
              const f = ultimoDeTipo(hoy, a.tipo);
              return (
                f && (
                  <button
                    key={a.tipo}
                    onClick={() => elegir(f)}
                    disabled={cargando}
                    title={fechaLarga(f)}
                    className={`rounded-full px-2 py-0.5 font-medium hover:opacity-80 disabled:opacity-50 ${COLOR_TIPO[a.tipo]}`}
                  >
                    {a.texto}
                  </button>
                )
              );
            })}
            {elegida && (
              <button
                onClick={() => elegir(fecha)}
                disabled={cargando}
                className="rounded-full border border-[#4F46E5] px-2 py-0.5 font-medium text-[#4F46E5] hover:bg-[#EEF2FF] disabled:opacity-50"
              >
                Volver al día de la página
              </button>
            )}
          </span>
        </div>
        {errorFecha && <p className="mt-1 text-xs text-[#B91C1C]">{errorFecha}</p>}

        {resultado ? (
          <Resumen
            resultado={resultado}
            esHoy={fechaPrueba === hoy}
            verExcluidos={verExcluidos}
            setVerExcluidos={setVerExcluidos}
          />
        ) : (
          <p className="mt-2 text-xs text-gray-500">
            {cargando ? "Calculando " + fechaLarga(fechaPrueba) + "…" : "Sin datos para ese día."}
          </p>
        )}
      </div>

      {resultado && (
        <div className={cargando ? "opacity-50 transition-opacity" : undefined}>
          <Detalle resultado={resultado} verExcluidos={verExcluidos} />
        </div>
      )}
    </section>
  );
}

function Resumen({
  resultado,
  esHoy,
  verExcluidos,
  setVerExcluidos,
}: {
  resultado: ResultadoPrueba;
  esHoy: boolean;
  verExcluidos: boolean;
  setVerExcluidos: (f: (v: boolean) => boolean) => void;
}) {
  const yaRegistrados = resultado.candidatos.filter((c) => c.yaTienePendiente).length;
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-xs">
      <span
        className={`rounded-lg px-2 py-1 ${
          resultado.diaActivo ? "bg-[#DCFCE7] text-green-800" : "bg-[#F1F5F9] text-gray-600"
        }`}
      >
        {ETIQUETA_TIPO_DIA[resultado.tipoDia]}:{" "}
        {resultado.diaActivo
          ? (esHoy ? "se registran desde las " : "corre desde las ") + resultado.horaCorte
          : "apagado en los filtros: ese día no se registra nada (así quedaría si se encendiera)"}
      </span>
      <span className="rounded-lg bg-[#EEF2FF] px-2 py-1 text-[#3730A3]">
        Cumplen los filtros: <strong>{resultado.conteos.candidatos}</strong>
      </span>
      <span className="rounded-lg bg-[#F1F5F9] px-2 py-1 text-gray-700">
        Ya tienen pendiente: <strong>{yaRegistrados}</strong>
      </span>
      <button
        onClick={() => setVerExcluidos((v) => !v)}
        disabled={resultado.excluidos.length === 0}
        className="rounded-lg bg-[#F1F5F9] px-2 py-1 text-gray-700 disabled:cursor-default"
      >
        Excluidos por filtro: <strong>{resultado.excluidos.length}</strong>
        {resultado.excluidos.length > 0 && (verExcluidos ? " ▲" : " ▼")}
      </button>
    </div>
  );
}

function Detalle({ resultado, verExcluidos }: { resultado: ResultadoPrueba; verExcluidos: boolean }) {
  return (
    <>
      {verExcluidos && resultado.excluidos.length > 0 && (
        <ListaRazones titulo="Cumplían el criterio, pero un filtro los sacó" filas={resultado.excluidos} />
      )}

      {resultado.candidatos.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-400">
          Con estos filtros nadie queda registrado este día.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F1F5F9] text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 font-medium">Conductor</th>
                <th className="px-3 py-2 font-medium">Origen</th>
                <th className="px-3 py-2 font-medium">Huella</th>
                <th className="px-3 py-2 font-medium">1er despacho</th>
                <th className="px-3 py-2 font-medium">Sin rodar</th>
                <th className="px-3 py-2 font-medium">Por qué</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {resultado.candidatos.map((c) => (
                <tr key={c.cedula} className="border-b border-[#F8FAFC] last:border-0">
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">{c.nombre}</div>
                    <div className="text-xs text-gray-500">
                      CC {c.cedula}
                      {c.codigo ? " · " + c.codigo : ""}
                      {c.bus ? " · bus " + c.bus : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{ORIGEN_CHIP[c.origen]}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-gray-600">{c.huella ?? "—"}</td>
                  <td className="px-3 py-2 text-xs tabular-nums text-gray-600">
                    {c.primerDespacho ?? (c.porSalir ? "por salir" : "—")}
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums text-gray-600">
                    {c.diasSinRodar === null ? "45+ días" : c.diasSinRodar + " d"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{c.motivos.join(" · ")}</td>
                  <td className="px-3 py-2 text-xs">
                    {c.yaTienePendiente ? (
                      <span className="whitespace-nowrap rounded-full bg-[#EEF2FF] px-2 py-0.5 font-medium text-[#3730A3]">
                        Ya tiene pendiente
                      </span>
                    ) : (
                      <span className="whitespace-nowrap rounded-full bg-[#F1F5F9] px-2 py-0.5 font-medium text-gray-600">
                        Sin registro
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ListaRazones({ titulo, filas }: { titulo: string; filas: ExcluidoPrueba[] }) {
  return (
    <div className="border-b border-[#F1F5F9] bg-[#F8FAFC] px-4 py-2">
      <p className="mb-1 text-xs font-semibold text-gray-700">{titulo}</p>
      <ul className="flex flex-col gap-0.5 text-xs text-gray-600">
        {filas.map((f) => (
          <li key={f.cedula}>
            <span className="font-medium text-gray-800">{f.nombre}</span> · CC {f.cedula} ·{" "}
            {ORIGEN_CHIP[f.origen]} — {f.razon}
          </li>
        ))}
      </ul>
    </div>
  );
}
