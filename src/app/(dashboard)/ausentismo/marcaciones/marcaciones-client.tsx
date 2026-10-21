"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Bus, CalendarDays, CheckCircle2, ClipboardCheck, Clock,
  Fingerprint, Plus, RefreshCw, UserX,
} from "lucide-react";
import type { Concepto, VehiculoOpcion } from "@/lib/ausentismo/constants";
import { CONCEPTO_NO_JUSTIFICADA, type AusentismoRegistro } from "@/lib/ausentismo/constants";
import type { DatosMarcaciones } from "@/lib/biometrico/data";
import type { Esperado, FilaMarco, FilaPendiente, FilaTrabajo, Llegada } from "@/lib/biometrico/dia";
import {
  explicarPendientes,
  HORA_POR_OMISION,
} from "@/lib/biometrico/auto-pendientes";
import { RegistroForm, type RegistroInicial } from "../registro-form";
import { refrescarDespacho, guardarHoraPendientes } from "./actions";

/**
 * Hora y fecha de Colombia de cualquier instante ISO.
 *
 * Antes se leía el `HH:MM` del texto, y eso mostraba **UTC, cinco horas
 * adelantado**, en todo lo de esta pantalla. La causa: **PostgREST devuelve los
 * `timestamptz` normalizados a `+00:00`**, no en la zona en que se escribieron.
 * El agente manda `2026-10-13T06:42:10-05:00`, pero al releerlo vuelve como
 * `2026-10-13T11:42:10+00:00`.
 *
 * Así que salían mal las tres cosas: la hora de las marcaciones («Primera» y
 * «Última»), el último envío del agente y el último sync de GEMA.
 *
 * Con `America/Bogota` en vez de restar cinco horas a mano, que es la
 * convención del repo (`hoyBogota()` y las demás pantallas).
 */
const EN_BOGOTA = { timeZone: "America/Bogota" } as const;

function hora(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    ...EN_BOGOTA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(t));
}

function fechaCorta(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Intl.DateTimeFormat("es-CO", {
    ...EN_BOGOTA,
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(t));
}

/** `HH:MM:SS` de GEMA a `HH:MM`. Ya viene en hora de Colombia, sin zona. */
function horaCorta(h: string | null): string {
  return h && h.length >= 5 ? h.slice(0, 5) : "—";
}

/**
 * Estado de la huella del día. Es **solo información**: no entra en la
 * decisión de presencia, que la toma el despacho de GEMA. Hoy la mitad de los
 * conductores despachados no pasa la huella, así que un «no» no dice que
 * faltó.
 */
function ChipHuella({ marco, huella }: { marco: boolean; huella?: FilaMarco | null }) {
  return marco ? (
    // «Sí» y nada más: la hora y por dónde llegó van en sus propias columnas
    // (`CeldasHuella`). Última y cuántas, en el título.
    <span
      title={
        huella
          ? `Primera huella ${hora(huella.primera)}` +
            (huella.cantidad > 1
              ? ` · última ${hora(huella.ultima)} · ${huella.cantidad} marcaciones`
              : " · una sola marcación") +
            (huella.pines.length > 1 ? ` · pines ${huella.pines.join(", ")}` : "")
          : "Pasó la huella por el biométrico ese día"
      }
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-medium text-green-800"
    >
      <Fingerprint className="h-3 w-3" />
      Sí
    </span>
  ) : (
    <span
      title="No hay huella suya ese día. Informativo: hoy solo la mitad de los conductores despachados pasa por el biométrico, así que esto no prueba una ausencia."
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-gray-500"
    >
      <Fingerprint className="h-3 w-3" />
      No
    </span>
  );
}

const LLEGADA_TEXTO: Record<Llegada, string> = {
  lector: "Lector",
  ambas: "Lector y Access",
  access: "Access",
};

const LLEGADA_AYUDA: Record<Llegada, string> = {
  lector:
    "Llegó directo del lector, en tiempo real. Todavía nadie la descargó en ZKAccess; cuando lo hagan, quedará confirmada.",
  ambas:
    "Llegó directo del lector y después la confirmó la descarga de ZKAccess (Access.mdb). Es lo ideal.",
  access:
    "Llegó solo por el Access.mdb, cuando alguien descargó en ZKAccess: el lector no estaba conectado al agente, o fue antes de encender la lectura directa.",
};

const LLEGADA_CHIP: Record<Llegada, string> = {
  lector: "bg-[#EEF2FF] text-[#4338CA]",
  ambas: "bg-[#DCFCE7] text-green-800",
  access: "bg-[#F1F5F9] text-gray-600",
};

/**
 * Las dos columnas que acompañan a «Huella»: la hora de la PRIMERA huella del
 * día y por dónde llegó esa huella a Gestivo. «—» en las dos si no hay huella.
 */
function CeldasHuella({ huella }: { huella?: FilaMarco | null }) {
  return (
    <>
      <td className="px-3 py-2 text-sm tabular-nums text-gray-700">
        {huella ? hora(huella.primera) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-2">
        {huella ? <ChipLlegada llegada={huella.llegada} /> : <span className="text-gray-300">—</span>}
      </td>
    </>
  );
}

function ChipLlegada({ llegada }: { llegada: Llegada }) {
  return (
    <span
      title={LLEGADA_AYUDA[llegada]}
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${LLEGADA_CHIP[llegada]}`}
    >
      {LLEGADA_TEXTO[llegada]}
    </span>
  );
}

const ORIGEN_TEXTO: Record<Esperado["origen"], string> = {
  despacho: "GEMA registró que sacó ese bus ese día",
  historico: "conductor habitual del bus en los últimos 45 días",
  vehiculo: "conductor fijo del bus en el maestro",
  maestro: "no había programación del día: todo conductor activo",
};

const ORIGEN_CHIP: Record<Esperado["origen"], string> = {
  despacho: "Despacho",
  historico: "Habitual",
  vehiculo: "Maestro bus",
  maestro: "Plantilla",
};

function ChipOrigen({ fila }: { fila: Esperado }) {
  const debil = fila.origen === "historico" && (fila.confianza ?? 1) < 0.5;
  const color =
    fila.origen === "despacho"
      ? "bg-[#DCFCE7] text-green-800"
      : debil
        ? "bg-[#FEF3C7] text-[#B45309]"
        : "bg-[#EEF2FF] text-[#4338CA]";
  const detalle =
    fila.origen === "historico" && fila.confianza !== undefined
      ? ` (${Math.round(fila.confianza * 100)} % de los días)`
      : "";
  return (
    <span
      title={`De dónde se deduce que debía venir: ${ORIGEN_TEXTO[fila.origen]}${detalle}`}
      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}
    >
      {ORIGEN_CHIP[fila.origen]}
      {debil ? " ?" : ""}
    </span>
  );
}

function Ficha({
  icono: Icono,
  titulo,
  valor,
  detalle,
  tono = "normal",
}: {
  icono: typeof UserX;
  titulo: string;
  valor: number | string;
  detalle?: string;
  tono?: "normal" | "alerta" | "bien";
}) {
  const color =
    tono === "alerta"
      ? "border-[#FCD34D] bg-[#FFFBEB]"
      : tono === "bien"
        ? "border-[#A7F3D0] bg-[#F0FDF4]"
        : "border-[#E2E8F0] bg-white";
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <Icono className="h-4 w-4" />
        {titulo}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-[11px] leading-tight text-gray-500">{detalle}</p>}
    </div>
  );
}

export function MarcacionesClient({
  fecha,
  hoy,
  datos,
  conceptos,
  vehiculos,
  puedeEditar,
  error,
}: {
  fecha: string;
  hoy: string;
  datos: DatosMarcaciones | null;
  conceptos: Concepto[];
  vehiculos: VehiculoOpcion[];
  puedeEditar: boolean;
  error: string | null;
}) {
  const router = useRouter();
  // Conductor para el que se está registrando la novedad; null = panel cerrado.
  const [registrando, setRegistrando] = useState<RegistroInicial | null>(null);
  // Registro «pendiente» que se está clasificando; null = panel cerrado.
  const [clasificando, setClasificando] = useState<AusentismoRegistro | null>(null);
  const [extras, setExtras] = useState<Concepto[]>([]);
  // Filtro de huella sobre los que trabajaron: para ver de un golpe quién rodó
  // sin pasar por el biométrico. No cambia la conclusión de presencia.
  const [huella, setHuella] = useState<"todos" | "con" | "sin">("todos");
  const [refrescando, inicioRefresco] = useTransition();
  const [errorRefresco, setErrorRefresco] = useState<string | null>(null);

  // Hora a la que Gestivo deja escritos los pendientes, y si lo hace. Se
  // edita aquí mismo —en la sección donde se ve el efecto— y no en una
  // pantalla de configuración aparte: es lo que se pidió.
  //
  // El estado guarda SOLO lo que alguien esté editando sin guardar (`null` =
  // nada tocado): así los campos siguen al servidor sin sincronizar nada, y si
  // otra persona cambia la hora, el refresco de los 5 minutos la trae. Copiar
  // el valor del servidor a un estado propio obligaría a reconciliarlos.
  const horaServidor = datos?.pendientes.hora ?? HORA_POR_OMISION;
  const activoServidor = datos?.pendientes.activo ?? true;
  const [edicionHora, setEdicionHora] = useState<{ hora: string; activo: boolean } | null>(null);
  const autoHora = edicionHora?.hora ?? horaServidor;
  const autoActivo = edicionHora?.activo ?? activoServidor;
  const [guardandoHora, inicioHora] = useTransition();
  const [errorHora, setErrorHora] = useState<string | null>(null);

  // Mientras la pantalla del día esté abierta, se relee sola cada 5 minutos.
  //
  // No pide nada a GEMA por su cuenta: `router.refresh()` vuelve a correr el
  // servidor, y ahí la guarda de los 15 minutos decide si toca a GEMA o no. Así
  // los dos ritmos que se pidieron salen de un solo temporizador —datos cada 5,
  // GEMA cada 15— y **varias pestañas abiertas no multiplican las llamadas**:
  // la guarda y el candado viven en el servidor, no aquí.
  //
  // Se detiene con la pestaña oculta: diez pestañas olvidadas no deben estar
  // releyendo toda la tarde. Al volver a mirarla se relee si ya toca.
  // Arranca en 0 y NO en `Date.now()`: leer el reloj durante el renderizado es
  // una función impura, y el compilador de React lo rechaza («Cannot call
  // impure function during render»). Se siembra dentro del efecto, que es donde
  // sí se puede, y el 0 significa «aún no se ha refrescado».
  const ultimoRefresco = useRef(0);
  useEffect(() => {
    if (fecha !== hoy) return;
    const CADA_MS = 5 * 60_000;

    // La página acaba de pintarse con datos frescos del servidor, así que el
    // reloj de los 5 minutos empieza a contar ahora.
    if (ultimoRefresco.current === 0) ultimoRefresco.current = Date.now();

    const releer = () => {
      ultimoRefresco.current = Date.now();
      router.refresh();
    };
    const siToca = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimoRefresco.current < CADA_MS) return;
      releer();
    };

    const reloj = window.setInterval(siToca, 30_000);
    document.addEventListener("visibilitychange", siToca);
    return () => {
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", siToca);
    };
  }, [fecha, hoy, router]);
  const catalogo = useMemo(() => {
    const yaEstan = new Set(conceptos.map((c) => c.key));
    return [...conceptos, ...extras.filter((e) => !yaEstan.has(e.key))];
  }, [conceptos, extras]);

  function irA(f: string) {
    router.push(`/ausentismo/marcaciones?fecha=${f}`);
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm text-[#991B1B]">
          <p className="font-semibold">No se pudieron leer las marcaciones</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs">
            Si las tablas del biométrico no existen todavía, falta aplicar la migración
            <code className="mx-1 rounded bg-white px-1">20261019162914_marcaciones_del_biometrico_zkaccess.sql</code>
            en el SQL Editor. Ver <strong>docs/biometrico-marcaciones.md</strong>.
          </p>
        </div>
      </div>
    );
  }
  if (!datos) return null;

  const { resumen, ultimoRodado, porClasificar, agente, esperados } = datos;
  // Huella del día por cédula, para poder poner la HORA en el chip. Sale de
  // `resumen.marcaron`, que ya trae primera, última y cuántas: no hace falta
  // leer nada más.
  const huellaPor = new Map(resumen.marcaron.map((m) => [m.cedula, m]));
  const marcaron = resumen.marcaron.length;

  const trabajaronSinHuella = resumen.trabajaron.filter((f) => !f.marco).length;
  // Novedad registrada Y viaje que rodó: una de las dos está mal.
  const contradicciones = resumen.conNovedad.filter((f) => f.trabajo);
  // Sin despacho pero con huella: la persona vino y no le dieron bus. No es
  // una ausencia, y es hasta la mitad de la lista.
  const vinoSinDespacho = resumen.sinDespacho.filter((f) => f.marco);
  const sinRastro = resumen.sinDespacho.filter((f) => !f.marco);
  // De esos, los que ya tienen el registro que dejó Gestivo y nadie clasificó.
  const porClasificarAqui = sinRastro.filter((f) => porClasificar[f.cedula]).length;

  // ¿Gestivo va a escribir el registro de los «sin rastro» de ESTE día?
  //
  // De esto depende que esas filas lleven botón o no. El botón se quita solo
  // cuando sobra; si Gestivo no va a escribir —apagado, día pasado, domingo o
  // festivo, o falló el intento— el botón tiene que volver, porque si no se
  // quedaría gente sin ninguna forma de registrarla.
  const gestivoEscribe =
    datos.pendientes.activo &&
    !datos.pendientes.error &&
    (datos.pendientes.motivo === null || datos.pendientes.motivo === "aun_no_es_la_hora");
  const trabajaronFiltrados =
    huella === "todos"
      ? resumen.trabajaron
      : resumen.trabajaron.filter((f) => (huella === "con" ? f.marco : !f.marco));

  // Color del estado del agente. Ya no bloquea la lectura del día —la presencia
  // sale del despacho— pero la columna de huella sí depende de él.
  const atraso = agente.atrasoMin;
  const agenteTono =
    agente.ultimoError || atraso === null || atraso > 120
      ? "alerta"
      : atraso > 30
        ? "ojo"
        : "bien";

  function celdaConductor(f: Esperado) {
    return (
      <td className="px-3 py-2">
        <p className="font-medium text-gray-900">{f.nombre || "(sin nombre)"}</p>
        <p className="text-xs text-gray-500">
          CC {f.cedula}
          {f.codigo ? ` · cód. ${f.codigo}` : ""}
        </p>
      </td>
    );
  }

  function celdaBus(bus: string | null) {
    return (
      <td className="px-3 py-2 text-sm text-gray-600">
        {bus ? (
          <span className="inline-flex items-center gap-1">
            <Bus className="h-3.5 w-3.5 text-gray-400" />
            {bus}
          </span>
        ) : (
          "—"
        )}
      </td>
    );
  }

  // `conBoton` en false para «sin rastro del día» cuando Gestivo sí va a
  // escribir el registro ese día (ver `gestivoEscribe`): ahí el botón sobra.
  // Se conserva siempre para los otros dos grupos, que NUNCA se registran
  // solos: quien vino y no lo despacharon (no es una ausencia) y quien tiene
  // turno sin empezar.
  function filaPendiente(f: FilaPendiente, conBoton = true) {
    const ultimo = ultimoRodado[f.cedula];
    // Si Gestivo ya le dejó el registro, la fila cambia: deja de pedir que se
    // registre y pide que se clasifique.
    const pendiente = porClasificar[f.cedula];
    return (
      <tr key={f.cedula} className="border-b border-[#F1F5F9] last:border-0">
        {celdaConductor(f)}
        {celdaBus(f.bus)}
        <td className="px-3 py-2">
          <ChipOrigen fila={f} />
        </td>
        <td className="px-3 py-2">
          <ChipHuella marco={f.marco} huella={huellaPor.get(f.cedula)} />
        </td>
        <CeldasHuella huella={huellaPor.get(f.cedula)} />
        <td className="px-3 py-2 text-sm tabular-nums text-gray-600">
          {ultimo ? (
            <span title={`Último viaje que rodó: ${ultimo.fecha}`}>
              {fechaCorta(ultimo.fecha)}
              <span
                className={`ml-1 text-xs ${ultimo.dias >= 5 ? "font-medium text-[#B45309]" : "text-gray-400"}`}
              >
                (hace {ultimo.dias} {ultimo.dias === 1 ? "día" : "días"})
              </span>
            </span>
          ) : (
            <span
              className="text-[#B45309]"
              title={`No rodó ningún día en los ${esperados.diasVentana} anteriores`}
            >
              sin rodar en {esperados.diasVentana} días
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          {pendiente ? (
            // Ya tiene registro, pero sin clasificar: sigue en la lista hasta
            // que alguien decida qué fue. El botón abre el MISMO registro.
            <span className="inline-flex items-center gap-2">
              <span
                title={
                  "Registro creado por Gestivo automáticamente, no por una persona." +
                  " Entró como «pendiente por clasificar» y no cuenta como falta." +
                  (pendiente.created_by_email ? `\nFirmado: ${pendiente.created_by_email}` : "")
                }
                className="whitespace-nowrap rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-medium text-[#4F46E5]"
              >
                lo registró Gestivo
              </span>
              {puedeEditar && (
                <button
                  onClick={() => setClasificando(pendiente)}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-[#B45309] px-2.5 py-1 text-xs font-medium text-[#B45309] hover:bg-[#FFFBEB]"
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Clasificar
                </button>
              )}
            </span>
          ) : (
            conBoton &&
            puedeEditar && (
              <button
                onClick={() =>
                  setRegistrando({
                    cedula: f.cedula,
                    codigo: f.codigo,
                    nombre: f.nombre,
                    tipo: CONCEPTO_NO_JUSTIFICADA,
                  })
                }
                className="inline-flex items-center gap-1 rounded-lg border border-[#4F46E5] px-2.5 py-1 text-xs font-medium text-[#4F46E5] hover:bg-[#EEF2FF]"
              >
                <Plus className="h-3.5 w-3.5" />
                Registrar novedad
              </button>
            )
          )}
        </td>
      </tr>
    );
  }

  const cabeceraPendiente = (
    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
      <th className="px-3 py-2 font-medium">Conductor</th>
      <th className="px-3 py-2 font-medium">Bus esperado</th>
      <th className="px-3 py-2 font-medium">Se esperaba por</th>
      <th className="px-3 py-2 font-medium">Huella</th>
      <th className="px-3 py-2 font-medium">Hora</th>
      <th className="px-3 py-2 font-medium">Llegó por</th>
      <th className="px-3 py-2 font-medium">Último día que rodó</th>
      <th />
    </tr>
  );

  function filaTrabajo(f: FilaTrabajo) {
    const v = f.primerViaje;
    return (
      <tr key={f.cedula} className="border-b border-[#F1F5F9] last:border-0">
        {celdaConductor(f)}
        <td className="px-3 py-2 text-sm font-medium tabular-nums text-gray-900">
          {horaCorta(v.hora)}
        </td>
        {celdaBus(v.bus)}
        <td className="px-3 py-2 text-xs text-gray-500">
          {v.turno !== null ? `turno ${v.turno}` : "—"}
          {v.viaje !== null ? ` · viaje ${v.viaje}` : ""}
        </td>
        <td className="px-3 py-2 text-xs text-gray-500">{v.ruta ?? "—"}</td>
        <td className="px-3 py-2 text-sm tabular-nums text-gray-600">{v.viajes}</td>
        <td className="px-3 py-2">
          <ChipHuella marco={f.marco} huella={huellaPor.get(f.cedula)} />
        </td>
        <CeldasHuella huella={huellaPor.get(f.cedula)} />
      </tr>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* ── Fecha y estado del agente ───────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Día</label>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            <input
              type="date"
              value={fecha}
              max={hoy}
              onChange={(e) => e.target.value && irA(e.target.value)}
              className="h-9 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm text-gray-700 outline-none focus:border-[#4F46E5]"
            />
            {fecha !== hoy && (
              <button
                onClick={() => irA(hoy)}
                className="text-xs font-medium text-[#4F46E5] hover:underline"
              >
                Hoy
              </button>
            )}
          </div>
        </div>

        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            agenteTono === "alerta"
              ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]"
              : agenteTono === "ojo"
                ? "border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]"
                : "border-[#A7F3D0] bg-[#F0FDF4] text-[#065F46]"
          }`}
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <Clock className="h-3.5 w-3.5" />
            Agente del biométrico
          </p>
          <p className="mt-0.5">
            {agente.ultimoEnvioAt
              ? `Último envío: ${fechaCorta(agente.ultimoEnvioAt)} ${hora(agente.ultimoEnvioAt)}` +
                (atraso !== null ? ` · hace ${atraso} min` : "")
              : "Nunca ha reportado"}
          </p>
          <p className="mt-0.5 opacity-80">
            {agente.delDia.toLocaleString("es-CO")} huella
            {agente.delDia === 1 ? "" : "s"} {fecha === hoy ? "hoy" : `el ${fechaCorta(fecha)}`}
            {agente.ultimaMarcacionAt
              ? ` · la última que llegó, del ${fechaCorta(agente.ultimaMarcacionAt)} ${hora(agente.ultimaMarcacionAt)}`
              : ""}
          </p>
          {agente.ultimoError && (
            <p className="mt-1 max-w-sm font-medium">Último error: {agente.ultimoError}</p>
          )}
          {agenteTono !== "bien" && (
            <p className="mt-1 max-w-sm font-medium">
              Mientras el agente no reporte, la columna «Huella» queda incompleta. La presencia no
              depende de él: sale del despacho de GEMA.
            </p>
          )}
        </div>
      </div>

      {/* ── Fichas ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Ficha
          icono={Bus}
          titulo="Se esperaban"
          valor={esperados.total}
          detalle={
            esperados.conProgramacion
              ? "conductores activos y programación del día"
              : "sin programación: conductores activos"
          }
        />
        <Ficha
          icono={CheckCircle2}
          titulo="Trabajaron"
          valor={resumen.trabajaron.length}
          detalle="tienen un viaje que salió a rodar"
          tono="bien"
        />
        <Ficha
          icono={Clock}
          titulo="Turno sin empezar"
          valor={resumen.porSalir.length}
          detalle="tienen viajes de hoy que aún no salen"
        />
        <Ficha
          icono={UserX}
          titulo="Sin despacho"
          valor={resumen.sinDespacho.length}
          detalle={
            // El de «por clasificar» va primero: es lo único que hay que hacer.
            porClasificarAqui > 0
              ? `${porClasificarAqui} con registro de Gestivo, por clasificar`
              : vinoSinDespacho.length > 0
                ? `${vinoSinDespacho.length} de ellos SÍ pasaron la huella: vinieron`
                : "ni viaje, ni turno pendiente, ni novedad"
          }
          tono={resumen.sinDespacho.length > 0 ? "alerta" : "normal"}
        />
        <Ficha
          icono={ClipboardCheck}
          titulo="Con novedad"
          valor={resumen.conNovedad.length}
          detalle="ya registrada: fuera de las otras cuentas"
        />
      </div>

      {/* La huella, aparte y en chico: no decide nada. */}
      <p className="text-xs text-gray-500">
        <Fingerprint className="mr-1 inline h-3.5 w-3.5 text-gray-400" />
        De los {resumen.trabajaron.length} que rodaron,{" "}
        <strong>{trabajaronSinHuella}</strong> no pasaron la huella. Es informativo: hoy solo la
        mitad de los conductores despachados pasa por el biométrico.
      </p>

      {/* Qué tan al día está el despacho. Importa porque de ahí sale la
          presencia: si el dato está viejo, alguien que ya salió a rodar
          todavía aparecería sin despacho. */}
      <div
        className={`rounded-xl border px-4 py-2.5 text-xs ${
          datos.despacho.error || errorRefresco
            ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#991B1B]"
            : "border-[#E2E8F0] bg-white text-gray-600"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            <span className="font-semibold">Despacho de GEMA</span>
            {datos.despacho.actualizadoAt ? (
              <span>
                traído {fechaCorta(datos.despacho.actualizadoAt)}{" "}
                {hora(datos.despacho.actualizadoAt)}
                {datos.despacho.edadMin !== null && (
                  <span className="text-gray-400"> · hace {datos.despacho.edadMin} min</span>
                )}
              </span>
            ) : (
              <span className="text-[#B45309]">nunca se ha traído</span>
            )}
            {datos.despacho.refrescado && (
              <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 font-medium text-green-800">
                recién actualizado
                {datos.despacho.ms ? ` en ${(datos.despacho.ms / 1000).toFixed(1)} s` : ""}
              </span>
            )}
            {datos.despacho.motivo === "no es hoy" && (
              <span className="text-gray-400">(día cerrado: lo actualiza el sync diario)</span>
            )}
            {datos.despacho.motivo === "lo está trayendo otro" && (
              <span className="text-gray-400">(otra pestaña lo está trayendo)</span>
            )}
            {fecha === hoy && (
              <span className="text-gray-400">· la pantalla se relee sola cada 5 min</span>
            )}
          </p>

          {/* Traerlo ahora, sin esperar la ventana de 15 minutos: para quien
              acaba de despachar un bus y quiere verlo reflejado. */}
          <button
            onClick={() => {
              setErrorRefresco(null);
              inicioRefresco(async () => {
                const r = await refrescarDespacho();
                if (!r.ok) setErrorRefresco(r.error ?? "No se pudo traer el despacho.");
                else router.refresh();
              });
            }}
            disabled={refrescando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refrescando ? "animate-spin" : ""}`} />
            {refrescando ? "Trayendo de GEMA…" : "Actualizar desde GEMA"}
          </button>
        </div>
        {datos.despacho.error && (
          <p className="mt-1 font-medium">
            No se pudo traer el despacho de hoy: {datos.despacho.error}. Lo que ves es lo último
            guardado, así que puede faltar gente que ya salió a rodar.
          </p>
        )}
        {errorRefresco && <p className="mt-1 font-medium">{errorRefresco}</p>}
      </div>

      {/* La contradicción, arriba y con nombre: tiene novedad registrada y aun
          así GEMA le registró un viaje que rodó. Hay que arreglar una de las
          dos, y por eso no basta con marcarla en la tabla de abajo. */}
      {contradicciones.length > 0 && (
        <div className="rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            {contradicciones.length === 1
              ? "Hay 1 conductor con novedad registrada que sí rodó"
              : `Hay ${contradicciones.length} conductores con novedad registrada que sí rodaron`}
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {contradicciones.map((f) => (
              <li key={f.cedula}>
                <strong>{f.nombre || f.cedula}</strong> (CC {f.cedula}) · salió a las{" "}
                {horaCorta(f.primerViaje?.hora ?? null)}
                {f.primerViaje?.bus ? ` en el bus ${f.primerViaje.bus}` : ""}
                {f.primerViaje?.viajes ? ` · ${f.primerViaje.viajes} viaje(s)` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs">
            Hay que resolverlo: o la novedad quedó mal puesta —y se corrige en{" "}
            <strong>Ausentismo › Registro del día</strong>— o el viaje se le cargó en GEMA a la
            persona equivocada. Mientras siga así, esa persona no cuenta en ninguna de las fichas.
          </p>
        </div>
      )}

      {/* Avisos de calidad del dato: el despacho de hoy puede estar a medias. */}
      {(esperados.despachoSincronizadoHasta !== null || esperados.busesSinConductor.length > 0) && (
        <div className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs text-gray-600">
          {esperados.despachoSincronizadoHasta && (
            <p>
              Despacho de GEMA sincronizado hasta el{" "}
              <strong>{fechaCorta(esperados.despachoSincronizadoHasta)}</strong>
              {esperados.despachoSincronizadoHasta < fecha && (
                <span className="text-[#B45309]">
                  {" "}
                  — para este día aún no hay viajes, así que los esperados salen del histórico de
                  cada bus.
                </span>
              )}
            </p>
          )}
          {esperados.busesSinConductor.length > 0 && (
            <p className="mt-1">
              {esperados.busesSinConductor.length} bus(es) programados sin conductor deducible:{" "}
              <span className="font-medium">{esperados.busesSinConductor.join(", ")}</span>
            </p>
          )}
        </div>
      )}

      {/* ── Formulario (el mismo de Ausentismo) ─────────────────────────── */}
      {registrando && (
        <RegistroForm
          fecha={fecha}
          hoy={hoy}
          registro={null}
          vehiculos={vehiculos}
          conceptos={catalogo}
          puedeEditar={puedeEditar}
          inicial={registrando}
          onConceptoCreado={(c) => setExtras((p) => [...p, c])}
          onDone={() => {
            setRegistrando(null);
            router.refresh();
          }}
        />
      )}

      {/* Clasificar lo que dejó Gestivo: es el MISMO formulario, pero en modo
          edición sobre el registro que ya existe. No se crea otro: se le
          cambia el concepto al pendiente, y con eso sale de la lista. */}
      {clasificando && (
        <RegistroForm
          fecha={fecha}
          hoy={hoy}
          registro={clasificando}
          vehiculos={vehiculos}
          conceptos={catalogo}
          puedeEditar={puedeEditar}
          onConceptoCreado={(c) => setExtras((p) => [...p, c])}
          onDone={() => {
            setClasificando(null);
            router.refresh();
          }}
        />
      )}

      {/* ── Sin despacho ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#F1F5F9] px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <UserX className="h-5 w-5 text-[#DC2626]" />
            Sin despacho ({resumen.sinDespacho.length})
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Se esperaban y GEMA no les registró ningún viaje que haya salido, no tienen turno
            pendiente para hoy y no tienen novedad. <strong>Incluye los descansos</strong>: Gestivo
            no tiene calendario de turnos, así que a los que no dejan rastro les deja el registro
            escrito como <strong>pendiente por clasificar</strong> —que no cuenta como falta— y
            queda decidir qué fue.
            {vinoSinDespacho.length > 0 && (
              <>
                {" "}
                Y <strong>{vinoSinDespacho.length} pasaron la huella</strong>: esos vinieron, así
                que van primero y aparte, y a esos Gestivo <strong>no</strong> les registra nada.
              </>
            )}
          </p>

          {/* Qué hizo Gestivo solo, y a qué hora lo hace. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-[#F8FAFC] px-3 py-2">
            <ClipboardCheck
              className={`h-4 w-4 shrink-0 ${
                datos.pendientes.error ? "text-[#B45309]" : "text-[#4F46E5]"
              }`}
            />
            <span className="text-xs text-gray-600">{explicarPendientes(datos.pendientes)}</span>
            {puedeEditar && (
              <span className="ml-auto flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={autoActivo}
                    onChange={(e) => setEdicionHora({ hora: autoHora, activo: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                  Registrar solo
                </label>
                <input
                  type="time"
                  value={autoHora}
                  onChange={(e) => setEdicionHora({ hora: e.target.value, activo: autoActivo })}
                  aria-label="Hora a la que Gestivo registra los pendientes"
                  className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-xs tabular-nums text-gray-700"
                />
                <button
                  onClick={() => {
                    setErrorHora(null);
                    inicioHora(async () => {
                      const r = await guardarHoraPendientes(autoHora, autoActivo);
                      if (!r.ok) {
                        setErrorHora(r.error ?? "No se pudo guardar la hora.");
                        return;
                      }
                      // Ya es lo que dice el servidor: los campos vuelven a
                      // seguirlo, y el refresco trae lo que haya hecho.
                      setEdicionHora(null);
                      router.refresh();
                    });
                  }}
                  disabled={guardandoHora}
                  className="rounded-lg border border-[#4F46E5] px-2.5 py-1 text-xs font-medium text-[#4F46E5] hover:bg-[#EEF2FF] disabled:opacity-50"
                >
                  {guardandoHora ? "Guardando…" : "Guardar"}
                </button>
              </span>
            )}
          </div>
          {errorHora && <p className="mt-1 text-xs text-[#B91C1C]">{errorHora}</p>}
        </div>
        {resumen.sinDespacho.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            Todos los esperados rodaron, tienen turno pendiente o ya tienen su novedad.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">{cabeceraPendiente}</thead>

              {/* Con huella: la persona VINO. No es una ausencia, es que no le
                  dieron bus. Van primero porque son las que no hay que
                  registrar, y medido son hasta la mitad de la lista. */}
              {vinoSinDespacho.length > 0 && (
                <tbody>
                  <tr className="bg-[#FFFBEB]">
                    <td colSpan={8} className="px-3 py-2 text-xs text-[#92400E]">
                      <span className="font-semibold">
                        Vinieron y no los despacharon ({vinoSinDespacho.length})
                      </span>{" "}
                      — pasaron la huella, así que <strong>no es una ausencia</strong>. Antes de
                      registrar nada hay que averiguar por qué no se les dio bus.
                    </td>
                  </tr>
                  {vinoSinDespacho.map((f) => filaPendiente(f))}
                </tbody>
              )}

              {/* Sin huella y sin despacho: estos sí son los candidatos. */}
              {sinRastro.length > 0 && (
                <tbody>
                  {/* Esta cabecera ya no es opcional: es donde se explica por
                      qué estas filas no traen botón —Gestivo las escribe él
                      mismo— y sin ella la ausencia del botón parecería una
                      falla. */}
                  <tr className="bg-[#F8FAFC]">
                    <td colSpan={8} className="px-3 py-2 text-xs text-gray-600">
                      <span className="font-semibold">Sin rastro del día ({sinRastro.length})</span>{" "}
                      — ni viaje ni huella. Puede ser un descanso: Gestivo no tiene calendario de
                      turnos, así que{" "}
                      {gestivoEscribe ? (
                        <>
                          a estos les deja el registro escrito{" "}
                          <strong>a las {datos.pendientes.hora}</strong> como «pendiente por
                          clasificar» —no cuenta como falta— y después alguien decide qué fue.
                        </>
                      ) : (
                        <>
                          no decide él. Y <strong>este día no lo registra solo</strong>, así que
                          quedan sin novedad hasta que alguien los registre.
                        </>
                      )}
                      {porClasificarAqui > 0 && (
                        <>
                          {" "}
                          <strong>
                            {porClasificarAqui === 1
                              ? "Uno ya tiene su registro"
                              : `${porClasificarAqui} ya tienen su registro`}
                          </strong>{" "}
                          y sigue{porClasificarAqui === 1 ? "" : "n"} aquí hasta que alguien les
                          cambie el concepto en Ausentismo.
                        </>
                      )}
                    </td>
                  </tr>
                  {sinRastro.map((f) => filaPendiente(f, !gestivoEscribe))}
                </tbody>
              )}
            </table>
          </div>
        )}
      </section>

      {/* ── Turno sin empezar ───────────────────────────────────────────── */}
      {resumen.porSalir.length > 0 && (
        <section className="rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#F1F5F9] px-4 py-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Clock className="h-5 w-5 text-[#4F46E5]" />
              Turno sin empezar ({resumen.porSalir.length})
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              GEMA les asignó viajes hoy que todavía no salen. <strong>No son ausencias</strong>: el
              primer viaje del día va de las 03:55 a las 16:40, así que a media mañana aún faltan
              turnos por arrancar.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">{cabeceraPendiente}</thead>
              <tbody>{resumen.porSalir.map((f) => filaPendiente(f))}</tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Trabajaron ──────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#E2E8F0] bg-white">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#F1F5F9] px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <CheckCircle2 className="h-5 w-5 text-[#059669]" />
              Trabajaron ({resumen.trabajaron.length})
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Su cédula aparece en el despacho de GEMA con un viaje que salió a rodar. Ese primer
              viaje es la prueba de que vinieron.
            </p>
          </div>
          {/* El filtro que pidió el usuario: quiénes rodaron sin pasar la huella. */}
          <div className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] p-0.5">
            {(
              [
                ["todos", `Todos (${resumen.trabajaron.length})`],
                ["con", `Con huella (${resumen.trabajaron.length - trabajaronSinHuella})`],
                ["sin", `Sin huella (${trabajaronSinHuella})`],
              ] as const
            ).map(([valor, etiqueta]) => (
              <button
                key={valor}
                onClick={() => setHuella(valor)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  huella === valor
                    ? "bg-[#EEF2FF] text-[#4338CA]"
                    : "text-gray-500 hover:bg-[#F8FAFC]"
                }`}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>
        {trabajaronFiltrados.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            {resumen.trabajaron.length === 0
              ? "GEMA no registra ningún viaje que haya salido en este día."
              : "Ninguno en este filtro."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Conductor</th>
                  <th className="px-3 py-2 font-medium">Primer viaje</th>
                  <th className="px-3 py-2 font-medium">Bus</th>
                  <th className="px-3 py-2 font-medium">Turno</th>
                  <th className="px-3 py-2 font-medium">Ruta</th>
                  <th className="px-3 py-2 font-medium">Viajes</th>
                  <th className="px-3 py-2 font-medium">Huella</th>
                  <th className="px-3 py-2 font-medium">Hora</th>
                  <th className="px-3 py-2 font-medium">Llegó por</th>
                </tr>
              </thead>
              <tbody>{trabajaronFiltrados.map(filaTrabajo)}</tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Con novedad ─────────────────────────────────────────────────── */}
      {resumen.conNovedad.length > 0 && (
        <section className="rounded-xl border border-[#E2E8F0] bg-white">
          <div className="border-b border-[#F1F5F9] px-4 py-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <ClipboardCheck className="h-5 w-5 text-[#4F46E5]" />
              Con novedad registrada ({resumen.conNovedad.length})
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Su día ya está explicado en el Registro del día, así que{" "}
              <strong>quedan fuera de las cuentas de arriba</strong>: no hay nada que decidir
              sobre ellos.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Conductor</th>
                  <th className="px-3 py-2 font-medium">Se esperaba por</th>
                  <th className="px-3 py-2 font-medium">Huella</th>
                  <th className="px-3 py-2 font-medium">Hora</th>
                  <th className="px-3 py-2 font-medium">Llegó por</th>
                  <th className="px-3 py-2 font-medium">En el despacho</th>
                </tr>
              </thead>
              <tbody>
                {resumen.conNovedad.map((f) => (
                  <tr key={f.cedula} className="border-b border-[#F1F5F9] last:border-0">
                    {celdaConductor(f)}
                    <td className="px-3 py-2">
                      <ChipOrigen fila={f} />
                    </td>
                    <td className="px-3 py-2">
                      <ChipHuella marco={f.marco} huella={huellaPor.get(f.cedula)} />
                    </td>
                    <CeldasHuella huella={huellaPor.get(f.cedula)} />
                    {/* La contradicción: tiene novedad y aun así GEMA le
                        registró un viaje que rodó. Alguna de las dos está mal. */}
                    <td className="px-3 py-2 text-sm">
                      {f.trabajo ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-medium text-[#B45309]"
                          title="Tiene novedad registrada y aun así GEMA le registró un viaje que salió a rodar. Alguna de las dos cosas está mal."
                        >
                          <AlertTriangle className="h-3 w-3" />
                          rodó a las {horaCorta(f.primerViaje?.hora ?? null)}
                          {f.primerViaje?.bus ? ` · bus ${f.primerViaje.bus}` : ""}
                        </span>
                      ) : (
                        <span className="text-gray-400">no rodó</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {contradicciones.length > 0 && (
            <p className="border-t border-[#F1F5F9] px-4 py-2 text-xs text-[#B45309]">
              Los {contradicciones.length} marcados en ámbar tienen novedad registrada{" "}
              <strong>y además rodaron</strong>. Está avisado arriba con el detalle.
            </p>
          )}
        </section>
      )}

      {/* ── Marcaron (informativo) ──────────────────────────────────────── */}
      <section className="rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#F1F5F9] px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Fingerprint className="h-5 w-5 text-gray-400" />
            Marcaron ({marcaron})
            <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-gray-500">
              informativo
            </span>
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Las huellas del día. <strong>No entran en la decisión de presencia</strong>: hoy solo la
            mitad de los conductores despachados pasa por el biométrico, así que como medida de
            asistencia todavía no sirve.
          </p>
        </div>
        {marcaron === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            Ninguna marcación de los esperados en este día.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Conductor</th>
                  <th className="px-3 py-2 font-medium">Primera</th>
                  <th className="px-3 py-2 font-medium">Última</th>
                  <th className="px-3 py-2 font-medium">Marcaciones</th>
                  <th className="px-3 py-2 font-medium">Llegó por</th>
                  <th className="px-3 py-2 font-medium">Pin</th>
                </tr>
              </thead>
              <tbody>
                {resumen.marcaron.map((f) => (
                  <tr key={f.cedula} className="border-b border-[#F1F5F9] last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{f.nombre || "(sin nombre)"}</p>
                      <p className="text-xs text-gray-500">
                        CC {f.cedula}
                        {f.codigo ? ` · cód. ${f.codigo}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-700">{hora(f.primera)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-700">{hora(f.ultima)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{f.cantidad}</td>
                    <td className="px-3 py-2">
                      <ChipLlegada llegada={f.llegada} />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {f.pines.join(", ")}
                      {f.pines.length > 1 && (
                        <span
                          className="ml-1 text-[#B45309]"
                          title="La persona está enrolada dos veces en el equipo: su asistencia viene partida en dos badges."
                        >
                          (2 badges)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/*
        Aquí iba «Marcaron sin estar en la lista»: quien marcó sin que se le
        esperara (relevos, ruleta, administrativos) y los pines sin cédula en el
        equipo. Se quitó a pedido, por no ser información necesaria hoy.

        El cálculo SIGUE haciéndose en `dia.ts` (`resumen.sinMaestro`) y tiene
        sus pruebas: quitarlo también dejaría la pantalla sin forma de volver a
        mostrarlo, y lo que sobra es el bloque, no el dato. Para recuperarlo,
        basta volver a pintar `resumen.sinMaestro`.
      */}
    </div>
  );
}
