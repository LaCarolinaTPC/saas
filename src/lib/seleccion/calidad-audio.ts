/**
 * ¿Se entendió el audio del aspirante? PURO (pedido del 23-nov-2026).
 *
 * Con ruido de fondo fuerte el modelo de transcripción no devuelve vacío:
 * inventa algo con apariencia normal («licencia cincuenta y dos… vivo en
 * Sevilla»), y el asistente lo tomaba como dicho. OpenRouter no da la
 * confianza de la transcripción, así que el audio se transcribe también con un
 * segundo modelo, mucho más barato: con voz clara los dos dicen casi lo mismo;
 * cuando el ruido confunde, cada uno inventa algo distinto.
 *
 * La transcripción se guarda con una marca al comienzo para que el asistente y
 * la bandeja sepan cuándo no es confiable (sin columna nueva en la base).
 */

/** El audio no tenía voz que se entendiera (silencio, solo ruido o ruido extremo). */
export const AUDIO_SIN_VOZ = "[no se entendió el audio]";
/** Se oyó algo, pero los dos modelos no coinciden: lo transcrito puede estar equivocado. */
export const PREFIJO_AUDIO_DUDOSO = "[no se entendió bien] ";

/** Desde aquí (0 a 1) se considera que los dos modelos dicen lo mismo. */
export const UMBRAL_COINCIDENCIA = 0.6;

export type CalidadAudio = "buena" | "dudosa" | "sin_voz";

/**
 * Frases que los modelos de transcripción inventan con silencio o ruido
 * (vienen de los subtítulos con que se entrenaron). Medido el 23-nov-2026:
 * Whisper devolvió «Gracias por ver el video.» con solo ruido y «Gracias.» con silencio.
 */
const ALUCINACIONES = [/amara\.org/i, /subt[ií]tulos? (realizados|por|creados)/i, /gracias por (ver|mirar)/i, /suscr[ií]bete/i];
/** Inventos posibles, pero también lo que alguien puede decir de verdad: cuentan solo si el otro modelo no lo confirma. */
const ALUCINACIONES_DEBILES = [/^\W*(gracias|m[uú]sica|aplausos|risas)\W*$/i];

const UNIDADES: Record<string, number> = {
  cero: 0, uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29,
};
const DECENAS: Record<string, number> = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };

/** Minúsculas, sin tildes ni signos, y los números dichos en palabras como cifras («treinta y cuatro» → «34»). */
export function normalizarParaComparar(texto: string): string[] {
  const palabras = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i];
    if (p in DECENAS) {
      const u = palabras[i + 1] === "y" ? UNIDADES[palabras[i + 2] ?? ""] : undefined;
      if (u != null && u < 10) {
        out.push(String(DECENAS[p] + u));
        i += 2;
      } else out.push(String(DECENAS[p]));
    } else if (p in UNIDADES && p !== "un" && p !== "una") {
      out.push(String(UNIDADES[p]));
    } else out.push(p);
  }
  return out;
}

/** Cuánto se parecen dos transcripciones (0 a 1): palabras en el mismo orden (subsecuencia común más larga). */
export function similitudTranscripciones(a: string, b: string): number {
  const x = normalizarParaComparar(a);
  const y = normalizarParaComparar(b);
  if (!x.length && !y.length) return 1;
  if (!x.length || !y.length) return 0;
  const fila = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    let diagonal = 0;
    for (let j = 1; j <= y.length; j++) {
      const arriba = fila[j];
      fila[j] = x[i - 1] === y[j - 1] ? diagonal + 1 : Math.max(fila[j], fila[j - 1]);
      diagonal = arriba;
    }
  }
  return (2 * fila[y.length]) / (x.length + y.length);
}

const vacia = (t: string | null | undefined) => {
  const s = String(t ?? "").trim();
  return !s || ALUCINACIONES.some((re) => re.test(s)) || normalizarParaComparar(s).length === 0;
};
const debil = (t: string | null | undefined) => ALUCINACIONES_DEBILES.some((re) => re.test(String(t ?? "").trim()));

/**
 * Califica la transcripción principal con la de control (el segundo modelo).
 * Sin la de control (falló o no hay clave) se confía en la principal, como antes.
 */
export function calidadTranscripcion(principal: string | null | undefined, control: string | null | undefined, hayControl = true): CalidadAudio {
  if (vacia(principal)) return "sin_voz";
  if (!hayControl) return "buena";
  if (vacia(control)) {
    // Un «gracias» suelto que el otro modelo no oyó: es el invento típico con silencio.
    if (debil(principal)) return "sin_voz";
    // Una o dos palabras («Sí.», «C2») que el otro no captó: se confía en la principal.
    return normalizarParaComparar(String(principal)).length <= 2 ? "buena" : "dudosa";
  }
  return similitudTranscripciones(String(principal), String(control)) >= UMBRAL_COINCIDENCIA ? "buena" : "dudosa";
}

/** Lo que se guarda en wa_mensajes.transcripcion según la calidad. */
export function transcripcionParaGuardar(texto: string | null | undefined, calidad: CalidadAudio): string {
  if (calidad === "sin_voz") return AUDIO_SIN_VOZ;
  const t = String(texto ?? "").trim();
  return calidad === "dudosa" ? `${PREFIJO_AUDIO_DUDOSO}${t}` : t;
}

/** Lee lo guardado: la calidad y el texto sin la marca. */
export function leerTranscripcionGuardada(guardada: string | null | undefined): { calidad: CalidadAudio; texto: string } | null {
  const t = String(guardada ?? "").trim();
  if (!t) return null;
  if (t === AUDIO_SIN_VOZ) return { calidad: "sin_voz", texto: "" };
  if (t.startsWith(PREFIJO_AUDIO_DUDOSO.trim())) return { calidad: "dudosa", texto: t.slice(PREFIJO_AUDIO_DUDOSO.trim().length).trim() };
  return { calidad: "buena", texto: t };
}

/**
 * Cómo ven el audio el asistente y la extracción de datos. De un audio que no
 * se entendió bien no se pasa lo transcrito: es lo que podría estar inventado
 * («vivo en Sevilla») y se tomaría como dicho. Gestión Humana lo ve en la bandeja.
 */
export function audioParaModelo(guardada: string | null | undefined): string {
  const t = leerTranscripcionGuardada(guardada);
  if (!t) return "";
  if (t.calidad === "buena") return `[Lo que dice el audio: «${t.texto}»]`;
  if (t.calidad === "dudosa") return "[El audio tiene mucho ruido de fondo y no se entendió bien: no tomes ningún dato de él]";
  return "[El audio no se entendió: no se oye una voz clara (silencio o mucho ruido)]";
}
