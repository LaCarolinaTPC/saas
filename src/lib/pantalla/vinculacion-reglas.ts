/**
 * Vinculación de televisores por código (PURO).
 *
 * El TV muestra un código de 6 dígitos; alguien de RRHH con sesión en Gestivo
 * lo teclea y el TV recoge su clave en el siguiente sondeo. El código por sí
 * solo no da acceso a nada: vale 10 minutos y solo lo usa un usuario
 * autenticado con el módulo.
 */

export const CODIGO_VIDA_MS = 10 * 60_000;
export const POLL_TV_MS = 4_000;

/** `entero()` debe devolver un entero en [0, 999999]. */
export function generarCodigo(entero: () => number): string {
  const n = Math.floor(Math.abs(entero())) % 1_000_000;
  return String(n).padStart(6, "0");
}

/** Acepta «048 213», «048-213»…; null si no quedan exactamente 6 dígitos. */
export function normalizarCodigo(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const limpio = s.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(limpio) ? limpio : null;
}

/** «048 213», como lo muestra el TV. */
export function codigoLegible(codigo: string): string {
  return codigo.length === 6 ? `${codigo.slice(0, 3)} ${codigo.slice(3)}` : codigo;
}

export function estaVigente(v: { expira_at: string }, ahora: Date): boolean {
  return new Date(v.expira_at).getTime() > ahora.getTime();
}

export function segundosRestantes(v: { expira_at: string }, ahora: Date): number {
  return Math.max(0, Math.floor((new Date(v.expira_at).getTime() - ahora.getTime()) / 1000));
}

/** Vinculaciones que ya no sirven (vencidas, pendientes o completadas que el TV nunca recogió). */
export function filasALimpiar(filas: readonly { id: string; expira_at: string }[], ahora: Date): string[] {
  return filas.filter((f) => !estaVigente(f, ahora)).map((f) => f.id);
}

/**
 * Límite de intentos por clave en una ventana deslizante, en memoria. En
 * Vercel cada instancia tiene el suyo: basta para frenar un TV en bucle o un
 * script torpe, que es lo que se busca aquí.
 */
export class Limitador {
  private readonly marcas = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly ventanaMs: number,
    private readonly ahora: () => number = Date.now
  ) {}

  permite(clave: string): boolean {
    const t = this.ahora();
    const desde = t - this.ventanaMs;
    const previas = (this.marcas.get(clave) ?? []).filter((m) => m > desde);
    if (previas.length >= this.max) {
      this.marcas.set(clave, previas);
      return false;
    }
    previas.push(t);
    this.marcas.set(clave, previas);
    if (this.marcas.size > 5000) this.podar(desde);
    return true;
  }

  private podar(desde: number) {
    for (const [k, v] of this.marcas) if (!v.some((m) => m > desde)) this.marcas.delete(k);
  }
}
