/**
 * Validación del lote que manda el agente del biométrico. Parte PURA: no toca
 * la base ni la red, así que se prueba sola (`npm run test:biometrico`).
 *
 * El lote se acepta o se rechaza ENTERO. Si se aceptara a medias, el agente
 * —que pide «lo que siga del último id que tengas»— avanzaría por encima de la
 * fila mala y esa marcación se perdería para siempre. El origen es una tabla de
 * esquema fijo: una fila mal formada es un error a mirar, no un dato de negocio.
 */

/** Tope de marcaciones por llamada. Unas 2.000 filas son ~300 KB de JSON. */
export const MAX_MARCACIONES = 2000;

/** Tope de personas por llamada. El equipo tiene 790; se deja holgura. */
export const MAX_PERSONAS = 5000;

/** Zona del equipo: Colombia, sin horario de verano. */
export const OFFSET_BOGOTA = "-05:00";

export interface MarcacionEntrada {
  idZk: number;
  pin: string;
  /** ISO con el offset de Bogotá, listo para `timestamptz`. */
  momento: string;
  /** Día operativo: la fecha local, AAAA-MM-DD. */
  fecha: string;
  deviceId: number | null;
  deviceName: string | null;
  deviceSn: string | null;
  verificado: number | null;
  punto: string | null;
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
}

export type ResultadoValidacion =
  | { ok: true; lote: LoteValido }
  | { ok: false; error: string; estado: 400 | 413 };

/**
 * Cédula tal como queda guardada: solo dígitos. El equipo trae "0" en quien se
 * descartó a propósito (46 personas retiradas) y a veces vacío; las dos cosas
 * son «sin identificación», no una cédula.
 */
export function normalizarCedula(ssn: unknown): string | null {
  if (ssn === null || ssn === undefined) return null;
  const solo = String(ssn).replace(/\D/g, "");
  if (!solo) return null;
  // Un "0" (o "000") es el valor de fábrica de ZKAccess, no una cédula.
  if (/^0+$/.test(solo)) return null;
  // SSN es nvarchar(20); una cédula colombiana tiene 5 a 11 dígitos.
  if (solo.length < 5 || solo.length > 20) return null;
  return solo;
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
      // El SSN inválido no invalida el lote: es «sin identificación».
      cedula: normalizarCedula(p.ssn ?? p.cedula),
      nombre: texto(p.nombre, 100),
      apellido: texto(p.apellido, 100),
      departamentoId: depto,
    });
  }

  // ── Marcaciones ───────────────────────────────────────────────────────────
  const marcaciones: MarcacionEntrada[] = [];
  const idsVistos = new Set<number>();
  for (let i = 0; i < listaMarcaciones.length; i++) {
    const m = listaMarcaciones[i];
    const donde = `marcaciones[${i}]`;
    if (!esObjeto(m)) return { ok: false, estado: 400, error: `${donde}: no es un objeto.` };

    const idZk = entero(m.id ?? m.idZk);
    if (idZk === undefined || idZk === null || idZk <= 0) {
      return {
        ok: false,
        estado: 400,
        error: `${donde}: «id» debe ser un entero positivo (llegó ${JSON.stringify(m.id ?? m.idZk)}).`,
      };
    }
    if (idsVistos.has(idZk)) {
      return { ok: false, estado: 400, error: `${donde}: el id ${idZk} viene dos veces en el lote.` };
    }
    idsVistos.add(idZk);

    const pin = texto(m.pin, 50);
    if (!pin) return { ok: false, estado: 400, error: `${donde}: «pin» vacío (id ${idZk}).` };

    const momento = momentoDesdeLocal(m.momento);
    if (!momento) {
      return {
        ok: false,
        estado: 400,
        error: `${donde}: «momento» ${JSON.stringify(m.momento)} no es una fecha y hora válida (id ${idZk}).`,
      };
    }

    const deviceId = entero(m.deviceId ?? m.device_id);
    if (deviceId === undefined) {
      return { ok: false, estado: 400, error: `${donde}: «deviceId» no es un entero (id ${idZk}).` };
    }
    const verificado = entero(m.verificado ?? m.verified);
    if (verificado === undefined) {
      return { ok: false, estado: 400, error: `${donde}: «verificado» no es un entero (id ${idZk}).` };
    }

    marcaciones.push({
      idZk,
      pin,
      momento: momento.momento,
      fecha: momento.fecha,
      deviceId,
      deviceName: texto(m.deviceName ?? m.device_name, 100),
      deviceSn: texto(m.deviceSn ?? m.device_sn, 60),
      verificado,
      punto: texto(m.punto, 100),
    });
  }

  return {
    ok: true,
    lote: { agente: texto(body.agente, 120), personas, marcaciones },
  };
}
