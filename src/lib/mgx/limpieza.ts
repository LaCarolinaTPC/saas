/**
 * De una fila de MGX a una fila del espejo. PURO.
 *
 * Tres cosas del origen que no hay que copiar tal cual:
 *
 *   · **Relleno de espacios.** Los `varchar` de MGX vienen con espacios a la
 *     derecha («SIC0400002          ») y MGX compara siempre con `rtrim`. Se
 *     guardan sin ellos, así los cruces en Gestivo son igualdades simples. Solo
 *     a la derecha: un espacio a la izquierda podría ser parte de un código.
 *   · **Fechas centinela.** «Sin fecha» es `0001-01-01`, `0100-01-01` o
 *     `1001-01-01` según la tabla. Cualquier año anterior a 1900 se guarda
 *     NULL: no hay datos reales de antes de 2006.
 *   · **Columnas que faltan.** El espejo tiene la UNIÓN de columnas de todas
 *     las empresas (`co.cuerpo.cantidad` solo existe en algunas): lo que la
 *     fila no traiga va en NULL.
 *
 * Los numéricos y las fechas llegan como TEXTO (ver `client.ts`) y así se
 * mandan: Postgres los convierte sin perder precisión ni correr la zona.
 */

export type TipoMgx =
  | "character varying"
  | "character"
  | "text"
  | "numeric"
  | "integer"
  | "date"
  | "timestamp without time zone";

export type TipoDestino = "text" | "numeric" | "integer" | "date" | "timestamp";

export interface ColumnaMeta {
  nombre: string;
  tipo: TipoMgx;
}

/**
 * Columnas de MGX cuyo nombre choca con las que agrega Gestivo. `rh.pri_epl`
 * tiene una `empresa` propia (el código de empresa de nómina): en el espejo va
 * como `empresa_mgx`, y `empresa` sigue siendo emp0…emp12.
 */
const RENOMBRES: Record<string, string> = {
  empresa: "empresa_mgx",
  sincronizado_at: "sincronizado_at_mgx",
  llave_doc: "llave_doc_mgx",
};

/** El nombre que lleva en el espejo una columna de MGX. */
export function nombreEnEspejo(columnaMgx: string): string {
  return RENOMBRES[columnaMgx] ?? columnaMgx;
}

type Fila = Record<string, unknown>;

export const ANIO_MINIMO = 1900;

const TIPOS: Record<TipoMgx, TipoDestino> = {
  "character varying": "text",
  character: "text",
  text: "text",
  numeric: "numeric",
  integer: "integer",
  date: "date",
  "timestamp without time zone": "timestamp",
};

export function esTipoMgx(t: string): t is TipoMgx {
  return t in TIPOS;
}

export function tipoDestino(t: string): TipoDestino {
  if (!esTipoMgx(t)) throw new Error(`Tipo de MGX no contemplado: «${t}». Hay que agregarlo a limpieza.ts.`);
  return TIPOS[t];
}

/** El año de un texto de fecha `AAAA-MM-DD…`, o null si no lo parece. */
function anio(v: string): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(v);
  return m ? Number(m[1]) : null;
}

export function limpiarValor(v: unknown, tipo: TipoMgx): string | number | null {
  if (v === null || v === undefined) return null;
  switch (TIPOS[tipo]) {
    case "text":
      // `""` se conserva: es distinto de NULL y las llaves de documento lo usan.
      return String(v).replace(/ +$/, "");
    case "numeric": {
      const s = String(v).trim();
      return s === "" ? null : s;
    }
    case "integer": {
      const n = typeof v === "number" ? v : Number(String(v).trim());
      return Number.isFinite(n) ? n : null;
    }
    case "date":
    case "timestamp": {
      const s = String(v).trim();
      const a = anio(s);
      if (a === null || a < ANIO_MINIMO) return null;
      return s;
    }
  }
}

/**
 * La fila lista para el espejo: con `empresa`, cada columna limpia y las que
 * falten en NULL. Columnas que vengan de más (no están en `columnas`) se
 * descartan: el espejo solo recibe lo que conoce.
 */
export function limpiarFila(fila: Fila, columnas: readonly ColumnaMeta[], empresa: string): Fila {
  const salida: Fila = {};
  for (const c of columnas) salida[nombreEnEspejo(c.nombre)] = limpiarValor(fila[c.nombre], c.tipo);
  salida.empresa = empresa;
  return salida;
}

/** Las cuatro columnas que identifican un documento en cabeza y cuerpo. */
export const COLUMNAS_DOCUMENTO = ["ano_doc", "per_doc", "tip_doc", "num_doc"] as const;

const rtrim = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/ +$/, ""));

/**
 * La llave de documento de Gestivo: las cuatro partes sin relleno, separadas
 * por `|`. Igual a la columna generada `llave_doc` del espejo.
 */
export function llaveDocumento(f: Fila): string {
  return COLUMNAS_DOCUMENTO.map((c) => rtrim(f[c])).join("|");
}

/**
 * La misma llave como la indexa MGX: concatenada SIN separador
 * (`rtrim(ano)||rtrim(per)||rtrim(tip)||rtrim(num)`). Solo sirve para usar ese
 * índice al consultar; como sin separador dos documentos podrían dar el mismo
 * texto, lo que vuelve se filtra después con `llaveDocumento`.
 */
export function llaveIndiceMgx(f: Fila): string {
  return COLUMNAS_DOCUMENTO.map((c) => rtrim(f[c])).join("");
}

/** Tamaño aproximado de una fila serializada, para armar lotes por bytes. */
export function bytesDeFila(f: Fila): number {
  return JSON.stringify(f).length;
}
