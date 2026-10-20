/**
 * Validación del lote que manda el agente del biométrico. Parte PURA: no toca
 * la base ni la red, así que se prueba sola (`npm run test:biometrico`).
 *
 * El lote se acepta o se rechaza ENTERO. Si se aceptara a medias, el agente
 * —que pide «lo que siga del último id que tengas»— avanzaría por encima de la
 * fila mala y esa marcación se perdería para siempre. El origen es una tabla de
 * esquema fijo: una fila mal formada es un error a mirar, no un dato de negocio.
 *
 * ## Dos vías
 *
 * `access`  el agente leyó `acc_monitor_log` del `Access.mdb`: cada marcación
 *           trae `id` (= `acc_monitor_log.id`), que es la marca de avance.
 * `equipo`  el agente leyó el lector directo por el SDK (tiempo real o puesta
 *           al día): **no existe ese id**, así que la identidad es
 *           `(deviceSn, pin, momento)` y `deviceSn` pasa a ser obligatorio.
 *
 * Un lote nunca mezcla las dos: el origen se deduce de si las marcaciones
 * traen `id` o no, y mezclarlas sería un error del agente.
 */

/** Tope de marcaciones por llamada. Unas 2.000 filas son ~300 KB de JSON. */
export const MAX_MARCACIONES = 2000;

/** Tope de personas por llamada. El equipo tiene 790; se deja holgura. */
export const MAX_PERSONAS = 5000;

/** Zona del equipo: Colombia, sin horario de verano. */
export const OFFSET_BOGOTA = "-05:00";

/** De dónde salió la marcación. Lo deduce el validador, no lo manda el cliente. */
export type Origen = "access" | "equipo";

export interface MarcacionEntrada {
  /** `acc_monitor_log.id`. NULL cuando la trajo el equipo (no existe allá). */
  idZk: number | null;
  pin: string;
  /** ISO con el offset de Bogotá, listo para `timestamptz`. */
  momento: string;
  /** Día operativo: la fecha local, AAAA-MM-DD. */
  fecha: string;
  deviceId: number | null;
  deviceName: string | null;
  /**
   * Número de serie del lector. Parte de la llave natural, así que nunca es
   * null: `""` cuando la vía Access no lo trae (filas viejas sin SN).
   */
  deviceSn: string;
  verificado: number | null;
  punto: string | null;
  origen: Origen;
  /** Hora del PC del agente al captar el evento. Solo vía equipo. */
  recibidoAt: string | null;
}

export interface PersonaEntrada {
  pin: string;
  userid: number | null;
  cedula: string | null;
  nombre: string | null;
  apellido: string | null;
  departamentoId: number | null;
}

export interface LoteValido {
  agente: string | null;
  personas: PersonaEntrada[];
  marcaciones: MarcacionEntrada[];
  /** `null` solo si el lote no trae marcaciones (latido). */
  origen: Origen | null;
  /** Cuántas marcaciones repetidas se colapsaron. Ver `fusionarPorClave`. */
  repetidasEnLote: number;
}

export type ResultadoValidacion =
  | { ok: true; lote: LoteValido }
  | { ok: false; error: string; estado: 400 | 413 };

/**
 * Cédula tal como queda guardada: solo dígitos. El equipo trae "0" en quien se
 * descartó a propósito (46 personas retiradas) y a veces vacío; las dos cosas
 * son «sin identificación», no una cédula.
 */
export function normalizarCedula(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const solo = String(valor).replace(/\D/g, "");
  if (!solo) return null;
  // Un "0" (o "000") es el valor de fábrica de ZKAccess, no una cédula.
  if (/^0+$/.test(solo)) return null;
  // El campo es nvarchar(20); una cédula colombiana tiene 5 a 11 dígitos.
  if (solo.length < 5 || solo.length > 20) return null;
  return solo;
}

/**
 * De qué campo del equipo sale la cédula, en orden.
 *
 * El «N.º de identificación» de la interfaz de ZKAccess es **CardNo**: de las
 * 790 personas del equipo, las dos únicas con algo ahí lo tenían con forma de
 * cédula (el badge 940 con 72250850, justo la que el cruce le asignó por
 * nombre), mientras que SSN estaba en "0" —su valor de fábrica— en las 790. En
 * este equipo no se usan tarjetas RFID, así que CardNo está libre.
 *
 * `identificacion` es lo que el agente ya resolvió; los demás son respaldo para
 * un estado mixto o para un agente viejo que todavía mande solo `ssn`.
 */
function cedulaDePersona(p: Record<string, unknown>): string | null {
  for (const campo of ["identificacion", "cardNo", "card_no", "cedula", "ssn"]) {
    const c = normalizarCedula(p[campo]);
    if (c) return c;
  }
  return null;
}

/**
 * Convierte la hora local del equipo ("2026-10-13T06:42:10") en el momento con
 * offset y su día operativo. Se valida con `Date.parse` y además se comprueba
 * que la fecha exista de verdad: "2026-02-31" parsea en algunos motores.
 */
export function momentoDesdeLocal(
  local: unknown
): { momento: string; fecha: string } | null {
  if (typeof local !== "string") return null;
  const t = local.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (!m) return null;
  const [, a, mes, dia, hh, mm, ss] = m;
  const anio = Number(a);
  const nMes = Number(mes);
  const nDia = Number(dia);
  const nHh = Number(hh);
  const nMm = Number(mm);
  const nSs = Number(ss ?? "0");
  if (nMes < 1 || nMes > 12 || nDia < 1 || nDia > 31) return null;
  if (nHh > 23 || nMm > 59 || nSs > 59) return null;
  // Día real del mes (febrero, meses de 30).
  const prueba = new Date(Date.UTC(anio, nMes - 1, nDia));
  if (prueba.getUTCMonth() !== nMes - 1 || prueba.getUTCDate() !== nDia) return null;
  // El biométrico se instaló en 2022; una fecha anterior es basura.
  if (anio < 2000 || anio > 2100) return null;
  const fecha = `${a}-${mes}-${dia}`;
  const hora = `${hh}:${mm}:${ss ?? "00"}`;
  return { momento: `${fecha}T${hora}${OFFSET_BOGOTA}`, fecha };
}

/** Entero no negativo, o null si viene vacío. Rechaza texto que no sea número. */
function entero(valor: unknown): number | null | undefined {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  return n;
}

/** Texto recortado, o null. Se limita para no guardar basura larga. */
function texto(valor: unknown, max = 200): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Colapsa las marcaciones que son la MISMA huella: igual `(deviceSn, pin,
 * momento)`. Gana la de menor `id`.
 *
 * Hace falta por dos razones, y las dos vienen del origen, no de un error:
 *
 *   1. `acc_monitor_log` guarda la misma huella varias veces. El mismo lector
 *      está registrado cuatro veces en la historia de ZKAccess (`device_id` 4,
 *      5, 6 y 7) y cada re-registro volvió a descargar su memoria completa:
 *      57.577 filas de más entre 2022 y 2024 (52.386 solo en 2023; ninguna
 *      desde 2025).
 *   2. `ON CONFLICT DO UPDATE` falla con «command cannot affect row a second
 *      time» si la misma llave viene dos veces en el mismo INSERT.
 *
 * Se colapsa en vez de rechazar el lote **a propósito**: rechazarlo atascaría
 * la marca de avance del agente en ese tramo para siempre.
 */
export function fusionarPorClave(
  marcaciones: MarcacionEntrada[]
): { lista: MarcacionEntrada[]; repetidas: number } {
  const porClave = new Map<string, MarcacionEntrada>();
  for (const m of marcaciones) {
    const clave = `${m.deviceSn}|${m.pin}|${m.momento}`;
    const ya = porClave.get(clave);
    if (!ya) {
      porClave.set(clave, m);
      continue;
    }
    // La de menor id es la que ZKAccess descargó primero, y la misma que la
    // migración conservó en el histórico: así el lote y la base coinciden.
    const gana = ya.idZk === null ? m.idZk !== null : m.idZk !== null && m.idZk < ya.idZk;
    if (gana) porClave.set(clave, m);
  }
  const lista = [...porClave.values()];
  return { lista, repetidas: marcaciones.length - lista.length };
}

/**
 * Valida el cuerpo del POST. Devuelve el lote normalizado o el primer error
 * con su índice, para que el agente lo deje en su bitácora y se pueda arreglar.
 */
export function validarLote(body: unknown): ResultadoValidacion {
  if (!esObjeto(body)) {
    return { ok: false, error: "El cuerpo debe ser un objeto JSON.", estado: 400 };
  }

  const crudas = body.marcaciones;
  if (crudas !== undefined && !Array.isArray(crudas)) {
    return { ok: false, error: "«marcaciones» debe ser una lista.", estado: 400 };
  }
  const listaMarcaciones = (crudas ?? []) as unknown[];
  if (listaMarcaciones.length > MAX_MARCACIONES) {
    return {
      ok: false,
      estado: 413,
      error: `Demasiadas marcaciones: ${listaMarcaciones.length}. El máximo por llamada es ${MAX_MARCACIONES}.`,
    };
  }

  const crudasPersonas = body.personas;
  if (crudasPersonas !== undefined && !Array.isArray(crudasPersonas)) {
    return { ok: false, error: "«personas» debe ser una lista.", estado: 400 };
  }
  const listaPersonas = (crudasPersonas ?? []) as unknown[];
  if (listaPersonas.length > MAX_PERSONAS) {
    return {
      ok: false,
      estado: 413,
      error: `Demasiadas personas: ${listaPersonas.length}. El máximo por llamada es ${MAX_PERSONAS}.`,
    };
  }

  // ── Personas ──────────────────────────────────────────────────────────────
  const personas: PersonaEntrada[] = [];
  const pinesVistos = new Set<string>();
  for (let i = 0; i < listaPersonas.length; i++) {
    const p = listaPersonas[i];
    const donde = `personas[${i}]`;
    if (!esObjeto(p)) return { ok: false, estado: 400, error: `${donde}: no es un objeto.` };
    const pin = texto(p.pin, 50);
    if (!pin) return { ok: false, estado: 400, error: `${donde}: «pin» vacío.` };
    // Un pin repetido en el mismo snapshot haría que el upsert dependiera del
    // orden: se rechaza para que el equipo no mande dos verdades a la vez.
    if (pinesVistos.has(pin)) {
      return { ok: false, estado: 400, error: `${donde}: el pin «${pin}» viene dos veces.` };
    }
    pinesVistos.add(pin);
    const userid = entero(p.userid);
    if (userid === undefined) {
      return { ok: false, estado: 400, error: `${donde}: «userid» no es un entero.` };
    }
    const depto = entero(p.departamentoId ?? p.departamento_id);
    if (depto === undefined) {
      return { ok: false, estado: 400, error: `${donde}: «departamentoId» no es un entero.` };
    }
    personas.push({
      pin,
      userid,
      // Una identificación inválida no invalida el lote: es «sin cédula».
      cedula: cedulaDePersona(p),
      nombre: texto(p.nombre, 100),
      apellido: texto(p.apellido, 100),
      departamentoId: depto,
    });
  }

  // ── Marcaciones ───────────────────────────────────────────────────────────
  const crudasMarcaciones: Omit<MarcacionEntrada, "origen">[] = [];
  const idsVistos = new Set<number>();
  let conId = 0;
  let sinId = 0;
  for (let i = 0; i < listaMarcaciones.length; i++) {
    const m = listaMarcaciones[i];
    const donde = `marcaciones[${i}]`;
    if (!esObjeto(m)) return { ok: false, estado: 400, error: `${donde}: no es un objeto.` };

    // `id` existe solo en la vía Access. Ausente o null = viene del equipo.
    const crudoId = m.id ?? m.idZk;
    const idZk = entero(crudoId);
    if (idZk === undefined) {
      return {
        ok: false,
        estado: 400,
        error: `${donde}: «id» no es un entero (llegó ${JSON.stringify(crudoId)}).`,
      };
    }
    if (idZk !== null && idZk <= 0) {
      return {
        ok: false,
        estado: 400,
        error: `${donde}: «id» debe ser un entero positivo (llegó ${JSON.stringify(crudoId)}).`,
      };
    }
    if (idZk === null) {
      sinId++;
    } else {
      conId++;
      if (idsVistos.has(idZk)) {
        return {
          ok: false,
          estado: 400,
          error: `${donde}: el id ${idZk} viene dos veces en el lote.`,
        };
      }
      idsVistos.add(idZk);
    }
    const cual = idZk === null ? "" : ` (id ${idZk})`;

    const pin = texto(m.pin, 50);
    if (!pin) return { ok: false, estado: 400, error: `${donde}: «pin» vacío${cual}.` };

    const momento = momentoDesdeLocal(m.momento);
    if (!momento) {
      return {
        ok: false,
        estado: 400,
        error: `${donde}: «momento» ${JSON.stringify(m.momento)} no es una fecha y hora válida${cual}.`,
      };
    }

    // Parte de la llave natural: sin SN, dos huellas distintas podrían
    // colapsar o la misma duplicarse. La vía Access puede no traerlo (filas
    // viejas de 2022); la vía equipo lo lee del lector al conectar.
    const deviceSn = texto(m.deviceSn ?? m.device_sn, 60) ?? "";
    if (idZk === null && !deviceSn) {
      return {
        ok: false,
        estado: 400,
        error: `${donde}: «deviceSn» es obligatorio cuando la marcación no trae «id» (viene del equipo).`,
      };
    }

    const deviceId = entero(m.deviceId ?? m.device_id);
    if (deviceId === undefined) {
      return { ok: false, estado: 400, error: `${donde}: «deviceId» no es un entero${cual}.` };
    }
    const verificado = entero(m.verificado ?? m.verified);
    if (verificado === undefined) {
      return { ok: false, estado: 400, error: `${donde}: «verificado» no es un entero${cual}.` };
    }

    // Hora del PC del agente, para medir la latencia y el desfase del reloj
    // del lector. Opcional: la vía Access no la tiene.
    let recibidoAt: string | null = null;
    const crudoRecibido = m.recibidoAt ?? m.recibido_at;
    if (crudoRecibido !== undefined && crudoRecibido !== null && crudoRecibido !== "") {
      const t = Date.parse(String(crudoRecibido));
      if (Number.isNaN(t)) {
        return {
          ok: false,
          estado: 400,
          error: `${donde}: «recibidoAt» ${JSON.stringify(crudoRecibido)} no es una fecha y hora válida${cual}.`,
        };
      }
      recibidoAt = new Date(t).toISOString();
    }

    crudasMarcaciones.push({
      idZk,
      pin,
      momento: momento.momento,
      fecha: momento.fecha,
      deviceId,
      deviceName: texto(m.deviceName ?? m.device_name, 100),
      deviceSn,
      verificado,
      punto: texto(m.punto, 100),
      recibidoAt,
    });
  }

  // El agente nunca mezcla las dos vías: si llegan juntas, algo está mal en él
  // y aceptarlo escondería el problema (el origen de cada fila dejaría de ser
  // deducible).
  if (conId > 0 && sinId > 0) {
    return {
      ok: false,
      estado: 400,
      error:
        `El lote mezcla ${conId} marcación(es) con «id» (vía Access) y ${sinId} sin «id» ` +
        `(vía equipo). Cada envío debe traer una sola vía.`,
    };
  }
  const origen: Origen | null = conId > 0 ? "access" : sinId > 0 ? "equipo" : null;

  const { lista, repetidas } = fusionarPorClave(
    crudasMarcaciones.map((m) => ({ ...m, origen: origen ?? "access" }))
  );

  return {
    ok: true,
    lote: {
      agente: texto(body.agente, 120),
      personas,
      marcaciones: lista,
      origen,
      repetidasEnLote: repetidas,
    },
  };
}
