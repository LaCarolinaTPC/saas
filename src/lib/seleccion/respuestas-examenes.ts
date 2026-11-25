/**
 * Respuestas del aspirante a las preguntas de los mensajes de exámenes
 * (24-nov-2026, documento de Gestión Humana). PURO; lo que responde y guarda
 * está en ./respuestas-examenes-servidor.
 *
 *   * Fase 1: «¿tiene cuenta de ahorros en el Banco de Bogotá?». Sí → que
 *     envíe el certificado bancario. No → dónde abrirla y la carta del banco.
 *   * Fase 2: «¿cuántas rutas lleva aprendidas?». Con el mínimo de rutas (o
 *     más) → que siga a la empresa al terminar los exámenes; con menos → que
 *     siga aprendiendo rutas.
 */

const normalizar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * ¿Tiene cuenta en el Banco de Bogotá? «Sí, tengo cuenta», «no tengo», «sí
 * señor»… null si no es claro o habla de otro banco (lo atiende el asistente).
 */
export function interpretarBanco(texto: string | null | undefined): "si" | "no" | null {
  const t = normalizar(String(texto ?? ""));
  if (!t || t.split(" ").length > 14) return null;
  // Otro banco sin decir que también tiene en el de Bogotá: que lo aclare el asistente.
  if (/\b(bancolombia|davivienda|nequi|daviplata|bbva|popular|occidente|caja social|av villas|colpatria|scotiabank|falabella|agrario|itau|pichincha|nu ?bank|nu)\b/.test(t) && !/\bbogota\b/.test(t)) return null;
  if (/^(no|nop|negativo|ninguna)\b|\bno (tengo|cuento|poseo|la tengo|tengo cuenta)\b|\bno he abierto\b|\bnunca he tenido\b/.test(t)) return "no";
  if (/^(si|sii+|sip|claro|correcto|exacto|afirmativo|asi es|ok|okay|listo)\b|\b(si )?(tengo|cuento con|poseo|ya tengo) (una )?(cuenta|la cuenta)\b|^tengo\b/.test(t)) return "si";
  return null;
}

const NUMEROS: Record<string, number> = {
  cero: 0, ninguna: 0, ninguno: 0, nada: 0, una: 1, uno: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

/**
 * Cuántas rutas dice llevar aprendidas: «2», «dos rutas», «ninguna todavía»,
 * «la 7 y la 12» (dos rutas nombradas). null si no se entiende.
 */
export function interpretarRutas(texto: string | null | undefined): number | null {
  const t = normalizar(String(texto ?? ""));
  if (!t || t.split(" ").length > 20) return null;
  if (/\b(no|todavia no|aun no) (se|me se|conozco|he aprendido)\b|\bninguna\b|\bningun[ao]?\b|\bcero\b|\btodavia ninguna\b/.test(t)) return 0;
  // «la 7 y la 12», «rutas 3, 5 y 9»: rutas nombradas por su número.
  const nombradas = t.match(/\b(?:la|ruta|rutas|y|e)\s+(\d{1,3})\b/g);
  if (nombradas && nombradas.length >= 2) return nombradas.length;
  const palabra = t.split(" ").find((w) => w in NUMEROS);
  const digito = t.match(/\b(\d{1,2})\b/);
  if (digito) return Number(digito[1]);
  if (palabra !== undefined) return NUMEROS[palabra];
  if (/\b(todas|varias|muchas)\b/.test(t)) return 99;
  return null;
}

/** El mensaje que sigue a la respuesta de las rutas. */
export function mensajeRutas(rutas: number, minimas: number): "rutas_suficientes" | "rutas_faltan" {
  return rutas >= Math.max(1, minimas) ? "rutas_suficientes" : "rutas_faltan";
}
