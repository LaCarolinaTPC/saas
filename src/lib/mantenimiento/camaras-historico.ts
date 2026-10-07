// Mapeo de una fila del Forms «Control incidencias cámaras y sensores» a las
// revisiones de Gestivo. Puro, para el script de migración y sus pruebas.
//
// El Forms cambió en marzo de 2025: las filas viejas no traen NOVEDAD y en una
// misma fila anotaban la cámara (ESTADO CÁMARA, TIPO INTERVENCIÓN, conteos) y el
// sensor (TIPO INTERVENCIÓN SENSOR). Esas salen como dos revisiones del mismo
// viaje. TIPO INTERVENCIÓN = «Sensor» en una fila de cámara quiere decir que la
// intervención fue al sensor: la cámara queda Normal y el sensor con su tipo.
import { MAX_CONTEO, type Elemento } from "./camaras-reglas";

export interface FilaForms {
  novedad: string | null;
  estadoCamara: string | null;
  tipo: string | null;
  tipoSensor: string | null;
  /** Número, o el texto que digitaron ("NO", "VARADO"). */
  dfs: number | string | null;
  aforo: number | string | null;
}

export interface RevisionMapeada {
  elemento: Elemento;
  tipoNovedad: string;
  dfs: number | null;
  aforo: number | null;
  alertas: string[];
}

const clave = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const TIPO_CAMARA: Record<string, string> = {
  "normal": "camara_normal",
  "no bajo info": "camara_no_bajo_info",
  "varado": "camara_varado",
  "desconfiguracion": "camara_desconfiguracion",
  "corto electrico": "camara_corto_electrico",
  "microsd": "camara_microsd",
  "cambio camara": "camara_cambio",
  "accidente": "camara_accidente",
};

const TIPO_SENSOR: Record<string, string> = {
  "rutina": "sensor_rutina",
  "revision rutinaria": "sensor_rutina",
  "no descargaba": "sensor_no_descargaba",
  "exceso de timbradas": "sensor_exceso_timbradas",
  "abordados": "sensor_abordados",
  "bloqueos puerta 1": "sensor_bloqueo_p1",
  "bloqueos puerta 2": "sensor_bloqueo_p2",
  "no marca p. 1": "sensor_no_marca_p1",
  "no marca p. 2": "sensor_no_marca_p2",
  "no marca informacion": "sensor_no_marca_info",
  "sensor apagado": "sensor_apagado",
  "aforo": "sensor_diferencia_aforo",
  "no marcaba gps": "sensor_falla_gps",
  "falla en gps": "sensor_falla_gps",
};

/** Tipos de cámara en los que el DFS llega en 0 porque no hubo dato. */
const SIN_DFS = new Set(["camara_no_bajo_info", "camara_varado"]);
/** Cámara dañada: no hay video y el aforo de 0 es «no se pudo contar». */
const SIN_VIDEO = new Set([
  "camara_desconfiguracion", "camara_corto_electrico", "camara_microsd", "camara_cambio", "camara_accidente",
]);

function conteo(valor: number | string | null, alertas: string[]): number | null {
  if (valor == null || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).trim());
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n) || n < 0 || n > MAX_CONTEO) {
    if (!alertas.includes("conteo_invalido")) alertas.push("conteo_invalido");
    return null;
  }
  return n;
}

export function mapearFilaForms(f: FilaForms): RevisionMapeada[] {
  const salida: RevisionMapeada[] = [];
  const novedad = clave(f.novedad);
  const tipoSensor = f.tipoSensor ? TIPO_SENSOR[clave(f.tipoSensor)] ?? null : null;
  const tipoSensorDesconocido = !!f.tipoSensor && !tipoSensor;

  if (novedad === "sensor") {
    const alertas: string[] = [];
    let tipo = tipoSensor;
    if (!tipo) {
      tipo = "sensor_rutina";
      alertas.push("tipo_deducido");
    }
    salida.push({ elemento: "sensor", tipoNovedad: tipo, dfs: conteo(f.dfs, alertas), aforo: conteo(f.aforo, alertas), alertas });
    return salida;
  }

  // Cámara (NOVEDAD = CAMARA, o fila vieja sin NOVEDAD).
  const alertas: string[] = [];
  const t = clave(f.tipo);
  let tipo = TIPO_CAMARA[t] ?? null;
  if (!tipo) {
    tipo = "camara_normal";
    // «Sensor» con el tipo de sensor anotado es la forma vieja de decir que la
    // cámara estaba bien y se intervino el sensor: no es una deducción dudosa.
    if (!(t === "sensor" && tipoSensor)) alertas.push("tipo_deducido");
  }
  const dfsTexto = typeof f.dfs === "string" ? clave(f.dfs) : "";
  if (dfsTexto === "no" && tipo === "camara_normal") tipo = "camara_no_bajo_info";
  if (dfsTexto === "varado" && tipo === "camara_normal") tipo = "camara_varado";
  if (clave(f.estadoCamara) === "malo" && tipo === "camara_normal") alertas.push("estado_malo");

  let dfs = conteo(f.dfs, alertas);
  let aforo = conteo(f.aforo, alertas);
  if (SIN_DFS.has(tipo) && dfs === 0) dfs = null;
  if (SIN_VIDEO.has(tipo) && aforo === 0) aforo = null;
  salida.push({ elemento: "camara", tipoNovedad: tipo, dfs, aforo, alertas });

  if (tipoSensor) {
    salida.push({ elemento: "sensor", tipoNovedad: tipoSensor, dfs: null, aforo: null, alertas: [] });
  } else if (tipoSensorDesconocido) {
    salida.push({ elemento: "sensor", tipoNovedad: "sensor_rutina", dfs: null, aforo: null, alertas: ["tipo_deducido"] });
  }
  return salida;
}
