/**
 * Qué datos del proceso cambia lo que el aspirante dijo en el chat.
 *
 * Antes solo se llenaban los campos vacíos, y si cambiaba de respuesta (por
 * ejemplo, primero no aceptaba trasladarse y después sí, tras los intentos de
 * convencerlo) el proceso se quedaba con la primera y lo seguía descartando
 * (caso de GH del 17-nov-2026). Ahora vale su última respuesta, salvo en:
 * - los campos que una persona editó a mano en Candidatos (manda lo de GH);
 * - la categoría de la licencia verificada en el RUNT (manda el registro).
 */
export interface DatosProcesoChat {
  edad: number | null;
  ciudad_residencia: string | null;
  dispuesto_traslado: boolean | null;
  licencia_categoria: string | null;
  experiencia_meses: number | null;
}

export type CampoChat = keyof DatosProcesoChat;

export function cambiosDesdeChat(
  actual: DatosProcesoChat & { licencia_verificada_runt?: boolean | null },
  nuevo: DatosProcesoChat,
  editadosAMano: ReadonlySet<string>
): Partial<DatosProcesoChat> {
  const patch: Partial<DatosProcesoChat> = {};
  const campos: CampoChat[] = ["edad", "ciudad_residencia", "dispuesto_traslado", "licencia_categoria", "experiencia_meses"];
  for (const c of campos) {
    const v = nuevo[c];
    if (v == null) continue; // el chat no dijo nada nuevo: no se borra lo que hay
    const antes = actual[c];
    if (antes != null && String(antes).trim().toLowerCase() === String(v).trim().toLowerCase()) continue;
    if (antes != null) {
      if (editadosAMano.has(c)) continue;
      if (c === "licencia_categoria" && actual.licencia_verificada_runt) continue;
    }
    (patch as Record<string, unknown>)[c] = v;
  }
  return patch;
}

/** Causas de cierre automático que la propia persona puede revertir si vuelve a escribir. */
export const CAUSAS_REABRIBLES = {
  incomunicado: "Incomunicado",
  residencia: "Fuera de la zona y sin traslado",
  licencia: "Licencia no válida (no tiene, vencida o distinta de C2/C3)",
  edad: "Edad fuera del rango",
  autorizacion: "No autorizó el tratamiento de datos",
} as const;

/**
 * ¿Lo que la persona dice ahora justifica reabrir su proceso, que se cerró
 * solo? (pedido de GH del 18-nov-2026: puede pensarlo y volver días después)
 *  - «Incomunicado»: basta con que vuelva a escribir.
 *  - Un requisito de la preselección: solo si cambió justo esa respuesta
 *    (ahora sí se traslada o vive en otra ciudad, va a renovar o dice otra
 *    licencia, corrige la edad, o ahora sí autoriza). Un «hola» no reabre.
 * Otras causas (antecedentes, ya trabaja en la empresa, las que puso una
 * persona) nunca se reabren solas.
 */
export function cambioQueReabre(
  causa: string | null | undefined,
  actual: DatosProcesoChat,
  nuevo: DatosProcesoChat & { renovara_licencia?: boolean | null; autorizacion?: string | null }
): boolean {
  const distinto = (a: unknown, b: unknown) => b != null && String(a ?? "").trim().toLowerCase() !== String(b).trim().toLowerCase();
  switch (causa) {
    case CAUSAS_REABRIBLES.incomunicado:
      return true;
    case CAUSAS_REABRIBLES.residencia:
      return (nuevo.dispuesto_traslado === true && actual.dispuesto_traslado !== true) || distinto(actual.ciudad_residencia, nuevo.ciudad_residencia);
    case CAUSAS_REABRIBLES.licencia:
      return nuevo.renovara_licencia === true || distinto(actual.licencia_categoria, nuevo.licencia_categoria);
    case CAUSAS_REABRIBLES.edad:
      return distinto(actual.edad, nuevo.edad);
    case CAUSAS_REABRIBLES.autorizacion:
      return nuevo.autorizacion === "si";
    default:
      return false;
  }
}
