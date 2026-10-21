import pg from "pg";

/**
 * Conexión de SOLO LECTURA a la base ETL de MGX (`etl_00027`, Postgres).
 * El usuario `etl00027` solo tiene SELECT; MGX la replica a las 2:00 am.
 *
 * Credenciales en variables de entorno (.env.local / Vercel):
 *   MGX_DB_HOST, MGX_DB_PORT, MGX_DB_USER, MGX_DB_PASSWORD, MGX_DB_NAME, MGX_DB_SSL
 *
 * Numéricos, fechas y horas se reciben como TEXTO. `numeric(16,2)` como número
 * de JS pierde precisión en los saldos grandes, y un `Date` correría la hora:
 * MGX guarda `timestamp` sin zona, en hora de Colombia.
 */

const { Pool, types } = pg;

let tiposListos = false;
function prepararTipos(): void {
  if (tiposListos) return;
  const comoTexto = (v: string) => v;
  types.setTypeParser(1700, comoTexto); // numeric
  types.setTypeParser(1082, comoTexto); // date
  types.setTypeParser(1114, comoTexto); // timestamp
  types.setTypeParser(1184, comoTexto); // timestamptz
  types.setTypeParser(20, comoTexto); // int8
  tiposListos = true;
}

let pool: pg.Pool | null = null;

export function getMgxPool(): pg.Pool {
  if (pool) return pool;
  prepararTipos();

  const host = process.env.MGX_DB_HOST;
  const user = process.env.MGX_DB_USER;
  const password = process.env.MGX_DB_PASSWORD;
  const database = process.env.MGX_DB_NAME ?? "etl_00027";
  const port = Number(process.env.MGX_DB_PORT ?? 5432);
  if (!host || !user || !password) {
    throw new Error("Faltan variables de entorno de MGX (MGX_DB_HOST / MGX_DB_USER / MGX_DB_PASSWORD).");
  }

  pool = new Pool({
    host,
    port,
    user,
    password,
    database,
    ssl: /^(true|1|require)$/i.test(process.env.MGX_DB_SSL ?? "") ? { rejectUnauthorized: false } : false,
    max: 3,
    connectionTimeoutMillis: 20_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: Number(process.env.MGX_STATEMENT_TIMEOUT_MS ?? 120_000),
    application_name: "gestivo-mgx",
  });
  // Un error de una conexión ociosa no debe tumbar el proceso.
  pool.on("error", (e) => console.error("[mgx] conexión ociosa:", e.message));
  return pool;
}

export type FilaMgx = Record<string, unknown>;

export async function mgxQuery<T extends FilaMgx = FilaMgx>(sql: string, params?: unknown[]): Promise<T[]> {
  const r = await getMgxPool().query(sql, params);
  return r.rows as T[];
}

/** Cierra el pool (scripts). */
export async function closeMgxPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * ¿El error es de la conexión con MGX (red, credenciales, servidor caído)?
 * Esos abortan la corrida entera: seguir con la siguiente tabla solo
 * repetiría el mismo error 109 veces.
 */
export function esErrorDeConexion(e: unknown): boolean {
  const x = e as { code?: string; message?: string } | null;
  const code = x?.code ?? "";
  if (/^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN)$/.test(code)) return true;
  // 08xxx = conexión, 28xxx = autenticación, 57P0x = servidor apagándose.
  if (/^(08|28|57P0)/.test(code)) return true;
  return /timeout expired|Connection terminated|Faltan variables de entorno de MGX/i.test(x?.message ?? "");
}
