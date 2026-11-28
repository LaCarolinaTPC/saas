/**
 * Quita el texto de una secuencia de contenido de PDF (23-nov-2026): se borran
 * solo los operadores que dibujan letras (Tj, TJ, ' y ") con sus operandos;
 * todo lo demás (imágenes, líneas, colores, cambios de letra) queda igual, para
 * no alterar el resto de la página. Con eso la carta del banco se reescribe
 * entera y el PDF no guarda escondidas las marcas de la plantilla. PURO.
 */

const BLANCO = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIM = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"].map((c) => c.charCodeAt(0)));

interface Token {
  inicio: number;
  fin: number;
  /** Operador (palabra suelta) u operando. */
  operador: string | null;
}

/** Los tokens de la secuencia; las cadenas, arreglos y diccionarios cuentan como un solo operando. */
function tokens(s: Uint8Array): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = s.length;
  const saltarCadena = () => {
    // ( … ) con paréntesis anidados y escapes.
    let prof = 0;
    for (; i < n; i++) {
      const c = s[i];
      if (c === 0x5c) i++;
      else if (c === 0x28) prof++;
      else if (c === 0x29 && --prof === 0) {
        i++;
        return;
      }
    }
  };
  const saltarHex = () => {
    while (i < n && s[i] !== 0x3e) i++;
    i++;
  };
  const saltarDict = () => {
    let prof = 0;
    while (i < n) {
      if (s[i] === 0x3c && s[i + 1] === 0x3c) {
        prof++;
        i += 2;
      } else if (s[i] === 0x3e && s[i + 1] === 0x3e) {
        prof--;
        i += 2;
        if (prof === 0) return;
      } else if (s[i] === 0x28) saltarCadena();
      else i++;
    }
  };
  while (i < n) {
    const c = s[i];
    if (BLANCO.has(c)) {
      i++;
      continue;
    }
    if (c === 0x25) {
      // Comentario hasta el fin de línea.
      while (i < n && s[i] !== 0x0a && s[i] !== 0x0d) i++;
      continue;
    }
    const inicio = i;
    if (c === 0x28) {
      saltarCadena();
      out.push({ inicio, fin: i, operador: null });
    } else if (c === 0x3c && s[i + 1] === 0x3c) {
      saltarDict();
      out.push({ inicio, fin: i, operador: null });
    } else if (c === 0x3c) {
      saltarHex();
      out.push({ inicio, fin: i, operador: null });
    } else if (c === 0x5b) {
      // [ … ] (el de TJ: cadenas y números, sin arreglos anidados).
      i++;
      while (i < n && s[i] !== 0x5d) {
        if (s[i] === 0x28) saltarCadena();
        else if (s[i] === 0x3c) saltarHex();
        else i++;
      }
      i++;
      out.push({ inicio, fin: i, operador: null });
    } else if (c === 0x2f) {
      i++;
      while (i < n && !BLANCO.has(s[i]) && !DELIM.has(s[i])) i++;
      out.push({ inicio, fin: i, operador: null });
    } else {
      while (i < n && !BLANCO.has(s[i]) && !DELIM.has(s[i])) i++;
      if (i === inicio) i++; // un delimitador suelto (p. ej. «]» de más): se salta
      const palabra = latin1(s.subarray(inicio, i));
      const numero = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(palabra);
      out.push({ inicio, fin: i, operador: numero || palabra === "true" || palabra === "false" || palabra === "null" ? null : palabra });
      if (palabra === "ID") {
        // Imagen en línea: datos binarios hasta « EI».
        i++;
        while (i < n && !(BLANCO.has(s[i - 1]) && s[i] === 0x45 && s[i + 1] === 0x49 && (i + 2 >= n || BLANCO.has(s[i + 2])))) i++;
        out.push({ inicio: i, fin: i + 2, operador: "EI" });
        i += 2;
      }
    }
  }
  return out;
}

const latin1 = (b: Uint8Array) => Array.from(b, (x) => String.fromCharCode(x)).join("");

/** La secuencia sin los operadores que dibujan texto. */
export function quitarTexto(contenido: Uint8Array): Uint8Array {
  const toks = tokens(contenido);
  const cortes: { inicio: number; fin: number; reemplazo: string }[] = [];
  let operandos: Token[] = [];
  for (const t of toks) {
    if (!t.operador) {
      operandos.push(t);
      continue;
    }
    const desde = operandos[0]?.inicio ?? t.inicio;
    if (t.operador === "Tj" || t.operador === "TJ") cortes.push({ inicio: desde, fin: t.fin, reemplazo: "" });
    // ' pasa al renglón siguiente y dibuja; " además fija los espacios: se conserva lo que no es dibujar.
    else if (t.operador === "'") cortes.push({ inicio: desde, fin: t.fin, reemplazo: "T*" });
    else if (t.operador === '"' && operandos.length >= 3) {
      const num = (k: number) => latin1(contenido.subarray(operandos[k].inicio, operandos[k].fin));
      cortes.push({ inicio: desde, fin: t.fin, reemplazo: `${num(0)} Tw ${num(1)} Tc T*` });
    }
    operandos = [];
  }
  if (!cortes.length) return contenido;
  const partes: Uint8Array[] = [];
  let pos = 0;
  for (const c of cortes) {
    partes.push(contenido.subarray(pos, c.inicio));
    if (c.reemplazo) partes.push(Uint8Array.from(c.reemplazo, (ch) => ch.charCodeAt(0)));
    pos = c.fin;
  }
  partes.push(contenido.subarray(pos));
  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let k = 0;
  for (const p of partes) {
    out.set(p, k);
    k += p.length;
  }
  return out;
}
