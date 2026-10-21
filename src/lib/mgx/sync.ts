/**
 * El motor de la sincronización de MGX. Lo usan la pantalla (Server Action,
 * con presupuesto de tiempo) y el script (sin tope). Mismo código, para que
 * lo que se prueba por script sea lo que corre en la pantalla.
 *
 * Por cada par (empresa, tabla) obedece la estrategia guardada en
 * `mgx_tablas` (ver `plan.ts`) y deja el progreso escrito ahí DESPUÉS DE CADA
 * LOTE: si la corrida se corta —se acaba el tiempo, se cierra el navegador,
 * se cae la red— la siguiente sigue desde donde quedó, sin repetir millones
 * de filas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { esErrorDeConexion, mgxQuery, type FilaMgx } from "./client";
import { esquemaOrigen, etiquetaPar, nombreEspejo, type Par } from "./catalogo";
import { esTipoMgx, limpiarFila, llaveDocumento, llaveIndiceMgx, nombreEnEspejo, type ColumnaMeta } from "./limpieza";
import { avanzarMarca, calcularVentana, columnaEdicion, type Estrategia } from "./plan";
import { partirDocumentos, partirPorBytes } from "./lotes";

type Admin = SupabaseClient;

export type EstadoPar = "nunca" | "ok" | "pendiente" | "corriendo" | "error";

export interface FilaMgxTablas {
  empresa: string;
  modulo: string;
  tabla: string;
  activa: boolean;
  estrategia: Estrategia;
  ultimo_ide: number | null;
  ultima_edicion: string | null;
  ultima_corrida_at: string | null;
  filas: number | null;
  filas_origen_estimadas: number | null;
  estado: EstadoPar;
  fase: string | null;
  error: string | null;
  aviso: string | null;
  corrida_id: number | null;
}

export interface FilaMgxCorridas {
  id: number;
  iniciada_at: string;
  actualizada_at: string;
  terminada_at: string | null;
  origen: "manual" | "script";
  usuario_email: string | null;
  alcance: unknown;
  filas: number;
  estado: "corriendo" | "ok" | "error" | "parcial";
  error: string | null;
}

export interface OpcionesCorrida {
  /** `Date.now()` límite para EMPEZAR un lote; `Infinity` en el script. */
  deadline: number;
  loteLectura?: number;
  bytesPorLote?: number;
  filasPorLote?: number;
  log?: (s: string) => void;
}

export interface ResultadoPar {
  par: Par;
  /** Filas escritas en esta llamada (altas + cambios). */
  filas: number;
  terminado: boolean;
  fase?: "reemplazo" | "nuevas" | "editados";
  error?: string;
  aviso?: string | null;
}

const LOTE_LECTURA = Number(process.env.MGX_LOTE_LECTURA ?? 10_000);
const DOCS_POR_CONSULTA = 200;
/** Una corrida sin señales de vida en este tiempo ya no bloquea otra. */
export const CORRIDA_VIGENTE_MIN = 15;

// ── Metadatos ────────────────────────────────────────────────────────────────

const cacheOrigen = new Map<string, ColumnaMeta[]>();
const cacheEspejo = new Map<string, Set<string>>();

/** Las columnas de la tabla en MGX, con su tipo. */
async function columnasOrigen(par: Par): Promise<ColumnaMeta[]> {
  const esquema = esquemaOrigen(par.empresa, par.modulo);
  const k = `${esquema}.${par.tabla}`;
  const ya = cacheOrigen.get(k);
  if (ya) return ya;
  const filas = await mgxQuery<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
    [esquema, par.tabla]
  );
  if (!filas.length) throw new Error(`${k} no existe en MGX o el usuario ETL no la ve.`);
  const cols: ColumnaMeta[] = filas.map((f) => {
    if (!esTipoMgx(f.data_type)) {
      throw new Error(`${k}.${f.column_name} es de tipo «${f.data_type}», que no se sabe copiar.`);
    }
    return { nombre: f.column_name, tipo: f.data_type };
  });
  cacheOrigen.set(k, cols);
  return cols;
}

/** Las columnas que el espejo sabe recibir (para avisar si MGX agregó alguna). */
async function columnasEspejo(db: Admin, tabla: string): Promise<Set<string>> {
  const ya = cacheEspejo.get(tabla);
  if (ya) return ya;
  const { data, error } = await db.rpc("mgx_columnas", { p_tabla: tabla });
  if (error) throw new Error(`columnas de ${tabla}: ${error.message}`);
  const s = new Set<string>((data as string[] | null) ?? []);
  cacheEspejo.set(tabla, s);
  return s;
}

// ── Estado ───────────────────────────────────────────────────────────────────

async function leerEstado(db: Admin, par: Par): Promise<FilaMgxTablas> {
  const { data, error } = await db
    .from("mgx_tablas")
    .select("*")
    .eq("empresa", par.empresa)
    .eq("modulo", par.modulo)
    .eq("tabla", par.tabla)
    .maybeSingle();
  if (error) throw new Error(`estado de ${etiquetaPar(par)}: ${error.message}`);
  if (!data) throw new Error(`${etiquetaPar(par)} no está en mgx_tablas: ¿falta aplicar la migración?`);
  return data as FilaMgxTablas;
}

async function guardarEstado(db: Admin, par: Par, patch: Partial<FilaMgxTablas>): Promise<void> {
  const { error } = await db
    .from("mgx_tablas")
    .update({ ...patch, ultima_corrida_at: new Date().toISOString() })
    .eq("empresa", par.empresa)
    .eq("modulo", par.modulo)
    .eq("tabla", par.tabla);
  if (error) throw new Error(`guardar estado de ${etiquetaPar(par)}: ${error.message}`);
}

// ── Escritura ────────────────────────────────────────────────────────────────

function tamanos(op: OpcionesCorrida): [number, number] {
  return [op.bytesPorLote ?? 3 * 1024 * 1024, op.filasPorLote ?? Number(process.env.MGX_LOTE_ESCRITURA ?? 2000)];
}

/** Escribe con `mgx_upsert`. Devuelve cuántas eran nuevas. */
async function escribirUpsert(db: Admin, tabla: string, filas: FilaMgx[], op: OpcionesCorrida): Promise<number> {
  let nuevas = 0;
  for (const lote of partirPorBytes(filas, ...tamanos(op))) {
    const { data, error } = await db.rpc("mgx_upsert", { p_tabla: tabla, p_filas: lote });
    if (error) throw new Error(`escribir ${tabla}: ${error.message}`);
    nuevas += Number((data as { nuevas?: number } | null)?.nuevas ?? 0);
  }
  return nuevas;
}

// ── Lectura ──────────────────────────────────────────────────────────────────

function origen(par: Par): string {
  return `"${esquemaOrigen(par.empresa, par.modulo)}"."${par.tabla}"`;
}

/** Hora actual del servidor de MGX, en su hora de pared (sin zona). */
async function ahoraMgx(): Promise<string> {
  const [r] = await mgxQuery<{ t: string }>(`SELECT localtimestamp::text AS t`);
  return r.t;
}

// ── Estrategias ──────────────────────────────────────────────────────────────

interface Contexto {
  db: Admin;
  par: Par;
  tabla: string;
  columnas: ColumnaMeta[];
  estado: FilaMgxTablas;
  op: OpcionesCorrida;
  corridaId: number;
}

const sinTiempo = (op: OpcionesCorrida) => Date.now() > op.deadline;

/**
 * Recarga completa de la empresa. Solo para tablas chicas (ver `plan.ts`), así
 * que no se parte entre llamadas: se lee y escribe de una vez.
 */
async function reemplazo(c: Contexto): Promise<ResultadoPar> {
  const { db, par, tabla, columnas, estado, op } = c;
  const [{ n }] = await mgxQuery<{ n: string }>(`SELECT count(*)::text AS n FROM ${origen(par)}`);
  const enMgx = Number(n);
  const antes = Number(estado.filas ?? 0);
  // Un origen que de golpe trae menos de la mitad es más probablemente una
  // consulta que falló que una baja masiva: no se borra nada.
  if (antes > 20 && enMgx < antes * 0.5) {
    throw new Error(
      `MGX trae ${enMgx} filas y el espejo tiene ${antes}: no se reemplaza (¿consulta incompleta?). ` +
        `Si es correcto, ponga filas=0 en mgx_tablas y vuelva a sincronizar.`
    );
  }

  const lote = op.loteLectura ?? LOTE_LECTURA;
  let desde = 0;
  let primero = true;
  let escritas = 0;
  for (;;) {
    const crudas = await mgxQuery(`SELECT * FROM ${origen(par)} WHERE ide > $1 ORDER BY ide LIMIT $2`, [desde, lote]);
    if (!crudas.length) break;
    const filas = crudas.map((f) => limpiarFila(f, columnas, par.empresa));
    for (const parte of partirPorBytes(filas, ...tamanos(op))) {
      const { error } = await db.rpc("mgx_reemplazar", {
        p_tabla: tabla,
        p_empresa: par.empresa,
        p_filas: parte,
        p_primero: primero,
      });
      if (error) throw new Error(`reemplazar ${tabla}: ${error.message}`);
      primero = false;
      escritas += parte.length;
    }
    desde = Number(crudas[crudas.length - 1].ide);
    if (crudas.length < lote) break;
  }
  if (primero) {
    // MGX no tiene filas de esta empresa: se vacía el espejo también.
    const { error } = await db.rpc("mgx_reemplazar", { p_tabla: tabla, p_empresa: par.empresa, p_filas: [], p_primero: true });
    if (error) throw new Error(`vaciar ${tabla}: ${error.message}`);
  }
  await guardarEstado(db, par, {
    estado: "ok",
    fase: null,
    error: null,
    filas: escritas,
    ultimo_ide: desde || null,
    ultima_edicion: null,
    corrida_id: c.corridaId,
  });
  op.log?.(`${etiquetaPar(par)}  reemplazo  ${escritas.toLocaleString("es-CO")} filas`);
  return { par, filas: escritas, terminado: true, fase: "reemplazo" };
}

/** Fase común: filas con `ide` mayor que la marca. Devuelve false si se acabó el tiempo. */
async function nuevasPorIde(c: Contexto, acumular: (n: number) => void): Promise<boolean> {
  const { db, par, tabla, columnas, op } = c;
  const lote = op.loteLectura ?? LOTE_LECTURA;
  let desde = Number(c.estado.ultimo_ide ?? 0);
  let filasEspejo = Number(c.estado.filas ?? 0);
  for (;;) {
    if (sinTiempo(op)) return false;
    const t0 = Date.now();
    const crudas = await mgxQuery(`SELECT * FROM ${origen(par)} WHERE ide > $1 ORDER BY ide LIMIT $2`, [desde, lote]);
    if (!crudas.length) break;
    const filas = crudas.map((f) => limpiarFila(f, columnas, par.empresa));
    const nuevas = await escribirUpsert(db, tabla, filas, op);
    desde = Number(crudas[crudas.length - 1].ide);
    filasEspejo += nuevas;
    acumular(filas.length);
    await guardarEstado(db, par, { ultimo_ide: desde, filas: filasEspejo, fase: "nuevas", estado: "corriendo" });
    c.estado.ultimo_ide = desde;
    c.estado.filas = filasEspejo;
    op.log?.(
      `${etiquetaPar(par)}  nuevas  hasta ide ${desde.toLocaleString("es-CO")}  ` +
        `${filas.length.toLocaleString("es-CO")} filas  ${((Date.now() - t0) / 1000).toFixed(1)} s`
    );
    if (crudas.length < lote) break;
  }
  return true;
}

/**
 * La primera vez se trae todo por `ide`, y la marca de edición se fija en la
 * hora de MGX al EMPEZAR: lo que se edite durante la carga larga lo recoge la
 * corrida siguiente, con el margen de 24 horas.
 */
async function prepararPrimeraVez(c: Contexto): Promise<boolean> {
  const v = calcularVentana(c.estado);
  if (!v.primeraVez) return false;
  const marca = await ahoraMgx();
  await guardarEstado(c.db, c.par, { ultimo_ide: 0, ultima_edicion: marca, filas: 0, estado: "corriendo", fase: "nuevas" });
  c.estado.ultimo_ide = 0;
  c.estado.ultima_edicion = marca;
  c.estado.filas = 0;
  return true;
}

async function incrementalEdicion(c: Contexto): Promise<ResultadoPar> {
  const { db, par, tabla, columnas, op } = c;
  let escritas = 0;
  const sumar = (n: number) => (escritas += n);
  const col = columnaEdicion({ modulo: par.modulo, tabla: par.tabla, columnas: columnas.map((x) => x.nombre) });
  if (!col) throw new Error(`${etiquetaPar(par)} no tiene fecha de edición fiable: use la estrategia «reemplazo».`);

  const primera = await prepararPrimeraVez(c);
  if (!(await nuevasPorIde(c, sumar))) return { par, filas: escritas, terminado: false, fase: "nuevas" };

  if (!primera) {
    const v = calcularVentana(c.estado);
    let cursor: [string, number] = [v.desdeEdicion ?? "1900-01-01 00:00:00", 0];
    const lote = op.loteLectura ?? LOTE_LECTURA;
    for (;;) {
      if (sinTiempo(op)) return { par, filas: escritas, terminado: false, fase: "editados" };
      const crudas = await mgxQuery(
        // El `>=` aparte es para que MGX use su índice de la fecha de edición;
        // la comparación de filas sola no lo aprovecha.
        `SELECT * FROM ${origen(par)}
          WHERE "${col}" >= $1::timestamp AND ("${col}", ide) > ($1::timestamp, $2)
          ORDER BY "${col}", ide LIMIT $3`,
        [cursor[0], cursor[1], lote]
      );
      if (!crudas.length) break;
      const filas = crudas.map((f) => limpiarFila(f, columnas, par.empresa));
      const nuevas = await escribirUpsert(db, tabla, filas, op);
      escritas += filas.length;
      const ultima = crudas[crudas.length - 1];
      cursor = [String(ultima[col]), Number(ultima.ide)];
      c.estado.filas = Number(c.estado.filas ?? 0) + nuevas;
      c.estado.ultima_edicion = avanzarMarca(c.estado.ultima_edicion, crudas, col, new Date());
      await guardarEstado(db, par, {
        ultima_edicion: c.estado.ultima_edicion,
        filas: c.estado.filas,
        fase: "editados",
        estado: "corriendo",
      });
      op.log?.(`${etiquetaPar(par)}  editados  ${filas.length.toLocaleString("es-CO")} filas hasta ${cursor[0]}`);
      if (crudas.length < lote) break;
    }
  }

  await guardarEstado(db, par, { estado: "ok", fase: null, error: null, corrida_id: c.corridaId });
  return { par, filas: escritas, terminado: true };
}

const LLAVE_MGX = `(rtrim(ano_doc::text) || rtrim(per_doc::text) || rtrim(tip_doc::text) || rtrim(num_doc::text))`;

/**
 * El cuerpo: nuevas por `ide`, y los documentos cuya CABEZA se editó se
 * re-traen enteros. La marca `ultima_edicion` de esta fila es la `fhedicion`
 * de la cabeza en MGX hasta la que ya se re-trajo.
 */
async function incrementalDocumento(c: Contexto): Promise<ResultadoPar> {
  const { db, par, tabla, columnas, op } = c;
  let escritas = 0;
  const primera = await prepararPrimeraVez(c);
  if (!(await nuevasPorIde(c, (n) => (escritas += n)))) {
    return { par, filas: escritas, terminado: false, fase: "nuevas" };
  }

  if (!primera) {
    const v = calcularVentana(c.estado);
    const cabeza = `"${esquemaOrigen(par.empresa, par.modulo)}"."cabeza"`;
    let cursor: [string, number] = [v.desdeEdicion ?? "1900-01-01 00:00:00", 0];
    for (;;) {
      if (sinTiempo(op)) return { par, filas: escritas, terminado: false, fase: "editados" };
      const docs = await mgxQuery(
        `SELECT ano_doc, per_doc, tip_doc, num_doc, fhedicion, ide FROM ${cabeza}
          WHERE fhedicion >= $1::timestamp AND (fhedicion, ide) > ($1::timestamp, $2)
          ORDER BY fhedicion, ide LIMIT $3`,
        [cursor[0], cursor[1], DOCS_POR_CONSULTA]
      );
      if (!docs.length) break;

      const pedidas = new Map<string, FilaMgx[]>();
      for (const d of docs) pedidas.set(llaveDocumento(d), []);
      const indice = [...new Set(docs.map(llaveIndiceMgx))];
      const crudas = await mgxQuery(`SELECT * FROM ${origen(par)} WHERE ${LLAVE_MGX} = ANY($1::text[])`, [indice]);
      for (const f of crudas) {
        // Sin separador dos documentos pueden dar la misma llave en MGX: solo
        // entra lo que es de verdad de un documento pedido.
        const lista = pedidas.get(llaveDocumento(f));
        if (lista) lista.push(limpiarFila(f, columnas, par.empresa));
      }

      let borradas = 0;
      let insertadas = 0;
      for (const parte of partirDocumentos(pedidas, ...tamanos(op))) {
        const { data, error } = await db.rpc("mgx_reemplazar_documentos", {
          p_tabla: tabla,
          p_empresa: par.empresa,
          p_llaves: parte.llaves,
          p_filas: parte.filas,
        });
        if (error) throw new Error(`documentos de ${tabla}: ${error.message}`);
        const r = (data ?? {}) as { borradas?: number; insertadas?: number };
        borradas += Number(r.borradas ?? 0);
        insertadas += Number(r.insertadas ?? 0);
      }
      escritas += insertadas;
      const ultima = docs[docs.length - 1];
      cursor = [String(ultima.fhedicion), Number(ultima.ide)];
      c.estado.filas = Number(c.estado.filas ?? 0) + insertadas - borradas;
      c.estado.ultima_edicion = avanzarMarca(c.estado.ultima_edicion, docs, "fhedicion", new Date());
      await guardarEstado(db, par, {
        ultima_edicion: c.estado.ultima_edicion,
        filas: c.estado.filas,
        fase: "editados",
        estado: "corriendo",
      });
      op.log?.(
        `${etiquetaPar(par)}  documentos editados  ${docs.length} doc · ${insertadas.toLocaleString("es-CO")} filas hasta ${cursor[0]}`
      );
      if (docs.length < DOCS_POR_CONSULTA) break;
    }
  }

  await guardarEstado(db, par, { estado: "ok", fase: null, error: null, corrida_id: c.corridaId });
  return { par, filas: escritas, terminado: true };
}

// ── Un par ───────────────────────────────────────────────────────────────────

export async function sincronizarPar(db: Admin, par: Par, op: OpcionesCorrida, corridaId: number): Promise<ResultadoPar> {
  const estado = await leerEstado(db, par);
  if (!estado.activa) return { par, filas: 0, terminado: true, aviso: "inactiva: se omite" };

  const tabla = nombreEspejo(par.modulo, par.tabla);
  try {
    const columnas = await columnasOrigen(par);
    const espejo = await columnasEspejo(db, tabla);
    const faltan = columnas.map((x) => nombreEnEspejo(x.nombre)).filter((n) => !espejo.has(n));
    const aviso = faltan.length
      ? `MGX tiene columnas que el espejo no: ${faltan.join(", ")}. Regenere la migración (ver docs/mgx-sincronizacion.md).`
      : null;
    await guardarEstado(db, par, { estado: "corriendo", error: null, aviso, corrida_id: corridaId });

    const c: Contexto = { db, par, tabla, columnas, estado, op, corridaId };
    const r =
      estado.estrategia === "reemplazo"
        ? await reemplazo(c)
        : estado.estrategia === "incremental_edicion"
          ? await incrementalEdicion(c)
          : await incrementalDocumento(c);
    if (!r.terminado) await guardarEstado(db, par, { estado: "pendiente" });
    return { ...r, aviso };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await guardarEstado(db, par, { estado: "error", error: msg.slice(0, 2000), corrida_id: corridaId });
    } catch {
      // Si tampoco se puede escribir el estado, el error ya va en el resultado.
    }
    if (esErrorDeConexion(e)) throw e;
    op.log?.(`${etiquetaPar(par)}  ERROR  ${msg}`);
    return { par, filas: 0, terminado: true, error: msg };
  }
}

// ── Corridas ─────────────────────────────────────────────────────────────────

export async function abrirCorrida(
  db: Admin,
  datos: { origen: "manual" | "script"; usuarioEmail?: string | null; alcance: unknown }
): Promise<number> {
  const umbral = new Date(Date.now() - CORRIDA_VIGENTE_MIN * 60_000).toISOString();
  const { data: viva, error: e1 } = await db
    .from("mgx_corridas")
    .select("id, origen, usuario_email, iniciada_at")
    .eq("estado", "corriendo")
    .gt("actualizada_at", umbral)
    .limit(1)
    .maybeSingle();
  if (e1) throw new Error(`mgx_corridas: ${e1.message}`);
  if (viva) {
    throw new Error(
      `Ya hay una sincronización de MGX en curso (#${viva.id}, ${viva.origen}` +
        `${viva.usuario_email ? `, ${viva.usuario_email}` : ""}). Espere a que termine.`
    );
  }
  const { data, error } = await db
    .from("mgx_corridas")
    .insert({ origen: datos.origen, usuario_email: datos.usuarioEmail ?? null, alcance: datos.alcance })
    .select("id")
    .single();
  if (error) throw new Error(`abrir corrida: ${error.message}`);
  return Number(data.id);
}

async function latido(db: Admin, corridaId: number, filasDelta: number): Promise<void> {
  const { data } = await db.from("mgx_corridas").select("filas").eq("id", corridaId).maybeSingle();
  await db
    .from("mgx_corridas")
    .update({ actualizada_at: new Date().toISOString(), filas: Number(data?.filas ?? 0) + filasDelta })
    .eq("id", corridaId);
}

export async function cerrarCorrida(
  db: Admin,
  corridaId: number,
  estado: "ok" | "error" | "parcial",
  error?: string | null
): Promise<void> {
  await db
    .from("mgx_corridas")
    .update({
      estado,
      error: error ?? null,
      terminada_at: new Date().toISOString(),
      actualizada_at: new Date().toISOString(),
    })
    .eq("id", corridaId);
}

/**
 * Recorre los pares en orden hasta terminarlos o quedarse sin tiempo. Devuelve
 * lo hecho y lo que falta (el primero de `pendientes` puede ser un par a
 * medias: su progreso ya está en `mgx_tablas`).
 */
export async function sincronizarPares(
  db: Admin,
  pares: readonly Par[],
  op: OpcionesCorrida,
  corridaId: number
): Promise<{ hechos: ResultadoPar[]; pendientes: Par[] }> {
  const hechos: ResultadoPar[] = [];
  for (let i = 0; i < pares.length; i++) {
    if (sinTiempo(op)) return { hechos, pendientes: pares.slice(i) };
    const r = await sincronizarPar(db, pares[i], op, corridaId);
    hechos.push(r);
    await latido(db, corridaId, r.filas);
    if (!r.terminado) return { hechos, pendientes: pares.slice(i) };
  }
  return { hechos, pendientes: [] };
}

// ── Reconciliación (solo script) ─────────────────────────────────────────────

/**
 * Borra del espejo las filas que MGX ya no tiene. El incremental no las ve: si
 * MGX borra un documento entero, su cuerpo y su cabeza se quedan aquí.
 *
 * Compara por rangos de `ide` para no tener 16 millones de enteros en memoria,
 * y aplica el mismo freno que el espejo de GEMA: si habría que borrar más del
 * `maximoBorrado`, no borra nada y lo informa.
 */
export async function reconciliarPar(
  db: Admin,
  par: Par,
  opciones: { soloInforme: boolean; maximoBorrado: number; rango?: number; log?: (s: string) => void }
): Promise<{ sobrantes: number; borradas: number; total: number; motivo?: string }> {
  const tabla = nombreEspejo(par.modulo, par.tabla);
  const rango = opciones.rango ?? 200_000;
  const [{ mx }] = await mgxQuery<{ mx: number | null }>(`SELECT max(ide) AS mx FROM ${origen(par)}`);
  const { data: total, error: et } = await db.rpc("mgx_contar", { p_tabla: tabla, p_empresa: par.empresa });
  if (et) throw new Error(`contar ${tabla}: ${et.message}`);
  const guardadas = Number(total ?? 0);

  // El espejo puede tener ide más allá del máximo de MGX (filas que MGX borró al final).
  const { data: maxEspejo } = await db
    .from(tabla)
    .select("ide")
    .eq("empresa", par.empresa)
    .order("ide", { ascending: false })
    .limit(1)
    .maybeSingle();
  const hasta = Math.max(Number(mx ?? 0), Number(maxEspejo?.ide ?? 0));

  const sobrantes: number[] = [];
  for (let desde = 0; desde < hasta; desde += rango) {
    const tope = desde + rango;
    const enMgx = await mgxQuery<{ ide: number }>(
      `SELECT ide FROM ${origen(par)} WHERE ide > $1 AND ide <= $2`,
      [desde, tope]
    );
    const vigentes = new Set(enMgx.map((r) => Number(r.ide)));
    const { data, error } = await db.rpc("mgx_ides", { p_tabla: tabla, p_empresa: par.empresa, p_desde: desde, p_hasta: tope });
    if (error) throw new Error(`ides de ${tabla}: ${error.message}`);
    for (const ide of (data as number[] | null) ?? []) if (!vigentes.has(ide)) sobrantes.push(ide);
  }
  opciones.log?.(`${etiquetaPar(par)}  ${sobrantes.length} sobrantes de ${guardadas.toLocaleString("es-CO")}`);

  if (!sobrantes.length || opciones.soloInforme) return { sobrantes: sobrantes.length, borradas: 0, total: guardadas };
  if (sobrantes.length > guardadas * opciones.maximoBorrado) {
    return {
      sobrantes: sobrantes.length,
      borradas: 0,
      total: guardadas,
      motivo: `habría que borrar ${sobrantes.length} de ${guardadas} (más del ${Math.round(opciones.maximoBorrado * 100)} %): revíselo a mano`,
    };
  }
  let borradas = 0;
  for (let i = 0; i < sobrantes.length; i += 500) {
    const { data, error } = await db.rpc("mgx_borrar", {
      p_tabla: tabla,
      p_empresa: par.empresa,
      p_ides: sobrantes.slice(i, i + 500),
    });
    if (error) throw new Error(`borrar de ${tabla}: ${error.message}`);
    borradas += Number(data ?? 0);
  }
  await guardarEstado(db, par, { filas: guardadas - borradas });
  return { sobrantes: sobrantes.length, borradas, total: guardadas };
}
