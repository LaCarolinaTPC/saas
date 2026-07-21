/**
 * Estado de bloqueo de un usuario de Supabase Auth.
 *
 * Desactivar un usuario = banearlo por 100 años. Supabase devuelve
 * `banned_until` como fecha ISO, o "none"/null cuando no hay bloqueo, así que
 * un usuario está desactivado solo si la fecha es futura.
 */
export function estaBloqueado(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil || bannedUntil === "none") return false;
  const hasta = new Date(bannedUntil).getTime();
  return Number.isFinite(hasta) && hasta > Date.now();
}
