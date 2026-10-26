/**
 * Emoticonos para las diapositivas (PURO): categorías pensadas para lo que
 * comunica Recursos Humanos (celebraciones, seguridad vial, salud, trabajo).
 *
 * Se pintan con la fuente Noto Color Emoji que sirve la propia app
 * (`fuentes.ts`): así se ven iguales en cualquier TV, sin depender de los
 * emoticonos del sistema operativo.
 */

export const CATEGORIAS_EMOJI: { clave: string; nombre: string; emojis: string[] }[] = [
  {
    clave: "celebracion",
    nombre: "Celebración",
    emojis: ["🎉", "🎊", "🎂", "🍰", "🧁", "🎁", "🎈", "🥳", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "⭐", "🌟", "✨", "💫", "🔥", "👑", "🎵", "🎶", "🍾", "🥂"],
  },
  {
    clave: "caras",
    nombre: "Caras",
    emojis: ["😀", "😃", "😄", "😁", "😊", "🙂", "😉", "😍", "🥰", "😎", "🤩", "🤗", "🤔", "😮", "😢", "😷", "🤒", "🤕", "😴", "😇", "🙌", "🤝", "💪", "🫶"],
  },
  {
    clave: "manos",
    nombre: "Gestos",
    emojis: ["👍", "👎", "👏", "🙏", "👋", "✌️", "🤞", "👌", "☝️", "👉", "👈", "👆", "👇", "✋", "🤙", "✊"],
  },
  {
    clave: "seguridad",
    nombre: "Seguridad vial",
    emojis: ["🚌", "🚍", "🚏", "🚦", "🚥", "🛑", "⚠️", "🚧", "🚸", "⛔", "🚫", "🦺", "⛑️", "🪖", "🚑", "🚒", "🚓", "🚗", "🏍️", "🚲", "🚶", "🛣️", "⛽", "🔧", "🧯", "📵", "🍺", "😴", "⏱️", "🐢"],
  },
  {
    clave: "salud",
    nombre: "Salud y bienestar",
    emojis: ["🩺", "❤️", "💙", "💚", "💊", "💉", "🩹", "🏥", "🧘", "🏃", "🚴", "🥗", "🍎", "💧", "🧴", "😷", "🧠", "🫀", "🛌", "☀️"],
  },
  {
    clave: "trabajo",
    nombre: "Trabajo",
    emojis: ["📢", "📣", "📌", "📍", "📅", "🗓️", "⏰", "🕐", "📝", "📋", "📊", "📈", "📉", "💼", "🏢", "🏭", "👷", "👨‍💼", "👩‍💼", "🧑‍🔧", "💡", "🎯", "✅", "☑️", "❌", "❗", "❓", "🔔", "📞", "✉️", "💰", "🤝"],
  },
  {
    clave: "naturaleza",
    nombre: "Naturaleza",
    emojis: ["🌎", "🌱", "🌳", "🌻", "🌸", "🌈", "☀️", "🌤️", "🌧️", "⛈️", "❄️", "🌙", "🍀", "🐶", "🐱", "🦋", "♻️", "🌊"],
  },
  {
    clave: "simbolos",
    nombre: "Símbolos",
    emojis: ["💯", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "✔️", "➕", "➖", "➡️", "⬅️", "⬆️", "⬇️", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🔶", "🔷", "🇨🇴"],
  },
];

/** Todos sin repetir, para validar lo que se elige del catálogo. */
export const TODOS_EMOJI = [...new Set(CATEGORIAS_EMOJI.flatMap((c) => c.emojis))];

/**
 * Un emoticono válido: entre 1 y 16 unidades, con al menos un pictograma (o
 * una bandera), sin letras sueltas ni `<>`. Admite pegar uno que no esté en
 * el catálogo.
 */
export function esEmoji(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s || s.length > 16 || /[<>A-Za-z0-9]/.test(s.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ""))) return false;
  return /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]{2}/u.test(s);
}

/** `font-family` de los emoticonos: la fuente de la app y, de respaldo, la del sistema. */
export const FUENTE_EMOJI = 'var(--font-pantalla-emoji), "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
