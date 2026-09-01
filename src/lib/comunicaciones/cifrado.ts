/**
 * Cifrado de secretos del canal (portado de Varylo, AES-256-GCM con formato
 * iv:tag:cipher en hex). Si ENCRYPTION_KEY no está definida, los valores se
 * guardan en claro — la tabla ya es exclusiva de service_role — y el formato
 * del marcador permite mezclar ambos sin re-guardar.
 * ENCRYPTION_KEY: 64 caracteres hex (32 bytes), p. ej. `openssl rand -hex 32`.
 */
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITMO = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;

function clave(): Buffer | null {
  const k = process.env.ENCRYPTION_KEY;
  if (!k || k.length !== 64) return null;
  return Buffer.from(k, "hex");
}

export function estaCifrado(valor: string): boolean {
  const p = valor.split(":");
  return (
    p.length === 3 &&
    p[0].length === IV_LEN * 2 &&
    p[1].length === TAG_LEN * 2 &&
    /^[0-9a-f]+$/i.test(p[0]) &&
    /^[0-9a-f]+$/i.test(p[1])
  );
}

/** Cifra si hay clave; si no, devuelve el valor tal cual. */
export function cifrar(texto: string): string {
  const k = clave();
  if (!k) return texto;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITMO, k, iv);
  let enc = cipher.update(texto, "utf8", "hex");
  enc += cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc}`;
}

/** Descifra valores cifrados; los planos (legado o sin clave) pasan intactos. */
export function descifrar(valor: string): string {
  if (!estaCifrado(valor)) return valor;
  const k = clave();
  if (!k) throw new Error("Valor cifrado pero ENCRYPTION_KEY no está definida.");
  const [ivHex, tagHex, enc] = valor.split(":");
  const decipher = createDecipheriv(ALGORITMO, k, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let dec = decipher.update(enc, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}
