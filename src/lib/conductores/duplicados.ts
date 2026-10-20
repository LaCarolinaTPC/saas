/**
 * Buscar la ficha REAL de un conductor cuya cédula se digitó mal. Parte PURA.
 *
 * Sirve para dos cosas, las dos de aviso y **nunca** para decidir solo:
 *   1. Al contratar, dejar escrito en la ficha provisional cuál parece ser la
 *      cédula correcta, para que quien la revise no tenga que investigar.
 *   2. El informe de `scripts/conductores-revisar-altas.mts`.
 *
 * ## Por qué no enlaza automáticamente
 *
 * Se probó la regla contra los datos reales del 2026-10-19 y **caza 15 de los
 * 18 fantasmas de Contratación**, pero los otros tres no tienen hermano
 * hallable (`11051674660` tiene once dígitos; `72224920` y `85370840` no se
 * parecen a ninguna cédula existente). Y aparecieron dos fichas que la regla
 * empareja con razón y que **las dos están confirmadas por GEMA**:
 *
 *     72259354  RANGEL  SERGIO ANDRES   ~   722593541  RANGEL  SERGIO ANDRES
 *
 * Es un duplicado del propio GEMA, no un fantasma. Con tres casos sin resolver
 * y duplicados en el origen, reasignar una cédula sola podría pegarle la
 * historia de una persona a otra. Esto propone; una persona decide.
 */

/** Una ficha candidata a ser la real. */
export interface FichaCandidata {
  cedula: string;
  nombre: string | null;
  estado: string | null;
  codigo: string | null;
}

export interface Parecido {
  ficha: FichaCandidata;
  /** Parte de las palabras del nombre que coinciden, de 0 a 1. */
  similitudNombre: number;
  /** Qué le pasó a la cédula. */
  motivo: "digito de mas o de menos" | "digitos cambiados";
}

/** Desde esta coincidencia de nombre se considera la misma persona. */
export const SIMILITUD_MINIMA = 0.6;

/** Máximas ediciones entre dos cédulas para considerarlas la misma mal escrita. */
const EDICIONES_MAXIMAS = 2;

/**
 * Normaliza un nombre a palabras comparables: sin tildes, Ñ -> N, mayúsculas,
 * y solo letras y dígitos.
 *
 * Misma regla que `tokens()` de `scripts/biometrico-comun.mts` y `Clave()` de
 * `biometrico-aplicar-ssn-zk.ps1`.
 */
export function palabrasDelNombre(nombre: string | null): Set<string> {
  const limpio = String(nombre ?? "")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[Ññ]/g, "N")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  // Las de 1-2 letras son conectores («DE», «LA», «Y») y no distinguen a nadie.
  return new Set(limpio.split(" ").filter((p) => p.length > 2));
}

/**
 * Qué parte de las palabras coincide, sin importar el orden: GEMA escribe
 * «APELLIDO NOMBRE» y Contratación «NOMBRE APELLIDO».
 *
 * Se divide por el conjunto más pequeño a propósito: «ALEJANDRO GONZALEZ» (2
 * palabras) contra «GONZALEZ GONZALEZ ALEJANDRO ARNALDO» (3 distintas) da 1,
 * que es lo correcto — el nombre corto está contenido en el largo.
 */
export function similitudDeNombre(a: string | null, b: string | null): number {
  const A = palabrasDelNombre(a);
  const B = palabrasDelNombre(b);
  if (A.size === 0 || B.size === 0) return 0;
  let comunes = 0;
  for (const p of A) if (B.has(p)) comunes++;
  return comunes / Math.min(A.size, B.size);
}

/** Distancia de edición acotada: si pasa de `tope`, corta y devuelve tope + 1. */
export function distanciaAcotada(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  const previa = new Array<number>(b.length + 1);
  const actual = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) previa[j] = j;
  for (let i = 1; i <= a.length; i++) {
    actual[0] = i;
    let mejor = actual[0];
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(
        previa[j] + 1,
        actual[j - 1] + 1,
        previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (actual[j] < mejor) mejor = actual[j];
    }
    if (mejor > tope) return tope + 1;
    for (let j = 0; j <= b.length; j++) previa[j] = actual[j];
  }
  return previa[b.length];
}

/**
 * ¿Son la misma cédula mal escrita? Devuelve el motivo, o `null`.
 *
 * Los dos casos que se vieron en los datos: un dígito de más o de menos en una
 * punta (`72432641` -> `724432641`, `1001915077` -> `100191507`) y dígitos
 * cambiados o transpuestos (`8803185` -> `8803158`).
 */
export function mismaCedulaMalEscrita(a: string, b: string): Parecido["motivo"] | null {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y || x === y) return null;

  const difLargo = Math.abs(x.length - y.length);
  if (difLargo > EDICIONES_MAXIMAS) return null;

  // Una es la otra con dígitos recortados de una punta (`1001915077` ->
  // `100191507`), o están a pocas ediciones (`8803185` -> `8803158`, o
  // `72432641` -> `724432641`, con el dígito metido en medio).
  const porLaPunta = x.startsWith(y) || y.startsWith(x) || x.endsWith(y) || y.endsWith(x);
  const cerca = distanciaAcotada(x, y, EDICIONES_MAXIMAS) <= EDICIONES_MAXIMAS;
  if (!porLaPunta && !cerca) return null;

  // El motivo lo decide la longitud, que es lo que de verdad los separa: si
  // mide igual, cambiaron dígitos; si no, sobran o faltan.
  return difLargo === 0 ? "digitos cambiados" : "digito de mas o de menos";
}

/**
 * Las fichas que parecen ser la misma persona con la cédula bien escrita,
 * ordenadas de más a menos parecida.
 *
 * Solo se comparan fichas **confirmadas por GEMA** (con `codigo`): comparar
 * dos provisionales entre sí no aporta, porque ninguna es la verdad.
 */
export function buscarFichaReal(
  cedula: string,
  nombre: string | null,
  candidatas: FichaCandidata[],
  similitudMinima = SIMILITUD_MINIMA
): Parecido[] {
  const propia = cedula.trim();
  const salida: Parecido[] = [];
  for (const ficha of candidatas) {
    if (!(ficha.codigo ?? "").trim()) continue;
    const otra = String(ficha.cedula ?? "").trim();
    const motivo = mismaCedulaMalEscrita(propia, otra);
    if (!motivo) continue;
    const similitudNombre = similitudDeNombre(nombre, ficha.nombre);
    if (similitudNombre < similitudMinima) continue;
    salida.push({ ficha, similitudNombre, motivo });
  }
  return salida.sort((a, b) => b.similitudNombre - a.similitudNombre);
}

/** Una línea para dejar en `observacion`, que es donde la ve quien corrige. */
export function notaDeRevision(parecidos: Parecido[]): string | null {
  if (parecidos.length === 0) return null;
  const p = parecidos[0];
  const cola = parecidos.length > 1 ? ` (y ${parecidos.length - 1} más)` : "";
  return (
    `REVISAR LA CEDULA: GEMA no conoce esta y se parece a ${p.ficha.cedula} ` +
    `(${p.ficha.nombre ?? "sin nombre"}, ${p.ficha.estado ?? "sin estado"}) ` +
    `por ${p.motivo}${cola}.`
  );
}
