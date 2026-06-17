import mysql from "mysql2/promise";

/**
 * Conexión de SOLO LECTURA a la base MySQL `gema_cr` (La Carolina).
 * Permisos del usuario: SELECT sobre vistas vst_ext_*, EXECUTE sobre
 * procedimientos pa_ext_*. No hay permisos de escritura.
 *
 * Las credenciales viven en variables de entorno (.env.local / Vercel):
 *   GEMA_DB_HOST, GEMA_DB_PORT, GEMA_DB_USER, GEMA_DB_PASSWORD, GEMA_DB_NAME
 */

let pool: mysql.Pool | null = null;

export function getGemaPool(): mysql.Pool {
  if (pool) return pool;

  const host = process.env.GEMA_DB_HOST;
  const user = process.env.GEMA_DB_USER;
  const password = process.env.GEMA_DB_PASSWORD;
  const database = process.env.GEMA_DB_NAME ?? "gema_cr";
  const port = Number(process.env.GEMA_DB_PORT ?? 3306);

  if (!host || !user || !password) {
    throw new Error(
      "Faltan variables de entorno de GEMA (GEMA_DB_HOST / GEMA_DB_USER / GEMA_DB_PASSWORD)."
    );
  }

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    connectTimeout: 30_000,
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0,
    // Devolvemos fechas como string 'YYYY-MM-DD ...' para evitar
    // corrimientos de zona horaria al convertir a Date de JS.
    dateStrings: true,
    timezone: "Z",
  });

  return pool;
}

type Row = Record<string, unknown>;

/** Lee una vista maestra completa. */
export async function queryView(view: string): Promise<Row[]> {
  const [rows] = await getGemaPool().query<mysql.RowDataPacket[]>(
    `SELECT * FROM \`${view}\``
  );
  return rows as Row[];
}

/**
 * Ejecuta un procedimiento almacenado parametrizado por fecha y devuelve
 * el primer (y único) resultset. mysql2 devuelve [resultsets..., okPacket]
 * para los CALL, así que tomamos el primer arreglo de filas.
 */
export async function callProc(proc: string, params: unknown[]): Promise<Row[]> {
  const placeholders = params.map(() => "?").join(", ");
  const [result] = await getGemaPool().query<mysql.RowDataPacket[][]>(
    `CALL \`${proc}\`(${placeholders})`,
    params
  );
  const first = Array.isArray(result) ? result[0] : result;
  return (Array.isArray(first) ? first : []) as Row[];
}

/** Cierra el pool (útil en scripts puntuales). */
export async function closeGemaPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
