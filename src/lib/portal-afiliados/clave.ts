/**
 * Claves del portal de afiliados: scrypt de Node (sin dependencias nuevas),
 * con sal aleatoria por cuenta y comparación en tiempo constante. Se guarda
 * "scrypt$N$r$p$sal$hash" para poder subir el costo más adelante sin romper
 * las claves ya guardadas.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";

const N = 16384;
const R = 8;
const P = 1;
const LARGO = 32;

function scrypt(clave: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((ok, fail) =>
    scryptCb(clave.normalize("NFKC"), sal, LARGO, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? fail(e) : ok(k))),
  );
}

export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const k = await scrypt(clave, sal, N, R, P);
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64url")}$${k.toString("base64url")}`;
}

export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const partes = guardado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, sal, hash] = partes;
  const esperado = Buffer.from(hash, "base64url");
  const k = await scrypt(clave, Buffer.from(sal, "base64url"), Number(n), Number(r), Number(p));
  return k.length === esperado.length && timingSafeEqual(k, esperado);
}

/**
 * Clave provisional legible, como la de los empleados: sin caracteres
 * ambiguos (O/0, I/l/1) porque Tesorería se la dicta al afiliado.
 */
export function generarClaveProvisional(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const num = "23456789";
  const pick = (s: string, n: number) =>
    Array.from(randomBytes(n)).map((b) => s[b % s.length]).join("");
  return `${pick(abc, 4)}-${pick(num, 4)}-${pick(abc, 4)}`;
}

/** Reglas de la clave que escoge el afiliado. Devuelve el problema o null. */
export function problemaClaveNueva(clave: string, email: string): string | null {
  if (clave.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (clave.length > 128) return "La contraseña es demasiado larga.";
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(clave) || !/\d/.test(clave)) return "Use letras y al menos un número.";
  if (email && clave.toLowerCase().includes(email.split("@")[0].toLowerCase())) {
    return "La contraseña no puede contener su correo.";
  }
  return null;
}
