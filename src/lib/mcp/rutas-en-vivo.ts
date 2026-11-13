// Herramienta MCP `rutas_en_vivo`: qué buses van en su ruta y cuáles están
// desviados AHORA. El cruce GPS × trazado KML no se guarda en ninguna tabla
// (se calcula al momento), así que no lo alcanzan consultar_datos ni
// agregar_datos. Misma lógica que Operativo › Rutas › En vivo
// (src/lib/operativo/rutas-gps.ts).
//
// Acceso: el del recurso `operativo_rutas_kml` (módulo operativo).

import { puedeVer, type AccesoDatos } from "@/lib/external/acceso";
import { getFlotaEnRutas, type BusEnRuta } from "@/lib/operativo/rutas-gps";
import { ETIQUETA_ESTADO, LECTURAS_CONFIRMAR_DESVIO, SENAL_MAX_MIN, type EstadoBusRuta } from "@/lib/operativo/rutas-gps-reglas";
import { ErrorConsulta } from "./consultas";

export const ESTADOS_RUTA = [
  "en_ruta",
  "desviado",
  "sentido_contrario",
  "sin_kml",
  "fuera_de_viaje",
  "sin_senal",
  "sin_programacion",
  "sin_posicion",
] as const satisfies readonly EstadoBusRuta[];

const SIGNIFICADO: Record<EstadoBusRuta, string> = {
  en_ruta: "Va en viaje y está dentro de la tolerancia de su ruta.",
  desviado: "Va en viaje y está más lejos de la línea de su ruta que la tolerancia (una sola lectura: ver avisos).",
  sentido_contrario: "Va en viaje cerca de su ruta pero en sentido contrario al trazado (según el rumbo del GPS).",
  sin_kml: "Tiene ruta hoy, pero esa ruta todavía no tiene trazado KML cargado: no se puede medir desvío.",
  fuera_de_viaje: "Tiene ruta hoy pero no va en un viaje (patio, entre vueltas o ya terminó): no se juzga el desvío.",
  sin_senal: `Su última posición GPS tiene más de ${SENAL_MAX_MIN} minutos.`,
  sin_programacion: "No tiene viaje despachado ni turno programado hoy.",
  sin_posicion: "Tiene ruta hoy, pero el GPS no reporta su posición.",
};

const ORDEN: Record<EstadoBusRuta, number> = {
  desviado: 0, sentido_contrario: 1, en_ruta: 2, sin_kml: 3, fuera_de_viaje: 4, sin_senal: 5, sin_programacion: 6, sin_posicion: 7,
};
const ALERTAS: ReadonlySet<EstadoBusRuta> = new Set(["desviado", "sentido_contrario"]);

const aFila = (b: BusEnRuta) => ({
  codigo_vehiculo: b.codigo,
  placa: b.placa,
  ruta: b.ruta,
  origen_ruta: b.origenRuta,
  viaje: b.viaje,
  hora_despacho: b.horaDespacho,
  estado: b.estado,
  distancia_a_ruta_m: b.distanciaM,
  tolerancia_m: b.toleranciaM,
  avance_sobre_ruta_km: b.avanceKm,
  velocidad_kph: b.velocidadKph,
  fecha_hora_gps: b.fechaHora,
  minutos_desde_gps: b.edadMin,
  latitud: b.lat,
  longitud: b.lon,
});

export async function rutasEnVivo(
  args: { ruta?: string; estado?: EstadoBusRuta | "alertas" | "todos"; bus?: string; limite?: number },
  acceso: AccesoDatos
) {
  if (!puedeVer(acceso, "operativo_rutas_kml")) {
    throw new ErrorConsulta(
      "Las rutas en vivo no están disponibles para el rol de este usuario: su tipo de usuario no incluye el módulo Operativo. Dígale al usuario que no tiene acceso a esa información; no la busque en otros recursos."
    );
  }
  const flota = await getFlotaEnRutas();
  const rutas = [...new Set(flota.buses.map((b) => b.ruta).filter((r): r is string => !!r))].sort();
  const rutasConKml = [...new Set(flota.buses.filter((b) => b.toleranciaM != null).map((b) => b.ruta!))].sort();

  const ruta = args.ruta?.trim();
  if (ruta && !rutas.includes(ruta)) {
    throw new ErrorConsulta(
      `Ningún bus tiene hoy la ruta '${ruta}'. Las rutas se comparan con el nombre exacto de GEMA (guiones incluidos). Rutas con buses hoy: ${rutas.join(" | ") || "ninguna"}.`
    );
  }
  const deRuta = ruta ? flota.buses.filter((b) => b.ruta === ruta) : flota.buses;

  const conteo = Object.fromEntries(ESTADOS_RUTA.map((e) => [e, 0])) as Record<EstadoBusRuta, number>;
  for (const b of deRuta) conteo[b.estado] += 1;

  const estado = args.estado ?? "alertas";
  const bus = args.bus?.trim().toUpperCase();
  const filtrados = deRuta
    .filter((b) => {
      if (bus) return b.codigo.toUpperCase() === bus || (b.placa ?? "").toUpperCase() === bus;
      if (estado === "todos") return true;
      if (estado === "alertas") return ALERTAS.has(b.estado);
      return b.estado === estado;
    })
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || (b.distanciaM ?? 0) - (a.distanciaM ?? 0));
  const limite = Math.min(Math.max(Math.trunc(args.limite ?? 50), 1), 200);

  const avisos: string[] = [
    `Es una foto de un solo instante. Un 'desviado' aquí es UNA lectura GPS; la pantalla de Operativo lo confirma con ${LECTURAS_CONFIRMAR_DESVIO} lecturas distintas seguidas. Para confirmar, vuelva a llamar en 1 o 2 minutos y compare fecha_hora_gps y distancia_a_ruta_m del mismo bus.`,
    "La ruta de cada bus es la del viaje en curso del despacho (la reprogramada manda: cerca de la mitad de los viajes cambian de ruta). origen_ruta = 'programacion' significa que el bus aún no ha salido y la ruta es solo la programada.",
    "distancia_a_ruta_m se mide contra la línea del KML dibujada a mano: unos metros de diferencia pueden ser imprecisión del GPS o del trazado, no un desvío real.",
  ];
  if (!rutasConKml.length) {
    avisos.unshift("Ninguna ruta con buses hoy tiene trazado KML cargado: todos salen 'sin_kml' y no se puede medir desvío. Se cargan en Operativo › Rutas.");
  }
  if (flota.gps.error) avisos.push(`GPS: ${flota.gps.error}`);
  if (flota.despacho.error) avisos.push(`Despacho: ${flota.despacho.error}`);

  return {
    ahora_colombia: flota.ahora,
    fuentes: {
      gps: flota.gps.fuente === "vivo" ? "GEMA en vivo" : flota.gps.fuente === "copia" ? "copia del espejo (GEMA no respondió)" : "sin datos",
      gps_leido_utc: flota.gps.leidoAt,
      despacho_minutos_de_antiguedad: flota.despacho.edadMin,
    },
    filtro: { ruta: ruta ?? null, estado: bus ? null : estado, bus: bus ?? null },
    conteo_por_estado: conteo,
    significado_estados: Object.fromEntries(ESTADOS_RUTA.map((e) => [e, `${ETIQUETA_ESTADO[e]}: ${SIGNIFICADO[e]}`])),
    rutas_con_buses_hoy: rutas,
    rutas_con_kml: rutasConKml,
    total_buses_filtrados: filtrados.length,
    buses: filtrados.slice(0, limite).map(aFila),
    avisos,
  };
}
