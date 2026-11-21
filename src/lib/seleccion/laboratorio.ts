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
  '[{"nombre": "NOMBRE COMPLETO o null", "cedula": "solo dígitos o null", "fase": 1 | 2 | null, "resultado": "apto" | "no_apto" | null, "observacion": "lo que diga de restricciones o del motivo, o null"}]',
  "Fase 1 son los exámenes generales (médico, laboratorio, visiometría, audiometría…); fase 2 es la que se hace en ayunas o la segunda toma. Si no se sabe, null.",
  "«Apto con restricciones» es apto y la restricción va en observacion. «Aplazado», «pendiente» o «en proceso» no es un resultado: null.",
  "No inventes datos. Si el mensaje no trae resultados de ninguna persona (un saludo, una pregunta), responde [].",
].join("\n");

export const INSTRUCCION_IMAGEN_LABORATORIO = "Esta imagen la mandó el laboratorio. Extrae los resultados con el formato indicado.";

export type ResultadoLaboratorio = "apto" | "no_apto";

export interface LecturaLaboratorio {
  nombre: string | null;
  cedula: string | null;
  fase: 1 | 2 | null;
  resultado: ResultadoLaboratorio | null;
  observacion: string | null;
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
        resultado: x.resultado === "apto" || x.resultado === "no_apto" ? (x.resultado as ResultadoLaboratorio) : null,
        observacion: txt(x.observacion, 500),
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
