/**
 * Formato compartido (cliente y servidor) para la bandeja de Comunicaciones.
 *
 * Todo va en hora de Colombia, explícita. Antes usaba la zona del equipo: el
 * servidor (UTC) y el navegador (Bogotá) pintaban horas y «Hoy/Ayer» distintos
 * y React fallaba al hidratar (error #418).
 */

const TZ = "America/Bogota";
const HORA = new Intl.DateTimeFormat("es-CO", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const DIA_SEMANA = new Intl.DateTimeFormat("es-CO", { timeZone: TZ, weekday: "short" });
const DIA_MES = new Intl.DateTimeFormat("es-CO", { timeZone: TZ, day: "numeric", month: "short" });
const DIA_LARGO = new Intl.DateTimeFormat("es-CO", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const DIA_LARGO_ANIO = new Intl.DateTimeFormat("es-CO", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
const DIA_ISO = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** AAAA-MM-DD del día en Colombia. */
const diaBogota = (d: Date) => DIA_ISO.format(d);

function diasDeDiferencia(d: Date, ahora: Date): number {
  return Math.round((Date.parse(`${diaBogota(ahora)}T00:00:00Z`) - Date.parse(`${diaBogota(d)}T00:00:00Z`)) / 86_400_000);
}

/** Hora si es hoy, "Ayer", día de la semana si es esta semana, o "26 ago". */
export function fechaRelativa(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  const dias = diasDeDiferencia(d, ahora);
  if (dias <= 0) return HORA.format(d);
  if (dias === 1) return "Ayer";
  if (dias < 7) return DIA_SEMANA.format(d).replace(".", "");
  return DIA_MES.format(d).replace(".", "");
}

/** Etiqueta del separador de día en el hilo: "Hoy", "Ayer", "miércoles, 3 de septiembre"… */
export function etiquetaDia(iso: string, ahora = new Date()): string {
  const d = new Date(iso);
  const dias = diasDeDiferencia(d, ahora);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  const texto = diaBogota(d).slice(0, 4) === diaBogota(ahora).slice(0, 4) ? DIA_LARGO.format(d) : DIA_LARGO_ANIO.format(d);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Clave AAAA-MM-DD (Colombia), para agrupar mensajes por día. */
export function claveDia(iso: string): string {
  return diaBogota(new Date(iso));
}

export function horaCorta(iso: string): string {
  return HORA.format(new Date(iso));
}

/** "+57 302 866 5514" a partir de "573028665514". */
export function telefonoBonito(t: string): string {
  const d = t.replace(/\D/g, "");
  const linea = d.slice(-10);
  const ind = d.slice(0, -10);
  const cuerpo = linea.length === 10 ? `${linea.slice(0, 3)} ${linea.slice(3, 6)} ${linea.slice(6)}` : linea;
  return ind ? `+${ind} ${cuerpo}` : cuerpo;
}

/** Iniciales para el avatar; si el nombre es solo emojis, los dos últimos dígitos. */
export function iniciales(nombre: string | null, telefono: string): string {
  const limpio = (nombre ?? "").replace(/[^\p{L}\s]/gu, "").trim();
  if (!limpio) return telefono.slice(-2);
  return limpio.split(/\s+/).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

/** Color estable del avatar según el teléfono (paleta suave del sistema). */
export function tonoAvatar(telefono: string): { bg: string; fg: string } {
  const TONOS = [
    { bg: "#EEF2FF", fg: "#4F46E5" }, // índigo (primario)
    { bg: "#ECFDF5", fg: "#059669" }, // esmeralda
    { bg: "#FFF7ED", fg: "#EA580C" }, // naranja
    { bg: "#F0F9FF", fg: "#0284C7" }, // cielo
    { bg: "#FDF4FF", fg: "#A21CAF" }, // fucsia
    { bg: "#FEFCE8", fg: "#CA8A04" }, // ámbar
  ];
  let h = 0;
  for (const ch of telefono) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return TONOS[h % TONOS.length]!;
}
