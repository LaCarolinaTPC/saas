/**
 * Lectura de los mensajes del laboratorio (entrega 3, M3). PURO.
 *
 * Cada mensaje que llega de un número marcado como laboratorio se le pasa al
 * modelo del asistente con una instrucción corta que devuelve, en JSON, una
 * fila por persona: nombre, cédula, fase y resultado. Aquí se valida esa
 * respuesta y se asocia cada fila a un aspirante que esté en exámenes. Nada
 * cambia el proceso solo: queda en «Avisos del laboratorio» para que una
 * persona lo confirme.
 */
import { distancia, normalizarTexto } from "./preseleccion";
import { cedulasMencionadas } from "./vinculo";

export const SISTEMA_LABORATORIO = [
  "Lees mensajes que un laboratorio clínico le manda a una empresa de transporte con los resultados de los exámenes médicos de ingreso de aspirantes a conductor.",
  "Responde SOLO con un arreglo JSON, sin texto antes ni después y sin bloques de código. Una entrada por persona mencionada:",
  '[{"nombre": "NOMBRE COMPLETO o null", "cedula": "solo dígitos o null", "fase": 1 | 2 | null, "resultado": "apto" | "no_apto" | "aplazado" | null, "observacion": "lo que diga de restricciones o del motivo, o null"}]',
  "Fase 1 son las pruebas toxicológicas (alcohol, marihuana, cocaína) y la radiografía de columna; no es en ayunas. Fase 2 es en ayunas: examen médico osteomuscular, audiometría, espirometría, optometría, valoración psicomotriz, glicemia, colesterol, triglicéridos y hemograma. Si no se sabe, null.",
  "«Puede continuar a segunda fase» es apto en fase 1; «no puede continuar» es no apto. «Apto con restricciones» es apto y la restricción va en observacion.",
  "«Aplazado» (por ejemplo, por el hemograma o la optometría) es resultado aplazado y el motivo va en observacion. «Pendiente» o «en proceso» no es un resultado: null.",
  "No inventes datos. Si el mensaje no trae resultados de ninguna persona (un saludo, una pregunta), responde [].",
].join("\n");

export const INSTRUCCION_IMAGEN_LABORATORIO = "Esta imagen la mandó el laboratorio. Extrae los resultados con el formato indicado.";

export type ResultadoLaboratorio = "apto" | "no_apto" | "aplazado";

export interface LecturaLaboratorio {
  nombre: string | null;
  cedula: string | null;
  fase: 1 | 2 | null;
  resultado: ResultadoLaboratorio | null;
  observacion: string | null;
  /** La IA vio la frase acordada de apto (o una variante con el mismo sentido) para esta persona. */
  frase?: boolean;
}

/** El arreglo JSON de la respuesta del modelo, validado. null si no se entiende. */
export function interpretarLecturaLaboratorio(texto: string): LecturaLaboratorio[] | null {
  const ini = texto.indexOf("[");
  const fin = texto.lastIndexOf("]");
  if (ini < 0 || fin < ini) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto.slice(ini, fin + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(crudo)) return null;
  const txt = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  return crudo
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x): LecturaLaboratorio => {
      const cedula = String(x.cedula ?? "").replace(/\D/g, "");
      const fase = Number(x.fase);
      return {
        nombre: txt(x.nombre, 120),
        cedula: cedula.length >= 5 && cedula.length <= 11 ? cedula : null,
        fase: fase === 1 || fase === 2 ? (fase as 1 | 2) : null,
        resultado: x.resultado === "apto" || x.resultado === "no_apto" || x.resultado === "aplazado" ? (x.resultado as ResultadoLaboratorio) : null,
        observacion: txt(x.observacion, 500),
        ...(x.frase === true ? { frase: true } : {}),
      };
    })
    .filter((l) => l.nombre || l.cedula);
}

/** Sin modelo (o si no respondió): las cédulas que aparecen en el texto o el nombre del archivo. */
export function lecturaSinModelo(textos: string[]): LecturaLaboratorio[] {
  return cedulasMencionadas(textos).map((cedula) => ({ nombre: null, cedula, fase: null, resultado: null, observacion: null }));
}

export interface ProcesoEnExamenes {
  id: string;
  nombre: string;
  cedula: string;
  estado: string;
}

/**
 * El aspirante al que corresponde la lectura: por cédula exacta y, si no, por
 * nombre (todas las palabras del nombre leído en el del proceso, o casi
 * iguales). Solo si hay uno; con dos candidatos, lo asigna una persona.
 */
export function asociarProceso(l: LecturaLaboratorio, procesos: readonly ProcesoEnExamenes[]): ProcesoEnExamenes | null {
  if (l.cedula) {
    const porCedula = procesos.filter((p) => p.cedula.replace(/\D/g, "") === l.cedula);
    if (porCedula.length === 1) return porCedula[0];
  }
  if (!l.nombre) return null;
  const leidas = normalizarTexto(l.nombre).split(" ").filter((p) => p.length > 1);
  if (leidas.length < 2) return null;
  const coincide = (p: ProcesoEnExamenes) => {
    const palabras = normalizarTexto(p.nombre).split(" ");
    return leidas.every((w) => palabras.some((x) => x === w || (w.length > 4 && distancia(w, x) <= 1)));
  };
  const porNombre = procesos.filter(coincide);
  return porNombre.length === 1 ? porNombre[0] : null;
}

/** Fase que corresponde al estado del aspirante cuando el laboratorio no la dice. */
export const faseDeEstado = (estado: string): 1 | 2 | null => (estado === "en_examenes" ? 1 : estado === "en_examenes_fase2" ? 2 : null);

// ── Frases acordadas con el laboratorio (24-nov-2026) ───────────────────────

export interface FrasesLaboratorio {
  apto?: string | null;
  no_apto?: string | null;
  aplazado?: string | null;
}

/** La respuesta de apto mientras no se acuerde otra con el laboratorio (Gestión Humana, 24-nov-2026). */
export const FRASE_APTO_POR_DEFECTO = "Sí, puede pasar a fase 2";

/** Las frases del laboratorio, con la de apto por defecto si no tiene. */
export function frasesConDefecto(f: FrasesLaboratorio | null | undefined): FrasesLaboratorio {
  return { apto: f?.apto?.trim() || FRASE_APTO_POR_DEFECTO, no_apto: f?.no_apto?.trim() || null, aplazado: f?.aplazado?.trim() || null };
}

/**
 * Las instrucciones de lectura con las frases acordadas: la IA marca
 * "frase": true cuando ve la de apto o una variante con el mismo sentido.
 */
export function sistemaLaboratorio(frases: FrasesLaboratorio | null | undefined): string {
  const f = frasesConDefecto(frases);
  return [
    SISTEMA_LABORATORIO,
    `Con este laboratorio se acordó que, en la primera fase, la respuesta de apto es «${f.apto}». Para cada persona agrega "frase": true si el mensaje dice esa frase o una variante con el mismo sentido (por ejemplo, con otras palabras, con «la segunda fase», sin el «sí» o con faltas de ortografía), y "frase": false si no. Una negación («no puede pasar») no es la frase.`,
    ...(f.no_apto ? [`La respuesta acordada de no apto es «${f.no_apto}».`] : []),
    ...(f.aplazado ? [`La respuesta acordada de aplazado es «${f.aplazado}».`] : []),
  ].join("\n");
}

/**
 * El resultado y si se registra solo (24-nov-2026). Con la frase acordada
 * exacta, ese. En la fase 1, si no: la frase de apto o una variante (según la
 * IA) es apto; «aplazado» especificado es aplazado; cualquier otro resultado
 * es no apto. Sin resultado (un saludo, «pendiente») no se decide. En la fase
 * 2 solo cuentan las frases exactas de no apto y aplazado (la de apto es de la
 * fase 1); lo demás lo confirma una persona.
 */
export function decidirResultado(
  texto: string,
  l: LecturaLaboratorio,
  variasPersonas: boolean,
  frases: FrasesLaboratorio | null | undefined,
  faseEsperada: 1 | 2 | null,
  opciones: { soloArchivo?: boolean } = {}
): { resultado: ResultadoLaboratorio | null; automatico: boolean } {
  const f = frasesConDefecto(frases);
  const fase = l.fase ?? faseEsperada;
  const exacta = resultadoPorFrase(texto, l, variasPersonas, f);
  // Fase 2 (27-nov-2026): son resultados médicos de laboratorio y, por ahora, los
  // registra siempre una persona. Ni la frase acordada los registra sola: queda
  // la propuesta para confirmar. (La frase de apto, además, es la de la fase 1.)
  if (fase === 2) return { resultado: exacta && exacta !== "apto" ? exacta : l.resultado, automatico: false };
  if (exacta) return { resultado: exacta, automatico: true };
  if (fase !== 1 || !l.resultado) return { resultado: l.resultado, automatico: false };
  if (l.resultado === "aplazado") return { resultado: "aplazado", automatico: true };
  if (l.resultado === "apto" && l.frase) return { resultado: "apto", automatico: true };
  // Un archivo solo (la radiografía, un informe «normal»): lo que la IA lea como apto
  // sin la frase no se vuelve no apto solo; lo confirma una persona.
  if (l.resultado === "apto" && opciones.soloArchivo) return { resultado: "apto", automatico: false };
  return { resultado: "no_apto", automatico: true };
}

/** ¿El laboratorio tiene alguna frase acordada? */
export function tieneFrases(f: FrasesLaboratorio | null | undefined): boolean {
  return !!f && [f.apto, f.no_apto, f.aplazado].some((x) => normalizarTexto(x ?? "").length >= 3);
}

/** Las veces que aparece la frase sin un «no» justo antes («no puede continuar» no es «puede continuar»). */
function aparece(texto: string, frase: string): boolean {
  let i = texto.indexOf(frase);
  while (i >= 0) {
    const antes = texto.slice(0, i).trimEnd().split(" ").pop() ?? "";
    const limiteIzq = i === 0 || texto[i - 1] === " ";
    const fin = i + frase.length;
    const limiteDer = fin === texto.length || texto[fin] === " ";
    if (limiteIzq && limiteDer && !["no", "sin", "tampoco", "ni"].includes(antes)) return true;
    i = texto.indexOf(frase, i + 1);
  }
  return false;
}

/**
 * El resultado según la frase acordada, para la persona de la lectura. Si el
 * mensaje habla de varias personas, solo cuentan las líneas donde está su
 * cédula o su nombre. Gana la frase más larga que aparezca (así «no puede
 * continuar» le gana a «puede continuar»); si aparecen dos resultados
 * distintos, no se decide (null) y queda para una persona.
 */
export function resultadoPorFrase(
  texto: string,
  l: Pick<LecturaLaboratorio, "nombre" | "cedula">,
  variasPersonas: boolean,
  frases: FrasesLaboratorio | null | undefined
): ResultadoLaboratorio | null {
  if (!frases) return null;
  const pares = (Object.entries(frases) as [ResultadoLaboratorio, string | null | undefined][])
    .filter(([r]) => r === "apto" || r === "no_apto" || r === "aplazado")
    .map(([r, f]) => [r, normalizarTexto(f ?? "").replace(/^(si|claro) /, "")] as const)
    .filter(([, f]) => f.length >= 3);
  if (!pares.length) return null;
  let segmento = texto;
  if (variasPersonas) {
    const palabras = l.nombre ? normalizarTexto(l.nombre).split(" ").filter((p) => p.length > 2).slice(0, 2) : [];
    segmento = texto
      .split(/\n|;/)
      .filter((linea) => {
        const n = normalizarTexto(linea);
        return (l.cedula && linea.replace(/\D/g, "").includes(l.cedula)) || (palabras.length === 2 && palabras.every((p) => n.includes(p)));
      })
      .join("\n");
  }
  const t = normalizarTexto(segmento);
  if (!t) return null;
  const hallados = pares.filter(([, f]) => aparece(t, f)).sort((a, b) => b[1].length - a[1].length);
  if (!hallados.length) return null;
  const [r0, f0] = hallados[0];
  // Otra frase de otro resultado que no está dentro de la ganadora: ambiguo.
  if (hallados.some(([r, f]) => r !== r0 && !f0.includes(f))) return null;
  return r0;
}
